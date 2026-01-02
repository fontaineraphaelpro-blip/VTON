import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator, Link } from "@remix-run/react";
import { useEffect } from "react";
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
  TextField,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop, getTryonLogs, getTopProducts } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureTables();

    const [shopData, recentLogs, topProducts] = await Promise.all([
      getShop(shop),
      getTryonLogs(shop, { limit: 10, offset: 0 }).catch(() => []),
      getTopProducts(shop, 5).catch(() => []),
    ]);

    return json({
      shop: shopData || null,
      recentLogs: Array.isArray(recentLogs) ? recentLogs.slice(0, 5) : [],
      topProducts: Array.isArray(topProducts) ? topProducts : [],
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
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const widgetText = formData.get("widgetText") as string;
  const widgetBg = formData.get("widgetBg") as string;
  const widgetColor = formData.get("widgetColor") as string;
  const maxTriesPerUser = parseInt(formData.get("maxTriesPerUser") as string);

  await upsertShop(shop, {
    widgetText,
    widgetBg,
    widgetColor,
    maxTriesPerUser,
  });

  return json({ success: true });
};

export default function Dashboard() {
  const { shop, recentLogs, topProducts, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();

  const credits = shop?.credits || 0;
  const totalTryons = shop?.total_tryons || 0;
  const totalAtc = shop?.total_atc || 0;
  const conversionRate = totalTryons > 0
    ? ((totalAtc / totalTryons) * 100).toFixed(1)
    : "0.0";

  const handleSave = (formData: FormData) => {
    fetcher.submit(formData, { method: "post" });
  };

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
      link: "/app/history"
    },
  ];

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

          {/* Success Message */}
          {fetcher.data?.success && (
            <Banner tone="success">
              Configuration saved successfully
            </Banner>
          )}

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

          {/* Main Content - Horizontal Layout */}
          <div className="vton-main-layout">
            {/* Left Column */}
            <div className="vton-main-left">
              {/* Widget Configuration */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg" fontWeight="semibold">
                    Widget Configuration
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p">
                    Customize the appearance of the Try-On widget
                  </Text>
                  <Divider />
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSave(new FormData(e.currentTarget));
                    }}
                  >
                    <BlockStack gap="400">
                      <TextField
                        label="Button Text"
                        name="widgetText"
                        defaultValue={shop?.widget_text || "Try It On Now ✨"}
                        autoComplete="off"
                        helpText="Text displayed on the widget button"
                      />
                      <InlineStack gap="400" align="start">
                        <Box minWidth="200px">
                          <TextField
                            label="Background Color"
                            name="widgetBg"
                            defaultValue={shop?.widget_bg || "#000000"}
                            autoComplete="off"
                            type="color"
                          />
                        </Box>
                        <Box minWidth="200px">
                          <TextField
                            label="Text Color"
                            name="widgetColor"
                            defaultValue={shop?.widget_color || "#ffffff"}
                            autoComplete="off"
                            type="color"
                          />
                        </Box>
                      </InlineStack>
                      <TextField
                        label="Max try-ons per user/day"
                        name="maxTriesPerUser"
                        type="number"
                        defaultValue={String(shop?.max_tries_per_user || 5)}
                        autoComplete="off"
                        helpText="Daily limit per user to prevent abuse"
                      />
                      <InlineStack align="end">
                        <Button submit variant="primary" loading={fetcher.state === "submitting"}>
                          Save Configuration
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </form>
                </BlockStack>
              </Card>

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
              {/* Popular Products */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg" fontWeight="semibold">
                    Most Tried Products
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p">
                    Your products with the most try-ons
                  </Text>
                  <Divider />
                  {topProducts.length > 0 ? (
                    <BlockStack gap="300">
                      {topProducts.map((product: any, index: number) => (
                        <InlineStack key={product.product_id || index} align="space-between" blockAlign="center">
                          <Text variant="bodyMd" as="span">
                            {product.product_title || product.product_id}
                          </Text>
                          <Text variant="bodyMd" fontWeight="semibold" as="span">
                            {product.count} try-on{product.count > 1 ? "s" : ""}
                          </Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  ) : (
                    <div className="vton-empty-state">
                      <Text variant="bodyMd" tone="subdued" as="p">
                        No try-ons yet. Start using the widget on your products!
                      </Text>
                    </div>
                  )}
                </BlockStack>
              </Card>

              {/* Recent Activity */}
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
                  {recentLogs.length > 0 ? (
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
                  ) : (
                    <div className="vton-empty-state">
                      <Text variant="bodyMd" tone="subdued" as="p">
                        No recent activity. Try-ons will appear here once customers start using the widget.
                      </Text>
                    </div>
                  )}
                </BlockStack>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
