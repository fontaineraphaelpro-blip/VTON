import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
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

// Packs de crédits optimisés avec pack Découverte
const CREDIT_PACKS = [
  {
    id: "decouverte",
    name: "Découverte",
    credits: 25,
    price: 9.99,
    pricePerCredit: 0.40,
    description: "Essai gratuit - Parfait pour tester",
    highlight: false,
    popular: false,
  },
  {
    id: "starter",
    name: "Starter",
    credits: 100,
    price: 29.99,
    pricePerCredit: 0.30,
    description: "Parfait pour démarrer",
    highlight: false,
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 500,
    price: 129.99,
    pricePerCredit: 0.26,
    description: "Idéal pour les boutiques en croissance",
    highlight: true,
    popular: true,
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    
    // Logs de diagnostic CRITIQUES
    console.log("[Credits Loader] Session check:", {
      shop: session?.shop || "NULL",
      hasAccessToken: !!session?.accessToken,
      isOnline: session?.isOnline,
      userId: session?.userId,
    });
    
    if (!session || !session.shop) {
      console.error("[Credits Loader] ❌ Session invalide - shop is null!");
      return json({
        shop: null,
        error: "Session invalide. Veuillez rafraîchir la page.",
      });
    }
    
    const shop = session.shop;

    await ensureTables();
    const shopData = await getShop(shop);

    // Handle return from Shopify payment (app purchase one-time charge)
    const url = new URL(request.url);
    const purchaseSuccess = url.searchParams.get("purchase");
    const packId = url.searchParams.get("pack");
    const creditsParam = url.searchParams.get("credits");

    if (purchaseSuccess === "success" && packId && creditsParam) {
      const creditsToAdd = parseInt(creditsParam);
      if (creditsToAdd > 0 && shopData) {
        // Credit the tokens automatically
        const newCredits = (shopData.credits || 0) + creditsToAdd;
        await upsertShop(shop, { credits: newCredits });
        
        console.log(`[Credits] Auto-credited ${creditsToAdd} credits for pack ${packId}`, {
          shop,
          oldCredits: shopData.credits,
          newCredits,
        });

        // Reload shop data after crediting
        const updatedShopData = await getShop(shop);
        return json({
          shop: updatedShopData || null,
          purchaseSuccess: true,
          creditsAdded: creditsToAdd,
        });
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
        userId: session?.userId,
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
            error: "Votre session a expiré. Veuillez rafraîchir la page pour vous ré-authentifier.",
            requiresAuth: true,
            reauthUrl: reauthUrl || null,
          });
        }
        // Pour toute autre Response, retourner une erreur JSON
        console.error("[Credits Action] ❌ Authentication error:", authError.status);
        return json({ 
          success: false, 
          error: `Erreur d'authentification (${authError.status}). Veuillez rafraîchir la page.`,
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
        error: "Client GraphQL non disponible. Veuillez rafraîchir la page.",
        requiresAuth: true,
      });
    }
    
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");
    
    console.log("[Credits] Action called", { intent, shop });

  if (intent === "purchase-credits") {
    const packId = formData.get("packId") as string;
    const pack = CREDIT_PACKS.find((p) => p.id === packId);

    if (pack) {
      // Create a Shopify one-time charge using REST API (RecurringApplicationCharge)
      try {
        // Build return URL - redirect back to credits page after payment
        const baseUrl = new URL(request.url).origin;
        const returnUrl = new URL("/app/credits", baseUrl);
        returnUrl.searchParams.set("purchase", "success");
        returnUrl.searchParams.set("pack", pack.id);
        returnUrl.searchParams.set("credits", String(pack.credits));

        console.log("[Credits Action] Creating one-time charge using REST API for pack", {
          packId: pack.id,
          packName: pack.name,
          price: pack.price,
          shop,
          returnUrl: returnUrl.toString(),
        });

        // Use Shopify GraphQL API to create a one-time charge (recommended method)
        const mutation = `
          mutation appPurchaseOneTimeCreate($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean) {
            appPurchaseOneTimeCreate(
              name: $name
              price: $price
              returnUrl: $returnUrl
              test: $test
            ) {
              confirmationUrl
              userErrors {
                field
                message
              }
            }
          }
        `;

        const variables = {
          name: `${pack.name} Pack - ${pack.credits} Credits`,
          price: {
            amount: pack.price.toFixed(2),
            currencyCode: "EUR"
          },
          returnUrl: returnUrl.toString(),
          test: process.env.NODE_ENV !== "production"
        };

        console.log("[Credits Action] Creating one-time charge using GraphQL", {
          packId: pack.id,
          packName: pack.name,
          price: pack.price,
          shop,
          returnUrl: returnUrl.toString(),
          variables
        });

        const graphqlResponse = await admin.graphql(mutation, {
          variables
        });

        const graphqlData = await graphqlResponse.json();

        console.log("[Credits Action] GraphQL response received", {
          hasData: !!graphqlData,
          hasErrors: !!graphqlData.errors,
          data: graphqlData
        });

        if (graphqlData.errors) {
          console.error("[Credits] GraphQL errors:", graphqlData.errors);
          const errorMessage = graphqlData.errors.map((e: any) => e.message).join(", ");
          return json({ 
            success: false, 
            error: `Shopify API error: ${errorMessage}`,
          });
        }

        const purchaseData = graphqlData.data?.appPurchaseOneTimeCreate;
        
        if (!purchaseData) {
          console.error("No purchase data returned in response:", graphqlData);
          return json({ 
            success: false, 
            error: "Failed to create charge. Please check your Shopify permissions.",
          });
        }

        if (purchaseData.userErrors && purchaseData.userErrors.length > 0) {
          const errorMessage = purchaseData.userErrors.map((e: any) => e.message).join(", ");
          console.error("User errors:", purchaseData.userErrors);
          return json({ 
            success: false, 
            error: `Shopify API error: ${errorMessage}`,
          });
        }

        if (!purchaseData.confirmationUrl) {
          console.error("No confirmation URL returned:", purchaseData);
          return json({ 
            success: false, 
            error: "Charge created but no confirmation URL available. Please try again.",
          });
        }

        // Return confirmation URL for redirect to Shopify checkout
        return json({ 
          success: true, 
          redirect: true,
          checkoutUrl: purchaseData.confirmationUrl,
          pack: pack.name, 
          credits: pack.credits,
          price: pack.price,
        });
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
            console.warn(`App purchase creation failed: ${error.status} ${error.statusText} - Authentication required`);
            return json({ 
              success: false, 
              error: "Your session has expired. Please refresh the page to re-authenticate.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          console.warn(`App purchase creation failed: ${error.status} ${error.statusText}`);
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
        console.error("Error creating app purchase:", error instanceof Error ? error.message : String(error));
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
        // Build return URL - redirect back to credits page after payment
        const baseUrl = new URL(request.url).origin;
        const returnUrl = new URL("/app/credits", baseUrl);
        returnUrl.searchParams.set("purchase", "success");
        returnUrl.searchParams.set("pack", "custom");
        returnUrl.searchParams.set("credits", String(customCredits));

        console.log("[Credits] Creating custom one-time charge using REST API", { customCredits, totalPrice });

        // Use Shopify GraphQL API to create a one-time charge for custom pack
        const mutation = `
          mutation appPurchaseOneTimeCreate($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean) {
            appPurchaseOneTimeCreate(
              name: $name
              price: $price
              returnUrl: $returnUrl
              test: $test
            ) {
              confirmationUrl
              userErrors {
                field
                message
              }
            }
          }
        `;

        const variables = {
          name: `Custom Pack - ${customCredits} Credits`,
          price: {
            amount: totalPrice.toFixed(2),
            currencyCode: "EUR"
          },
          returnUrl: returnUrl.toString(),
          test: process.env.NODE_ENV !== "production"
        };

        console.log("[Credits] Creating custom one-time charge using GraphQL", { customCredits, totalPrice, variables });

        const graphqlResponse = await admin.graphql(mutation, {
          variables
        });

        const graphqlData = await graphqlResponse.json();

        console.log("[Credits] Custom GraphQL response received", {
          hasData: !!graphqlData,
          hasErrors: !!graphqlData.errors,
          data: graphqlData
        });

        if (graphqlData.errors) {
          console.error("[Credits] Custom GraphQL errors:", graphqlData.errors);
          const errorMessage = graphqlData.errors.map((e: any) => e.message).join(", ");
          return json({ 
            success: false, 
            error: `Shopify API error: ${errorMessage}`,
          });
        }

        const purchaseData = graphqlData.data?.appPurchaseOneTimeCreate;
        
        if (!purchaseData) {
          console.error("No purchase data returned in response (custom):", graphqlData);
          return json({ 
            success: false, 
            error: "Failed to create charge. Please check your Shopify permissions.",
          });
        }

        if (purchaseData.userErrors && purchaseData.userErrors.length > 0) {
          const errorMessage = purchaseData.userErrors.map((e: any) => e.message).join(", ");
          console.error("User errors (custom):", purchaseData.userErrors);
          return json({ 
            success: false, 
            error: `Shopify API error: ${errorMessage}`,
          });
        }

        if (!purchaseData.confirmationUrl) {
          console.error("No confirmation URL returned (custom):", purchaseData);
          return json({ 
            success: false, 
            error: "Charge created but no confirmation URL available. Please try again.",
          });
        }

        // Return confirmation URL for redirect to Shopify checkout
        return json({ 
          success: true, 
          redirect: true,
          checkoutUrl: purchaseData.confirmationUrl,
          pack: "Custom", 
          credits: customCredits,
          price: totalPrice,
        });
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
            console.warn(`[Credits] Custom app purchase creation failed: ${error.status} ${error.statusText} - Authentication required`, { reauthUrl });
            return json({ 
              success: false, 
              error: "Votre session a expiré. Veuillez rafraîchir la page pour vous ré-authentifier.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          console.warn(`Custom app purchase creation failed: ${error.status} ${error.statusText}`);
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
            console.warn(`[Credits] Custom draft order creation failed: ${errorAny.status} ${errorAny.statusText} - Authentication required`, { reauthUrl });
            return json({ 
              success: false, 
              error: "Votre session a expiré. Veuillez rafraîchir la page pour vous ré-authentifier.",
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
        console.error("Error creating custom app purchase:", error instanceof Error ? error.message : String(error));
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
          error: "Votre session a expiré. Veuillez rafraîchir la page pour vous ré-authentifier.",
          requiresAuth: true,
          reauthUrl: reauthUrl || null,
        });
      }
      // Pour toute autre Response, retourner une erreur JSON
      return json({ 
        success: false, 
        error: `Erreur serveur (${error.status}). Veuillez réessayer.`,
        requiresAuth: error.status === 401 || error.status === 302,
      });
    }
    
    // Pour les autres erreurs
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Une erreur est survenue. Veuillez réessayer.",
      requiresAuth: false,
    });
  }
};

export default function Credits() {
  console.log("[Credits] Component rendering");
  
  const { shop, error, purchaseSuccess, creditsAdded } = useLoaderData<typeof loader>();
  console.log("[Credits] Loader data:", { hasShop: !!shop, hasError: !!error, credits: shop?.credits, purchaseSuccess, creditsAdded });
  
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const currentCredits = shop?.credits || 0;
  const [customAmount, setCustomAmount] = useState("500");
  const [submittingPackId, setSubmittingPackId] = useState<string | null>(null);
  
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

  // Rediriger vers le checkout Shopify après création de la commande
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:559',message:'useEffect entry',data:{hasFetcherData:!!fetcher.data,success:fetcher.data?.success,redirect:fetcher.data?.redirect,hasCheckoutUrl:!!fetcher.data?.checkoutUrl,requiresAuth:fetcher.data?.requiresAuth,hasReauthUrl:!!fetcher.data?.reauthUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    let timeoutId: NodeJS.Timeout | null = null;
    let isMounted = true;
    
    // Gérer la ré-authentification automatique
    if (fetcher.data?.requiresAuth && fetcher.data?.reauthUrl) {
      console.log("[Credits] Redirecting to reauth URL:", fetcher.data.reauthUrl);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:567',message:'Redirecting to reauth URL',data:{reauthUrl:fetcher.data.reauthUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      // Rediriger automatiquement vers la ré-authentification
      if (isMounted) {
        window.location.href = fetcher.data.reauthUrl;
      }
      return;
    }
    
    if (fetcher.data?.success && fetcher.data?.redirect && fetcher.data?.checkoutUrl) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:577',message:'Before window.location.href redirect to checkout',data:{checkoutUrl:fetcher.data.checkoutUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Rediriger vers le checkout Shopify
      if (isMounted) {
        window.location.href = fetcher.data.checkoutUrl;
      }
    } else if (fetcher.data?.success && !fetcher.data?.redirect) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:585',message:'Before setTimeout for revalidate',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      // Si pas de redirection, recharger les données (ancien comportement)
      timeoutId = setTimeout(() => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:590',message:'setTimeout callback executing',data:{isMounted},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        if (isMounted) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:593',message:'Calling revalidator.revalidate via ref',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          revalidatorRef.current.revalidate();
        }
      }, 500);
    }
    
    return () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:601',message:'useEffect cleanup - component unmounting',data:{hasTimeout:!!timeoutId},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [fetcher.data]); // Retirer revalidator des dépendances pour éviter les re-renders infinis

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
      <div className="app-container">
        {error && (
          <Banner tone="critical" title="Erreur" onDismiss={() => {}}>
            {error}
          </Banner>
        )}

        {(purchaseSuccess || (fetcher.data?.success && !fetcher.data?.redirect)) && (
          <Banner tone="success" title="Succès !" onDismiss={() => {}}>
            {creditsAdded || fetcher.data?.creditsAdded || fetcher.data?.credits || 0} crédits ajoutés à votre compte.
          </Banner>
        )}

        {fetcher.data?.success && fetcher.data?.redirect && (
          <Banner tone="info" title="Redirection vers le paiement..." onDismiss={() => {}}>
            Redirection vers le checkout Shopify...
          </Banner>
        )}

        {fetcher.data?.error && (
          <Banner 
            tone="critical" 
            title={fetcher.data.requiresAuth ? "Authentification requise" : "Erreur"}
            onDismiss={() => {}}
            action={fetcher.data.requiresAuth ? {
              content: fetcher.data.reauthUrl ? "Ré-authentifier" : "Rafraîchir la page",
              onAction: () => {
                if (fetcher.data.reauthUrl) {
                  window.location.href = fetcher.data.reauthUrl;
                } else {
                  window.location.reload();
                }
              },
            } : undefined}
          >
            {fetcher.data.error}
          </Banner>
        )}

        <header className="app-header">
          <h1 className="app-title">Credits</h1>
          <p className="app-subtitle">
            Use credits to generate virtual try-ons instantly
          </p>
        </header>

        <div className="credits-balance">
          <div>
            <div className="credits-amount">{currentCredits.toLocaleString("en-US")}</div>
            <div className="credits-label">Credits available</div>
          </div>
        </div>

        <div className="pricing-grid">
          {CREDIT_PACKS.map((pack) => (
            <div key={pack.id} className={`plan-card ${pack.highlight ? 'featured' : ''}`}>
              {pack.highlight && (
                <div className="plan-badge">Most popular</div>
              )}
              <div className="plan-name">{pack.name}</div>
              <div className="plan-price">
                €{pack.price.toFixed(2)} <span>/ one-time</span>
              </div>
              <div className="plan-features">
                <div className="plan-feature">• {pack.credits} credits</div>
                <div className="plan-feature">• No expiration</div>
                <div className="plan-feature">• {pack.description}</div>
              </div>
              <div className="plan-cta">
                <button 
                  className="plan-button"
                  onClick={() => handlePurchase(pack.id)}
                  disabled={isSubmitting || submittingPackId !== null}
                >
                  {isSubmitting && submittingPackId === pack.id ? "Processing..." : "Buy credits"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
