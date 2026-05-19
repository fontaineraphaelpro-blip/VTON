import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigation } from "@remix-run/react";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Page,
  Button,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop, query } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

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

    await ensureTables();
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
        
        // Attendre un peu si la session n'est pas disponible
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
            
            return json({
              shop: updatedShopData || null,
              subscriptionUpdated: true,
              planName: planName,
              currentActivePlan: planName,
            });
          }
        }
      } catch {
        // Subscription check failed
      }
    }

    // Always sync database with Shopify subscriptions
    let currentActivePlan: string | null = null;
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

    return json({
      shop: shopData || null,
      currentActivePlan: currentActivePlan,
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
  
  const fetcher = useFetcher<typeof action>();
  const navigation = useNavigation();
  const currentCredits = shop?.credits || 0;
  const [submittingPackId, setSubmittingPackId] = useState<string | null>(null);
  
  // State for managing notification visibility
  const [showErrorBanner, setShowErrorBanner] = useState(error !== null);
  const [showSuccessBanner, setShowSuccessBanner] = useState(subscriptionUpdated && planName !== null);
  const [showFetcherErrorBanner, setShowFetcherErrorBanner] = useState(false);

  const isSubmitting = fetcher.state === "submitting" || navigation.state === "submitting";
  
  // Update banner visibility when fetcher error appears
  useEffect(() => {
    if ((fetcher.data as any)?.error) {
      setShowFetcherErrorBanner(true);
    }
  }, [(fetcher.data as any)?.error]);

  useEffect(() => {
    if (fetcher.state === "idle" && submittingPackId !== null) {
      setSubmittingPackId(null);
    }
  }, [fetcher.state, submittingPackId]);

  useEffect(() => {
    if (subscriptionUpdated && planName) {
      const timer = setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('charge_id');
        window.location.href = url.toString();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [subscriptionUpdated, planName]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const chargeId = url.searchParams.get("charge_id");
    if (chargeId && !subscriptionUpdated) {
      const timer = setTimeout(() => {
        window.location.reload();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [subscriptionUpdated]);

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
      },
      {
        id: "starter",
        name: "Starter",
        price: 29.0,
        description: "100 try-ons / month",
        popular: false,
      },
      {
        id: "pro",
        name: "Pro",
        price: 99.0,
        description: "400 try-ons / month",
        popular: true,
      },
      {
        id: "studio",
        name: "Studio",
        price: 399.0,
        description: "2,000 try-ons / month",
        popular: false,
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

  const hasAlerts =
    (showErrorBanner && error) ||
    (showSuccessBanner && subscriptionUpdated && planName) ||
    (showFetcherErrorBanner && (fetcher.data as any)?.error);

  return (
    <Page fullWidth>
      <TitleBar title="Credits - VTON Magic" />
      <div className="app-container credits-page">
        {hasAlerts && (
          <div className="credits-alerts">
        {showErrorBanner && error && (
            <Banner tone="critical" title="Error" onDismiss={() => setShowErrorBanner(false)}>
              {error}
            </Banner>
        )}

        {showSuccessBanner && subscriptionUpdated && planName && (
            <Banner tone="success" title="Subscription activated!" onDismiss={() => setShowSuccessBanner(false)}>
              Your <strong>{planName}</strong> subscription has been activated successfully. Your monthly credits have been updated.
            </Banner>
        )}

        {showFetcherErrorBanner && (fetcher.data as any)?.error && (
            <Banner 
              tone="critical" 
              title={(fetcher.data as any)?.requiresAuth ? "Authentication required" : "Error"}
              onDismiss={() => {
                setShowFetcherErrorBanner(false);
                fetcher.load('/app/credits');
              }}
              action={(fetcher.data as any)?.requiresAuth ? {
                content: (fetcher.data as any)?.reauthUrl ? "Re-authenticate" : "Refresh page",
                onAction: () => {
                  if ((fetcher.data as any)?.reauthUrl) {
                    try {
                      if (window.top && window.top !== window) {
                        window.top.location.href = (fetcher.data as any).reauthUrl;
                      } else {
                        window.location.href = (fetcher.data as any).reauthUrl;
                      }
                    } catch (e) {
                      window.location.href = (fetcher.data as any).reauthUrl;
                    }
                  } else {
                    try {
                      if (window.top && window.top !== window) {
                        window.top.location.reload();
                      } else {
                        window.location.reload();
                      }
                    } catch (e) {
                      window.location.reload();
                    }
                  }
                },
              } : undefined}
            >
              {(fetcher.data as any)?.error}
            </Banner>
        )}
          </div>
        )}

        <header className="credits-top">
          <div className="credits-top-main">
            <h1 className="credits-top-title">Plans &amp; credits</h1>
            <p className="credits-top-hint">
              Monthly quota resets each cycle. Unused credits do not roll over.
            </p>
          </div>
          <div className="credits-balance-compact" aria-label="Credits available">
            <span className="credits-balance-compact-value">
              {currentCredits.toLocaleString("en-US")}
            </span>
            <span className="credits-balance-compact-label">credits left</span>
          </div>
        </header>

        <div className="pricing-grid pricing-grid--compact">
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
                  <div className="plan-badge plan-badge-popular">Popular</div>
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
                  ${plan.price.toFixed(2)} <span>/ mo</span>
                </div>
                {pricePerCredit && (
                  <p className="plan-per-credit">${pricePerCredit} per try-on</p>
                )}
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

        <p className="credits-footnote">
          Cancel anytime · No setup fees · Monthly credit reset
        </p>
      </div>
    </Page>
  );
}
