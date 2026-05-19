/** Monthly usage thresholds for admin credit alerts. */
export const CREDITS_WARNING_USAGE_PERCENT = 80;

export type CreditsAlertLevel = "ok" | "warning" | "critical";

export type CreditsAlertState = {
  level: CreditsAlertLevel;
  usagePercent: number | null;
  creditsRemaining: number;
  monthlyUsage: number;
  monthlyQuota: number | null;
  isQuotaExhausted: boolean;
  isCreditsExhausted: boolean;
  title: string;
  message: string;
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

  const isCreditsExhausted = creditsRemaining <= 0;
  const isQuotaExhausted =
    monthlyQuota != null && monthlyUsage >= monthlyQuota;

  const creditsWarningThreshold =
    monthlyQuota != null
      ? Math.max(1, Math.ceil(monthlyQuota * (1 - CREDITS_WARNING_USAGE_PERCENT / 100)))
      : 2;

  const isCreditsLow =
    creditsRemaining > 0 && creditsRemaining <= creditsWarningThreshold;

  const isQuotaWarning =
    usagePercent != null &&
    usagePercent >= CREDITS_WARNING_USAGE_PERCENT &&
    !isQuotaExhausted;

  if (isCreditsExhausted || isQuotaExhausted) {
    const title = isQuotaExhausted
      ? "Monthly try-on limit reached"
      : "No credits left";
    const message = isQuotaExhausted
      ? `You've used all ${monthlyQuota?.toLocaleString("en-US")} try-ons this billing cycle. New virtual try-ons are paused — upgrade before your next Meta or ad campaign.`
      : "Shoppers can't start new try-ons. Add credits or upgrade your plan to avoid losing conversions during traffic peaks.";

    return {
      level: "critical",
      usagePercent,
      creditsRemaining,
      monthlyUsage,
      monthlyQuota,
      isQuotaExhausted,
      isCreditsExhausted,
      title,
      message,
    };
  }

  if (isQuotaWarning || isCreditsLow) {
    const title = "Credits running low";
    let message: string;
    if (usagePercent != null && monthlyQuota != null) {
      message = `${usagePercent}% of your monthly quota used (${monthlyUsage.toLocaleString("en-US")} / ${monthlyQuota.toLocaleString("en-US")} try-ons). You have ${creditsRemaining.toLocaleString("en-US")} credit${creditsRemaining === 1 ? "" : "s"} left — upgrade now to avoid try-on stopping mid-campaign.`;
    } else {
      message = `Only ${creditsRemaining.toLocaleString("en-US")} credit${creditsRemaining === 1 ? "" : "s"} remaining. Upgrade before your next campaign so try-on stays live.`;
    }

    return {
      level: "warning",
      usagePercent,
      creditsRemaining,
      monthlyUsage,
      monthlyQuota,
      isQuotaExhausted: false,
      isCreditsExhausted: false,
      title,
      message,
    };
  }

  return {
    level: "ok",
    usagePercent,
    creditsRemaining,
    monthlyUsage,
    monthlyQuota,
    isQuotaExhausted: false,
    isCreditsExhausted: false,
    title: "",
    message: "",
  };
}
