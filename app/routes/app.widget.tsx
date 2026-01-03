import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { useState, useEffect } from "react";
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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:44',message:'Action called',data:{method:request.method},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const intent = formData.get("intent");
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:50',message:'Intent extracted',data:{intent,shop},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion

  if (intent === "update-widget") {
    const updates: any = {};

    const widgetText = formData.get("widgetText") as string;
    const widgetBg = formData.get("widgetBg") as string;
    const widgetColor = formData.get("widgetColor") as string;
    const maxTriesPerUser = formData.get("maxTriesPerUser") as string;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:57',message:'FormData values extracted',data:{widgetText,widgetBg,widgetColor,maxTriesPerUser},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    if (widgetText) {
      updates.widgetText = widgetText;
    }
    if (widgetBg) {
      updates.widgetBg = widgetBg;
    }
    if (widgetColor) {
      updates.widgetColor = widgetColor;
    }
    if (maxTriesPerUser) {
      updates.maxTriesPerUser = parseInt(maxTriesPerUser);
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:72',message:'Before upsertShop',data:{updates,shop},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    await upsertShop(shop, updates);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:74',message:'After upsertShop, returning success',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    return json({ success: true, testMode: false });
  } else if (intent === "test-tryon") {
    const personImage = formData.get("personImage") as string;
    const garmentImage = formData.get("garmentImage") as string;

    if (!personImage || !garmentImage) {
      return json({ success: false, error: "Both images are required", testMode: true });
    }

    try {
      // Convert base64 images to buffers
      // personImage and garmentImage are already base64 data URLs from FileReader
      const personBase64 = personImage.includes(",") ? personImage.split(",")[1] : personImage;
      const garmentBase64 = garmentImage.includes(",") ? garmentImage.split(",")[1] : garmentImage;
      
      const personBuffer = Buffer.from(personBase64, "base64");
      const garmentBuffer = Buffer.from(garmentBase64, "base64");

      // Validate image sizes
      if (personBuffer.length === 0 || garmentBuffer.length === 0) {
        return json({ 
          success: false, 
          error: "Invalid image data",
          testMode: true 
        });
      }

      // Generate try-on using Replicate service
      const { generateTryOn } = await import("../lib/services/replicate.service");
      const resultUrl = await generateTryOn(personBuffer, garmentBuffer, "upper_body");

      return json({ 
        success: true, 
        testMode: true, 
        resultImageUrl: resultUrl 
      });
    } catch (error) {
      console.error("Test try-on error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return json({ 
        success: false, 
        error: `Generation failed: ${errorMessage}`,
        testMode: true 
      });
    }
  }

  return json({ success: false, error: "Invalid action" });
};

export default function Widget() {
  const { shop, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();

  const [widgetText, setWidgetText] = useState(shop?.widget_text || "Try It On Now");
  const [widgetBg, setWidgetBg] = useState(shop?.widget_bg || "#0066FF");
  const [widgetColor, setWidgetColor] = useState(shop?.widget_color || "#FFFFFF");
  const [maxTriesPerUser, setMaxTriesPerUser] = useState(String(shop?.max_tries_per_user || 5));
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:131',message:'Widget component initialized',data:{shop:shop?{widget_text:shop.widget_text,widget_bg:shop.widget_bg,widget_color:shop.widget_color,max_tries_per_user:shop.max_tries_per_user}:null,error,initialState:{widgetText,widgetBg,widgetColor,maxTriesPerUser}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  }, []);
  // #endregion
  const [personImage, setPersonImage] = useState("");
  const [garmentImage, setGarmentImage] = useState("");
  const [personImageFile, setPersonImageFile] = useState<File | null>(null);
  const [garmentImageFile, setGarmentImageFile] = useState<File | null>(null);
  const [personImagePreview, setPersonImagePreview] = useState<string>("");
  const [garmentImagePreview, setGarmentImagePreview] = useState<string>("");

  const handleSaveConfig = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:139',message:'handleSaveConfig called',data:{widgetText,widgetBg,widgetColor,maxTriesPerUser},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const formData = new FormData();
    formData.append("intent", "update-widget");
    formData.append("widgetText", widgetText);
    formData.append("widgetBg", widgetBg);
    formData.append("widgetColor", widgetColor);
    formData.append("maxTriesPerUser", maxTriesPerUser);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:147',message:'Before fetcher.submit',data:{fetcherState:fetcher.state},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    fetcher.submit(formData, { method: "post" });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:149',message:'After fetcher.submit',data:{fetcherState:fetcher.state},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
  };

  const handleFileUpload = (file: File, type: "person" | "garment") => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file");
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (type === "person") {
        setPersonImageFile(file);
        setPersonImagePreview(result);
        setPersonImage(result); // Base64 pour l'envoi
      } else {
        setGarmentImageFile(file);
        setGarmentImagePreview(result);
        setGarmentImage(result); // Base64 pour l'envoi
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent, type: "person" | "garment") => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file, type);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>, type: "person" | "garment") => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file, type);
    }
  };

  const handleTestTryOn = () => {
    if (!personImage || !garmentImage) {
      alert("Please upload both person and garment images");
      return;
    }
    const formData = new FormData();
    formData.append("intent", "test-tryon");
    formData.append("personImage", personImage);
    formData.append("garmentImage", garmentImage);
    fetcher.submit(formData, { method: "post" });
  };

  // Log preview values when they change
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:217',message:'Preview values changed',data:{widgetBg,widgetColor,widgetText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
  }, [widgetBg, widgetColor, widgetText]);

  // Recharger les données après une sauvegarde réussie
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:225',message:'useEffect triggered for revalidator',data:{fetcherSuccess:fetcher.data?.success,fetcherTestMode:fetcher.data?.testMode},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (fetcher.data?.success && !fetcher.data?.testMode) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:228',message:'Calling revalidator.revalidate()',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      setTimeout(() => {
        revalidator.revalidate();
      }, 500);
    }
  }, [fetcher.data?.success, fetcher.data?.testMode, revalidator]);

  return (
    <Page>
      <TitleBar title="Widget Configuration - VTON Magic" />
      <div className="vton-page-container">
        <div className="vton-page-content">
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
              <Text as="h2" variant="headingLg" fontWeight="semibold">
                Widget Configuration
              </Text>
              <Text variant="bodyMd" tone="subdued" as="p">
                Customize the appearance of the Try-On widget
              </Text>
              <Divider />

                <BlockStack gap="400">
                  <TextField
                    label="Button Text"
                    value={widgetText}
                    onChange={(value) => {
                      // #region agent log
                      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:265',message:'widgetText onChange',data:{oldValue:widgetText,newValue:value},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                      // #endregion
                      setWidgetText(value);
                    }}
                    autoComplete="off"
                    helpText="Text displayed on the widget button."
                  />
                  <InlineStack gap="400" align="start">
                    <Box minWidth="200px">
                      <TextField
                        label="Background Color"
                        value={widgetBg}
                        onChange={(value) => {
                          // #region agent log
                          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:276',message:'widgetBg onChange',data:{oldValue:widgetBg,newValue:value},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                          // #endregion
                          setWidgetBg(value);
                        }}
                        autoComplete="off"
                        type="color"
                        helpText="Button background color."
                      />
                    </Box>
                    <Box minWidth="200px">
                      <TextField
                        label="Text Color"
                        value={widgetColor}
                        onChange={(value) => {
                          // #region agent log
                          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:288',message:'widgetColor onChange',data:{oldValue:widgetColor,newValue:value},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                          // #endregion
                          setWidgetColor(value);
                        }}
                        autoComplete="off"
                        type="color"
                        helpText="Button text color."
                      />
                    </Box>
                  </InlineStack>
                  <TextField
                    label="Max try-ons per user/day"
                    value={maxTriesPerUser}
                    onChange={(value) => {
                      // #region agent log
                      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.widget.tsx:300',message:'maxTriesPerUser onChange',data:{oldValue:maxTriesPerUser,newValue:value},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                      // #endregion
                      setMaxTriesPerUser(value);
                    }}
                    type="number"
                    min={1}
                    autoComplete="off"
                    helpText="Limits the number of virtual try-ons per customer per day."
                  />
                  <Button variant="primary" onClick={handleSaveConfig} loading={fetcher.state === "submitting"}>
                    Save Configuration
                  </Button>
                </BlockStack>
              </BlockStack>
            </Card>

          {/* Widget Preview */}
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg" fontWeight="semibold">
                Button Preview
              </Text>
              <Text variant="bodyMd" tone="subdued" as="p">
                Preview what your Try-On button will look like on your store
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
              <Text as="h2" variant="headingLg" fontWeight="semibold">
                Test AI Virtual Try-On
              </Text>
              <Text variant="bodyMd" tone="subdued" as="p">
                Run a test to see the quality of AI generation
              </Text>
                <Divider />
                <InlineStack gap="400" align="start" wrap>
                  {/* Person Image Upload */}
                  <Box minWidth="300px" flex="1">
                    <BlockStack gap="200">
                      <Text variant="bodyMd" fontWeight="medium" as="label">
                        Person Image
                      </Text>
                      <div
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, "person")}
                        style={{
                          border: "2px dashed #c4c4c4",
                          borderRadius: "8px",
                          padding: "32px",
                          textAlign: "center",
                          cursor: "pointer",
                          backgroundColor: personImagePreview ? "transparent" : "#f9f9f9",
                          minHeight: "200px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                        }}
                        onClick={() => document.getElementById("person-image-input")?.click()}
                      >
                        {personImagePreview ? (
                          <>
                            <img
                              src={personImagePreview}
                              alt="Person preview"
                              style={{
                                maxWidth: "100%",
                                maxHeight: "180px",
                                borderRadius: "4px",
                                marginBottom: "8px",
                              }}
                            />
                            <Text variant="bodySm" tone="subdued">
                              Click or drag to replace
                            </Text>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: "14px", marginBottom: "16px", fontWeight: 600 }}>UPLOAD PHOTO</div>
                            <Text variant="bodyMd" fontWeight="medium">
                              Drag & drop or click to upload
                            </Text>
                            <Text variant="bodySm" tone="subdued">
                              Person image for try-on
                            </Text>
                          </>
                        )}
                        <input
                          id="person-image-input"
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => handleFileInputChange(e, "person")}
                        />
                      </div>
                    </BlockStack>
                  </Box>

                  {/* Garment Image Upload */}
                  <Box minWidth="300px" flex="1">
                    <BlockStack gap="200">
                      <Text variant="bodyMd" fontWeight="medium" as="label">
                        Garment Image
                      </Text>
                      <div
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, "garment")}
                        style={{
                          border: "2px dashed #c4c4c4",
                          borderRadius: "8px",
                          padding: "32px",
                          textAlign: "center",
                          cursor: "pointer",
                          backgroundColor: garmentImagePreview ? "transparent" : "#f9f9f9",
                          minHeight: "200px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                        }}
                        onClick={() => document.getElementById("garment-image-input")?.click()}
                      >
                        {garmentImagePreview ? (
                          <>
                            <img
                              src={garmentImagePreview}
                              alt="Garment preview"
                              style={{
                                maxWidth: "100%",
                                maxHeight: "180px",
                                borderRadius: "4px",
                                marginBottom: "8px",
                              }}
                            />
                            <Text variant="bodySm" tone="subdued">
                              Click or drag to replace
                            </Text>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: "14px", marginBottom: "16px", fontWeight: 600 }}>UPLOAD GARMENT</div>
                            <Text variant="bodyMd" fontWeight="medium">
                              Drag & drop or click to upload
                            </Text>
                            <Text variant="bodySm" tone="subdued">
                              Garment image to try on
                            </Text>
                          </>
                        )}
                        <input
                          id="garment-image-input"
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => handleFileInputChange(e, "garment")}
                        />
                      </div>
                    </BlockStack>
                  </Box>
                </InlineStack>
                <Button variant="primary" onClick={handleTestTryOn} loading={fetcher.state === "submitting"}>
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
              <Text as="h2" variant="headingLg" fontWeight="semibold">
                Widget Integration
              </Text>
              <Banner tone="success">
                <Text variant="bodyMd" as="p">
                  <strong>Automatic Installation:</strong> The Try-On widget is automatically installed and will appear on your product pages. No code changes needed!
                </Text>
              </Banner>
              <Text variant="bodyMd" tone="subdued" as="p">
                The widget script is automatically injected via Shopify Script Tags. The button will appear next to the "Add to Cart" button on all product pages.
              </Text>
              <Divider />
              <Text variant="bodySm" tone="subdued" as="p">
                <strong>Manual Installation (Optional):</strong> If you prefer to install manually, add this script to your theme's `theme.liquid` file, just before the `&lt;/body&gt;` tag:
              </Text>
              <InlineCode>
                &lt;script src="{`{ shop.url }`}/apps/tryon/widget-v2.js" defer&gt;&lt;/script&gt;
              </InlineCode>
            </BlockStack>
          </Card>
        </div>
      </div>
    </Page>
  );
}
