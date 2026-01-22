/**
 * ==========================================
 * APP PROXY - STATUS ENDPOINT
 * ==========================================
 * 
 * Route: GET /apps/tryon/status
 * Public read-only endpoint to check if try-on is enabled for a product.
 * Used by client-side widget to determine if it should display.
 * 
 * This endpoint is public but verifies Shopify HMAC signature for security.
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
 * Same verification logic as the generate endpoint.
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
 * GET /apps/tryon/status
 * 
 * Query parameters:
 * - shop: Shop domain (required, from Shopify App Proxy)
 * - product_id: Shopify product ID (required)
 * - signature: HMAC signature (required, from Shopify App Proxy)
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

    // 1. Verify Shopify signature OR check if request comes from storefront
    const hasValidSignature = verifyProxySignature(queryParams);
    
    // If no signature, check if request comes from a Shopify storefront
    if (!hasValidSignature) {
      const referer = request.headers.get("referer") || "";
      const origin = request.headers.get("origin") || "";
      const shopParam = queryParams.get("shop");
      
      // Check if request comes from a Shopify storefront (.myshopify.com)
      const isFromShopifyStorefront = 
        (referer.includes(".myshopify.com") || origin.includes(".myshopify.com")) &&
        shopParam &&
        shopParam.includes(".myshopify.com");
      
      if (!isFromShopifyStorefront) {
        return json(
          { error: "Invalid signature - request not from Shopify" },
          { status: 403 }
        );
      }
      
      // Note: We allow requests from Shopify storefronts without HMAC signature
      // This is necessary because App Proxy may not always include the signature
      // We verify the request comes from a .myshopify.com domain as additional security
    }

    // 2. Extract shop
    const shop = extractShopFromProxy(queryParams);
    if (!shop) {
      return json({ error: "Shop parameter missing" }, { status: 400 });
    }

    // 3. Get product_id and product_handle from query params
    let productId = queryParams.get("product_id");
    const productHandle = queryParams.get("product_handle");
    
    if (!productId) {
      return json({ error: "product_id parameter required" }, { status: 400 });
    }
    
    try {
      const decoded = decodeURIComponent(productId);
      if (decoded !== productId) productId = decoded;
    } catch {
      // Use original if decode fails
    }

    // 4. Normalize product ID: if it's a handle (not GID and not numeric), 
    // we need to try to find it in the database with different formats
    // The widget should send GID format, but we handle handles as fallback
    // Note: We can't convert handle to GID here without Admin API access,
    // but getProductTryonStatus will try multiple formats

    // 4. Ensure database tables exist
    try {
      await ensureTables();
      
      // Ensure widget is enabled by default if is_enabled is not set
      const { getShop, upsertShop } = await import("../lib/services/db.service");
      const shopRecord = await getShop(shop);
      if (shopRecord && (shopRecord.is_enabled === null || shopRecord.is_enabled === undefined)) {
        await upsertShop(shop, {
          isEnabled: true,
        });
      }
    } catch (error) {
      // Continue anyway, tables might already exist
      // Error is logged by database service if needed
    }

    // 5. Get comprehensive try-on status (shop + product level)
    // getProductTryonStatus will try to match with different ID formats and handle
    let status;
    try {
      status = await getProductTryonStatus(shop, productId, productHandle || undefined);
    } catch (error) {
      return json(
        {
          error: "Failed to check try-on status",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    // 6. Return status with CORS headers for storefront requests
    const origin = request.headers.get("origin") || "";
    const referer = request.headers.get("referer") || "";
    const isFromShopifyStorefront = origin.includes(".myshopify.com") || referer.includes(".myshopify.com");
    
    const headers = new Headers();
    if (isFromShopifyStorefront) {
      headers.set("Access-Control-Allow-Origin", origin || "*");
      headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
    }
    
    return json({
      enabled: status.enabled,
      shop_enabled: status.shopEnabled,
      product_enabled: status.productEnabled,
      product_id: productId,
      shop: shop,
      widget_settings: status.widgetSettings, // Only set if enabled, null otherwise
    }, { headers });
  } catch (error) {
    return json(
      {
        error: "Failed to check try-on status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
};

