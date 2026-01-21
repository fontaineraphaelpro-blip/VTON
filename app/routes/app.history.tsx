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
            }
          } else {
            const errorText = await response.text();
            console.error("[History] GraphQL error:", errorText);
          }
        }
      } catch (error) {
        console.error("[History] Error fetching product names:", error);
      }
    }
    
    // Also fetch products by handle if we have handles
    if (productHandlesToFetch.size > 0) {
      try {
        const handlesArray = Array.from(productHandlesToFetch);
        // Fetch in batches (Shopify Admin API limit is 250, but let's use 10 for safety)
        for (let i = 0; i < handlesArray.length; i += 10) {
          const batch = handlesArray.slice(i, i + 10);
          const handleQuery = `#graphql
            query getProductsByHandle($handles: [String!]!) {
              products(first: 10, query: $handles) {
                edges {
                  node {
                    id
                    title
                    handle
                  }
                }
              }
            }
          `;
          
          // Build query string for handles
          const handleQueryString = batch.map(h => `handle:${h}`).join(" OR ");
          
          const response = await admin.graphql(handleQuery, {
            variables: { handles: handleQueryString }
          });
          
          if (response.ok) {
            const data = await response.json() as any;
            if (data.data?.products?.edges) {
              data.data.products.edges.forEach((edge: any) => {
                const node = edge.node;
                if (node && node.title && node.handle) {
                  productHandlesMap[node.handle] = node.title;
                  // Also store by ID
                  productNamesMap[node.id] = node.title;
                  const numericId = node.id.replace('gid://shopify/Product/', '');
                  productNamesMap[numericId] = node.title;
                }
              });
            }
          }
        }
      } catch (error) {
        // Handle query not supported, try alternative approach
        console.warn("[History] Could not fetch products by handle:", error);
      }
    }
    
    // Enrich logs with product titles
    const enrichedLogs = logs.map((log: any) => {
      let title: string | undefined;
      
      // Priority 1: Use product_handle to match (most reliable)
      if (log.product_handle && productHandlesMap[log.product_handle]) {
        title = productHandlesMap[log.product_handle];
      }
      // Priority 2: Try product_id (GID or numeric) in fetched map
      else if (log.product_id) {
        const gidMatch = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
        const numericId = gidMatch ? gidMatch[1] : log.product_id;
        title = productNamesMap[log.product_id] || productNamesMap[numericId];
      }
      
      // Priority 3: Use existing product_title from log
      if (!title && log.product_title) {
        title = log.product_title;
      }
      
      // Always set product_title - use title if found, otherwise use handle or formatted ID
      if (title) {
        return { ...log, product_title: title };
      } else {
        // Fallback: use handle if available, otherwise format ID nicely
        const displayText = log.product_handle || 
          (log.product_id ? (log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/)?.[1] || log.product_id.replace('gid://shopify/Product/', '')) : 'Unknown');
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
