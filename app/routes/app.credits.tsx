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
  Button,
  Banner,
  Divider,
  Box,
  Icon,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

// Packs de crédits disponibles
const CREDIT_PACKS = [
  {
    id: "starter",
    name: "Starter",
    credits: 100,
    price: 9.99,
    popular: false,
    savings: null,
    description: "Parfait pour tester",
  },
  {
    id: "professional",
    name: "Professional",
    credits: 500,
    price: 39.99,
    popular: true,
    savings: "20%",
    description: "Le plus populaire",
    badge: "Meilleure valeur",
  },
  {
    id: "business",
    name: "Business",
    credits: 1500,
    price: 99.99,
    popular: false,
    savings: "33%",
    description: "Pour les grandes boutiques",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    credits: 5000,
    price: 299.99,
    popular: false,
    savings: "40%",
    description: "Volume maximum",
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

  if (intent === "purchase-pack") {
    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    if (pack) {
      // Add credits to existing balance
      await upsertShop(shop, { addCredits: pack.credits });

      return json({ success: true, pack: pack.name, creditsAdded: pack.credits });
    }
  }

  return json({ success: false });
};

export default function Credits() {
  const { shop, error } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const currentCredits = shop?.credits || 0;

  const handlePurchase = (packId: string) => {
    const formData = new FormData();
    formData.append("intent", "purchase-pack");
    formData.append("packId", packId);
    submit(formData, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Acheter des crédits - Try-On StyleLab" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* Header */}
            <BlockStack gap="300">
              <Text as="h1" variant="heading2xl" fontWeight="bold">
                Acheter des crédits
              </Text>
              <Text variant="bodyMd" tone="subdued" as="p">
                Choisissez un pack de crédits pour continuer à offrir l'essayage virtuel à vos clients. Plus vous achetez, plus vous économisez.
              </Text>
            </BlockStack>

            {error && (
              <Banner tone="critical" title="Erreur">
                Erreur lors du chargement: {error}
              </Banner>
            )}

            {/* Current Credits Display */}
            <Card background="bg-surface-info-subdued">
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued" as="p">
                      Crédits disponibles
                    </Text>
                    <Text variant="heading3xl" fontWeight="bold" as="p">
                      {currentCredits.toLocaleString("fr-FR")}
                    </Text>
                  </BlockStack>
                  <Text variant="headingLg" as="span">
                    💎
                  </Text>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Credit Packs */}
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg" fontWeight="semibold">
                Packs de crédits
              </Text>

              <Layout>
                {CREDIT_PACKS.map((pack) => {
                  const pricePerCredit = (pack.price / pack.credits).toFixed(4);
                  const isPopular = pack.popular;

                  return (
                    <Layout.Section
                      variant={isPopular ? "oneThird" : "oneQuarter"}
                      key={pack.id}
                    >
                      <Card>
                        <Box
                          position="relative"
                          padding={isPopular ? "500" : "400"}
                          background={isPopular ? "bg-surface-selected" : undefined}
                        >
                          {isPopular && (
                            <Box position="absolute" insetBlockStart="400" insetInlineEnd="400">
                              <Box
                                padding="200"
                                background="bg-fill-success"
                                borderRadius="200"
                              >
                                <Text variant="bodySm" fontWeight="semibold" alignment="center">
                                  {pack.badge}
                                </Text>
                              </Box>
                            </Box>
                          )}

                          <BlockStack gap="400">
                            <BlockStack gap="200">
                              <InlineStack align="space-between" blockAlign="start">
                                <BlockStack gap="050">
                                  <Text variant="headingLg" fontWeight="bold" as="h3">
                                    {pack.name}
                                  </Text>
                                  <Text variant="bodySm" tone="subdued" as="p">
                                    {pack.description}
                                  </Text>
                                </BlockStack>
                                {pack.savings && (
                                  <Box
                                    padding="150"
                                    background="bg-fill-success-subdued"
                                    borderRadius="200"
                                  >
                                    <Text variant="bodySm" fontWeight="semibold" tone="success">
                                      -{pack.savings}
                                    </Text>
                                  </Box>
                                )}
                              </InlineStack>
                            </BlockStack>

                            <Divider />

                            <BlockStack gap="300">
                              <BlockStack gap="100">
                                <Text variant="heading2xl" fontWeight="bold" as="p">
                                  {pack.credits.toLocaleString("fr-FR")} crédits
                                </Text>
                                <Text variant="headingLg" fontWeight="semibold" tone="subdued" as="p">
                                  {pack.price.toFixed(2)} €
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  {pricePerCredit} € / crédit
                                </Text>
                              </BlockStack>

                              <Button
                                variant={isPopular ? "primary" : "secondary"}
                                size="large"
                                fullWidth
                                onClick={() => handlePurchase(pack.id)}
                              >
                                Acheter maintenant
                              </Button>
                            </BlockStack>
                          </BlockStack>
                        </Box>
                      </Card>
                    </Layout.Section>
                  );
                })}
              </Layout>
            </BlockStack>

            {/* FAQ / Info */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg" fontWeight="semibold">
                  Questions fréquentes
                </Text>
                <BlockStack gap="300">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      Combien de crédits sont utilisés par try-on ?
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      1 crédit = 1 try-on réussi. Les tentatives échouées ne consomment pas de crédits.
                    </Text>
                  </BlockStack>
                  <Divider />
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      Les crédits expirent-ils ?
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Non, vos crédits n'expirent jamais. Utilisez-les à votre rythme.
                    </Text>
                  </BlockStack>
                  <Divider />
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      Puis-je changer de pack plus tard ?
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Oui, vous pouvez acheter plusieurs packs et les crédits s'additionnent.
                    </Text>
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

