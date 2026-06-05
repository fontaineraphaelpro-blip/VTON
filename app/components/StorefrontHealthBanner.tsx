import { Form, useNavigation } from "@remix-run/react";
import type { StorefrontHealth } from "../lib/storefront-health.server";

type Props = {
  health: StorefrontHealth;
};

export function StorefrontHealthBanner({ health }: Props) {
  if (health.level === "ok") {
    return null;
  }

  const navigation = useNavigation();
  const isRepairing =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "repair-storefront";

  const isCritical = health.level === "critical";
  const className = [
    "vton-storefront-health",
    isCritical
      ? "vton-storefront-health--critical"
      : "vton-storefront-health--warning",
  ].join(" ");

  return (
    <div className={className} role="alert">
      <div className="vton-storefront-health__content">
        <p className="vton-storefront-health__title">
          {isCritical
            ? "Customers may not see the try-on button"
            : "Storefront widget needs attention"}
        </p>
        <p className="vton-storefront-health__message">
          {health.issues.join(" ")}
          {health.level !== "critical"
            ? " The button still appears under Add to Cart on product pages, but you should repair now."
            : " Click Repair to fix this automatically — works on all themes, no theme setup required."}
        </p>
      </div>
      <div className="vton-storefront-health__actions">
        {health.canInstallScriptTag ? (
          <Form method="post">
            <input type="hidden" name="intent" value="repair-storefront" />
            <button
              type="submit"
              className="vton-storefront-health__cta"
              disabled={isRepairing}
            >
              {isRepairing ? "Repairing…" : "Repair widget"}
            </button>
          </Form>
        ) : null}
        {health.testProductUrl ? (
          <a
            href={`${health.testProductUrl}${health.testProductUrl.includes("?") ? "&" : "?"}vton_debug=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="vton-storefront-health__link"
          >
            Test on storefront
          </a>
        ) : null}
      </div>
    </div>
  );
}
