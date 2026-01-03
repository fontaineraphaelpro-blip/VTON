/**
 * ==========================================
 * APP PROXY - STATUS ENDPOINT (App Proxy route)
 * ==========================================
 * 
 * Route: GET /status (via Shopify App Proxy)
 * This route handles requests from Shopify App Proxy which strips the /apps/tryon prefix.
 * 
 * Shopify App Proxy configuration:
 * - prefix: "apps"
 * - subpath: "tryon"
 * 
 * So requests to https://store.myshopify.com/apps/tryon/status
 * are proxied to this app as GET /status
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import {
  getProductTryonStatus,
} from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";

/**
 * Verifies that the request comes from Shopify App Proxy.
 */
function verifyProxySignature(queryParams: URLSearchParams): boolean {
  const signature = queryParams.get("signature");
  if (!signature || !SHOPIFY_API_SECRET) {
    return false;
  }

  // Create a copy without signature
  const paramsToVerify: Record<string, string> = {};
  queryParams.forEach((value, key) => {
    if (key !== "signature") {
      paramsToVerify[key] = value;
    }
  });

  // Sort and build query string
  const sortedParams = Object.keys(paramsToVerify)
    .sort()
    .map((key) => `${key}=${paramsToVerify[key]}`)
    .join("&");

  // Calculate HMAC
  const computedSignature = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(sortedParams)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(computedSignature)
  );
}

/**
 * Extracts shop domain from Shopify parameters.
 */
function extractShopFromProxy(queryParams: URLSearchParams): string {
  let shop = queryParams.get("shop") || "";
  if (shop && !shop.endsWith(".myshopify.com")) {
    shop = `${shop}.myshopify.com`;
  }
  return shop;
}

/**
 * GET /status (via App Proxy)
 * 
 * Query parameters (added by Shopify App Proxy):
 * - shop: Shop domain (required)
 * - product_id: Shopify product ID (required)
 * - signature: HMAC signature (required)
 * - path_prefix: /apps/tryon (added by Shopify)
 * 
 * Returns:
 * - enabled: boolean - Whether try-on is enabled for this product
 * - shop_enabled: boolean - Whether try-on is enabled at shop level
 * - widget_settings: Object with widget configuration (text, colors, etc.)
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const url = new URL(request.url);
    const queryParams = url.searchParams;

    // 1. Verify Shopify signature (CRITICAL for security)
    if (!verifyProxySignature(queryParams)) {
      return json(
        { error: "Invalid signature - request not from Shopify" },
        { status: 403 }
      );
    }

    // 2. Extract shop
    const shop = extractShopFromProxy(queryParams);
    if (!shop) {
      return json({ error: "Shop parameter missing" }, { status: 400 });
    }

    // 3. Get product_id from query params
    const productId = queryParams.get("product_id");
    if (!productId) {
      return json({ error: "product_id parameter required" }, { status: 400 });
    }

    // 4. Ensure database tables exist
    await ensureTables();

    // 5. Get comprehensive try-on status (shop + product level)
    const status = await getProductTryonStatus(shop, productId);

    // 6. Return status
    return json({
      enabled: status.enabled,
      shop_enabled: status.shopEnabled,
      product_enabled: status.productEnabled,
      product_id: productId,
      shop: shop,
      widget_settings: status.widgetSettings, // Only set if enabled, null otherwise
    });
  } catch (error) {
    console.error("Error in /status (App Proxy):", error);
    return json(
      {
        error: "Failed to check try-on status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
};

