import { query, getShop, upsertShop } from "./services/db.service";
import { creditsForPlan } from "./plan-credits";
import { DEMO_SHOP_DOMAIN, DEMO_SHOP_PLAN } from "./demo-shops.shared";

export { DEMO_SHOP_DOMAIN, DEMO_SHOP_PLAN } from "./demo-shops.shared";
export { isDemoShop } from "./demo-shops.shared";

export function demoShopGenerations(): number {
  return creditsForPlan(DEMO_SHOP_PLAN);
}

/** Ensures the demo shop always has Studio quota in the database. */
export async function ensureDemoShopAccess(shopDomain: string): Promise<void> {
  if (shopDomain !== DEMO_SHOP_DOMAIN) {
    return;
  }

  const generations = demoShopGenerations();
  const shop = await getShop(shopDomain);
  const needsUpdate =
    !shop ||
    shop.plan_name !== DEMO_SHOP_PLAN ||
    (shop.monthly_quota ?? 0) < generations ||
    (shop.credits ?? 0) < generations;

  if (!needsUpdate) {
    return;
  }

  await upsertShop(shopDomain, {
    credits: generations,
    monthlyQuota: generations,
  });

  try {
    await query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_name TEXT`);
    await query(`UPDATE shops SET plan_name = $1 WHERE domain = $2`, [
      DEMO_SHOP_PLAN,
      shopDomain,
    ]);
  } catch {
    // plan_name column update skipped
  }
}
