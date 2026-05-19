import { useState, useEffect } from "react";
import { Link } from "@remix-run/react";
import { Button } from "@shopify/polaris";
import type { FetcherWithComponents } from "@remix-run/react";
import type { OnboardingStepId, OnboardingState } from "../lib/onboarding.server";

const STEP_COPY: Record<
  OnboardingStepId,
  {
    title: string;
    intro: string;
    bullets: string[];
  }
> = {
  embed: {
    title: "Activate the storefront widget",
    intro:
      "Your customers need the try-on button on product pages. We install the script automatically; enabling the theme app embed gives the best button placement.",
    bullets: [
      "Open the theme editor using the button below.",
      "In the left sidebar, go to App embeds.",
      'Turn on "Virtual Try-On Widget" (or VTON).',
      "Click Save, then return here.",
    ],
  },
  tryon: {
    title: "Run your first try-on",
    intro:
      "Test the full shopper flow once so you know everything works before sending traffic.",
    bullets: [
      "Open any active product page on your store (use the link below).",
      'Click the try-on button (e.g. "Try It On Now").',
      "Upload a front-facing photo and wait for the AI result.",
      "Optional: add to cart to confirm checkout integration.",
    ],
  },
  garment: {
    title: "Choose an AI garment photo",
    intro:
      "A flat lay or packshot helps the AI fit the product more accurately. Shoppers still see your normal product gallery.",
    bullets: [
      "Go to Products in this app.",
      'In the "AI garment photo" column, pick a clear flat-lay image.',
      "Or upload a custom image for products that need it.",
    ],
  },
};

type Props = {
  onboarding: OnboardingState;
  themeEditorActivateUrl: string;
  themeEditorAppEmbedsUrl: string;
  fetcher: FetcherWithComponents<unknown>;
};

export function OnboardingGuide({
  onboarding,
  themeEditorActivateUrl,
  themeEditorAppEmbedsUrl,
  fetcher,
}: Props) {
  const [expandedStep, setExpandedStep] = useState<OnboardingStepId | null>(
    () => {
      const firstOpen = onboarding.steps.find((s) => !s.done);
      return firstOpen?.id ?? "embed";
    }
  );

  useEffect(() => {
    const firstOpen = onboarding.steps.find((s) => !s.done);
    if (firstOpen) {
      setExpandedStep(firstOpen.id);
    }
  }, [onboarding.completedCount, onboarding.steps]);

  const progressPercent = Math.round(
    (onboarding.completedCount / onboarding.totalSteps) * 100
  );

  const submitIntent = (intent: string, extra?: Record<string, string>) => {
    const formData = new FormData();
    formData.append("intent", intent);
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => formData.append(k, v));
    }
    fetcher.submit(formData, { method: "post" });
  };

  if (onboarding.dismissed && !onboarding.allDone) {
    return (
      <div className="vton-onboarding-collapsed">
        <p>
          <strong>Setup guide</strong> — {onboarding.completedCount} of{" "}
          {onboarding.totalSteps} steps complete.
        </p>
        <Button
          size="slim"
          onClick={() => submitIntent("reopen-onboarding")}
          loading={fetcher.state !== "idle"}
        >
          Show setup guide
        </Button>
      </div>
    );
  }

  if (onboarding.dismissed && onboarding.allDone) {
    return null;
  }

  return (
    <section className="vton-onboarding" aria-label="Setup guide">
      <div className="vton-onboarding__header">
        <div>
          <p className="vton-onboarding__eyebrow">Getting started</p>
          <h2 className="vton-onboarding__title">Set up Virtual Try-On in 3 steps</h2>
          <p className="vton-onboarding__subtitle">
            Follow this checklist once. Most merchants finish in under 10 minutes.
          </p>
        </div>
        <div className="vton-onboarding__progress-meta">
          <span className="vton-onboarding__progress-label">
            {onboarding.completedCount} / {onboarding.totalSteps} complete
          </span>
          <button
            type="button"
            className="vton-onboarding__dismiss"
            onClick={() => submitIntent("dismiss-onboarding")}
            disabled={fetcher.state !== "idle"}
          >
            Dismiss guide
          </button>
        </div>
      </div>

      <div
        className="vton-onboarding__progress"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="vton-onboarding__progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <ol className="vton-onboarding__steps">
        {onboarding.steps.map((step, index) => {
          const copy = STEP_COPY[step.id];
          const isExpanded = expandedStep === step.id;
          const stepNumber = index + 1;

          return (
            <li
              key={step.id}
              className={
                "vton-onboarding__step" +
                (step.done ? " is-done" : "") +
                (isExpanded ? " is-expanded" : "")
              }
            >
              <button
                type="button"
                className="vton-onboarding__step-head"
                onClick={() =>
                  setExpandedStep(isExpanded ? null : step.id)
                }
                aria-expanded={isExpanded}
              >
                <span
                  className={
                    "vton-onboarding__step-badge" +
                    (step.done ? " is-done" : "")
                  }
                  aria-hidden
                >
                  {step.done ? "✓" : stepNumber}
                </span>
                <span className="vton-onboarding__step-title">{copy.title}</span>
                {step.done && (
                  <span className="vton-onboarding__step-status">Done</span>
                )}
              </button>

              {isExpanded && (
                <div className="vton-onboarding__step-body">
                  <p>{copy.intro}</p>
                  <ol className="vton-onboarding__bullets">
                    {copy.bullets.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>

                  <div className="vton-onboarding__actions">
                    {step.id === "embed" && (
                      <>
                        {themeEditorActivateUrl && (
                          <Button
                            variant="primary"
                            onClick={() =>
                              window.open(themeEditorActivateUrl, "_top")
                            }
                          >
                            Open theme editor
                          </Button>
                        )}
                        {themeEditorAppEmbedsUrl && (
                          <Button
                            onClick={() =>
                              window.open(themeEditorAppEmbedsUrl, "_top")
                            }
                          >
                            App embeds list
                          </Button>
                        )}
                        {!step.done && (
                          <Button
                            variant="plain"
                            onClick={() =>
                              submitIntent("mark-onboarding-step", {
                                step: "embed",
                              })
                            }
                            loading={fetcher.state !== "idle"}
                          >
                            I&apos;ve enabled the embed
                          </Button>
                        )}
                      </>
                    )}

                    {step.id === "tryon" && (
                      <>
                        {onboarding.firstProductStorefrontUrl ? (
                          <Button
                            variant="primary"
                            url={onboarding.firstProductStorefrontUrl}
                            external
                          >
                            Open a product page
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            url="shopify:admin/products"
                            external
                          >
                            Open products in Shopify
                          </Button>
                        )}
                        <Link to="/app/history" className="vton-onboarding__link">
                          View try-on history
                        </Link>
                        {!step.done && (
                          <Button
                            variant="plain"
                            onClick={() =>
                              submitIntent("mark-onboarding-step", {
                                step: "tryon",
                              })
                            }
                            loading={fetcher.state !== "idle"}
                          >
                            I&apos;ve completed a test try-on
                          </Button>
                        )}
                      </>
                    )}

                    {step.id === "garment" && (
                      <>
                        <Link to="/app/products" className="vton-btn vton-btn--primary">
                          Go to Products
                        </Link>
                        {!step.done && (
                          <Button
                            variant="plain"
                            onClick={() =>
                              submitIntent("mark-onboarding-step", {
                                step: "garment",
                              })
                            }
                            loading={fetcher.state !== "idle"}
                          >
                            I&apos;ve set a photo / skip for now
                          </Button>
                        )}
                      </>
                    )}
                  </div>

                  {step.auto && step.done && (
                    <p className="vton-onboarding__auto-note">
                      Detected automatically — no action needed.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {onboarding.allDone && (
        <div className="vton-onboarding__complete">
          <p>
            <strong>You&apos;re all set.</strong> Virtual try-on is ready for your
            shoppers. Track results on this dashboard or run an A/B test from
            Widget settings.
          </p>
          <div className="vton-onboarding__actions">
            <Link to="/app/widget" className="vton-btn vton-btn--ghost">
              Customize widget
            </Link>
            <Button
              onClick={() => submitIntent("dismiss-onboarding")}
              loading={fetcher.state !== "idle"}
            >
              Close guide
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
