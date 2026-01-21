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
import { authenticate } from "../shopify.server";
import { getShop, upsertShop, query } from "../lib/services/db.service";
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
  // 1. RECUPERATION DES PARAMS (AVANT TOUT)
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const chargeId = url.searchParams.get("charge_id");
  const purchaseSuccess = url.searchParams.get("purchase");
  const packId = url.searchParams.get("pack");
  const creditsParam = url.searchParams.get("credits");
  
  // 2. BLOC DE SAUVETAGE (DOIT ETRE ICI, TOUT EN HAUT, AVANT LE TRY)
  // Si on revient de Shopify après paiement, on a perdu la session.
  // On redirige vers /auth pour que Shopify la restaure via OAuth.
  // IMPORTANT: Ce bloc DOIT être exécuté AVANT authenticate.admin() pour éviter la redirection vers /auth/login
  if (shop && chargeId) {
    const returnUrl = `/app/credits?charge_id=${encodeURIComponent(chargeId)}&shop=${encodeURIComponent(shop)}`;
    return redirect(`/auth?shop=${encodeURIComponent(shop)}&return_to=${encodeURIComponent(returnUrl)}`);
  }
  
  // 3. AUTHENTIFICATION SHOPIFY
  // Si le code arrive ici sans session, authenticate.admin va lancer une erreur 
  // et rediriger vers /auth/login (ce qui cause l'écran noir).
  // C'est pour ça que l'étape 2 doit être avant.
  try {
    // authenticate.admin will automatically handle re-authentication if needed
    // It will redirect to /auth which will handle OAuth flow and return to the original URL
    const { admin, session } = await authenticate.admin(request);
    
    if (!session || !session.shop) {
      return json({
        shop: null,
        error: "Session invalide. Veuillez rafraîchir la page.",
      });
    }
    
    const shop = session.shop;

    await ensureTables();
    const shopData = await getShop(shop);

    // Handle return from Shopify payment - check charge_id first (subscription payments)
    // charge_id indicates a subscription payment return
    if (chargeId) {
      // Verify the charge was successful and update subscription status
      try {
        const subscriptionQuery = `#graphql
          query {
            currentAppInstallation {
              activeSubscriptions {
                id
                name
                status
                test
                lineItems {
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

        const subscriptionResponse = await admin.graphql(subscriptionQuery);
        const subscriptionData = await subscriptionResponse.json() as any;
        
        const activeSubscriptions = subscriptionData?.data?.currentAppInstallation?.activeSubscriptions || [];
        const activeSubscription = activeSubscriptions.find((sub: any) => 
          sub.status === "ACTIVE" && !sub.test
        );

        // Si un abonnement actif est trouvé, mettre à jour les crédits et le plan
        if (activeSubscription) {
          const planName = activeSubscription.name.toLowerCase().replace(/\s+/g, '-');

          // Définir les crédits mensuels selon le plan
          const planCredits: Record<string, number> = {
            "free-installation-setup": 4,
            "starter": 100,
            "pro": 500,
            "studio": 2000,
          };

          const monthlyCredits = planCredits[planName] || planCredits["free-installation-setup"];
          
          // Mettre à jour le shop avec le nouveau plan et crédits
          await upsertShop(shop, {
            monthlyQuota: monthlyCredits,
          });

          // Mettre à jour plan_name dans la base de données
          try {
            await query(
              `ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_name TEXT`
            );
            await query(
              `UPDATE shops SET plan_name = $1 WHERE domain = $2`,
              [planName, shop]
            );
          } catch (planError) {
            // Ignore
          }

          // Recharger les données du shop après mise à jour
          const updatedShopData = await getShop(shop);
          return json({
            shop: updatedShopData || null,
            subscriptionUpdated: true,
            planName: planName,
            subscriptionActivated: true,
            activeSubscriptionName: activeSubscription.name,
          });
        }
      } catch (subscriptionError) {
        // Continue - will show normal page even if subscription check fails
      }
    }

    // Handle return from Shopify payment (app purchase one-time charge)
    if (purchaseSuccess === "success" && packId && creditsParam) {
      const creditsToAdd = parseInt(creditsParam);
      if (creditsToAdd > 0 && shopData) {
        // Credit the tokens automatically
        const newCredits = (shopData.credits || 0) + creditsToAdd;
        await upsertShop(shop, { credits: newCredits });
        
        // Reload shop data after crediting
        const updatedShopData = await getShop(shop);
        return json({
          shop: updatedShopData || null,
          purchaseSuccess: true,
          creditsAdded: creditsToAdd,
        });
      }
    }

    // Check for active subscriptions to determine current plan
    let currentActivePlan: string | null = null;
    try {
      const subscriptionQuery = `#graphql
        query {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
              status
              test
              lineItems {
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

      const subscriptionResponse = await admin.graphql(subscriptionQuery);
      const subscriptionData = await subscriptionResponse.json() as any;
      
      const activeSubscriptions = subscriptionData?.data?.currentAppInstallation?.activeSubscriptions || [];
      const activeSubscription = activeSubscriptions.find((sub: any) => 
        sub.status === "ACTIVE" && !sub.test
      );

      if (activeSubscription) {
        // Normalize plan name (e.g., "Starter" -> "starter")
        currentActivePlan = activeSubscription.name.toLowerCase().replace(/\s+/g, '-');
      }
    } catch (subscriptionError) {
      // Continue even if subscription check fails - will show all plans as available
    }

    return json({
      shop: shopData || null,
      currentActivePlan: currentActivePlan, // Plan ID currently active (e.g., "starter", "pro")
    });
  } catch (error) {
    // Si c'est une Response (redirection d'auth), la propager directement
    // authenticate.admin gère automatiquement la ré-authentification
    // IMPORTANT: authenticate.admin préserve automatiquement l'URL complète (avec query params)
    // dans le paramètre return_to de la redirection OAuth, donc charge_id sera préservé
    if (error instanceof Response) {
      // authenticate.admin redirige vers /auth/login quand pas de session
      // On doit préserver l'URL complète avec tous les paramètres (charge_id, etc.)
      const url = new URL(request.url);
      const currentUrl = url.toString();
      
      // Si la redirection est vers /auth/login, ajouter return_to avec l'URL complète
      const location = error.headers.get("location");
      if (location && location.includes("/auth/login")) {
        const redirectUrl = new URL(location, request.url);
        redirectUrl.searchParams.set("return_to", currentUrl);
        
        return new Response(null, {
          status: 302,
          headers: {
            Location: redirectUrl.toString(),
          },
        });
      }
      
      // Pour les autres redirections, propager directement
      throw error;
    }
    
    // Only log non-Response errors
    if (process.env.NODE_ENV !== "production") {
      console.error("[Credits Loader] ❌ Error:", error);
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
      
    } catch (authError) {
      // Si authenticate.admin lance une Response (redirection), la gérer
      if (authError instanceof Response) {
        if (authError.status === 401 || authError.status === 302) {
          const reauthUrl = authError.headers.get('x-shopify-api-request-failure-reauthorize-url') || 
                           authError.headers.get('location');
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
      return json({ 
        success: false, 
        error: "Session invalide. Veuillez rafraîchir la page.",
        requiresAuth: true,
      });
    }
    
    if (!admin) {
      return json({ 
        success: false, 
        error: "Client GraphQL non disponible. Veuillez rafraîchir la page.",
        requiresAuth: true,
      });
    }
    
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");

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

        const graphqlResponse = await admin.graphql(mutation, {
          variables
        });

        const graphqlData = await graphqlResponse.json() as any;

        if (graphqlData.errors) {
          const errorMessage = graphqlData.errors.map((e: any) => e.message).join(", ");
          return json({ 
            success: false, 
            error: `Shopify API error: ${errorMessage}`,
          });
        }

        const purchaseData = graphqlData.data?.appPurchaseOneTimeCreate;
        
        if (!purchaseData) {
          return json({ 
            success: false, 
            error: "Failed to create charge. Please check your Shopify permissions.",
          });
        }

        if (purchaseData.userErrors && purchaseData.userErrors.length > 0) {
          const errorMessage = purchaseData.userErrors.map((e: any) => e.message).join(", ");
          return json({ 
            success: false, 
            error: `Shopify API error: ${errorMessage}`,
          });
        }

        if (!purchaseData.confirmationUrl) {
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
        // Handle Response (redirection/auth)
        if (error instanceof Response) {
          if (error.status === 401) {
            const reauthUrl = error.headers.get('x-shopify-api-request-failure-reauthorize-url');
            return json({ 
              success: false, 
              error: "Your session has expired. Please refresh the page to re-authenticate.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          return json({ 
            success: false, 
            error: `Shopify API error (${error.status}): ${error.statusText}` 
          });
        }
        // Check if error has Response-like properties
        const errorAny = error as any;
        if (errorAny && typeof errorAny === 'object' && 'status' in errorAny && 'statusText' in errorAny) {
          if (errorAny.status === 401) {
            const reauthUrl = errorAny.headers?.get?.('x-shopify-api-request-failure-reauthorize-url') || 
                             errorAny.headers?.['x-shopify-api-request-failure-reauthorize-url'];
            return json({ 
              success: false, 
              error: "Your session has expired. Please refresh the page to re-authenticate.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          return json({ 
            success: false, 
            error: `Shopify API error (${errorAny.status}): ${errorAny.statusText || 'Unknown error'}` 
          });
        }
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

        const customGraphqlResponse = await admin.graphql(mutation, {
          variables
        });

        const customGraphqlData = await customGraphqlResponse.json() as any;

        if (customGraphqlData.errors) {
          const errorMessage = customGraphqlData.errors.map((e: any) => e.message).join(", ");
          return json({ 
            success: false, 
            error: `Shopify API error: ${errorMessage}`,
          });
        }

        const purchaseData = customGraphqlData.data?.appPurchaseOneTimeCreate;
        
        if (!purchaseData) {
          return json({ 
            success: false, 
            error: "Failed to create charge. Please check your Shopify permissions.",
          });
        }

        if (purchaseData.userErrors && purchaseData.userErrors.length > 0) {
          const errorMessage = purchaseData.userErrors.map((e: any) => e.message).join(", ");
          return json({ 
            success: false, 
            error: `Shopify API error: ${errorMessage}`,
          });
        }

        if (!purchaseData.confirmationUrl) {
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
        // Ne pas loguer l'objet Response directement - extraire seulement les infos nécessaires
        if (error instanceof Response) {
          // Handle 401 Unauthorized in catch block
          if (error.status === 401) {
            const reauthUrl = error.headers.get('x-shopify-api-request-failure-reauthorize-url');
            return json({ 
              success: false, 
              error: "Votre session a expiré. Veuillez rafraîchir la page pour vous ré-authentifier.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
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
            return json({ 
              success: false, 
              error: "Votre session a expiré. Veuillez rafraîchir la page pour vous ré-authentifier.",
              requiresAuth: true,
              reauthUrl: reauthUrl || null,
            });
          }
          return json({ 
            success: false, 
            error: `Shopify API error (${errorAny.status}): ${errorAny.statusText || 'Unknown error'}` 
          });
        }
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
  } else if (intent === "purchase-subscription") {
    const planId = formData.get("planId") as string;
    
    const validPlans = ["free-installation-setup", "starter", "pro", "studio"];
    if (!validPlans.includes(planId)) {
      return json({ 
        success: false, 
        error: "Plan d'abonnement invalide",
      });
    }

    // Le plan gratuit est déjà attribué automatiquement
    if (planId === "free-installation-setup") {
      return json({ 
        success: false, 
        error: "Le plan gratuit est déjà actif",
      });
    }

    // Vérifier si l'utilisateur possède déjà ce plan
    try {
      const subscriptionQuery = `#graphql
        query {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
              status
              test
              lineItems {
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

      const subscriptionResponse = await admin.graphql(subscriptionQuery);
      const subscriptionData = await subscriptionResponse.json() as any;
      
      const activeSubscriptions = subscriptionData?.data?.currentAppInstallation?.activeSubscriptions || [];
      const activeSubscription = activeSubscriptions.find((sub: any) => 
        sub.status === "ACTIVE" && !sub.test
      );

      if (activeSubscription) {
        // Normalize plan name (e.g., "Starter" -> "starter")
        const currentPlanName = activeSubscription.name.toLowerCase().replace(/\s+/g, '-');
        
        // Si l'utilisateur essaie d'acheter le plan qu'il possède déjà
        if (currentPlanName === planId) {
          return json({ 
            success: false, 
            error: `Vous possédez déjà l'abonnement "${activeSubscription.name}". Vous ne pouvez pas l'acheter à nouveau.`,
          });
        }
      }
    } catch (subscriptionCheckError) {
      // Continue - if check fails, allow purchase attempt (will fail at Shopify level if duplicate)
    }

    // SOLUTION: Laisser billing.request() gérer la redirection automatiquement
    // IMPORTANT: Le returnUrl DOIT inclure le paramètre shop pour que l'authentification fonctionne
    const { billing } = await authenticate.admin(request);
    
    // Construire l'URL de retour complète avec le paramètre shop
    // Le paramètre shop est ESSENTIEL pour que l'authentification fonctionne après le paiement
    const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || new URL(request.url).origin;
    const returnUrl = `${appUrl}/app/credits?shop=${encodeURIComponent(shop)}`;
    
    // billing.request() va lancer une Response de redirection (302)
    // Après le paiement, Shopify redirigera vers returnUrl avec charge_id
    // Le paramètre shop permettra à authenticate.admin() de savoir quelle boutique authentifier
    return await billing.request({
      plan: planId as any,
      isTest: true, // Pour les boutiques de développement
      returnUrl: returnUrl,
    });
  }
  
  return json({ 
    success: false, 
    error: "Action non reconnue",
  });
  } catch (error) {
    // Si c'est une Response (redirection de billing.request() ou ré-auth), la propager directement
    // Remix et Shopify gèrent automatiquement ces redirections
    if (error instanceof Response) {
      throw error; // Remix gérera cette redirection automatiquement
    }
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Une erreur est survenue. Veuillez réessayer.",
    });
  }
};

export default function Credits() {
  const loaderData = useLoaderData<typeof loader>();
  const shop = (loaderData as any)?.shop || null;
  const error = (loaderData as any)?.error || null;
  const purchaseSuccess = (loaderData as any)?.purchaseSuccess || false;
  const creditsAdded = (loaderData as any)?.creditsAdded || 0;
  const subscriptionUpdated = (loaderData as any)?.subscriptionUpdated || false;
  const planName = (loaderData as any)?.planName || null;
  const currentActivePlan = (loaderData as any)?.currentActivePlan || null; // Plan ID currently active
  
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const currentCredits = shop?.credits || 0;
  const [customAmount, setCustomAmount] = useState("500");
  const [submittingPackId, setSubmittingPackId] = useState<string | null>(null);
  
  // Utiliser useRef pour stocker une référence stable à revalidator
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;

  const isSubmitting = fetcher.state === "submitting";

  // Plus besoin de gérer les redirections manuellement !
  // billing.request() propage directement la Response de redirection
  // Remix gère automatiquement la redirection vers la page de paiement Shopify

  // Reset submittingPackId when fetcher completes
  useEffect(() => {
    if (fetcher.state === "idle" && submittingPackId !== null) {
      setSubmittingPackId(null);
    }
  }, [fetcher.state, submittingPackId]);

  const handlePurchase = (packId: string) => {
    if (isSubmitting || submittingPackId !== null) {
      return;
    }
    
    setSubmittingPackId(packId);
    
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

  const handleSubscriptionPurchase = (planId: string) => {
    if (isSubmitting || submittingPackId !== null) {
      return;
    }
    
    setSubmittingPackId(planId);
    
    const formData = new FormData();
    formData.append("intent", "purchase-subscription");
    formData.append("planId", planId);
    
    fetcher.submit(formData, { method: "post" });
  };

  // Plans d'abonnement correspondant au Dashboard Shopify Partners
  const subscriptionPlans = [
    { 
      id: "free-installation-setup", 
      name: "Free Installation Setup", 
      price: 0.0, 
      description: "Plan gratuit - 4 crédits par mois",
      popular: false 
    },
    { 
      id: "starter", 
      name: "Starter", 
      price: 29.0, 
      description: "Parfait pour démarrer votre boutique",
      popular: false 
    },
    { 
      id: "pro", 
      name: "Pro", 
      price: 99.0, 
      description: "Pour les professionnels en croissance",
      popular: true 
    },
    { 
      id: "studio", 
      name: "Studio", 
      price: 399.0, 
      description: "Pour les studios créatifs et les grandes boutiques",
      popular: false 
    },
  ];

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

        {(purchaseSuccess || (fetcher.data?.success && !(fetcher.data as any)?.redirect)) && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="success" title="Succès !" onDismiss={() => {}}>
              {creditsAdded || (fetcher.data as any)?.creditsAdded || (fetcher.data as any)?.credits || 0} crédits ajoutés à votre compte.
            </Banner>
          </div>
        )}

        {subscriptionUpdated && planName && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="success" title="Abonnement activé !" onDismiss={() => {}}>
              Votre abonnement <strong>{planName}</strong> a été activé avec succès. Vos crédits mensuels ont été mis à jour.
            </Banner>
          </div>
        )}

        {fetcher.data?.success && (fetcher.data as any)?.redirect && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="info" title="Redirection vers le paiement..." onDismiss={() => {}}>
              Redirection vers le checkout Shopify...
            </Banner>
          </div>
        )}

        {(fetcher.data as any)?.error && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner 
              tone="critical" 
              title={(fetcher.data as any)?.requiresAuth ? "Authentification requise" : "Erreur"}
              onDismiss={() => {}}
              action={(fetcher.data as any)?.requiresAuth ? {
                content: (fetcher.data as any)?.reauthUrl ? "Ré-authentifier" : "Rafraîchir la page",
                onAction: () => {
                  if ((fetcher.data as any)?.reauthUrl) {
                    // Rediriger la page parente (sortir de l'iframe) pour la ré-authentification
                    try {
                      if (window.top && window.top !== window) {
                        window.top.location.href = (fetcher.data as any).reauthUrl;
                      } else {
                        window.location.href = (fetcher.data as any).reauthUrl;
                      }
                    } catch (e) {
                      window.location.href = (fetcher.data as any).reauthUrl;
                    }
                  } else {
                    // Rafraîchir la page parente
                    try {
                      if (window.top && window.top !== window) {
                        window.top.location.reload();
                      } else {
                        window.location.reload();
                      }
                    } catch (e) {
                      window.location.reload();
                    }
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

        <div className="credits-balance">
          <div>
            <div className="credits-amount">{currentCredits.toLocaleString("en-US")}</div>
            <div className="credits-label">Credits available</div>
          </div>
        </div>

        <div style={{ marginTop: "var(--spacing-xl)" }}>
          <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "var(--spacing-md)" }}>
            Plans d'abonnement
          </h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "var(--spacing-lg)" }}>
            Choisissez un plan d'abonnement mensuel pour accéder à toutes les fonctionnalités
          </p>
          <div className="pricing-grid">
            {subscriptionPlans.map((plan) => {
              const isCurrentPlan = currentActivePlan === plan.id;
              const isFreePlan = plan.id === "free-installation-setup";
              
              return (
                <div key={plan.id} className={`plan-card ${plan.popular ? 'featured' : ''} ${isCurrentPlan ? 'current-plan' : ''}`}>
                  {plan.popular && (
                    <div className="plan-badge">Most popular</div>
                  )}
                  {isCurrentPlan && (
                    <div className="plan-badge" style={{ backgroundColor: '#008060', color: 'white' }}>
                      Plan actuel
                    </div>
                  )}
                  <div className="plan-name">{plan.name}</div>
                  <div className="plan-price">
                    ${plan.price.toFixed(2)} <span>/ month</span>
                  </div>
                  <div className="plan-features">
                    <div className="plan-feature">{plan.description}</div>
                    <div className="plan-feature">Abonnement récurrent mensuel</div>
                    <div className="plan-feature">Annulable à tout moment</div>
                  </div>
                  <div className="plan-cta">
                    {isCurrentPlan ? (
                      <button 
                        className="plan-button"
                        disabled={true}
                        style={{ 
                          backgroundColor: '#008060', 
                          color: 'white',
                          cursor: 'not-allowed',
                          opacity: 0.8
                        }}
                      >
                        Plan actuel
                      </button>
                    ) : isFreePlan ? (
                      <button 
                        className="plan-button"
                        disabled={true}
                        style={{ 
                          cursor: 'not-allowed',
                          opacity: 0.6
                        }}
                      >
                        Déjà inclus
                      </button>
                    ) : (
                      <button 
                        className="plan-button"
                        onClick={() => handleSubscriptionPurchase(plan.id)}
                        disabled={isSubmitting || submittingPackId !== null}
                      >
                        {isSubmitting && submittingPackId === plan.id ? "Processing..." : "S'abonner"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Page>
  );
}
