import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { useEffect, useState, useRef } from "react";
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
    if (process.env.NODE_ENV !== "production") {
      console.error("Widget loader error:", error);
    }
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

  if (process.env.NODE_ENV !== "production") {
    console.log("[Widget Action] Saving widget configuration:", {
      shop,
      widgetText,
      widgetBg,
      widgetColor,
    });
  }

  try {
    await upsertShop(shop, {
      widgetText,
      widgetBg,
      widgetColor,
    });

    // Verify the save by reading back from database
    const verifyShop = await getShop(shop);
    if (process.env.NODE_ENV !== "production") {
      console.log("[Widget Action] Widget configuration saved and verified:", {
        widget_text: verifyShop?.widget_text,
        widget_bg: verifyShop?.widget_bg,
        widget_color: verifyShop?.widget_color,
      });
    }

    return json({ 
      success: true,
      savedValues: {
        widget_text: verifyShop?.widget_text,
        widget_bg: verifyShop?.widget_bg,
        widget_color: verifyShop?.widget_color,
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[Widget Action] Error saving widget configuration:", error);
    }
    return json({ 
      success: false, 
        error: error instanceof Error ? error.message : "Error saving configuration"
    });
  }
};

export default function Widget() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();

  const shop = (loaderData as any).shop || null;
  const error = (loaderData as any).error || null;

  // Initialize state from shop data on mount
  const [widgetText, setWidgetText] = useState(() => shop?.widget_text || "Try It On Now ✨");
  const [widgetBg, setWidgetBg] = useState(() => shop?.widget_bg || "#000000");
  const [widgetColor, setWidgetColor] = useState(() => shop?.widget_color || "#ffffff");
  
  // State for controlling notification visibility
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(false);

  // Only update from shop data on initial load, not after saves
  // This prevents the loader from overwriting user edits
  const [isInitialized, setIsInitialized] = useState(false);
  useEffect(() => {
    if (shop && !isInitialized) {
      setWidgetText(shop.widget_text || "Try It On Now ✨");
      setWidgetBg(shop.widget_bg || "#000000");
      setWidgetColor(shop.widget_color || "#ffffff");
      setIsInitialized(true);
    }
  }, [shop, isInitialized]);

  // Update local state immediately when save is successful (from action response)
  // This ensures the UI reflects the saved values right away
  const previousSuccessRef = useRef<string | null>(null);
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.savedValues) {
      // Create a unique key for this save operation
      const saveKey = `${fetcher.data.savedValues.widget_text}-${fetcher.data.savedValues.widget_bg}-${fetcher.data.savedValues.widget_color}`;
      
      // Only update if this is a new save (different from previous)
      if (previousSuccessRef.current !== saveKey) {
        // Update state immediately from the saved values
        setWidgetText(fetcher.data.savedValues.widget_text || "Try It On Now ✨");
        setWidgetBg(fetcher.data.savedValues.widget_bg || "#000000");
        setWidgetColor(fetcher.data.savedValues.widget_color || "#ffffff");
        
        previousSuccessRef.current = saveKey;
        
        // Show success banner
        setShowSuccessBanner(true);
        
        // Auto-dismiss success banner after 5 seconds
        const timer = setTimeout(() => {
          setShowSuccessBanner(false);
        }, 5000);
        
        // Silently revalidate in the background without affecting the UI
        setTimeout(() => {
          revalidator.revalidate();
        }, 200);
        
        return () => clearTimeout(timer);
      }
    }
    
    // Show error banner if there's an error
    if ((fetcher.data as any)?.error) {
      setShowErrorBanner(true);
      // Auto-dismiss error banner after 7 seconds
      const timer = setTimeout(() => {
        setShowErrorBanner(false);
      }, 7000);
      return () => clearTimeout(timer);
    }
    
    // Reset the ref when starting a new submission
    if (fetcher.state === "submitting") {
      previousSuccessRef.current = null;
      setShowSuccessBanner(false);
      setShowErrorBanner(false);
    }
  }, [fetcher.data?.success, fetcher.data?.savedValues, fetcher.state, revalidator]);

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Prevent multiple simultaneous submissions
    if (fetcher.state === "submitting" || fetcher.state === "loading") {
      return;
    }
    
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

        <div style={{ marginBottom: "var(--spacing-lg)" }}>
          <Banner tone="info" title="Important: Theme App Extension Required">
            <Text as="p" variant="bodyMd">
              Don't forget to install the theme app extension on your product pages! 
              Go to your theme editor and add an "Apps" section to your product template. 
              Otherwise, the widget will not appear on your product pages.
            </Text>
          </Banner>
        </div>

        {error && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner tone="critical" title="Error">
              {error}
            </Banner>
          </div>
        )}

        {fetcher.data?.success && fetcher.state === "idle" && showSuccessBanner && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner 
              tone="success"
              onDismiss={() => {
                setShowSuccessBanner(false);
              }}
            >
              Configuration saved successfully! Changes are now in the database and will be automatically loaded by the widget on your product pages. Refresh a product page to see the changes.
              {fetcher.data?.savedValues && (
                <div style={{ marginTop: "8px", fontSize: "12px" }}>
                  Saved values: text="{fetcher.data.savedValues.widget_text}", bg="{fetcher.data.savedValues.widget_bg}", color="{fetcher.data.savedValues.widget_color}"
                </div>
              )}
            </Banner>
          </div>
        )}

        {(fetcher.data as any)?.error && showErrorBanner && (
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <Banner 
              tone="critical"
              onDismiss={() => {
                setShowErrorBanner(false);
              }}
            >
              Error: {(fetcher.data as any).error}
            </Banner>
          </div>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <div>
                  <Text as="h2" variant="headingLg" fontWeight="semibold">
                    Widget Settings
                  </Text>
                </div>

                <Divider />

                <form onSubmit={handleSave}>
                  <BlockStack gap="500">
                    <TextField
                      label="Button Text"
                      name="widgetText"
                      value={widgetText}
                      onChange={setWidgetText}
                      autoComplete="off"
                      helpText="The text displayed on the widget button"
                    />

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="medium">
                        Background Color
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
                        Text Color
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
                      Save Configuration
                    </Button>
                  </BlockStack>
                </form>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">
                    Real-time Preview
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Here is a preview of your widget as it will appear on your product pages. Changes are applied in real-time.
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
                          disabled
                          style={{
                            width: "100%",
                            padding: "14px 24px",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "16px",
                            fontWeight: 600,
                            cursor: "default",
                            transition: "opacity 0.2s",
                            backgroundColor: widgetBg || "#000000",
                            color: widgetColor || "#ffffff",
                          }}
                        >
                          {widgetText || "Try It On Now ✨"}
                        </button>
                      </div>
                    </div>
                  </Card>
                </BlockStack>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">
                    Current Values in Database
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    <strong>Text:</strong> {shop?.widget_text || "Not defined"}
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    <strong>Background Color:</strong> {shop?.widget_bg || "Not defined"}
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    <strong>Text Color:</strong> {shop?.widget_color || "Not defined"}
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
