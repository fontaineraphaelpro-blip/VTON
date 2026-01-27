import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useEffect } from "react";
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

      // Check if user already has this plan
      try {
        const subscriptionQuery = `#graphql
          query {
            currentAppInstallation {
              activeSubscriptions {
                id
                name
                status
                test
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
        
        const activeSubscriptions = subscriptionData?.data?.currentAppInstallation?.activeSubscriptions || [];
        // En développement, accepter aussi les abonnements de test
        const allowTestSubscriptions = process.env.NODE_ENV !== "production";
        const activeSubscription = activeSubscriptions.find((sub: any) => 
          sub.status === "ACTIVE" && (allowTestSubscriptions || !sub.test)
        );

        if (activeSubscription) {
          const currentPlanName = activeSubscription.name.toLowerCase().replace(/\s+/g, '-');
          
          if (currentPlanName === planId) {
            return json({ 
              success: false, 
              error: `You already have the "${activeSubscription.name}" subscription. You cannot purchase it again.`,
            });
          }
        }
      } catch (subscriptionCheckError) {
        // Continue - allow purchase attempt
      }

      const { billing } = await authenticate.admin(request);
      const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || new URL(request.url).origin;
      const returnUrl = `${appUrl}/auth/billing-callback?shop=${encodeURIComponent(shop)}`;
      
      return await billing.request({
        plan: planId as any,
        isTest: true,
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
  const currentCredits = shop?.credits || 0;
  const [submittingPackId, setSubmittingPackId] = useState<string | null>(null);
  
  // State for managing notification visibility
  const [showErrorBanner, setShowErrorBanner] = useState(error !== null);
  const [showSuccessBanner, setShowSuccessBanner] = useState(subscriptionUpdated && planName !== null);
  const [showFetcherErrorBanner, setShowFetcherErrorBanner] = useState(false);

  const isSubmitting = fetcher.state === "submitting";
  
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

  const handleSubscriptionPurchase = (planId: string) => {
    if (isSubmitting || submittingPackId !== null) {
      return;
    }
    
    setSubmittingPackId(planId);
    
    const formData = new FormData();
    formData.append("intent", "purchase-subscription");
    formData.append("planId", planId);
    
    fetcher.submit(formData, { method: "post" });
  };

  const subscriptionPlans = [
    { 
      id: "free-installation-setup", 
      name: "Free Installation Setup", 
      price: 0.0, 
      description: "Free plan - 4 credits per month",
      popular: false 
    },
    { 
      id: "starter", 
      name: "Starter", 
      price: 29.0, 
      description: "100 generations per month",
      popular: false 
    },
    { 
      id: "pro", 
      name: "Pro", 
      price: 99.0, 
      description: "400 generations per month",
      popular: true 
    },
    { 
      id: "studio", 
      name: "Studio", 
      price: 399.0, 
      description: "2000 generations per month",
      popular: false 
    },
  ];

  return (
    <Page>
      <TitleBar title="Credits - VTON Magic" />
      <div className="app-container">
        {showErrorBanner && error && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="critical" title="Error" onDismiss={() => setShowErrorBanner(false)}>
              {error}
            </Banner>
          </div>
        )}

        {showSuccessBanner && subscriptionUpdated && planName && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="success" title="Subscription activated!" onDismiss={() => setShowSuccessBanner(false)}>
              Your <strong>{planName}</strong> subscription has been activated successfully. Your monthly credits have been updated.
            </Banner>
          </div>
        )}

        {showFetcherErrorBanner && (fetcher.data as any)?.error && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
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
          </div>
        )}

        {/* Credit system information */}
        <div style={{ marginBottom: "var(--spacing-lg)" }}>
          <Banner tone="info" title="💡 How do credits work?">
            <div style={{ lineHeight: "1.6" }}>
              <p style={{ margin: "0 0 8px 0" }}>
                Credits are automatically reset each month based on your subscription plan.
              </p>
              <p style={{ margin: "8px 0 0 0" }}>
                <strong>Important:</strong> Unused credits are not carried over to the next month. 
                Each month, your balance is reset to zero and you receive a new credit quota according to your active plan.
              </p>
            </div>
          </Banner>
        </div>

        <header className="app-header">
          <h1 className="app-title">Get More Credits</h1>
          <p className="app-subtitle">
            Unlock unlimited virtual try-ons and boost your sales with AI-powered fashion visualization
          </p>
        </header>

        <div className="credits-balance">
          <div>
            <div className="credits-amount">{currentCredits.toLocaleString("en-US")}</div>
            <div className="credits-label">Credits available</div>
          </div>
        </div>

        {/* Value Proposition Section */}
        <div className="conversion-hero" style={{ marginBottom: "48px", textAlign: "center" }}>
          <h2 style={{ fontSize: "32px", fontWeight: "800", marginBottom: "16px", letterSpacing: "-0.02em", color: "var(--color-text-primary)" }}>
            Choose Your Plan
          </h2>
          <p style={{ fontSize: "18px", color: "var(--color-text-secondary)", marginBottom: "8px", fontWeight: "500" }}>
            Start generating stunning virtual try-ons today
          </p>
          <p style={{ fontSize: "15px", color: "var(--color-text-tertiary)", marginBottom: "0" }}>
            All plans include instant generation, unlimited products, and cancel anytime
          </p>
        </div>
          <div className="pricing-grid">
            {subscriptionPlans.map((plan) => {
              const isCurrentPlan = currentActivePlan === plan.id;
              const isFreePlan = plan.id === "free-installation-setup";
              
              // Calculate value metrics (visual only - no logic change)
              const creditsMap: Record<string, number> = {
                "free-installation-setup": 4,
                "starter": 100,
                "pro": 400,
                "studio": 2000,
              };
              const credits = creditsMap[plan.id] || 0;
              const pricePerCredit = plan.price > 0 && credits > 0 ? (plan.price / credits).toFixed(3) : "0";
              const isBestValue = plan.id === "pro"; // Pro is best value
              
              return (
                <div key={plan.id} className={`plan-card ${plan.popular ? 'featured' : ''} ${isCurrentPlan ? 'current-plan' : ''} ${isBestValue ? 'best-value' : ''}`}>
                  {plan.popular && (
                    <div className="plan-badge plan-badge-popular">⭐ Most Popular</div>
                  )}
                  {isBestValue && !plan.popular && (
                    <div className="plan-badge plan-badge-value">💰 Best Value</div>
                  )}
                  {isCurrentPlan && (
                    <div className="plan-badge plan-badge-current">✓ Current Plan</div>
                  )}
                  <div className="plan-name">{plan.name}</div>
                  <div className="plan-price">
                    ${plan.price.toFixed(2)} <span>/ month</span>
                  </div>
                  {plan.price > 0 && credits > 0 && (
                    <div className="plan-value-indicator">
                      <span className="plan-value-text">${pricePerCredit}</span>
                      <span className="plan-value-label">per generation</span>
                    </div>
                  )}
                  <div className="plan-features">
                    <div className="plan-feature plan-feature-highlight">{plan.description}</div>
                    <div className="plan-feature">✓ Instant AI generation</div>
                    <div className="plan-feature">✓ Unlimited products</div>
                    <div className="plan-feature">✓ Cancel anytime</div>
                    <div className="plan-feature">✓ No setup fees</div>
                  </div>
                  <div className="plan-cta">
                    {isCurrentPlan ? (
                      <button 
                        className="plan-button plan-button-current"
                        disabled={true}
                      >
                        ✓ Current Plan
                      </button>
                    ) : isFreePlan ? (
                      <button 
                        className="plan-button plan-button-disabled"
                        disabled={true}
                      >
                        Already Included
                      </button>
                    ) : (
                      <button 
                        className={`plan-button ${plan.popular ? 'plan-button-featured' : ''}`}
                        onClick={() => handleSubscriptionPurchase(plan.id)}
                        disabled={isSubmitting || submittingPackId !== null}
                      >
                        {isSubmitting && submittingPackId === plan.id ? "Processing..." : plan.popular ? "Get Started →" : "Subscribe Now"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Reassurance Section */}
          <div className="conversion-reassurance" style={{ marginTop: "64px", padding: "40px", background: "linear-gradient(to bottom, #f9fafb 0%, #ffffff 100%)", borderRadius: "16px", border: "1.5px solid var(--color-border)" }}>
            <div style={{ textAlign: "center", maxWidth: "800px", margin: "0 auto" }}>
              <h3 style={{ fontSize: "24px", fontWeight: "700", marginBottom: "16px", color: "var(--color-text-primary)" }}>
                💯 100% Risk-Free
              </h3>
              <p style={{ fontSize: "16px", color: "var(--color-text-secondary)", lineHeight: "1.7", marginBottom: "24px" }}>
                Cancel your subscription at any time. No questions asked. Your credits reset monthly, so you always get fresh value.
              </p>
              <div style={{ display: "flex", justifyContent: "center", gap: "32px", flexWrap: "wrap", marginTop: "32px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--color-primary)", marginBottom: "4px" }}>✓</div>
                  <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", fontWeight: "600" }}>Instant Setup</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--color-primary)", marginBottom: "4px" }}>✓</div>
                  <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", fontWeight: "600" }}>Cancel Anytime</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--color-primary)", marginBottom: "4px" }}>✓</div>
                  <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", fontWeight: "600" }}>No Hidden Fees</div>
                </div>
              </div>
            </div>
          </div>

      </div>
    </Page>
  );
}
