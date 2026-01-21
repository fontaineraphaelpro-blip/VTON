import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Button,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop, query } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");
  
  try {
    const { admin, session } = await authenticate.admin(request);
    
    if (!session || !session.shop) {
      return json({
        shop: null,
        error: "Session invalide. Veuillez rafraîchir la page.",
      });
    }
    
    const shop = session.shop;

    await ensureTables();
    let shopData = await getShop(shop);
    
    // S'assurer que le widget est activé par défaut si is_enabled n'est pas défini
    if (shopData && (shopData.is_enabled === null || shopData.is_enabled === undefined)) {
      console.log(`[Credits] 🔧 Activation automatique du widget pour ${shop} (is_enabled n'était pas défini)`);
      await upsertShop(shop, {
        isEnabled: true,
      });
      shopData = await getShop(shop);
    }

    // Traiter le retour de paiement si charge_id présent
    if (chargeId) {
      try {
        let currentAdmin = admin;
        let currentSession = session;
        let currentShop = shop;
        
        // Attendre un peu si la session n'est pas disponible
        if (!currentSession || !currentSession.shop) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            const authResult = await authenticate.admin(request);
            currentAdmin = authResult.admin;
            currentSession = authResult.session;
            if (currentSession && currentSession.shop) {
              currentShop = currentSession.shop;
            }
          } catch (authError) {
            console.warn(`[Credits] ⚠️ Impossible de ré-authentifier pour charge_id: ${chargeId}`);
          }
        }
        
        if (currentSession && currentSession.shop && currentAdmin) {
          const shop = currentShop;
          
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
          
          // Réessayer si aucun abonnement trouvé
          if (allSubscriptions.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const retryResponse = await currentAdmin.graphql(subscriptionQuery);
            const retryData = await retryResponse.json() as any;
            allSubscriptions = retryData?.data?.currentAppInstallation?.activeSubscriptions || [];
          }
          
          // En développement, accepter aussi les abonnements de test
          const allowTestSubscriptions = process.env.NODE_ENV !== "production";
          const recentSubscription = allSubscriptions
            .filter((sub: any) => allowTestSubscriptions || !sub.test)
            .sort((a: any, b: any) => {
              const dateA = new Date(a.createdAt || 0).getTime();
              const dateB = new Date(b.createdAt || 0).getTime();
              return dateB - dateA;
            })[0];
          
          if (recentSubscription) {
            const planName = recentSubscription.name.toLowerCase().replace(/\s+/g, '-');

            const planCredits: Record<string, number> = {
              "free-installation-setup": 4,
              "starter": 50,
              "pro": 200,
              "studio": 1000,
            };

            const monthlyCredits = planCredits[planName] || planCredits["free-installation-setup"];
            
            // Mettre à jour à la fois monthlyQuota ET credits pour refléter le plan acheté
            await upsertShop(shop, {
              monthlyQuota: monthlyCredits,
              credits: monthlyCredits, // Ajouter les crédits correspondant au plan
            });
            
            console.log(`[Credits] 💰 Crédits mis à jour: plan=${planName}, monthlyQuota=${monthlyCredits}, credits=${monthlyCredits}`);

            try {
              await query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_name TEXT`);
              await query(`UPDATE shops SET plan_name = $1 WHERE domain = $2`, [planName, shop]);
            } catch (planError) {
              console.error(`[Credits] ⚠️ Erreur lors de la mise à jour du plan_name:`, planError);
            }

            const updatedShopData = await getShop(shop);
            
            return json({
              shop: updatedShopData || null,
              subscriptionUpdated: true,
              planName: planName,
              currentActivePlan: planName,
            });
          }
        }
      } catch (subscriptionError) {
        console.error(`[Credits] ❌ Erreur lors de la vérification de l'abonnement:`, subscriptionError);
      }
    }

    // Synchroniser toujours la base de données avec les abonnements Shopify
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
      
      // Accepter les abonnements de test (utilisés en développement/test)
      // Forcer true pour l'instant car les abonnements de test sont utilisés même en "production" sur Railway
      const allowTestSubscriptions = true; // process.env.NODE_ENV !== "production";
      console.log(`[Credits] 🔧 allowTestSubscriptions=${allowTestSubscriptions}, NODE_ENV=${process.env.NODE_ENV}`);
      
      let activeSubscription = allSubscriptions.find((sub: any) => {
        const matches = sub.status === "ACTIVE" && (allowTestSubscriptions || !sub.test);
        if (matches) {
          console.log(`[Credits] ✅ Trouvé abonnement actif: ${sub.name}, status: ${sub.status}, test: ${sub.test}`);
        }
        return matches;
      });
      
      if (!activeSubscription) {
        const sortedSubscriptions = allSubscriptions
          .filter((sub: any) => (allowTestSubscriptions || !sub.test) && (sub.status === "PENDING" || sub.status === "ACCEPTED" || sub.status === "ACTIVE"))
          .sort((a: any, b: any) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
          });
        
        activeSubscription = sortedSubscriptions[0];
      }

      if (activeSubscription) {
        const detectedPlanName = activeSubscription.name.toLowerCase().replace(/\s+/g, '-');
        currentActivePlan = detectedPlanName;
        
        const dbPlanName = shopData?.plan_name;
        if (dbPlanName !== detectedPlanName) {
          console.log(`[Credits] 🔄 Synchronisation: plan DB="${dbPlanName}", plan Shopify="${detectedPlanName}"`);
          shouldUpdateDb = true;
        }
      } else {
        if (!shopData?.plan_name || shopData.plan_name !== "free-installation-setup") {
          currentActivePlan = "free-installation-setup";
          shouldUpdateDb = true;
        } else {
          currentActivePlan = shopData.plan_name;
        }
      }
      
      if (shouldUpdateDb && currentActivePlan) {
        const planCredits: Record<string, number> = {
          "free-installation-setup": 4,
          "starter": 50,
          "pro": 200,
          "studio": 1000,
        };

        const monthlyCredits = planCredits[currentActivePlan] || planCredits["free-installation-setup"];
        
        try {
          // Mettre à jour à la fois monthlyQuota ET credits pour refléter le plan actif
          await upsertShop(shop, {
            monthlyQuota: monthlyCredits,
            credits: monthlyCredits, // Ajouter les crédits correspondant au plan
          });
          
          await query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_name TEXT`);
          await query(`UPDATE shops SET plan_name = $1 WHERE domain = $2`, [currentActivePlan, shop]);
          
          shopData = await getShop(shop);
          console.log(`[Credits] ✅ Base de données synchronisée: plan=${currentActivePlan}, monthlyQuota=${monthlyCredits}, credits=${monthlyCredits}`);
        } catch (syncError) {
          console.error(`[Credits] ❌ Erreur lors de la synchronisation:`, syncError);
        }
      }
    } catch (subscriptionError) {
      console.error(`[Credits] ❌ Erreur lors de la vérification des abonnements:`, subscriptionError);
      if (shopData?.plan_name) {
        currentActivePlan = shopData.plan_name;
      }
    }

    if (!currentActivePlan && shopData?.plan_name) {
      currentActivePlan = shopData.plan_name;
    }

    return json({
      shop: shopData || null,
      currentActivePlan: currentActivePlan,
    });
  } catch (error) {
    if (error instanceof Response) {
      const url = new URL(request.url);
      const currentUrl = url.toString();
      const location = error.headers.get("location");
      if (location && location.includes("/auth/login")) {
        const redirectUrl = new URL(location, request.url);
        redirectUrl.searchParams.set("return_to", currentUrl);
        return new Response(null, {
          status: 302,
          headers: { Location: redirectUrl.toString() },
        });
      }
      throw error;
    }
    
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
        return json({ 
          success: false, 
          error: `Erreur d'authentification (${authError.status}). Veuillez rafraîchir la page.`,
          requiresAuth: true,
        });
      }
      throw authError;
    }
    
    if (!session || !session.shop || !admin) {
      return json({ 
        success: false, 
        error: "Session invalide. Veuillez rafraîchir la page.",
        requiresAuth: true,
      });
    }
    
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "purchase-subscription") {
      const planId = formData.get("planId") as string;
      
      const validPlans = ["free-installation-setup", "starter", "pro", "studio"];
      if (!validPlans.includes(planId)) {
        return json({ 
          success: false, 
          error: "Plan d'abonnement invalide",
        });
      }

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
        // En développement, accepter aussi les abonnements de test
        const allowTestSubscriptions = process.env.NODE_ENV !== "production";
        const activeSubscription = activeSubscriptions.find((sub: any) => 
          sub.status === "ACTIVE" && (allowTestSubscriptions || !sub.test)
        );

        if (activeSubscription) {
          const currentPlanName = activeSubscription.name.toLowerCase().replace(/\s+/g, '-');
          
          if (currentPlanName === planId) {
            return json({ 
              success: false, 
              error: `Vous possédez déjà l'abonnement "${activeSubscription.name}". Vous ne pouvez pas l'acheter à nouveau.`,
            });
          }
        }
      } catch (subscriptionCheckError) {
        // Continue - allow purchase attempt
      }

      const { billing } = await authenticate.admin(request);
      const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || new URL(request.url).origin;
      const returnUrl = `${appUrl}/auth/billing-callback?shop=${encodeURIComponent(shop)}`;
      
      return await billing.request({
        plan: planId as any,
        isTest: true,
        returnUrl: returnUrl,
      });
    }
  
    return json({ 
      success: false, 
      error: "Action non reconnue",
    });
  
  } catch (error) {
    if (error instanceof Response) {
      throw error;
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
  const subscriptionUpdated = (loaderData as any)?.subscriptionUpdated || false;
  const planName = (loaderData as any)?.planName || null;
  const currentActivePlan = (loaderData as any)?.currentActivePlan || null;
  
  const fetcher = useFetcher<typeof action>();
  const currentCredits = shop?.credits || 0;
  const [submittingPackId, setSubmittingPackId] = useState<string | null>(null);

  const isSubmitting = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.state === "idle" && submittingPackId !== null) {
      setSubmittingPackId(null);
    }
  }, [fetcher.state, submittingPackId]);

  useEffect(() => {
    if (subscriptionUpdated && planName) {
      const timer = setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('charge_id');
        window.location.href = url.toString();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [subscriptionUpdated, planName]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const chargeId = url.searchParams.get("charge_id");
    if (chargeId && !subscriptionUpdated) {
      const timer = setTimeout(() => {
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

        {subscriptionUpdated && planName && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="success" title="Abonnement activé !" onDismiss={() => {}}>
              Votre abonnement <strong>{planName}</strong> a été activé avec succès. Vos crédits mensuels ont été mis à jour.
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
