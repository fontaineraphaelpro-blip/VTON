import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Text,
  DataTable,
  Badge,
  Banner,
  EmptyState,
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
    const productIdToHandleMap: Record<string, string> = {}; // id or numericId -> handle (for display when we have id but no handle in log)
    
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
                if (node && node.id) {
                  const numericId = node.id.replace('gid://shopify/Product/', '');
                  if (node.title) {
                    // Store by GID format
                    productNamesMap[node.id] = node.title;
                    // Store by numeric ID
                    productNamesMap[numericId] = node.title;
                    // Store by handle if available
                    if (node.handle) {
                      productHandlesMap[node.handle] = node.title;
                    }
                  }
                  // Always store id->handle so we can show handle instead of GID when we have no title
                  if (node.handle) {
                    productIdToHandleMap[node.id] = node.handle;
                    productIdToHandleMap[numericId] = node.handle;
                  }
                }
              });
            }
          }
        }
      } catch {
        // Silently fail
      }
    }
    
    // Also fetch products by handle if we have handles
    // Try fetching products one by one by handle (more reliable than query with OR)
    if (productHandlesToFetch.size > 0) {
      try {
        const handlesArray = Array.from(productHandlesToFetch);
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
            const response = await admin.graphql(handleQuery, { variables: { handle } });
            if (response.ok) {
              const data = await response.json() as any;
              if (data.data?.product) {
                const product = data.data.product;
                const numericId = product.id ? product.id.replace('gid://shopify/Product/', '') : '';
                if (product.title && product.handle) {
                  productHandlesMap[product.handle] = product.title;
                  productNamesMap[product.id] = product.title;
                  if (numericId) productNamesMap[numericId] = product.title;
                }
                if (product.id && product.handle) {
                  productIdToHandleMap[product.id] = product.handle;
                  if (numericId) productIdToHandleMap[numericId] = product.handle;
                }
              }
            }
          } catch {
            // Skip this handle
          }
        }
      } catch {
        // Silently fail
      }
    }

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
      
      // Priority 4: Use handle from log as title if we have a handle but no title found
      if (!title && log.product_handle) {
        title = log.product_handle
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
      
      // Priority 5: Use handle from GraphQL fetch (productIdToHandleMap) when log has product_id but no product_handle
      // This fixes old logs that only have GID: we show the handle instead of "Product #123"
      if (!title && log.product_id) {
        const gidMatch = log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
        const numericId = gidMatch ? gidMatch[1] : log.product_id.replace('gid://shopify/Product/', '');
        const handleFromFetch = productIdToHandleMap[log.product_id] || productIdToHandleMap[numericId];
        if (handleFromFetch) {
          title = handleFromFetch
            .split('-')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        }
      }
      
      // Always set product_title - use title if found, otherwise avoid GID: prefer handle, last resort "Product #id"
      if (title) {
        return { ...log, product_title: title };
      } else {
        const numericId = log.product_id ? 
          (log.product_id.match(/^gid:\/\/shopify\/Product\/(\d+)$/)?.[1] || log.product_id.replace('gid://shopify/Product/', '')) : 
          null;
        const handleFromFetch = numericId ? (productIdToHandleMap[log.product_id!] || productIdToHandleMap[numericId]) : null;
        const displayText = log.product_handle 
          ? log.product_handle.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
          : handleFromFetch 
            ? handleFromFetch.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            : numericId 
              ? `Product #${numericId}` 
              : 'Unknown Product';
        return { ...log, product_title: displayText };
      }
    });

    return json({
      logs: Array.isArray(enrichedLogs) ? enrichedLogs : [],
      shop,
    });
  } catch (error) {
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
      <div className="app-container">
        {error && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="critical" title="Error" onDismiss={() => {
              // Error from loader, reload to clear
              window.location.href = window.location.pathname;
            }}>
              Error loading history: {error}
            </Banner>
          </div>
        )}

        <header className="app-header">
          <h1 className="app-title">History</h1>
          <p className="app-subtitle">
            View the complete history of all virtual try-on attempts made on your store
          </p>
        </header>

        <div className="stats-grid">
          {stats.map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className="stat-icon-wrapper">
                {stat.icon || "📊"}
              </div>
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="dashboard-section">
          <h2>Try-On History</h2>
          {logs.length === 0 ? (
            <div className="dashboard-placeholder">
              <EmptyState
                heading="No History"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  No try-on sessions have been recorded yet.
                </p>
              </EmptyState>
            </div>
          ) : (
            <div className="history-table-wrapper">
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
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
