import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigation, useRevalidator } from "@remix-run/react";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Page,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { AdminPage } from "../components/AdminPage";
import { AdminNotifications } from "../components/AdminNotifications";
import { useAdminNotifications, useNotificationSync } from "../hooks/useAdminNotifications";
import { Link } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import {
  getShop,
  upsertShop,
  query,
  getMonthlyTryonUsage,
} from "../lib/services/db.service";
import { computeCreditsAlert } from "../lib/credits-alert";
import { invalidateLayoutShopContext } from "../lib/layout-shop-cache.server";
import {
  BILLING_PLAN_IDS,
  creditsForPlan,
  FREE_PLAN_ID,
  normalizePlanId,
  PLAN_MONTHLY_CREDITS,
} from "../lib/plan-credits";
import { CreditsAlertBanner } from "../components/CreditsAlertBanner";
import { DEMO_SHOP_PLAN, isDemoShop } from "../lib/demo-shops.shared";
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");
  
  try {
    const { admin, session } = await authenticate.admin(request);
    
    if (!session || !session.shop) {
      return json({
        shop: null,
        error: "Invalid session. Please refresh the page.",
      });
    }
    
    const shop = session.shop;

    let shopData = await getShop(shop);
    const { ensureDemoShopAccess } = await import("../lib/demo-shops.server");
    await ensureDemoShopAccess(shop);
    shopData = await getShop(shop);
    
    // Ensure widget is enabled by default if is_enabled is not set
    if (shopData && (shopData.is_enabled === null || shopData.is_enabled === undefined)) {
      await upsertShop(shop, {
        isEnabled: true,
      });
      shopData = await getShop(shop);
    }

    // Handle billing return when charge_id is present
    if (chargeId) {
      try {
        let currentAdmin = admin;
        let currentSession = session;
        let currentShop = shop;
        
        // Brief wait if session is not ready yet
        if (!currentSession || !currentSession.shop) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            const authResult = await authenticate.admin(request);
            currentAdmin = authResult.admin;
            currentSession = authResult.session;
            if (currentSession && currentSession.shop) {
              currentShop = currentSession.shop;
            }
          } catch {
            // Re-auth failed
          }
        }
        
        if (currentSession && currentSession.shop && currentAdmin) {
          const shop = currentShop;
          
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

          const subscriptionResponse = await currentAdmin.graphql(subscriptionQuery);
          const subscriptionData = await subscriptionResponse.json() as any;
          
          let allSubscriptions = subscriptionData?.data?.currentAppInstallation?.activeSubscriptions || [];
          
          // Retry if no subscription found
          if (allSubscriptions.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const retryResponse = await currentAdmin.graphql(subscriptionQuery);
            const retryData = await retryResponse.json() as any;
            allSubscriptions = retryData?.data?.currentAppInstallation?.activeSubscriptions || [];
          }
          
          // In development, also accept test subscriptions
          const allowTestSubscriptions = process.env.NODE_ENV !== "production";
          const recentSubscription = allSubscriptions
            .filter((sub: any) => allowTestSubscriptions || !sub.test)
            .sort((a: any, b: any) => {
              const dateA = new Date(a.createdAt || 0).getTime();
              const dateB = new Date(b.createdAt || 0).getTime();
              return dateB - dateA;
            })[0];
          
          if (recentSubscription) {
            const planName = normalizePlanId(
              recentSubscription.name.toLowerCase().replace(/\s+/g, "-")
            );

            const monthlyCredits = creditsForPlan(planName);
            
            // Update monthlyQuota and credits to reflect purchased plan
            await upsertShop(shop, {
              monthlyQuota: monthlyCredits,
              credits: monthlyCredits,
            });
            invalidateLayoutShopContext(shop);

            try {
              await query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_name TEXT`);
              await query(`UPDATE shops SET plan_name = $1 WHERE domain = $2`, [planName, shop]);
            } catch {
              // Plan name update skipped
            }

            const updatedShopData = await getShop(shop);
            
            const monthlyUsage = await getMonthlyTryonUsage(shop).catch(() => 0);
            return json({
              shop: updatedShopData || null,
              subscriptionUpdated: true,
              planName: planName,
              currentActivePlan: planName,
              stats: {
                totalTryons: updatedShopData?.total_tryons ?? 0,
                totalAtc: updatedShopData?.total_atc ?? 0,
                monthlyUsage,
                monthlyQuota: updatedShopData?.monthly_quota ?? null,
              },
            });
          }
        }
      } catch {
        // Subscription check failed
      }
    }

    let currentActivePlan: string | null = shopData?.plan_name || null;

    // Sync with Shopify only when plan unknown or returning from billing
    if (!chargeId && shopData?.plan_name) {
      const expectedQuota = creditsForPlan(shopData.plan_name);
      if (shopData.monthly_quota !== expectedQuota) {
        await upsertShop(shop, {
          monthlyQuota: expectedQuota,
          credits: Math.max(shopData.credits ?? 0, expectedQuota),
        });
        invalidateLayoutShopContext(shop);
        shopData = await getShop(shop);
      }
      const monthlyUsage = await getMonthlyTryonUsage(shop).catch(() => 0);
      return json({
        shop: shopData || null,
        currentActivePlan: shopData?.plan_name || currentActivePlan,
        stats: {
          totalTryons: shopData?.total_tryons ?? 0,
          totalAtc: shopData?.total_atc ?? 0,
          monthlyUsage,
          monthlyQuota: shopData?.monthly_quota ?? null,
        },
      });
    }

    let shouldUpdateDb = false;

    if (isDemoShop(shop)) {
      const monthlyUsage = await getMonthlyTryonUsage(shop).catch(() => 0);
      return json({
        shop: shopData || null,
        currentActivePlan: DEMO_SHOP_PLAN,
        isDemoShop: true,
        stats: {
          totalTryons: shopData?.total_tryons ?? 0,
          totalAtc: shopData?.total_atc ?? 0,
          monthlyUsage,
          monthlyQuota: shopData?.monthly_quota ?? null,
        },
      });
    }

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

      const subscriptionResponse = await admin.graphql(subscriptionQuery);
      const subscriptionData = await subscriptionResponse.json() as any;
      
      const allSubscriptions = subscriptionData?.data?.currentAppInstallation?.activeSubscriptions || [];
      
      const allowTestSubscriptions = true;
      let activeSubscription = allSubscriptions.find((sub: any) =>
        sub.status === "ACTIVE" && (allowTestSubscriptions || !sub.test)
      );
      
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
        const detectedPlanName = normalizePlanId(
          activeSubscription.name.toLowerCase().replace(/\s+/g, "-")
        );
        currentActivePlan = detectedPlanName;
        
        const dbPlanName = shopData?.plan_name;
        if (dbPlanName !== detectedPlanName) {
          shouldUpdateDb = true;
        }
      } else {
        if (!shopData?.plan_name || shopData.plan_name !== FREE_PLAN_ID) {
          currentActivePlan = FREE_PLAN_ID;
          shouldUpdateDb = true;
        } else {
          currentActivePlan = shopData.plan_name;
          const expectedQuota = creditsForPlan(currentActivePlan);
          if (shopData.monthly_quota !== expectedQuota) {
            shouldUpdateDb = true;
          }
        }
      }
      
      if (shouldUpdateDb && currentActivePlan) {
        const monthlyCredits = creditsForPlan(currentActivePlan);
        
        try {
          // Update monthlyQuota and credits to reflect active plan
          await upsertShop(shop, {
            monthlyQuota: monthlyCredits,
            credits: monthlyCredits,
          });
          invalidateLayoutShopContext(shop);

          await query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_name TEXT`);
          await query(`UPDATE shops SET plan_name = $1 WHERE domain = $2`, [currentActivePlan, shop]);
          
          shopData = await getShop(shop);
        } catch {
          // Sync failed
        }
      }
    } catch {
      if (shopData?.plan_name) {
        currentActivePlan = shopData.plan_name;
      }
    }

    if (!currentActivePlan && shopData?.plan_name) {
      currentActivePlan = shopData.plan_name;
    }

    const monthlyUsage = await getMonthlyTryonUsage(shop).catch(() => 0);

    return json({
      shop: shopData || null,
      currentActivePlan: currentActivePlan,
      stats: {
        totalTryons: shopData?.total_tryons ?? 0,
        totalAtc: shopData?.total_atc ?? 0,
        monthlyUsage,
        monthlyQuota: shopData?.monthly_quota ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      const url = new URL(request.url);
      const currentUrl = url.toString();
      const location = error.headers.get("location");
      if (location && location.includes("/auth/login")) {
        const redirectUrl = new URL(location, request.url);
        redirectUrl.searchParams.set("return_to", currentUrl);
        return new Response(null, {
          status: 302,
          headers: { Location: redirectUrl.toString() },
        });
      }
      throw error;
    }
    
    return json({
      shop: null,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    let admin, session;
    try {
      const authResult = await authenticate.admin(request);
      admin = authResult.admin;
      session = authResult.session;
    } catch (authError) {
      if (authError instanceof Response) {
        if (authError.status === 401 || authError.status === 302) {
          const reauthUrl = authError.headers.get('x-shopify-api-request-failure-reauthorize-url') || 
                           authError.headers.get('location');
          return json({ 
            success: false, 
            error: "Your session has expired. Please refresh the page to re-authenticate.",
            requiresAuth: true,
            reauthUrl: reauthUrl || null,
          });
        }
        return json({ 
          success: false, 
          error: `Authentication error (${authError.status}). Please refresh the page.`,
          requiresAuth: true,
        });
      }
      throw authError;
    }
    
    if (!session || !session.shop || !admin) {
      return json({ 
        success: false, 
        error: "Invalid session. Please refresh the page.",
        requiresAuth: true,
      });
    }
    
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (isDemoShop(shop)) {
      return json({
        success: false,
        error: "This demo store already has complimentary Studio access.",
      });
    }

    if (intent === "purchase-subscription") {
      const planId = formData.get("planId") as string;
      
      const validPlans = [...BILLING_PLAN_IDS];
      if (!validPlans.includes(planId as (typeof BILLING_PLAN_IDS)[number])) {
        return json({ 
          success: false, 
          error: "Invalid subscription plan",
        });
      }

      if (planId === FREE_PLAN_ID) {
        return json({ 
          success: false, 
          error: "The free plan is already active",
        });
      }

      // Skip subscription check - let Shopify handle validation for faster redirect
      // Shopify will prevent duplicate purchases automatically

      const { billing } = await authenticate.admin(request);
      const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || new URL(request.url).origin;
      const returnUrl = `${appUrl}/auth/billing-callback?shop=${encodeURIComponent(shop)}`;
      
      return await billing.request({
        plan: planId as any,
        isTest: null,
        returnUrl: returnUrl,
      });
    }
  
    return json({ 
      success: false, 
      error: "Unrecognized action",
    });
  
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : "An error occurred. Please try again.",
    });
  }
};

export default function Credits() {
  const loaderData = useLoaderData<typeof loader>();
  const shop = (loaderData as any)?.shop || null;
  const error = (loaderData as any)?.error || null;
  const subscriptionUpdated = (loaderData as any)?.subscriptionUpdated || false;
  const planName = (loaderData as any)?.planName || null;
  const currentActivePlan = (loaderData as any)?.currentActivePlan || null;
  const isDemoShopAccount = Boolean((loaderData as any)?.isDemoShop);
  const stats = (loaderData as { stats?: {
    totalTryons: number;
    totalAtc: number;
    monthlyUsage: number;
    monthlyQuota: number | null;
  } })?.stats ?? {
    totalTryons: shop?.total_tryons ?? 0,
    totalAtc: shop?.total_atc ?? 0,
    monthlyUsage: 0,
    monthlyQuota: shop?.monthly_quota ?? null,
  };

  const fetcher = useFetcher<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const currentCredits = shop?.credits || 0;
  const [submittingPackId, setSubmittingPackId] = useState<string | null>(null);
  
  const notifications = useAdminNotifications();
  const { notifications: notifyItems, dismiss } = notifications;

  const isSubmitting = fetcher.state === "submitting" || navigation.state === "submitting";

  const creditsNotifications = useMemo(() => {
    const fetcherData = fetcher.data as {
      error?: string;
      requiresAuth?: boolean;
      reauthUrl?: string;
    } | null;

    return [
      {
        id: "credits-loader-error",
        show: Boolean(error),
        tone: "critical" as const,
        priority: 1,
        title: "Error",
        message: error,
      },
      {
        id: "credits-subscription-success",
        show: Boolean(subscriptionUpdated && planName),
        tone: "success" as const,
        priority: 5,
        title: "Subscription activated",
        message: `Your ${planName} plan is active. Monthly generations have been updated.`,
        autoHideMs: 8000 as const,
      },
      {
        id: "credits-fetcher-error",
        show: Boolean(fetcherData?.error && fetcher.state === "idle"),
        tone: "critical" as const,
        priority: 2,
        title: fetcherData?.requiresAuth ? "Authentication required" : "Error",
        message: fetcherData?.error,
        action:
          fetcherData?.requiresAuth && fetcherData?.reauthUrl
            ? {
                label: "Re-authenticate",
                onAction: () => {
                  try {
                    if (window.top && window.top !== window) {
                      window.top.location.href = fetcherData.reauthUrl!;
                    } else {
                      window.location.href = fetcherData.reauthUrl!;
                    }
                  } catch {
                    window.location.href = fetcherData.reauthUrl!;
                  }
                },
              }
            : undefined,
      },
    ];
  }, [error, subscriptionUpdated, planName, fetcher.data, fetcher.state]);

  useNotificationSync(creditsNotifications, notifications);

  useEffect(() => {
    if (fetcher.state === "idle" && submittingPackId !== null) {
      setSubmittingPackId(null);
    }
  }, [fetcher.state, submittingPackId]);

  useEffect(() => {
    if (subscriptionUpdated && planName) {
      const timer = setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("charge_id");
        window.history.replaceState({}, "", url.pathname + url.search);
        revalidator.revalidate();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [subscriptionUpdated, planName, revalidator]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const chargeId = url.searchParams.get("charge_id");
    if (chargeId && !subscriptionUpdated) {
      const timer = setTimeout(() => {
        revalidator.revalidate();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [subscriptionUpdated, revalidator]);

  // Memoize handleSubscriptionPurchase to prevent recreation on every render
  const handleSubscriptionPurchase = useCallback((planId: string) => {
    if (isSubmitting || submittingPackId !== null) {
      return;
    }
    
    setSubmittingPackId(planId);
    
    const formData = new FormData();
    formData.append("intent", "purchase-subscription");
    formData.append("planId", planId);
    
    // Submit - Remix will handle redirect automatically
    fetcher.submit(formData, { method: "post" });
  }, [isSubmitting, submittingPackId, fetcher]);

  // Memoize subscriptionPlans array to prevent recreation on every render
  const subscriptionPlans = useMemo(
    () => [
      {
        id: FREE_PLAN_ID,
        name: "Free",
        price: 0.0,
        description: "50 generations / month",
        popular: false,
        features: [
          "50 generations per month",
          "Unlimited products",
          "Mobile & desktop ready",
          "Basic customization",
          "Cancel anytime",
        ],
      },
      {
        id: "starter",
        name: "Starter",
        price: 19.0,
        description: "300 generations / month",
        popular: false,
        features: [
          "300 generations per month",
          "Unlimited products",
          "Customizable widget",
          "Simple analytics",
          "Mobile & desktop ready",
          "Cancel anytime",
        ],
      },
      {
        id: "growth",
        name: "Growth",
        price: 49.0,
        description: "1,000 generations / month",
        popular: true,
        features: [
          "1,000 generations per month",
          "Everything in Starter",
          "Advanced analytics",
          "Priority processing",
          "Priority support",
          "Cancel anytime",
        ],
      },
      {
        id: "scale",
        name: "Scale",
        price: 149.0,
        description: "4,000 generations / month",
        popular: false,
        features: [
          "4,000 generations per month",
          "Everything in Growth",
          "Dedicated onboarding",
          "Feature request priority",
          "High-volume store support",
          "Cancel anytime",
        ],
      },
    ],
    []
  );

  const creditsMap: Record<string, number> = useMemo(() => ({ ...PLAN_MONTHLY_CREDITS }), []);

  const conversionRate =
    stats.totalTryons > 0
      ? ((stats.totalAtc / stats.totalTryons) * 100).toFixed(1)
      : null;

  const monthlyQuota =
    stats.monthlyQuota ?? creditsMap[currentActivePlan || ""] ?? PLAN_MONTHLY_CREDITS[FREE_PLAN_ID];
  const creditsAlert = useMemo(
    () =>
      computeCreditsAlert({
        credits: currentCredits,
        monthlyUsage: stats.monthlyUsage,
        monthlyQuota,
      }),
    [currentCredits, stats.monthlyUsage, monthlyQuota]
  );
  const monthlyUsagePercent = creditsAlert.usagePercent ?? 0;

  const faqItems = useMemo(
    () => [
      {
        q: "What counts as one generation?",
        a: "One successful virtual try-on on your storefront.",
      },
      {
        q: "Failed generations?",
        a: "No generation is used. Shoppers can retry for free until a try-on succeeds.",
      },
      {
        q: "What if I run out?",
        a: "Try-on pauses until your monthly renewal or you upgrade.",
      },
      {
        q: "Can I change plans?",
        a: "Yes — upgrade anytime; Shopify handles prorated billing.",
      },
      {
        q: "Cancel anytime?",
        a: "Yes. Cancel from Shopify billing. Your plan stays active until the end of the current cycle.",
      },
    ],
    []
  );

  return (
    <Page>
      <TitleBar title="Plans - VTON Magic" />
      <div className="app-container credits-page">
        <AdminPage
          title="Plans & generations"
          subtitle="Simple pricing to get started. Pick a plan and keep virtual try-on live on your store."
          actions={
            <div className="credits-balance-compact" aria-label="Generations available">
              <span className="credits-balance-compact-value">
                {currentCredits.toLocaleString("en-US")}
              </span>
              <span className="credits-balance-compact-label">generations left</span>
            </div>
          }
        >
          <AdminNotifications items={notifyItems} onDismiss={dismiss} />

        {isDemoShopAccount && (
          <div
            className="credits-funnel-panel"
            style={{ marginBottom: 16, borderColor: "rgba(22, 163, 74, 0.35)" }}
            role="status"
          >
            <p style={{ margin: 0, fontWeight: 700, color: "#166534" }}>
              Studio plan active (demo store)
            </p>
            <p style={{ margin: "6px 0 0", color: "#14532d", fontSize: 14 }}>
              {creditsMap[DEMO_SHOP_PLAN]?.toLocaleString("en-US")} generations per month — no
              Shopify billing required for this test shop.
            </p>
          </div>
        )}

        <CreditsAlertBanner alert={creditsAlert} variant="inline" />

        <div className="credits-funnel" aria-label="Credits checkout flow">
          <section
            className="credits-funnel-step"
            aria-labelledby="credits-step-usage"
          >
            <p id="credits-step-usage" className="credits-funnel-kicker">
              Step 1 · Your usage
            </p>

            <div className="credits-funnel-panel credits-funnel-panel--usage">
              <div className="credits-usage-strip">
                <div className="credits-usage-strip__meter">
                  <div className="credits-usage-strip__head">
                    <span className="credits-usage-strip__label">This month</span>
                    <span className="credits-usage-strip__numbers">
                      <strong>{stats.monthlyUsage}</strong> / {monthlyQuota} generations
                    </span>
                  </div>
                  <div className="credits-usage-meter credits-usage-meter--compact">
                    <div
                      className="credits-usage-meter__fill"
                      style={{ width: `${monthlyUsagePercent}%` }}
                    />
                  </div>
                  {monthlyUsagePercent >= 80 && (
                    <p className="credits-usage-strip__warn">
                      Approaching your monthly generation limit
                    </p>
                  )}
                </div>
                {stats.totalTryons > 0 && (
                  <div className="credits-usage-strip__stat-box">
                    <p className="credits-usage-strip__stat-label">Try-on → cart</p>
                    <p className="credits-usage-strip__stat">
                      <strong>
                        {conversionRate !== null ? `${conversionRate}%` : "—"}
                      </strong>
                      <span className="credits-usage-strip__stat-muted">
                        {stats.totalAtc} ATC / {stats.totalTryons} try-ons
                      </span>
                    </p>
                  </div>
                )}
                <Link to="/app" className="credits-usage-strip__link">
                  Open dashboard →
                </Link>
              </div>
            </div>
          </section>

          <section
            className="credits-funnel-step credits-funnel-step--plans"
            aria-labelledby="credits-step-plans"
          >
            <div className="credits-plans-header">
              <p id="credits-step-plans" className="credits-funnel-kicker credits-funnel-kicker--plans">
                Step 2 · Choose a plan
              </p>
              <p className="credits-funnel-lead">
                1 generation = 1 successful try-on. Most stores choose{" "}
                <strong>Growth</strong> for campaigns.
              </p>
            </div>

        <div className="pricing-grid pricing-grid--compact credits-pricing-grid">
          {subscriptionPlans.map((plan) => {
            const isCurrentPlan = currentActivePlan === plan.id;
            const isFreePlan = plan.id === FREE_PLAN_ID;
            const generations = creditsMap[plan.id] ?? 0;

            return (
              <div
                key={plan.id}
                className={`plan-card plan-card--compact ${plan.popular ? "featured" : ""} ${isCurrentPlan ? "current-plan" : ""}`}
              >
                {plan.popular && (
                  <div className="plan-badge plan-badge-popular">Most popular</div>
                )}
                {isCurrentPlan && (
                  <div className="plan-badge plan-badge-current">Current</div>
                )}
                <div className="plan-name">{plan.name}</div>
                <p className="plan-tagline">{plan.description}</p>
                <div className="plan-price">
                  ${plan.price.toFixed(0)} <span>/ month</span>
                </div>
                {generations > 0 && (
                  <p className="plan-per-credit">
                    {generations.toLocaleString("en-US")} generations / month
                  </p>
                )}
                {plan.features?.length ? (
                  <ul className="plan-features">
                    {plan.features.map((feature: string) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="plan-cta">
                  {isCurrentPlan ? (
                    <button
                      className="plan-button plan-button-current"
                      disabled
                      type="button"
                    >
                      Current plan
                    </button>
                  ) : isFreePlan ? (
                    <button
                      className="plan-button plan-button-disabled"
                      disabled
                      type="button"
                    >
                      Included
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`plan-button ${plan.popular ? "plan-button-featured" : ""}`}
                      onClick={() => handleSubscriptionPurchase(plan.id)}
                      disabled={isSubmitting || submittingPackId !== null}
                    >
                      {isSubmitting && submittingPackId === plan.id
                        ? "Processing..."
                        : plan.popular
                          ? "Subscribe"
                          : "Choose plan"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
          </section>

          <section
            className="credits-funnel-step credits-funnel-step--help"
            aria-labelledby="credits-step-help"
          >
          <p id="credits-step-help" className="credits-funnel-kicker credits-funnel-kicker--help">
            Step 3 · Good to know
          </p>
          <div
            className="credits-funnel-panel credits-funnel-panel--help"
          >
            <h2 id="credits-help-heading" className="credits-help-heading">
              Billing FAQ
            </h2>
            <p className="credits-help-intro">
              No hidden fees. Generations only count on successful try-ons.
            </p>
            <div className="credits-faq-grid">
              {faqItems.map((item) => (
                <article key={item.q} className="credits-faq-card">
                  <h3 className="credits-faq-card__q">{item.q}</h3>
                  <p className="credits-faq-card__a">{item.a}</p>
                </article>
              ))}
            </div>
          </div>
          </section>
        </div>

        <p className="credits-footnote">
          Cancel anytime · No setup fee · Generations reset each billing cycle
        </p>
        </AdminPage>
      </div>
    </Page>
  );
}
