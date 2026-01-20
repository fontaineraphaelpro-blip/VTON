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
  BlockStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop, getTryonLogs, getTopProducts, getTryonStatsByDay, getMonthlyTryonUsage, query } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);

  try {
    // On vérifie si un des plans payants est actif
    // Note : On retire "free-installation-setup" de la liste requise pour forcer le check
    await billing.require({
      plans: ["starter", "pro", "studio"] as any,
      isTest: true,
      onFailure: async () => {
        console.log("⚠️ Redirection vers le paiement TEST (Plan Starter)...");
        
        // C'est ici que ça bloquait.
        // On lance la redirection vers la page de paiement.
        throw await (billing.request as any)({
          plan: "starter", 
          isTest: true, // INDISPENSABLE : Génère une charge fictive
          returnUrl: `https://${url.host}/app`, 
        });
      },
    } as any);
  } catch (error) {
    // Si Shopify renvoie une redirection (Response), on l'exécute
    if (error instanceof Response) return error;
    
    // Si c'est une autre erreur, on l'affiche
    console.error("❌ ERREUR BILLING :", error);
    throw error;
  }

  try {
    await ensureTables();

    const shopData = await getShop(shop);
    const recentLogs = await getTryonLogs(shop, { limit: 50 });
    const topProducts = await getTopProducts(shop, 10);
    const dailyStats = await getTryonStatsByDay(shop, 30);
    const monthlyUsage = await getMonthlyTryonUsage(shop);

    // Build product handles map from logs (for fallback matching)
    const productHandlesMap: Record<string, string> = {};
    recentLogs.forEach((log: any) => {
      if (log.product_handle && log.product_title) {
        productHandlesMap[log.product_handle] = log.product_title;
      }
    });

    // Fetch product names from Shopify for products that don't have product_title
    const productNamesMap: Record<string, string> = {};
    const productIdsArray: string[] = [];
    
    // Collect product IDs that need fetching (from topProducts and recentLogs)
    topProducts.forEach((product: any) => {
      if (product.product_id && !product.product_title) {
        const gidMatch = product.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
        if (gidMatch) {
          productIdsArray.push(gidMatch[1]);
        } else if (/^\d+$/.test(product.product_id)) {
          productIdsArray.push(product.product_id);
        }
      }
    });
    
    recentLogs.forEach((log: any) => {
      if (log.product_id && !log.product_title) {
        const gidMatch = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
        if (gidMatch) {
          const numericId = gidMatch[1];
          if (!productIdsArray.includes(numericId)) {
            productIdsArray.push(numericId);
          }
        } else if (/^\d+$/.test(log.product_id)) {
          if (!productIdsArray.includes(log.product_id)) {
            productIdsArray.push(log.product_id);
          }
        }
      }
    });

    // Fetch all products from Shopify if we have IDs to fetch
    if (productIdsArray.length > 0) {
      try {
        const productQuery = `#graphql
          query {
            products(first: 250) {
              edges {
                node {
                  id
                  title
                  handle
                  variants(first: 100) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        `;
        
        console.log(`[Dashboard] Fetching all products from Shopify...`);
        
        const response = await admin.graphql(productQuery);
        
        console.log(`[Dashboard] GraphQL response status:`, response.ok, response.status);
        
        if (response.ok) {
          const data = await response.json() as any;
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:120',message:'GraphQL products query response received',data:{hasErrors:!!data.errors,errors:data.errors,hasData:!!data.data,hasProducts:!!data.data?.products,productsCount:data.data?.products?.edges?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          
          // Check for GraphQL errors first
          if (data.errors) {
            console.error(`[Dashboard] GraphQL errors:`, JSON.stringify(data.errors, null, 2));
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:125',message:'GraphQL errors detected',data:{errors:data.errors},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
          }
          
          if (data.data?.products?.edges) {
            console.log(`[Dashboard] Received ${data.data.products.edges.length} products from GraphQL`);
            
            // Create a map of all products by ID (both GID and numeric) and variants
            data.data.products.edges.forEach((edge: any) => {
              const product = edge.node;
              if (product && product.id && product.title) {
                // Store both GID and numeric ID as keys
                productNamesMap[product.id] = product.title;
                const numericId = product.id.replace('gid://shopify/Product/', '');
                productNamesMap[numericId] = product.title;
                
                // Also store by handle if available
                if (product.handle) {
                  productNamesMap[product.handle] = product.title;
                }
                
                // Store variant IDs -> product title mapping (for matching variant IDs in logs)
                if (product.variants?.edges) {
                  product.variants.edges.forEach((variantEdge: any) => {
                    const variant = variantEdge.node;
                    if (variant && variant.id) {
                      // Store variant GID -> product title
                      productNamesMap[variant.id] = product.title;
                      // Extract numeric ID from variant GID (format: gid://shopify/ProductVariant/123456)
                      const variantGidMatch = variant.id.match(/^gid:\/\/shopify\/ProductVariant\/(\d+)$/);
                      if (variantGidMatch) {
                        const variantNumericId = variantGidMatch[1];
                        productNamesMap[variantNumericId] = product.title;
                        console.log(`[Dashboard] ✓ Stored variant mapping: ${variant.id} (numeric: ${variantNumericId}) -> ${product.title}`);
                      }
                    }
                  });
                }
                
                console.log(`[Dashboard] ✓ Stored product: ${product.id} (numeric: ${numericId}, handle: ${product.handle || 'N/A'}) -> ${product.title}`);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:160',message:'Stored product in map',data:{gid:product.id,numericId,handle:product.handle,title:product.title,variantsCount:product.variants?.edges?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'F'})}).catch(()=>{});
                // #endregion
              }
            });
            
            // Now match the requested IDs
            productIdsArray.forEach((requestedId) => {
              const requestedGid = `gid://shopify/Product/${requestedId}`;
              let title = productNamesMap[requestedGid] || productNamesMap[requestedId];
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:175',message:'Trying to match requested ID',data:{requestedId,requestedGid,foundInMap:!!title,availableKeys:Object.keys(productNamesMap).slice(0,15)},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'F'})}).catch(()=>{});
              // #endregion
              
              if (!title) {
                console.warn(`[Dashboard] ✗ Product not found in products list: ${requestedId} (GID: ${requestedGid})`);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:181',message:'Product not found in products list',data:{requestedId,requestedGid,availableIds:Object.keys(productNamesMap).slice(0,15),allAvailableKeys:Object.keys(productNamesMap)},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'F'})}).catch(()=>{});
                // #endregion
                
                // Fallback 1: try to find product_title in logs with same ID
                const logWithTitle = recentLogs.find((log: any) => {
                  if (!log.product_id) return false;
                  const logGidMatch = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
                  const logNumericId = logGidMatch ? logGidMatch[1] : log.product_id;
                  return log.product_id === requestedGid || logNumericId === requestedId;
                });
                
                // Fallback 2: if no title found, try to find logs with handles that match products
                // Count how many logs have each handle/product_title
                if (!logWithTitle?.product_title) {
                  const handleCounts: Record<string, number> = {};
                  recentLogs.forEach((log: any) => {
                    // If log has a handle (not GID, not numeric)
                    if (log.product_id && !log.product_id.startsWith('gid://') && !/^\d+$/.test(log.product_id)) {
                      const handle = log.product_id;
                      if (productNamesMap[handle]) {
                        handleCounts[handle] = (handleCounts[handle] || 0) + 1;
                      }
                    }
                  });
                  
                  // Find the most frequent handle that matches a product
                  const mostFrequentHandle = Object.keys(handleCounts).sort((a, b) => handleCounts[b] - handleCounts[a])[0];
                  if (mostFrequentHandle && productNamesMap[mostFrequentHandle]) {
                    title = productNamesMap[mostFrequentHandle];
                    console.log(`[Dashboard] Using most frequent handle as fallback: ${requestedId} -> ${title} (handle: ${mostFrequentHandle}, count: ${handleCounts[mostFrequentHandle]})`);
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:200',message:'Using most frequent handle as fallback',data:{requestedId,title,handle:mostFrequentHandle,count:handleCounts[mostFrequentHandle]},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'F'})}).catch(()=>{});
                    // #endregion
                  }
                }
                
                // Fallback 3: use product_title from log if found
                if (!title && logWithTitle?.product_title) {
                  title = logWithTitle.product_title;
                  console.log(`[Dashboard] Using product_title from log as fallback: ${requestedId} -> ${title}`);
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:210',message:'Successfully used product_title from log',data:{requestedId,title},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'F'})}).catch(()=>{});
                  // #endregion
                }
                
                // Store the title in map for future use
                if (title) {
                  productNamesMap[requestedGid] = title;
                  productNamesMap[requestedId] = title;
                }
              }
              
              if (title) {
                console.log(`[Dashboard] ✓ Matched product: ${requestedId} -> ${title}`);
              }
            });
          } else {
            console.warn(`[Dashboard] No products in GraphQL response, data structure:`, {
              hasData: !!data.data,
              hasProducts: !!data.data?.products,
              dataKeys: data.data ? Object.keys(data.data) : [],
              fullData: JSON.stringify(data, null, 2).substring(0, 1000)
            });
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:170',message:'No products in GraphQL response',data:{hasData:!!data.data,hasProducts:!!data.data?.products,dataKeys:data.data?Object.keys(data.data):[],fullData:JSON.stringify(data,null,2).substring(0,1000)},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
          }
        } else {
          const errorText = await response.text().catch(() => "Unknown error");
          console.error(`[Dashboard] Failed to fetch products:`, response.status, errorText);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app._index.tsx:175',message:'GraphQL request failed',data:{status:response.status,errorText:errorText.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
        }
        
        console.log(`[Dashboard] Product names map:`, productNamesMap);
      } catch (error) {
        console.error("Error fetching product names:", error);
      }
    } else {
      console.log(`[Dashboard] No products to fetch (all have product_title or no product_id)`);
    }
    
    // Enrich topProducts with product titles (use fetched names, fallback to existing product_title from logs)
    const enrichedTopProducts = topProducts.map((product: any) => {
      if (product.product_id) {
        const gidMatch = product.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
        const numericId = gidMatch ? gidMatch[1] : product.product_id;
        // Try to get title from fetched map first
        let title = productNamesMap[product.product_id] || productNamesMap[numericId];
        
        // If not found, try to find a log with the same product_id and extract handle from URL or use product_title
        if (!title) {
          // Find logs with this product_id
          const logsWithSameId = recentLogs.filter((log: any) => {
            if (!log.product_id) return false;
            const logGidMatch = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
            const logNumericId = logGidMatch ? logGidMatch[1] : log.product_id;
            return log.product_id === product.product_id || logNumericId === numericId;
          });
          
          // Try to find handle from logs (extract from URL if available)
          for (const log of logsWithSameId) {
            // Try to extract handle from product_id if it's a handle
            if (!log.product_id.startsWith('gid://') && !/^\d+$/.test(log.product_id)) {
              const handle = log.product_id;
              if (productNamesMap[handle]) {
                title = productNamesMap[handle];
                console.log(`[Dashboard] Matched by handle from log: ${product.product_id} -> ${title}`);
                break;
              }
            }
            
            // Use product_title from log if available
            if (log.product_title) {
              title = log.product_title;
              console.log(`[Dashboard] Using product_title from log for topProduct: ${product.product_id} -> ${title}`);
              break;
            }
          }
        }
        
        // If still not found and product_id is a handle, try handles map
        if (!title && productHandlesMap[product.product_id]) {
          title = productHandlesMap[product.product_id];
          console.log(`[Dashboard] Using product_title from handles map for topProduct: ${product.product_id} -> ${title}`);
        }
        
        // If still not found, try to match by checking all products for similar IDs (maybe variant IDs)
        if (!title) {
          // The IDs in logs might be variant IDs, not product IDs
          // Try to find products that might be related by checking if any product has a similar ID pattern
          // For now, we'll use the first product_title from logs as a last resort
          const firstLogWithTitle = recentLogs.find((log: any) => {
            const logGidMatch = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
            const logNumericId = logGidMatch ? logGidMatch[1] : log.product_id;
            // Check if this log's ID is close to the requested ID (might be same product, different variant)
            return logNumericId === numericId || (log.product_title && logNumericId !== numericId);
          });
          if (firstLogWithTitle?.product_title) {
            title = firstLogWithTitle.product_title;
            console.log(`[Dashboard] Using product_title from similar log: ${product.product_id} -> ${title}`);
          }
        }
        
        // Always set product_title - use title if found, otherwise use numeric ID (more readable than full GID)
        if (title) {
          console.log(`[Dashboard] Enriched topProduct: ${product.product_id} -> ${title}`);
          return { ...product, product_title: title };
        } else {
          // Use numeric ID as fallback (better than full GID)
          console.log(`[Dashboard] No title found for topProduct, using numeric ID: ${product.product_id} -> Product #${numericId}`);
          return { ...product, product_title: `Product #${numericId}` };
        }
      }
      return product;
    });
    
    // Enrich recentLogs with product titles (use handles for matching - more reliable)
    const enrichedRecentLogs = recentLogs.map((log: any) => {
      if (log.product_id || log.product_handle) {
        let title: string | undefined;
        
        // Priority 1: Use product_handle to match with products (most reliable)
        if (log.product_handle && productNamesMap[log.product_handle]) {
          title = productNamesMap[log.product_handle];
          console.log(`[Dashboard] Matched by handle: ${log.product_handle} -> ${title}`);
        }
        // Priority 2: Try product_id (GID or numeric) in fetched map
        else if (log.product_id) {
          const gidMatch = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
          const numericId = gidMatch ? gidMatch[1] : log.product_id;
          title = productNamesMap[log.product_id] || productNamesMap[numericId];
        }
        
        // Priority 3: Use product_handle from handles map (from other logs)
        if (!title && log.product_handle && productHandlesMap[log.product_handle]) {
          title = productHandlesMap[log.product_handle];
          console.log(`[Dashboard] Using product_title from handles map: ${log.product_handle} -> ${title}`);
        }
        
        // Priority 4: Use existing product_title from log
        if (!title && log.product_title) {
          title = log.product_title;
          console.log(`[Dashboard] Using existing product_title from log: ${log.product_id || log.product_handle} -> ${title}`);
        }
        
        // Always set product_title - use title if found, otherwise use numeric ID or handle
        if (title) {
          console.log(`[Dashboard] Enriched log: ${log.product_id || log.product_handle} -> ${title}`);
          return { ...log, product_title: title };
        } else {
          // Use handle if available, otherwise numeric ID
          const displayId = log.product_handle || (log.product_id ? (log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/)?.[1] || log.product_id) : 'Unknown');
          console.log(`[Dashboard] No title found for log, using ID: ${log.product_id || log.product_handle} -> Product #${displayId}`);
          return { ...log, product_title: `Product #${displayId}` };
        }
      }
      return log;
    });
    
    // Calculate total_tryons from logs if not set in shop record
    let totalTryons = shopData?.total_tryons || 0;
    if ((totalTryons === 0 || totalTryons === null) && shopData) {
      try {
        const tryonsResult = await query(
          `SELECT COUNT(*) as count FROM tryon_logs WHERE shop = $1 AND success = true`,
          [shop]
        );
        const calculatedTotal = parseInt(tryonsResult.rows[0]?.count || '0', 10);
        if (calculatedTotal > 0) {
          totalTryons = calculatedTotal;
          // Update shop record with calculated value (async, don't block)
          query(
            `UPDATE shops SET total_tryons = $1 WHERE domain = $2`,
            [calculatedTotal, shop]
          ).catch(() => {
            // Ignore update errors
          });
        }
      } catch (error) {
        // If calculation fails, use shop value
        totalTryons = shopData?.total_tryons || 0;
      }
    }

    // If shop doesn't exist yet, create it with free plan (4 credits/month)
    if (!shopData) {
      await upsertShop(shop, {
        credits: 4, // Initialize credits for compatibility with old system
        monthlyQuota: 4, // Initialize with free plan
      });
      // Re-fetch shop data after creation
      const newShopData = await getShop(shop);
      return json({
        shop: newShopData,
        recentLogs: [],
        topProducts: [],
        dailyStats: [],
        monthlyUsage: 0,
        totalTryons: 0,
      });
    }

    // Installer automatiquement le script tag si pas déjà installé
    try {
      // Construire l'URL du script - utiliser l'URL de l'app directement (pas le store)
      // Ajouter un paramètre de version pour forcer le rechargement après déploiement
      const url = new URL(request.url);
      const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || url.origin;
      // Utiliser un timestamp pour forcer la mise à jour à chaque déploiement
      const widgetVersion = process.env.WIDGET_VERSION || `v${Date.now()}`;
      const scriptTagUrl = `${appUrl}/apps/tryon/widget-v2.js?v=${widgetVersion}`;
      
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
      
      let scriptTagsResponse;
      try {
        scriptTagsResponse = await admin.graphql(scriptTagsQuery);
      } catch (graphqlError: any) {
        // Check if it's a GraphQL error about access denied
        if (graphqlError?.message?.includes('Access denied') || graphqlError?.message?.includes('scriptTags')) {
          // Skip script tag installation - app doesn't have required permissions
          scriptTagsResponse = null;
        } else {
          throw graphqlError; // Re-throw if it's not an access denied error
        }
      }
      
      if (!scriptTagsResponse) {
        // Skip script tag installation if response is null (access denied)
        // Continue without installing script tag
      } else if (!scriptTagsResponse.ok) {
        if (scriptTagsResponse.status === 302 || scriptTagsResponse.status === 401) {
          // Skip script tag installation if auth is required
        } else {
          // Error logged silently - script tag installation is non-critical
          await scriptTagsResponse.text().catch(() => null);
        }
        // Continue without installing script tag
      } else {
        let scriptTagsData: any;
        try {
          scriptTagsData = await scriptTagsResponse.json() as any;
          // Check for GraphQL errors in the response body
          if (scriptTagsData?.errors) {
            const errorMessages = scriptTagsData.errors.map((e: any) => e.message || String(e)).join(", ");
            if (errorMessages.includes('Access denied') || errorMessages.includes('scriptTags')) {
              scriptTagsData = null; // Set to null to skip installation
            } else {
              // GraphQL error - log only in development
              if (process.env.NODE_ENV !== "production") {
                console.error("GraphQL errors in script tags query:", errorMessages);
              }
              scriptTagsData = null; // Set to null to skip installation
            }
          }
        } catch (jsonError) {
          // Log only in development
          if (process.env.NODE_ENV !== "production") {
            console.error("Failed to parse script tags response:", jsonError);
          }
          // Continue without installing script tag
          scriptTagsData = null;
        }
        
        if (scriptTagsData && scriptTagsData.data?.scriptTags) {
          const existingScripts = scriptTagsData.data?.scriptTags?.edges || [];
          
          // Supprimer les anciens script tags qui pourraient interférer
          // Supprimer widget.js (ancien) mais garder widget-v2.js (nouveau)
          const oldScriptTags = existingScripts.filter((edge: any) => {
            const src = edge.node.src || '';
            // Supprimer l'ancien widget.js mais pas widget-v2.js
            return (src.includes('/apps/tryon/widget.js') && !src.includes('widget-v2')) ||
                   (src.includes('widget') && !src.includes('widget-v2') && !src.includes('/apps/tryon/')) ||
                   src.includes('tryon') && !src.includes('widget-v2') ||
                   src.includes('try-on') ||
                   (src.includes('vton') && !src.includes('widget-v2'));
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
                // Script tag deleted successfully (silent in production)
              }
            } catch (deleteError) {
              // Error deleting old script tag - non-critical, continue silently
            }
          }
          
          // Construire l'URL attendue avec l'URL de l'app
          const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || new URL(request.url).origin;
          const widgetVersion = process.env.WIDGET_VERSION || `v${Date.now()}`;
          const expectedScriptUrl = `${appUrl}/apps/tryon/widget-v2.js?v=${widgetVersion}`;
          
          // Vérifier si le nouveau script tag existe déjà (avec la bonne version et la bonne URL)
          const scriptExists = existingScripts.some((edge: any) => {
            const src = edge.node.src || '';
            return src === expectedScriptUrl || (src.includes('/apps/tryon/widget-v2.js') && src.includes(`?v=${widgetVersion}`));
          });
          
          // Supprimer TOUS les anciens script tags du widget (peu importe la version)
          const allOldWidgetScripts = existingScripts.filter((edge: any) => {
            const src = edge.node.src || '';
            // Supprimer tous les script tags qui contiennent widget-v2 ou widget
            return (src.includes('/apps/tryon/widget') || src.includes('widget-v2')) && src !== expectedScriptUrl;
          });
          
          // Supprimer tous les anciens script tags du widget
          for (const oldScript of allOldWidgetScripts) {
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
                // Script tag deleted successfully (silent in production)
              }
            } catch (deleteError) {
              // Error deleting old version script tag - non-critical, continue silently
            }
          }

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

            const result = await admin.graphql(createScriptTagMutation, {
              variables: {
                input: {
                  src: scriptTagUrl,
                  displayScope: "ONLINE_STORE",
                }
              }
            });
            
            // Check if response is OK
            if (!result.ok) {
              if (result.status === 302 || result.status === 401) {
                // Authentication required - skip silently
              } else {
                // Log only in development
                if (process.env.NODE_ENV !== "production") {
                  const errorText = await result.text().catch(() => "Unknown error");
                  console.error("Error creating script tag:", result.status, errorText);
                }
              }
            } else {
              let resultData;
              try {
                resultData = await result.json();
              } catch (jsonError) {
                // Log only in development
                if (process.env.NODE_ENV !== "production") {
                  console.error("Failed to parse script tag creation response:", jsonError);
                }
              }
              
              if (resultData) {
                // Check for GraphQL errors
                if ((resultData as any).errors) {
                  // Log only in development
                  if (process.env.NODE_ENV !== "production") {
                    const errorMessages = (resultData as any).errors.map((e: any) => e.message || String(e)).join(", ");
                    console.error("GraphQL errors creating script tag:", errorMessages);
                  }
                }
                
                // Check for user errors
                if (resultData.data?.scriptTagCreate?.userErrors?.length > 0) {
                  // Log only in development
                  if (process.env.NODE_ENV !== "production") {
                    console.error("Script tag user errors:", resultData.data.scriptTagCreate.userErrors);
                  }
                }
                // Success - script tag installed (silent in production)
              }
            }
          }
        }
      }
    } catch (scriptError: any) {
      // Log only in development - script tag installation is non-critical
      if (process.env.NODE_ENV !== "production") {
        if (scriptError instanceof Response) {
          console.warn(`Script tag installation skipped: ${scriptError.status} ${scriptError.statusText}`);
        } else {
          console.error("Error installing script tag:", scriptError);
        }
      }
      // Don't block page load if script tag installation fails
    }

    return json({
      shop: shopData || null,
      recentLogs: Array.isArray(enrichedRecentLogs) ? enrichedRecentLogs.slice(0, 5) : [],
      topProducts: Array.isArray(enrichedTopProducts) ? enrichedTopProducts : [],
      dailyStats: Array.isArray(dailyStats) ? dailyStats : [],
      monthlyUsage: monthlyUsage || 0, // ADDED: Monthly usage count
      totalTryons: totalTryons || 0, // ADDED: Total try-ons (calculated or from shop)
    });
  } catch (error) {
    // Log error only in development
    if (process.env.NODE_ENV !== "production") {
      console.error("Dashboard loader error:", error);
    }
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
        const scriptTagsData = await scriptTagsResponse.json() as any;
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
            // Error deleting script tag - non-critical, continue
          }
        }
        
        return json({ 
          success: true, 
          deletedCount,
          message: `Deleted ${deletedCount} old script tag(s)` 
        });
      }
      
      return json({ success: false, error: "Unable to retrieve script tags" });
    } catch (error) {
      // Log error only in development
      if (process.env.NODE_ENV !== "production") {
        console.error("Error cleaning up script tags:", error);
      }
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
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
  // ADDED: Monthly quota and quality mode
  const monthlyQuotaStr = formData.get("monthlyQuota") as string;
  const monthlyQuota = monthlyQuotaStr && monthlyQuotaStr.trim() !== "" ? parseInt(monthlyQuotaStr) : null;
  const qualityMode = (formData.get("qualityMode") as string) || "balanced";

    // Configuration saved (logged in database)

  try {
    await upsertShop(shop, {
      widgetText,
      widgetBg,
      widgetColor,
      maxTriesPerUser,
      isEnabled,
      dailyLimit,
      monthlyQuota, // ADDED
      qualityMode, // ADDED
    });

    return json({ success: true });
  } catch (error) {
    // Log error only in development
    if (process.env.NODE_ENV !== "production") {
      console.error("[Dashboard Action] Error saving configuration:", error);
    }
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Error saving configuration" 
    });
  }
};

export default function Dashboard() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();

  // Handle both success and error cases from loader
  const shop = (loaderData as any).shop || null;
  const recentLogs = Array.isArray((loaderData as any).recentLogs) ? (loaderData as any).recentLogs : [];
  const topProducts = Array.isArray((loaderData as any).topProducts) ? (loaderData as any).topProducts : [];
  const dailyStats = Array.isArray((loaderData as any).dailyStats) ? (loaderData as any).dailyStats : [];
  const monthlyUsage = typeof (loaderData as any).monthlyUsage === 'number' ? (loaderData as any).monthlyUsage : 0;
  const error = (loaderData as any).error || null;

  // ADDED: Monthly quota and usage (for display only)
  const monthlyQuota = shop?.monthly_quota || null;
  const monthlyUsageCount = monthlyUsage || 0;
  const quotaPercentage = monthlyQuota && monthlyQuota > 0 
    ? Math.min((monthlyUsageCount / monthlyQuota) * 100, 100).toFixed(1)
    : null;
  const quotaExceeded = monthlyQuota && monthlyUsageCount >= monthlyQuota;

  // Use credits directly (accumulation system)
  // Credits accumulate when purchasing plans and are deducted on each generation
  const credits = shop?.credits || 0;
  
  // Debug log to verify credits value
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Dashboard] Credits display: shop?.credits=${shop?.credits}, credits=${credits}, shop object:`, {
      credits: shop?.credits,
      monthly_quota: shop?.monthly_quota,
      monthly_quota_used: shop?.monthly_quota_used
    });
  }
  
  // Get total try-ons from loader data (calculated in loader) or fallback to shop value
  const totalTryons = typeof (loaderData as any).totalTryons === 'number' 
    ? (loaderData as any).totalTryons 
    : (shop?.total_tryons || 0);
  
  const totalAtc = shop?.total_atc || 0;
  const conversionRate = totalTryons > 0 && totalAtc >= 0
    ? ((totalAtc / totalTryons) * 100).toFixed(1)
    : "0.0";
  
  // Calculate 30-day total
  const last30DaysTotal = dailyStats.reduce((sum: number, stat: any) => sum + stat.count, 0);
  
  // ADDED: Quality mode
  const qualityMode = shop?.quality_mode || "balanced";

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
    if (!formData.get("monthlyQuota")) {
      formData.set("monthlyQuota", shop?.monthly_quota ? String(shop.monthly_quota) : "");
    }
    if (!formData.get("qualityMode")) {
      formData.set("qualityMode", shop?.quality_mode || "balanced");
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
            Overview of your activity and statistics
          </p>
        </header>

        {/* Alerts compactes en haut */}
        {(error || fetcher.data?.success || credits < 50) && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <BlockStack gap="300">
              {error && (
                <Banner tone="critical" title="Error">
                  {error}
                </Banner>
              )}
              {fetcher.data?.success && (fetcher.data as any).deletedCount !== undefined && (
                <Banner tone="success">
                  {(fetcher.data as any).message || `Deleted ${(fetcher.data as any).deletedCount} old script tag(s)`}
                </Banner>
              )}
              {fetcher.data?.success && !(fetcher.data as any).deletedCount && (
                <Banner tone="success">
                  Configuration saved successfully
                </Banner>
              )}
              {(fetcher.data as any)?.error && (
                <Banner tone="critical">
                  Error: {(fetcher.data as any).error}
                </Banner>
              )}
              {credits < 10 && (
                <Banner tone="warning" title="Low Credits Balance">
                  <p>
                    You have <strong>{credits}</strong> credit{credits !== 1 ? "s" : ""} remaining. 
                    <Link to="/app/credits" style={{ marginLeft: "8px" }}>
                      Purchase credits →
                    </Link>
                  </p>
                </Banner>
              )}
              {/* ADDED: Monthly quota warning */}
              {quotaExceeded && (
                <Banner tone="critical" title="Monthly Quota Exceeded">
                  <p>
                    You have reached your monthly quota of <strong>{monthlyQuota}</strong> try-ons. 
                    {quotaPercentage && ` (${quotaPercentage}% used)`}
                  </p>
                </Banner>
              )}
              {monthlyQuota && !quotaExceeded && parseFloat(quotaPercentage || "0") > 80 && (
                <Banner tone="warning" title="Approaching Monthly Quota">
                  <p>
                    You have used <strong>{quotaPercentage}%</strong> of your monthly quota ({monthlyUsageCount} / {monthlyQuota} try-ons).
                  </p>
                </Banner>
              )}
            </BlockStack>
          </div>
        )}

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 5.83333H17.5M2.5 5.83333C1.39543 5.83333 0.5 6.72876 0.5 7.83333V15.8333C0.5 16.9379 1.39543 17.8333 2.5 17.8333H17.5C18.6046 17.8333 19.5 16.9379 19.5 15.8333V7.83333C19.5 6.72876 18.6046 5.83333 17.5 5.83333M2.5 5.83333V4.16667C2.5 3.0621 3.39543 2.16667 4.5 2.16667H15.5C16.6046 2.16667 17.5 3.0621 17.5 4.16667V5.83333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="stat-value">{credits.toLocaleString("en-US")}</div>
            <div className="stat-label">Remaining Credits</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 15.8333L10 2.5L17.5 15.8333H2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10 12.5V8.33333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="stat-value">{last30DaysTotal.toLocaleString("en-US")}</div>
            <div className="stat-label">Total Try-ons (30d)</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 2.5H4.16667L5.83333 12.5H15.8333L17.5 5.83333H5.83333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="7.5" cy="16.6667" r="1.66667" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="15" cy="16.6667" r="1.66667" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </div>
            <div className="stat-value">{totalAtc.toLocaleString("en-US")}</div>
            <div className="stat-label">Add to Cart</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 15.8333L7.5 10.8333L12.5 15.8333L17.5 10.8333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7.5 10.8333V2.5H12.5V10.8333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="stat-value">{conversionRate}%</div>
            <div className="stat-label">Conversion Rate</div>
          </div>
        </div>

        {/* Générations */}
        <div className="dashboard-section">
          <h2>Daily Generations (Last 7 Days)</h2>
          {dailyStats.length > 0 ? (
            <div className="graph-container-large">
              <div className="graph-bars">
                {dailyStats.slice(-7).map((stat: any, index: number) => {
                  const maxCount = Math.max(...dailyStats.map((s: any) => s.count));
                  // Calculate percentage: scale from 0% to 100% based on max value
                  const percentage = maxCount > 0 && stat.count > 0 
                    ? (stat.count / maxCount) * 100 
                    : 0;
                  const date = new Date(stat.date);
                  const isToday = date.toDateString() === new Date().toDateString();
                  
                  return (
                    <div key={index} className="graph-bar-item">
                      <div className="graph-bar-value">{stat.count}</div>
                      <div 
                        className={`graph-bar ${isToday ? 'graph-bar-today' : ''}`}
                        style={{ height: `${Math.max(percentage, 2)}%` }}
                        title={`${stat.count} generation${stat.count !== 1 ? 's' : ''} on ${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`}
                      />
                      <div className={`graph-bar-label ${isToday ? 'graph-bar-label-today' : ''}`}>
                        {date.toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="dashboard-placeholder">
              No data available for the last 30 days
            </div>
          )}
        </div>

        {/* Produits et Activité côte à côte */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--spacing-lg)", marginBottom: "var(--spacing-lg)" }}>
          {/* Produits */}
          <div className="dashboard-section">
            <h2>Most Tried Products</h2>
            {topProducts.length > 0 ? (
              <div className="products-list">
                {topProducts.map((product: any, index: number) => (
                  <div key={product.product_id || index} className="product-item">
                    <span className="product-name">
                      {product.product_title || product.product_id || "Unknown Product"}
                    </span>
                    <Badge tone="info">
                      {`${product.tryons || product.count} try-on${(product.tryons || product.count) > 1 ? "s" : ""}`}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dashboard-placeholder">
                No try-ons yet. Start using the widget on your products!
              </div>
            )}
          </div>

          {/* Activité */}
          <div className="dashboard-section">
            <h2>Recent Activity</h2>
            {recentLogs.length > 0 ? (
              <div className="activity-list">
                {recentLogs.slice(0, 5).map((log: any, index: number) => (
                  <div key={log.id || index} className="activity-item">
                    <div className="activity-info">
                      <p className="activity-title">
                        {log.product_title || log.product_id || "Unknown Product"}
                      </p>
                      <p className="activity-date">
                        {new Date(log.created_at).toLocaleDateString("en-US", { 
                          month: "short", 
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </p>
                    </div>
                    <Badge tone={log.success ? "success" : "critical"}>
                      {log.success ? "✓ Success" : "✗ Failed"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dashboard-placeholder">
                No recent activity. Try-ons will appear here once customers start using the widget.
              </div>
            )}
          </div>
        </div>

        {/* Settings & Security */}
        <div className="dashboard-section">
          <h2>Settings & Security</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              handleSave(formData);
            }}
          >
            <div className="settings-grid">
              <div className="setting-card">
                <label>Enable app on store</label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Checkbox
                    checked={isEnabled}
                    onChange={setIsEnabled}
                    label=""
                  />
                  <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                    {isEnabled ? "Yes" : "No"}
                  </span>
                </div>
                <input type="hidden" name="isEnabled" value={isEnabled ? "true" : "false"} />
              </div>
              <div className="setting-card">
                <label>Daily Limit</label>
                <input
                  type="number"
                  name="dailyLimit"
                  defaultValue={String(shop?.daily_limit || 100)}
                  placeholder="Daily try-on limit"
                  className="vton-input"
                />
              </div>
              <div className="setting-card">
                <label>Max try-ons per user/day</label>
                <input
                  type="number"
                  name="maxTriesPerUser"
                  defaultValue={String(shop?.max_tries_per_user || 5)}
                  placeholder="0"
                />
              </div>
              {/* ADDED: Monthly quota setting */}
              <div className="setting-card">
                <label>Monthly Quota Limit</label>
                <input
                  type="number"
                  name="monthlyQuota"
                  defaultValue={shop?.monthly_quota ? String(shop.monthly_quota) : ""}
                  placeholder="Unlimited (leave empty)"
                  className="vton-input"
                />
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  {monthlyQuota 
                    ? `Current usage: ${monthlyUsageCount.toLocaleString()} / ${monthlyQuota.toLocaleString()} (${quotaPercentage}%)`
                    : `Current usage: ${monthlyUsageCount.toLocaleString()} (no limit set)`
                  }
                </p>
              </div>
              {/* ADDED: Quality vs Speed setting */}
              <div className="setting-card">
                <label>Quality Mode</label>
                <select
                  name="qualityMode"
                  defaultValue={qualityMode}
                  style={{ 
                    width: "100%", 
                    padding: "8px", 
                    borderRadius: "4px", 
                    border: "1px solid var(--border)",
                    fontSize: "14px"
                  }}
                >
                  <option value="speed">Speed (Faster generation, lower quality)</option>
                  <option value="balanced">Balanced (Recommended)</option>
                  <option value="quality">Quality (Slower generation, higher quality)</option>
                </select>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  {qualityMode === "speed" && "Optimized for faster generation times"}
                  {qualityMode === "balanced" && "Good balance between speed and quality"}
                  {qualityMode === "quality" && "Optimized for best image quality"}
                </p>
              </div>
              <div className="setting-card">
                <label>Cleanup</label>
                <Button
                  onClick={() => {
                    const formData = new FormData();
                    formData.append("intent", "cleanup-script-tags");
                    fetcher.submit(formData, { method: "post" });
                  }}
                  disabled={fetcher.state === "submitting"}
                  loading={fetcher.state === "submitting"}
                >
                  {fetcher.state === "submitting" ? "Processing..." : "Delete old widgets and scripts"}
                </Button>
              </div>
            </div>
            <div style={{ marginTop: "20px" }}>
              <Button submit variant="primary" loading={fetcher.state === "submitting"}>
                Save
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Page>
  );
}
