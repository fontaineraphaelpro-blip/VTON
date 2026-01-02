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
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, getTryonLogs, getTopProducts } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";
import { AppHeader } from "../components/AppHeader";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureTables();

    const shopData = await getShop(shop);
    const recentLogs = await getTryonLogs(shop, {}).catch(() => []);
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

  return (
    <Page>
      <TitleBar title="Accueil - VTON Magic" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            <AppHeader />

            <Banner tone="info">
              <Text variant="bodyMd" as="p">
                <strong>Stop losing money on returns.</strong> Letting customers test products
                virtually removes doubt. This slashes refunds and boosts conversion by{" "}
                <strong>2.5x instantly</strong>.
              </Text>
            </Banner>

            {error && (
              <Banner tone="critical" title="Erreur">
                {error}
              </Banner>
            )}

            {/* Crédits et Statistiques */}
            <Layout>
              <Layout.Section variant="oneThird">
                <div className="vton-credits-card">
                  <div className="vton-credits-label">REMAINING CREDITS</div>
                  <div className="vton-credits-amount">
                    {credits.toLocaleString("fr-FR")}
                  </div>
                  <div className="vton-credits-footer">
                    <span>∞</span>
                    <span>Credits never expire</span>
                  </div>
                </div>
              </Layout.Section>

              <Layout.Section variant="twoThirds">
                <Card>
                  <BlockStack gap="500">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text variant="headingLg" fontWeight="bold" as="h2">
                          Quick Stats
                        </Text>
                      </BlockStack>
                      <Button url="/app/credits" variant="primary" size="large">
                        Buy Credits →
                      </Button>
                    </InlineStack>

                    <Layout>
                      <Layout.Section variant="oneThird">
                        <div className="vton-stat-card">
                          <BlockStack gap="200">
                            <div className="vton-stat-value">{totalTryons.toLocaleString("fr-FR")}</div>
                            <div className="vton-stat-label">Total Try-ons</div>
                          </BlockStack>
                        </div>
                      </Layout.Section>
                      <Layout.Section variant="oneThird">
                        <div className="vton-stat-card">
                          <BlockStack gap="200">
                            <div className="vton-stat-value">{totalAtc.toLocaleString("fr-FR")}</div>
                            <div className="vton-stat-label">Add to Cart</div>
                          </BlockStack>
                        </div>
                      </Layout.Section>
                      <Layout.Section variant="oneThird">
                        <div className="vton-stat-card">
                          <BlockStack gap="200">
                            <div className="vton-stat-value">{conversionRate}%</div>
                            <div className="vton-stat-label">Conversion Rate</div>
                          </BlockStack>
                        </div>
                      </Layout.Section>
                    </Layout>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>

            {/* Quick Actions */}
            <Card>
              <BlockStack gap="500">
                <Text variant="headingLg" fontWeight="bold" as="h2">
                  Quick Actions
                </Text>
                <Layout>
                  <Layout.Section variant="oneThird">
                    <Link to="/app/credits" style={{ textDecoration: "none", display: "block" }}>
                      <div className="vton-action-card">
                        <BlockStack gap="400">
                          <BlockStack gap="200">
                            <Text variant="headingLg" fontWeight="bold" as="h3" style={{ fontSize: "1.75rem" }}>
                              💎 Buy Credits
                            </Text>
                            <Text variant="bodyMd" tone="subdued" as="p">
                              Choose a pack and boost your sales with more try-ons
                            </Text>
                          </BlockStack>
                          <Box paddingBlockStart="200">
                            <Text variant="bodySm" fontWeight="semibold" tone="brand" as="span">
                              View Packs →
                            </Text>
                          </Box>
                        </BlockStack>
                      </div>
                    </Link>
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <Link to="/app/history" style={{ textDecoration: "none", display: "block" }}>
                      <div className="vton-action-card">
                        <BlockStack gap="400">
                          <BlockStack gap="200">
                            <Text variant="headingLg" fontWeight="bold" as="h3" style={{ fontSize: "1.75rem" }}>
                              📊 View History
                            </Text>
                            <Text variant="bodyMd" tone="subdued" as="p">
                              Check all try-on sessions and performance metrics
                            </Text>
                          </BlockStack>
                          <Box paddingBlockStart="200">
                            <Text variant="bodySm" fontWeight="semibold" tone="brand" as="span">
                              See All →
                            </Text>
                          </Box>
                        </BlockStack>
                      </div>
                    </Link>
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <Link to="/app/widget" style={{ textDecoration: "none", display: "block" }}>
                      <div className="vton-action-card">
                        <BlockStack gap="400">
                          <BlockStack gap="200">
                            <Text variant="headingLg" fontWeight="bold" as="h3" style={{ fontSize: "1.75rem" }}>
                              ⚙️ Dashboard
                            </Text>
                            <Text variant="bodyMd" tone="subdued" as="p">
                              Configure widget settings and manage your app
                            </Text>
                          </BlockStack>
                          <Box paddingBlockStart="200">
                            <Text variant="bodySm" fontWeight="semibold" tone="brand" as="span">
                              Configure →
                            </Text>
                          </Box>
                        </BlockStack>
                      </div>
                    </Link>
                  </Layout.Section>
                </Layout>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
