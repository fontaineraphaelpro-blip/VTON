import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { generateTryOn } from "../lib/services/replicate.service";
import { getShop, upsertShop, createTryonLog, query } from "../lib/services/db.service";
import { getProductImageUrl } from "../lib/services/shopify.service";

/**
 * POST /apps/tryon/generate
 * 
 * Body:
 * - user_photo: Base64 data URL de la photo utilisateur
 * - product_id: ID du produit Shopify
 * 
 * Returns:
 * - result_url: URL de l'image générée
 * - error: Message d'erreur si échec
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    
    if (!shop) {
      return json({ error: "Missing shop parameter" }, { status: 400 });
    }

    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return json({ 
        error: "Invalid JSON in request body. Please check your request format." 
      }, { 
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }
    
    // Log request in development
    if (process.env.NODE_ENV !== "production") {
      console.log("[Generate] Received request:", {
        shop: shop,
        hasUserPhoto: !!body.user_photo,
        hasProductId: !!body.product_id,
        hasProductHandle: !!body.product_handle,
        hasProductImageUrl: !!body.product_image_url,
        productImageUrl: body.product_image_url
      });
    }
    const { user_photo, product_id, product_handle, product_image_url } = body;

    // Validate required fields
    if (!user_photo) {
      return json({ 
        error: "Missing required parameter: user_photo. Please provide a user photo." 
      }, { 
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }

    if (!product_id) {
      return json({ 
        error: "Missing required parameter: product_id. Please provide a product ID." 
      }, { 
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }

    // Vérifier que le shop existe et a des crédits
    const shopRecord = await getShop(shop);
    if (!shopRecord) {
      return json({ error: "Shop not found" }, { status: 404 });
    }

    // Vérifier et gérer le renouvellement mensuel des crédits
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastResetMonth = shopRecord.last_quota_reset || currentMonth;
    const monthlyQuota = shopRecord.monthly_quota || 0;
    
    let currentCredits = shopRecord.credits || 0;
    
    // Si changement de mois et qu'un plan est actif, renouveler les crédits
    if (lastResetMonth !== currentMonth && monthlyQuota > 0) {
      // Reset à 0 puis ajouter les crédits du plan
      currentCredits = monthlyQuota;
      await upsertShop(shop, { 
        credits: monthlyQuota, // Reset to plan credits
        last_quota_reset: currentMonth 
      });
      if (process.env.NODE_ENV !== "production") {
        console.log(`[Generate] Monthly renewal: reset credits to ${monthlyQuota} for plan`);
      }
    }
    
    // Si pas de plan actif et changement de mois, reset à 0
    if (lastResetMonth !== currentMonth && monthlyQuota === 0) {
      currentCredits = 0;
      await upsertShop(shop, { 
        credits: 0,
        last_quota_reset: currentMonth 
      });
    }

    if (currentCredits <= 0) {
      return json({ 
        error: "No credits available. Please purchase a plan to continue." 
      }, { status: 403 });
    }

    // Récupérer l'URL de l'image produit depuis le body (doit être fournie par le widget)
    // L'URL de l'image produit doit être accessible publiquement (URL CDN Shopify)
    const productImageUrl = product_image_url;
    
    if (!productImageUrl) {
      return json({ 
        error: "Missing product_image_url parameter. The widget must provide the product image URL." 
      }, { 
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }
    
    // Vérifier que l'URL est valide et accessible
    if (typeof productImageUrl !== 'string' || !productImageUrl.startsWith('http')) {
      return json({ 
        error: `Invalid product_image_url format. Must be a valid HTTP/HTTPS URL. Received: ${typeof productImageUrl === 'string' ? productImageUrl.substring(0, 100) : typeof productImageUrl}` 
      }, { 
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }

    // Generation started
    const startTime = Date.now();
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || 
                     null;

    try {
      console.log("[Generate] Starting Replicate generation...");
      
      // Validate user_photo format
      if (typeof user_photo !== 'string') {
        throw new Error("Invalid user_photo format. Expected a string (base64 data URL or URL).");
      }

      // Générer l'image avec Replicate (synchrone - attend le résultat)
      const resultUrl = await generateTryOn({
        userPhoto: user_photo,
        productImageUrl: productImageUrl,
      });

      // Validate result URL
      if (!resultUrl || typeof resultUrl !== 'string' || !resultUrl.startsWith('http')) {
        throw new Error(`Invalid result URL returned from generation service: ${resultUrl}`);
      }

      const latencyMs = Date.now() - startTime;
      console.log("[Generate] Replicate generation completed in", latencyMs, "ms");

      // Décrémenter les crédits et incrémenter le compteur total de try-ons
      await upsertShop(shop, { 
        credits: currentCredits - 1, // Deduct one credit
        incrementTotalTryons: true
      });

      // Créer un log de succès
      await createTryonLog({
        shop: shop,
        customerIp: clientIp || undefined,
        productId: product_id,
        productHandle: product_handle,
        success: true,
        latencyMs: latencyMs,
        resultImageUrl: resultUrl,
      }).catch((logError) => {
        // Log error but don't fail the request
        console.error("[Generate] Failed to create success log:", logError);
      });

      console.log("[Generate] Returning success response:", {
        result_url: resultUrl,
        success: true,
        latencyMs: latencyMs
      });

      return json({
        result_url: resultUrl,
        success: true,
      }, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    } catch (genError) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = genError instanceof Error ? genError.message : 'Unknown error';
      
      console.error("[Generate] Generation failed after", latencyMs, "ms:", errorMessage);
      
      // Créer un log d'erreur (don't fail if logging fails)
      createTryonLog({
        shop: shop,
        customerIp: clientIp || undefined,
        productId: product_id,
        productHandle: product_handle,
        success: false,
        errorMessage: errorMessage,
        latencyMs: latencyMs,
      }).catch((logError) => {
        console.error("[Generate] Failed to create error log:", logError);
      });

      // Return error response instead of throwing
      return json({
        error: errorMessage,
        success: false,
      }, {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }
  } catch (error) {
    // Log error (always log for debugging)
    const errorMessage = error instanceof Error ? error.message : "Generation failed";
    console.error("[Generate] Unexpected error:", errorMessage, error);
    
    // Return user-friendly error message
    return json(
      {
        error: `An unexpected error occurred: ${errorMessage}. Please try again or contact support if the issue persists.`,
        success: false,
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Content-Type": "application/json",
        },
      }
    );
  }
};
