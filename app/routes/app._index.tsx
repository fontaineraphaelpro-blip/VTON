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
      <TitleBar title="Dashboard - VTON Magic" />
      <div className="vton-page-container">
        {/* Header */}
        <header className="vton-header-simple">
          <div className="vton-header-logo">
            <div className="vton-logo-icon-blue">⚡</div>
            <span className="vton-header-title">VTON Magic</span>
          </div>
          <div className="vton-status-badge">
            <div className="vton-status-dot-green"></div>
            Active
          </div>
        </header>

        <div className="vton-page-content">
          {error && (
            <Banner tone="critical" title="Error">
              {error}
            </Banner>
          )}

          {/* Main Stats - Horizontal Layout */}
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

          {/* Main Content - Horizontal Layout */}
          <div className="vton-main-layout">
            {/* Left Column */}
            <div className="vton-main-left">
              {/* Low Credits Alert */}
              {credits < 50 && (
                <div className="vton-alert-urgent">
                  <div className="vton-alert-icon">⚠️</div>
                  <div className="vton-alert-content">
                    <div className="vton-alert-title">Low Credits</div>
                    <div className="vton-alert-message">
                      You have {credits} credit{credits > 1 ? "s" : ""} remaining. Recharge now.
                    </div>
                  </div>
                  <Link to="/app/credits" className="vton-alert-button">
                    Buy Credits →
                  </Link>
                </div>
              )}

              {/* Quick Actions */}
              <div className="vton-actions-simple">
                <Link to="/app/credits" className="vton-action-primary">
                  <span className="vton-action-icon">💎</span>
                  <div className="vton-action-text">
                    <div className="vton-action-title">Buy Credits</div>
                    <div className="vton-action-subtitle">Get more try-ons</div>
                  </div>
                  <span className="vton-action-arrow">→</span>
                </Link>
                <Link to="/app/widget" className="vton-action-secondary">
                  <span className="vton-action-icon">⚙️</span>
                  <div className="vton-action-text">
                    <div className="vton-action-title">Configure Widget</div>
                    <div className="vton-action-subtitle">Customize button</div>
                  </div>
                  <span className="vton-action-arrow">→</span>
                </Link>
                <Link to="/app/history" className="vton-action-secondary">
                  <span className="vton-action-icon">📊</span>
                  <div className="vton-action-text">
                    <div className="vton-action-title">View History</div>
                    <div className="vton-action-subtitle">See all sessions</div>
                  </div>
                  <span className="vton-action-arrow">→</span>
                </Link>
              </div>
            </div>

            {/* Right Column */}
            <div className="vton-main-right">
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
                    <BlockStack gap="300">
                      {recentLogs.slice(0, 5).map((log: any, index: number) => (
                        <div key={log.id || index} className="vton-activity-item">
                          <div className="vton-activity-content">
                            <Text variant="bodyMd" fontWeight="medium" as="p">
                              {log.product_title || log.product_id || "Unknown Product"}
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                              {new Date(log.created_at).toLocaleDateString("en-US", { 
                                month: "short", 
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </Text>
                          </div>
                          <div className={`vton-activity-status ${log.success ? "vton-activity-success" : "vton-activity-failed"}`}>
                            {log.success ? "✓" : "✗"}
                          </div>
                        </div>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
