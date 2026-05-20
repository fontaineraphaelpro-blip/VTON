import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, Link, useRevalidator } from "@remix-run/react";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Page,
  Text,
  Button,
  Banner,
  Divider,
  TextField,
  Checkbox,
  Badge,
  BlockStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { AdminPage } from "../components/AdminPage";
import { AdminNotifications } from "../components/AdminNotifications";
import { useAdminNotifications, useNotificationSync } from "../hooks/useAdminNotifications";
import { useFetcherNotifications } from "../hooks/useFetcherNotifications";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop, getTryonLogs, getTopProducts, getTryonStatsByDay, getMonthlyTryonUsage, query } from "../lib/services/db.service";
import { creditsForPlan, FREE_PLAN_ID } from "../lib/plan-credits";
import { ensureDemoShopAccess } from "../lib/demo-shops.server";
import { isDemoShop } from "../lib/demo-shops.shared";
import {
  getAppEmbedActivationUrl,
  getThemeEditorAppEmbedsUrl,
} from "../lib/theme-editor-url.server";
import {
  scheduleStorefrontWidgetScriptTag,
  sessionCanInstallScriptTag,
  hasStorefrontWidgetScriptTag,
} from "../lib/storefront-widget-install.server";
import { buildOnboardingState, mergeOnboardingOverride } from "../lib/onboarding.server";
import { invalidateLayoutShopContext } from "../lib/layout-shop-cache.server";
import type { OnboardingStepId } from "../lib/onboarding.server";
import { OnboardingGuide } from "../components/OnboardingGuide";
import {
  formatUtcChartLabel,
  formatUtcDateTime,
  isUtcSameDay,
  utcTodayKey,
} from "../lib/format-datetime";

const REVIEW_URL = "https://apps.shopify.com/try-on-stylelab";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  
  // If returning from payment (charge_id present), redirect to /app/credits to handle subscription update with rehydrated session
  const chargeId = url.searchParams.get("charge_id");
  if (chargeId) {
    return redirect(`/app/credits?charge_id=${encodeURIComponent(chargeId)}`);
  }
  
  const returnUrl = `https://${url.host}/app`;

  let shopData = await getShop(shop);
  await ensureDemoShopAccess(shop);
  shopData = await getShop(shop);

  if (sessionCanInstallScriptTag(session.scope)) {
    scheduleStorefrontWidgetScriptTag(admin);
  }

  // Sync subscription only when plan is unknown (Credits page handles billing return)
  if (!shopData?.plan_name && !isDemoShop(shop)) {
  try {
    const subscriptionQuery = `#graphql
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            test
            createdAt
            lineItems {
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    price {
                      amount
                      currencyCode
                    }
                    interval
                  }
                }
              }
            }
          }
        }
      }
    `;

    let currentActivePlan: string | null = null;
    let shouldUpdateDb = false;
    
    try {
      const subscriptionResponse = await admin.graphql(subscriptionQuery);
      if (subscriptionResponse.ok) {
        const subscriptionData = await subscriptionResponse.json() as any;
        const allSubscriptions = subscriptionData?.data?.currentAppInstallation?.activeSubscriptions || [];
        const allowTestSubscriptions = true;
        let activeSubscription = allSubscriptions.find((sub: any) =>
          sub.status === "ACTIVE" && (allowTestSubscriptions || !sub.test)
        );
        
        // If no ACTIVE, look for PENDING or ACCEPTED (e.g. after recent purchase)
        if (!activeSubscription) {
          const sortedSubscriptions = allSubscriptions
            .filter((sub: any) => (allowTestSubscriptions || !sub.test) && (sub.status === "PENDING" || sub.status === "ACCEPTED" || sub.status === "ACTIVE"))
            .sort((a: any, b: any) => {
              const dateA = new Date(a.createdAt || 0).getTime();
              const dateB = new Date(b.createdAt || 0).getTime();
              return dateB - dateA;
            });
          
          activeSubscription = sortedSubscriptions[0];
        }

        if (activeSubscription) {
          const detectedPlanName = activeSubscription.name.toLowerCase().replace(/\s+/g, '-');
          currentActivePlan = detectedPlanName;
          const shopData = await getShop(shop);
          const dbPlanName = shopData?.plan_name;
          if (dbPlanName !== detectedPlanName) {
            shouldUpdateDb = true;
          }
        }
      }
    } catch {
      // Continue without subscription sync
    }

    // Sync database if plan changed
    if (shouldUpdateDb && currentActivePlan) {
      const monthlyCredits = creditsForPlan(currentActivePlan);
      try {
        await upsertShop(shop, {
          monthlyQuota: monthlyCredits,
          credits: monthlyCredits,
        });
        
        await query(
          `ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_name TEXT`
        );
        await query(
          `UPDATE shops SET plan_name = $1 WHERE domain = $2`,
          [currentActivePlan, shop]
        );
      } catch (syncError) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[Dashboard] Sync error:", syncError);
        }
      }
    }

    // If no active subscription, assign free plan by default
    if (!currentActivePlan && !isDemoShop(shop)) {
      try {
        const shopData = await getShop(shop);
        
        if (!shopData || !shopData.plan_name || shopData.plan_name !== FREE_PLAN_ID) {
          const freeGenerations = creditsForPlan(FREE_PLAN_ID);
          await upsertShop(shop, {
            credits: freeGenerations,
            monthlyQuota: freeGenerations,
          });
          
          try {
            await query(
              `ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_name TEXT DEFAULT '${FREE_PLAN_ID}'`
            );
            await query(
              `UPDATE shops SET plan_name = $1 WHERE domain = $2`,
              [FREE_PLAN_ID, shop]
            );
          } catch {
            // Plan name update skipped
          }
        }
      } catch (dbError) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[Dashboard] Free plan assignment error:", dbError);
        }
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[Dashboard] Subscription check error:", error);
    }
  }
  }

  try {
    if (!shopData) {
      shopData = await getShop(shop);
    }
    
    // Special handling for specific shop: 3aavx5-9u.myshopify.com
    // Give 1000 credits at startup, only if credits are less than 1000 (don't reset if already has 1000+)
    if (shop === "3aavx5-9u.myshopify.com") {
      const currentCredits = shopData?.credits || 0;
      if (currentCredits < 1000) {
        await upsertShop(shop, {
          credits: 1000,
        });
        shopData = await getShop(shop);
      }
    }
    
    if (shopData && (shopData.is_enabled === null || shopData.is_enabled === undefined)) {
      await upsertShop(shop, {
        isEnabled: true,
      });
      shopData = await getShop(shop);
    }
    
    // OPTIMIZED: Start all queries in parallel (they run concurrently)
    // This is faster than awaiting them sequentially
    const [recentLogs, topProducts, dailyStats, monthlyUsage] = await Promise.all([
      getTryonLogs(shop, { limit: 5 }),
      getTopProducts(shop, 10),
      getTryonStatsByDay(shop, 30),
      getMonthlyTryonUsage(shop),
    ]);

    // Build product handles map from logs (for fallback matching)
    const productHandlesMap: Record<string, string> = {};
    recentLogs.forEach((log: any) => {
      if (log.product_handle && log.product_title) {
        productHandlesMap[log.product_handle] = log.product_title;
      }
    });

    // Fetch product names from Shopify for products that don't have product_title
    const productNamesMap: Record<string, string> = {};
    const productIdsArray: string[] = [];
    
    // Collect product IDs and handles that need fetching (from topProducts and recentLogs)
    const productHandlesToFetch = new Set<string>();
    topProducts.forEach((product: any) => {
      if (product.product_id && !product.product_title) {
        const gidMatch = product.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
        if (gidMatch) {
          productIdsArray.push(gidMatch[1]);
        } else if (/^\d+$/.test(product.product_id)) {
          productIdsArray.push(product.product_id);
        } else if (product.product_handle) {
          productHandlesToFetch.add(product.product_handle);
        }
      }
    });
    
    recentLogs.forEach((log: any) => {
      if (log.product_id && !log.product_title) {
        const gidMatch = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
        if (gidMatch) {
          const numericId = gidMatch[1];
          if (!productIdsArray.includes(numericId)) productIdsArray.push(numericId);
        } else if (/^\d+$/.test(log.product_id)) {
          if (!productIdsArray.includes(log.product_id)) productIdsArray.push(log.product_id);
        }
      }
      if (log.product_handle) productHandlesToFetch.add(log.product_handle);
    });

    // OPTIMIZED: Fetch only the specific products we need using nodes(ids) instead of all 250 products
    if (productIdsArray.length > 0) {
      try {
        // Convert numeric IDs to GIDs
        const productGids = productIdsArray.map(id => `gid://shopify/Product/${id}`);
        
        // Fetch in batches of 10 (Shopify's nodes query limit)
        for (let i = 0; i < productGids.length; i += 10) {
          const batch = productGids.slice(i, i + 10);
          const productQuery = `#graphql
            query getProducts($ids: [ID!]!) {
              nodes(ids: $ids) {
                ... on Product {
                  id
                  title
                  handle
                }
              }
            }
          `;
          
          const response = await admin.graphql(productQuery, {
            variables: { ids: batch }
          });
          
          if (response.ok) {
            const data = await response.json() as any;
            
            if (data.data?.nodes) {
              data.data.nodes.forEach((product: any) => {
                if (product && product.id && product.title) {
                  // Store both GID and numeric ID as keys
                  productNamesMap[product.id] = product.title;
                  const numericId = product.id.replace('gid://shopify/Product/', '');
                  productNamesMap[numericId] = product.title;
                  
                  // Also store by handle if available
                  if (product.handle) {
                    productNamesMap[product.handle] = product.title;
                  }
                }
              });
            }
          }
        }
      } catch {
        // Silently fail - use fallback titles from logs
      }
    }

    // Enrich top products in-memory (no per-product DB round-trips)
    const enrichedTopProducts = topProducts.map((product: any) => {
      if (!product.product_id) return product;

      const gidMatch = product.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
      const numericId = gidMatch ? gidMatch[1] : product.product_id;

      let title =
        product.product_title ||
        productNamesMap[product.product_id] ||
        productNamesMap[numericId] ||
        (product.product_handle ? productNamesMap[product.product_handle] : undefined);

      if (!title) {
        const logMatch = recentLogs.find((log: any) => {
          if (!log.product_title) return false;
          if (log.product_handle && product.product_handle && log.product_handle === product.product_handle) {
            return true;
          }
          if (!log.product_id) return false;
          const logGid = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
          const logNumeric = logGid ? logGid[1] : log.product_id;
          return log.product_id === product.product_id || logNumeric === numericId;
        });
        if (logMatch?.product_title) title = logMatch.product_title;
      }

      if (title && !title.startsWith("Product #")) {
        return { ...product, product_title: title };
      }
      return { ...product, product_title: `Product #${numericId}` };
    });
    
    // Enrich recentLogs with product titles (use handles for matching - more reliable)
    const enrichedRecentLogs = recentLogs.map((log: any) => {
      if (log.product_id || log.product_handle) {
        let title: string | undefined;
        
        // Priority 1: Use product_handle to match with products (most reliable)
        if (log.product_handle && productNamesMap[log.product_handle]) {
          title = productNamesMap[log.product_handle];
        }
        // Priority 2: Try product_id (GID or numeric) in fetched map
        else if (log.product_id) {
          const gidMatch = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
          const numericId = gidMatch ? gidMatch[1] : log.product_id;
          title = productNamesMap[log.product_id] || productNamesMap[numericId];
        }
        
        // Priority 3: Use product_handle from handles map (from other logs)
        if (!title && log.product_handle && productHandlesMap[log.product_handle]) {
          title = productHandlesMap[log.product_handle];
        }
        
        // Priority 4: Use existing product_title from log
        if (!title && log.product_title) {
          title = log.product_title;
        }
        
        // Always set product_title - use title if found, otherwise use numeric ID or handle
        if (title) {
          return { ...log, product_title: title };
        } else {
          // Use handle if available, otherwise numeric ID
          const displayId = log.product_handle || (log.product_id ? (log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/)?.[1] || log.product_id) : 'Unknown');
          return { ...log, product_title: `Product #${displayId}` };
        }
      }
      return log;
    });
    
    // Calculate total_tryons from logs if not set in shop record
    let totalTryons = shopData?.total_tryons || 0;
    if ((totalTryons === 0 || totalTryons === null) && shopData) {
      try {
        const tryonsResult = await query(
          `SELECT COUNT(*) as count FROM tryon_logs WHERE shop = $1 AND success = true`,
          [shop]
        );
        const calculatedTotal = parseInt(tryonsResult.rows[0]?.count || '0', 10);
        if (calculatedTotal > 0) {
          totalTryons = calculatedTotal;
          // Update shop record with calculated value (async, don't block)
          query(
            `UPDATE shops SET total_tryons = $1 WHERE domain = $2`,
            [calculatedTotal, shop]
          ).catch(() => {
            // Ignore update errors
          });
        }
      } catch (error) {
        // If calculation fails, use shop value
        totalTryons = shopData?.total_tryons || 0;
      }
    }

    // If shop doesn't exist yet, create it with free plan (50 generations/month)
    if (!shopData) {
      const freeGenerations = creditsForPlan(FREE_PLAN_ID);
      await upsertShop(shop, {
        credits: freeGenerations,
        monthlyQuota: freeGenerations,
        isEnabled: true, // Widget enabled by default for new shops
      });
      // Re-fetch shop data after creation
      const newShopData = await getShop(shop);
      return json({
        shop: newShopData,
        recentLogs: [],
        topProducts: [],
        dailyStats: [],
        monthlyUsage: 0,
        totalTryons: 0,
      });
    }

    // Widget: Theme editor → App embeds (sidebar) → enable "Virtual Try-On Widget" (vton-widget.liquid)

    // Check if review prompt should be shown
    let shouldShowReview = false;
    if (shopData && !shopData.review_shown && totalTryons >= 10) {
      // Show review prompt if user has at least 10 successful try-ons and hasn't seen the prompt yet
      const lastPromptDate = shopData.last_review_prompt_date;
      const now = new Date();
      const daysSinceLastPrompt = lastPromptDate 
        ? Math.floor((now.getTime() - new Date(lastPromptDate).getTime()) / (1000 * 60 * 60 * 24))
        : Infinity;
      
      // Show if never prompted, or if last prompt was more than 30 days ago
      if (!lastPromptDate || daysSinceLastPrompt >= 30) {
        shouldShowReview = true;
      }
    }

    const apiKey = process.env.SHOPIFY_API_KEY || "";

    const scriptTagInstalled = sessionCanInstallScriptTag(session.scope)
      ? await hasStorefrontWidgetScriptTag(admin).catch(() => false)
      : false;

    const onboarding = await buildOnboardingState(shop, admin, {
      shopRow: shopData,
      totalTryons: totalTryons || 0,
      scriptTagInstalled,
    });

    return json({
      shop: shopData || null,
      recentLogs: Array.isArray(enrichedRecentLogs) ? enrichedRecentLogs.slice(0, 5) : [],
      topProducts: Array.isArray(enrichedTopProducts) ? enrichedTopProducts : [],
      dailyStats: Array.isArray(dailyStats) ? dailyStats : [],
      monthlyUsage: monthlyUsage || 0, // ADDED: Monthly usage count
      totalTryons: totalTryons || 0, // ADDED: Total try-ons (calculated or from shop)
      shouldShowReview: shouldShowReview, // ADDED: Review prompt flag
      reviewUrl: REVIEW_URL, // ADDED: Review URL
      themeEditorAppEmbedsUrl: getThemeEditorAppEmbedsUrl(shop),
      themeEditorActivateUrl: getAppEmbedActivationUrl(shop, apiKey, "vton-widget"),
      onboarding,
      todayKey: utcTodayKey(),
    });
  } catch (error) {
    // Log error only in development
    if (process.env.NODE_ENV !== "production") {
      console.error("Dashboard loader error:", error);
    }
    return json({
      shop: null,
      recentLogs: [],
      topProducts: [],
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const intent = formData.get("intent") as string;

  if (intent === "dismiss-onboarding") {
    try {
      await upsertShop(shop, { onboardingDismissedAt: new Date() });
      return json({ success: true });
    } catch (error) {
      return json({
        success: false,
        error:
          error instanceof Error ? error.message : "Could not dismiss setup guide",
      });
    }
  }

  if (intent === "reopen-onboarding") {
    try {
      await upsertShop(shop, { clearOnboardingDismissed: true });
      return json({ success: true });
    } catch (error) {
      return json({
        success: false,
        error:
          error instanceof Error ? error.message : "Could not reopen setup guide",
      });
    }
  }

  if (intent === "mark-onboarding-step") {
    const step = formData.get("step") as OnboardingStepId;
    if (step !== "embed" && step !== "tryon" && step !== "garment") {
      return json({ success: false, error: "Invalid setup step" });
    }
    try {
      await mergeOnboardingOverride(shop, step, true);
      return json({ success: true, step });
    } catch (error) {
      return json({
        success: false,
        error:
          error instanceof Error ? error.message : "Could not update setup step",
      });
    }
  }

  // Action pour fermer la notification (sans laisser de review) - réapparaîtra après 30 jours
  if (intent === "dismiss-review") {
    try {
      await upsertShop(shop, {
        last_review_prompt_date: new Date(),
        // Ne pas mettre review_shown = true, pour permettre la réapparition après 30 jours
      });
      return json({ success: true });
    } catch (error) {
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Error dismissing review" 
      });
    }
  }

  // Action pour marquer que le client a cliqué sur "Leave a Review" - ne plus jamais réafficher
  if (intent === "review-completed") {
    try {
      await upsertShop(shop, {
        review_shown: true,
        last_review_prompt_date: new Date(),
      });
      return json({ success: true });
    } catch (error) {
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Error marking review as completed" 
      });
    }
  }

  // Action pour nettoyer les anciens script tags
  if (intent === "cleanup-script-tags") {
    try {
      const scriptTagsQuery = `#graphql
        query {
          scriptTags(first: 50) {
            edges {
              node {
                id
                src
              }
            }
          }
        }
      `;
      
      const scriptTagsResponse = await admin.graphql(scriptTagsQuery);
      
      if (scriptTagsResponse.ok) {
        const scriptTagsData = await scriptTagsResponse.json() as any;
        const existingScripts = scriptTagsData.data?.scriptTags?.edges || [];
        
        // Find all old script tags related to the widget
        const oldScriptTags = existingScripts.filter((edge: any) => {
          const src = edge.node.src || '';
          return src.includes('widget') || 
                 src.includes('tryon') || 
                 src.includes('try-on') ||
                 src.includes('vton') ||
                 (src.includes('/apps/') && src.includes('widget'));
        });
        
        let deletedCount = 0;
        
        for (const oldScript of oldScriptTags) {
          try {
            const deleteScriptTagMutation = `#graphql
              mutation scriptTagDelete($id: ID!) {
                scriptTagDelete(id: $id) {
                  deletedScriptTagId
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;
            
            const deleteResult = await admin.graphql(deleteScriptTagMutation, {
              variables: {
                id: oldScript.node.id
              }
            });
            
            if (deleteResult.ok) {
              const deleteData = await deleteResult.json().catch(() => null);
              if (deleteData?.data?.scriptTagDelete?.deletedScriptTagId) {
                deletedCount++;
              }
            }
          } catch (deleteError) {
            // Error deleting script tag - non-critical, continue
          }
        }
        
        if (sessionCanInstallScriptTag(session.scope)) {
          scheduleStorefrontWidgetScriptTag(admin);
        }

        return json({
          success: true,
          deletedCount,
          message:
            deletedCount > 0
              ? `Deleted ${deletedCount} old script tag(s). Current widget script reinstalled.`
              : "No old script tags found. Current widget script is active.",
        });
      }
      
      return json({ success: false, error: "Unable to retrieve script tags" });
    } catch (error) {
      // Log error only in development
      if (process.env.NODE_ENV !== "production") {
        console.error("Error cleaning up script tags:", error);
      }
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  }

  if (intent === "save-store-settings") {
    const parseLimit = (raw: FormDataEntryValue | null, fallback: number) => {
      const n = parseInt(String(raw ?? ""), 10);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };

    const maxTriesPerUser = parseLimit(formData.get("maxTriesPerUser"), 5);
    const dailyLimit = parseLimit(formData.get("dailyLimit"), 100);
    const isEnabled = formData.get("isEnabled") === "true";
    const monthlyQuotaStr = String(formData.get("monthlyQuota") ?? "").trim();
    const monthlyQuota =
      monthlyQuotaStr === ""
        ? null
        : parseLimit(monthlyQuotaStr, 0) || null;

    try {
      await upsertShop(shop, {
        maxTriesPerUser,
        isEnabled,
        dailyLimit,
        monthlyQuota,
      });
      invalidateLayoutShopContext(shop);

      const [updatedShop, usage] = await Promise.all([
        getShop(shop),
        getMonthlyTryonUsage(shop).catch(() => 0),
      ]);

      return json({
        success: true,
        shop: updatedShop,
        monthlyUsage: usage,
      });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[Dashboard] Error saving store settings:", error);
      }
      return json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return json({ success: false, error: "Unknown action" });
};

type DailyTryonStat = { date: string; count: number };

function DailyTryonsLineChart({
  stats,
  todayKey,
}: {
  stats: DailyTryonStat[];
  todayKey: string;
}) {
  const maxCount = Math.max(...stats.map((s) => s.count), 1);
  const W = 700;
  const H = 150;
  const padL = 36;
  const padR = 24;
  const padT = 28;
  const padB = 12;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const points = stats.map((stat, i) => {
    const x =
      padL +
      (stats.length <= 1 ? innerW / 2 : (i / (stats.length - 1)) * innerW);
    const y = padT + innerH - (stat.count / maxCount) * innerH;
    return { x, y, stat };
  });

  const lineD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const areaD =
    lineD +
    ` L ${points[points.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)}` +
    ` L ${points[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  const gridLines = [0, 0.5, 1];

  return (
    <div className="vton-line-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="vton-line-chart__svg"
        role="img"
        aria-label="Daily try-ons over the last 7 days"
      >
        {gridLines.map((t) => {
          const y = padT + innerH * (1 - t);
          return (
            <line
              key={t}
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              className="vton-line-chart__grid"
            />
          );
        })}
        <path d={areaD} className="vton-line-chart__area" />
        <path d={lineD} className="vton-line-chart__line" />
        {points.map((p, i) => {
          const isToday = isUtcSameDay(p.stat.date, todayKey);
          return (
            <g key={`${p.stat.date}-${i}`}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isToday ? 6 : 4}
                className={
                  isToday
                    ? "vton-line-chart__dot vton-line-chart__dot--today"
                    : "vton-line-chart__dot"
                }
              />
              <text
                x={p.x}
                y={p.y - 10}
                textAnchor="middle"
                className="vton-line-chart__value"
              >
                {p.stat.count}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="vton-line-chart__labels">
        {stats.map((stat, i) => {
          const isToday = isUtcSameDay(stat.date, todayKey);
          return (
            <span
              key={`${stat.date}-label-${i}`}
              className={
                isToday
                  ? "vton-line-chart__label vton-line-chart__label--today"
                  : "vton-line-chart__label"
              }
            >
              {formatUtcChartLabel(stat.date)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const settingsFetcher = useFetcher<typeof action>();
  const cleanupFetcher = useFetcher<typeof action>();
  // Handle both success and error cases from loader
  const shop = (loaderData as any).shop || null;
  const recentLogs = Array.isArray((loaderData as any).recentLogs) ? (loaderData as any).recentLogs : [];
  const topProducts = Array.isArray((loaderData as any).topProducts) ? (loaderData as any).topProducts : [];
  const dailyStats = Array.isArray((loaderData as any).dailyStats) ? (loaderData as any).dailyStats : [];
  const monthlyUsage = typeof (loaderData as any).monthlyUsage === 'number' ? (loaderData as any).monthlyUsage : 0;
  const error = (loaderData as any).error || null;
  const shouldShowReview = (loaderData as any).shouldShowReview || false;
  const reviewUrl = (loaderData as any).reviewUrl || "https://apps.shopify.com/try-on-stylelab";
  const themeEditorAppEmbedsUrl = (loaderData as any).themeEditorAppEmbedsUrl || "";
  const themeEditorActivateUrl = (loaderData as any).themeEditorActivateUrl || "";
  const onboarding = (loaderData as any).onboarding ?? null;
  const todayKey =
    typeof (loaderData as any).todayKey === "string"
      ? (loaderData as any).todayKey
      : utcTodayKey();
  const showOnboardingPanel =
    onboarding && !(onboarding.dismissed && onboarding.allDone);

  const notifications = useAdminNotifications();
  const revalidator = useRevalidator();
  const { notifications: notifyItems, dismiss } = notifications;

  const [embedDismissed, setEmbedDismissed] = useState(false);
  const [showAppEmbedBanner, setShowAppEmbedBanner] = useState(false);

  useEffect(() => {
    if (embedDismissed) {
      setShowAppEmbedBanner(false);
      return;
    }
    const displayCount = parseInt(
      localStorage.getItem("appEmbedBannerDisplayCount") || "0",
      10,
    );
    setShowAppEmbedBanner(displayCount < 2);
  }, [embedDismissed]);

  const [monthlyUsageCount, setMonthlyUsageCount] = useState(monthlyUsage);

  useEffect(() => {
    setMonthlyUsageCount(monthlyUsage);
  }, [monthlyUsage]);

  // ADDED: Monthly quota and usage (for display only)
  const monthlyQuota = shop?.monthly_quota || null;
  const quotaPercentage = monthlyQuota && monthlyQuota > 0 
    ? Math.min((monthlyUsageCount / monthlyQuota) * 100, 100).toFixed(1)
    : null;
  const quotaExceeded = monthlyQuota && monthlyUsageCount >= monthlyQuota;

  const credits = shop?.credits || 0;

  // Get total try-ons from loader data (calculated in loader) or fallback to shop value
  const totalTryons = typeof (loaderData as any).totalTryons === 'number' 
    ? (loaderData as any).totalTryons 
    : (shop?.total_tryons || 0);
  
  const totalAtc = shop?.total_atc || 0;
  
  // Memoize conversion rate calculation
  const conversionRate = useMemo(() => {
    return totalTryons > 0 && totalAtc >= 0
      ? ((totalAtc / totalTryons) * 100).toFixed(1)
      : "0.0";
  }, [totalTryons, totalAtc]);
  
  // Memoize 30-day total calculation
  const last30DaysTotal = useMemo(() => {
    return dailyStats.reduce((sum: number, stat: any) => sum + stat.count, 0);
  }, [dailyStats]);
  

  const [isEnabled, setIsEnabled] = useState(shop?.is_enabled !== false);
  const [dailyLimit, setDailyLimit] = useState(
    () => String(shop?.daily_limit ?? 100),
  );
  const [maxTriesPerUser, setMaxTriesPerUser] = useState(
    () => String(shop?.max_tries_per_user ?? 5),
  );
  const [monthlyQuotaInput, setMonthlyQuotaInput] = useState(() =>
    shop?.monthly_quota != null ? String(shop.monthly_quota) : "",
  );

  useEffect(() => {
    if (!shop) return;
    setIsEnabled(shop.is_enabled !== false);
    setDailyLimit(String(shop.daily_limit ?? 100));
    setMaxTriesPerUser(String(shop.max_tries_per_user ?? 5));
    setMonthlyQuotaInput(
      shop.monthly_quota != null ? String(shop.monthly_quota) : "",
    );
  }, [shop]);

  useEffect(() => {
    const data = settingsFetcher.data as {
      success?: boolean;
      shop?: typeof shop;
      monthlyUsage?: number;
    } | undefined;
    if (!data?.success) return;
    if (typeof data.monthlyUsage === "number") {
      setMonthlyUsageCount(data.monthlyUsage);
    }
    if (data.shop) {
      setIsEnabled(data.shop.is_enabled !== false);
      setDailyLimit(String(data.shop.daily_limit ?? 100));
      setMaxTriesPerUser(String(data.shop.max_tries_per_user ?? 5));
      setMonthlyQuotaInput(
        data.shop.monthly_quota != null ? String(data.shop.monthly_quota) : "",
      );
    }
    revalidator.revalidate();
  }, [settingsFetcher.data, revalidator]);

  useEffect(() => {
    if (!showAppEmbedBanner) return;
    const currentCount = parseInt(
      localStorage.getItem("appEmbedBannerDisplayCount") || "0",
      10,
    );
    if (currentCount < 2) {
      localStorage.setItem(
        "appEmbedBannerDisplayCount",
        String(currentCount + 1),
      );
      if (currentCount + 1 >= 2) {
        setEmbedDismissed(true);
      }
    }
  }, [showAppEmbedBanner]);

  useFetcherNotifications(settingsFetcher, notifications, {
    successId: "dashboard-save-success",
    errorId: "dashboard-save-error",
    onSuccess: () => ({
      title: "Settings saved",
      message:
        "Store limits and enable/disable are live on your storefront now.",
    }),
    onError: (data) => ({
      title: "Could not save",
      message: String((data as { error?: string }).error ?? "Unknown error"),
    }),
  });

  useFetcherNotifications(cleanupFetcher, notifications, {
    successId: "dashboard-cleanup-success",
    errorId: "dashboard-cleanup-error",
    onSuccess: (data) => {
      const d = data as { deletedCount?: number; message?: string };
      return {
        title: "Cleanup complete",
        message:
          d.message ||
          `Deleted ${d.deletedCount ?? 0} old script tag(s).`,
      };
    },
    onError: (data) => ({
      title: "Cleanup failed",
      message: String((data as { error?: string }).error ?? "Unknown error"),
    }),
  });

  const dashboardNotifications = useMemo(() => {
    return [
      {
        id: "dashboard-app-embed",
        show: showAppEmbedBanner && !showOnboardingPanel,
        tone: "info" as const,
        priority: 15,
        title: "Try-on is live on your product pages",
        message: (
          <>
            The try-on button is enabled automatically on every product page. Turn it off per
            product in <strong>Products</strong>. Optional theme embed settings can improve button
            placement.
          </>
        ),
        persistDismiss: true,
        autoHideMs: false as const,
        action: themeEditorActivateUrl
          ? {
              label: "Theme options (optional)",
              onAction: () => window.open(themeEditorActivateUrl, "_top"),
            }
          : undefined,
      },
      {
        id: "dashboard-review",
        show: shouldShowReview,
        tone: "info" as const,
        priority: 20,
        title: "Enjoying Virtual Try-On?",
        message: "Your feedback helps us improve the app for your store.",
        persistDismiss: true,
        autoHideMs: false as const,
        action: {
          label: "Leave a review",
          onAction: () => {
            window.open(reviewUrl, "_blank");
            const formData = new FormData();
            formData.append("intent", "review-completed");
            fetcher.submit(formData, { method: "post" });
          },
        },
      },
      {
        id: "dashboard-loader-error",
        show: Boolean(error),
        tone: "critical" as const,
        priority: 1,
        title: "Error",
        message: error,
      },
      {
        id: "dashboard-widget-disabled",
        show: !isEnabled,
        tone: "warning" as const,
        priority: 8,
        title: "Widget is disabled",
        message:
          "The try-on button is hidden on your store. Re-enable it in Store settings below.",
        persistDismiss: true,
        autoHideMs: false as const,
      },
    ];
  }, [
    showAppEmbedBanner,
    showOnboardingPanel,
    shouldShowReview,
    reviewUrl,
    themeEditorActivateUrl,
    error,
    isEnabled,
    credits,
    fetcher,
  ]);

  useNotificationSync(dashboardNotifications, notifications);

  const handleNotificationDismiss = useCallback(
    (id: string, options?: { persist?: boolean }) => {
      if (id === "dashboard-review") {
        const formData = new FormData();
        formData.append("intent", "dismiss-review");
        fetcher.submit(formData, { method: "post" });
      }
      if (id === "dashboard-app-embed") {
        setEmbedDismissed(true);
      }
      dismiss(id, options);
    },
    [dismiss, fetcher],
  );

  // Memoize stats array to prevent recreation on every render
  const stats = useMemo(() => [
    { 
      label: "Generations left", 
      value: credits.toLocaleString("en-US"), 
      icon: "",
      link: "/app/credits"
    },
    { 
      label: "Generations (30 days)", 
      value: last30DaysTotal.toLocaleString("en-US"), 
      icon: "",
      link: "/app/history"
    },
    { 
      label: "Add to Cart", 
      value: totalAtc.toLocaleString("en-US"), 
      icon: "",
      link: "/app/history"
    },
    { 
      label: "Conversion Rate", 
      value: `${conversionRate}%`, 
      icon: "",
      link: "/app/history"
    },
  ], [credits, last30DaysTotal, totalAtc, conversionRate]);

  // Memoize last 7 days stats for graph
  const last7DaysStats = useMemo(() => dailyStats.slice(-7), [dailyStats]);
  
  // Memoize recent logs (first 5)
  const recentLogsDisplay = useMemo(() => recentLogs.slice(0, 5), [recentLogs]);

  return (
    <Page>
      <TitleBar title="Dashboard - VTON Magic" />
      <div className="app-container">
        <AdminPage
          title="Dashboard"
          subtitle="Overview of your virtual try-on activity and store settings"
        >
        <div className="vton-hero">
          <div>
            <span className={`vton-status-pill ${isEnabled ? "is-on" : "is-off"}`}>
              {isEnabled ? "Storefront active" : "Storefront paused"}
            </span>
            <p className="vton-hero-title">Virtual Try-On on your product pages</p>
            <p className="vton-hero-desc">
              {credits.toLocaleString("en-US")} generations left · {last30DaysTotal.toLocaleString("en-US")} generations in the last 30 days
            </p>
          </div>
          <div className="vton-hero-actions">
            <Link to="/app/widget" className="vton-btn vton-btn--ghost">Customize widget</Link>
            <Link to="/app/products" className="vton-btn vton-btn--ghost">Products</Link>
            <Link to="/app/credits" className="vton-btn vton-btn--primary">View plans</Link>
          </div>
        </div>

        <AdminNotifications items={notifyItems} onDismiss={handleNotificationDismiss} />

        {showOnboardingPanel && onboarding && (
          <OnboardingGuide
            onboarding={onboarding}
            themeEditorActivateUrl={themeEditorActivateUrl}
            themeEditorAppEmbedsUrl={themeEditorAppEmbedsUrl}
            fetcher={fetcher}
          />
        )}

        <div className="vton-metric-grid">
          {stats.map((stat) => (
            <Link key={stat.label} to={stat.link} className="vton-metric-card" style={{ textDecoration: "none" }}>
              <p className="vton-metric-label">{stat.label}</p>
              <p className="vton-metric-value">{stat.value}</p>
            </Link>
          ))}
        </div>

        <div className="vton-panel">
          <div className="vton-panel-header">
            <h2 className="vton-panel-title">Daily try-ons (last 7 days)</h2>
            <Link to="/app/history" className="vton-panel-link">View history</Link>
          </div>
          {last7DaysStats.length > 0 ? (
            <div className="graph-container-large vton-line-chart-wrap">
              <DailyTryonsLineChart stats={last7DaysStats} todayKey={todayKey} />
            </div>
          ) : (
            <div className="vton-empty">No try-ons in the last 7 days</div>
          )}
        </div>

        <div className="vton-grid-2">
          <div className="vton-panel">
            <div className="vton-panel-header">
              <h2 className="vton-panel-title">Top products</h2>
              <Link to="/app/products" className="vton-panel-link">Manage</Link>
            </div>
            {topProducts.length > 0 ? (
              <div>
                {topProducts.map((product: any, index: number) => (
                  <div key={product.product_id || index} className="vton-list-item">
                    <span>
                      {product.product_title || product.product_id || "Unknown Product"}
                    </span>
                    <Badge tone="info">
                      {`${product.tryons || product.count} try-on${(product.tryons || product.count) > 1 ? "s" : ""}`}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="vton-empty">No try-ons yet. Enable the widget on your products.</div>
            )}
          </div>

          <div className="vton-panel">
            <div className="vton-panel-header">
              <h2 className="vton-panel-title">Recent activity</h2>
              <Link to="/app/history" className="vton-panel-link">See all</Link>
            </div>
            {recentLogs.length > 0 ? (
              <div>
                {recentLogsDisplay.map((log: any, index: number) => (
                  <div key={log.id || index} className="vton-list-item">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {log.product_title || log.product_id || "Unknown Product"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--vton-muted)" }}>
                        {formatUtcDateTime(log.created_at)}
                      </div>
                    </div>
                    <Badge tone={log.success ? "success" : "critical"}>
                      {log.success ? "Success" : "Failed"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="vton-empty">No recent activity yet.</div>
            )}
          </div>
        </div>

        <div className="vton-panel">
          <h2 className="vton-panel-title" style={{ marginBottom: 16 }}>Store settings</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              formData.set("intent", "save-store-settings");
              settingsFetcher.submit(formData, { method: "post" });
            }}
          >
            <input type="hidden" name="intent" value="save-store-settings" />
            <div className="vton-form-grid">
              <div className="vton-field">
                <label>Enable app on store</label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Checkbox
                    checked={isEnabled}
                    onChange={setIsEnabled}
                    label=""
                  />
                  <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                    {isEnabled ? "Yes" : "No"}
                  </span>
                </div>
                <input type="hidden" name="isEnabled" value={isEnabled ? "true" : "false"} />
                <p className="vton-field-hint">
                  When off, the try-on button is hidden on all product pages.
                </p>
              </div>
              <div className="vton-field">
                <label>Daily Limit</label>
                <input
                  type="number"
                  name="dailyLimit"
                  min={0}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  placeholder="100"
                  className="vton-input"
                />
                <p className="vton-field-hint">
                  Max successful try-ons for the whole store per day (0 = unlimited).
                </p>
              </div>
              <div className="vton-field">
                <label>Max try-ons per user/day</label>
                <input
                  type="number"
                  name="maxTriesPerUser"
                  min={0}
                  value={maxTriesPerUser}
                  onChange={(e) => setMaxTriesPerUser(e.target.value)}
                  placeholder="5"
                  className="vton-input"
                />
                <p className="vton-field-hint">
                  Per visitor IP per day (0 = unlimited).
                </p>
              </div>
              <div className="vton-field">
                <label>Monthly Quota Limit</label>
                <input
                  type="number"
                  name="monthlyQuota"
                  min={0}
                  value={monthlyQuotaInput}
                  onChange={(e) => setMonthlyQuotaInput(e.target.value)}
                  placeholder="Unlimited (leave empty)"
                  className="vton-input"
                />
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  {monthlyQuota
                    ? `Current usage: ${monthlyUsageCount.toLocaleString("en-US")} / ${monthlyQuota.toLocaleString("en-US")} (${quotaPercentage}%)`
                    : `Current usage: ${monthlyUsageCount.toLocaleString("en-US")} (no limit set)`}
                </p>
              </div>
              <div className="vton-field">
                <label>Cleanup</label>
                <Button
                  onClick={() => {
                    const formData = new FormData();
                    formData.append("intent", "cleanup-script-tags");
                    cleanupFetcher.submit(formData, { method: "post" });
                  }}
                  submit={false}
                  disabled={cleanupFetcher.state === "submitting"}
                  loading={cleanupFetcher.state === "submitting"}
                >
                  {cleanupFetcher.state === "submitting"
                    ? "Processing..."
                    : "Delete old widgets and scripts"}
                </Button>
                <p className="vton-field-hint">
                  Removes duplicate legacy script tags, then reinstalls the current widget.
                </p>
              </div>
            </div>
            <div style={{ marginTop: "20px" }}>
              <Button
                submit
                variant="primary"
                loading={settingsFetcher.state === "submitting"}
              >
                Save
              </Button>
            </div>
          </form>
        </div>
        </AdminPage>
      </div>
    </Page>
  );
}
