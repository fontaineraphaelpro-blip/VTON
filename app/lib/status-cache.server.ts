/** In-memory cache for GET /apps/tryon/status (storefront hot path) */

const STATUS_CACHE_MS = 60_000;
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

export const STATUS_HTTP_CACHE =
  "public, max-age=60, stale-while-revalidate=300";
