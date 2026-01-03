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
      // Create a Shopify checkout URL for payment
      try {
        // Use Shopify Billing API for one-time charge (app purchase)
        // This is the recommended way for in-app purchases and credit packs
        const mutation = `#graphql
          mutation appPurchaseOneTimeCreate(
            $name: String!
            $price: MoneyInput!
            $returnUrl: URL!
          ) {
            appPurchaseOneTimeCreate(
              name: $name
              price: $price
              returnUrl: $returnUrl
              test: false
            ) {
              confirmationUrl
              userErrors {
                message
                field
              }
            }
          }
        `;

        // Build return URL - redirect back to credits page after payment
        // Must be an absolute URL for Shopify Billing API
        const baseUrl = new URL(request.url).origin;
        const returnUrl = new URL("/app/credits", baseUrl);
        returnUrl.searchParams.set("purchase", "success");
        returnUrl.searchParams.set("pack", pack.id);
        returnUrl.searchParams.set("credits", String(pack.credits));

        const variables = {
          name: `${pack.name} Pack - ${pack.credits} Credits`,
          price: {
            amount: pack.price.toFixed(2),
            currencyCode: "EUR", // Adjust based on shop currency
          },
          returnUrl: returnUrl.toString(),
        };

        console.log("[Credits Action] Creating app purchase one-time charge for pack", {
          packId: pack.id,
          packName: pack.name,
          price: pack.price,
          shop,
          returnUrl: returnUrl.toString(),
        });
        
        let response;
        try {
          // Utiliser admin.graphql() - c'est la SEULE méthode valide
          response = await admin.graphql(mutation, {
            variables,
          });
          
          console.log("[Credits Action] ✅ GraphQL response received", { 
            ok: response.ok, 
            status: response.status,
            statusText: response.statusText,
            isResponse: response instanceof Response,
          });
        } catch (graphqlError) {
          console.error("[Credits] GraphQL call threw error:", graphqlError);
          // Si c'est une Response (redirection d'auth), la gérer
          if (graphqlError instanceof Response) {
            if (graphqlError.status === 401) {
              const reauthUrl = graphqlError.headers.get('x-shopify-api-request-failure-reauthorize-url');
              return json({ 
                success: false, 
                error: "Votre session a expiré. Veuillez rafraîchir la page pour vous ré-authentifier.",
                requiresAuth: true,
                reauthUrl: reauthUrl || null,
              });
            }
          }
          throw graphqlError;
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:150',message:'After admin.graphql call for draft order',data:{isResponse:response instanceof Response,ok:response?.ok,status:response?.status,statusText:response?.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'E'})}).catch(()=>{});
        // #endregion

        // Check if response is OK
        if (!response.ok) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:127',message:'Response not OK',data:{status:response.status,statusText:response.statusText,is401:response.status===401},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          // Handle 401 Unauthorized - authentication required
          if (response.status === 401) {
            const reauthUrl = response.headers.get('x-shopify-api-request-failure-reauthorize-url');
            console.error("[Credits] Authentication required (401) for app purchase creation", { reauthUrl });
            return json({ 
              success: false, 
              error: "Votre session a expiré. Veuillez rafraîchir la page pour vous ré-authentifier.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          
          const errorText = await response.text().catch(() => `HTTP ${response.status} ${response.statusText}`);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:143',message:'Error response text',data:{status:response.status,errorTextLength:errorText.length,errorTextPreview:errorText.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          console.error("GraphQL request failed:", response.status, errorText);
          return json({ 
            success: false, 
            error: `Shopify API error (${response.status}): ${errorText.substring(0, 200)}`,
          });
        }

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:151',message:'Before JSON parse',data:{status:response.status,contentType:response.headers.get('content-type'),ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        let responseJson;
        let responseText: string | null = null;
        try {
          // Cloner la réponse pour pouvoir lire le texte si le JSON échoue
          responseText = await response.clone().text();
          console.log("[Credits] Response text length:", responseText.length);
          console.log("[Credits] Response text preview:", responseText.substring(0, 500));
          
          // Vérifier si c'est du JSON valide
          try {
            JSON.parse(responseText);
            console.log("[Credits] Response text is valid JSON");
          } catch (parseError) {
            console.error("[Credits] Response text is NOT valid JSON:", parseError);
            console.error("[Credits] Full response text:", responseText);
          }
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:157',message:'Response text captured',data:{textLength:responseText.length,textPreview:responseText.substring(0,500),isValidJSON:(()=>{try{JSON.parse(responseText);return true;}catch{return false;}})()},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          
          responseJson = await response.json();
          console.log("[Credits] JSON parsed successfully");
          console.log("[Credits] Response JSON keys:", Object.keys(responseJson));
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:161',message:'JSON parse successful',data:{hasData:!!responseJson.data,hasErrors:!!responseJson.errors},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
        } catch (jsonError) {
          console.error("[Credits] Failed to parse JSON response:", jsonError);
          console.error("[Credits] JSON Error type:", jsonError?.constructor?.name);
          console.error("[Credits] JSON Error message:", jsonError instanceof Error ? jsonError.message : String(jsonError));
          console.error("[Credits] Response text that failed:", responseText?.substring(0, 1000));
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:164',message:'JSON parse failed',data:{errorType:jsonError?.constructor?.name,errorMessage:jsonError instanceof Error ? jsonError.message : String(jsonError),responseText:responseText?.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          
          const errorText = responseText || await response.text().catch(() => "Unable to read response");
          return json({ 
            success: false, 
            error: `Invalid JSON response from Shopify: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}. Response preview: ${errorText.substring(0, 200)}`,
          });
        }
        
        // Log the full response for debugging
        console.log("App purchase one-time charge response:", JSON.stringify(responseJson, null, 2));
        
        // Check for GraphQL errors
        if (responseJson.errors) {
          const errorMessages = responseJson.errors.map((e: any) => e.message || String(e)).join(", ");
          console.error("GraphQL errors:", errorMessages);
          return json({ 
            success: false, 
            error: `GraphQL error: ${errorMessages}`,
          });
        }
        
        const purchaseResult = responseJson.data?.appPurchaseOneTimeCreate;
        const errors = purchaseResult?.userErrors || [];

        if (errors && errors.length > 0) {
          const errorMessages = errors.map((e: any) => `${e.field ? `${e.field}: ` : ""}${e.message}`).join(", ");
          console.error("App purchase errors:", errorMessages);
          return json({ 
            success: false, 
            error: `Failed to create purchase: ${errorMessages}`,
          });
        }

        if (!purchaseResult || !purchaseResult.confirmationUrl) {
          console.error("No confirmation URL returned:", responseJson);
          return json({ 
            success: false, 
            error: "Failed to create app purchase. Please check your Shopify permissions.",
          });
        }

        // Return confirmation URL for redirect to Shopify checkout
        return json({ 
          success: true, 
          redirect: true,
          checkoutUrl: purchaseResult.confirmationUrl,
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

        // Use Shopify REST API to create a RecurringApplicationCharge for custom pack
        const chargeData = {
          recurring_application_charge: {
            name: `Custom Pack - ${customCredits} Credits`,
            price: totalPrice.toFixed(2),
            return_url: returnUrl.toString(),
            test: process.env.NODE_ENV !== "production",
            trial_days: 0,
            capped_amount: totalPrice.toFixed(2),
          }
        };

        // Make REST API call to Shopify
        const apiUrl = `https://${shop}/admin/api/2025-01/recurring_application_charges.json`;
        
        let restResponse;
        try {
          restResponse = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": session.accessToken,
            },
            body: JSON.stringify(chargeData),
          });

          console.log("[Credits] Custom REST API response received", { 
            ok: restResponse.ok, 
            status: restResponse.status,
            statusText: restResponse.statusText,
          });
        } catch (restError) {
          console.error("[Credits] Custom REST API call threw error:", restError);
          if (restError instanceof Response) {
            if (restError.status === 401) {
              const reauthUrl = restError.headers.get('x-shopify-api-request-failure-reauthorize-url');
              return json({ 
                success: false, 
                error: "Votre session a expiré. Veuillez rafraîchir la page pour vous ré-authentifier.",
                requiresAuth: true,
                reauthUrl: reauthUrl || null,
              });
            }
          }
          throw restError;
        }

        // Check if response is OK
        if (!restResponse.ok) {
          if (restResponse.status === 401) {
            const reauthUrl = restResponse.headers.get('x-shopify-api-request-failure-reauthorize-url');
            console.error("[Credits] Authentication required (401) for custom charge creation", { reauthUrl });
            return json({ 
              success: false, 
              error: "Votre session a expiré. Veuillez rafraîchir la page pour vous ré-authentifier.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          
          const errorText = await restResponse.text().catch(() => `HTTP ${restResponse.status} ${restResponse.statusText}`);
          console.error("REST API request failed (custom):", restResponse.status, errorText);
          return json({ 
            success: false, 
            error: `Shopify API error (${restResponse.status}): ${errorText.substring(0, 200)}`,
          });
        }
        
        let responseJson;
        try {
          responseJson = await restResponse.json();
          console.log("[Credits] Custom REST API JSON parsed successfully");
          console.log("[Credits] Response JSON:", JSON.stringify(responseJson, null, 2));
        } catch (jsonError) {
          console.error("Failed to parse JSON response (custom):", jsonError);
          const errorText = await restResponse.text().catch(() => "Unable to read response");
          return json({ 
            success: false, 
            error: `Invalid response from Shopify: ${errorText.substring(0, 200)}`,
          });
        }
        
        // Extract confirmation URL from REST API response
        const charge = responseJson.recurring_application_charge;
        
        if (!charge) {
          console.error("No charge returned in response (custom):", responseJson);
          return json({ 
            success: false, 
            error: "Failed to create charge. Please check your Shopify permissions.",
          });
        }

        if (!charge.confirmation_url) {
          console.error("No confirmation URL returned (custom):", charge);
          return json({ 
            success: false, 
            error: "Charge created but no confirmation URL available. Please try again.",
          });
        }

        // Return confirmation URL for redirect to Shopify checkout
        return json({ 
          success: true, 
          redirect: true,
          checkoutUrl: charge.confirmation_url,
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
  
  // Utiliser useRef pour stocker une référence stable à revalidator
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;

  const isSubmitting = fetcher.state === "submitting";
  console.log("[Credits] Component state initialized", { 
    isSubmitting, 
    fetcherState: fetcher.state,
    fetcherData: fetcher.data 
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

  const handlePurchase = (packId: string) => {
    console.log("[Credits] handlePurchase called", { packId, isSubmitting, fetcherState: fetcher.state });
    
    if (isSubmitting) {
      console.warn("[Credits] Purchase already in progress, ignoring click");
      return;
    }
    
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
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Processing..." : "Buy credits"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
