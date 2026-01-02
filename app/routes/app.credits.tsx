import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState } from "react";
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

// Packs de crédits - Prix minimum: 0.25€ par crédit
const CREDIT_PACKS = [
  {
    id: "starter",
    name: "Starter",
    credits: 25,
    price: 9.00,
    pricePerCredit: 0.36,
    description: "Parfait pour tester",
    badge: null,
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 100,
    price: 30.00,
    pricePerCredit: 0.30,
    description: "Idéal pour la croissance",
    badge: "POPULAIRE",
    highlight: true,
  },
  {
    id: "business",
    name: "Business",
    credits: 500,
    price: 140.00,
    pricePerCredit: 0.28,
    description: "Pour les volumes importants",
    badge: "MEILLEUR PRIX",
    highlight: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    credits: 2000,
    price: 500.00,
    pricePerCredit: 0.25,
    description: "Tarif optimal pour gros volumes",
    badge: "TARIF MINIMUM",
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

  if (intent === "purchase-credits") {
    const packId = formData.get("packId") as string;
    const pack = CREDIT_PACKS.find((p) => p.id === packId);

    if (pack) {
      await upsertShop(shop, { addCredits: pack.credits });
      return json({ success: true, pack: pack.name, creditsAdded: pack.credits });
    }
  } else if (intent === "custom-pack") {
    const customCredits = parseInt(formData.get("customCredits") as string);
    if (customCredits && customCredits >= 2000) {
      const pricePerCredit = 0.25;
      await upsertShop(shop, { addCredits: customCredits });
      return json({ 
        success: true, 
        pack: "Custom", 
        creditsAdded: customCredits,
        price: customCredits * pricePerCredit
      });
    }
  }

  return json({ success: false, error: "Invalid purchase" });
};

export default function Credits() {
  const { shop, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const currentCredits = shop?.credits || 0;
  const [customCredits, setCustomCredits] = useState("2000");

  const isSubmitting = fetcher.state === "submitting";

  const handlePurchase = (packId: string) => {
    const formData = new FormData();
    formData.append("intent", "purchase-credits");
    formData.append("packId", packId);
    fetcher.submit(formData, { method: "post" });
  };

  const handleCustomPurchase = (formData: FormData) => {
    formData.append("intent", "custom-pack");
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Crédits - VTON Magic" />
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
              <Banner tone="success" title="Achat réussi">
                Pack "{fetcher.data.pack}" acheté avec succès ! {fetcher.data.creditsAdded} crédits
                ont été ajoutés à votre compte.
              </Banner>
            )}

            {/* Crédits disponibles */}
            <Layout>
              <Layout.Section variant="oneThird">
                <div className="vton-credits-card">
                  <div className="vton-credits-label">CRÉDITS DISPONIBLES</div>
                  <div className="vton-credits-amount">
                    {currentCredits.toLocaleString("fr-FR")}
                  </div>
                  <div className="vton-credits-footer">
                    <span>∞</span>
                    <span>Crédits illimités dans le temps</span>
                  </div>
                </div>
              </Layout.Section>

              <Layout.Section variant="twoThirds">
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="200">
                      <Text variant="headingLg" fontWeight="semibold" as="h2">
                        Packs de crédits
                      </Text>
                      <Text variant="bodyMd" tone="subdued" as="p">
                        Les crédits sont utilisés pour chaque génération de try-on. Tarif minimum: 0.25€ par crédit.
                      </Text>
                    </BlockStack>

                    {/* Grille 2x2 pour les packs */}
                    <div className="vton-packs-grid">
                      {CREDIT_PACKS.map((pack) => {
                        const isHighlight = pack.highlight;

                        return (
                          <div key={pack.id} className={`vton-pack-card ${isHighlight ? "highlight" : ""}`}>
                            <div className={`vton-pack-card ${isHighlight ? "highlight" : ""}`}>
                              {isHighlight && pack.badge && (
                                <div className="vton-pack-badge best-seller">
                                  {pack.badge}
                                </div>
                              )}

                              {pack.badge && !isHighlight && (
                                <div className="vton-pack-badge roi">
                                  {pack.badge}
                                </div>
                              )}

                              <Box padding={isHighlight ? "500" : "400"} style={{ paddingTop: isHighlight ? "4rem" : "1rem" }}>
                                <BlockStack gap="400">
                                  <BlockStack gap="200">
                                    <Text 
                                      variant="headingLg" 
                                      fontWeight="bold" 
                                      as="h3"
                                    >
                                      {pack.name}
                                    </Text>
                                    <Text 
                                      variant="heading2xl" 
                                      fontWeight="bold" 
                                      as="p"
                                    >
                                      {pack.credits.toLocaleString("fr-FR")}
                                    </Text>
                                    <Text variant="bodySm" tone="subdued" as="p">
                                      {pack.pricePerCredit.toFixed(2)}€ par crédit
                                    </Text>
                                    <Text variant="bodyMd" tone="subdued" as="p">
                                      {pack.description}
                                    </Text>
                                  </BlockStack>

                                  <Divider />

                                  <BlockStack gap="300">
                                    <Text variant="headingLg" fontWeight="bold" as="p">
                                      {pack.price.toFixed(2)}€
                                    </Text>
                                    
                                    <Button
                                      variant={isHighlight ? "primary" : "secondary"}
                                      size="large"
                                      fullWidth
                                      onClick={() => handlePurchase(pack.id)}
                                      loading={isSubmitting}
                                    >
                                      Acheter
                                    </Button>
                                  </BlockStack>
                                </BlockStack>
                              </Box>
                            </div>
                          </Layout.Section>
                        );
                      })}
                    </Layout>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>

            {/* Pack personnalisé */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text variant="headingMd" fontWeight="semibold" as="h3">
                    Pack personnalisé (volume)
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p">
                    Pour les commandes de 2000 crédits ou plus, bénéficiez du tarif minimum de 0.25€ par crédit.
                  </Text>
                </BlockStack>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCustomPurchase(new FormData(e.currentTarget));
                  }}
                >
                  <InlineStack gap="300" align="start">
                    <Box minWidth="200px">
                      <TextField
                        label=""
                        name="customCredits"
                        type="number"
                        value={customCredits}
                        onChange={setCustomCredits}
                        min={2000}
                        autoComplete="off"
                        suffix="crédits"
                      />
                    </Box>
                    <Box paddingBlockStart="500">
                      <Text variant="bodyMd" as="p">
                        = {(parseInt(customCredits) || 2000) * 0.25}€
                      </Text>
                    </Box>
                    <Box paddingBlockStart="500">
                      <Button
                        submit
                        variant="primary"
                        size="large"
                        loading={isSubmitting}
                      >
                        Commander
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
