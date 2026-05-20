/** Monthly generation quota per Shopify billing plan (must match Plans page copy). */
export const FREE_PLAN_ID = "free-installation-setup";

export const PLAN_MONTHLY_CREDITS: Record<string, number> = {
  [FREE_PLAN_ID]: 50,
  starter: 300,
  growth: 1000,
  scale: 4000,
  /** Legacy plans — honor existing subscribers until they change plan */
  pro: 400,
  studio: 2000,
};

export const BILLING_PLAN_IDS = [
  FREE_PLAN_ID,
  "starter",
  "growth",
  "scale",
] as const;

export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number];

export function creditsForPlan(planId: string | null | undefined): number {
  const normalized = normalizePlanId(planId);
  if (!normalized) {
    return PLAN_MONTHLY_CREDITS[FREE_PLAN_ID];
  }
  return PLAN_MONTHLY_CREDITS[normalized] ?? PLAN_MONTHLY_CREDITS[FREE_PLAN_ID];
}

/** Map Shopify subscription names and legacy plan ids to internal plan keys. */
export function normalizePlanId(planId: string | null | undefined): string | null {
  if (!planId) {
    return null;
  }
  const key = planId.toLowerCase().replace(/\s+/g, "-");
  if (key in PLAN_MONTHLY_CREDITS) {
    return key;
  }
  return key;
}
