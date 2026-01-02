import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
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
  TextField,
  Divider,
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

    // Load data in parallel for better performance
    // Limit logs to 10 to avoid loading too much data
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
  const conversionRate = totalTryons > 0 ? ((totalAtc / totalTryons) * 100).toFixed(1) : "0.0";

  const handleSave = (formData: FormData) => {
    fetcher.submit(formData, { method: "post" });
  };

  // Recharger les données après une sauvegarde réussie
  useEffect(() => {
    if (fetcher.data?.success) {
      setTimeout(() => {
        revalidator.revalidate();
      }, 500);
    }
  }, [fetcher.data?.success, revalidator]);

  const stats = [
    { label: "Available Credits", value: credits.toLocaleString("en-US"), icon: "💎" },
    { label: "Total try-ons", value: totalTryons.toLocaleString("en-US"), icon: "✨" },
    { label: "Add to Cart", value: totalAtc.toLocaleString("en-US"), icon: "🛒" },
    { label: "Conversion Rate", value: `${conversionRate}%`, icon: "📈" },
  ];

  return (
    <Page>
      <TitleBar title="Dashboard - VTON Magic" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {error && (
              <Banner tone="critical" title="Error">
                Error loading data: {error}
              </Banner>
            )}

            {fetcher.data?.success && (
              <Banner tone="success">
                Configuration saved successfully
              </Banner>
            )}

            {/* Statistics */}
            <Layout>
              {stats.map((stat) => (
                <Layout.Section variant="oneQuarter" key={stat.label}>
                  <div className="vton-stat-card">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="start">
                        <BlockStack gap="100">
                          <div className="vton-stat-value">{stat.value}</div>
                          <div className="vton-stat-label">{stat.label}</div>
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

            {/* Low Credits Alert */}
            {credits < 50 && (
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
            )}

            <Divider />

            {/* Widget Configuration */}
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingLg" fontWeight="semibold">
                    Widget Configuration
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p">
                    Customize the appearance of the Try-On widget on your store
                  </Text>
                </BlockStack>

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
                        Save
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </form>
              </BlockStack>
            </Card>

            {/* Popular Products */}
            {topProducts.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg" fontWeight="semibold">
                      Most Tried Products
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Your products with the most try-ons
                    </Text>
                  </BlockStack>
                  <BlockStack gap="200">
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
                </BlockStack>
              </Card>
            )}

            {/* Recent Activity */}
            {recentLogs.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingLg" fontWeight="semibold">
                        Recent Activity
                      </Text>
                      <Text variant="bodyMd" tone="subdued" as="p">
                        Latest try-on attempts
                      </Text>
                    </BlockStack>
                    <Button url="/app/history" variant="plain">
                      View All →
                    </Button>
                  </InlineStack>
                  <BlockStack gap="200">
                    {recentLogs.slice(0, 5).map((log: any, index: number) => (
                      <InlineStack key={log.id || index} align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="medium" as="p">
                            {log.product_title || log.product_id || "Unknown Product"}
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            {new Date(log.created_at).toLocaleString("en-US")}
                          </Text>
                        </BlockStack>
                        <Text
                          variant="bodySm"
                          fontWeight="semibold"
                          tone={log.success ? "success" : "critical"}
                          as="span"
                        >
                          {log.success ? "✓ Success" : "✗ Failed"}
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
