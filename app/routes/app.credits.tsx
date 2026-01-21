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
  // Extract URL params (charge_id, purchase, pack, credits)
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");
  const purchaseSuccess = url.searchParams.get("purchase");
  const packId = url.searchParams.get("pack");
  const creditsParam = url.searchParams.get("credits");
  
  try {
    // authenticate.admin will automatically handle re-authentication if needed
    // Grâce à la route intermédiaire auth.billing-callback, la session existera ici
    const { admin, session, billing } = await authenticate.admin(request);
    
    console.log(`[Credits] 🔐 Authentification - session:`, session ? { shop: session.shop, id: session.id } : 'null');
    
    if (!session || !session.shop) {
      console.error(`[Credits] ❌ Session invalide - URL: ${request.url}, Headers:`, {
        cookie: request.headers.get('cookie'),
        authorization: request.headers.get('authorization'),
      });
      return json({
        shop: null,
        error: "Session invalide. Veuillez rafraîchir la page.",
      });
    }
    
    const shop = session.shop;

    await ensureTables();
    let shopData = await getShop(shop);

    // Handle return from Shopify payment - check charge_id first (subscription payments)
    // charge_id indicates a subscription payment return
    if (chargeId) {
      console.log(`[Credits] 🔄 Traitement du paiement avec charge_id: ${chargeId} pour shop: ${shop}`);
      
      // IMPORTANT: Vérifier explicitement le paiement
      // Le charge_id dans l'URL confirme que Shopify a redirigé après un paiement
      // ATTENTION: La session peut être null juste après le paiement, on doit attendre et réessayer
      try {
        // Si la session est null, attendre un peu et réessayer l'authentification
        let currentAdmin = admin;
        let currentSession = session;
        let currentShop = shop;
        
        if (!currentSession || !currentSession.shop) {
          console.log(`[Credits] ⏳ Session non disponible, attente de réhydratation...`);
          // Attendre un peu pour que la session soit réhydratée
          await new Promise(resolve => setTimeout(resolve, 2000)); // Augmenté à 2 secondes
          
          // Réessayer l'authentification
          try {
            const authResult = await authenticate.admin(request);
            currentAdmin = authResult.admin;
            currentSession = authResult.session;
            if (currentSession && currentSession.shop) {
              currentShop = currentSession.shop;
              console.log(`[Credits] ✅ Session réhydratée pour shop: ${currentShop}`);
            }
          } catch (authError) {
            console.warn(`[Credits] ⚠️ Impossible de ré-authentifier pour charge_id: ${chargeId}`, authError);
            // Continuer avec la session originale si elle existe
          }
        }
        
        // Si on a une session valide, traiter la mise à jour
        if (currentSession && currentSession.shop && currentAdmin) {
          const shop = currentShop;
          console.log(`[Credits] 🔍 Récupération des abonnements pour shop: ${shop}`);
          
          // Récupérer les abonnements actifs
          const subscriptionQuery = `#graphql
          query {
            currentAppInstallation {
              activeSubscriptions {
                id
                name
                status
                test
                createdAt
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

          const subscriptionResponse = await currentAdmin.graphql(subscriptionQuery);
          const subscriptionData = await subscriptionResponse.json() as any;
          
          let allSubscriptions = subscriptionData?.data?.currentAppInstallation?.activeSubscriptions || [];
          console.log(`[Credits] 📋 Abonnements trouvés (première tentative): ${allSubscriptions.length}`, allSubscriptions.map((s: any) => ({ name: s.name, status: s.status, test: s.test, createdAt: s.createdAt })));
          
          // Si aucun abonnement trouvé, attendre un peu et réessayer (l'abonnement peut être en cours de création)
          if (allSubscriptions.length === 0) {
            console.log(`[Credits] ⏳ Aucun abonnement trouvé, attente de 2 secondes avant réessai...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Réessayer la requête
            const retryResponse = await currentAdmin.graphql(subscriptionQuery);
            const retryData = await retryResponse.json() as any;
            allSubscriptions = retryData?.data?.currentAppInstallation?.activeSubscriptions || [];
            console.log(`[Credits] 📋 Abonnements trouvés (après réessai): ${allSubscriptions.length}`, allSubscriptions.map((s: any) => ({ name: s.name, status: s.status, test: s.test, createdAt: s.createdAt })));
          }
          
          // Chercher l'abonnement le plus récent (créé récemment) qui n'est pas en test
          // Il peut être ACTIVE, PENDING, ou autre selon le timing
          const recentSubscription = allSubscriptions
            .filter((sub: any) => !sub.test)
            .sort((a: any, b: any) => {
              // Trier par date de création (plus récent en premier)
              const dateA = new Date(a.createdAt || 0).getTime();
              const dateB = new Date(b.createdAt || 0).getTime();
              return dateB - dateA;
            })[0];
          
          // Si on trouve un abonnement (même s'il n'est pas encore ACTIVE), mettre à jour
          // Les abonnements peuvent être PENDING avant d'être ACTIVE
          if (recentSubscription) {
            const planName = recentSubscription.name.toLowerCase().replace(/\s+/g, '-');
            console.log(`[Credits] ✅ Abonnement trouvé: ${recentSubscription.name} (${planName}), status: ${recentSubscription.status}`);

            // Définir les crédits mensuels selon le plan
            const planCredits: Record<string, number> = {
              "free-installation-setup": 4,
              "starter": 50,      // 29€ → 50 générations
              "pro": 200,          // 99€ → 200 générations
              "studio": 1000,      // 399€ → 1000 générations
            };

            const monthlyCredits = planCredits[planName] || planCredits["free-installation-setup"];
            console.log(`[Credits] 💰 Mise à jour du shop avec plan: ${planName}, crédits: ${monthlyCredits}`);
            
            // Mettre à jour le shop avec le nouveau plan et crédits
            await upsertShop(shop, {
              monthlyQuota: monthlyCredits,
            });
            console.log(`[Credits] ✅ Shop mis à jour avec monthlyQuota: ${monthlyCredits}`);

            // Mettre à jour plan_name dans la base de données
            try {
              await query(
                `ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_name TEXT`
              );
              await query(
                `UPDATE shops SET plan_name = $1 WHERE domain = $2`,
                [planName, shop]
              );
              console.log(`[Credits] ✅ Plan name mis à jour: ${planName}`);
            } catch (planError) {
              console.error(`[Credits] ⚠️ Erreur lors de la mise à jour du plan_name:`, planError);
            }

            // Recharger les données du shop après mise à jour
            const updatedShopData = await getShop(shop);
            console.log(`[Credits] ✅ Données du shop rechargées:`, updatedShopData ? { monthlyQuota: updatedShopData.monthlyQuota, planName: (updatedShopData as any).plan_name } : 'null');
            
            // IMPORTANT: Retourner aussi le currentActivePlan mis à jour
            // pour que l'UI affiche correctement le plan actuel
            return json({
              shop: updatedShopData || null,
              subscriptionUpdated: true,
              planName: planName,
              subscriptionActivated: true,
              activeSubscriptionName: recentSubscription.name,
              subscriptionStatus: recentSubscription.status,
              currentActivePlan: planName, // Ajouter le plan actuel pour l'UI
            });
          } else {
            // Si aucun abonnement trouvé, peut-être que le paiement n'est pas encore traité
            console.warn(`[Credits] ⚠️ Aucun abonnement trouvé après paiement pour shop: ${shop}, charge_id: ${chargeId}`);
            console.warn(`[Credits] 📋 Tous les abonnements:`, allSubscriptions);
          }
        } else {
          // Session non disponible, continuer pour afficher la page normale
          console.warn(`[Credits] ⚠️ Session non disponible pour traiter charge_id: ${chargeId}`);
        }
      } catch (subscriptionError) {
        // Log l'erreur pour débugger
        console.error(`[Credits] ❌ Erreur lors de la vérification de l'abonnement:`, subscriptionError);
        // Continue - will show normal page even if subscription check fails
      }
    }

    // Packs one-time supprimés - seulement les abonnements sont disponibles

    // IMPORTANT: Synchroniser toujours la base de données avec les abonnements Shopify
    // Cela garantit que la base de données est à jour même sans charge_id
    let currentActivePlan: string | null = null;
    let shouldUpdateDb = false;
    
    try {
      const subscriptionQuery = `#graphql
        query {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
              status
              test
              createdAt
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
      
      const allSubscriptions = subscriptionData?.data?.currentAppInstallation?.activeSubscriptions || [];
      console.log(`[Credits] 📊 Abonnements récupérés depuis Shopify: ${allSubscriptions.length}`, allSubscriptions.map((s: any) => ({ name: s.name, status: s.status, test: s.test, createdAt: s.createdAt })));
      
      // Chercher d'abord un abonnement ACTIVE
      let activeSubscription = allSubscriptions.find((sub: any) => 
        sub.status === "ACTIVE" && !sub.test
      );
      
      // Si aucun ACTIVE, chercher un abonnement PENDING ou ACCEPTED (après achat récent)
      if (!activeSubscription) {
        // Trier par date de création (plus récent en premier) et prendre le premier non-test
        const sortedSubscriptions = allSubscriptions
          .filter((sub: any) => !sub.test && (sub.status === "PENDING" || sub.status === "ACCEPTED" || sub.status === "ACTIVE"))
          .sort((a: any, b: any) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
          });
        
        activeSubscription = sortedSubscriptions[0];
      }

      if (activeSubscription) {
        // Normalize plan name (e.g., "Starter" -> "starter")
        const detectedPlanName = activeSubscription.name.toLowerCase().replace(/\s+/g, '-');
        currentActivePlan = detectedPlanName;
        console.log(`[Credits] ✅ Abonnement détecté: ${activeSubscription.name} (${detectedPlanName}), status: ${activeSubscription.status}`);
        
        // Vérifier si la base de données doit être mise à jour
        const dbPlanName = shopData?.plan_name;
        console.log(`[Credits] 🔍 Comparaison: plan DB="${dbPlanName}", plan Shopify="${detectedPlanName}"`);
        if (dbPlanName !== detectedPlanName) {
          console.log(`[Credits] 🔄 Synchronisation nécessaire: plan DB="${dbPlanName}", plan Shopify="${detectedPlanName}"`);
          shouldUpdateDb = true;
        } else {
          console.log(`[Credits] ✓ Plans identiques, pas de synchronisation nécessaire`);
        }
      } else {
        // Aucun abonnement actif trouvé, utiliser le plan gratuit par défaut
        if (!shopData?.plan_name || shopData.plan_name !== "free-installation-setup") {
          console.log(`[Credits] 🔄 Aucun abonnement actif, attribution du plan gratuit`);
          currentActivePlan = "free-installation-setup";
          shouldUpdateDb = true;
        } else {
          currentActivePlan = shopData.plan_name;
        }
      }
      
      // Mettre à jour la base de données si nécessaire
      if (shouldUpdateDb && currentActivePlan) {
        const planCredits: Record<string, number> = {
          "free-installation-setup": 4,
          "starter": 50,
          "pro": 200,
          "studio": 1000,
        };

        const monthlyCredits = planCredits[currentActivePlan] || planCredits["free-installation-setup"];
        console.log(`[Credits] 💾 Synchronisation de la base de données: plan=${currentActivePlan}, crédits=${monthlyCredits}`);
        
        try {
          // Mettre à jour monthlyQuota et plan_name
          await upsertShop(shop, {
            monthlyQuota: monthlyCredits,
          });
          
          // Mettre à jour plan_name
          await query(
            `ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_name TEXT`
          );
          await query(
            `UPDATE shops SET plan_name = $1 WHERE domain = $2`,
            [currentActivePlan, shop]
          );
          
          // Recharger les données du shop après mise à jour
          const updatedShopData = await getShop(shop);
          shopData = updatedShopData;
          console.log(`[Credits] ✅ Base de données synchronisée avec succès`);
        } catch (syncError) {
          console.error(`[Credits] ❌ Erreur lors de la synchronisation:`, syncError);
        }
      }
    } catch (subscriptionError) {
      console.error(`[Credits] ❌ Erreur lors de la vérification des abonnements:`, subscriptionError);
      // Fallback: utiliser plan_name de la base de données
      if (shopData?.plan_name) {
        currentActivePlan = shopData.plan_name;
      }
    }

    // FALLBACK: Utiliser plan_name de la base de données si aucun abonnement Shopify trouvé
    if (!currentActivePlan && shopData?.plan_name) {
      currentActivePlan = shopData.plan_name;
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
    
  // Packs de crédits supprimés - seulement les abonnements sont disponibles
  if (intent === "purchase-credits" || intent === "custom-pack") {
          return json({ 
            success: false, 
      error: "Les packs de crédits ne sont plus disponibles. Veuillez utiliser un abonnement.",
    });
  }
  
  
  if (intent === "purchase-subscription") {
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

    // SOLUTION "Exit Hatch": Utiliser une route publique intermédiaire pour gérer le retour de paiement
    // Cette route (auth.billing-callback) ne nécessite pas d'authentification et redirige vers /auth
    const { billing } = await authenticate.admin(request);
    
    // Construire l'URL de retour vers la route publique intermédiaire
    // Cette route recevra le charge_id de Shopify et redirigera vers /auth pour l'authentification
    const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || new URL(request.url).origin;
    const returnUrl = `${appUrl}/auth/billing-callback?shop=${encodeURIComponent(shop)}`;
    
    // billing.request() va lancer une Response de redirection (302)
    // Après le paiement, Shopify redirigera vers /auth/billing-callback avec charge_id
    // Cette route publique redirigera ensuite vers /auth pour l'authentification
    return await billing.request({
      plan: planId as any,
      isTest: true, // Pour les boutiques de développement
      returnUrl: returnUrl,
    });
  }
  
  // Si aucun intent reconnu
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
  const [submittingPackId, setSubmittingPackId] = useState<string | null>(null);
  
  // Utiliser useRef pour stocker une référence stable à revalidator
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;

  const isSubmitting = fetcher.state === "submitting";

  // Reset submittingPackId when fetcher completes
  useEffect(() => {
    if (fetcher.state === "idle" && submittingPackId !== null) {
      setSubmittingPackId(null);
    }
  }, [fetcher.state, submittingPackId]);

  // Recharger la page après mise à jour d'abonnement pour afficher le plan actuel
  useEffect(() => {
    if (subscriptionUpdated && planName) {
      // Attendre un peu pour que la base de données soit mise à jour
      const timer = setTimeout(() => {
        // Nettoyer l'URL des paramètres de retour de paiement
        const url = new URL(window.location.href);
        url.searchParams.delete('charge_id');
        url.searchParams.delete('purchase');
        url.searchParams.delete('pack');
        url.searchParams.delete('credits');
        
        // Recharger complètement la page pour forcer la mise à jour
        window.location.href = url.toString();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [subscriptionUpdated, planName]);

  // Recharger automatiquement si charge_id est présent dans l'URL (retour de paiement)
  useEffect(() => {
    const url = new URL(window.location.href);
    const chargeId = url.searchParams.get("charge_id");
    if (chargeId && !subscriptionUpdated) {
      // Attendre que la session soit réhydratée puis recharger
      const timer = setTimeout(() => {
        // Forcer un rechargement complet après le retour du paiement
        window.location.reload();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [subscriptionUpdated]);

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
      description: "50 générations par mois",
      popular: false 
    },
    { 
      id: "pro", 
      name: "Pro", 
      price: 99.0, 
      description: "200 générations par mois",
      popular: true 
    },
    { 
      id: "studio", 
      name: "Studio", 
      price: 399.0, 
      description: "1000 générations par mois",
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
