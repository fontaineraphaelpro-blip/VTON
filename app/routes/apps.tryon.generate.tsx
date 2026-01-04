import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { generateTryOn } from "../lib/services/replicate.service";
import { getShop, upsertShop, createTryonLog } from "../lib/services/db.service";
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
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    
    if (!shop) {
      return json({ error: "Missing shop parameter" }, { status: 400 });
    }

    const body = await request.json();
    const { user_photo, product_id, product_image_url } = body;

    console.log('[Generate] Received request body:', {
      has_user_photo: !!user_photo,
      has_product_id: !!product_id,
      has_product_image_url: !!product_image_url,
      product_image_url: product_image_url
    });

    if (!user_photo || !product_id) {
      return json({ error: "Missing user_photo or product_id" }, { status: 400 });
    }

    // Vérifier que le shop existe et a des crédits
    const shopRecord = await getShop(shop);
    if (!shopRecord) {
      return json({ error: "Shop not found" }, { status: 404 });
    }

    // Vérifier les crédits/quota mensuel
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastResetMonth = shopRecord.last_quota_reset || currentMonth;

    if (lastResetMonth !== currentMonth) {
      // Reset du quota mensuel
      await upsertShop(shop, { 
        monthly_quota_used: 0,
        last_quota_reset: currentMonth 
      });
    }

    // Vérifier le quota mensuel
    const monthlyQuota = shopRecord.monthly_quota || 0;
    const monthlyQuotaUsed = shopRecord.monthly_quota_used || 0;

    if (monthlyQuotaUsed >= monthlyQuota) {
      return json({ 
        error: "Monthly quota exceeded. Please upgrade your plan." 
      }, { status: 403 });
    }

    // Récupérer l'URL de l'image produit depuis le body (doit être fournie par le widget)
    // L'URL de l'image produit doit être accessible publiquement (URL CDN Shopify)
    const productImageUrl = product_image_url;
    
    if (!productImageUrl) {
      return json({ error: "Missing product_image_url parameter. The widget must provide the product image URL." }, { status: 400 });
    }
    
    // Vérifier que l'URL est valide et accessible
    if (!productImageUrl.startsWith('http')) {
      return json({ error: "Invalid product_image_url format. Must be a valid HTTP/HTTPS URL." }, { status: 400 });
    }

    console.log(`[Generate] Starting generation for shop ${shop}, product ${product_id}`);

    const startTime = Date.now();

    try {
      // Générer l'image avec Replicate
      const resultUrl = await generateTryOn({
        userPhoto: user_photo,
        productImageUrl: productImageUrl,
      });

      const latencyMs = Date.now() - startTime;

      // Incrémenter le quota utilisé
      await upsertShop(shop, { 
        monthly_quota_used: (monthlyQuotaUsed + 1) 
      });

      // Créer un log de succès
      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                       request.headers.get('x-real-ip') || 
                       null;
      
      await createTryonLog({
        shop: shop,
        customerIp: clientIp || undefined,
        productId: product_id,
        success: true,
        latencyMs: latencyMs,
        resultImageUrl: resultUrl,
      });

      // Logger le résultat
      console.log(`[Generate] Generation successful for shop ${shop}, product ${product_id}, result: ${resultUrl}, latency: ${latencyMs}ms`);

      return json({
        result_url: resultUrl,
        success: true,
      });
    } catch (genError) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = genError instanceof Error ? genError.message : 'Unknown error';
      
      // Créer un log d'erreur
      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                       request.headers.get('x-real-ip') || 
                       null;
      
      await createTryonLog({
        shop: shop,
        customerIp: clientIp || undefined,
        productId: product_id,
        success: false,
        errorMessage: errorMessage,
        latencyMs: latencyMs,
      });

      // Re-throw l'erreur pour qu'elle soit gérée par le catch externe
      throw genError;
    }
  } catch (error) {
    console.error("[Generate] Error:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Generation failed",
        success: false,
      },
      { status: 500 }
    );
  }
};
