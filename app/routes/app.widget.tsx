import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  Page,
  Text,
  Button,
  Banner,
  TextField,
  BlockStack,
  Card,
  Layout,
  InlineStack,
  Divider,
  Box,
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

  const widgetText = (formData.get("widgetText") as string) || "Try It On Now ✨";
  const widgetBg = (formData.get("widgetBg") as string) || "#000000";
  const widgetColor = (formData.get("widgetColor") as string) || "#ffffff";

  console.log("[Widget Action] Saving widget configuration:", {
    shop,
    widgetText,
    widgetBg,
    widgetColor,
  });

  try {
    await upsertShop(shop, {
      widgetText,
      widgetBg,
      widgetColor,
    });

    // Verify the save by reading back from database
    const verifyShop = await getShop(shop);
    console.log("[Widget Action] Widget configuration saved and verified:", {
      widget_text: verifyShop?.widget_text,
      widget_bg: verifyShop?.widget_bg,
      widget_color: verifyShop?.widget_color,
    });

    return json({ 
      success: true,
      savedValues: {
        widget_text: verifyShop?.widget_text,
        widget_bg: verifyShop?.widget_bg,
        widget_color: verifyShop?.widget_color,
      }
    });
  } catch (error) {
    console.error("[Widget Action] Error saving widget configuration:", error);
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Erreur lors de la sauvegarde" 
    });
  }
};

export default function Widget() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();

  const shop = (loaderData as any).shop || null;
  const error = (loaderData as any).error || null;

  const [widgetText, setWidgetText] = useState(shop?.widget_text || "Try It On Now ✨");
  const [widgetBg, setWidgetBg] = useState(shop?.widget_bg || "#000000");
  const [widgetColor, setWidgetColor] = useState(shop?.widget_color || "#ffffff");

  useEffect(() => {
    if (shop) {
      setWidgetText(shop.widget_text || "Try It On Now ✨");
      setWidgetBg(shop.widget_bg || "#000000");
      setWidgetColor(shop.widget_color || "#ffffff");
    }
  }, [shop]);

  useEffect(() => {
    if (fetcher.data?.success) {
      setTimeout(() => {
        revalidator.revalidate();
      }, 500);
    }
  }, [fetcher.data?.success, revalidator]);

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Configuration du Widget - VTON Magic" />
      <div className="app-container">
        <header className="app-header">
          <h1 className="app-title">Configuration du Widget</h1>
          <p className="app-subtitle">
            Personnalisez l'apparence du widget Virtual Try-On sur votre boutique
          </p>
        </header>

        {error && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="critical" title="Erreur">
              {error}
            </Banner>
          </div>
        )}

        {fetcher.data?.success && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="success">
              Configuration enregistrée avec succès ! Les modifications sont maintenant dans la base de données et seront chargées automatiquement par le widget sur vos pages produits. Rafraîchissez une page produit pour voir les changements.
              {fetcher.data?.savedValues && (
                <div style={{ marginTop: "8px", fontSize: "12px" }}>
                  Valeurs sauvegardées: texte="{fetcher.data.savedValues.widget_text}", bg="{fetcher.data.savedValues.widget_bg}", color="{fetcher.data.savedValues.widget_color}"
                </div>
              )}
            </Banner>
          </div>
        )}

        {(fetcher.data as any)?.error && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="critical">
              Erreur : {(fetcher.data as any).error}
            </Banner>
          </div>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <div>
                  <Text as="h2" variant="headingLg" fontWeight="semibold">
                    Paramètres du Widget
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p" style={{ marginTop: "8px" }}>
                    Les paramètres que vous configurez ici sont sauvegardés directement dans la base de données. Le widget sur vos pages produits charge ces paramètres en temps réel depuis l'endpoint <code>/apps/tryon/status</code>.
                  </Text>
                </div>

                <Divider />

                <form onSubmit={handleSave}>
                  <BlockStack gap="500">
                    <TextField
                      label="Texte du bouton"
                      name="widgetText"
                      value={widgetText}
                      onChange={setWidgetText}
                      autoComplete="off"
                      helpText="Le texte affiché sur le bouton du widget"
                    />

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="medium">
                        Couleur de fond
                      </Text>
                      <InlineStack gap="300" align="start">
                        <input
                          type="color"
                          value={widgetBg}
                          onChange={(e) => setWidgetBg(e.target.value)}
                          style={{
                            width: "60px",
                            height: "40px",
                            border: "1px solid #e1e3e5",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        />
                        <Box minWidth="200px" style={{ flex: 1 }}>
                          <TextField
                            label=""
                            name="widgetBg"
                            value={widgetBg}
                            onChange={setWidgetBg}
                            autoComplete="off"
                            helpText="Code couleur hexadécimal"
                          />
                        </Box>
                      </InlineStack>
                    </BlockStack>

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="medium">
                        Couleur du texte
                      </Text>
                      <InlineStack gap="300" align="start">
                        <input
                          type="color"
                          value={widgetColor}
                          onChange={(e) => setWidgetColor(e.target.value)}
                          style={{
                            width: "60px",
                            height: "40px",
                            border: "1px solid #e1e3e5",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        />
                        <Box minWidth="200px" style={{ flex: 1 }}>
                          <TextField
                            label=""
                            name="widgetColor"
                            value={widgetColor}
                            onChange={setWidgetColor}
                            autoComplete="off"
                            helpText="Code couleur hexadécimal"
                          />
                        </Box>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <Button 
                      submit 
                      variant="primary" 
                      loading={fetcher.state === "submitting"}
                      size="large"
                    >
                      Enregistrer la configuration
                    </Button>
                  </BlockStack>
                </form>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">
                    Aperçu en temps réel
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Voici un aperçu de votre widget tel qu'il apparaîtra sur vos pages produits. Les modifications sont appliquées en temps réel.
                  </Text>
                  <Card>
                    <div style={{ padding: "16px" }}>
                      <div 
                        className="vton-widget-preview"
                        style={{
                          width: "100%",
                          margin: "16px 0",
                        }}
                      >
                        <button
                          type="button"
                          className="vton-button-preview"
                          style={{
                            width: "100%",
                            padding: "14px 24px",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "16px",
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "opacity 0.2s",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            backgroundColor: widgetBg || "#000000",
                            color: widgetColor || "#ffffff",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = "0.9";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = "1";
                          }}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            style={{ flexShrink: 0 }}
                          >
                            <path
                              d="M12 2L2 7L12 12L22 7L12 2Z"
                              stroke={widgetColor || "#ffffff"}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M2 17L12 22L22 17"
                              stroke={widgetColor || "#ffffff"}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M2 12L12 17L22 12"
                              stroke={widgetColor || "#ffffff"}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span>{widgetText || "Try It On Now ✨"}</span>
                        </button>
                      </div>
                    </div>
                  </Card>
                </BlockStack>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">
                    Valeurs actuelles dans la base de données
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    <strong>Texte :</strong> {shop?.widget_text || "Non défini"}
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    <strong>Couleur de fond :</strong> {shop?.widget_bg || "Non défini"}
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    <strong>Couleur du texte :</strong> {shop?.widget_color || "Non défini"}
                  </Text>
                </BlockStack>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">
                    Comment ça fonctionne
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    <strong>Connexion directe :</strong> Les paramètres que vous enregistrez ici sont immédiatement sauvegardés dans la base de données (table <code>shops</code>, colonnes <code>widget_text</code>, <code>widget_bg</code>, <code>widget_color</code>).
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    <strong>Chargement par le widget :</strong> Le widget client sur vos pages produits charge ces paramètres depuis l'endpoint <code>/apps/tryon/status</code> à chaque initialisation. Les changements apparaîtront dès qu'un visiteur charge ou recharge une page produit.
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    <strong>Important :</strong> Après avoir sauvegardé les modifications, vous devez <strong>recharger complètement la page produit</strong> (F5 ou Ctrl+R) pour voir les changements. Le widget se recharge à chaque chargement de page.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </div>
    </Page>
  );
}
