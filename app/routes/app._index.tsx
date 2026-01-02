import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, getTryonLogs, getTopProducts } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureTables();

    const shopData = await getShop(shop);
    const recentLogs = await getTryonLogs(shop, { limit: 10, offset: 0 }).catch(() => []);
    const topProducts = await getTopProducts(shop, 5).catch(() => []);

    return json({
      shop: shopData || null,
      recentLogs: Array.isArray(recentLogs) ? recentLogs.slice(0, 5) : [],
      topProducts: Array.isArray(topProducts) ? topProducts : [],
    });
  } catch (error) {
    console.error("Home loader error:", error);
    return json({
      shop: null,
      recentLogs: [],
      topProducts: [],
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export default function Home() {
  const { shop, recentLogs, topProducts, error } = useLoaderData<typeof loader>();

  const credits = shop?.credits || 0;
  const totalTryons = shop?.total_tryons || 0;
  const totalAtc = shop?.total_atc || 0;
  const conversionRate = totalTryons > 0
    ? ((totalAtc / totalTryons) * 100).toFixed(1)
    : "0.0";

  const stats = [
    { 
      label: "Available Credits", 
      value: credits.toLocaleString("en-US"), 
      icon: "💎",
      link: "/app/credits"
    },
    { 
      label: "Total try-ons", 
      value: totalTryons.toLocaleString("en-US"), 
      icon: "✨",
      link: "/app/history"
    },
    { 
      label: "Add to Cart", 
      value: totalAtc.toLocaleString("en-US"), 
      icon: "🛒",
      link: "/app/history"
    },
    { 
      label: "Conversion Rate", 
      value: `${conversionRate}%`, 
      icon: "📈",
      link: "/app/dashboard"
    },
  ];

  const successfulLogs = recentLogs.filter((log: any) => log.success).length;
  const successRate = recentLogs.length > 0 
    ? ((successfulLogs / recentLogs.length) * 100).toFixed(0)
    : "0";

  return (
    <Page>
      <TitleBar title="Home - VTON Magic" />
      <div className="vton-page-container">
        {/* Header Simple */}
        <header className="vton-header-simple">
          <div className="vton-header-logo">
            <div className="vton-logo-icon-blue">⚡</div>
            <span className="vton-header-title">VTON Magic Admin</span>
          </div>
          <div className="vton-status-badge">
            <div className="vton-status-dot-green"></div>
            System Active
          </div>
        </header>

        <div className="vton-page-content">
          {error && (
            <Banner tone="critical" title="Error">
              {error}
            </Banner>
          )}

          {/* Stats Grid */}
          <div className="vton-stats-grid">
            {stats.map((stat) => (
              <Link to={stat.link} key={stat.label} className="vton-stat-card-link">
                <div className="vton-stat-card-white">
                  <div className="vton-stat-content">
                    <div className="vton-stat-value-white">{stat.value}</div>
                    <div className="vton-stat-label-white">{stat.label}</div>
                  </div>
                  <div className="vton-stat-icon">{stat.icon}</div>
                </div>
              </Link>
            ))}
          </div>

          {/* Quick Actions */}
          <Card>
            <BlockStack gap="500">
              <Text variant="headingLg" fontWeight="bold" as="h2">
                Quick Actions
              </Text>
              <div className="vton-actions-grid">
                <Link to="/app/credits" className="vton-action-card-white">
                  <div className="vton-action-content">
                    <Text variant="headingMd" fontWeight="bold" as="h3">
                      💎 Buy Credits
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Choose a pack and boost your sales with more try-ons
                    </Text>
                  </div>
                </Link>
                <Link to="/app/history" className="vton-action-card-white">
                  <div className="vton-action-content">
                    <Text variant="headingMd" fontWeight="bold" as="h3">
                      📊 View History
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      View all try-on sessions and performance metrics
                    </Text>
                  </div>
                </Link>
                <Link to="/app/widget" className="vton-action-card-white">
                  <div className="vton-action-content">
                    <Text variant="headingMd" fontWeight="bold" as="h3">
                      ⚙️ Configure Widget
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Customize widget settings and manage your application
                    </Text>
                  </div>
                </Link>
              </div>
            </BlockStack>
          </Card>

          {/* Performance Metrics */}
          <Layout>
            <Layout.Section variant="oneHalf">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingLg" fontWeight="bold" as="h2">
                    Performance
                  </Text>
                  <Divider />
                  <div className="vton-metrics-grid">
                    <div className="vton-metric-item">
                      <div className="vton-metric-value">{successRate}%</div>
                      <div className="vton-metric-label">Success Rate</div>
                    </div>
                    <div className="vton-metric-item">
                      <div className="vton-metric-value">{recentLogs.length}</div>
                      <div className="vton-metric-label">Recent Trials</div>
                    </div>
                  </div>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneHalf">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingLg" fontWeight="bold" as="h2">
                    Popular Products
                  </Text>
                  <Divider />
                  {topProducts.length > 0 ? (
                    <BlockStack gap="300">
                      {topProducts.slice(0, 3).map((product: any, index: number) => (
                        <InlineStack key={product.product_id || index} align="space-between" blockAlign="center">
                          <Text variant="bodyMd" as="span">
                            {product.product_title || product.product_id}
                          </Text>
                          <Text variant="bodyMd" fontWeight="semibold" as="span">
                            {product.count} try-on{product.count > 1 ? "s" : ""}
                          </Text>
                        </InlineStack>
                      ))}
                      <div style={{ paddingTop: "0.5rem" }}>
                        <Button url="/app/products" variant="plain">
                          View All Products →
                        </Button>
                      </div>
                    </BlockStack>
                  ) : (
                    <Text variant="bodyMd" tone="subdued" as="p">
                      No products tried yet
                    </Text>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>

          {/* Credits Alert */}
          {credits < 50 && (
            <Card>
              <BlockStack gap="300">
                <Banner
                  title="Low Credits"
                  tone="warning"
                  action={{
                    content: "Buy Credits",
                    url: "/app/credits",
                  }}
                >
                  You have {credits} credit{credits > 1 ? "s" : ""} remaining. 
                  Recharge to continue offering virtual try-on to your customers.
                </Banner>
              </BlockStack>
            </Card>
          )}

          {/* Recent Activity */}
          {recentLogs.length > 0 && (
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingLg" fontWeight="bold" as="h2">
                    Recent Activity
                  </Text>
                  <Button url="/app/history" variant="plain">
                    View All →
                  </Button>
                </InlineStack>
                <Divider />
                <BlockStack gap="200">
                  {recentLogs.map((log: any, index: number) => (
                    <div
                      key={log.id || index}
                      style={{
                        padding: index > 0 ? "1rem 0" : "0 0 1rem 0",
                        borderTop: index > 0 ? "1px solid #E2E8F0" : "none",
                      }}
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="medium" as="p">
                            {log.product_title || log.product_id || "Unknown Product"}
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            {new Date(log.created_at).toLocaleString("en-US")}
                          </Text>
                        </BlockStack>
                        <div
                          style={{
                            padding: "0.375rem 0.75rem",
                            backgroundColor: log.success ? "#D1FAE5" : "#FEE2E2",
                            borderRadius: "0.5rem",
                          }}
                        >
                          <Text
                            variant="bodySm"
                            fontWeight="semibold"
                            tone={log.success ? "success" : "critical"}
                            as="span"
                          >
                            {log.success ? "✓ Success" : "✗ Failed"}
                          </Text>
                        </div>
                      </InlineStack>
                    </div>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}
