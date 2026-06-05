import { getShop, upsertShop } from "./services/db.service";
import {
  ensureStorefrontWidgetScriptTag,
  hasStorefrontWidgetScriptTag,
  sessionCanInstallScriptTag,
} from "./storefront-widget-install.server";
import { getFirstActiveProductStorefrontUrl } from "./onboarding.server";

type AdminGraphql = Parameters<typeof hasStorefrontWidgetScriptTag>[0];

export type StorefrontHealthLevel = "ok" | "warning" | "critical";

export type StorefrontHealth = {
  level: StorefrontHealthLevel;
  scriptTagInstalled: boolean;
  shopEnabled: boolean;
  canInstallScriptTag: boolean;
  issues: string[];
  testProductUrl: string | null;
};

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

  const issues: string[] = [];
  let level: StorefrontHealthLevel = "ok";

  if (!shopEnabled) {
    issues.push("Try-on is turned off in your app settings.");
    level = "critical";
  }

  if (!canInstallScriptTag) {
    issues.push("The app is missing permission to auto-install the storefront widget.");
    level = "critical";
  } else if (!scriptTagInstalled) {
    issues.push("The auto-install script was not detected on your store.");
    level = level === "critical" ? "critical" : "warning";
  }

  let testProductUrl: string | null = null;
  if (level !== "ok") {
    testProductUrl = await getFirstActiveProductStorefrontUrl(admin, shop);
  }

  return {
    level,
    scriptTagInstalled,
    shopEnabled,
    canInstallScriptTag,
    issues,
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
