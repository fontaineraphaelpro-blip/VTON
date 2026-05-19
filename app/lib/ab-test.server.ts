/** Deterministic A/B bucket assignment for storefront try-on vs control. */

export type AbBucket = "tryon" | "control";

export function resolveAbBucket(
  shop: string,
  visitorId: string,
  tryonPercent: number
): AbBucket {
  const pct = Math.min(100, Math.max(0, Math.round(tryonPercent)));
  if (pct <= 0) return "control";
  if (pct >= 100) return "tryon";

  const key = `${shop}:${visitorId}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const slot = Math.abs(hash) % 100;
  return slot < pct ? "tryon" : "control";
}
