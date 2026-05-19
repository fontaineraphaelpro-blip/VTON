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
            const planName = recentSubscription.name.toLowerCase().replace(/\s+/g, '-');

            const planCredits: Record<string, number> = {
              "free-installation-setup": 4,
              "starter": 100,
              "pro": 400,
              "studio": 2000,
            };

            const monthlyCredits = planCredits[planName] || planCredits["free-installation-setup"];
            
            // Update monthlyQuota and credits to reflect purchased plan
            await upsertShop(shop, {
              monthlyQuota: monthlyCredits,
              credits: monthlyCredits,
            }            );

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
      const monthlyUsage = await getMonthlyTryonUsage(shop).catch(() => 0);
      return json({
        shop: shopData || null,
        currentActivePlan,
        stats: {
          totalTryons: shopData?.total_tryons ?? 0,
          totalAtc: shopData?.total_atc ?? 0,
          monthlyUsage,
          monthlyQuota: shopData?.monthly_quota ?? null,
        },
      });
    }

    let shouldUpdateDb = false;

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
        const detectedPlanName = activeSubscription.name.toLowerCase().replace(/\s+/g, '-');
        currentActivePlan = detectedPlanName;
        
        const dbPlanName = shopData?.plan_name;
        if (dbPlanName !== detectedPlanName) {
          shouldUpdateDb = true;
        }
      } else {
        if (!shopData?.plan_name || shopData.plan_name !== "free-installation-setup") {
          currentActivePlan = "free-installation-setup";
          shouldUpdateDb = true;
        } else {
          currentActivePlan = shopData.plan_name;
        }
      }
      
      if (shouldUpdateDb && currentActivePlan) {
        const planCredits: Record<string, number> = {
          "free-installation-setup": 4,
          "starter": 50,
          "pro": 200,
          "studio": 1000,
        };

        const monthlyCredits = planCredits[currentActivePlan] || planCredits["free-installation-setup"];
        
        try {
          // Update monthlyQuota and credits to reflect active plan
          await upsertShop(shop, {
            monthlyQuota: monthlyCredits,
            credits: monthlyCredits,
          });
          
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

    if (intent === "purchase-subscription") {
      const planId = formData.get("planId") as string;
      
      const validPlans = ["free-installation-setup", "starter", "pro", "studio"];
      if (!validPlans.includes(planId)) {
        return json({ 
          success: false, 
          error: "Invalid subscription plan",
        });
      }

      if (planId === "free-installation-setup") {
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
        message: `Your ${planName} plan is active. Monthly credits have been updated.`,
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
        id: "free-installation-setup",
        name: "Free",
        price: 0.0,
        description: "4 try-ons / month",
        popular: false,
        highlight: "Widget on product pages",
      },
      {
        id: "starter",
        name: "Starter",
        price: 29.0,
        description: "100 try-ons / month",
        popular: false,
        highlight: "Small catalogs",
      },
      {
        id: "pro",
        name: "Pro",
        price: 99.0,
        description: "400 try-ons / month",
        popular: true,
        highlight: "Best value per try-on",
      },
      {
        id: "studio",
        name: "Studio",
        price: 399.0,
        description: "2,000 try-ons / month",
        popular: false,
        highlight: "High traffic & launches",
      },
    ],
    []
  );

  const creditsMap: Record<string, number> = useMemo(
    () => ({
      "free-installation-setup": 4,
      starter: 100,
      pro: 400,
      studio: 2000,
    }),
    []
  );

  const conversionRate =
    stats.totalTryons > 0
      ? ((stats.totalAtc / stats.totalTryons) * 100).toFixed(1)
      : null;

  const monthlyQuota = stats.monthlyQuota ?? creditsMap[currentActivePlan || ""] ?? 4;
  const monthlyUsagePercent =
    monthlyQuota > 0
      ? Math.min(100, Math.round((stats.monthlyUsage / monthlyQuota) * 100))
      : 0;

  const isLowCredits = currentCredits <= Math.max(5, Math.ceil(monthlyQuota * 0.15));
  const isOutOfCredits = currentCredits <= 0;

  const faqItems = useMemo(
    () => [
      {
        q: "What is one credit?",
        a: "One successful virtual try-on on your storefront.",
      },
      {
        q: "What if I run out?",
        a: "Try-on pauses until your monthly renewal or you upgrade.",
      },
      {
        q: "Can I change plans?",
        a: "Yes — upgrade anytime; Shopify handles prorated billing.",
      },
    ],
    []
  );

  const recommendedPlanId =
    currentActivePlan === "studio"
      ? "studio"
      : currentActivePlan === "starter"
        ? "pro"
        : "pro";

  return (
    <Page fullWidth>
      <TitleBar title="Credits - VTON Magic" />
      <div className="app-container credits-page">
        <AdminPage
          title="Plans & credits"
          subtitle="Check usage, pick a plan, and keep try-on running on your store."
          actions={
            <div className="credits-balance-compact" aria-label="Credits available">
              <span className="credits-balance-compact-value">
                {currentCredits.toLocaleString("en-US")}
              </span>
              <span className="credits-balance-compact-label">credits left</span>
            </div>
          }
        >
          <AdminNotifications items={notifyItems} onDismiss={dismiss} />

        {(isOutOfCredits || isLowCredits) && (
          <div
            className={`credits-alert ${isOutOfCredits ? "credits-alert--critical" : "credits-alert--warning"}`}
            role="status"
          >
            <div>
              <strong>
                {isOutOfCredits
                  ? "You're out of credits"
                  : "Credits running low"}
              </strong>
              <p>
                {isOutOfCredits
                  ? "Shoppers can't generate new try-ons. Upgrade now to restore the experience immediately."
                  : `You have ${currentCredits} credit${currentCredits > 1 ? "s" : ""} left. Avoid downtime during your next campaign.`}
              </p>
            </div>
            {currentActivePlan !== "studio" && (
              <button
                type="button"
                className="credits-alert__cta"
                onClick={() => handleSubscriptionPurchase(recommendedPlanId)}
                disabled={isSubmitting || submittingPackId !== null}
              >
                Upgrade plan
              </button>
            )}
          </div>
        )}

        <div className="credits-funnel" aria-label="Credits checkout flow">
          <div className="credits-funnel-steps" aria-hidden="true">
            <span className="credits-funnel-step-dot is-active" />
            <span className="credits-funnel-step-dot" />
            <span className="credits-funnel-step-dot" />
          </div>
          <p className="credits-funnel-kicker">Step 1 · Your usage</p>

          <section className="credits-funnel-panel credits-funnel-panel--usage">
            <div className="credits-usage-strip">
              <div className="credits-usage-strip__meter">
                <div className="credits-usage-strip__head">
                  <span className="credits-usage-strip__label">This month</span>
                  <span className="credits-usage-strip__numbers">
                    <strong>{stats.monthlyUsage}</strong> / {monthlyQuota} used
                  </span>
                </div>
                <div className="credits-usage-meter credits-usage-meter--compact">
                  <div
                    className="credits-usage-meter__fill"
                    style={{ width: `${monthlyUsagePercent}%` }}
                  />
                </div>
                {monthlyUsagePercent >= 80 && (
                  <p className="credits-usage-strip__warn">Approaching your monthly limit</p>
                )}
              </div>
              {stats.totalTryons > 0 && (
                <p className="credits-usage-strip__stat">
                  Try-on → cart:{" "}
                  <strong>{conversionRate !== null ? `${conversionRate}%` : "—"}</strong>
                  <span className="credits-usage-strip__stat-muted">
                    {" "}
                    ({stats.totalAtc} ATC / {stats.totalTryons} try-ons)
                  </span>
                </p>
              )}
              <Link to="/app" className="credits-usage-strip__link">
                Open dashboard
              </Link>
            </div>
          </section>

          <p className="credits-funnel-kicker credits-funnel-kicker--plans">
            Step 2 · Choose a plan
          </p>
          <p className="credits-funnel-lead">
            1 credit = 1 try-on. Most stores upgrade to <strong>Pro</strong> before campaigns.
          </p>

        <div className="pricing-grid pricing-grid--compact credits-pricing-grid">
          {subscriptionPlans.map((plan) => {
            const isCurrentPlan = currentActivePlan === plan.id;
            const isFreePlan = plan.id === "free-installation-setup";
            const credits = creditsMap[plan.id] ?? 0;
            const pricePerCredit =
              plan.price > 0 && credits > 0
                ? (plan.price / credits).toFixed(2)
                : null;
            const isBestValue = plan.id === "pro";

            return (
              <div
                key={plan.id}
                className={`plan-card plan-card--compact ${plan.popular ? "featured" : ""} ${isCurrentPlan ? "current-plan" : ""} ${isBestValue ? "best-value" : ""}`}
              >
                {plan.popular && (
                  <div className="plan-badge plan-badge-popular">Most popular</div>
                )}
                {isBestValue && !plan.popular && (
                  <div className="plan-badge plan-badge-value">Best value</div>
                )}
                {isCurrentPlan && (
                  <div className="plan-badge plan-badge-current">Current</div>
                )}
                <div className="plan-name">{plan.name}</div>
                <p className="plan-tagline">{plan.description}</p>
                <div className="plan-price">
                  ${plan.price.toFixed(2)} <span>/ month</span>
                </div>
                {pricePerCredit && (
                  <p className="plan-per-credit">{pricePerCredit} $ / try-on</p>
                )}
                <p className="plan-highlight">{plan.highlight}</p>
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

          <p className="credits-funnel-kicker credits-funnel-kicker--help">Step 3 · Good to know</p>
          <details className="credits-funnel-help">
            <summary>How credits work</summary>
            <ul className="credits-funnel-help__list">
              {faqItems.map((item) => (
                <li key={item.q}>
                  <strong>{item.q}</strong> {item.a}
                </li>
              ))}
            </ul>
          </details>
        </div>

        <p className="credits-footnote">
          Cancel anytime · No setup fee · Monthly quota resets each billing cycle
        </p>
        </AdminPage>
      </div>
    </Page>
  );
}
