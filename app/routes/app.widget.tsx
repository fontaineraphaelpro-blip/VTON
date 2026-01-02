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
  TextField,
  Divider,
  Box,
  InlineCode,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

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
    console.error("Widget loader error:", error);
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

  if (intent === "update-widget") {
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
  }

  if (intent === "test-tryon") {
    const personImage = formData.get("personImage") as string;
    const garmentImage = formData.get("garmentImage") as string;

    if (!personImage || !garmentImage) {
      return json({ success: false, error: "Les deux images sont requises" });
    }

    // Note: Pour un vrai test, il faudrait appeler l'API Replicate
    // Pour l'instant, on simule juste la réponse
    return json({ 
      success: true, 
      message: "Test de try-on initié (fonctionnalité à implémenter avec Replicate API)",
      testMode: true 
    });
  }

  return json({ success: false, error: "Action invalide" });
};

export default function Widget() {
  const { shop, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  
  const [widgetText, setWidgetText] = useState(shop?.widget_text || "Try It On Now ✨");
  const [widgetBg, setWidgetBg] = useState(shop?.widget_bg || "#000000");
  const [widgetColor, setWidgetColor] = useState(shop?.widget_color || "#ffffff");
  const [maxTries, setMaxTries] = useState(String(shop?.max_tries_per_user || 5));
  const [personImageUrl, setPersonImageUrl] = useState("");
  const [garmentImageUrl, setGarmentImageUrl] = useState("");

  const handleSaveWidget = () => {
    const formData = new FormData();
    formData.append("intent", "update-widget");
    formData.append("widgetText", widgetText);
    formData.append("widgetBg", widgetBg);
    formData.append("widgetColor", widgetColor);
    formData.append("maxTriesPerUser", maxTries);
    fetcher.submit(formData, { method: "post" });
  };

  const handleTestTryOn = () => {
    if (!personImageUrl || !garmentImageUrl) {
      return;
    }
    const formData = new FormData();
    formData.append("intent", "test-tryon");
    formData.append("personImage", personImageUrl);
    formData.append("garmentImage", garmentImageUrl);
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Configuration Widget - VTON Magic" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {error && (
              <Banner tone="critical" title="Erreur">
                {error}
              </Banner>
            )}

            {fetcher.data?.success && (
              <Banner tone="success">
                {fetcher.data.testMode 
                  ? "Test de try-on initié (fonctionnalité à compléter)"
                  : "Configuration sauvegardée avec succès"}
              </Banner>
            )}

            {/* Configuration du Widget */}
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingLg" fontWeight="semibold">
                    Configuration du Widget
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p">
                    Personnalisez l'apparence du widget Try-On qui apparaît sur vos pages produits
                  </Text>
                </BlockStack>

                <BlockStack gap="400">
                  <TextField
                    label="Texte du bouton"
                    value={widgetText}
                    onChange={setWidgetText}
                    autoComplete="off"
                    helpText="Texte affiché sur le bouton du widget"
                  />
                  
                  <InlineStack gap="400" align="start">
                    <Box minWidth="200px">
                      <TextField
                        label="Couleur de fond"
                        value={widgetBg}
                        onChange={setWidgetBg}
                        autoComplete="off"
                        type="color"
                      />
                    </Box>
                    <Box minWidth="200px">
                      <TextField
                        label="Couleur du texte"
                        value={widgetColor}
                        onChange={setWidgetColor}
                        autoComplete="off"
                        type="color"
                      />
                    </Box>
                  </InlineStack>

                  <TextField
                    label="Nombre max de try-ons par utilisateur/jour"
                    value={maxTries}
                    onChange={setMaxTries}
                    type="number"
                    autoComplete="off"
                    helpText="Limite quotidienne par utilisateur pour éviter les abus"
                  />

                  {/* Aperçu */}
                  <Box padding="400" background="bg-surface-subdued" borderRadius="200">
                    <BlockStack gap="300">
                      <Text variant="bodyMd" fontWeight="semibold" as="p">
                        Aperçu du bouton:
                      </Text>
                      <Box
                        padding="300"
                        borderRadius="200"
                        style={{
                          backgroundColor: widgetBg,
                          color: widgetColor,
                          display: "inline-block",
                          textAlign: "center",
                          minWidth: "200px",
                        }}
                      >
                        <Text variant="bodyMd" fontWeight="semibold" as="span" style={{ color: widgetColor }}>
                          {widgetText}
                        </Text>
                      </Box>
                    </BlockStack>
                  </Box>

                  <InlineStack align="end">
                    <Button 
                      onClick={handleSaveWidget} 
                      variant="primary"
                      loading={fetcher.state === "submitting"}
                    >
                      Enregistrer la configuration
                    </Button>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            <Divider />

            {/* Test Try-On */}
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingLg" fontWeight="semibold">
                    Tester le Try-On IA
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p">
                    Testez la génération de try-on avec vos propres images. Utilisez des URLs d'images publiques.
                  </Text>
                </BlockStack>

                <BlockStack gap="400">
                  <TextField
                    label="URL image personne"
                    value={personImageUrl}
                    onChange={setPersonImageUrl}
                    autoComplete="off"
                    helpText="URL publique d'une image de personne (format JPG/PNG)"
                    placeholder="https://example.com/person.jpg"
                  />

                  <TextField
                    label="URL image vêtement"
                    value={garmentImageUrl}
                    onChange={setGarmentImageUrl}
                    autoComplete="off"
                    helpText="URL publique d'une image de vêtement (format JPG/PNG)"
                    placeholder="https://example.com/garment.jpg"
                  />

                  {personImageUrl && (
                    <Box>
                      <Text variant="bodySm" fontWeight="semibold" as="p" tone="subdued">
                        Aperçu image personne:
                      </Text>
                      <Box paddingBlockStart="200">
                        <img 
                          src={personImageUrl} 
                          alt="Person preview" 
                          style={{ maxWidth: "300px", maxHeight: "300px", borderRadius: "8px" }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </Box>
                    </Box>
                  )}

                  {garmentImageUrl && (
                    <Box>
                      <Text variant="bodySm" fontWeight="semibold" as="p" tone="subdued">
                        Aperçu image vêtement:
                      </Text>
                      <Box paddingBlockStart="200">
                        <img 
                          src={garmentImageUrl} 
                          alt="Garment preview" 
                          style={{ maxWidth: "300px", maxHeight: "300px", borderRadius: "8px" }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </Box>
                    </Box>
                  )}

                  <Banner tone="info">
                    <Text variant="bodySm" as="p">
                      <strong>Note:</strong> Cette fonctionnalité nécessite l'intégration complète avec l'API Replicate. 
                      Pour l'instant, seuls les paramètres sont enregistrés.
                    </Text>
                  </Banner>

                  <InlineStack align="end">
                    <Button 
                      onClick={handleTestTryOn}
                      variant="secondary"
                      disabled={!personImageUrl || !garmentImageUrl}
                      loading={fetcher.state === "submitting"}
                    >
                      Lancer le test
                    </Button>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

