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
import { upsertShop } from "../lib/services/db.service";
import {
  verifyShopifyProxySignature,
  isShopifyStorefrontRequest,
} from "../lib/proxy-verify.server";

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
    const shopParam = queryParams.get("shop");
    const hasValidSignature = verifyShopifyProxySignature(
      queryParams,
      SHOPIFY_API_SECRET
    );

    if (!hasValidSignature && !isShopifyStorefrontRequest(request, shopParam)) {
      const origin = request.headers.get("origin");
      const corsHeaders = getCorsHeaders(origin);
      return json(
        { error: "Invalid signature - request not from Shopify" },
        { status: 403, headers: corsHeaders }
      );
    }

    // Extract shop
    const shop = extractShopFromProxy(queryParams);
    if (!shop) {
      const origin = request.headers.get("origin");
      const corsHeaders = getCorsHeaders(origin);
      return json({ error: "Shop parameter missing" }, { status: 400, headers: corsHeaders });
    }

    // Increment add to cart counter
    await upsertShop(shop, { incrementTotalAtc: true });
    
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

