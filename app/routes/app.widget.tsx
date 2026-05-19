import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import {
  Page,
  Text,
  Button,
  TextField,
  BlockStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { AdminPage } from "../components/AdminPage";
import { AdminNotifications } from "../components/AdminNotifications";
import { useAdminNotifications, useNotificationSync } from "../hooks/useAdminNotifications";
import { useFetcherNotifications } from "../hooks/useFetcherNotifications";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop } from "../lib/services/db.service";
import {
  getAppEmbedActivationUrl,
  getThemeEditorAppEmbedsUrl,
} from "../lib/theme-editor-url.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  try {
    const shopData = await getShop(shop);
    return json({
      shop: shopData || null,
      themeEditorAppEmbedsUrl: getThemeEditorAppEmbedsUrl(shop),
      themeEditorActivateUrl: getAppEmbedActivationUrl(shop, apiKey, "vton-widget"),
    });
  } catch (error) {
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

  try {
    await upsertShop(shop, { widgetText, widgetBg, widgetColor });
    const verifyShop = await getShop(shop);
    return json({
      success: true,
      savedValues: {
        widget_text: verifyShop?.widget_text,
        widget_bg: verifyShop?.widget_bg,
        widget_color: verifyShop?.widget_color,
      },
    });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Error saving configuration",
    });
  }
};

export default function Widget() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shop = loaderData.shop ?? null;
  const themeEditorAppEmbedsUrl =
    "themeEditorAppEmbedsUrl" in loaderData ? loaderData.themeEditorAppEmbedsUrl : "";
  const themeEditorActivateUrl =
    "themeEditorActivateUrl" in loaderData ? loaderData.themeEditorActivateUrl : "";
  const error = "error" in loaderData ? loaderData.error : null;

  const notifications = useAdminNotifications();
  const { notifications: items, dismiss } = notifications;

  const [widgetText, setWidgetText] = useState(() => shop?.widget_text || "Try It On Now ✨");
  const [widgetBg, setWidgetBg] = useState(() => shop?.widget_bg || "#000000");
  const [widgetColor, setWidgetColor] = useState(() => shop?.widget_color || "#ffffff");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (shop && !isInitialized) {
      setWidgetText(shop.widget_text || "Try It On Now ✨");
      setWidgetBg(shop.widget_bg || "#000000");
      setWidgetColor(shop.widget_color || "#ffffff");
      setIsInitialized(true);
    }
  }, [shop, isInitialized]);

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data.savedValues) {
      setWidgetText(fetcher.data.savedValues.widget_text || "Try It On Now ✨");
      setWidgetBg(fetcher.data.savedValues.widget_bg || "#000000");
      setWidgetColor(fetcher.data.savedValues.widget_color || "#ffffff");
    }
  }, [fetcher.data?.success, fetcher.data?.savedValues]);

  useFetcherNotifications(fetcher, notifications, {
    onSuccess: () => ({
      title: "Widget saved",
      message: "Refresh a product page on your store to see the new button style.",
    }),
    onError: (data) => ({
      title: "Could not save",
      message: String((data as { error?: string }).error ?? "Unknown error"),
    }),
  });

  const staticNotifications = useMemo(
    () => [
      {
        id: "widget-theme-setup",
        show: true,
        tone: "info" as const,
        priority: 10,
        title: "Activer le widget sur votre thème",
        message: (
          <>
            Boutique en ligne → <strong>Thèmes → Personnaliser</strong> → icône{" "}
            <strong>Intégrations d&apos;applications</strong> (barre de gauche, pas « Ajouter un
            bloc »). Activez <strong>Virtual Try-On</strong> sous l&apos;app Virtual Try-On, puis
            enregistrez.
          </>
        ),
        persistDismiss: true,
        autoHideMs: false as const,
        action: themeEditorActivateUrl
          ? {
              label: "Activer Virtual Try-On",
              onAction: () => window.open(themeEditorActivateUrl, "_top"),
            }
          : undefined,
      },
      {
        id: "widget-loader-error",
        show: Boolean(error),
        tone: "critical" as const,
        priority: 1,
        title: "Could not load settings",
        message: error,
      },
    ],
    [error, themeEditorActivateUrl],
  );

  useNotificationSync(staticNotifications, notifications);

  const getLuminance = (hex: string): number => {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    const [r, g, b] = rgb.map((val) => {
      val = val / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const hexToRgb = (hex: string): [number, number, number] | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
      : null;
  };

  const getContrastTextColor = (bgColor: string, textColor: string): string => {
    const bgLuminance = getLuminance(bgColor);
    const textLuminance = getLuminance(textColor);
    const contrast =
      (Math.max(bgLuminance, textLuminance) + 0.05) /
      (Math.min(bgLuminance, textLuminance) + 0.05);
    if (contrast < 4.5) {
      return bgLuminance > 0.5 ? "#000000" : "#ffffff";
    }
    return textColor;
  };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (fetcher.state === "submitting" || fetcher.state === "loading") return;
    fetcher.submit(new FormData(e.currentTarget), { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Widget - VTON Magic" />
      <div className="app-container">
        <AdminPage
          title="Widget"
          subtitle="Customize the try-on button on your product pages"
        >
          <AdminNotifications items={items} onDismiss={dismiss} />

          {(themeEditorActivateUrl || themeEditorAppEmbedsUrl) && (
            <div className="vton-panel" style={{ marginBottom: 16 }}>
              <h2 className="vton-panel-title">Installation sur le thème</h2>
              <p className="vton-field-hint" style={{ marginBottom: 12 }}>
                Le widget n&apos;apparaît pas via « Ajouter un bloc ». Utilisez les intégrations
                d&apos;applications dans l&apos;éditeur de thème.
              </p>
              <BlockStack gap="200">
                {themeEditorActivateUrl ? (
                  <Button
                    variant="primary"
                    onClick={() => window.open(themeEditorActivateUrl, "_top")}
                  >
                    Activer Virtual Try-On
                  </Button>
                ) : null}
                {themeEditorAppEmbedsUrl ? (
                  <Button onClick={() => window.open(themeEditorAppEmbedsUrl, "_top")}>
                    Ouvrir Intégrations d&apos;applications
                  </Button>
                ) : null}
              </BlockStack>
            </div>
          )}

          <div className="vton-preview-wrap">
            <div className="vton-preview-card">
              <p className="vton-preview-label">Live preview</p>
              <button
                type="button"
                className="vton-preview-button"
                disabled
                style={{
                  backgroundColor: widgetBg || "#000000",
                  color: getContrastTextColor(
                    widgetBg || "#000000",
                    widgetColor || "#ffffff",
                  ),
                }}
              >
                {widgetText || "Try It On Now ✨"}
              </button>
            </div>

            <div className="vton-panel">
              <h2 className="vton-panel-title" style={{ marginBottom: 16 }}>
                Button style
              </h2>
              <form onSubmit={handleSave}>
                <BlockStack gap="400">
                  <TextField
                    label="Button text"
                    name="widgetText"
                    value={widgetText}
                    onChange={setWidgetText}
                    autoComplete="off"
                    helpText="Text shown on the try-on button"
                  />

                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      Background color
                    </Text>
                    <div className="vton-color-row">
                      <input
                        type="color"
                        value={widgetBg}
                        onChange={(e) => setWidgetBg(e.target.value)}
                        aria-label="Background color picker"
                      />
                      <div className="vton-color-field">
                        <TextField
                          label="Hex code"
                          name="widgetBg"
                          value={widgetBg}
                          onChange={setWidgetBg}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  </BlockStack>

                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      Text color
                    </Text>
                    <div className="vton-color-row">
                      <input
                        type="color"
                        value={widgetColor}
                        onChange={(e) => setWidgetColor(e.target.value)}
                        aria-label="Text color picker"
                      />
                      <div className="vton-color-field">
                        <TextField
                          label="Hex code"
                          name="widgetColor"
                          value={widgetColor}
                          onChange={setWidgetColor}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  </BlockStack>

                  <Button submit variant="primary" loading={fetcher.state === "submitting"}>
                    Save changes
                  </Button>
                </BlockStack>
              </form>
              <p className="vton-field-hint" style={{ marginTop: 16 }}>
                Saved: {shop?.widget_text || "—"} · {shop?.widget_bg || "—"} ·{" "}
                {shop?.widget_color || "—"}
              </p>
            </div>
          </div>
        </AdminPage>
      </div>
    </Page>
  );
}
