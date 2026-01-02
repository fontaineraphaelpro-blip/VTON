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
        </div>
      </div>
    </Page>
  );
}
