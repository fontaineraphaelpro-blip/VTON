import { readFile } from "node:fs/promises";
import path from "node:path";

export type WidgetVerificationCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
};

export type WidgetVerificationReport = {
  checks: WidgetVerificationCheck[];
  passed: number;
  total: number;
  scorePercent: number;
};

const WIDGET_STATIC_CHECKS: { id: string; label: string; pattern: RegExp }[] = [
  {
    id: "atc_placement",
    label: "Widget placed after Add to Cart button",
    pattern: /accept\(atcBtn,\s*'after',\s*'form_atc_button'\)/,
  },
  {
    id: "atc_scoring",
    label: "Best ATC candidate selection",
    pattern: /vtonFindBestAddToCartButton/,
  },
  {
    id: "placement_watchdog",
    label: "ATC placement watchdog",
    pattern: /vtonStartPlacementWatchdog/,
  },
  {
    id: "optimistic_render",
    label: "Instant render before API",
    pattern: /buildOptimisticStatus/,
  },
  {
    id: "presence_watchdog",
    label: "Auto-reinject watchdog",
    pattern: /vtonStartPresenceWatchdog/,
  },
  {
    id: "legacy_cleanup",
    label: "Legacy widget cleanup",
    pattern: /vtonNeutralizeLegacyWidgets/,
  },
  {
    id: "spa_hooks",
    label: "SPA navigation hooks",
    pattern: /vtonPatchSpaNavigation/,
  },
  {
    id: "dual_api",
    label: "Direct API fallback for generate/job",
    pattern: /vtonBuildStorefrontApiUrls/,
  },
  {
    id: "generate_prepare",
    label: "Pre-generate shop/image resolution",
    pattern: /vtonPrepareGeneration/,
  },
];

async function readWidgetSource(): Promise<string> {
  const filePath = path.join(
    process.cwd(),
    "extensions",
    "vton-widget",
    "assets",
    "vton-widget.js"
  );
  return readFile(filePath, "utf8");
}

export async function getWidgetStaticVerificationReport(): Promise<WidgetVerificationReport> {
  const source = await readWidgetSource();
  const checks: WidgetVerificationCheck[] = WIDGET_STATIC_CHECKS.map((c) => ({
    id: c.id,
    label: c.label,
    passed: c.pattern.test(source),
    detail: c.pattern.test(source) ? undefined : "Pattern missing in widget bundle",
  }));

  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;
  return {
    checks,
    passed,
    total,
    scorePercent: total ? Math.round((passed / total) * 100) : 0,
  };
}

export async function pingStorefrontStatusApi(
  shop: string
): Promise<{ ok: boolean; statusCode: number | null; detail: string }> {
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  if (!appUrl) {
    return { ok: false, statusCode: null, detail: "SHOPIFY_APP_URL not configured" };
  }

  try {
    const url = new URL(`${appUrl}/apps/tryon/status`);
    url.searchParams.set("shop", shop);
    url.searchParams.set("product_id", "gid://shopify/Product/1");
    url.searchParams.set("product_handle", "vton-health-check");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    // 200 = healthy; 400 = reachable but missing product (still OK for infra check)
    const ok = response.ok || response.status === 400;
    return {
      ok,
      statusCode: response.status,
      detail: ok
        ? `API reachable (HTTP ${response.status})`
        : `API error HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      detail:
        error instanceof Error ? error.message : "Status API unreachable",
    };
  }
}
