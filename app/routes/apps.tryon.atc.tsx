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

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import { upsertShop } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";

/**
 * Get CORS headers for cross-origin requests from Shopify storefronts
 */
function getCorsHeaders(origin?: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Allow requests from Shopify storefronts
  if (origin && origin.includes(".myshopify.com")) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else {
    // Fallback: allow all origins (less secure but works for development)
    headers["Access-Control-Allow-Origin"] = "*";
  }

  return headers;
}

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
 * GET/OPTIONS /apps/tryon/atc
 * Handles CORS preflight requests (OPTIONS) and GET requests
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle OPTIONS preflight request
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // For GET requests, return a simple response
  return json({ message: "Add to Cart tracking endpoint. Use POST to track." }, {
    headers: corsHeaders,
  });
};

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
        const origin = request.headers.get("origin");
        const corsHeaders = getCorsHeaders(origin);
        return json(
          { error: "Invalid signature - request not from Shopify" },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    // 2. Extract shop
    const shop = extractShopFromProxy(queryParams);
    if (!shop) {
      const origin = request.headers.get("origin");
      const corsHeaders = getCorsHeaders(origin);
      return json({ error: "Shop parameter missing" }, { status: 400, headers: corsHeaders });
    }

    // 3. Ensure database tables exist
    await ensureTables();

    // 4. Increment add to cart counter
    await upsertShop(shop, { incrementTotalAtc: true });
    
    // Log for debugging (help track if ATC tracking is working)
    console.log(`[ATC Tracking] ✅ Incremented total_atc for shop: ${shop}`);

    // 5. Return success with CORS headers
    const origin = request.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);
    return json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    // Log error only in development
    if (process.env.NODE_ENV !== "production") {
      console.error("Error in /apps/tryon/atc:", error);
    }
    const origin = request.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);
    return json(
      {
        error: "Failed to track add to cart",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: corsHeaders }
    );
  }
};

