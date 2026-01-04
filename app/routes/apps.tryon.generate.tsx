import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { generateTryOn } from "../lib/services/replicate.service";
import { getShop, upsertShop } from "../lib/services/db.service";
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

    // Récupérer l'URL de l'image produit depuis le body ou construire depuis le shop
    let productImageUrl = product_image_url;
    
    if (!productImageUrl) {
      // Fallback: essayer de récupérer depuis le service Shopify
      productImageUrl = await getProductImageUrl(shop, product_id);
      if (!productImageUrl) {
        return json({ error: "Could not retrieve product image" }, { status: 404 });
      }
    }

    console.log(`[Generate] Starting generation for shop ${shop}, product ${product_id}`);

    // Générer l'image avec Replicate
    const resultUrl = await generateTryOn({
      userPhoto: user_photo,
      productImageUrl: productImageUrl,
    });

    // Incrémenter le quota utilisé
    await upsertShop(shop, { 
      monthly_quota_used: (monthlyQuotaUsed + 1) 
    });

    // Logger le résultat
    console.log(`[Generate] Generation successful for shop ${shop}, product ${product_id}, result: ${resultUrl}`);

    return json({
      result_url: resultUrl,
      success: true,
    });
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
