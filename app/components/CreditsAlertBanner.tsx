import { Link } from "@remix-run/react";
import type { CreditsAlertState } from "../lib/credits-alert";

type Props = {
  alert: CreditsAlertState;
  variant?: "global" | "inline";
};

export function CreditsAlertBanner({ alert, variant = "inline" }: Props) {
  if (alert.level === "ok") {
    return null;
  }

  const isCritical = alert.level === "critical";
  const className = [
    "vton-credits-alert",
    isCritical ? "vton-credits-alert--critical" : "vton-credits-alert--warning",
    variant === "global" ? "vton-credits-alert--global" : "",
  ]
    .filter(Boolean)
    .join(" ");

    return (
    <div className={className} role="alert">
      <div className="vton-credits-alert__content">
        <p className="vton-credits-alert__title">{alert.title}</p>
        <p className="vton-credits-alert__message">{alert.message}</p>
        {alert.usagePercent != null && alert.monthlyQuota != null ? (
          <div className="vton-credits-alert__meter" aria-hidden="true">
            <D
              className="vton-credits-alert__meter-fill"
              style={{ width: `${alert.usagePercent}%` }}
            />
          </div>
        ) : null}
      </div>
      <div className="vton-credits-alert__actions">
        <Link to="/app/credits" className="vton-credits-alert__cta">
          {isCritical ? "Upgrade now" : "View plans"}
        </Link>
      </div>
    </div>
  );
}
