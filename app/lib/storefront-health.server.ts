import { getShop, upsertShop } from "./services/db.service";
import {
  ensureStorefrontWidgetScriptTag,
  hasStorefrontWidgetScriptTag,
  sessionCanInstallScriptTag,
} from "./storefront-widget-install.server";
import { getFirstActiveProductStorefrontUrl } from "./onboarding.server";
import {
  getWidgetStaticVerificationReport,
  pingStorefrontStatusApi,
  type WidgetVerificationCheck,
} from "./widget-hardening-checklist.server";

type AdminGraphql = Parameters<typeof hasStorefrontWidgetScriptTag>[0];

export type StorefrontHealthLevel = "ok" | "warning" | "critical";

export type StorefrontHealth = {
  level: StorefrontHealthLevel;
  scriptTagInstalled: boolean;
  shopEnabled: boolean;
  canInstallScriptTag: boolean;
  apiReachable: boolean;
  appUrlConfigured: boolean;
  issues: string[];
  checks: WidgetVerificationCheck[];
  scorePercent: number;
  testProductUrl: string | null;
};

function levelFromIssues(
  issues: string[],
  hasCritical: boolean
): StorefrontHealthLevel {
  if (hasCritical || issues.some((i) => i.toLowerCase().includes("critical"))) {
    return "critical";
  }
  if (issues.length > 0) return "warning";
  return "ok";
}

export async function getStorefrontHealth(
  shop: string,
  admin: AdminGraphql,
  scope: string | undefined
): Promise<StorefrontHealth> {
  const shopData = await getShop(shop);
  const canInstallScriptTag = sessionCanInstallScriptTag(scope);
  const scriptTagInstalled = canInstallScriptTag
    ? await hasStorefrontWidgetScriptTag(admin).catch(() => false)
    : false;
  const shopEnabled = shopData?.is_enabled !== false;
  const appUrlConfigured = Boolean(
    (process.env.SHOPIFY_APP_URL || "").trim()
  );

  const [staticReport, apiPing, testProductUrl] = await Promise.all([
    getWidgetStaticVerificationReport().catch(() => ({
      checks: [],
      passed: 0,
      total: 0,
      scorePercent: 0,
    })),
    pingStorefrontStatusApi(shop),
    getFirstActiveProductStorefrontUrl(admin, shop),
  ]);

  const checks: WidgetVerificationCheck[] = [
    {
      id: "shop_enabled",
      label: "Try-on enabled in app",
      passed: shopEnabled,
      detail: shopEnabled ? undefined : "Disabled in dashboard settings",
    },
    {
      id: "script_tag",
      label: "Auto-install script on storefront",
      passed: !canInstallScriptTag || scriptTagInstalled,
      detail: scriptTagInstalled
        ? undefined
        : "ScriptTag missing — click Repair widget",
    },
    {
      id: "script_scope",
      label: "ScriptTag install permission",
      passed: canInstallScriptTag,
      detail: canInstallScriptTag ? undefined : "Reinstall app required",
    },
    {
      id: "app_url",
      label: "Backend URL configured",
      passed: appUrlConfigured,
      detail: appUrlConfigured ? undefined : "SHOPIFY_APP_URL missing on server",
    },
    {
      id: "status_api",
      label: "Status API reachable",
      passed: apiPing.ok,
      detail: apiPing.detail,
    },
    ...staticReport.checks,
  ];

  const issues: string[] = [];
  let hasCritical = false;

  if (!shopEnabled) {
    issues.push("Try-on is turned off in your app settings.");
    hasCritical = true;
  }
  if (!canInstallScriptTag) {
    issues.push("The app is missing permission to auto-install the storefront widget.");
    hasCritical = true;
  } else if (!scriptTagInstalled) {
    issues.push("The auto-install script was not detected on your store.");
  }
  if (!appUrlConfigured) {
    issues.push("Server app URL is not configured.");
    hasCritical = true;
  }
  if (!apiPing.ok) {
    issues.push(`Storefront API check failed: ${apiPing.detail}`);
  }

  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;
  const scorePercent = total ? Math.round((passed / total) * 100) : 0;

  const level = levelFromIssues(issues, hasCritical);

  return {
    level,
    scriptTagInstalled,
    shopEnabled,
    canInstallScriptTag,
    apiReachable: apiPing.ok,
    appUrlConfigured,
    issues,
    checks,
    scorePercent,
    testProductUrl,
  };
}

export async function repairStorefrontWidget(
  shop: string,
  admin: AdminGraphql,
  scope: string | undefined
): Promise<{ ok: boolean; scriptTagInstalled: boolean; error?: string }> {
  if (!sessionCanInstallScriptTag(scope)) {
    return {
      ok: false,
      scriptTagInstalled: false,
      error: "Missing write_script_tags scope — reinstall the app.",
    };
  }

  try {
    await upsertShop(shop, { isEnabled: true });
    const result = await ensureStorefrontWidgetScriptTag(admin);
    const scriptTagInstalled = result.installed === true;
    return {
      ok: scriptTagInstalled,
      scriptTagInstalled,
      error: scriptTagInstalled ? undefined : result.skipped,
    };
  } catch (error) {
    return {
      ok: false,
      scriptTagInstalled: false,
      error: error instanceof Error ? error.message : "Repair failed",
    };
  }
}
