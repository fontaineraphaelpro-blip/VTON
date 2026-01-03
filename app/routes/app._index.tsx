import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator, Link } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  Page,
  Text,
  Button,
  Banner,
  Divider,
  TextField,
  Checkbox,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop, getTryonLogs, getTopProducts, getTryonStatsByDay } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureTables();

    const [shopData, recentLogs, topProducts, dailyStats] = await Promise.all([
      getShop(shop),
      getTryonLogs(shop, { limit: 10, offset: 0 }).catch(() => []),
      getTopProducts(shop, 5).catch(() => []),
      getTryonStatsByDay(shop, 30).catch(() => []),
    ]);

    // Installer automatiquement le script tag si pas déjà installé
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:37',message:'Script tag installation attempt started',data:{shop},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      // Construire l'URL du script - utiliser l'URL de la boutique + proxy path
      const url = new URL(request.url);
      const baseUrl = url.origin;
      const scriptTagUrl = `${baseUrl}/apps/tryon/widget.js`;
      
      // Vérifier si le script tag existe déjà
      const scriptTagsQuery = `#graphql
        query {
          scriptTags(first: 50) {
            edges {
              node {
                id
                src
              }
            }
          }
        }
      `;
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:57',message:'Before scriptTags query GraphQL call',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      const scriptTagsResponse = await admin.graphql(scriptTagsQuery);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:58',message:'After scriptTags query GraphQL call',data:{ok:scriptTagsResponse.ok,status:scriptTagsResponse.status,statusText:scriptTagsResponse.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Check if response is OK (not a redirect)
      if (!scriptTagsResponse.ok) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:60',message:'scriptTagsResponse not OK',data:{status:scriptTagsResponse.status,statusText:scriptTagsResponse.statusText,is302:scriptTagsResponse.status===302,is401:scriptTagsResponse.status===401},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        if (scriptTagsResponse.status === 302 || scriptTagsResponse.status === 401) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:62',message:'Auth required detected, skipping',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          console.warn("Authentication required for script tag check, skipping auto-install");
          // Skip script tag installation if auth is required
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:66',message:'Other error status, logging',data:{status:scriptTagsResponse.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          const errorText = await scriptTagsResponse.text().catch(() => "Unknown error");
          console.error("Error checking script tags:", scriptTagsResponse.status, errorText);
        }
        // Continue without installing script tag
      } else {
        let scriptTagsData;
        try {
          scriptTagsData = await scriptTagsResponse.json();
        } catch (jsonError) {
          console.error("Failed to parse script tags response:", jsonError);
          // Continue without installing script tag
        }
        
        if (scriptTagsData) {
          const existingScripts = scriptTagsData.data?.scriptTags?.edges || [];
          
          // Supprimer les anciens script tags qui pourraient interférer
          const oldScriptTags = existingScripts.filter((edge: any) => {
            const src = edge.node.src || '';
            return src.includes('widget') || 
                   src.includes('tryon') || 
                   src.includes('try-on') ||
                   src.includes('vton') ||
                   (src.includes('/apps/') && src.includes('widget'));
          });
          
          // Supprimer les anciens script tags
          for (const oldScript of oldScriptTags) {
            try {
              const deleteScriptTagMutation = `#graphql
                mutation scriptTagDelete($id: ID!) {
                  scriptTagDelete(id: $id) {
                    deletedScriptTagId
                    userErrors {
                      field
                      message
                    }
                  }
                }
              `;
              
              const deleteResult = await admin.graphql(deleteScriptTagMutation, {
                variables: {
                  id: oldScript.node.id
                }
              });
              
              if (deleteResult.ok) {
                const deleteData = await deleteResult.json().catch(() => null);
                if (deleteData?.data?.scriptTagDelete?.deletedScriptTagId) {
                  console.log("Old script tag deleted:", oldScript.node.src);
                }
              }
            } catch (deleteError) {
              console.warn("Error deleting old script tag:", deleteError);
            }
          }
          
          // Vérifier si le nouveau script tag existe déjà
          const scriptExists = existingScripts.some((edge: any) => 
            edge.node.src.includes('/apps/tryon/widget.js')
          );

          if (!scriptExists) {
            // Créer le script tag automatiquement
            const createScriptTagMutation = `#graphql
              mutation scriptTagCreate($input: ScriptTagInput!) {
                scriptTagCreate(input: $input) {
                  scriptTag {
                    id
                    src
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:101',message:'Before createScriptTag mutation GraphQL call',data:{scriptTagUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            const result = await admin.graphql(createScriptTagMutation, {
              variables: {
                input: {
                  src: scriptTagUrl,
                  displayScope: "ONLINE_STORE",
                }
              }
            });
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:109',message:'After createScriptTag mutation GraphQL call',data:{ok:result.ok,status:result.status,statusText:result.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            // Check if response is OK
            if (!result.ok) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:112',message:'result not OK',data:{status:result.status,statusText:result.statusText,is302:result.status===302,is401:result.status===401},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              // #endregion
              if (result.status === 302 || result.status === 401) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:113',message:'Auth required for creation, skipping',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                console.warn("Authentication required for script tag creation, skipping");
              } else {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:116',message:'Other error status for creation, logging',data:{status:result.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                const errorText = await result.text().catch(() => "Unknown error");
                console.error("Error creating script tag:", result.status, errorText);
              }
            } else {
              let resultData;
              try {
                resultData = await result.json();
              } catch (jsonError) {
                console.error("Failed to parse script tag creation response:", jsonError);
              }
              
              if (resultData) {
                // Check for GraphQL errors
                if (resultData.errors) {
                  const errorMessages = resultData.errors.map((e: any) => e.message || String(e)).join(", ");
                  console.error("GraphQL errors creating script tag:", errorMessages);
                }
                
                // Check for user errors
                if (resultData.data?.scriptTagCreate?.userErrors?.length > 0) {
                  console.error("Script tag user errors:", resultData.data.scriptTagCreate.userErrors);
                } else if (resultData.data?.scriptTagCreate?.scriptTag) {
                  console.log("Script tag installed successfully:", resultData.data.scriptTagCreate.scriptTag.src);
                }
              }
            }
          }
        }
      }
    } catch (scriptError) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:145',message:'Catch block - scriptError caught',data:{errorType:scriptError?.constructor?.name,isResponse:scriptError instanceof Response,hasStatus:!!(scriptError as any)?.status,status:(scriptError as any)?.status,message:scriptError instanceof Error ? scriptError.message : String(scriptError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      // Ne pas loguer l'objet Response directement - extraire seulement les infos nécessaires
      if (scriptError instanceof Response) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:148',message:'scriptError is Response object',data:{status:scriptError.status,statusText:scriptError.statusText,url:scriptError.url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        console.warn(`Script tag installation skipped: ${scriptError.status} ${scriptError.statusText}`);
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:152',message:'scriptError is not Response, logging normally',data:{message:scriptError instanceof Error ? scriptError.message : String(scriptError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        console.error("Error installing script tag:", scriptError);
      }
      // Ne pas bloquer le chargement si l'installation du script échoue
    }

    return json({
      shop: shopData || null,
      recentLogs: Array.isArray(recentLogs) ? recentLogs.slice(0, 5) : [],
      topProducts: Array.isArray(topProducts) ? topProducts : [],
      dailyStats: Array.isArray(dailyStats) ? dailyStats : [],
    });
  } catch (error) {
    console.error("Dashboard loader error:", error);
    return json({
      shop: null,
      recentLogs: [],
      topProducts: [],
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const intent = formData.get("intent") as string;

  // Action pour nettoyer les anciens script tags
  if (intent === "cleanup-script-tags") {
    try {
      const scriptTagsQuery = `#graphql
        query {
          scriptTags(first: 50) {
            edges {
              node {
                id
                src
              }
            }
          }
        }
      `;
      
      const scriptTagsResponse = await admin.graphql(scriptTagsQuery);
      
      if (scriptTagsResponse.ok) {
        const scriptTagsData = await scriptTagsResponse.json();
        const existingScripts = scriptTagsData.data?.scriptTags?.edges || [];
        
        // Trouver tous les anciens script tags liés au widget
        const oldScriptTags = existingScripts.filter((edge: any) => {
          const src = edge.node.src || '';
          return src.includes('widget') || 
                 src.includes('tryon') || 
                 src.includes('try-on') ||
                 src.includes('vton') ||
                 (src.includes('/apps/') && src.includes('widget'));
        });
        
        let deletedCount = 0;
        
        // Supprimer chaque ancien script tag
        for (const oldScript of oldScriptTags) {
          try {
            const deleteScriptTagMutation = `#graphql
              mutation scriptTagDelete($id: ID!) {
                scriptTagDelete(id: $id) {
                  deletedScriptTagId
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;
            
            const deleteResult = await admin.graphql(deleteScriptTagMutation, {
              variables: {
                id: oldScript.node.id
              }
            });
            
            if (deleteResult.ok) {
              const deleteData = await deleteResult.json().catch(() => null);
              if (deleteData?.data?.scriptTagDelete?.deletedScriptTagId) {
                deletedCount++;
              }
            }
          } catch (deleteError) {
            console.warn("Error deleting script tag:", deleteError);
          }
        }
        
        return json({ 
          success: true, 
          deletedCount,
          message: `Supprimé ${deletedCount} ancien(s) script tag(s)` 
        });
      }
      
      return json({ success: false, error: "Impossible de récupérer les script tags" });
    } catch (error) {
      console.error("Error cleaning up script tags:", error);
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Erreur inconnue" 
      });
    }
  }

  // Action normale pour sauvegarder la configuration
  const widgetText = (formData.get("widgetText") as string) || "Try It On Now";
  const widgetBg = (formData.get("widgetBg") as string) || "#000000";
  const widgetColor = (formData.get("widgetColor") as string) || "#ffffff";
  const maxTriesPerUserStr = formData.get("maxTriesPerUser") as string;
  const maxTriesPerUser = maxTriesPerUserStr ? parseInt(maxTriesPerUserStr) : 5;
  const isEnabled = formData.get("isEnabled") === "true";
  const dailyLimitStr = formData.get("dailyLimit") as string;
  const dailyLimit = dailyLimitStr ? parseInt(dailyLimitStr) : 100;

  console.log("[Dashboard Action] Saving configuration:", {
    shop,
    isEnabled,
    dailyLimit,
    maxTriesPerUser,
    widgetText,
    widgetBg,
    widgetColor,
  });

  try {
    await upsertShop(shop, {
      widgetText,
      widgetBg,
      widgetColor,
      maxTriesPerUser,
      isEnabled,
      dailyLimit,
    });

    console.log("[Dashboard Action] Configuration saved successfully");
    return json({ success: true });
  } catch (error) {
    console.error("[Dashboard Action] Error saving configuration:", error);
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Erreur lors de la sauvegarde" 
    });
  }
};

export default function Dashboard() {
  const { shop, recentLogs, topProducts, dailyStats, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();

  const credits = shop?.credits || 0;
  const totalTryons = shop?.total_tryons || 0;
  const totalAtc = shop?.total_atc || 0;
  const conversionRate = totalTryons > 0
    ? ((totalAtc / totalTryons) * 100).toFixed(1)
    : "0.0";
  
  // Calculate 30-day total
  const last30DaysTotal = dailyStats.reduce((sum: number, stat: any) => sum + stat.count, 0);

  const handleSave = (formData: FormData) => {
    // Ensure all required fields are present
    if (!formData.get("widgetText")) {
      formData.set("widgetText", shop?.widget_text || "Try It On Now");
    }
    if (!formData.get("widgetBg")) {
      formData.set("widgetBg", shop?.widget_bg || "#000000");
    }
    if (!formData.get("widgetColor")) {
      formData.set("widgetColor", shop?.widget_color || "#ffffff");
    }
    if (!formData.get("maxTriesPerUser")) {
      formData.set("maxTriesPerUser", String(shop?.max_tries_per_user || 5));
    }
    if (!formData.get("isEnabled")) {
      formData.set("isEnabled", shop?.is_enabled !== false ? "true" : "false");
    }
    if (!formData.get("dailyLimit")) {
      formData.set("dailyLimit", String(shop?.daily_limit || 100));
    }
    fetcher.submit(formData, { method: "post" });
  };
  
  const [isEnabled, setIsEnabled] = useState(shop?.is_enabled !== false);

  useEffect(() => {
    if (fetcher.data?.success) {
      setTimeout(() => {
        revalidator.revalidate();
      }, 500);
    }
  }, [fetcher.data?.success, revalidator]);

  const stats = [
    { 
      label: "Available Credits", 
      value: credits.toLocaleString("en-US"), 
      icon: "",
      link: "/app/credits"
    },
    { 
      label: "Total try-ons", 
      value: totalTryons.toLocaleString("en-US"), 
      icon: "",
      link: "/app/history"
    },
    { 
      label: "Add to Cart", 
      value: totalAtc.toLocaleString("en-US"), 
      icon: "",
      link: "/app/history"
    },
    { 
      label: "Conversion Rate", 
      value: `${conversionRate}%`, 
      icon: "",
      link: "/app/history"
    },
  ];

  return (
    <Page>
      <TitleBar title="Dashboard - VTON Magic" />
      <div className="app-container">
        <header className="app-header">
          <h1 className="app-title">Dashboard</h1>
          <p className="app-subtitle">
            Vue d'ensemble de votre activité et statistiques
          </p>
        </header>

        {/* Alerts compactes en haut */}
        {(error || fetcher.data?.success || credits < 50) && (
          <div className="vton-section" style={{ marginBottom: "2rem" }}>
            <BlockStack gap="300">
              {error && (
                <Banner tone="critical" title="Error">
                  {error}
                </Banner>
              )}
              {fetcher.data?.success && fetcher.data?.deletedCount !== undefined && (
                <Banner tone="success">
                  {fetcher.data.message || `Supprimé ${fetcher.data.deletedCount} ancien(s) script tag(s)`}
                </Banner>
              )}
              {fetcher.data?.success && fetcher.data?.deletedCount === undefined && (
                <Banner tone="success">
                  Configuration sauvegardée avec succès
                </Banner>
              )}
              {fetcher.data?.error && (
                <Banner tone="critical">
                  Erreur : {fetcher.data.error}
                </Banner>
              )}
              {credits < 50 && (
                <Banner tone="warning" title="Low Credits Balance">
                  <p>
                    You have <strong>{credits}</strong> credit{credits > 1 ? "s" : ""} remaining. 
                    <Link to="/app/credits" style={{ marginLeft: "8px" }}>
                      Recharge now →
                    </Link>
                  </p>
                </Banner>
              )}
            </BlockStack>
          </div>
        )}

        {/* Section 1: 4 Statistiques en une ligne horizontale - Full Width - Uniform Height */}
        <div className="vton-section">
          <div className="dashboard-stats-row">
            <div className="vton-card">
              <div className="stat-card-content">
                <div className="stat-icon">💰</div>
                <div className="stat-info">
                  <div className="stat-value">{credits.toLocaleString("en-US")}</div>
                  <div className="stat-label">Jetons restants</div>
                  <Button url="/app/credits" variant="plain" size="slim">
                    Acheter →
                  </Button>
                </div>
              </div>
            </div>
            <div className="vton-card">
              <div className="stat-card-content">
                <div className="stat-icon">📊</div>
                <div className="stat-info">
                  <div className="stat-value">{last30DaysTotal.toLocaleString("en-US")}</div>
                  <div className="stat-label">Total Try-ons (30j)</div>
                  <Button url="/app/history" variant="plain" size="slim">
                    Voir l'historique →
                  </Button>
                </div>
              </div>
            </div>
            <div className="vton-card">
              <div className="stat-card-content">
                <div className="stat-icon">🛒</div>
                <div className="stat-info">
                  <div className="stat-value">{totalAtc.toLocaleString("en-US")}</div>
                  <div className="stat-label">Add to Cart</div>
                </div>
              </div>
            </div>
            <div className="vton-card">
              <div className="stat-card-content">
                <div className="stat-icon">📈</div>
                <div className="stat-info">
                  <div className="stat-value">{conversionRate}%</div>
                  <div className="stat-label">Taux de conversion</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Layout principal - Graphique + Top Produits/Activité | Réglages - Full Width */}
        <div className="vton-section">
          <div className="dashboard-main-layout">
            {/* Colonne principale : Graphique + Top Produits + Activité (75%) */}
            <div>
              <BlockStack gap="300">
                {/* Graphique des générations */}
                <div className="vton-card">
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingLg" fontWeight="semibold">
                        Générations par jour (7 derniers jours)
                      </Text>
                      <Button url="/app/history" variant="plain" size="slim">
                        Voir tout →
                      </Button>
                    </InlineStack>
                    <Divider />
                    {dailyStats.length > 0 ? (
                      <Box className="graph-container-large">
                        <InlineStack gap="300" align="stretch" blockAlign="end">
                          {dailyStats.slice(-7).map((stat: any, index: number) => {
                            const maxCount = Math.max(...dailyStats.map((s: any) => s.count));
                            const percentage = maxCount > 0 ? (stat.count / maxCount) * 100 : 0;
                            const date = new Date(stat.date);
                            return (
                              <Box key={index} minWidth="0" flexGrow={1}>
                                <BlockStack gap="200" align="center">
                                  <Text variant="bodySm" fontWeight="semibold" as="p">
                                    {stat.count}
                                  </Text>
                                  <Box
                                    background="bg-fill-brand"
                                    borderRadius="200"
                                    minHeight="100px"
                                    style={{ height: `${Math.max(percentage, 5)}%` }}
                                    position="relative"
                                  />
                                  <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                                    {date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                  </Text>
                                </BlockStack>
                              </Box>
                            );
                          })}
                        </InlineStack>
                      </Box>
                    ) : (
                      <Box className="empty-state-large" textAlign="center">
                        <Text variant="bodyLg" tone="subdued" as="p">
                          Aucune donnée disponible pour les 30 derniers jours
                        </Text>
                      </Box>
                    )}
                  </BlockStack>
                </div>

                {/* Top Produits et Activité récente côte à côte */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                  <div>
                    <div className="vton-card">
                      <BlockStack gap="300">
                        <Text as="h2" variant="headingLg" fontWeight="semibold">
                          Produits les plus essayés
                        </Text>
                        <Text variant="bodyMd" tone="subdued" as="p">
                          Vos produits avec le plus d'essayages
                        </Text>
                        <Divider />
                        {topProducts.length > 0 ? (
                          <BlockStack gap="400">
                            {topProducts.map((product: any, index: number) => (
                              <InlineStack key={product.product_id || index} align="space-between" blockAlign="center">
                                <Text variant="bodyMd" as="span" truncate>
                                  {product.product_title || product.product_id || "Produit inconnu"}
                                </Text>
                                <Badge tone="info">
                                  {product.tryons || product.count} essai{product.tryons > 1 ? "s" : ""}
                                </Badge>
                              </InlineStack>
                            ))}
                          </BlockStack>
                        ) : (
                          <Box className="empty-state-large" textAlign="center">
                            <Text variant="bodyLg" tone="subdued" as="p">
                              Aucun essai pour le moment. Commencez à utiliser le widget sur vos produits !
                            </Text>
                          </Box>
                        )}
                      </BlockStack>
                    </div>
                  </div>

                  <div>
                    <div className="vton-card">
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text variant="headingLg" fontWeight="bold" as="h2">
                            Activité récente
                          </Text>
                          <Button url="/app/history" variant="plain">
                            Voir tout →
                          </Button>
                        </InlineStack>
                        <Divider />
                        {recentLogs.length > 0 ? (
                          <BlockStack gap="400">
                            {recentLogs.slice(0, 5).map((log: any, index: number) => (
                              <InlineStack key={log.id || index} align="space-between" blockAlign="center">
                                <BlockStack gap="100">
                                  <Text variant="bodyMd" fontWeight="medium" as="p">
                                    {log.product_title || log.product_id || "Produit inconnu"}
                                  </Text>
                                  <Text variant="bodySm" tone="subdued" as="p">
                                    {new Date(log.created_at).toLocaleDateString("fr-FR", { 
                                      month: "short", 
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit"
                                    })}
                                  </Text>
                                </BlockStack>
                                <Badge tone={log.success ? "success" : "critical"}>
                                  {log.success ? "✓ Réussi" : "✗ Échec"}
                                </Badge>
                              </InlineStack>
                            ))}
                          </BlockStack>
                        ) : (
                          <Box className="empty-state-large" textAlign="center">
                            <Text variant="bodyLg" tone="subdued" as="p">
                              Aucune activité récente. Les essais apparaîtront ici une fois que les clients commenceront à utiliser le widget.
                            </Text>
                          </Box>
                        )}
                      </BlockStack>
                    </div>
                  </div>
                </div>
              </BlockStack>
            </div>

            {/* Colonne latérale droite : Réglages (25%) */}
            <div>
              <div className="vton-card">
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg" fontWeight="semibold">
                    Réglages & Sécurité
                  </Text>
                  <Divider />
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      handleSave(formData);
                    }}
                  >
                    <BlockStack gap="400">
                      <Checkbox
                        label="Activer l'app sur le store"
                        checked={isEnabled}
                        onChange={setIsEnabled}
                      />
                      <input type="hidden" name="isEnabled" value={isEnabled ? "true" : "false"} />
                      <TextField
                        label="Plafond journalier"
                        name="dailyLimit"
                        type="number"
                        defaultValue={String(shop?.daily_limit || 100)}
                        autoComplete="off"
                        helpText="Limite du nombre d'essais par jour (protection anti-abus)"
                      />
                      <TextField
                        label="Max try-ons par utilisateur/jour"
                        name="maxTriesPerUser"
                        type="number"
                        defaultValue={String(shop?.max_tries_per_user || 5)}
                        autoComplete="off"
                        helpText="Limite quotidienne par utilisateur"
                      />
                      <Divider />
                      <BlockStack gap="200">
                        <Text variant="bodySm" tone="subdued" as="p">
                          <strong>Nettoyage :</strong> Supprime les anciens widgets et script tags qui pourraient interférer
                        </Text>
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            const formData = new FormData();
                            formData.append("intent", "cleanup-script-tags");
                            fetcher.submit(formData, { method: "post" });
                          }}
                          loading={fetcher.state === "submitting"}
                        >
                          Nettoyer les anciens widgets
                        </Button>
                      </BlockStack>
                      <InlineStack align="end">
                        <Button submit variant="primary" loading={fetcher.state === "submitting"}>
                          Enregistrer
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </form>
                </BlockStack>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
