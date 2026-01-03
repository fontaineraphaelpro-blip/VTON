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
  try {
    let admin, session;
    try {
      const authResult = await authenticate.admin(request);
      admin = authResult.admin;
      session = authResult.session;
    } catch (authError) {
      // Si authenticate.admin lance une Response (redirection), la gérer
      if (authError instanceof Response) {
        if (authError.status === 401 || authError.status === 302) {
          const reauthUrl = authError.headers.get('x-shopify-api-request-failure-reauthorize-url') || 
                           authError.headers.get('location');
          console.error("[Credits] Authentication required in action", { status: authError.status, reauthUrl });
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
          error: `Erreur d'authentification (${authError.status}). Veuillez rafraîchir la page.`,
          requiresAuth: true,
        });
      }
      // Pour les autres erreurs, les propager
      throw authError;
    }
    
    // Vérifier que la session est valide
    if (!session || !session.shop) {
      console.error("[Credits] Invalid session in action");
      return json({ 
        success: false, 
        error: "Session invalide. Veuillez rafraîchir la page.",
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

        console.log("[Credits] Creating draft order for pack", pack.id);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:133',message:'Before admin.graphql call for draft order',data:{packId:pack.id,shop},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        let response;
        try {
          response = await admin.graphql(mutation, {
            variables,
          });
          console.log("[Credits] GraphQL response received", { 
            ok: response.ok, 
            status: response.status,
            statusText: response.statusText 
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
            console.error("[Credits] Authentication required (401) for draft order creation", { reauthUrl });
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

        console.log("[Credits] Creating custom draft order", { customCredits });
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:340',message:'Before admin.graphql call for custom draft order',data:{customCredits,shop},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        let response;
        try {
          response = await admin.graphql(mutation, {
            variables,
          });
          console.log("[Credits] Custom GraphQL response received", { 
            ok: response.ok, 
            status: response.status,
            statusText: response.statusText 
          });
        } catch (graphqlError) {
          console.error("[Credits] Custom GraphQL call threw error:", graphqlError);
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
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:360',message:'After admin.graphql call for custom draft order',data:{isResponse:response instanceof Response,ok:response?.ok,status:response?.status,statusText:response?.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'E'})}).catch(()=>{});
        // #endregion

        // Check if response is OK
        if (!response.ok) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:331',message:'Custom response not OK',data:{status:response.status,statusText:response.statusText,is401:response.status===401},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          // Handle 401 Unauthorized - authentication required
          if (response.status === 401) {
            const reauthUrl = response.headers.get('x-shopify-api-request-failure-reauthorize-url');
            console.error("[Credits] Authentication required (401) for custom draft order creation", { reauthUrl });
            return json({ 
              success: false, 
              error: "Votre session a expiré. Veuillez rafraîchir la page pour vous ré-authentifier.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          
          const errorText = await response.text().catch(() => `HTTP ${response.status} ${response.statusText}`);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:347',message:'Custom error response text',data:{status:response.status,errorTextLength:errorText.length,errorTextPreview:errorText.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          console.error("GraphQL request failed (custom):", response.status, errorText);
          return json({ 
            success: false, 
            error: `Shopify API error (${response.status}): ${errorText.substring(0, 200)}`,
          });
        }

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:355',message:'Before custom JSON parse',data:{status:response.status,contentType:response.headers.get('content-type'),ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        let responseJson;
        let responseText: string | null = null;
        try {
          // Cloner la réponse pour pouvoir lire le texte si le JSON échoue
          responseText = await response.clone().text();
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:361',message:'Custom response text captured',data:{textLength:responseText.length,textPreview:responseText.substring(0,500),isValidJSON:(()=>{try{JSON.parse(responseText);return true;}catch{return false;}})()},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          responseJson = await response.json();
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:365',message:'Custom JSON parse successful',data:{hasData:!!responseJson.data,hasErrors:!!responseJson.errors},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
        } catch (jsonError) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.credits.tsx:368',message:'Custom JSON parse failed',data:{errorType:jsonError?.constructor?.name,errorMessage:jsonError instanceof Error ? jsonError.message : String(jsonError),responseText:responseText?.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          console.error("Failed to parse JSON response (custom):", jsonError);
          const errorText = responseText || await response.text().catch(() => "Unable to read response");
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
            console.warn(`[Credits] Custom draft order creation failed: ${error.status} ${error.statusText} - Authentication required`, { reauthUrl });
            return json({ 
              success: false, 
              error: "Votre session a expiré. Veuillez rafraîchir la page pour vous ré-authentifier.",
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
  
  const { shop, error } = useLoaderData<typeof loader>();
  console.log("[Credits] Loader data:", { hasShop: !!shop, hasError: !!error, credits: shop?.credits });
  
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const currentCredits = shop?.credits || 0;
  const [customAmount, setCustomAmount] = useState("500");
  
  // Utiliser useRef pour stocker une référence stable à revalidator
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;

  const isSubmitting = fetcher.state === "submitting";
  console.log("[Credits] Component state initialized");

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
      <TitleBar title="Achat Crédits - VTON Magic" />
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" title="Erreur">
              {error}
            </Banner>
          </Layout.Section>
        )}

        {fetcher.data?.success && !fetcher.data?.redirect && (
          <Layout.Section>
            <Banner tone="success" title="Succès !">
              {fetcher.data.creditsAdded || fetcher.data.credits} crédits ajoutés à votre compte.
            </Banner>
          </Layout.Section>
        )}

        {fetcher.data?.success && fetcher.data?.redirect && (
          <Layout.Section>
            <Banner tone="info" title="Redirection vers le paiement...">
              Redirection vers le checkout Shopify...
            </Banner>
          </Layout.Section>
        )}

        {fetcher.data?.error && (
          <Layout.Section>
            <Banner 
              tone="critical" 
              title={fetcher.data.requiresAuth ? "Authentification requise" : "Erreur"}
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
          </Layout.Section>
        )}

        {/* Layout optimisé pour conversion : Crédits + Packs avec pack recommandé en évidence */}
        <Layout.Section>
          <Layout>
            {/* Colonne gauche : Crédits actuels */}
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="300">
                  <Box textAlign="center">
                    <Text variant="heading2xl" as="p" fontWeight="bold">
                      {currentCredits.toLocaleString("en-US")}
                    </Text>
                  </Box>
                  <Box textAlign="center">
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Jetons restants
                    </Text>
                  </Box>
                  <Divider />
                  <Box textAlign="center">
                    <Text variant="bodySm" tone="subdued" as="p">
                      Les jetons n'expirent jamais
                    </Text>
                  </Box>
                  <Button url="/app/history" variant="plain" size="slim" fullWidth>
                    Voir l'historique →
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Colonne droite : Packs de crédits avec pack recommandé au centre */}
            <Layout.Section variant="twoThirds">
              <BlockStack gap="300">
                {/* Packs en layout optimisé : Découverte | Pro (Recommandé au centre) | Starter */}
                <InlineStack gap="300" align="stretch" blockAlign="stretch">
                  {/* Pack Découverte - à gauche */}
                  {CREDIT_PACKS.filter(p => p.id === "decouverte").map((pack) => (
                    <Box key={pack.id} minWidth="0" flexGrow={1}>
                      <Card>
                        <BlockStack gap="250">
                          <BlockStack gap="100">
                            <Text variant="headingMd" as="h3" fontWeight="bold">
                              {pack.name}
                            </Text>
                            <Text variant="headingLg" as="p" fontWeight="bold">
                              {pack.credits} jetons
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                              {pack.description}
                            </Text>
                          </BlockStack>
                          <Divider />
                          <BlockStack gap="150">
                            <BlockStack gap="050">
                              <Text variant="headingMd" as="p" fontWeight="bold">
                                €{pack.price.toFixed(2)}
                              </Text>
                              <Text variant="bodySm" tone="subdued" as="p">
                                €{pack.pricePerCredit.toFixed(2)}/jeton
                              </Text>
                            </BlockStack>
                            <Button
                              variant="secondary"
                              onClick={() => handlePurchase(pack.id)}
                              disabled={isSubmitting}
                              loading={isSubmitting}
                              fullWidth
                            >
                              {isSubmitting ? "Traitement..." : "Acheter"}
                            </Button>
                          </BlockStack>
                        </BlockStack>
                      </Card>
                    </Box>
                  ))}

                  {/* Pack Pro - Recommandé (mis en évidence) */}
                  {CREDIT_PACKS.filter(p => p.highlight).map((pack) => {
                    const savings = pack.credits * 0.40 - pack.price; // Économie vs pack Découverte
                    return (
                      <Box key={pack.id} minWidth="0" flexGrow={1.2}>
                        <Card>
                          {/* Badge "Recommandé" en haut de la carte */}
                          <Box paddingBlockStart="200">
                            <Badge tone="info" size="large">Recommandé</Badge>
                          </Box>
                          <BlockStack gap="300">
                            <BlockStack gap="150">
                              <Text variant="headingLg" as="h3" fontWeight="bold">
                                {pack.name}
                              </Text>
                              <Text variant="heading2xl" as="p" fontWeight="bold">
                                {pack.credits} jetons
                              </Text>
                              <Text variant="bodyMd" tone="subdued" as="p">
                                {pack.description}
                              </Text>
                              {savings > 0 && (
                                <Badge tone="success" size="small">
                                  Économisez €{savings.toFixed(2)} vs Découverte
                                </Badge>
                              )}
                            </BlockStack>
                            <Divider />
                            <BlockStack gap="200">
                              <BlockStack gap="050">
                                <Text variant="heading2xl" as="p" fontWeight="bold">
                                  €{pack.price.toFixed(2)}
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  €{pack.pricePerCredit.toFixed(2)}/jeton
                                </Text>
                                <Text variant="bodySm" tone="success" as="p" fontWeight="medium">
                                  Meilleur prix par jeton
                                </Text>
                              </BlockStack>
                              <Button
                                variant="primary"
                                onClick={() => handlePurchase(pack.id)}
                                disabled={isSubmitting}
                                loading={isSubmitting}
                                fullWidth
                                size="large"
                              >
                                {isSubmitting ? "Traitement..." : "Acheter maintenant"}
                              </Button>
                            </BlockStack>
                          </BlockStack>
                        </Card>
                      </Box>
                    );
                  })}

                  {/* Pack Starter */}
                  {CREDIT_PACKS.filter(p => p.id === "starter").map((pack) => (
                    <Box key={pack.id} minWidth="0" flexGrow={1}>
                      <Card>
                        <BlockStack gap="250">
                          <BlockStack gap="100">
                            <Text variant="headingMd" as="h3" fontWeight="bold">
                              {pack.name}
                            </Text>
                            <Text variant="headingLg" as="p" fontWeight="bold">
                              {pack.credits} jetons
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                              {pack.description}
                            </Text>
                          </BlockStack>
                          <Divider />
                          <BlockStack gap="150">
                            <BlockStack gap="050">
                              <Text variant="headingMd" as="p" fontWeight="bold">
                                €{pack.price.toFixed(2)}
                              </Text>
                              <Text variant="bodySm" tone="subdued" as="p">
                                €{pack.pricePerCredit.toFixed(2)}/jeton
                              </Text>
                            </BlockStack>
                            <Button
                              variant="secondary"
                              onClick={() => handlePurchase(pack.id)}
                              disabled={isSubmitting}
                              loading={isSubmitting}
                              fullWidth
                            >
                              {isSubmitting ? "Traitement..." : "Acheter"}
                            </Button>
                          </BlockStack>
                        </BlockStack>
                      </Card>
                    </Box>
                  ))}
                </InlineStack>

                {/* Message de garantie/confiance sous les packs */}
                <Box padding="200">
                  <Box textAlign="center">
                    <Text variant="bodySm" tone="subdued" as="p">
                      ✓ Paiement sécurisé via Shopify • ✓ Jetons crédités instantanément • ✓ Support 24/7
                    </Text>
                  </Box>
                </Box>
              </BlockStack>
            </Layout.Section>
          </Layout>
        </Layout.Section>

        {/* Historique des recharges - Layout horizontal */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingLg" fontWeight="semibold">
                  Historique des recharges
                </Text>
                <Button url="/app/history" variant="plain" size="slim">
                  Voir tout →
                </Button>
              </InlineStack>
              <Divider />
              <Box padding="300">
                <Box textAlign="center">
                  <Text variant="bodyMd" tone="subdued" as="p">
                    Aucun historique disponible pour le moment
                  </Text>
                </Box>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
