/**
 * GET /apps/tryon/status — storefront widget enablement check
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  getProductTryonStatus,
  getShop,
} from "../lib/services/db.service";
import {
  isAuthorizedStorefrontApiRequest,
  storefrontCorsHeaders,
} from "../lib/proxy-verify.server";
import {
  buildStatusCacheKey,
  getCachedStatusPayload,
  setCachedStatusPayload,
  STATUS_HTTP_CACHE,
} from "../lib/status-cache.server";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";

function extractShopFromProxy(queryParams: URLSearchParams): string {
  let shop = queryParams.get("shop") || "";
  if (shop && !shop.endsWith(".myshopify.com")) {
    shop = `${shop}.myshopify.com`;
  }
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    const headers = storefrontCorsHeaders(request);
    headers.set("Access-Control-Max-Age", "86400");
    return new Response(null, { status: 204, headers });
  }

  try {
    const url = new URL(request.url);
    const queryParams = url.searchParams;
    const shopParam = queryParams.get("shop");

    let authorized = isAuthorizedStorefrontApiRequest(
      request,
      queryParams,
      SHOPIFY_API_SECRET
    );

    const shop = extractShopFromProxy(queryParams);

    // Last resort: installed shop + product_id (widget same-origin fetch without proxy params)
    if (!authorized && shop && queryParams.get("product_id")) {
      const shopRecord = await getShop(shop);
      if (shopRecord) {
        authorized = true;
      }
    }

    if (!authorized) {
      return json(
        { error: "Invalid signature - request not from Shopify" },
        { status: 403, headers: storefrontCorsHeaders(request) }
      );
    }

    if (!shop) {
      return json({ error: "Shop parameter missing" }, { status: 400 });
    }

    let productId = queryParams.get("product_id");
    const productHandle = queryParams.get("product_handle");

    if (!productId) {
      return json({ error: "product_id parameter required" }, { status: 400 });
    }

    try {
      const decoded = decodeURIComponent(productId);
      if (decoded !== productId) productId = decoded;
    } catch {
      // keep original
    }

    const cacheKey = buildStatusCacheKey(shop, productId, productHandle);
    const cachedPayload = getCachedStatusPayload(cacheKey);
    if (cachedPayload) {
      const headers = storefrontCorsHeaders(request);
      headers.set("Cache-Control", STATUS_HTTP_CACHE);
      return json(cachedPayload, { headers });
    }

    const status = await getProductTryonStatus(
      shop,
      productId,
      productHandle || undefined
    );

    const headers = storefrontCorsHeaders(request);
    headers.set("Cache-Control", STATUS_HTTP_CACHE);

    const payload = {
      enabled: status.enabled,
      shop_enabled: status.shopEnabled,
      product_enabled: status.productEnabled,
      product_id: productId,
      shop,
      widget_settings: status.widgetSettings,
    };

    setCachedStatusPayload(cacheKey, payload);

    return json(payload, { headers });
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
