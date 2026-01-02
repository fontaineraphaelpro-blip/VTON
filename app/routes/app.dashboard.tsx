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
    // Ensure tables exist
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
  const { shop, recentLogs, topProducts } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const handleSave = (formData: FormData) => {
    formData.append("intent", "update-config");
    submit(formData, { method: "post" });
  };

  const stats = [
    {
      label: "Crédits disponibles",
      value: shop?.credits || 0,
    },
    {
      label: "Total try-ons",
      value: shop?.total_tryons || 0,
    },
    {
      label: "Add to Cart",
      value: shop?.total_atc || 0,
    },
  ];

  const logRows = recentLogs.map((log: any) => [
    new Date(log.created_at).toLocaleString("fr-FR"),
    log.product_title || "N/A",
    log.success ? (
      <Badge tone="success">Succès</Badge>
    ) : (
      <Badge tone="critical">Échec</Badge>
    ),
    log.latency_ms ? `${log.latency_ms}ms` : "N/A",
  ]);

  return (
    <Page>
      <TitleBar title="Dashboard - Try-On StyleLab" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {error && (
              <Banner tone="critical">
                Erreur lors du chargement des données: {error}
              </Banner>
            )}
            <Banner tone="info">
              Gérez votre application Try-On depuis cette interface. Configurez
              le widget, consultez les statistiques et l'historique des
              utilisations.
            </Banner>

            {/* Statistiques */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Statistiques
                </Text>
                <InlineStack gap="400" align="space-around">
                  {stats.map((stat) => (
                    <BlockStack key={stat.label} gap="100" align="center">
                      <Text variant="headingLg" as="p">
                        {stat.value.toLocaleString("fr-FR")}
                      </Text>
                      <Text variant="bodyMd" tone="subdued" as="p">
                        {stat.label}
                      </Text>
                    </BlockStack>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Configuration */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Configuration du Widget
                </Text>
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
                    />
                    <InlineStack gap="400">
                      <TextField
                        label="Couleur de fond"
                        name="widgetBg"
                        defaultValue={shop?.widget_bg || "#000000"}
                        autoComplete="off"
                        type="color"
                      />
                      <TextField
                        label="Couleur du texte"
                        name="widgetColor"
                        defaultValue={shop?.widget_color || "#ffffff"}
                        autoComplete="off"
                        type="color"
                      />
                    </InlineStack>
                    <TextField
                      label="Nombre max de try-ons par utilisateur/jour"
                      name="maxTriesPerUser"
                      type="number"
                      defaultValue={String(shop?.max_tries_per_user || 5)}
                      autoComplete="off"
                    />
                    <TextField
                      label="Crédits disponibles"
                      name="credits"
                      type="number"
                      defaultValue={String(shop?.credits || 0)}
                      autoComplete="off"
                      helpText="Ajoutez des crédits pour permettre plus de try-ons"
                    />
                    <Button submit variant="primary">
                      Enregistrer la configuration
                    </Button>
                  </BlockStack>
                </form>
              </BlockStack>
            </Card>

            {/* Historique récent */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Historique récent
                </Text>
                {logRows.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text"]}
                    headings={["Date", "Produit", "Statut", "Latence"]}
                    rows={logRows}
                  />
                ) : (
                  <Text tone="subdued">Aucun historique disponible</Text>
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
                <Text as="h2" variant="headingMd">
                  Top produits
                </Text>
                {topProducts.length > 0 ? (
                  <BlockStack gap="200">
                    {topProducts.map((product: any, index: number) => (
                      <InlineStack
                        key={product.product_id}
                        align="space-between"
                      >
                        <Text as="p" variant="bodyMd">
                          #{index + 1} {product.product_id}
                        </Text>
                        <Badge>{product.tryons} try-ons</Badge>
                      </InlineStack>
                    ))}
                  </BlockStack>
                ) : (
                  <Text tone="subdued">Aucun produit pour le moment</Text>
                )}
              </BlockStack>
            </Card>

            {/* Informations */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Informations
                </Text>
                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p">
                    <strong>Shop:</strong> {shop?.domain}
                  </Text>
                  <Text variant="bodyMd" as="p">
                    <strong>Dernière activité:</strong>{" "}
                    {shop?.last_active_at
                      ? new Date(shop.last_active_at).toLocaleString("fr-FR")
                      : "Jamais"}
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
