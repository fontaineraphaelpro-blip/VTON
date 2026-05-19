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
        features: [
          "Product page widget",
          "Automatic installation",
          "Per-product on/off toggle",
        ],
      },
      {
        id: "starter",
        name: "Starter",
        price: 29.0,
        description: "100 try-ons / month",
        popular: false,
        features: [
          "Best for catalogs under 50 SKUs",
          "Try-on session history",
          "Email support",
        ],
      },
      {
        id: "pro",
        name: "Pro",
        price: 99.0,
        description: "400 try-ons / month",
        popular: true,
        features: [
          "Best value per try-on",
          "Campaign & ad traffic ready",
          "Conversion stats in dashboard",
        ],
      },
      {
        id: "studio",
        name: "Studio",
        price: 399.0,
        description: "2,000 try-ons / month",
        popular: false,
        features: [
          "High-traffic fashion brands",
          "Seasonal peaks without cutoff",
          "Lowest cost per try-on",
        ],
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

  const benefits = useMemo(
    () => [
      {
        title: "Fewer returns",
        body: "Shoppers see the product on themselves before buying — less guesswork, fewer size-related returns.",
        icon: "↩",
      },
      {
        title: "More engagement",
        body: "Virtual try-on keeps visitors on the product page longer than static images alone.",
        icon: "⏱",
      },
      {
        title: "Higher-intent carts",
        body: "Each credit powers one AI session that moves shoppers closer to Add to cart.",
        icon: "🛒",
      },
      {
        title: "Measurable ROI",
        body: "Track try-ons and add-to-cart events in your dashboard to see what converts.",
        icon: "📈",
      },
    ],
    []
  );

  const faqItems = useMemo(
    () => [
      {
        q: "What happens when I run out of credits?",
        a: "The try-on button stays visible, but generation is paused until your monthly renewal or a plan upgrade.",
      },
      {
        q: "Do unused credits roll over?",
        a: "No — your quota resets each Shopify billing cycle. Pick a plan that matches your monthly traffic.",
      },
      {
        q: "Does one credit equal one generation?",
        a: "Yes. Every successful virtual try-on uses 1 credit, regardless of catalog size.",
      },
      {
        q: "Can I change plans later?",
        a: "Yes. Upgrade anytime; Shopify prorates billing automatically.",
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
          subtitle="Every credit powers one AI try-on on your store — scale where shoppers decide to buy."
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

        <section className="credits-conv-hero credits-conv-hero--elevated">
          <div className="credits-conv-hero__main">
            <p className="credits-conv-hero__eyebrow">Your store performance</p>
            <h2 className="credits-conv-hero__title">
              Turn product views into confident purchases
            </h2>
            <p className="credits-conv-hero__lead">
              Fashion brands using virtual try-on see stronger product-page engagement and
              higher-intent add-to-cart behavior.
            </p>
            <div className="credits-conv-hero__stats">
              <div className="credits-stat-card">
                <span className="credits-stat-card__value">
                  {stats.totalTryons.toLocaleString("en-US")}
                </span>
                <span className="credits-stat-card__label">Total try-ons</span>
              </div>
              <div className="credits-stat-card">
                <span className="credits-stat-card__value">
                  {stats.totalAtc.toLocaleString("en-US")}
                </span>
                <span className="credits-stat-card__label">Add-to-cart tracked</span>
              </div>
              <div className="credits-stat-card credits-stat-card--highlight">
                <span className="credits-stat-card__value">
                  {conversionRate !== null ? `${conversionRate}%` : "—"}
                </span>
                <span className="credits-stat-card__label">Try-on → cart rate</span>
              </div>
            </div>
            <Link to="/app" className="credits-conv-hero__link">
              View full dashboard →
            </Link>
          </div>
          <div className="credits-conv-hero__side">
            <h3 className="credits-conv-panel__title">Usage this month</h3>
            <div className="credits-usage-meter">
              <div
                className="credits-usage-meter__fill"
                style={{ width: `${monthlyUsagePercent}%` }}
              />
            </div>
            <p className="credits-usage-meter__text">
              <strong>{stats.monthlyUsage}</strong> / {monthlyQuota} credits used
              {monthlyUsagePercent >= 80 && (
                <span className="credits-usage-meter__warn"> — approaching limit</span>
              )}
            </p>
            <ul className="credits-roi-list">
              <li>
                <span>1 credit</span>
                <span>= 1 shopper tries your product with AI</span>
              </li>
              <li>
                <span>Pro plan</span>
                <span>≈ $0.25 per try-on (vs $0.29 on Starter)</span>
              </li>
              <li>
                <span>No credits</span>
                <span>try-on pauses → higher bounce risk</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="credits-pricing-intro" aria-label="Choose a plan">
          <div className="credits-pricing-intro__copy">
            <h2 className="credits-section-title credits-section-title--flush">
              Pick the plan that matches your traffic
            </h2>
            <p>
              Upgrade before you run out. Most growing stores choose <strong>Pro</strong> for the
              best balance of volume and cost per try-on.
            </p>
          </div>
          <div className="credits-pricing-intro__chips">
            <span className="credits-chip">1 credit = 1 try-on</span>
            <span className="credits-chip credits-chip--accent">Cancel anytime</span>
            <span className="credits-chip">Billed via Shopify</span>
          </div>
        </section>

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
                <ul className="plan-features-list">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
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

        <section className="credits-benefits" aria-label="Why credits matter">
          <h2 className="credits-section-title">Why invest in credits?</h2>
          <div className="credits-benefits__grid">
            {benefits.map((item) => (
              <article key={item.title} className="credits-benefit-card">
                <span className="credits-benefit-card__icon" aria-hidden>
                  {item.icon}
                </span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="credits-social-proof">
          <div className="credits-proof-card">
            <p className="credits-proof-card__quote">
              &ldquo;After enabling try-on, shoppers spend more time on the product page and ask
              fewer sizing questions before checkout.&rdquo;
            </p>
            <p className="credits-proof-card__meta">— Typical results, Shopify fashion brands</p>
          </div>
          <div className="credits-proof-metrics">
            <div>
              <strong>+40%</strong>
              <span>time on product page</span>
            </div>
            <div>
              <strong>−15%</strong>
              <span>size &amp; style returns</span>
            </div>
            <div>
              <strong>24/7</strong>
              <span>fitting room without a physical booth</span>
            </div>
          </div>
        </section>

        <section className="credits-faq" aria-label="Frequently asked questions">
          <h2 className="credits-section-title">FAQ</h2>
          <div className="credits-faq__grid">
            {faqItems.map((item) => (
              <details key={item.q} className="credits-faq__item">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <p className="credits-footnote">
          Cancel anytime · No setup fee · Monthly quota resets each billing cycle
        </p>
        </AdminPage>
      </div>
    </Page>
  );
}
