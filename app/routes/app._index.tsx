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
      label: "Crédits disponibles", 
      value: credits.toLocaleString("fr-FR"), 
      icon: "💎",
      link: "/app/credits"
    },
    { 
      label: "Total try-ons", 
      value: totalTryons.toLocaleString("fr-FR"), 
      icon: "✨",
      link: "/app/history"
    },
    { 
      label: "Add to Cart", 
      value: totalAtc.toLocaleString("fr-FR"), 
      icon: "🛒",
      link: "/app/history"
    },
    { 
      label: "Taux de conversion", 
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
      <TitleBar title="Accueil - VTON Magic" />
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
            <Banner tone="critical" title="Erreur">
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
                Actions rapides
              </Text>
              <div className="vton-actions-grid">
                <Link to="/app/credits" className="vton-action-card-white">
                  <div className="vton-action-content">
                    <Text variant="headingMd" fontWeight="bold" as="h3">
                      💎 Acheter des crédits
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Choisissez un pack et boostez vos ventes avec plus de try-ons
                    </Text>
                  </div>
                </Link>
                <Link to="/app/history" className="vton-action-card-white">
                  <div className="vton-action-content">
                    <Text variant="headingMd" fontWeight="bold" as="h3">
                      📊 Voir l'historique
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Consultez toutes les sessions de try-on et les métriques de performance
                    </Text>
                  </div>
                </Link>
                <Link to="/app/widget" className="vton-action-card-white">
                  <div className="vton-action-content">
                    <Text variant="headingMd" fontWeight="bold" as="h3">
                      ⚙️ Configurer le widget
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Personnalisez les paramètres du widget et gérez votre application
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
                      <div className="vton-metric-label">Taux de succès</div>
                    </div>
                    <div className="vton-metric-item">
                      <div className="vton-metric-value">{recentLogs.length}</div>
                      <div className="vton-metric-label">Essais récents</div>
                    </div>
                  </div>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneHalf">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingLg" fontWeight="bold" as="h2">
                    Produits populaires
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
                      <Box paddingBlockStart="200">
                        <Button url="/app/products" variant="plain">
                          Voir tous les produits →
                        </Button>
                      </Box>
                    </BlockStack>
                  ) : (
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Aucun produit encore essayé
                    </Text>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>

          {/* Crédits Alert */}
          {credits < 50 && (
            <Card>
              <BlockStack gap="300">
                <Banner
                  title="Crédits faibles"
                  tone="warning"
                  action={{
                    content: "Acheter des crédits",
                    url: "/app/credits",
                  }}
                >
                  Vous avez {credits} crédit{credits > 1 ? "s" : ""} restant{credits > 1 ? "s" : ""}. 
                  Rechargez pour continuer à offrir l'essayage virtuel à vos clients.
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
                    Activité récente
                  </Text>
                  <Button url="/app/history" variant="plain">
                    Voir tout →
                  </Button>
                </InlineStack>
                <Divider />
                <BlockStack gap="200">
                  {recentLogs.map((log: any, index: number) => (
                    <Box
                      key={log.id || index}
                      padding="300"
                      borderBlockStartWidth={index > 0 ? "025" : "0"}
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="medium" as="p">
                            {log.product_title || log.product_id || "Unknown Product"}
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            {new Date(log.created_at).toLocaleString("fr-FR")}
                          </Text>
                        </BlockStack>
                        <Box
                          padding="150"
                          background={log.success ? "bg-surface-success-subdued" : "bg-surface-critical-subdued"}
                          borderRadius="200"
                        >
                          <Text
                            variant="bodySm"
                            fontWeight="semibold"
                            tone={log.success ? "success" : "critical"}
                            as="span"
                          >
                            {log.success ? "✓ Succès" : "✗ Échec"}
                          </Text>
                        </Box>
                      </InlineStack>
                    </Box>
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
