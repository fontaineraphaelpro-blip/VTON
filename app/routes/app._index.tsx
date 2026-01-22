import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, defer, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator, Link } from "@remix-run/react";
import { useEffect, useState } from "react";
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
import { authenticate } from "../shopify.server";
import { getShop, upsertShop, getTryonLogs, getTopProducts, getTryonStatsByDay, getMonthlyTryonUsage, query } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

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

  // Always sync database with Shopify subscriptions (keeps DB up to date even without charge_id)
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
      const planCredits: Record<string, number> = {
        "free-installation-setup": 4,
        "starter": 100,
        "pro": 400,
        "studio": 2000,
      };

      const monthlyCredits = planCredits[currentActivePlan] || planCredits["free-installation-setup"];
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
    if (!currentActivePlan) {
      try {
        const shopData = await getShop(shop);
        
        if (!shopData || !shopData.plan_name || shopData.plan_name !== "free-installation-setup") {
          await upsertShop(shop, {
            credits: 4,
            monthlyQuota: 4,
          });
          
          try {
            await query(
              `ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_name TEXT DEFAULT 'free-installation-setup'`
            );
            await query(
              `UPDATE shops SET plan_name = $1 WHERE domain = $2`,
              ["free-installation-setup", shop]
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

  try {
    await ensureTables();

    // OPTIMIZED: Load critical data immediately
    let shopData = await getShop(shop);
    
    if (shopData && (shopData.is_enabled === null || shopData.is_enabled === undefined)) {
      await upsertShop(shop, {
        isEnabled: true,
      });
      shopData = await getShop(shop);
    }
    
    // OPTIMIZED: Start all queries in parallel (they run concurrently)
    // This is faster than awaiting them sequentially
    const [recentLogs, topProducts, dailyStats, monthlyUsage] = await Promise.all([
      getTryonLogs(shop, { limit: 50 }),
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

    // Fetch product titles by handle for topProducts/recentLogs that only have product_handle
    if (productHandlesToFetch.size > 0) {
      try {
        for (const handle of productHandlesToFetch) {
          const r = await admin.graphql(
            `#graphql
              query getProductByHandle($query: String!) {
                products(first: 1, query: $query) {
                  edges { node { id title handle } }
                }
              }`,
            { variables: { query: `handle:${handle}` } }
          );
          if (r.ok) {
            const d = (await r.json()) as any;
            const node = d?.data?.products?.edges?.[0]?.node;
            if (node?.title) productNamesMap[handle] = node.title;
          }
        }
      } catch {
        // Ignore
      }
    }

    // Enrich topProducts with product titles (use fetched names, fallback to existing product_title from logs)
    // IMPORTANT: Fetch product titles directly from tryon_logs first (most reliable since they're already stored)
    const enrichedTopProducts = await Promise.all(topProducts.map(async (product: any) => {
      if (product.product_id) {
        const gidMatch = product.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
        const numericId = gidMatch ? gidMatch[1] : product.product_id;
        
        // PRIORITY 1: Try to get title from tryon_logs (most reliable - already stored in DB)
        let title: string | undefined;
        try {
          const idParams = [shop, product.product_id, numericId, gidMatch ? product.product_id : `gid://shopify/Product/${numericId}`];
          const idCondition = "product_id IN ($2, $3, $4)";
          const handleCondition = product.product_handle ? " OR product_handle = $5" : "";
          const logResult = await query(
            `SELECT product_title, product_handle FROM tryon_logs 
             WHERE shop = $1 AND (${idCondition}${handleCondition}) AND product_title IS NOT NULL AND product_title != ''
             ORDER BY created_at DESC LIMIT 1`,
            product.product_handle ? [...idParams, product.product_handle] : idParams
          );
          if (logResult.rows.length > 0 && logResult.rows[0].product_title) {
            title = logResult.rows[0].product_title;
          }
        } catch (err) {
          // Ignore errors
        }

        // PRIORITY 2: Try fetched names map (from GraphQL query above)
        if (!title) {
          title = productNamesMap[product.product_id] || productNamesMap[numericId] || (product.product_handle ? productNamesMap[product.product_handle] : undefined);
        }
        
        // PRIORITY 3: Try to find title from recentLogs
        if (!title) {
          const logsWithSameId = recentLogs.filter((log: any) => {
            if (!log.product_id || !log.product_title) return false;
            const logGidMatch = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
            const logNumericId = logGidMatch ? logGidMatch[1] : log.product_id;
            return log.product_id === product.product_id || logNumericId === numericId;
          });
          
          if (logsWithSameId.length > 0 && logsWithSameId[0].product_title) {
            title = logsWithSameId[0].product_title;
          }
        }
        
        // PRIORITY 4: Try handles map
        if (!title && productHandlesMap[product.product_id]) {
          title = productHandlesMap[product.product_id];
        }
        
        // PRIORITY 5: Try product_handle from logs and match with productNamesMap
        if (!title) {
          try {
            const handleResult = await query(
              `SELECT product_handle 
               FROM tryon_logs 
               WHERE shop = $1 AND product_id IN ($2, $3, $4) AND product_handle IS NOT NULL 
               LIMIT 1`,
              [shop, product.product_id, numericId, gidMatch ? product.product_id : `gid://shopify/Product/${numericId}`]
            );
            if (handleResult.rows.length > 0 && handleResult.rows[0].product_handle) {
              const handle = handleResult.rows[0].product_handle;
              if (productNamesMap[handle]) {
                title = productNamesMap[handle];
              }
            }
          } catch (err) {
            // Ignore errors
          }
        }
        
        // Always set product_title - use title if found, otherwise use numeric ID as fallback
        if (title && title !== 'Product #' && !title.startsWith('Product #')) {
          return { ...product, product_title: title };
        } else {
          // Use numeric ID as fallback (better than full GID) but try to avoid "Product #" format
          return { ...product, product_title: `Product #${numericId}` };
        }
      }
      return product;
    }));
    
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

    // If shop doesn't exist yet, create it with free plan (4 credits/month)
    if (!shopData) {
      await upsertShop(shop, {
        credits: 4, // Initialize credits for compatibility with old system
        monthlyQuota: 4, // Initialize with free plan
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

    // NOTE: Widget uses App Embed Block (block.liquid). To install: Online Store > Themes > Customize > Product template > App embeds > Enable "Virtual Try-On Widget"

    return json({
      shop: shopData || null,
      recentLogs: Array.isArray(enrichedRecentLogs) ? enrichedRecentLogs.slice(0, 5) : [],
      topProducts: Array.isArray(enrichedTopProducts) ? enrichedTopProducts : [],
      dailyStats: Array.isArray(dailyStats) ? dailyStats : [],
      monthlyUsage: monthlyUsage || 0, // ADDED: Monthly usage count
      totalTryons: totalTryons || 0, // ADDED: Total try-ons (calculated or from shop)
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
        
        return json({ 
          success: true, 
          deletedCount,
          message: `Deleted ${deletedCount} old script tag(s)` 
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

  // Action normale pour sauvegarder la configuration
  const widgetText = (formData.get("widgetText") as string) || "Try It On Now";
  const widgetBg = (formData.get("widgetBg") as string) || "#000000";
  const widgetColor = (formData.get("widgetColor") as string) || "#ffffff";
  const maxTriesPerUserStr = formData.get("maxTriesPerUser") as string;
  const maxTriesPerUser = maxTriesPerUserStr ? parseInt(maxTriesPerUserStr) : 5;
  const isEnabled = formData.get("isEnabled") === "true";
  const dailyLimitStr = formData.get("dailyLimit") as string;
  const dailyLimit = dailyLimitStr ? parseInt(dailyLimitStr) : 100;
  // ADDED: Monthly quota
  const monthlyQuotaStr = formData.get("monthlyQuota") as string;
  const monthlyQuota = monthlyQuotaStr && monthlyQuotaStr.trim() !== "" ? parseInt(monthlyQuotaStr) : null;

    // Configuration saved (logged in database)

  try {
    await upsertShop(shop, {
      widgetText,
      widgetBg,
      widgetColor,
      maxTriesPerUser,
      isEnabled,
      dailyLimit,
      monthlyQuota, // ADDED
    });

    return json({ success: true });
  } catch (error) {
    // Log error only in development
    if (process.env.NODE_ENV !== "production") {
      console.error("[Dashboard Action] Error saving configuration:", error);
    }
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Error saving configuration" 
    });
  }
};

export default function Dashboard() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();

  // Handle both success and error cases from loader
  const shop = (loaderData as any).shop || null;
  const recentLogs = Array.isArray((loaderData as any).recentLogs) ? (loaderData as any).recentLogs : [];
  const topProducts = Array.isArray((loaderData as any).topProducts) ? (loaderData as any).topProducts : [];
  const dailyStats = Array.isArray((loaderData as any).dailyStats) ? (loaderData as any).dailyStats : [];
  const monthlyUsage = typeof (loaderData as any).monthlyUsage === 'number' ? (loaderData as any).monthlyUsage : 0;
  const error = (loaderData as any).error || null;

  // State for managing notification visibility
  const [showErrorBanner, setShowErrorBanner] = useState(error !== null);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [showDisabledBanner, setShowDisabledBanner] = useState(true);
  const [showLowCreditsBanner, setShowLowCreditsBanner] = useState(true);
  const [showQuotaExceededBanner, setShowQuotaExceededBanner] = useState(true);
  const [showQuotaWarningBanner, setShowQuotaWarningBanner] = useState(true);

  // ADDED: Monthly quota and usage (for display only)
  const monthlyQuota = shop?.monthly_quota || null;
  const monthlyUsageCount = monthlyUsage || 0;
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
  const conversionRate = totalTryons > 0 && totalAtc >= 0
    ? ((totalAtc / totalTryons) * 100).toFixed(1)
    : "0.0";
  
  // Calculate 30-day total
  const last30DaysTotal = dailyStats.reduce((sum: number, stat: any) => sum + stat.count, 0);
  

  const handleSave = (formData: FormData) => {
    // Ensure all required fields are present
    if (!formData.get("widgetText")) {
      formData.set("widgetText", shop?.widget_text || "Try It On Now");
    }
    if (!formData.get("widgetBg")) {
      formData.set("widgetBg", shop?.widget_bg || "#000000");
    }
    if (!formData.get("widgetColor")) {
      formData.set("widgetColor", shop?.widget_color || "#ffffff");
    }
    if (!formData.get("maxTriesPerUser")) {
      formData.set("maxTriesPerUser", String(shop?.max_tries_per_user || 5));
    }
    if (!formData.get("isEnabled")) {
      formData.set("isEnabled", shop?.is_enabled !== false ? "true" : "false");
    }
    if (!formData.get("dailyLimit")) {
      formData.set("dailyLimit", String(shop?.daily_limit || 100));
    }
    if (!formData.get("monthlyQuota")) {
      formData.set("monthlyQuota", shop?.monthly_quota ? String(shop.monthly_quota) : "");
    }
    fetcher.submit(formData, { method: "post" });
  };
  
  const [isEnabled, setIsEnabled] = useState(shop?.is_enabled !== false);

  useEffect(() => {
    if (fetcher.data?.success) {
      setShowSuccessBanner(true);
      setTimeout(() => {
        revalidator.revalidate();
      }, 500);
    }
  }, [fetcher.data?.success, revalidator]);

  // Auto-refresh dashboard every 15 seconds to update stats (try-ons, Most Tried, add to cart, etc.)
  useEffect(() => {
    const interval = setInterval(() => {
      revalidator.revalidate();
    }, 15000);

    return () => clearInterval(interval);
  }, [revalidator]);

  const stats = [
    { 
      label: "Available Credits", 
      value: credits.toLocaleString("en-US"), 
      icon: "",
      link: "/app/credits"
    },
    { 
      label: "Total try-ons", 
      value: totalTryons.toLocaleString("en-US"), 
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
  ];

  return (
    <Page>
      <TitleBar title="Dashboard - VTON Magic" />
      <div className="app-container">
        <header className="app-header">
          <h1 className="app-title">Dashboard</h1>
          <p className="app-subtitle">
            Overview of your activity and statistics
          </p>
        </header>

        {/* Alerts compactes en haut */}
        {(showErrorBanner || fetcher.data?.success || showLowCreditsBanner || showDisabledBanner || showQuotaExceededBanner || showQuotaWarningBanner) && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <BlockStack gap="300">
              {showErrorBanner && error && (
                <Banner tone="critical" title="Error" onDismiss={() => setShowErrorBanner(false)}>
                  {error}
                </Banner>
              )}
              {showDisabledBanner && !isEnabled && (
                <Banner tone="warning" title="Widget is Disabled" onDismiss={() => setShowDisabledBanner(false)}>
                  <p>
                    The Virtual Try-On widget is currently <strong>disabled</strong> on your store. 
                    To make it visible on product pages:
                  </p>
                  <ol style={{ marginTop: "8px", marginLeft: "20px" }}>
                    <li>Enable the widget below by checking "Enable app on store"</li>
                    <li>Make sure the App Embed Block is installed in your theme:
                      <ul style={{ marginTop: "4px", marginLeft: "20px" }}>
                        <li>Go to <strong>Online Store → Themes → Customize</strong></li>
                        <li>Select a product template</li>
                        <li>Add an "App embeds" section</li>
                        <li>Enable "Virtual Try-On Widget"</li>
                      </ul>
                    </li>
                  </ol>
                  <p style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-secondary)" }}>
                    If the widget still doesn't appear, check the browser console (F12) on a product page for diagnostic logs.
                  </p>
                </Banner>
              )}
              {showSuccessBanner && fetcher.data?.success && (fetcher.data as any).deletedCount !== undefined && (
                <Banner tone="success" onDismiss={() => setShowSuccessBanner(false)}>
                  {(fetcher.data as any).message || `Deleted ${(fetcher.data as any).deletedCount} old script tag(s)`}
                </Banner>
              )}
              {showSuccessBanner && fetcher.data?.success && !(fetcher.data as any).deletedCount && (
                <Banner tone="success" onDismiss={() => setShowSuccessBanner(false)}>
                  Configuration saved successfully
                </Banner>
              )}
              {(fetcher.data as any)?.error && (
                <Banner tone="critical" onDismiss={() => {
                  fetcher.load('/app');
                }}>
                  Error: {(fetcher.data as any).error}
                </Banner>
              )}
              {showLowCreditsBanner && credits < 10 && (
                <Banner tone="warning" title="Low Credits Balance" onDismiss={() => setShowLowCreditsBanner(false)}>
                  <p>
                    You have <strong>{credits}</strong> credit{credits !== 1 ? "s" : ""} remaining. 
                    <Link to="/app/credits" prefetch="intent" style={{ marginLeft: "8px" }}>
                      Purchase credits →
                    </Link>
                  </p>
                </Banner>
              )}
              {/* ADDED: Monthly quota warning */}
              {showQuotaExceededBanner && quotaExceeded && (
                <Banner tone="critical" title="Monthly Quota Exceeded" onDismiss={() => setShowQuotaExceededBanner(false)}>
                  <p>
                    You have reached your monthly quota of <strong>{monthlyQuota}</strong> try-ons. 
                    {quotaPercentage && ` (${quotaPercentage}% used)`}
                  </p>
                </Banner>
              )}
              {showQuotaWarningBanner && monthlyQuota && !quotaExceeded && parseFloat(quotaPercentage || "0") > 80 && (
                <Banner tone="warning" title="Approaching Monthly Quota" onDismiss={() => setShowQuotaWarningBanner(false)}>
                  <p>
                    You have used <strong>{quotaPercentage}%</strong> of your monthly quota ({monthlyUsageCount} / {monthlyQuota} try-ons).
                  </p>
                </Banner>
              )}
            </BlockStack>
          </div>
        )}

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 5.83333H17.5M2.5 5.83333C1.39543 5.83333 0.5 6.72876 0.5 7.83333V15.8333C0.5 16.9379 1.39543 17.8333 2.5 17.8333H17.5C18.6046 17.8333 19.5 16.9379 19.5 15.8333V7.83333C19.5 6.72876 18.6046 5.83333 17.5 5.83333M2.5 5.83333V4.16667C2.5 3.0621 3.39543 2.16667 4.5 2.16667H15.5C16.6046 2.16667 17.5 3.0621 17.5 4.16667V5.83333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="stat-value">{credits.toLocaleString("en-US")}</div>
            <div className="stat-label">Remaining Credits</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 15.8333L10 2.5L17.5 15.8333H2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10 12.5V8.33333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="stat-value">{last30DaysTotal.toLocaleString("en-US")}</div>
            <div className="stat-label">Total Try-ons (30d)</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 2.5H4.16667L5.83333 12.5H15.8333L17.5 5.83333H5.83333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="7.5" cy="16.6667" r="1.66667" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="15" cy="16.6667" r="1.66667" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </div>
            <div className="stat-value">{totalAtc.toLocaleString("en-US")}</div>
            <div className="stat-label">Add to Cart</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 15.8333L7.5 10.8333L12.5 15.8333L17.5 10.8333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7.5 10.8333V2.5H12.5V10.8333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="stat-value">{conversionRate}%</div>
            <div className="stat-label">Conversion Rate</div>
          </div>
        </div>

        {/* Generations */}
        <div className="dashboard-section">
          <h2>Daily Generations (Last 7 Days)</h2>
          {dailyStats.length > 0 ? (
            <div className="graph-container-large">
              <div className="graph-bars">
                {dailyStats.slice(-7).map((stat: any, index: number) => {
                  const maxCount = Math.max(...dailyStats.map((s: any) => s.count));
                  // Calculate percentage: scale from 0% to 100% based on max value
                  const percentage = maxCount > 0 && stat.count > 0 
                    ? (stat.count / maxCount) * 100 
                    : 0;
                  const date = new Date(stat.date);
                  const isToday = date.toDateString() === new Date().toDateString();
                  
                  return (
                    <div key={index} className="graph-bar-item">
                      <div className="graph-bar-value">{stat.count}</div>
                      <div 
                        className={`graph-bar ${isToday ? 'graph-bar-today' : ''}`}
                        style={{ height: `${Math.max(percentage, 2)}%` }}
                        title={`${stat.count} generation${stat.count !== 1 ? 's' : ''} on ${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`}
                      />
                      <div className={`graph-bar-label ${isToday ? 'graph-bar-label-today' : ''}`}>
                        {date.toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="dashboard-placeholder">
              No data available for the last 30 days
            </div>
          )}
        </div>

        {/* Products and Activity side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--spacing-lg)", marginBottom: "var(--spacing-lg)" }}>
          {/* Products */}
          <div className="dashboard-section">
            <h2>Most Tried Products</h2>
            {topProducts.length > 0 ? (
              <div className="products-list">
                {topProducts.map((product: any, index: number) => (
                  <div key={product.product_id || index} className="product-item">
                    <span className="product-name">
                      {product.product_title || product.product_id || "Unknown Product"}
                    </span>
                    <Badge tone="info">
                      {`${product.tryons || product.count} try-on${(product.tryons || product.count) > 1 ? "s" : ""}`}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dashboard-placeholder">
                No try-ons yet. Start using the widget on your products!
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="dashboard-section">
            <h2>Recent Activity</h2>
            {recentLogs.length > 0 ? (
              <div className="activity-list">
                {recentLogs.slice(0, 5).map((log: any, index: number) => (
                  <div key={log.id || index} className="activity-item">
                    <div className="activity-info">
                      <p className="activity-title">
                        {log.product_title || log.product_id || "Unknown Product"}
                      </p>
                      <p className="activity-date">
                        {new Date(log.created_at).toLocaleDateString("en-US", { 
                          month: "short", 
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </p>
                    </div>
                    <Badge tone={log.success ? "success" : "critical"}>
                      {log.success ? "✓ Success" : "✗ Failed"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dashboard-placeholder">
                No recent activity. Try-ons will appear here once customers start using the widget.
              </div>
            )}
          </div>
        </div>

        {/* Settings & Security */}
        <div className="dashboard-section">
          <h2>Settings & Security</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              handleSave(formData);
            }}
          >
            <div className="settings-grid">
              <div className="setting-card">
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
              </div>
              <div className="setting-card">
                <label>Daily Limit</label>
                <input
                  type="number"
                  name="dailyLimit"
                  defaultValue={String(shop?.daily_limit || 100)}
                  placeholder="Daily try-on limit"
                  className="vton-input"
                />
              </div>
              <div className="setting-card">
                <label>Max try-ons per user/day</label>
                <input
                  type="number"
                  name="maxTriesPerUser"
                  defaultValue={String(shop?.max_tries_per_user || 5)}
                  placeholder="0"
                />
              </div>
              {/* ADDED: Monthly quota setting */}
              <div className="setting-card">
                <label>Monthly Quota Limit</label>
                <input
                  type="number"
                  name="monthlyQuota"
                  defaultValue={shop?.monthly_quota ? String(shop.monthly_quota) : ""}
                  placeholder="Unlimited (leave empty)"
                  className="vton-input"
                />
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  {monthlyQuota 
                    ? `Current usage: ${monthlyUsageCount.toLocaleString()} / ${monthlyQuota.toLocaleString()} (${quotaPercentage}%)`
                    : `Current usage: ${monthlyUsageCount.toLocaleString()} (no limit set)`
                  }
                </p>
              </div>
              <div className="setting-card">
                <label>Cleanup</label>
                <Button
                  onClick={() => {
                    const formData = new FormData();
                    formData.append("intent", "cleanup-script-tags");
                    fetcher.submit(formData, { method: "post" });
                  }}
                  disabled={fetcher.state === "submitting"}
                  loading={fetcher.state === "submitting"}
                >
                  {fetcher.state === "submitting" ? "Processing..." : "Delete old widgets and scripts"}
                </Button>
              </div>
            </div>
            <div style={{ marginTop: "20px" }}>
              <Button submit variant="primary" loading={fetcher.state === "submitting"}>
                Save
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Page>
  );
}
