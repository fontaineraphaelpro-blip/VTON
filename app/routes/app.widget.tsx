import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import {
  Page,
  Button,
  TextField,
  BlockStack,
  Checkbox,
  RangeSlider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { AdminPage } from "../components/AdminPage";
import {
  WidgetColorField,
  WidgetColorPairings,
  normalizeHexColor,
  BG_PRESETS,
  TEXT_PRESETS,
} from "../components/WidgetColorField";
import { AdminNotifications } from "../components/AdminNotifications";
import { useAdminNotifications, useNotificationSync } from "../hooks/useAdminNotifications";
import { useFetcherNotifications } from "../hooks/useFetcherNotifications";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop, getAbTestStats } from "../lib/services/db.service";
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
    const abStats = shopData ? await getAbTestStats(shop).catch(() => null) : null;
    return json({
      shop: shopData || null,
      abStats,
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

  const intent = formData.get("intent");

  if (intent === "save-ab-test") {
    const abTestEnabled = formData.get("abTestEnabled") === "true";
    const abTestPercent = Math.min(
      100,
      Math.max(0, parseInt(String(formData.get("abTestPercent") || "50"), 10) || 50)
    );
    try {
      await upsertShop(shop, { abTestEnabled, abTestPercent });
      const verifyShop = await getShop(shop);
      const abStats = await getAbTestStats(shop);
      return json({ success: true, abStats, shop: verifyShop });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : "Error saving A/B test",
      });
    }
  }

  if (intent === "save-widget-style") {
    const widgetText =
      String(formData.get("widgetText") ?? "").trim() || "Try it on";
    const widgetBg = normalizeHexColor(
      String(formData.get("widgetBg") ?? "#000000"),
      "#000000"
    );
    const widgetColor = normalizeHexColor(
      String(formData.get("widgetColor") ?? "#ffffff"),
      "#ffffff"
    );

    try {
      await upsertShop(shop, { widgetText, widgetBg, widgetColor });
      const verifyShop = await getShop(shop);
      return json({
        success: true,
        intent: "save-widget-style",
        shop: verifyShop,
        savedValues: {
          widget_text: verifyShop?.widget_text,
          widget_bg: verifyShop?.widget_bg,
          widget_color: verifyShop?.widget_color,
        },
      });
    } catch (error) {
      return json({
        success: false,
        intent: "save-widget-style",
        error: error instanceof Error ? error.message : "Error saving configuration",
      });
    }
  }

  return json({ success: false, error: "Unknown action" });
};

type AbStats = {
  tryon: { impression: number; tryon: number; atc: number };
  control: { impression: number; tryon: number; atc: number };
};

const EMPTY_AB_STATS: AbStats = {
  tryon: { impression: 0, tryon: 0, atc: 0 },
  control: { impression: 0, tryon: 0, atc: 0 },
};

export default function Widget() {
  const loaderData = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const fetcher = useFetcher<typeof action>();
  const abFetcher = useFetcher<typeof action>();
  const shop = loaderData.shop ?? null;
  const themeEditorAppEmbedsUrl =
    "themeEditorAppEmbedsUrl" in loaderData ? loaderData.themeEditorAppEmbedsUrl : "";
  const themeEditorActivateUrl =
    "themeEditorActivateUrl" in loaderData ? loaderData.themeEditorActivateUrl : "";
  const loaderAbStats =
    "abStats" in loaderData && loaderData.abStats
      ? (loaderData.abStats as AbStats)
      : EMPTY_AB_STATS;
  const error = "error" in loaderData ? loaderData.error : null;

  const [abStats, setAbStats] = useState<AbStats>(loaderAbStats);
  const [abTestEnabled, setAbTestEnabled] = useState(
    () => shop?.ab_test_enabled === true
  );
  const [abTestPercent, setAbTestPercent] = useState(() => {
    const p = shop?.ab_test_percent;
    return typeof p === "number" ? p : parseInt(String(p ?? 50), 10) || 50;
  });

  const notifications = useAdminNotifications();
  const { notifications: items, dismiss } = notifications;

  const [widgetText, setWidgetText] = useState(() => shop?.widget_text || "Try it on");
  const [widgetBg, setWidgetBg] = useState(() => shop?.widget_bg || "#000000");
  const [widgetColor, setWidgetColor] = useState(() => shop?.widget_color || "#ffffff");
  const [savedSnapshot, setSavedSnapshot] = useState({
    widget_text: shop?.widget_text ?? "—",
    widget_bg: shop?.widget_bg ?? "—",
    widget_color: shop?.widget_color ?? "—",
  });
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (shop && !isInitialized) {
      setWidgetText(shop.widget_text || "Try it on");
      setWidgetBg(shop.widget_bg || "#000000");
      setWidgetColor(shop.widget_color || "#ffffff");
      setSavedSnapshot({
        widget_text: shop.widget_text || "—",
        widget_bg: shop.widget_bg || "—",
        widget_color: shop.widget_color || "—",
      });
      setIsInitialized(true);
    }
  }, [shop, isInitialized]);

  useEffect(() => {
    const data = fetcher.data;
    if (!data?.success || data.intent !== "save-widget-style" || !data.savedValues) {
      return;
    }
    setWidgetText(data.savedValues.widget_text || "Try it on");
    setWidgetBg(data.savedValues.widget_bg || "#000000");
    setWidgetColor(data.savedValues.widget_color || "#ffffff");
    setSavedSnapshot({
      widget_text: data.savedValues.widget_text || "—",
      widget_bg: data.savedValues.widget_bg || "—",
      widget_color: data.savedValues.widget_color || "—",
    });
    revalidator.revalidate();
  }, [fetcher.data, revalidator]);

  useFetcherNotifications(fetcher, notifications, {
    onSuccess: (data) => {
      const payload = data as { intent?: string; abStats?: AbStats };
      if (payload.abStats || payload.intent !== "save-widget-style") return null;
      return {
        title: "Widget saved",
        message: "Refresh a product page on your store to see the new button style.",
      };
    },
    onError: (data) => ({
      title: "Could not save",
      message: String((data as { error?: string }).error ?? "Unknown error"),
    }),
  });

  useFetcherNotifications(abFetcher, notifications, {
    onSuccess: () => ({
      title: "A/B test saved",
      message:
        "Traffic split is live. Stats update as visitors view products and add to cart.",
    }),
    onError: (data) => ({
      title: "Could not save A/B test",
      message: String((data as { error?: string }).error ?? "Unknown error"),
    }),
  });

  useEffect(() => {
    const data = abFetcher.data;
    if (!data?.success) return;
    if (data.abStats) {
      setAbStats(data.abStats as AbStats);
    }
    const savedShop = data.shop;
    if (savedShop) {
      setAbTestEnabled(savedShop.ab_test_enabled === true);
      const p = savedShop.ab_test_percent;
      setAbTestPercent(
        typeof p === "number" ? p : parseInt(String(p ?? 50), 10) || 50
      );
    }
  }, [abFetcher.data]);

  const staticNotifications = useMemo(
    () => [
      {
        id: "widget-theme-setup",
        show: true,
        tone: "info" as const,
        priority: 10,
        title: "Try-on button on product pages",
        message: (
          <>
            The button installs automatically. Disable it per product in{" "}
            <strong>Products</strong>. Theme embed is optional for custom placement.
          </>
        ),
        persistDismiss: true,
        autoHideMs: false as const,
        action: themeEditorActivateUrl
          ? {
              label: "Theme options (optional)",
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

    const fd = new FormData();
    fd.set("intent", "save-widget-style");
    fd.set("widgetText", widgetText.trim() || "Try it on");
    fd.set("widgetBg", normalizeHexColor(widgetBg, "#000000"));
    fd.set("widgetColor", normalizeHexColor(widgetColor, "#ffffff"));
    fetcher.submit(fd, { method: "post" });
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

          <div className="vton-ab-panel">
            <h2 className="vton-panel-title">A/B test: try-on vs no try-on</h2>
            <p className="vton-field-hint" style={{ marginBottom: 12 }}>
              Split traffic to measure impact on add-to-cart. Included on your plan — no extra fee.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                abFetcher.submit(fd, { method: "post" });
              }}
            >
              <input type="hidden" name="intent" value="save-ab-test" />
              <BlockStack gap="400">
                <Checkbox
                  label="Enable A/B test on the storefront"
                  checked={abTestEnabled}
                  onChange={setAbTestEnabled}
                />
                <input
                  type="hidden"
                  name="abTestEnabled"
                  value={abTestEnabled ? "true" : "false"}
                />
                <RangeSlider
                  label={`Show try-on to ${abTestPercent}% of visitors`}
                  value={abTestPercent}
                  min={10}
                  max={90}
                  step={5}
                  onChange={setAbTestPercent}
                  output
                  disabled={!abTestEnabled}
                />
                <input type="hidden" name="abTestPercent" value={String(abTestPercent)} />
                <Button submit loading={abFetcher.state === "submitting"}>
                  Save A/B settings
                </Button>
                {abTestEnabled ? (
                  <p className="vton-field-hint">
                    Each visitor is assigned once to try-on or control. Control visitors
                    see the normal product page (no try-on button). Compare add-to-cart
                    rates below after a few days of traffic.
                  </p>
                ) : null}
              </BlockStack>
            </form>
            {abTestEnabled && (
              <div className="vton-ab-stats">
                <p className="vton-field-hint" style={{ marginBottom: 10 }}>
                  Last 30 days · refreshes after you save or reload this page
                </p>
                <div className="vton-ab-stat-card">
                  <h4>With try-on ({abTestPercent}%)</h4>
                  <ul>
                    <li>Page views: {abStats.tryon.impression.toLocaleString("en-US")}</li>
                    <li>Try-ons: {abStats.tryon.tryon.toLocaleString("en-US")}</li>
                    <li>Add to cart: {abStats.tryon.atc.toLocaleString("en-US")}</li>
                    <li>
                      ATC rate:{" "}
                      {abStats.tryon.tryon > 0
                        ? `${((abStats.tryon.atc / abStats.tryon.tryon) * 100).toFixed(1)}%`
                        : "—"}
                    </li>
                  </ul>
                </div>
                <div className="vton-ab-stat-card">
                  <h4>Without try-on ({100 - abTestPercent}%)</h4>
                  <ul>
                    <li>Page views: {abStats.control.impression.toLocaleString("en-US")}</li>
                    <li>Add to cart: {abStats.control.atc.toLocaleString("en-US")}</li>
                    <li>
                      ATC rate:{" "}
                      {abStats.control.impression > 0
                        ? `${((abStats.control.atc / abStats.control.impression) * 100).toFixed(1)}%`
                        : "—"}
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {(themeEditorActivateUrl || themeEditorAppEmbedsUrl) && (
            <div className="vton-panel" style={{ marginBottom: 16 }}>
              <h2 className="vton-panel-title">Theme setup (optional)</h2>
              <p className="vton-field-hint" style={{ marginBottom: 12 }}>
                The try-on button is added automatically on all product pages. To turn it off for a
                single product, go to <strong>Products</strong>. Use the buttons below only if you
                want to adjust placement in your theme.
              </p>
              <BlockStack gap="200">
                {themeEditorActivateUrl ? (
                  <Button
                    variant="primary"
                    onClick={() => window.open(themeEditorActivateUrl, "_top")}
                  >
                    Activate Virtual Try-On embed
                  </Button>
                ) : null}
                {themeEditorAppEmbedsUrl ? (
                  <Button onClick={() => window.open(themeEditorAppEmbedsUrl, "_top")}>
                    Open app embeds
                  </Button>
                ) : null}
              </BlockStack>
            </div>
          )}

          <div className="vton-preview-wrap vton-widget-style">
            <div className="vton-preview-card vton-widget-style__preview">
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
                {widgetText || "Try it on"}
              </button>
            </div>

            <div className="vton-panel vton-widget-style__panel">
              <h2 className="vton-panel-title vton-widget-style__title">
                Button style
              </h2>
              <form onSubmit={handleSave} className="vton-widget-style__form">
                <input type="hidden" name="intent" value="save-widget-style" />
                <input type="hidden" name="widgetBg" value={widgetBg} readOnly />
                <input type="hidden" name="widgetColor" value={widgetColor} readOnly />
                <BlockStack gap="400">
                  <TextField
                    label="Button text"
                    name="widgetText"
                    value={widgetText}
                    onChange={setWidgetText}
                    autoComplete="off"
                    helpText="Text shown on the try-on button"
                  />

                  <div className="vton-widget-colors">
                    <WidgetColorPairings
                      currentBg={widgetBg}
                      currentText={widgetColor}
                      onApply={(bg, text) => {
                        setWidgetBg(bg);
                        setWidgetColor(text);
                      }}
                    />

                    <div className="vton-widget-colors__fields">
                      <WidgetColorField
                        label="Background"
                        hint="Button fill on your product pages"
                        value={widgetBg}
                        onChange={setWidgetBg}
                        presets={BG_PRESETS}
                      />
                      <WidgetColorField
                        label="Text"
                        hint="Label on the try-on button"
                        value={widgetColor}
                        onChange={setWidgetColor}
                        presets={TEXT_PRESETS}
                      />
                    </div>
                  </div>
                  <div className="vton-widget-style__actions">
                    <Button
                      submit
                      variant="primary"
                      loading={fetcher.state === "submitting"}
                      fullWidth
                    >
                      Save changes
                    </Button>
                  </div>
                </BlockStack>
              </form>
              <p className="vton-field-hint vton-widget-style__saved">
                Saved: {savedSnapshot.widget_text} · {savedSnapshot.widget_bg} ·{" "}
                {savedSnapshot.widget_color}
              </p>
            </div>
          </div>
        </AdminPage>
      </div>
    </Page>
  );
}
