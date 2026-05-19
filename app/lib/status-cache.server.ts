/** In-memory cache for GET /apps/tryon/status (storefront hot path) */

import { productIdVariants } from "./product-id.server";

const STATUS_CACHE_MS = 5_000;
const statusCache = new Map<string, { expires: number; payload: Record<string, unknown> }>();

export function buildStatusCacheKey(
  shop: string,
  productId: string,
  productHandle: string | null
) {
  return `${shop}|${productId}|${productHandle || ""}`;
}

export function getCachedStatusPayload(cacheKey: string) {
  const entry = statusCache.get(cacheKey);
  if (!entry || entry.expires <= Date.now()) {
    if (entry) statusCache.delete(cacheKey);
    return null;
  }
  return entry.payload;
}

export function setCachedStatusPayload(
  cacheKey: string,
  payload: Record<string, unknown>
) {
  statusCache.set(cacheKey, {
    expires: Date.now() + STATUS_CACHE_MS,
    payload,
  });
  if (statusCache.size > 5000) {
    const now = Date.now();
    for (const [key, entry] of statusCache) {
      if (entry.expires < now) statusCache.delete(key);
    }
  }
}

/** Call when shop or product try-on settings change in admin */
export function invalidateStatusCacheForShop(shop: string) {
  const prefix = `${shop}|`;
  for (const key of statusCache.keys()) {
    if (key.startsWith(prefix)) {
      statusCache.delete(key);
    }
  }
}

/** Invalidate status cache for every product_id format variant */
export function invalidateStatusCacheForProduct(
  shop: string,
  productId: string,
  productHandle: string | null
) {
  const variants = new Set(productIdVariants(productId));
  const gidMatch = productId.match(/^gid:\/\/shopify\/Product\/(\d+)$/i);
  if (gidMatch) {
    variants.add(`gid://shopify/Product/${gidMatch[1]}`);
  } else if (/^\d+$/.test(productId)) {
    variants.add(`gid://shopify/Product/${productId}`);
  }

  for (const id of variants) {
    statusCache.delete(buildStatusCacheKey(shop, id, productHandle));
    statusCache.delete(buildStatusCacheKey(shop, id, ""));
    statusCache.delete(buildStatusCacheKey(shop, id, productHandle || ""));
  }
  if (productHandle) {
    for (const id of variants) {
      statusCache.delete(buildStatusCacheKey(shop, id, productHandle));
    }
  }
}

export const STATUS_HTTP_CACHE =
  "private, no-cache, no-store, must-revalidate";
