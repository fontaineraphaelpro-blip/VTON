/** Monthly try-on quota per Shopify billing plan (must match Plans page copy). */
export const PLAN_MONTHLY_CREDITS: Record<string, number> = {
  "free-installation-setup": 4,
  starter: 100,
  pro: 400,
  studio: 2000,
};

export function creditsForPlan(planId: string | null | undefined): number {
  if (!planId) {
    return PLAN_MONTHLY_CREDITS["free-installation-setup"];
  }
  return PLAN_MONTHLY_CREDITS[planId] ?? PLAN_MONTHLY_CREDITS["free-installation-setup"];
}
