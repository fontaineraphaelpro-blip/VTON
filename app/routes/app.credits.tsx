import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useFetcher } from "@remix-run/react";
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
  Box,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";
import { AppHeader } from "../components/AppHeader";

// Packs de crédits dans le style de l'image
const CREDIT_PACKS = [
  {
    id: "discovery",
    name: "Discovery",
    credits: 10,
    price: 4.99,
    description: "Start offering Virtual Testing",
    badge: null,
    highlight: false,
  },
  {
    id: "standard",
    name: "Standard",
    credits: 30,
    price: 12.99,
    description: "Turn visitors into buyers",
    badge: "BEST SELLER",
    savings: "15%",
    highlight: true,
  },
  {
    id: "business",
    name: "Business",
    credits: 100,
    price: 29.99,
    description: "Slash return rates by 30%",
    badge: "BEST ROI",
    highlight: false,
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureTables();
    const shopData = await getShop(shop);

    return json({
      shop: shopData || null,
    });
  } catch (error) {
    console.error("Credits loader error:", error);
    return json({
      shop: null,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const intent = formData.get("intent");
  const packId = formData.get("packId") as string;
  const customCredits = formData.get("customCredits") as string;

  if (intent === "purchase-pack") {
    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    if (pack) {
      await upsertShop(shop, { addCredits: pack.credits });
      return json({ success: true, pack: pack.name, creditsAdded: pack.credits });
    }
  }

  if (intent === "purchase-custom") {
    const credits = parseInt(customCredits || "0");
    if (credits >= 200) {
      // Prix personnalisé : 0.25€ par crédit pour bulk
      await upsertShop(shop, { addCredits: credits });
      return json({ success: true, creditsAdded: credits });
    }
  }

  return json({ success: false });
};

export default function Credits() {
  const { shop, error } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const fetcher = useFetcher();

  const currentCredits = shop?.credits || 0;
  const isLoading = fetcher.state !== "idle";

  const handlePurchase = (packId: string) => {
    const formData = new FormData();
    formData.append("intent", "purchase-pack");
    formData.append("packId", packId);
    submit(formData, { method: "post" });
  };

  const handleCustomPurchase = (formData: FormData) => {
    formData.append("intent", "purchase-custom");
    submit(formData, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Acheter des crédits - VTON Magic" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* App Header */}
            <AppHeader />

            {/* Banner d'alerte valeur */}
            <Banner tone="info">
              <Text variant="bodyMd" as="p">
                <strong>Stop losing money on returns.</strong> Letting customers test products 
                virtually removes doubt. This slashes refunds and boosts conversion by{" "}
                <strong>2.5x instantly</strong>.
              </Text>
            </Banner>

            {error && (
              <Banner tone="critical" title="Erreur">
                Erreur lors du chargement: {error}
              </Banner>
            )}

            {fetcher.data?.success && (
              <Banner tone="success" title="Succès">
                Pack "{fetcher.data.pack}" acheté avec succès ! {fetcher.data.creditsAdded} crédits 
                ont été ajoutés à votre compte.
              </Banner>
            )}

            {/* Layout principal : Crédits à gauche, Packs à droite */}
            <Layout>
              {/* Carte Crédits Restants (gauche) */}
              <Layout.Section variant="oneThird">
                <div className="vton-credits-card">
                  <div className="vton-credits-label">REMAINING CREDITS</div>
                  <div className="vton-credits-amount">
                    {currentCredits.toLocaleString("fr-FR")}
                  </div>
                  <div className="vton-credits-footer">
                    <span>∞</span>
                    <span>Credits never expire</span>
                  </div>
                </div>
              </Layout.Section>

              {/* Packs de pricing (droite) */}
              <Layout.Section>
                <Layout>
                  {CREDIT_PACKS.map((pack) => {
                    const isHighlight = pack.highlight;

                    return (
                      <Layout.Section variant="oneThird" key={pack.id}>
                        <Card>
                          <Box position="relative">
                            {isHighlight && (
                              <Box
                                padding="300"
                                background="bg-surface-brand"
                                borderRadius="200"
                                marginBlockEnd="300"
                              >
                                <Text variant="bodySm" fontWeight="bold" alignment="center">
                                  {pack.badge}
                                </Text>
                              </Box>
                            )}
                            
                            {pack.savings && (
                              <Box
                                position="absolute"
                                insetBlockStart="400"
                                insetInlineEnd="400"
                                padding="150"
                                background="bg-fill-success"
                                borderRadius="200"
                              >
                                <Text variant="bodySm" fontWeight="semibold">
                                  SAVE {pack.savings}
                                </Text>
                              </Box>
                            )}

                            {pack.badge && !isHighlight && (
                              <Box
                                position="absolute"
                                insetBlockStart="400"
                                insetInlineEnd="400"
                                padding="150"
                                background="bg-fill-warning-subdued"
                                borderRadius="200"
                              >
                                <Text variant="bodySm" fontWeight="semibold">
                                  {pack.badge}
                                </Text>
                              </Box>
                            )}

                            <BlockStack gap="400">
                              {!isHighlight && <Box paddingBlockStart="400" />}
                              
                              <BlockStack gap="200">
                                <Text 
                                  variant="headingLg" 
                                  fontWeight="bold" 
                                  as="h3"
                                  tone={isHighlight ? "brand" : undefined}
                                >
                                  {pack.name}
                                </Text>
                                <Text 
                                  variant="heading3xl" 
                                  fontWeight="bold" 
                                  as="p"
                                  tone={isHighlight ? "brand" : undefined}
                                >
                                  {pack.credits}
                                </Text>
                                <Text 
                                  variant="bodyMd" 
                                  tone={isHighlight ? "brand" : "subdued"} 
                                  as="p"
                                >
                                  {pack.description}
                                </Text>
                              </BlockStack>

                              <Divider />

                              <BlockStack gap="300">
                                <Text 
                                  variant="headingLg" 
                                  fontWeight="bold" 
                                  as="p"
                                  tone={isHighlight ? "brand" : undefined}
                                >
                                  {pack.price.toFixed(2)}€
                                </Text>
                                
                                <Button
                                  variant={isHighlight ? "primary" : "secondary"}
                                  size="large"
                                  fullWidth
                                  onClick={() => handlePurchase(pack.id)}
                                  loading={isLoading}
                                >
                                  {isHighlight ? "Top Up Now" : "Select"}
                                </Button>
                              </BlockStack>
                            </BlockStack>
                          </Box>
                        </Card>
                      </Layout.Section>
                    );
                  })}
                </Layout>
              </Layout.Section>
            </Layout>

            {/* Section High Volume Store */}
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="300" align="start">
                  <Text variant="headingMd" fontWeight="semibold" as="h3">
                    🏠 High Volume Store?
                  </Text>
                </InlineStack>
                <Text variant="bodyMd" tone="subdued" as="p">
                  Get our lowest rate (€0.25 / try-on) for bulk orders.
                </Text>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCustomPurchase(new FormData(e.currentTarget));
                  }}
                >
                  <InlineStack gap="300" align="start">
                    <Box minWidth="150px">
                      <TextField
                        label=""
                        name="customCredits"
                        type="number"
                        defaultValue="200"
                        min={200}
                        autoComplete="off"
                        suffix="credits"
                      />
                    </Box>
                    <Box paddingBlockStart="500">
                      <Button
                        submit
                        variant="primary"
                        size="large"
                        loading={isLoading}
                      >
                        Get Custom Pack
                      </Button>
                    </Box>
                  </InlineStack>
                </form>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
