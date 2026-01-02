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

    await upsertShop(shop, updates);
    return json({ success: true, testMode: false });
  } else if (intent === "test-tryon") {
    const personImage = formData.get("personImage") as string;
    const garmentImage = formData.get("garmentImage") as string;

    if (!personImage || !garmentImage) {
      return json({ success: false, error: "Both images are required" });
    }

    // Logic for testing try-on (to be implemented)
    console.log("Test try-on initiated with:", { personImage, garmentImage });
    return json({ success: true, testMode: true, resultImageUrl: "https://via.placeholder.com/300x400?text=Try-on+Result" });
  }

  return json({ success: false, error: "Invalid action" });
};

export default function Widget() {
  const { shop, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [widgetText, setWidgetText] = useState(shop?.widget_text || "Try It On Now ✨");
  const [widgetBg, setWidgetBg] = useState(shop?.widget_bg || "#0066FF");
  const [widgetColor, setWidgetColor] = useState(shop?.widget_color || "#FFFFFF");
  const [maxTriesPerUser, setMaxTriesPerUser] = useState(String(shop?.max_tries_per_user || 5));
  const [personImage, setPersonImage] = useState("");
  const [garmentImage, setGarmentImage] = useState("");

  const handleSaveConfig = () => {
    const formData = new FormData();
    formData.append("intent", "update-widget");
    formData.append("widgetText", widgetText);
    formData.append("widgetBg", widgetBg);
    formData.append("widgetColor", widgetColor);
    formData.append("maxTriesPerUser", maxTriesPerUser);
    fetcher.submit(formData, { method: "post" });
  };

  const handleTestTryOn = () => {
    const formData = new FormData();
    formData.append("intent", "test-tryon");
    formData.append("personImage", personImage);
    formData.append("garmentImage", garmentImage);
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Widget Configuration & Test - VTON Magic" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {error && (
              <Banner tone="critical" title="Error">
                Error loading: {error}
              </Banner>
            )}

            {fetcher.data?.success && (
              <Banner tone="success">
                {fetcher.data.testMode
                  ? "Try-on test initiated (feature to be completed)"
                  : "Configuration saved successfully"}
              </Banner>
            )}

            {/* Widget Configuration */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingLg" fontWeight="semibold" as="h2">
                  Widget Customization
                </Text>
                <Text variant="bodyMd" tone="subdued" as="p">
                  Adjust the appearance and behavior of the Try-On button on your product pages.
                </Text>

                <Divider />

                <BlockStack gap="400">
                  <TextField
                    label="Button Text"
                    value={widgetText}
                    onChange={setWidgetText}
                    autoComplete="off"
                    helpText="Text displayed on the widget button."
                  />
                  <InlineStack gap="400" align="start">
                    <Box minWidth="200px">
                      <TextField
                        label="Background Color"
                        value={widgetBg}
                        onChange={setWidgetBg}
                        autoComplete="off"
                        type="color"
                        helpText="Button background color."
                      />
                    </Box>
                    <Box minWidth="200px">
                      <TextField
                        label="Text Color"
                        value={widgetColor}
                        onChange={setWidgetColor}
                        autoComplete="off"
                        type="color"
                        helpText="Button text color."
                      />
                    </Box>
                  </InlineStack>
                  <TextField
                    label="Max try-ons per user/day"
                    value={maxTriesPerUser}
                    onChange={setMaxTriesPerUser}
                    type="number"
                    min={1}
                    autoComplete="off"
                    helpText="Limits the number of virtual try-ons per customer per day."
                  />
                  <Button primary onClick={handleSaveConfig} loading={fetcher.state === "submitting"}>
                    Save Configuration
                  </Button>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Widget Preview */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingLg" fontWeight="semibold" as="h2">
                  Button Preview
                </Text>
                <Text variant="bodyMd" tone="subdued" as="p">
                  Preview what your Try-On button will look like on your store.
                </Text>
                <Divider />
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <div
                    style={{
                      backgroundColor: widgetBg,
                      color: widgetColor,
                      padding: "12px 24px",
                      borderRadius: "8px",
                      textAlign: "center",
                      fontWeight: "bold",
                      fontSize: "16px",
                      cursor: "pointer",
                      display: "inline-block",
                    }}
                  >
                    {widgetText}
                  </div>
                </Box>
              </BlockStack>
            </Card>

            {/* AI Try-On Test */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingLg" fontWeight="semibold" as="h2">
                  Test AI Virtual Try-On
                </Text>
                <Text variant="bodyMd" tone="subdued" as="p">
                  Run a test to see the quality of AI generation.
                </Text>
                <Divider />
                <InlineStack gap="400" align="start">
                  <TextField
                    label="Person Image URL"
                    placeholder="https://example.com/person.jpg"
                    autoComplete="off"
                    value={personImage}
                    onChange={setPersonImage}
                    helpText="The person image for try-on."
                  />
                  <TextField
                    label="Garment Image URL"
                    placeholder="https://example.com/garment.jpg"
                    autoComplete="off"
                    value={garmentImage}
                    onChange={setGarmentImage}
                    helpText="The garment image to try on."
                  />
                </InlineStack>
                <Button primary onClick={handleTestTryOn} loading={fetcher.state === "submitting"}>
                  Run Try-On Test
                </Button>
                {fetcher.data?.testMode && fetcher.data.success && (
                  <Banner tone="info">
                    Test initiated. Result:{" "}
                    <a href={fetcher.data.resultImageUrl} target="_blank" rel="noopener noreferrer">
                      View Image
                    </a>
                  </Banner>
                )}
                {fetcher.data?.testMode && !fetcher.data.success && (
                  <Banner tone="critical">
                    Error during test: {fetcher.data.error}
                  </Banner>
                )}
              </BlockStack>
            </Card>

            {/* Integration Instructions */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingLg" fontWeight="semibold" as="h2">
                  Widget Integration
                </Text>
                <Text variant="bodyMd" tone="subdued" as="p">
                  Add this script to your Shopify theme to enable the Try-On widget.
                </Text>
                <Divider />
                <InlineCode>
                  &lt;script src="{`{ shop.url }`}/apps/proxy/tryon/widget.js" defer&gt;&lt;/script&gt;
                </InlineCode>
                <Text variant="bodySm" tone="subdued" as="p">
                  Copy and paste this code into your theme's `theme.liquid` file, just before the `&lt;/body&gt;` tag.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
