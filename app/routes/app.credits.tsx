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
import { authenticate, shopify } from "../shopify.server";
import { getShop, upsertShop } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

// Plans tarifaires optimisés pour Virtual Try-On
const PRICING_PLANS = [
  {
    id: "free",
    name: "Free Discovery",
    credits: 4,
    price: 0.00,
    pricePerCredit: 0.00,
    description: "4 free try-ons per month with watermark to discover the tool",
    highlight: false,
    popular: false,
    badge: "Free",
    monthlyQuota: 4,
    hasWatermark: true,
  },
  {
    id: "starter",
    name: "Starter",
    credits: 50,
    price: 29.00,
    pricePerCredit: 0.58,
    description: "50 try-ons per month - Perfect for launches",
    highlight: false,
    popular: true,
    badge: "Popular",
    monthlyQuota: 50,
    hasWatermark: false,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 200,
    price: 99.00,
    pricePerCredit: 0.495,
    description: "200 try-ons per month - For active merchants",
    highlight: true,
    popular: false,
    badge: "Recommended",
    monthlyQuota: 200,
    hasWatermark: false,
  },
  {
    id: "studio",
    name: "Enterprise",
    credits: 1000,
    price: 399.00,
    pricePerCredit: 0.399,
    description: "1000 try-ons per month - Designed for high volume",
    highlight: false,
    popular: false,
    badge: "Premium",
    monthlyQuota: 1000,
    hasWatermark: false,
  },
];


export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    
    if (!session || !session.shop) {
      // Log only in development
      if (process.env.NODE_ENV !== "production") {
        console.error("[Credits Loader] Invalid session - shop is null!");
      }
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
      
      if (pack) {
        // Get the number of credits from the pack
        const packCredits = (pack as any).monthlyQuota || pack.credits;
        const monthlyQuota = packCredits; // Store as monthly quota for future renewals
        
        // Get current shop data to ensure we have the latest credits
        const currentShopData = await getShop(shop);
        const currentCredits = currentShopData?.credits || 0;
        
        // Add pack credits to existing credits (accumulation)
        const newCredits = currentCredits + packCredits;
        
        await upsertShop(shop, { 
          credits: newCredits, // Add credits to existing ones
          monthlyQuota: monthlyQuota, // Store plan for monthly renewals
        });
        
        // Plan activated (log only in development)
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Credits] Activated plan ${packId}: added ${packCredits} credits (had ${currentCredits}, now has ${newCredits})`);
        }

        // Reload shop data after updating plan to ensure UI shows latest credits
        const updatedShopData = await getShop(shop);
        return json({
          shop: updatedShopData || null,
          purchaseSuccess: true,
          planActivated: packId,
          monthlyQuota: monthlyQuota,
        });
      }
    }

    return json({
      shop: shopData || null,
    });
  } catch (error) {
    // Log only in development
    if (process.env.NODE_ENV !== "production") {
      console.error("[Credits Loader] Error:", error);
    }
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
    // authenticate.admin() returns { admin, billing, session, redirect }
    // billing is only available if the app is configured for Managed Pricing
    let admin, billing, session, redirect;
    
    try {
      const authResult = await authenticate.admin(request);
      admin = authResult.admin;
      billing = authResult.billing; // billing is available when Managed Pricing is configured
      session = authResult.session;
      redirect = authResult.redirect; // redirect is needed for onFailure callback
    } catch (authError) {
      // Si authenticate.admin lance une Response (redirection), la gérer
      if (authError instanceof Response) {
        if (authError.status === 401 || authError.status === 302) {
          const reauthUrl = authError.headers.get('x-shopify-api-request-failure-reauthorize-url') || 
                           authError.headers.get('location');
          // Log only in development
          if (process.env.NODE_ENV !== "production") {
            console.error("[Credits Action] Authentication required (401/302):", { 
              status: authError.status, 
              reauthUrl,
            });
          }
          return json({ 
            success: false, 
            error: "Your session has expired. Please refresh the page to re-authenticate.",
            requiresAuth: true,
            reauthUrl: reauthUrl || null,
          });
        }
        // Pour toute autre Response, retourner une erreur JSON
        if (process.env.NODE_ENV !== "production") {
          console.error("[Credits Action] Authentication error:", authError.status);
        }
        return json({ 
          success: false, 
          error: `Authentication error (${authError.status}). Please refresh the page.`,
          requiresAuth: true,
        });
      }
      // Pour les autres erreurs, les propager
      if (process.env.NODE_ENV !== "production") {
        console.error("[Credits Action] Authentication error (non-Response):", authError);
      }
      throw authError;
    }
    
    // Vérifier que la session est valide
    if (!session || !session.shop) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[Credits Action] Invalid session - shop is null!");
      }
      return json({ 
        success: false, 
        error: "Invalid session. Please refresh the page.",
        requiresAuth: true,
      });
    }
    
    if (!admin) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[Credits Action] Admin client is missing!");
      }
      return json({ 
        success: false, 
        error: "GraphQL client not available. Please refresh the page.",
        requiresAuth: true,
      });
    }
    
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");

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
      const packCredits = (pack as any).monthlyQuota || pack.credits;
      const monthlyQuota = packCredits; // Store as monthly quota for future renewals
      
      // Get current shop data to get existing credits
      const currentShopData = await getShop(shop);
      const currentCredits = currentShopData?.credits || 0;
      
      // Add pack credits to existing credits (accumulation)
      const newCredits = currentCredits + packCredits;
      
      // Skip payment for free plan only
      if (pack.price === 0) {
        await upsertShop(shop, { 
          credits: newCredits, // Add credits to existing ones
          monthlyQuota: monthlyQuota, // Store plan for monthly renewals
        });
        return json({ 
          success: true, 
          message: `Plan ${pack.name} activated successfully! Added ${packCredits} credits. Total: ${newCredits} credits.`,
          planActivated: packId,
          monthlyQuota: monthlyQuota,
        });
      }
      
      // For paid plans, use Shopify Managed Pricing with billing.require()
      // With Managed Pricing, billing.require() simply redirects to Shopify's pricing page
      // No subscription is created manually - Shopify handles everything automatically
      // Credits will be added automatically via app_subscriptions/update webhook when subscription is activated
      if (!billing) {
        console.error("[Credits] Billing is not available. App may not be configured for Managed Pricing.");
        return json({ 
          success: false, 
          error: "Billing is not available. Please ensure the app is configured for Managed Pricing in the Shopify Partner Dashboard."
        });
      }

      if (!redirect) {
        console.error("[Credits] Redirect is not available from authenticate.admin().");
        return json({ 
          success: false, 
          error: "Redirect function is not available. Please refresh the page."
        });
      }

      // Use pack.id (handle) instead of pack.name for billing.require()
      // Handles must match the keys in shopify.server.ts: "starter", "pro", "studio"
      const planHandle = pack.id; // "starter", "pro", or "studio"
      const isTestMode = shop.includes('.myshopify.com') || process.env.NODE_ENV !== "production";
      
      console.log(`[Credits] Requesting billing redirect for plan: ${pack.name} (handle: ${planHandle}, packId: ${packId}, isTest: ${isTestMode})`);
      
      // Use billing.require() which handles Managed Pricing correctly
      // This will redirect to Shopify's Managed Pricing page where merchant can select a plan
      // With Managed Pricing, we don't create subscriptions - Shopify does it automatically
      let billingResponse;
      try {
        billingResponse = await billing.require({
          session,
          plans: [planHandle],
          isTest: isTestMode,
          onFailure: () => {
            // If billing fails, redirect back to credits page
            console.error(`[Credits] billing.require() onFailure callback triggered for plan: ${planHandle}`);
            return redirect("/app/credits");
          },
        });
        console.log(`[Credits] billing.require() returned:`, {
          type: typeof billingResponse,
          isResponse: billingResponse instanceof Response,
          status: billingResponse instanceof Response ? billingResponse.status : 'N/A',
        });
      } catch (billingError) {
        console.error(`[Credits] billing.require() threw an error:`, billingError);
        // If billing.require() throws an error, it might be a configuration issue
        throw new Error(`Failed to initiate billing: ${billingError instanceof Error ? billingError.message : String(billingError)}`);
      }

      // billing.require() returns a Response with redirect if billing is needed
      // With Managed Pricing, this always redirects to Shopify's pricing page
      // We should always get a redirect Response, never null
      if (billingResponse) {
        // Extract the redirect URL from the response
        const redirectUrl = billingResponse.headers.get('location');
        
        if (redirectUrl) {
          console.log(`[Credits] Redirecting to Shopify Managed Pricing page: ${redirectUrl}`);
          
          // For embedded apps, we need to exit the iframe to redirect to Shopify's pricing page
          // The redirect URL from billing.require() should already handle this, but we ensure
          // it's properly formatted for embedded apps
          let finalRedirectUrl = redirectUrl;
          
          // If the URL doesn't already include exit-iframe logic and we're in an embedded context,
          // we might need to wrap it, but billing.require() should handle this automatically
          
          // Return the redirect URL to the client so it can redirect
          return json({ 
            success: true,
            confirmationUrl: finalRedirectUrl,
            redirect: true,
            message: "Redirecting to Shopify pricing page..."
          });
        }
        
        // If no location header, try to get the URL from the response body or status
        // For embedded apps, billing.require() might return a redirect response directly
        if (billingResponse.status >= 300 && billingResponse.status < 400) {
          // It's a redirect response, return it directly
          console.log(`[Credits] Billing response is a redirect (status ${billingResponse.status}), returning directly`);
          return billingResponse;
        }
        
        // If we get here, something unexpected happened
        console.error(`[Credits] billing.require() returned unexpected response:`, {
          status: billingResponse.status,
          headers: Object.fromEntries(billingResponse.headers.entries()),
        });
        return json({ 
          success: false, 
          error: "Unable to redirect to pricing page. The billing configuration may not be deployed. Please run 'npm run deploy' to sync your configuration with Shopify."
        });
      }

      // This should never happen with Managed Pricing, but handle it gracefully
      console.warn(`[Credits] billing.require() returned null/undefined - this is unexpected with Managed Pricing`);
      return json({ 
        success: false, 
        error: "Unable to redirect to pricing page. The billing configuration may not be deployed. Please ensure Managed Pricing is configured in the Partner Dashboard and run 'npm run deploy' to sync your configuration."
      });
    } catch (error) {
      // Log error for debugging
      console.error("[Credits] Error in billing flow:", error);
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Error redirecting to pricing page. Please try again." 
      });
    }
  }

  return json({ success: false, error: "Invalid intent" });
  } catch (error) {
    // Gérer toutes les erreurs, y compris les Responses de redirection
    // Log only in development
    if (process.env.NODE_ENV !== "production") {
      console.error("[Credits] Error in action:", error);
    }
    
    // Si c'est une Response de redirection (auth requise)
    if (error instanceof Response) {
      if (error.status === 401 || error.status === 302) {
        const reauthUrl = error.headers.get('x-shopify-api-request-failure-reauthorize-url') || 
                         error.headers.get('location');
        // Log only in development
        if (process.env.NODE_ENV !== "production") {
          console.error("[Credits] Authentication required (Response)", { status: error.status, reauthUrl });
        }
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
  const loaderData = useLoaderData<typeof loader>();
  const shop = (loaderData as any)?.shop || null;
  const error = (loaderData as any)?.error || null;
  const purchaseSuccess = (loaderData as any)?.purchaseSuccess || false;
  const planActivated = (loaderData as any)?.planActivated || null;
  const monthlyQuota = (loaderData as any)?.monthlyQuota || null;
  
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const currentCredits = shop?.credits || 0;
  
  // Debug log to verify credits value
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Credits Page] Credits display: shop?.credits=${shop?.credits}, currentCredits=${currentCredits}, shop object:`, {
      credits: shop?.credits,
      monthly_quota: shop?.monthly_quota,
      monthly_quota_used: shop?.monthly_quota_used
    });
  }
  const [submittingPackId, setSubmittingPackId] = useState<string | null>(null);
  const [showSuccessBanner, setShowSuccessBanner] = useState(true);
  const [showErrorBanner, setShowErrorBanner] = useState(true);
  
  const isSubmitting = fetcher.state === "submitting";

  // Determine which plan is currently active based on monthly_quota
  const currentMonthlyQuota = shop?.monthly_quota || 0;
  const getActivePlanId = () => {
    if (!currentMonthlyQuota) return "free"; // Default to free if no quota
    // Find the plan that matches the current monthly quota
    const matchingPlan = PRICING_PLANS.find(plan => (plan as any).monthlyQuota === currentMonthlyQuota);
    if (matchingPlan) return matchingPlan.id;
    // Default to free
    return "free";
  };
  const activePlanId = getActivePlanId();

  // Flag to prevent multiple revalidations
  const hasRevalidatedRef = useRef(false);

  // Recharger les données après activation d'un plan (une seule fois)
  useEffect(() => {
    // Revalidate when purchase succeeds from Shopify redirect OR from action
    if ((purchaseSuccess || fetcher.data?.success) && !hasRevalidatedRef.current) {
      hasRevalidatedRef.current = true;
      // Preserve scroll position
      const scrollY = window.scrollY;
      // Recharger les données après activation réussie
      setTimeout(() => {
        revalidator.revalidate();
        // Restore scroll position after a short delay
        setTimeout(() => {
          window.scrollTo(0, scrollY);
        }, 100);
      }, 300);
    }
    // Reset flag when fetcher changes
    if (fetcher.state === "idle" && !fetcher.data?.success && !purchaseSuccess) {
      hasRevalidatedRef.current = false;
    }
  }, [fetcher.data?.success, fetcher.state, revalidator, purchaseSuccess]);

  // Auto-dismiss success banner after 5 seconds (only trigger once)
  const successBannerShownRef = useRef(false);
  useEffect(() => {
    const shouldShow = (purchaseSuccess || fetcher.data?.success) && (planActivated || (fetcher.data as any)?.planActivated);
    if (shouldShow && !successBannerShownRef.current) {
      setShowSuccessBanner(true);
      successBannerShownRef.current = true;
      const timer = setTimeout(() => {
        setShowSuccessBanner(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
    // Reset when conditions change
    if (!shouldShow) {
      successBannerShownRef.current = false;
    }
  }, [purchaseSuccess, fetcher.data?.success, planActivated]);

  // Auto-dismiss error banner after 8 seconds (only trigger once per error)
  const errorBannerShownRef = useRef<string | null>(null);
  useEffect(() => {
    const error = (fetcher.data as any)?.error;
    if (error && errorBannerShownRef.current !== error) {
      setShowErrorBanner(true);
      errorBannerShownRef.current = error;
      const timer = setTimeout(() => {
        setShowErrorBanner(false);
      }, 8000);
      return () => clearTimeout(timer);
    }
    if (!error) {
      errorBannerShownRef.current = null;
    }
  }, [(fetcher.data as any)?.error]);

  // Reset submittingPackId when fetcher completes
  useEffect(() => {
    if (fetcher.state === "idle" && submittingPackId !== null) {
      setSubmittingPackId(null);
    }
  }, [fetcher.state, submittingPackId]);

  // Handle redirect to Shopify payment page
  useEffect(() => {
    const confirmationUrl = (fetcher.data as any)?.confirmationUrl;
    const shouldRedirect = (fetcher.data as any)?.redirect === true;
    
    if (confirmationUrl && shouldRedirect && fetcher.state === "idle") {
      // Redirect to Shopify payment confirmation page
      console.log("[Credits] Redirecting to Shopify payment page:", confirmationUrl);
      // Use window.location.href for full page redirect (necessary for Shopify payment flow)
      window.location.href = confirmationUrl;
    } else if (shouldRedirect && !confirmationUrl && fetcher.state === "idle") {
      // Log if we expected a redirect but didn't get a confirmation URL
      console.error("[Credits] Expected redirect but no confirmationUrl received:", fetcher.data);
    }
  }, [fetcher.data, fetcher.state]);

  const handlePurchase = (packId: string) => {
    if (isSubmitting || submittingPackId !== null) {
      return; // Purchase already in progress
    }
    
    setSubmittingPackId(packId);
    
    const formData = new FormData();
    formData.append("intent", "purchase-credits");
    formData.append("packId", packId);
    
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

        {/* Subscription Logic Explanation */}
        <div style={{ 
          marginBottom: "var(--spacing-lg)", 
          padding: "var(--spacing-lg)", 
          background: "#f9fafb", 
          borderRadius: "8px",
          border: "1px solid #e5e7eb"
        }}>
          <h3 style={{ marginTop: 0, marginBottom: "var(--spacing-md)", fontSize: "16px", fontWeight: 600 }}>
            How Subscription Works
          </h3>
          <div style={{ fontSize: "14px", color: "#4b5563", lineHeight: "1.6" }}>
            <p style={{ marginBottom: "var(--spacing-sm)" }}>
              <strong>First Purchase:</strong> When you purchase a plan, the credits are <strong>added to your existing credits</strong>. 
              For example, if you have 2 credits and buy the Starter plan (50 credits), you'll have 52 credits total.
            </p>
            <p style={{ marginBottom: "var(--spacing-sm)" }}>
              <strong>Monthly Renewal:</strong> At the beginning of each new month, your credits are automatically reset to the amount 
              included in your active plan. If you have the Starter plan (50 credits/month), you'll receive 50 credits each month.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Note:</strong> Credits accumulate when you purchase a new plan, but renew monthly based on your active subscription plan.
            </p>
          </div>
        </div>

        <div className="credits-balance">
          <div>
            <div className="credits-amount">
              {currentCredits}
            </div>
            <div className="credits-label">
              Available Credits
            </div>
            <div style={{ marginTop: "8px", fontSize: "14px", color: "#6B7280" }}>
              Plan: {PRICING_PLANS.find(p => p.id === activePlanId)?.name || "Free"}
              {currentMonthlyQuota > 0 && (
                <span> • {currentMonthlyQuota} credits/month</span>
              )}
            </div>
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
                  <>${plan.price.toFixed(2)} <span>/ month</span></>
                )}
              </div>
              <div className="plan-credits">
                <div className="plan-credits-amount">{(plan as any).monthlyQuota || plan.credits}</div>
                <div className="plan-credits-label">try-ons/month</div>
              </div>
              <div className="plan-features">
                <div className="plan-feature">✓ {plan.description}</div>
                <div className="plan-feature">✓ Monthly quota with automatic reset</div>
                {(plan as any).hasWatermark && (
                  <div className="plan-feature">✓ With watermark</div>
                )}
                {!(plan as any).hasWatermark && (
                  <div className="plan-feature">✓ No watermark</div>
                )}
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
      </div>
    </Page>
  );
}
