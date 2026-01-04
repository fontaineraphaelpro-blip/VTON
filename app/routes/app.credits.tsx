import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { useState, useEffect, useRef } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  TextField,
  Box,
  Divider,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

// Plans tarifaires optimisés pour Virtual Try-On
const PRICING_PLANS = [
  {
    id: "free",
    name: "Free",
    credits: 2,
    price: 0.00,
    pricePerCredit: 0.00,
    description: "Test 2 try-ons per month with watermark to discover the tool",
    highlight: false,
    popular: false,
    badge: "Trial",
    monthlyQuota: 2,
    hasWatermark: true,
  },
  {
    id: "starter",
    name: "Starter",
    credits: 60,
    price: 19.00,
    pricePerCredit: 0.317,
    description: "60 try-ons per month - Perfect to get started",
    highlight: false,
    popular: true,
    badge: "Popular",
    monthlyQuota: 60,
    hasWatermark: false,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 150,
    price: 49.00,
    pricePerCredit: 0.327,
    description: "150 try-ons per month - For active stores",
    highlight: true,
    popular: false,
    badge: "Recommended",
    monthlyQuota: 150,
    hasWatermark: false,
  },
  {
    id: "studio",
    name: "Studio",
    credits: 300,
    price: 99.00,
    pricePerCredit: 0.33,
    description: "300 try-ons per month - For very active stores",
    highlight: false,
    popular: false,
    badge: "Premium",
    monthlyQuota: 300,
    hasWatermark: false,
  },
];

// Custom Flexible Plan - Prix calculé automatiquement pour garantir au moins x2 de marge
// Prix minimum par try-on pour le plan custom (basé sur le prix du plan Studio)
const MIN_CUSTOM_PRICE_PER_CREDIT = 0.33; // Prix minimum par try-on (garantit x2 marge)

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    
    // Logs de diagnostic CRITIQUES
    console.log("[Credits Loader] Session check:", {
      shop: session?.shop || "NULL",
      hasAccessToken: !!session?.accessToken,
      isOnline: session?.isOnline,
      userId: (session as any)?.userId,
    });
    
    if (!session || !session.shop) {
      console.error("[Credits Loader] ❌ Invalid session - shop is null!");
      return json({
        shop: null,
        error: "Invalid session. Please refresh the page.",
      });
    }
    
    const shop = session.shop;

    await ensureTables();
    const shopData = await getShop(shop);

    // Handle return from Shopify payment (app purchase one-time charge)
    const url = new URL(request.url);
    const purchaseSuccess = url.searchParams.get("purchase");
    const packId = url.searchParams.get("pack");
    const monthlyQuotaParam = url.searchParams.get("monthlyQuota");

    if (purchaseSuccess === "success" && packId) {
      // Find the pack that was purchased
      const pack = PRICING_PLANS.find((p) => p.id === packId);
      
      if (pack && shopData) {
        // For monthly subscription plans, set the monthly quota instead of adding credits
        const monthlyQuota = (pack as any).monthlyQuota || pack.credits;
        
        await upsertShop(shop, { monthlyQuota: monthlyQuota });
        
        console.log(`[Credits] Activated plan ${packId} with monthly quota ${monthlyQuota}`, {
          shop,
          packId,
          monthlyQuota,
        });

        // Reload shop data after updating plan
        const updatedShopData = await getShop(shop);
        return json({
          shop: updatedShopData || null,
          purchaseSuccess: true,
          planActivated: packId,
          monthlyQuota: monthlyQuota,
        });
      } else if (packId === "custom-flexible" && monthlyQuotaParam) {
        // Handle custom flexible plan
        const customQuota = parseInt(monthlyQuotaParam);
        if (customQuota >= 301) {
          await upsertShop(shop, { monthlyQuota: customQuota });
          
          const updatedShopData = await getShop(shop);
          return json({
            shop: updatedShopData || null,
            purchaseSuccess: true,
            planActivated: "custom-flexible",
            monthlyQuota: customQuota,
          });
        }
      }
    }

    return json({
      shop: shopData || null,
    });
  } catch (error) {
    console.error("[Credits Loader] ❌ Error:", error);
    // Si c'est une Response (redirection d'auth), la propager
    if (error instanceof Response) {
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
      
      // Logs de diagnostic CRITIQUES
      console.log("[Credits Action] ✅ Authentication successful:", {
        shop: session?.shop || "NULL",
        hasAccessToken: !!session?.accessToken,
        isOnline: session?.isOnline,
        userId: (session as any)?.userId,
        hasAdmin: !!admin,
      });
      
    } catch (authError) {
      // Si authenticate.admin lance une Response (redirection), la gérer
      if (authError instanceof Response) {
        if (authError.status === 401 || authError.status === 302) {
          const reauthUrl = authError.headers.get('x-shopify-api-request-failure-reauthorize-url') || 
                           authError.headers.get('location');
          console.error("[Credits Action] ❌ Authentication required (401/302):", { 
            status: authError.status, 
            reauthUrl,
            headers: Object.fromEntries(authError.headers.entries()),
          });
          return json({ 
            success: false, 
            error: "Your session has expired. Please refresh the page to re-authenticate.",
            requiresAuth: true,
            reauthUrl: reauthUrl || null,
          });
        }
        // Pour toute autre Response, retourner une erreur JSON
        console.error("[Credits Action] ❌ Authentication error:", authError.status);
        return json({ 
          success: false, 
            error: `Authentication error (${authError.status}). Please refresh the page.`,
          requiresAuth: true,
        });
      }
      // Pour les autres erreurs, les propager
      console.error("[Credits Action] ❌ Authentication error (non-Response):", authError);
      throw authError;
    }
    
    // Vérifier que la session est valide
    if (!session || !session.shop) {
      console.error("[Credits Action] ❌ Invalid session - shop is null!", {
        hasSession: !!session,
        shop: session?.shop,
        accessToken: session?.accessToken ? "EXISTS" : "MISSING",
      });
      return json({ 
        success: false, 
        error: "Session invalide. Veuillez rafraîchir la page.",
        requiresAuth: true,
      });
    }
    
    if (!admin) {
      console.error("[Credits Action] ❌ Admin client is missing!");
      return json({ 
        success: false, 
            error: "GraphQL client not available. Please refresh the page.",
        requiresAuth: true,
      });
    }
    
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");
    
    console.log("[Credits] Action called", { intent, shop });

  if (intent === "purchase-credits") {
    const packId = formData.get("packId") as string;
    const pack = PRICING_PLANS.find((p) => p.id === packId);

    if (!pack) {
      return json({ 
        success: false, 
        error: "Plan not found" 
      });
    }

    try {
      const monthlyQuota = (pack as any).monthlyQuota || pack.credits;
      
      // Skip payment for free plan
      if (pack.price === 0) {
        await upsertShop(shop, { monthlyQuota: monthlyQuota });
        return json({ 
          success: true, 
          message: `Plan ${pack.name} activated successfully! Monthly quota: ${monthlyQuota} try-ons/month.`,
          planActivated: packId,
          monthlyQuota: monthlyQuota,
        });
      }
      
      // FOR TESTING: Since this is a Managed Pricing App, we activate plans directly in database
      // In production, Shopify handles billing automatically via App Store listing
      // For testing purposes, we activate the plan directly
      if (process.env.NODE_ENV !== "production" || process.env.ENABLE_DIRECT_PLAN_ACTIVATION === "true") {
        await upsertShop(shop, { monthlyQuota: monthlyQuota });
        return json({ 
          success: true, 
          message: `Plan ${pack.name} activated successfully! Monthly quota: ${monthlyQuota} try-ons/month. (Test mode - direct activation)`,
          planActivated: packId,
          monthlyQuota: monthlyQuota,
        });
      }
      
      // Create recurring subscription for paid plans (only if not Managed Pricing App)
      const returnUrl = new URL(request.url).origin + `/app/credits?pack=${packId}&monthlyQuota=${monthlyQuota}`;
      
      const response = await admin.graphql(
        `#graphql
          mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
            appSubscriptionCreate(
              name: $name
              lineItems: $lineItems
              returnUrl: $returnUrl
              test: $test
            ) {
              appSubscription {
                id
                status
              }
              confirmationUrl
              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          variables: {
            name: `${pack.name} Plan - ${monthlyQuota} try-ons/month`,
            lineItems: [
              {
                plan: {
                  appRecurringPricingDetails: {
                    price: {
                      amount: pack.price,
                      currencyCode: "EUR"
                    },
                    interval: "EVERY_30_DAYS"
                  }
                }
              }
            ],
            returnUrl: returnUrl,
            test: process.env.NODE_ENV !== "production"
          }
        }
      );

      // Check if response is OK
      if (!response.ok) {
        if (response.status === 401) {
          const reauthUrl = response.headers.get('x-shopify-api-request-failure-reauthorize-url');
          console.error("[Credits] Authentication required (401) for subscription creation");
          return json({ 
            success: false, 
            error: "Your session has expired. Please refresh the page to re-authenticate.",
            requiresAuth: true,
            reauthUrl: reauthUrl || null,
          });
        }
        const errorText = await response.text().catch(() => `HTTP ${response.status} ${response.statusText}`);
        console.error("[Credits] GraphQL request failed:", response.status, errorText);
        return json({ 
          success: false, 
          error: `Shopify API error (${response.status}): ${errorText.substring(0, 200)}` 
        });
      }

      const responseData = await response.json();
      
      if (responseData.data?.appSubscriptionCreate?.userErrors?.length > 0) {
        const errors = responseData.data.appSubscriptionCreate.userErrors;
        const errorMessages = errors.map((e: any) => e.message).join(", ");
        console.error("[Credits] GraphQL errors:", errors);
        
        // If error is about Managed Pricing, activate plan directly for testing
        if (errorMessages.includes("tarification gérée") || errorMessages.includes("Managed Pricing") || errorMessages.includes("Billing API")) {
          console.log("[Credits] Managed Pricing detected, activating plan directly for testing");
          await upsertShop(shop, { monthlyQuota: monthlyQuota });
          return json({ 
            success: true, 
            message: `Plan ${pack.name} activated successfully! Monthly quota: ${monthlyQuota} try-ons/month. (Direct activation - Managed Pricing App)`,
            planActivated: packId,
            monthlyQuota: monthlyQuota,
          });
        }
        
        return json({ 
          success: false, 
          error: errorMessages
        });
      }

      const confirmationUrl = responseData.data?.appSubscriptionCreate?.confirmationUrl;
      
      if (!confirmationUrl) {
        console.error("[Credits] No confirmation URL returned:", responseData);
        return json({ 
          success: false, 
          error: "Failed to create subscription. Please try again." 
        });
      }

      // Redirect to Shopify subscription confirmation page
      return redirect(confirmationUrl);
    } catch (error) {
      console.error("[Credits] Error creating subscription:", error);
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Error creating subscription" 
      });
    }
  }
  
  if (intent === "custom-pack") {
    const customCredits = parseInt(formData.get("customCredits") as string);
    if (customCredits && customCredits >= 301) {
      try {
        // FOR TESTING: Since this is a Managed Pricing App, we activate plans directly in database
        // In production, Shopify handles billing automatically via App Store listing
        // For testing purposes, we activate the plan directly
        if (process.env.NODE_ENV !== "production" || process.env.ENABLE_DIRECT_PLAN_ACTIVATION === "true") {
          await upsertShop(shop, { monthlyQuota: customCredits });
          return json({ 
            success: true, 
            message: `Custom Flexible Plan activated successfully! Monthly quota: ${customCredits} try-ons/month. (Test mode - direct activation)`,
            planActivated: "custom-flexible",
            monthlyQuota: customCredits,
          });
        }
        
        // Calculate price for custom plan (at least x2 margin)
        const calculatedPrice = customCredits * MIN_CUSTOM_PRICE_PER_CREDIT;
        const returnUrl = new URL(request.url).origin + `/app/credits?purchase=success&pack=custom-flexible&monthlyQuota=${customCredits}`;
        
        // Create recurring subscription for custom plan
        const response = await admin.graphql(
          `#graphql
            mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
              appSubscriptionCreate(
                name: $name
                lineItems: $lineItems
                returnUrl: $returnUrl
                test: $test
              ) {
                appSubscription {
                  id
                  status
                }
                confirmationUrl
                userErrors {
                  field
                  message
                }
              }
            }
          `,
          {
            variables: {
              name: `Custom Flexible Plan - ${customCredits} try-ons/month`,
              lineItems: [
                {
                  plan: {
                    appRecurringPricingDetails: {
                      price: {
                        amount: calculatedPrice,
                        currencyCode: "EUR"
                      },
                      interval: "EVERY_30_DAYS"
                    }
                  }
                }
              ],
              returnUrl: returnUrl,
              test: process.env.NODE_ENV !== "production"
            }
          }
        );

        // Check if response is OK
        if (!response.ok) {
          if (response.status === 401) {
            const reauthUrl = response.headers.get('x-shopify-api-request-failure-reauthorize-url');
            console.error("[Credits] Authentication required (401) for custom subscription creation");
            return json({ 
              success: false, 
              error: "Your session has expired. Please refresh the page to re-authenticate.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          const errorText = await response.text().catch(() => `HTTP ${response.status} ${response.statusText}`);
          console.error("[Credits] GraphQL request failed:", response.status, errorText);
          return json({ 
            success: false, 
            error: `Shopify API error (${response.status}): ${errorText.substring(0, 200)}` 
          });
        }

        const responseData = await response.json();
        
        if (responseData.data?.appSubscriptionCreate?.userErrors?.length > 0) {
          const errors = responseData.data.appSubscriptionCreate.userErrors;
          const errorMessages = errors.map((e: any) => e.message).join(", ");
          console.error("[Credits] GraphQL errors:", errors);
          
          // If error is about Managed Pricing, activate plan directly for testing
          if (errorMessages.includes("tarification gérée") || errorMessages.includes("Managed Pricing") || errorMessages.includes("Billing API")) {
            console.log("[Credits] Managed Pricing detected for custom plan, activating directly for testing");
            await upsertShop(shop, { monthlyQuota: customCredits });
            return json({ 
              success: true, 
              message: `Custom Flexible Plan activated successfully! Monthly quota: ${customCredits} try-ons/month. (Direct activation - Managed Pricing App)`,
              planActivated: "custom-flexible",
              monthlyQuota: customCredits,
            });
          }
          
          return json({ 
            success: false, 
            error: errorMessages
          });
        }

        const confirmationUrl = responseData.data?.appSubscriptionCreate?.confirmationUrl;
        
        if (!confirmationUrl) {
          console.error("[Credits] No confirmation URL returned:", responseData);
          return json({ 
            success: false, 
            error: "Failed to create subscription. Please try again." 
          });
        }

        // Redirect to Shopify subscription confirmation page
        return redirect(confirmationUrl);
      } catch (error) {
        console.error("[Credits] Error creating custom subscription:", error);
            return json({ 
              success: false, 
          error: error instanceof Error ? error.message : "Error creating subscription" 
        });
      }
      } else {
      return json({ success: false, error: "Minimum 301 try-ons required for Custom Flexible plan" });
    }
  }

  return json({ success: false, error: "Invalid intent" });
  } catch (error) {
    // Gérer toutes les erreurs, y compris les Responses de redirection
    console.error("[Credits] Error in action:", error);
    
    // Si c'est une Response de redirection (auth requise)
    if (error instanceof Response) {
      if (error.status === 401 || error.status === 302) {
        const reauthUrl = error.headers.get('x-shopify-api-request-failure-reauthorize-url') || 
                         error.headers.get('location');
        console.error("[Credits] Authentication required (Response)", { status: error.status, reauthUrl });
        return json({ 
          success: false, 
            error: "Your session has expired. Please refresh the page to re-authenticate.",
          requiresAuth: true,
          reauthUrl: reauthUrl || null,
        });
      }
      // Pour toute autre Response, retourner une erreur JSON
      return json({ 
        success: false, 
            error: `Server error (${error.status}). Please try again.`,
        requiresAuth: error.status === 401 || error.status === 302,
      });
    }
    
    // Pour les autres erreurs
    return json({ 
      success: false, 
            error: error instanceof Error ? error.message : "An error occurred. Please try again.",
      requiresAuth: false,
    });
  }
};

export default function Credits() {
  console.log("[Credits] Component rendering");
  
  const loaderData = useLoaderData<typeof loader>();
  const shop = (loaderData as any)?.shop || null;
  const error = (loaderData as any)?.error || null;
  const purchaseSuccess = (loaderData as any)?.purchaseSuccess || false;
  const planActivated = (loaderData as any)?.planActivated || null;
  const monthlyQuota = (loaderData as any)?.monthlyQuota || null;
  console.log("[Credits] Loader data:", { hasShop: !!shop, hasError: !!error, credits: shop?.credits, shopMonthlyQuota: shop?.monthly_quota, purchaseSuccess, planActivated, loaderMonthlyQuota: monthlyQuota });
  
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const currentCredits = shop?.credits || 0;
  const [customAmount, setCustomAmount] = useState("301");
  const [submittingPackId, setSubmittingPackId] = useState<string | null>(null);
  const [showSuccessBanner, setShowSuccessBanner] = useState(true);
  const [showErrorBanner, setShowErrorBanner] = useState(true);
  
  // Utiliser useRef pour stocker une référence stable à revalidator
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;

  const isSubmitting = fetcher.state === "submitting";
  console.log("[Credits] Component state initialized", { 
    isSubmitting, 
    fetcherState: fetcher.state,
    fetcherData: fetcher.data,
    submittingPackId 
  });

  // Determine which plan is currently active based on monthly_quota
  const currentMonthlyQuota = shop?.monthly_quota || 0;
  const getActivePlanId = () => {
    if (!currentMonthlyQuota) return "free"; // Default to free if no quota
    // Find the plan that matches the current monthly quota
    const matchingPlan = PRICING_PLANS.find(plan => (plan as any).monthlyQuota === currentMonthlyQuota);
    if (matchingPlan) return matchingPlan.id;
    // If quota is >= 301, it's a custom flexible plan
    if (currentMonthlyQuota >= 301) return "custom-flexible";
    // Default to free
    return "free";
  };
  const activePlanId = getActivePlanId();

  // Recharger les données après activation d'un plan
  useEffect(() => {
    if (fetcher.data?.success) {
      // Recharger les données après activation réussie
      setTimeout(() => {
        revalidator.revalidate();
      }, 500);
    }
  }, [fetcher.data?.success, revalidator]);

  // Auto-dismiss success banner after 5 seconds
  useEffect(() => {
    if ((purchaseSuccess || fetcher.data?.success) && (planActivated || (fetcher.data as any)?.planActivated)) {
      setShowSuccessBanner(true);
      const timer = setTimeout(() => {
        setShowSuccessBanner(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [purchaseSuccess, fetcher.data?.success, planActivated]);

  // Auto-dismiss error banner after 8 seconds
  useEffect(() => {
    if ((fetcher.data as any)?.error) {
      setShowErrorBanner(true);
      const timer = setTimeout(() => {
        setShowErrorBanner(false);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [(fetcher.data as any)?.error]);

  // Reset submittingPackId when fetcher completes
  useEffect(() => {
    if (fetcher.state === "idle" && submittingPackId !== null) {
      setSubmittingPackId(null);
    }
  }, [fetcher.state, submittingPackId]);

  const handlePurchase = (packId: string) => {
    console.log("[Credits] handlePurchase called", { packId, isSubmitting, submittingPackId, fetcherState: fetcher.state });
    
    if (isSubmitting || submittingPackId !== null) {
      console.warn("[Credits] Purchase already in progress, ignoring click");
      return;
    }
    
    setSubmittingPackId(packId);
    
    const formData = new FormData();
    formData.append("intent", "purchase-credits");
    formData.append("packId", packId);
    
    console.log("[Credits] Submitting purchase request", { packId });
    fetcher.submit(formData, { method: "post" });
  };

  const handleCustomPurchase = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const credits = parseInt(formData.get("customCredits") as string);
    
    if (!credits || credits < 301) {
      alert("Minimum 301 try-ons required for Custom Flexible plan.");
      return;
    }
    
    formData.append("intent", "custom-pack");
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Credits - VTON Magic" />
      <div className="app-container">
        {error && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="critical" title="Erreur" onDismiss={() => {}}>
              {error}
            </Banner>
          </div>
        )}

        {(purchaseSuccess || fetcher.data?.success) && (planActivated || (fetcher.data as any)?.planActivated) && showSuccessBanner && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="success" title="Subscription Activated!" onDismiss={() => setShowSuccessBanner(false)}>
              {(fetcher.data as any)?.message || `Your subscription has been activated successfully! Monthly quota: ${(fetcher.data as any)?.monthlyQuota || monthlyQuota || shop?.monthly_quota || 0} try-ons/month.`}
            </Banner>
          </div>
        )}


        {(fetcher.data as any)?.error && showErrorBanner && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner 
              tone="critical" 
              title={(fetcher.data as any)?.requiresAuth ? "Authentication Required" : "Error"}
              onDismiss={() => setShowErrorBanner(false)}
              action={(fetcher.data as any)?.requiresAuth ? {
                content: (fetcher.data as any)?.reauthUrl ? "Re-authenticate" : "Refresh page",
                onAction: () => {
                  if ((fetcher.data as any)?.reauthUrl) {
                    window.location.href = (fetcher.data as any).reauthUrl;
                  } else {
                    window.location.reload();
                  }
                },
              } : undefined}
            >
              {(fetcher.data as any)?.error}
            </Banner>
          </div>
        )}

        <header className="app-header">
          <h1 className="app-title">Credits</h1>
          <p className="app-subtitle">
            Use credits to generate virtual try-ons instantly
          </p>
        </header>

        <div className="credits-balance">
          <div>
            <div className="credits-amount">
              {activePlanId === "custom-flexible" 
                ? `Custom (${currentMonthlyQuota} try-ons/month)`
                : PRICING_PLANS.find(p => p.id === activePlanId)?.name || "Free"
              }
            </div>
            <div className="credits-label">
              Current Subscription Plan
            </div>
            {currentMonthlyQuota > 0 && (
              <div style={{ marginTop: "8px", fontSize: "14px", color: "#6B7280" }}>
                {currentMonthlyQuota} try-ons/month
              </div>
            )}
          </div>
        </div>

        <div className="pricing-grid">
          {PRICING_PLANS.map((plan) => (
            <div key={plan.id} className={`plan-card ${plan.highlight ? 'featured' : ''} ${plan.popular ? 'popular' : ''}`}>
              {plan.badge && (
                <div className="plan-badge">{plan.badge}</div>
              )}
              <div className="plan-name">{plan.name}</div>
              <div className="plan-price">
                {plan.price === 0 ? (
                  <span>Free</span>
                ) : (
                  <>€{plan.price.toFixed(2)} <span>/ month</span></>
                )}
              </div>
              <div className="plan-credits">
                <div className="plan-credits-amount">{(plan as any).monthlyQuota || plan.credits}</div>
                <div className="plan-credits-label">try-ons/month</div>
              </div>
              <div className="plan-features">
                <div className="plan-feature">✓ {(plan as any).monthlyQuota || plan.credits} try-ons per month</div>
                <div className="plan-feature">✓ Monthly quota with automatic reset</div>
                {(plan as any).hasWatermark && (
                  <div className="plan-feature">✓ With watermark</div>
                )}
                {!(plan as any).hasWatermark && (
                  <div className="plan-feature">✓ No watermark</div>
                )}
                <div className="plan-feature">✓ {plan.description}</div>
                <div className="plan-feature">✓ Hard cap to prevent overages</div>
              </div>
              <div className="plan-cta">
                <button 
                  className="plan-button"
                  onClick={() => handlePurchase(plan.id)}
                  disabled={isSubmitting || submittingPackId !== null || activePlanId === plan.id}
                >
                  {activePlanId === plan.id ? "Active" : (isSubmitting && submittingPackId === plan.id ? "Processing..." : "Purchase")}
                </button>
              </div>
            </div>
          ))}
        </div>
        
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg" fontWeight="semibold">
              Custom Flexible Plan
            </Text>
            <Text variant="bodyMd" tone="subdued" as="p">
              Choose more than 300 try-ons per month.
            </Text>
            <Divider />
            <BlockStack gap="300">
              <Text variant="bodyMd" as="p">
                <strong>Minimum:</strong> 301 try-ons per month
              </Text>
              <Text variant="bodySm" tone="subdued" as="p">
                Monthly quota is fixed with automatic reset each month.
              </Text>
              <form onSubmit={handleCustomPurchase}>
                <InlineStack gap="300" align="end">
                  <Box minWidth="200px">
                    <TextField
                      label="Number of try-ons/month"
                      type="number"
                      name="customCredits"
                      value={customAmount}
                      onChange={setCustomAmount}
                      min={301}
                      autoComplete="off"
                      helpText={`Minimum 301 try-ons. Calculated price: €${((parseFloat(customAmount) || 301) * MIN_CUSTOM_PRICE_PER_CREDIT).toFixed(2)}/month`}
                    />
                  </Box>
                  <Button 
                    variant="primary" 
                    submit
                    loading={isSubmitting}
                    disabled={!customAmount || parseInt(customAmount) < 301}
                  >
                    Purchase {customAmount || '301'} try-ons/month
                  </Button>
                </InlineStack>
              </form>
            </BlockStack>
          </BlockStack>
        </Card>
      </div>
    </Page>
  );
}
