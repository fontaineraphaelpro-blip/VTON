/**
 * GET /apps/tryon/status — storefront widget enablement check
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getProductTryonStatus } from "../lib/services/db.service";
import { storefrontCorsHeaders } from "../lib/proxy-verify.server";
import {
  authorizeInstalledShopWidgetRequest,
  extractShopFromStorefrontQuery,
} from "../lib/storefront-api-auth.server";
import { normalizeProductGid } from "../lib/product-id.server";
import {
  buildStatusCacheKey,
  getCachedStatusPayload,
  setCachedStatusPayload,
  STATUS_HTTP_CACHE,
} from "../lib/status-cache.server";
import { resolveAbBucket, type AbBucket } from "../lib/ab-test.server";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    const headers = storefrontCorsHeaders(request);
    headers.set("Access-Control-Max-Age", "86400");
    return new Response(null, { status: 204, headers });
  }

  try {
    const url = new URL(request.url);
    const queryParams = url.searchParams;
    const authorized = await authorizeInstalledShopWidgetRequest(
      request,
      queryParams,
      SHOPIFY_API_SECRET
    );

    const shop = extractShopFromStorefrontQuery(queryParams);

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

    if (!productId && productHandle) {
      productId = productHandle;
    }

    if (!productId) {
      return json({ error: "product_id parameter required" }, { status: 400 });
    }

    try {
      const decoded = decodeURIComponent(productId);
      if (decoded !== productId) productId = decoded;
    } catch {
      // keep original
    }

    productId = normalizeProductGid(productId);

    const visitorId = queryParams.get("visitor_id") || "";

    const cacheKey =
      buildStatusCacheKey(shop, productId, productHandle) +
      `|ab:${visitorId || "anon"}`;
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

    let enabled = status.enabled;
    let abBucket: AbBucket | null = null;

    if (status.abTestEnabled && visitorId) {
      abBucket = resolveAbBucket(shop, visitorId, status.abTestPercent);
      if (abBucket === "control") {
        enabled = false;
      }
    }

    const headers = storefrontCorsHeaders(request);
    headers.set("Cache-Control", STATUS_HTTP_CACHE);

    const payload = {
      enabled,
      shop_enabled: status.shopEnabled,
      product_enabled: status.productEnabled,
      product_id: productId,
      shop,
      garment_image_url: status.tryonImageUrl,
      ab_test_enabled: status.abTestEnabled,
      ab_test_percent: status.abTestPercent,
      ab_bucket: abBucket,
      widget_settings: enabled ? status.widgetSettings : null,
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
