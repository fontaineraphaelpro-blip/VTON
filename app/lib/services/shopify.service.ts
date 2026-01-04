/**
 * Service pour interagir avec l'API Shopify
 */

/**
 * Récupère l'URL de l'image principale d'un produit
 * Pour l'instant, on utilise l'image du produit depuis le storefront
 * En production, on pourrait utiliser l'Admin API pour récupérer l'image
 */
export async function getProductImageUrl(shop: string, productId: string): Promise<string | null> {
  try {
    // Construire l'URL de l'image produit depuis le storefront
    // Format: https://{shop}/products/{handle}/images/{image_id}
    // Pour simplifier, on utilise l'image principale du produit
    // En production, on devrait utiliser l'Admin API GraphQL
    
    // Pour l'instant, on retourne une URL générique
    // L'endpoint devra être mis à jour pour utiliser l'Admin API
    const productImageUrl = `https://${shop}/products/${productId}/images/1`;
    
    return productImageUrl;
  } catch (error) {
    console.error(`[Shopify Service] Error getting product image for ${productId}:`, error);
    return null;
  }
}

