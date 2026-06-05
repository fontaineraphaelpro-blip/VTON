#!/usr/bin/env node
/**
 * Static verification — ensures storefront widget hardening patterns are present.
 * Run: npm run verify:widget
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const widgetPath = path.join(
  __dirname,
  "..",
  "extensions",
  "vton-widget",
  "assets",
  "vton-widget.js"
);

/** @type {{ id: string; label: string; pattern: RegExp; required: boolean }[]} */
const CHECKS = [
  {
    id: "atc_placement",
    label: "Place widget directly after Add to Cart button",
    pattern: /accept\(atcBtn,\s*'after',\s*'form_atc_button'\)/,
    required: true,
  },
  {
    id: "no_always_floating",
    label: "No forced floating button mode",
    pattern: /VTON_ALWAYS_FLOATING/,
    required: false,
    invert: true,
  },
  {
    id: "optimistic_render",
    label: "Show widget before API status",
    pattern: /queueWidgetRender\([^)]*buildOptimisticStatus/,
    required: true,
  },
  {
    id: "legacy_neutralize",
    label: "Neutralize legacy competitor widgets",
    pattern: /function vtonNeutralizeLegacyWidgets/,
    required: true,
  },
  {
    id: "presence_watchdog",
    label: "Infinite reinjection watchdog",
    pattern: /function vtonStartPresenceWatchdog/,
    required: true,
  },
  {
    id: "explicit_disable_only",
    label: "Only suppress on explicit admin disable",
    pattern: /function isExplicitlyDisabledStatus/,
    required: true,
  },
  {
    id: "transient_status",
    label: "Treat API failures as transient",
    pattern: /function isTransientStatusFailure/,
    required: true,
  },
  {
    id: "shop_scrape",
    label: "Scrape shop domain on custom domains",
    pattern: /function vtonScrapeShopFromDom/,
    required: true,
  },
  {
    id: "dual_api_fetch",
    label: "Proxy + direct API fallback (all endpoints)",
    pattern: /function vtonBuildStorefrontApiUrls/,
    required: true,
  },
  {
    id: "generate_prepare",
    label: "Resolve shop + garment image before generate",
    pattern: /function vtonPrepareGeneration/,
    required: true,
  },
  {
    id: "product_json_fallback",
    label: "Shopify product.json garment fallback",
    pattern: /vtonFetchProductJsonByHandle/,
    required: true,
  },
  {
    id: "cors_fetch",
    label: "Cross-origin status fetch (credentials omit)",
    pattern: /credentials:\s*crossOrigin\s*\?\s*'omit'/,
    required: true,
  },
  {
    id: "locale_paths",
    label: "Multi-language product URL detection",
    pattern: /produits\?/,
    required: true,
  },
  {
    id: "spa_navigation",
    label: "SPA / history navigation hook",
    pattern: /function vtonPatchSpaNavigation/,
    required: true,
  },
  {
    id: "visibility_watchdog",
    label: "Force visible styles watchdog",
    pattern: /function vtonStartVisibilityWatchdog/,
    required: true,
  },
  {
    id: "self_check",
    label: "Storefront self-check diagnostic",
    pattern: /function vtonPublishSelfCheck/,
    required: true,
  },
  {
    id: "modal_zindex",
    label: "High z-index for try-on modal overlay",
    pattern: /\.vton-modal-overlay\{[^}]*z-index:2147483646/,
    required: true,
  },
  {
    id: "boot_retries",
    label: "Aggressive boot retry schedule",
    pattern: /30000\]/,
    required: true,
  },
];

const bootPath = path.join(
  __dirname,
  "..",
  "app",
  "routes",
  "storefront.vton-boot[.]js.tsx"
);

const BOOT_CHECKS = [
  {
    id: "boot_locale_paths",
    label: "Boot script supports locale product URLs",
    pattern: /produits\?/,
    required: true,
  },
  {
    id: "boot_shop_scrape",
    label: "Boot script scrapes Shopify.shop from DOM",
    pattern: /Shopify\.shop/,
    required: true,
  },
  {
    id: "boot_handle_fallback",
    label: "Boot uses URL handle when product id missing",
    pattern: /productId = productHandle/,
    required: true,
  },
];

async function runFileChecks(filePath, checks, title) {
  const source = await readFile(filePath, "utf8");
  const results = checks.map((check) => {
    const matched = check.pattern.test(source);
    return {
      ...check,
      passed: check.invert ? !matched : matched,
    };
  });

  console.log(`\n${title}`);
  console.log("-".repeat(title.length));

  let failed = 0;
  for (const r of results) {
    const mark = r.passed ? "PASS" : r.required ? "FAIL" : "WARN";
    console.log(`  [${mark}] ${r.label}`);
    if (!r.passed && r.required) failed++;
  }

  return failed;
}

async function main() {
  let totalFailed = 0;

  try {
    totalFailed += await runFileChecks(
      widgetPath,
      CHECKS,
      "Widget hardening checks (vton-widget.js)"
    );
    totalFailed += await runFileChecks(
      bootPath,
      BOOT_CHECKS,
      "Boot script checks (storefront.vton-boot.js)"
    );
  } catch (error) {
    console.error("Verification error:", error);
    process.exit(1);
  }

  console.log("");
  if (totalFailed > 0) {
    console.error(`Verification FAILED — ${totalFailed} required check(s) missing.`);
    process.exit(1);
  }

  console.log(`Verification PASSED — ${CHECKS.length + BOOT_CHECKS.length} checks OK.`);
}

main();
