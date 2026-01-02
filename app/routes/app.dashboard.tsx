import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  TextField,
  Button,
  DataTable,
  Box,
  Banner,
  Divider,
  Link,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getShop,
  upsertShop,
  getTryonLogs,
  getTopProducts,
} from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

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
      recentLogs: Array.isArray(recentLogs) ? recentLogs.slice(0, 10) : [],
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

  const intent = formData.get("intent");

  if (intent === "update-config") {
    const updates: any = {};
    
    if (formData.get("widgetText")) {
      updates.widgetText = formData.get("widgetText") as string;
    }
    if (formData.get("widgetBg")) {
      updates.widgetBg = formData.get("widgetBg") as string;
    }
    if (formData.get("widgetColor")) {
      updates.widgetColor = formData.get("widgetColor") as string;
    }
    if (formData.get("maxTriesPerUser")) {
      updates.maxTriesPerUser = parseInt(formData.get("maxTriesPerUser") as string);
    }
    if (formData.get("credits")) {
      updates.credits = parseInt(formData.get("credits") as string);
    }

    await upsertShop(shop, updates);
  }

  return json({ success: true });
};

export default function Dashboard() {
  const { shop, recentLogs, topProducts, error } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const handleSave = (formData: FormData) => {
    formData.append("intent", "update-config");
    submit(formData, { method: "post" });
  };

  const totalTryons = shop?.total_tryons || 0;
  const totalAtc = shop?.total_atc || 0;
  const credits = shop?.credits || 0;
  const conversionRate = totalTryons > 0 
    ? ((totalAtc / totalTryons) * 100).toFixed(1) 
    : "0.0";

  const stats = [
    {
      label: "Crédits disponibles",
      value: credits.toLocaleString("fr-FR"),
      trend: "neutral" as const,
      icon: "💎",
    },
    {
      label: "Total try-ons",
      value: totalTryons.toLocaleString("fr-FR"),
      trend: "positive" as const,
      icon: "✨",
    },
    {
      label: "Add to Cart",
      value: totalAtc.toLocaleString("fr-FR"),
      trend: "positive" as const,
      icon: "🛒",
    },
    {
      label: "Taux de conversion",
      value: `${conversionRate}%`,
      trend: totalAtc > 0 ? ("positive" as const) : ("neutral" as const),
      icon: "📈",
    },
  ];

  const logRows = recentLogs.map((log: any) => [
    new Date(log.created_at).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    }),
    log.product_title || "N/A",
    log.success ? (
      <Badge tone="success" key={`badge-${log.id}`}>Succès</Badge>
    ) : (
      <Badge tone="critical" key={`badge-${log.id}`}>Échec</Badge>
    ),
    log.latency_ms ? `${log.latency_ms}ms` : "N/A",
  ]);

  return (
    <Page>
      <TitleBar title="Dashboard - Try-On StyleLab" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* Header avec titre */}
            <BlockStack gap="200">
              <Text as="h1" variant="heading2xl" fontWeight="bold">
                Dashboard
              </Text>
              <Text variant="bodyMd" tone="subdued" as="p">
                Gérez votre application Try-On et suivez les performances en temps réel
              </Text>
            </BlockStack>

            {error && (
              <Banner tone="critical" title="Erreur">
                Erreur lors du chargement des données: {error}
              </Banner>
            )}

            {/* Statistiques - Grid moderne */}
            <Layout>
              {stats.map((stat, index) => (
                <Layout.Section variant="oneQuarter" key={stat.label}>
                  <Card>
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
                  </Card>
                </Layout.Section>
              ))}
            </Layout>

            {/* Alert bas crédits */}
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
                Achetez un pack de crédits pour continuer à offrir l'essayage virtuel à vos clients.
              </Banner>
            )}

            {/* CTA Achat crédits si crédits faibles */}
            {credits < 100 && (
              <Card background="bg-surface-success-subdued">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="200">
                    <Text variant="headingMd" fontWeight="semibold" as="h3">
                      💎 Rechargez vos crédits
                    </Text>
                    <Text variant="bodyMd" as="p">
                      Ne manquez pas l'opportunité d'augmenter vos ventes ! Achetez un pack de crédits 
                      et bénéficiez de remises importantes sur les volumes.
                    </Text>
                  </BlockStack>
                  <Button url="/app/credits" variant="primary" size="large">
                    Voir les packs
                  </Button>
                </InlineStack>
              </Card>
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
                    Personnalisez l'apparence et le comportement du widget Try-On sur votre boutique
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
                      helpText="Limite quotidienne par utilisateur"
                    />
                    <BlockStack gap="200">
                      <TextField
                        label="Crédits disponibles"
                        name="credits"
                        type="number"
                        defaultValue={String(credits)}
                        autoComplete="off"
                        helpText="Ajoutez des crédits manuellement ou achetez un pack"
                        disabled
                      />
                      <Button url="/app/credits" variant="secondary" size="medium">
                        Acheter des crédits →
                      </Button>
                    </BlockStack>
                    <InlineStack gap="300">
                      <Button submit variant="primary" size="large">
                        Enregistrer la configuration
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </form>
              </BlockStack>
            </Card>

            {/* Historique récent */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingLg" fontWeight="semibold">
                    Activité récente
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p">
                    Les 10 dernières tentatives d'essayage virtuel
                  </Text>
                </BlockStack>
                {logRows.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text"]}
                    headings={["Date", "Produit", "Statut", "Latence"]}
                    rows={logRows}
                  />
                ) : (
                  <Box padding="600">
                    <Text tone="subdued" alignment="center" as="p">
                      Aucun historique disponible pour le moment
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="500">
            {/* Top produits */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingLg" fontWeight="semibold">
                    Top produits
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p">
                    Produits les plus utilisés pour le try-on
                  </Text>
                </BlockStack>
                {topProducts.length > 0 ? (
                  <BlockStack gap="300">
                    {topProducts.map((product: any, index: number) => (
                      <Box
                        key={product.product_id}
                        paddingBlockStart={index > 0 ? "300" : "0"}
                        paddingBlockEnd="300"
                        borderBlockStartWidth={index > 0 ? "025" : "0"}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="050">
                            <InlineStack gap="200" align="start">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                #{index + 1}
                              </Text>
                              <Text as="span" variant="bodyMd">
                                {product.product_id}
                              </Text>
                            </InlineStack>
                          </BlockStack>
                          <Badge tone="info">{product.tryons} try-ons</Badge>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                ) : (
                  <Box padding="400">
                    <Text tone="subdued" alignment="center" as="p">
                      Aucun produit pour le moment
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>

            {/* Informations du shop */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingLg" fontWeight="semibold">
                    Informations
                  </Text>
                </BlockStack>
                <BlockStack gap="300">
                  <BlockStack gap="050">
                    <Text variant="bodySm" tone="subdued" as="p">
                      Boutique
                    </Text>
                    <Text variant="bodyMd" fontWeight="medium" as="p">
                      {shop?.domain || "N/A"}
                    </Text>
                  </BlockStack>
                  <Divider />
                  <BlockStack gap="050">
                    <Text variant="bodySm" tone="subdued" as="p">
                      Dernière activité
                    </Text>
                    <Text variant="bodyMd" fontWeight="medium" as="p">
                      {shop?.last_active_at
                        ? new Date(shop.last_active_at).toLocaleString("fr-FR", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "Jamais"}
                    </Text>
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* CTA Achat crédits */}
            <Card background="bg-surface-brand-subdued">
              <BlockStack gap="300">
                <Text variant="headingMd" fontWeight="semibold" as="h3">
                  💎 Acheter des crédits
                </Text>
                <Text variant="bodyMd" as="p">
                  Boostez vos ventes avec plus de crédits. Packs disponibles avec remises jusqu'à 40%.
                </Text>
                <Button url="/app/credits" variant="primary" size="medium" fullWidth>
                  Voir les packs
                </Button>
              </BlockStack>
            </Card>

            {/* Call to Action */}
            <Card background="bg-surface-info-subdued">
              <BlockStack gap="300">
                <Text variant="headingMd" fontWeight="semibold" as="h3">
                  Besoin d'aide ?
                </Text>
                <Text variant="bodyMd" as="p">
                  Consultez la documentation ou contactez le support pour optimiser votre utilisation du widget Try-On.
                </Text>
                <Button
                  url="https://shopify.dev"
                  target="_blank"
                  variant="secondary"
                >
                  Documentation
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
