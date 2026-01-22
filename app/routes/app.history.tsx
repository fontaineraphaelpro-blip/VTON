import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  DataTable,
  Badge,
  Banner,
  EmptyState,
  InlineStack,
  Divider,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getTryonLogs } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureTables();

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const logs = await getTryonLogs(shop, { limit, offset });

    // Fetch product names from Shopify for ALL products (even if they have product_title, to ensure accuracy)
    const productIdsToFetch = new Set<string>();
    const productHandlesToFetch = new Set<string>();
    
    // Collect product IDs and handles from logs
    logs.forEach((log: any) => {
      if (log.product_id) {
        const gidMatch = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
        if (gidMatch) {
          productIdsToFetch.add(gidMatch[1]);
        } else if (/^\d+$/.test(log.product_id)) {
          productIdsToFetch.add(log.product_id);
        }
      }
      if (log.product_handle) {
        productHandlesToFetch.add(log.product_handle);
      }
    });
    
    // Debug: Log what we're trying to fetch (always log for debugging)
    if (productIdsToFetch.size > 0 || productHandlesToFetch.size > 0) {
      console.log("[History] Fetching product names:", {
        productIds: Array.from(productIdsToFetch),
        productHandles: Array.from(productHandlesToFetch),
        totalLogs: logs.length,
        sampleLog: logs[0] ? {
          product_id: logs[0].product_id,
          product_handle: logs[0].product_handle,
          product_title: logs[0].product_title
        } : null
      });
    } else {
      console.log("[History] No product IDs or handles to fetch. Sample log:", logs[0] ? {
        product_id: logs[0].product_id,
        product_handle: logs[0].product_handle,
        product_title: logs[0].product_title
      } : null);
    }
    
    // Fetch product names from Shopify by ID
    const productNamesMap: Record<string, string> = {};
    const productHandlesMap: Record<string, string> = {}; // handle -> title
    
    if (productIdsToFetch.size > 0) {
      try {
        const productIdsArray = Array.from(productIdsToFetch);
        // Fetch in batches of 10 (Shopify limit)
        for (let i = 0; i < productIdsArray.length; i += 10) {
          const batch = productIdsArray.slice(i, i + 10);
          const productQuery = `#graphql
            query getProducts($ids: [ID!]!) {
              nodes(ids: $ids) {
                ... on Product {
                  id
                  title
                  handle
                }
              }
            }
          `;
          
          const gids = batch.map(id => `gid://shopify/Product/${id}`);
          const response = await admin.graphql(productQuery, {
            variables: { ids: gids }
          });
          
          if (response.ok) {
            const data = await response.json() as any;
            if (data.data?.nodes) {
              data.data.nodes.forEach((node: any) => {
                if (node && node.id && node.title) {
                  // Store by GID format
                  productNamesMap[node.id] = node.title;
                  // Store by numeric ID
                  const numericId = node.id.replace('gid://shopify/Product/', '');
                  productNamesMap[numericId] = node.title;
                  // Store by handle if available
                  if (node.handle) {
                    productHandlesMap[node.handle] = node.title;
                  }
                }
              });
              
              // Debug: Log what we fetched (always log for debugging)
              console.log("[History] Fetched product names:", {
                batchSize: batch.length,
                fetchedCount: data.data.nodes.length,
                productNamesMapSize: Object.keys(productNamesMap).length,
                fetchedTitles: data.data.nodes.map((n: any) => ({ id: n.id, title: n.title }))
              });
            }
          } else {
            const errorText = await response.text();
            if (process.env.NODE_ENV !== "production") {
              console.error("[History] GraphQL error:", errorText);
            }
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[History] Error fetching product names:", error);
        }
      }
    }
    
    // Also fetch products by handle if we have handles
    // Try fetching products one by one by handle (more reliable than query with OR)
    if (productHandlesToFetch.size > 0) {
      try {
        const handlesArray = Array.from(productHandlesToFetch);
        console.log("[History] Fetching products by handle:", handlesArray);
        
        // Fetch products one by one using handle (more reliable)
        for (const handle of handlesArray) {
          try {
            const handleQuery = `#graphql
              query getProductByHandle($handle: String!) {
                product(handle: $handle) {
                  id
                  title
                  handle
                }
              }
            `;
            
            console.log("[History] Fetching product by handle:", handle);
            const response = await admin.graphql(handleQuery, {
              variables: { handle }
            });
            
            if (response.ok) {
              const data = await response.json() as any;
              console.log("[History] Handle query response for", handle, ":", JSON.stringify(data, null, 2));
              
              if (data.data?.product) {
                const product = data.data.product;
                if (product.title && product.handle) {
                  productHandlesMap[product.handle] = product.title;
                  // Also store by ID
                  productNamesMap[product.id] = product.title;
                  const numericId = product.id.replace('gid://shopify/Product/', '');
                  productNamesMap[numericId] = product.title;
                  console.log("[History] ✅ Mapped handle to title:", product.handle, "->", product.title);
                }
              } else {
                console.log("[History] ⚠️ No product found for handle:", handle);
              }
            } else {
              const errorText = await response.text();
              console.error("[History] Handle query failed for", handle, ":", errorText);
            }
          } catch (error) {
            console.error("[History] Error fetching product by handle", handle, ":", error);
          }
        }
      } catch (error) {
        console.error("[History] Error in handle fetching loop:", error);
      }
    }
    
    // Debug: Log the maps before enrichment
    console.log("[History] Before enrichment:", {
      productNamesMapSize: Object.keys(productNamesMap).length,
      productHandlesMapSize: Object.keys(productHandlesMap).length,
      productNamesMapKeys: Object.keys(productNamesMap).slice(0, 5),
      productHandlesMapKeys: Object.keys(productHandlesMap).slice(0, 5)
    });
    
    // Enrich logs with product titles
    const enrichedLogs = logs.map((log: any) => {
      let title: string | undefined;
      
      // Priority 1: Use existing product_title from log (if already fetched and stored and not a fallback)
      if (log.product_title && 
          log.product_title !== `Product #${log.product_id}` && 
          !log.product_title.startsWith('Product #') &&
          !log.product_title.startsWith('Product: ')) {
        title = log.product_title;
      }
      // Priority 2: Use product_handle to match (most reliable)
      else if (log.product_handle && productHandlesMap[log.product_handle]) {
        title = productHandlesMap[log.product_handle];
      }
      // Priority 3: Try product_id (GID or numeric) in fetched map
      else if (log.product_id) {
        // Try multiple formats
        const gidMatch = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
        const numericId = gidMatch ? gidMatch[1] : log.product_id;
        
        // Try GID format first
        if (log.product_id.startsWith('gid://')) {
          title = productNamesMap[log.product_id];
        }
        // Try numeric ID
        if (!title && numericId) {
          title = productNamesMap[numericId];
        }
        // Try with GID prefix if numeric ID didn't work
        if (!title && numericId) {
          title = productNamesMap[`gid://shopify/Product/${numericId}`];
        }
      }
      
      // Debug: Log enrichment for first log
      if (logs.indexOf(log) === 0) {
        console.log("[History] Enriching first log:", {
          logProductId: log.product_id,
          logProductHandle: log.product_handle,
          logProductTitle: log.product_title,
          foundTitle: title,
          checkedInMaps: {
            byGID: log.product_id ? productNamesMap[log.product_id] : undefined,
            byNumeric: log.product_id ? productNamesMap[log.product_id?.match(/^gid:\/\/shopify\/Product\/(\d+)$/)?.[1] || log.product_id] : undefined,
            byHandle: log.product_handle ? productHandlesMap[log.product_handle] : undefined
          }
        });
      }
      
      // Always set product_title - use title if found, otherwise use handle or formatted ID
      if (title) {
        return { ...log, product_title: title };
      } else {
        // Fallback: use handle if available, otherwise format ID nicely
        const numericId = log.product_id ? 
          (log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/)?.[1] || log.product_id.replace('gid://shopify/Product/', '')) : 
          'Unknown';
        const displayText = log.product_handle || numericId;
        return { ...log, product_title: log.product_handle ? `Product: ${displayText}` : `Product #${displayText}` };
      }
    });

    return json({
      logs: Array.isArray(enrichedLogs) ? enrichedLogs : [],
      shop,
    });
  } catch (error) {
    // Log only in development
    if (process.env.NODE_ENV !== "production") {
      console.error("History loader error:", error);
    }
    return json({
      logs: [],
      shop,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export default function History() {
  const { logs, error } = useLoaderData<typeof loader>();

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString("en-US", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return dateString;
    }
  };

  const formatLatency = (ms: number | null) => {
    if (!ms) return "-";
    // Always display in seconds
    return `${(ms / 1000).toFixed(1)} sec`;
  };

  const totalLogs = logs.length;
  const successfulLogs = logs.filter((log: any) => log.success).length;
  const successRate = totalLogs > 0 ? ((successfulLogs / totalLogs) * 100).toFixed(1) : "0.0";
  const avgLatency = totalLogs > 0
    ? (logs.reduce((sum: number, log: any) => sum + (log.latency_ms || 0), 0) / totalLogs / 1000).toFixed(1)
    : "0.0";

  const stats = [
    { label: "Total Attempts", value: totalLogs.toLocaleString("en-US"), icon: "" },
    { label: "Success Rate", value: `${successRate}%`, icon: "" },
    { label: "Average Latency", value: `${avgLatency} sec`, icon: "" },
  ];

  const rows = logs.map((log: any) => {
    // Ensure we never display raw GID - always use product_title or format nicely
    let productDisplay = log.product_title || "-";
    if (!log.product_title && log.product_id) {
      // Format ID nicely if no title
      const numericId = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/)?.[1] || log.product_id;
      productDisplay = log.product_handle ? `Product: ${log.product_handle}` : `Product #${numericId}`;
    }
    
    return [
      formatDate(log.created_at),
      productDisplay,
      log.customer_id || log.customer_ip || "-",
    <Badge key={`badge-${log.id}`} tone={log.success ? "success" : "critical"}>
      {log.success ? "Success" : "Error"}
    </Badge>,
    <Text key={`latency-${log.id}`} tone={log.latency_ms && log.latency_ms > 3000 ? "critical" : "subdued"}>
      {formatLatency(log.latency_ms)}
    </Text>,
      log.error_message || "-",
    ];
  });

  return (
    <Page>
      <TitleBar title="History - VTON Magic" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {error && (
              <Banner tone="critical" title="Error" onDismiss={() => {
                // Error from loader, reload to clear
                window.location.href = window.location.pathname;
              }}>
                Error loading history: {error}
              </Banner>
            )}

            <Layout>
              {stats.map((stat) => (
                <Layout.Section variant="oneThird" key={stat.label}>
                  <div className="vton-stat-card">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="start">
                        <BlockStack gap="100">
                          <Text variant="heading2xl" as="p" fontWeight="bold">
                            {stat.value}
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            {stat.label}
                          </Text>
                        </BlockStack>
                        <Text variant="headingLg" as="span">
                          {stat.icon}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </div>
                </Layout.Section>
              ))}
            </Layout>

            <Divider />

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg" fontWeight="semibold">
                      Try-On History
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      View the complete history of all virtual try-on attempts made on your store.
                    </Text>
                  </BlockStack>
                </InlineStack>

                <Divider />

                {logs.length === 0 ? (
                  <EmptyState
                    heading="No History"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      No try-on sessions have been recorded yet.
                    </p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "text",
                      "text",
                      "text",
                      "text",
                      "text",
                    ]}
                    headings={[
                      "Date",
                      "Product",
                      "Customer",
                      "Status",
                      "Latency",
                      "Error",
                    ]}
                    rows={rows}
                  />
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
