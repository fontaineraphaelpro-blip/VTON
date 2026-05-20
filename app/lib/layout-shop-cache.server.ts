import { getShop, getMonthlyTryonUsage } from "./services/db.service";
import { computeCreditsAlert, type CreditsAlertState } from "./credits-alert";

type LayoutShopContext = {
  creditsAlert: CreditsAlertState;
};

const CACHE_TTL_MS = 20_000;
const cache = new Map<string, { expires: number; value: LayoutShopContext }>();

export async function getLayoutShopContext(shop: string): Promise<LayoutShopContext> {
  const now = Date.now();
  const hit = cache.get(shop);
  if (hit && hit.expires > now) {
    return hit.value;
  }

  const shopData = await getShop(shop);
  const monthlyUsage = await getMonthlyTryonUsage(shop).catch(() => 0);
  const value: LayoutShopContext = {
    creditsAlert: computeCreditsAlert({
      credits: shopData?.credits ?? 0,
      monthlyUsage,
      monthlyQuota: shopData?.monthly_quota ?? null,
    }),
  };

  cache.set(shop, { expires: now + CACHE_TTL_MS, value });
  return value;
}

export function invalidateLayoutShopContext(shop: string) {
  cache.delete(shop);
}
