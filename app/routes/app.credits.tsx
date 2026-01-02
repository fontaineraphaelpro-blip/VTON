import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { useState, useEffect } from "react";
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
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

// 3 Credit packs optimized for conversion AND high average order value
// Strategy: Entry point (Starter), Middle tier (Pro), Premium (Enterprise)
const CREDIT_PACKS = [
  {
    id: "starter",
    name: "Starter",
    credits: 50,
    price: 19.99,
    pricePerCredit: 0.40,
    description: "Perfect to get started",
    badge: null,
    highlight: false,
    savings: "20%",
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 150,
    price: 49.99,
    pricePerCredit: 0.33,
    description: "Best value for growing stores",
    badge: "BEST VALUE",
    savePercent: 33,
    highlight: true,
    savings: "33%",
    popular: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    credits: 500,
    price: 149.99,
    pricePerCredit: 0.30,
    description: "Maximum savings for high volume",
    badge: null,
    highlight: false,
    savings: "40%",
    popular: false,
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureTables();
    const shopData = await getShop(shop);

    return json({
      shop: shopData || null,
    });
  } catch (error) {
    console.error("Credits loader error:", error);
    return json({
      shop: null,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const intent = formData.get("intent");

  if (intent === "purchase-credits") {
    const packId = formData.get("packId") as string;
    const pack = CREDIT_PACKS.find((p) => p.id === packId);

    if (pack) {
      // Create a Shopify checkout URL for payment
      try {
        // Create a draft order for the credit purchase
        const mutation = `#graphql
          mutation draftOrderCreate($input: DraftOrderInput!) {
            draftOrderCreate(input: $input) {
              draftOrder {
                id
                invoiceUrl
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        // Get customer email from session if available
        const customerEmail = session.email || undefined;

        const variables = {
          input: {
            lineItems: [
              {
                title: `${pack.name} Pack - ${pack.credits} Credits`,
                quantity: 1,
                originalUnitPrice: pack.price.toFixed(2),
              }
            ],
            note: `VTON Magic Credits Purchase: ${pack.credits} credits`,
            tags: ["vton-credits", `pack-${pack.id}`],
            ...(customerEmail && {
              customer: {
                email: customerEmail,
              }
            }),
          }
        };

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:136',message:'Before admin.graphql call for draft order',data:{packId:pack.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        const response = await admin.graphql(mutation, {
          variables,
        });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:140',message:'After admin.graphql call for draft order',data:{isResponse:response instanceof Response,ok:response?.ok,status:response?.status,statusText:response?.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        // Check if response is OK
        if (!response.ok) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:144',message:'Response not OK',data:{status:response.status,statusText:response.statusText,is401:response.status===401},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          // Handle 401 Unauthorized - authentication required
          if (response.status === 401) {
            const reauthUrl = response.headers.get('x-shopify-api-request-failure-reauthorize-url');
            console.error("Authentication required (401) for draft order creation");
            return json({ 
              success: false, 
              error: "Your session has expired. Please refresh the page to re-authenticate.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          
          const errorText = await response.text().catch(() => `HTTP ${response.status} ${response.statusText}`);
          console.error("GraphQL request failed:", response.status, errorText);
          return json({ 
            success: false, 
            error: `Shopify API error (${response.status}): ${errorText.substring(0, 200)}`,
          });
        }

        let responseJson;
        try {
          responseJson = await response.json();
        } catch (jsonError) {
          console.error("Failed to parse JSON response:", jsonError);
          const errorText = await response.text().catch(() => "Unable to read response");
          return json({ 
            success: false, 
            error: `Invalid response from Shopify: ${errorText.substring(0, 200)}`,
          });
        }
        
        // Log the full response for debugging
        console.log("Draft order response:", JSON.stringify(responseJson, null, 2));
        
        // Check for GraphQL errors
        if (responseJson.errors) {
          const errorMessages = responseJson.errors.map((e: any) => e.message || String(e)).join(", ");
          console.error("GraphQL errors:", errorMessages);
          return json({ 
            success: false, 
            error: `GraphQL error: ${errorMessages}`,
          });
        }
        
        const draftOrder = responseJson.data?.draftOrderCreate?.draftOrder;
        const errors = responseJson.data?.draftOrderCreate?.userErrors;

        if (errors && errors.length > 0) {
          const errorMessages = errors.map((e: any) => `${e.field ? `${e.field}: ` : ""}${e.message}`).join(", ");
          console.error("Draft order errors:", errorMessages);
          return json({ 
            success: false, 
            error: `Failed to create checkout: ${errorMessages}`,
          });
        }

        if (!draftOrder) {
          console.error("No draft order returned:", responseJson);
          return json({ 
            success: false, 
            error: "Failed to create draft order. Please check your Shopify permissions.",
          });
        }

        if (draftOrder.invoiceUrl) {
          return json({ 
            success: true, 
            redirect: true,
            checkoutUrl: draftOrder.invoiceUrl,
            pack: pack.name, 
            credits: pack.credits,
            price: pack.price,
          });
        } else {
          console.error("Draft order created but no invoiceUrl:", draftOrder);
          return json({ 
            success: false, 
            error: "Draft order created but no checkout URL available. Please try again.",
          });
        }
      } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:224',message:'Catch block - error caught',data:{errorType:error?.constructor?.name,isResponse:error instanceof Response,isError:error instanceof Error,hasStatus:!!(error as any)?.status,status:(error as any)?.status,message:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        // Ne pas loguer l'objet Response directement - extraire seulement les infos nécessaires
        if (error instanceof Response) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:227',message:'Error is Response object',data:{status:error.status,statusText:error.statusText,url:error.url,is401:error.status===401},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          // Handle 401 Unauthorized in catch block
          if (error.status === 401) {
            const reauthUrl = error.headers.get('x-shopify-api-request-failure-reauthorize-url');
            console.warn(`Draft order creation failed: ${error.status} ${error.statusText} - Authentication required`);
            return json({ 
              success: false, 
              error: "Your session has expired. Please refresh the page to re-authenticate.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          console.warn(`Draft order creation failed: ${error.status} ${error.statusText}`);
          return json({ 
            success: false, 
            error: `Shopify API error (${error.status}): ${error.statusText}` 
          });
        }
        // Check if error has Response-like properties (status, statusText)
        const errorAny = error as any;
        if (errorAny && typeof errorAny === 'object' && 'status' in errorAny && 'statusText' in errorAny) {
          // Handle Response-like object
          if (errorAny.status === 401) {
            const reauthUrl = errorAny.headers?.get?.('x-shopify-api-request-failure-reauthorize-url') || 
                             errorAny.headers?.['x-shopify-api-request-failure-reauthorize-url'];
            console.warn(`Draft order creation failed: ${errorAny.status} ${errorAny.statusText} - Authentication required`);
            return json({ 
              success: false, 
              error: "Your session has expired. Please refresh the page to re-authenticate.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          console.warn(`Draft order creation failed: ${errorAny.status} ${errorAny.statusText}`);
          return json({ 
            success: false, 
            error: `Shopify API error (${errorAny.status}): ${errorAny.statusText || 'Unknown error'}` 
          });
        }
        // Log normal errors (not Response objects)
        console.error("Error creating draft order:", error instanceof Error ? error.message : String(error));
        let errorMessage: string;
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (error && typeof error === 'object' && 'message' in error) {
          errorMessage = String(error.message);
        } else {
          errorMessage = "Unknown error occurred";
        }
        return json({ 
          success: false, 
          error: `Failed to create payment checkout: ${errorMessage}` 
        });
      }
    }
  } else if (intent === "custom-pack") {
    const customCredits = parseInt(formData.get("customCredits") as string);
    if (customCredits && customCredits >= 250) {
      const pricePerCredit = 0.30;
      const totalPrice = customCredits * pricePerCredit;

      try {
        // Create a draft order for custom pack
        const mutation = `#graphql
          mutation draftOrderCreate($input: DraftOrderInput!) {
            draftOrderCreate(input: $input) {
              draftOrder {
                id
                invoiceUrl
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        // Get customer email from session if available
        const customerEmail = session.email || undefined;

        const variables = {
          input: {
            lineItems: [
              {
                title: `Custom Pack - ${customCredits} Credits`,
                quantity: 1,
                originalUnitPrice: totalPrice.toFixed(2),
              }
            ],
            note: `VTON Magic Credits Purchase: ${customCredits} credits (Custom Pack)`,
            tags: ["vton-credits", "custom-pack"],
            ...(customerEmail && {
              customer: {
                email: customerEmail,
              }
            }),
          }
        };

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:321',message:'Before admin.graphql call for custom draft order',data:{customCredits},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        const response = await admin.graphql(mutation, {
          variables,
        });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:325',message:'After admin.graphql call for custom draft order',data:{isResponse:response instanceof Response,ok:response?.ok,status:response?.status,statusText:response?.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        // Check if response is OK
        if (!response.ok) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:329',message:'Custom response not OK',data:{status:response.status,statusText:response.statusText,is401:response.status===401},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          // Handle 401 Unauthorized - authentication required
          if (response.status === 401) {
            const reauthUrl = response.headers.get('x-shopify-api-request-failure-reauthorize-url');
            console.error("Authentication required (401) for custom draft order creation");
            return json({ 
              success: false, 
              error: "Your session has expired. Please refresh the page to re-authenticate.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          
          const errorText = await response.text().catch(() => `HTTP ${response.status} ${response.statusText}`);
          console.error("GraphQL request failed (custom):", response.status, errorText);
          return json({ 
            success: false, 
            error: `Shopify API error (${response.status}): ${errorText.substring(0, 200)}`,
          });
        }

        let responseJson;
        try {
          responseJson = await response.json();
        } catch (jsonError) {
          console.error("Failed to parse JSON response (custom):", jsonError);
          const errorText = await response.text().catch(() => "Unable to read response");
          return json({ 
            success: false, 
            error: `Invalid response from Shopify: ${errorText.substring(0, 200)}`,
          });
        }
        
        // Log the full response for debugging
        console.log("Custom draft order response:", JSON.stringify(responseJson, null, 2));
        
        // Check for GraphQL errors
        if (responseJson.errors) {
          const errorMessages = responseJson.errors.map((e: any) => e.message || String(e)).join(", ");
          console.error("GraphQL errors (custom):", errorMessages);
          return json({ 
            success: false, 
            error: `GraphQL error: ${errorMessages}`,
          });
        }
        
        const draftOrder = responseJson.data?.draftOrderCreate?.draftOrder;
        const errors = responseJson.data?.draftOrderCreate?.userErrors;

        if (errors && errors.length > 0) {
          const errorMessages = errors.map((e: any) => `${e.field ? `${e.field}: ` : ""}${e.message}`).join(", ");
          console.error("Custom draft order errors:", errorMessages);
          return json({ 
            success: false, 
            error: `Failed to create checkout: ${errorMessages}`,
          });
        }

        if (!draftOrder) {
          console.error("No custom draft order returned:", responseJson);
          return json({ 
            success: false, 
            error: "Failed to create draft order. Please check your Shopify permissions.",
          });
        }

        if (draftOrder.invoiceUrl) {
          return json({ 
            success: true, 
            redirect: true,
            checkoutUrl: draftOrder.invoiceUrl,
            pack: "Custom", 
            credits: customCredits,
            price: totalPrice,
          });
        } else {
          console.error("Custom draft order created but no invoiceUrl:", draftOrder);
          return json({ 
            success: false, 
            error: "Draft order created but no checkout URL available. Please try again.",
          });
        }
      } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:399',message:'Catch block - custom error caught',data:{errorType:error?.constructor?.name,isResponse:error instanceof Response,isError:error instanceof Error,hasStatus:!!(error as any)?.status,status:(error as any)?.status,message:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        // Ne pas loguer l'objet Response directement - extraire seulement les infos nécessaires
        if (error instanceof Response) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:402',message:'Custom error is Response object',data:{status:error.status,statusText:error.statusText,url:error.url,is401:error.status===401},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          // Handle 401 Unauthorized in catch block
          if (error.status === 401) {
            const reauthUrl = error.headers.get('x-shopify-api-request-failure-reauthorize-url');
            console.warn(`Custom draft order creation failed: ${error.status} ${error.statusText} - Authentication required`);
            return json({ 
              success: false, 
              error: "Your session has expired. Please refresh the page to re-authenticate.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          console.warn(`Custom draft order creation failed: ${error.status} ${error.statusText}`);
          return json({ 
            success: false, 
            error: `Shopify API error (${error.status}): ${error.statusText}` 
          });
        }
        // Check if error has Response-like properties (status, statusText)
        const errorAny = error as any;
        if (errorAny && typeof errorAny === 'object' && 'status' in errorAny && 'statusText' in errorAny) {
          // Handle Response-like object
          if (errorAny.status === 401) {
            const reauthUrl = errorAny.headers?.get?.('x-shopify-api-request-failure-reauthorize-url') || 
                             errorAny.headers?.['x-shopify-api-request-failure-reauthorize-url'];
            console.warn(`Custom draft order creation failed: ${errorAny.status} ${errorAny.statusText} - Authentication required`);
            return json({ 
              success: false, 
              error: "Your session has expired. Please refresh the page to re-authenticate.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          console.warn(`Custom draft order creation failed: ${errorAny.status} ${errorAny.statusText}`);
          return json({ 
            success: false, 
            error: `Shopify API error (${errorAny.status}): ${errorAny.statusText || 'Unknown error'}` 
          });
        }
        // Log normal errors (not Response objects)
        console.error("Error creating custom draft order:", error instanceof Error ? error.message : String(error));
        let errorMessage: string;
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (error && typeof error === 'object' && 'message' in error) {
          errorMessage = String(error.message);
        } else {
          errorMessage = "Unknown error occurred";
        }
        return json({
          success: false,
          error: `Failed to create payment checkout: ${errorMessage}`
        });
      }
    } else {
      return json({ success: false, error: "Minimum 250 credits required for custom pack" });
    }
  }

  return json({ success: false, error: "Invalid purchase" });
};

export default function Credits() {
  const { shop, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const currentCredits = shop?.credits || 0;
  const [customAmount, setCustomAmount] = useState("500");

  const isSubmitting = fetcher.state === "submitting";

  // Rediriger vers le checkout Shopify après création de la commande
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.redirect && fetcher.data?.checkoutUrl) {
      // Rediriger vers le checkout Shopify
      window.location.href = fetcher.data.checkoutUrl;
    } else if (fetcher.data?.success && !fetcher.data?.redirect) {
      // Si pas de redirection, recharger les données (ancien comportement)
      setTimeout(() => {
        revalidator.revalidate();
      }, 500);
    }
  }, [fetcher.data, revalidator]);

  const handlePurchase = (packId: string) => {
    const formData = new FormData();
    formData.append("intent", "purchase-credits");
    formData.append("packId", packId);
    fetcher.submit(formData, { method: "post" });
  };

  const handleCustomPurchase = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const credits = parseInt(formData.get("customCredits") as string);
    
    if (!credits || credits < 250) {
      alert("Minimum 250 credits required for custom pack.");
      return;
    }
    
    formData.append("intent", "custom-pack");
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Credits - VTON Magic" />
      <div className="vton-credits-page">
        {/* Header */}
        <header className="vton-header-simple">
          <div className="vton-header-logo">
            <div className="vton-logo-icon-blue">V</div>
            <span className="vton-header-title">VTON Magic</span>
          </div>
          <div className="vton-status-badge">
            <div className="vton-status-dot-green"></div>
            Active
          </div>
        </header>

        <div className="vton-credits-content">
          {/* Top Row: Credits + Value Prop */}
          <div className="vton-credits-top">
            {/* Current Credits Display */}
            <div className="vton-credits-display">
              <div className="vton-credits-label">Your Credits</div>
              <div className="vton-credits-amount">
                {currentCredits.toLocaleString("en-US")}
              </div>
              <div className="vton-credits-subtitle">Credits never expire</div>
            </div>

            {/* Value Proposition */}
            <div className="vton-value-prop">
              <div className="vton-value-icon"></div>
              <div className="vton-value-text">
                <strong>Reduce returns by 2.5x</strong> and boost conversions with virtual try-on
              </div>
            </div>
          </div>

          {/* 3 Pricing Plans */}
          <div className="vton-pricing-simple">
            {CREDIT_PACKS.map((pack) => (
              <div 
                key={pack.id} 
                className={`vton-plan-card ${pack.highlight ? "vton-plan-featured" : ""} ${pack.popular ? "vton-plan-popular" : ""}`}
              >
                {pack.badge && (
                  <div className={`vton-plan-badge ${pack.highlight ? "vton-plan-badge-featured" : ""}`}>
                    {pack.badge}
                  </div>
                )}
                
                <div className="vton-plan-header">
                  <h3 className="vton-plan-name">{pack.name}</h3>
                  <div className="vton-plan-credits">{pack.credits}</div>
                  <div className="vton-plan-credits-label">credits</div>
                </div>

                <div className="vton-plan-features">
                  <p className="vton-plan-description">{pack.description}</p>
                  {pack.savings && (
                    <div className="vton-plan-savings">Save {pack.savings}</div>
                  )}
                  <div className="vton-plan-price-per">€{pack.pricePerCredit.toFixed(2)} per credit</div>
                </div>

                <div className="vton-plan-footer">
                  <div className="vton-plan-price">€{pack.price.toFixed(2)}</div>
                  <button
                    className={`vton-plan-button ${pack.highlight ? "vton-plan-button-primary" : ""}`}
                    onClick={() => handlePurchase(pack.id)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Processing..." : "Get Started"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Custom Pack Section */}
          <div className="vton-custom-section">
            <div className="vton-custom-header">
              <span className="vton-custom-icon"></span>
              <div className="vton-custom-info">
                <div className="vton-custom-title">Custom Pack</div>
                <div className="vton-custom-subtitle">Get bulk pricing for 250+ credits</div>
              </div>
            </div>
            <form
              onSubmit={handleCustomPurchase}
              className="vton-custom-form"
            >
              <div className="vton-custom-input-group">
                <input 
                  type="number" 
                  name="customCredits"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="vton-custom-input"
                  min={250}
                  placeholder="250"
                />
                <span className="vton-custom-input-label">credits</span>
                <button
                  type="submit"
                  className="vton-custom-button-submit"
                  disabled={isSubmitting || !customAmount || parseInt(customAmount) < 250}
                >
                  {isSubmitting ? "Processing..." : "Get Custom Pack"}
                </button>
              </div>
              <div className="vton-custom-price-info">
                €{(parseFloat(customAmount) || 0) * 0.30} total (€0.30 per credit)
              </div>
            </form>
          </div>
        </div>

        {error && (
          <Banner tone="critical" title="Error">
            {error}
          </Banner>
        )}

        {fetcher.data?.success && !fetcher.data?.redirect && (
          <Banner tone="success" title="Success!">
            {fetcher.data.creditsAdded || fetcher.data.credits} credits added to your account.
          </Banner>
        )}
        {fetcher.data?.success && fetcher.data?.redirect && (
          <Banner tone="info" title="Redirecting to payment...">
            Redirecting to Shopify checkout...
          </Banner>
        )}
        {fetcher.data?.error && (
          <Banner 
            tone="critical" 
            title={fetcher.data.requiresAuth ? "Authentication Required" : "Error"}
            action={fetcher.data.requiresAuth && fetcher.data.reauthUrl ? {
              content: "Re-authenticate",
              url: fetcher.data.reauthUrl,
              target: "_top",
            } : undefined}
          >
            {fetcher.data.error}
          </Banner>
        )}
      </div>
    </Page>
  );
}
