/**
 * Service pour interagir avec l'API Shopify
 */

/**
 * Récupère l'URL publique CDN de l'image principale d'un produit
 * Utilise l'URL CDN Shopify qui est accessible publiquement
 */
export async function getProductImageUrl(shop: string, productHandle: string): Promise<string | null> {
  try {
    // Construire l'URL CDN publique de l'image produit
    // Format Shopify CDN: https://cdn.shopify.com/s/files/1/{shop_id}/products/{filename}
    // Pour simplifier, on utilise l'URL storefront qui redirige vers le CDN
    // L'URL storefront avec /products/{handle} affiche l'image via le CDN
    
    // Alternative: utiliser l'URL storefront qui sera résolue par Shopify
    // Format: https://{shop}/cdn/shop/products/{filename} ou via l'API Storefront
    
    // Pour l'instant, on utilise une approche simple: construire l'URL CDN standard
    // En production, il faudrait utiliser l'Admin API GraphQL pour récupérer l'URL exacte
    
    // Note: Cette URL doit être accessible publiquement pour Replicate
    // L'URL storefront standard fonctionne généralement car Shopify expose les images publiquement
    const productImageUrl = `https://${shop}/products/${productHandle}`;
    
    // Cette URL redirige vers l'image, mais on a besoin de l'URL directe de l'image
    // Pour l'instant, on retourne null et on laisse l'appelant gérer
    // En production, utiliser l'Admin API GraphQL:
    // query { product(handle: $handle) { images(first: 1) { edges { node { url } } } } }
    
    return null; // Retourner null pour forcer l'utilisation d'une méthode alternative
  } catch (error) {
    // Log only in development
    if (process.env.NODE_ENV !== "production") {
      console.error(`[Shopify Service] Error getting product image for ${productHandle}:`, error);
    }
    return null;
  }
}

/**
 * Vérifie le statut de l'abonnement Shopify pour une boutique
 * Utilise l'API GraphQL Admin de Shopify pour vérifier les abonnements actifs
 * 
 * @param admin - Instance du client GraphQL Admin Shopify
 * @returns Object avec le statut de l'abonnement et les détails
 */
export async function checkShopifySubscriptionStatus(admin: any): Promise<{
  hasActiveSubscription: boolean;
  subscriptions: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
    currentPeriodEnd?: string;
  }>;
}> {
  try {
    const query = `#graphql
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            createdAt
            currentPeriodEnd
            lineItems {
              id
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    price {
                      amount
                      currencyCode
                    }
                    interval
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query);
    
    if (!response.ok) {
      console.error(`[Shopify Service] Failed to fetch subscription status: ${response.status}`);
      return {
        hasActiveSubscription: false,
        subscriptions: [],
      };
    }

    const data = await response.json();
    const subscriptions = data.data?.currentAppInstallation?.activeSubscriptions || [];
    
    // Filtrer les abonnements actifs
    const activeSubscriptions = subscriptions.filter(
      (sub: any) => sub.status === "ACTIVE"
    );

    return {
      hasActiveSubscription: activeSubscriptions.length > 0,
      subscriptions: subscriptions.map((sub: any) => ({
        id: sub.id,
        name: sub.name,
        status: sub.status,
        createdAt: sub.createdAt,
        currentPeriodEnd: sub.currentPeriodEnd,
      })),
    };
  } catch (error) {
    console.error("[Shopify Service] Error checking subscription status:", error);
    return {
      hasActiveSubscription: false,
      subscriptions: [],
    };
  }
}

