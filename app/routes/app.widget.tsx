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
              Widget configuration saved successfully
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
                  This is how the widget will appear on your product pages, next to the "Add to Cart" button.
                </Text>
                <Divider />
                <Box>
                  <div style={{ 
                    padding: "20px", 
                    border: "1px solid #e1e3e5", 
                    borderRadius: "8px",
                    backgroundColor: "#f6f6f7"
                  }}>
                    <div style={{
                      marginBottom: "16px",
                      padding: "14px 24px",
                      backgroundColor: widgetBg,
                      color: widgetColor,
                      borderRadius: "4px",
                      fontSize: "16px",
                      fontWeight: 600,
                      textAlign: "center",
                      cursor: "pointer",
                      transition: "opacity 0.2s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                    >
                      {widgetText}
                    </div>
                    <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                      Preview: Widget button as it appears on product pages
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
                  Customize the widget text, background color, and text color.
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
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </div>
    </Page>
  );
}
