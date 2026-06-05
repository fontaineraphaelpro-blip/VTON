import type { StorefrontHealth } from "../lib/storefront-health.server";

type Props = {
  health: StorefrontHealth;
};

export function WidgetVerificationPanel({ health }: Props) {
  const failed = health.checks.filter((c) => !c.passed);

  return (
    <div className="vton-panel vton-widget-verify">
      <h2 className="vton-panel-title">Storefront verification</h2>
      <p className="vton-field-hint" style={{ marginBottom: 12 }}>
        Automatic checks to ensure the try-on button works on every product page —
        including complex themes, custom domains, and multi-language URLs. Score:{" "}
        <strong>{health.scorePercent}%</strong> ({health.checks.filter((c) => c.passed).length}/
        {health.checks.length} passed).
      </p>

      <ul className="vton-widget-verify__list">
        {health.checks.map((check) => (
          <li
            key={check.id}
            className={
              check.passed
                ? "vton-widget-verify__item vton-widget-verify__item--ok"
                : "vton-widget-verify__item vton-widget-verify__item--fail"
            }
          >
            <span className="vton-widget-verify__mark">{check.passed ? "✓" : "✗"}</span>
            <span>
              {check.label}
              {check.detail ? (
                <span className="vton-widget-verify__detail"> — {check.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {health.testProductUrl ? (
        <p className="vton-field-hint" style={{ marginTop: 12 }}>
          Manual test: open a product page, upload a photo, and run a full try-on. Add{" "}
          <code>?vton_debug=1</code> to the URL, then run{" "}
          <code>__VTON_SELF_CHECK()</code> in the browser console (button visible is not enough).
          {" "}
          <a href={health.testProductUrl} target="_blank" rel="noopener noreferrer">
            Open test product →
          </a>
        </p>
      ) : null}

      {failed.length === 0 ? (
        <p className="vton-widget-verify__ok-msg">
          All checks passed — widget should appear on any product page without theme setup.
        </p>
      ) : null}
    </div>
  );
}
