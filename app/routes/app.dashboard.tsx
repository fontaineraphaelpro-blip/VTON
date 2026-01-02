import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
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
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop, getTryonLogs, getTopProducts } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";
import { AppHeader } from "../components/AppHeader";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureTables();

    // Charge les données en parallèle pour améliorer les performances
    // Limite les logs à 10 pour éviter de charger trop de données
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

  const credits = shop?.credits || 0;
  const totalTryons = shop?.total_tryons || 0;
  const totalAtc = shop?.total_atc || 0;
  const conversionRate = totalTryons > 0 ? ((totalAtc / totalTryons) * 100).toFixed(1) : "0.0";

  const handleSave = (formData: FormData) => {
    fetcher.submit(formData, { method: "post" });
  };

  const stats = [
    { label: "Crédits disponibles", value: credits.toLocaleString("fr-FR"), icon: "💎" },
    { label: "Total try-ons", value: totalTryons.toLocaleString("fr-FR"), icon: "✨" },
    { label: "Ajouts au panier", value: totalAtc.toLocaleString("fr-FR"), icon: "🛒" },
    { label: "Taux de conversion", value: `${conversionRate}%`, icon: "📈" },
  ];

  return (
    <Page>
      <TitleBar title="Dashboard - VTON Magic" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            <AppHeader />

            {error && (
              <Banner tone="critical" title="Erreur">
                Erreur lors du chargement des données: {error}
              </Banner>
            )}

            {fetcher.data?.success && (
              <Banner tone="success">
                Configuration sauvegardée avec succès
              </Banner>
            )}

            {/* Statistiques */}
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

            {/* Alert crédits faibles */}
            {credits < 50 && (
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
            )}

            <Divider />

            {/* Configuration du Widget */}
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingLg" fontWeight="semibold">
                    Configuration du Widget
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p">
                    Personnalisez l'apparence du widget Try-On sur votre boutique
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
                      label="Texte du bouton"
                      name="widgetText"
                      defaultValue={shop?.widget_text || "Try It On Now ✨"}
                      autoComplete="off"
                      helpText="Texte affiché sur le bouton du widget"
                    />
                    <InlineStack gap="400" align="start">
                      <Box minWidth="200px">
                        <TextField
                          label="Couleur de fond"
                          name="widgetBg"
                          defaultValue={shop?.widget_bg || "#000000"}
                          autoComplete="off"
                          type="color"
                        />
                      </Box>
                      <Box minWidth="200px">
                        <TextField
                          label="Couleur du texte"
                          name="widgetColor"
                          defaultValue={shop?.widget_color || "#ffffff"}
                          autoComplete="off"
                          type="color"
                        />
                      </Box>
                    </InlineStack>
                    <TextField
                      label="Nombre max de try-ons par utilisateur/jour"
                      name="maxTriesPerUser"
                      type="number"
                      defaultValue={String(shop?.max_tries_per_user || 5)}
                      autoComplete="off"
                      helpText="Limite quotidienne par utilisateur pour éviter les abus"
                    />
                    <InlineStack align="end">
                      <Button submit variant="primary" loading={fetcher.state === "submitting"}>
                        Enregistrer
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </form>
              </BlockStack>
            </Card>

            {/* Produits populaires */}
            {topProducts.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg" fontWeight="semibold">
                      Produits les plus essayés
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Vos produits avec le plus de try-ons
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

            {/* Activité récente */}
            {recentLogs.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingLg" fontWeight="semibold">
                        Activité récente
                      </Text>
                      <Text variant="bodyMd" tone="subdued" as="p">
                        Dernières tentatives de try-on
                      </Text>
                    </BlockStack>
                    <Button url="/app/history" variant="plain">
                      Voir tout →
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
                            {new Date(log.created_at).toLocaleString("fr-FR")}
                          </Text>
                        </BlockStack>
                        <Text
                          variant="bodySm"
                          fontWeight="semibold"
                          tone={log.success ? "success" : "critical"}
                          as="span"
                        >
                          {log.success ? "✓ Succès" : "✗ Échec"}
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
