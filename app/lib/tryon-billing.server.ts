import { upsertShop } from "./services/db.service";

/**
 * Charge exactly one try-on credit after a successful Replicate generation.
 * Failed generations must never call this.
 */
export async function chargeTryonCreditOnSuccess(
  shop: string,
  shopSnapshot: { monthly_quota_used?: number | null } | null
): Promise<void> {
  const previousQuotaUsed = shopSnapshot?.monthly_quota_used ?? 0;
  await upsertShop(shop, {
    addCredits: -1,
    incrementTotalTryons: true,
    monthly_quota_used: previousQuotaUsed + 1,
  });
}
