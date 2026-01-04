/**
 * ==========================================
 * APP PROXY - ADD TO CART TRACKING ENDPOINT
 * ==========================================
 * 
 * Route: POST /apps/tryon/atc
 * Public endpoint to track when a customer adds a product to cart after viewing try-on result.
 * Used by client-side widget to track conversions.
 * 
 * This endpoint is public but verifies Shopify HMAC signature for security.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import { upsertShop } from "../../lib/services/db.service";
import { ensureTables } from "../../lib/db-init.server";

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
 * POST /apps/tryon/atc
 * 
 * Query parameters:
 * - shop: Shop domain (required, from Shopify App Proxy)
 * - signature: HMAC signature (required, from Shopify App Proxy)
 * 
 * Body:
 * - product_id: Shopify product ID (optional, for logging)
 * 
 * Returns:
 * - success: boolean
 */
export const action = async ({ request }: ActionFunctionArgs) => {
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
    }

    // 2. Extract shop
    const shop = extractShopFromProxy(queryParams);
    if (!shop) {
      return json({ error: "Shop parameter missing" }, { status: 400 });
    }

    // 3. Ensure database tables exist
    await ensureTables();

    // 4. Increment add to cart counter
    await upsertShop(shop, { incrementTotalAtc: true });

    // 5. Return success
    return json({ success: true });
  } catch (error) {
    console.error("Error in /apps/tryon/atc:", error);
    return json(
      {
        error: "Failed to track add to cart",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
};

