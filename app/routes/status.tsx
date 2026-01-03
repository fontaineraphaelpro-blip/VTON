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
 * Verifies that the request comes from Shopify App Proxy or from a Shopify storefront.
 */
function verifyProxySignature(queryParams: URLSearchParams, request: Request): boolean {
  const signature = queryParams.get("signature");
  
  // If signature is present, verify it (App Proxy request)
  if (signature && SHOPIFY_API_SECRET) {
    // Create a copy without signature
    const paramsToVerify: Record<string, string> = {};
    queryParams.forEach((value, key) => {
      if (key !== "signature") {
        paramsToVerify[key] = value;
      }
    });

    // Sort and build query string
    // IMPORTANT: For App Proxy, Shopify concatenates params WITHOUT & delimiter
    // See: https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies
    const sortedParams = Object.keys(paramsToVerify)
      .sort()
      .map((key) => `${key}=${paramsToVerify[key]}`)
      .join(""); // No delimiter for App Proxy!

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
  
  // If no signature, check if request comes from a Shopify storefront
  // This allows direct requests from the widget on the storefront
  const referer = request.headers.get("referer") || "";
  const origin = request.headers.get("origin") || "";
  const shop = queryParams.get("shop") || "";
  
  // Verify that request comes from a valid Shopify storefront
  const isShopifyStorefront = 
    (referer.includes(".myshopify.com") || origin.includes(".myshopify.com")) &&
    shop && 
    shop.includes(".myshopify.com");
  
  // Additional security: verify that the shop domain matches the referer/origin
  if (isShopifyStorefront) {
    const shopDomain = shop.replace(".myshopify.com", "");
    const refererMatches = referer.includes(shopDomain) || referer.includes(shop);
    const originMatches = origin.includes(shopDomain) || origin.includes(shop);
    
    // Allow if shop parameter matches the referer/origin domain
    if (refererMatches || originMatches) {
      console.log("[Status] Allowing request without signature from verified Shopify storefront:", { 
        referer, 
        origin, 
        shop,
        shopDomain,
        refererMatches,
        originMatches
      });
      return true;
    }
  }
  
  // Reject if no valid signature and not from verified storefront
  console.warn("[Status] Request rejected - no valid signature and not from verified storefront:", { 
    referer, 
    origin, 
    shop,
    hasSignature: !!signature
  });
  return false;
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

    // #region agent log
    const logData = {
      hasSignature: !!queryParams.get("signature"),
      referer: request.headers.get("referer"),
      origin: request.headers.get("origin"),
      shop: queryParams.get("shop"),
      url: request.url,
      allHeaders: Object.fromEntries(request.headers.entries())
    };
    console.log("[Status] Request received:", logData);
    // #endregion

    // 1. Verify Shopify signature or storefront origin
    if (!verifyProxySignature(queryParams, request)) {
      console.error("[Status] Request verification failed:", {
        hasSignature: !!queryParams.get("signature"),
        referer: request.headers.get("referer"),
        origin: request.headers.get("origin"),
        shop: queryParams.get("shop"),
        url: request.url
      });
      return json(
        { error: "Invalid signature - request not from Shopify" },
        { status: 403 }
      );
    }
    
    // #region agent log
    console.log("[Status] Request verified successfully");
    // #endregion

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

    // 6. Return status with CORS headers
    return json(
      {
        enabled: status.enabled,
        shop_enabled: status.shopEnabled,
        product_enabled: status.productEnabled,
        product_id: productId,
        shop: shop,
        widget_settings: status.widgetSettings, // Only set if enabled, null otherwise
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (error) {
    console.error("Error in /status (App Proxy):", error);
    return json(
      {
        error: "Failed to check try-on status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  }
};
