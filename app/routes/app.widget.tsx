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
  Box,
  InlineStack,
  Divider,
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

    console.log("[Widget Action] Widget configuration saved successfully");
    return json({ success: true });
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
      <TitleBar title="Widget Configuration - VTON Magic" />
      <style>{`
        .vton-widget-preview-container {
          padding: 20px;
          border: 1px solid #e1e3e5;
          border-radius: 8px;
          background-color: #f6f6f7;
        }
        .vton-button {
          width: 100%;
          padding: 14px 24px;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .vton-button:hover {
          opacity: 0.9;
        }
        .vton-modal-preview {
          position: relative;
          background: white;
          border-radius: 8px;
          border: 1px solid #e1e3e5;
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow: hidden;
          margin: 0 auto;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .vton-modal-close {
          position: absolute;
          top: 12px;
          right: 12px;
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 4px 8px;
          line-height: 1;
          color: #666;
          z-index: 10;
        }
        .vton-modal-content {
          padding: 24px;
        }
        .vton-upload-area {
          border: 2px dashed #ccc;
          border-radius: 8px;
          padding: 40px;
          text-align: center;
          cursor: pointer;
          margin-bottom: 16px;
        }
        .vton-upload-area:hover {
          border-color: #999;
        }
        .vton-privacy-notice {
          font-size: 12px;
          color: #999;
          text-align: center;
          margin-top: 0px;
          margin-bottom: 0px;
          font-style: italic;
          line-height: 1.4;
        }
        .vton-generate-btn {
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 16px;
        }
      `}</style>
      <div className="app-container">
        <header className="app-header">
          <h1 className="app-title">Widget Configuration</h1>
          <p className="app-subtitle">
            Customize the appearance of the Virtual Try-On widget on your store
          </p>
        </header>

        {error && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="critical" title="Error">
              {error}
            </Banner>
          </div>
        )}

        {fetcher.data?.success && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="success">
              Widget configuration saved successfully. Changes will appear on your store after the widget reloads.
            </Banner>
          </div>
        )}

        {(fetcher.data as any)?.error && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="critical">
              Error: {(fetcher.data as any).error}
            </Banner>
          </div>
        )}

        <Layout>
          <Layout.Section variant="twoThirds">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg" fontWeight="semibold">
                  Widget Preview
                </Text>
                <Text variant="bodyMd" tone="subdued" as="p">
                  This preview shows how the widget will appear on your product pages. The widget uses Shadow DOM for CSS isolation, so it may look slightly different in the actual theme context.
                </Text>
                <Divider />
                <Box>
                  <div className="vton-widget-preview-container">
                    {/* Widget Button Preview - exact match from block.liquid */}
                    <Text variant="bodySm" tone="subdued" as="p" style={{ marginBottom: "12px" }}>
                      Widget button on product page:
                    </Text>
                    <div style={{ margin: "16px 0", width: "100%" }}>
                      <button
                        className="vton-button"
                        style={{
                          backgroundColor: widgetBg,
                          color: widgetColor,
                        }}
                      >
                        {widgetText}
                      </button>
                    </div>

                    <Divider />

                    {/* Modal Preview - exact match from block.liquid */}
                    <Text variant="bodySm" tone="subdued" as="p" style={{ marginTop: "24px", marginBottom: "12px" }}>
                      Modal window (opens when button is clicked):
                    </Text>
                    <div className="vton-modal-preview">
                      <button className="vton-modal-close">×</button>
                      <div className="vton-modal-content">
                        <div className="vton-upload-area">
                          <p style={{ margin: 0, color: "#666" }}>Cliquez pour télécharger votre photo</p>
                        </div>
                        <p className="vton-privacy-notice">
                          🔒 Aucune donnée personnelle n'est stockée. Vos photos sont traitées de manière sécurisée et supprimées après génération.
                        </p>
                        <button
                          className="vton-generate-btn"
                          style={{
                            backgroundColor: widgetBg,
                            color: widgetColor,
                          }}
                          disabled
                        >
                          Générer
                        </button>
                      </div>
                    </div>

                    <Text variant="bodySm" tone="subdued" as="p" alignment="center" style={{ marginTop: "16px" }}>
                      Note: The actual widget uses Shadow DOM, so styles are isolated. The colors you configure here will be applied to both the button and the "Générer" button in the modal.
                    </Text>
                  </div>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg" fontWeight="semibold">
                  Configuration
                </Text>
                <Text variant="bodyMd" tone="subdued" as="p">
                  Customize the widget text, background color, and text color. These settings are stored in the database and loaded by the widget when it initializes.
                </Text>
                <Divider />
                <form onSubmit={handleSave}>
                  <BlockStack gap="400">
                    <TextField
                      label="Widget Text"
                      name="widgetText"
                      value={widgetText}
                      onChange={setWidgetText}
                      autoComplete="off"
                      helpText="The text displayed on the widget button"
                    />
                    <TextField
                      label="Background Color"
                      name="widgetBg"
                      value={widgetBg}
                      onChange={setWidgetBg}
                      autoComplete="off"
                      helpText="Hex color code (e.g., #000000)"
                    />
                    <TextField
                      label="Text Color"
                      name="widgetColor"
                      value={widgetColor}
                      onChange={setWidgetColor}
                      autoComplete="off"
                      helpText="Hex color code (e.g., #ffffff)"
                    />
                    <Button 
                      submit 
                      variant="primary" 
                      loading={fetcher.state === "submitting"}
                    >
                      Save Configuration
                    </Button>
                  </BlockStack>
                </form>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">
                    How it works
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    When you save these settings, they are stored in the database. The widget loads these settings from the `/apps/tryon/status` endpoint when it initializes on product pages.
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    To see changes on your store, you may need to refresh the product page or clear your browser cache.
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
