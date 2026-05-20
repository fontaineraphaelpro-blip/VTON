/** Monthly usage thresholds for generation quota alerts. */
export const CREDITS_WARNING_USAGE_PERCENT = 80;

export type CreditsAlertLevel = "ok" | "warning" | "critical";

export type CreditsAlertState = {
  level: CreditsAlertLevel;
  title: string;
  message: string;
  creditsRemaining: number;
  monthlyUsage: number;
  monthlyQuota: number | null;
  usagePercent: number | null;
  isCreditsExhausted: boolean;
  isQuotaExhausted: boolean;
};

export function computeCreditsAlert(params: {
  credits: number;
  monthlyUsage: number;
  monthlyQuota: number | null | undefined;
}): CreditsAlertState {
  const creditsRemaining = Math.max(0, Math.floor(params.credits ?? 0));
  const monthlyUsage = Math.max(0, Math.floor(params.monthlyUsage ?? 0));
  const monthlyQuota =
    params.monthlyQuota != null && params.monthlyQuota > 0
      ? Math.floor(params.monthlyQuota)
      : null;

  const usagePercent =
    monthlyQuota != null
      ? Math.min(100, Math.round((monthlyUsage / monthlyQuota) * 100))
      : null;

  const isQuotaExhausted =
    monthlyQuota != null && monthlyUsage >= monthlyQuota;
  const isCreditsExhausted = creditsRemaining <= 0;

  const creditsWarningThreshold =
    monthlyQuota != null
      ? Math.max(1, Math.ceil(monthlyQuota * (1 - CREDITS_WARNING_USAGE_PERCENT / 100)))
      : 0;

  const isCreditsLow =
    creditsRemaining > 0 && creditsRemaining <= creditsWarningThreshold;

  const isQuotaWarning =
    usagePercent != null &&
    usagePercent >= CREDITS_WARNING_USAGE_PERCENT &&
    !isQuotaExhausted;

  if (isCreditsExhausted || isQuotaExhausted) {
    const title = isQuotaExhausted
      ? "Monthly generation limit reached"
      : "No generations left";
    const message = isQuotaExhausted
      ? `You've used all ${monthlyQuota?.toLocaleString("en-US")} generations this billing cycle. New virtual try-ons are paused — upgrade your plan before your next sales push.`
      : "Shoppers can't start new try-ons. Upgrade your plan to keep generations available during traffic peaks.";

    return {
      level: "critical",
      title,
      message,
      creditsRemaining,
      monthlyUsage,
      monthlyQuota,
      usagePercent,
      isCreditsExhausted,
      isQuotaExhausted,
    };
  }

  if (isQuotaWarning || isCreditsLow) {
    const title = "Generations running low";
    let message: string;
    if (usagePercent != null && monthlyQuota != null) {
      message = `${usagePercent}% of your monthly quota used (${monthlyUsage.toLocaleString("en-US")} / ${monthlyQuota.toLocaleString("en-US")} generations). You have ${creditsRemaining.toLocaleString("en-US")} generation${creditsRemaining === 1 ? "" : "s"} left — upgrade now to avoid try-on stopping mid-campaign.`;
    } else {
      message = `Only ${creditsRemaining.toLocaleString("en-US")} generation${creditsRemaining === 1 ? "" : "s"} remaining. Upgrade before your next campaign so try-on stays live.`;
    }

    return {
      level: "warning",
      title,
      message,
      creditsRemaining,
      monthlyUsage,
      monthlyQuota,
      usagePercent,
      isCreditsExhausted: false,
      isQuotaExhausted: false,
    };
  }

  return {
    level: "ok",
    title: "",
    message: "",
    creditsRemaining,
    monthlyUsage,
    monthlyQuota,
    usagePercent,
    isCreditsExhausted: false,
    isQuotaExhausted: false,
  };
}
