import { creditsForPlan, FREE_PLAN_ID } from "./plan-credits";
import { getShop, query, upsertShop } from "./services/db.service";

/**
 * Ensures every shop has the free plan (50 generations/month) on first use.
 * Safe to call from afterAuth, dashboard, and storefront generate/status routes.
 */
export async function ensureShopFreePlan(
  shopDomain: string,
  options?: { accessToken?: string }
): Promise<void> {
  const freeGenerations = creditsForPlan(FREE_PLAN_ID);
  const existing = await getShop(shopDomain);

  if (!existing) {
    await upsertShop(shopDomain, {
      accessToken: options?.accessToken ?? "",
      credits: freeGenerations,
      monthlyQuota: freeGenerations,
      isEnabled: true,
      widgetText: "Try it on",
      widgetBg: "#000000",
      widgetColor: "#ffffff",
    });
  } else {
    const updates: Parameters<typeof upsertShop>[1] = {};
    const credits = existing.credits;
    const quota = existing.monthly_quota;
    const neverHadQuota = quota == null || quota === undefined;
    const neverHadCredits = credits == null || credits === undefined;

    if (neverHadQuota) {
      updates.monthlyQuota = freeGenerations;
    }
    if (neverHadCredits) {
      updates.credits = freeGenerations;
    } else if (neverHadQuota && (credits ?? 0) <= 0) {
      updates.credits = freeGenerations;
      updates.monthlyQuota = freeGenerations;
    }
    if (options?.accessToken) {
      updates.accessToken = options.accessToken;
    }
    if (Object.keys(updates).length > 0) {
      await upsertShop(shopDomain, updates);
    }
  }

  try {
    await query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_name TEXT`);
    const row = await getShop(shopDomain);
    if (!row?.plan_name) {
      await query(`UPDATE shops SET plan_name = $1 WHERE domain = $2`, [
        FREE_PLAN_ID,
        shopDomain,
      ]);
    }
  } catch {
    // plan_name column optional on older DBs
  }
}
