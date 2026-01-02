import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  TextField,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

// 3 Credit packs optimized for conversion AND high average order value
// Strategy: Entry point (Starter), Middle tier (Pro), Premium (Enterprise)
const CREDIT_PACKS = [
  {
    id: "starter",
    name: "Starter",
    credits: 50,
    price: 19.99,
    pricePerCredit: 0.40,
    description: "Perfect to get started",
    badge: "POPULAR",
    highlight: false,
    savings: "20%",
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 150,
    price: 49.99,
    pricePerCredit: 0.33,
    description: "Best value for growing stores",
    badge: "BEST VALUE",
    savePercent: 33,
    highlight: true,
    savings: "33%",
    popular: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    credits: 500,
    price: 149.99,
    pricePerCredit: 0.30,
    description: "Maximum savings for high volume",
    badge: "BEST ROI",
    highlight: false,
    savings: "40%",
    popular: false,
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureTables();
    const shopData = await getShop(shop);

    return json({
      shop: shopData || null,
    });
  } catch (error) {
    console.error("Credits loader error:", error);
    return json({
      shop: null,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const intent = formData.get("intent");

  if (intent === "purchase-credits") {
    const packId = formData.get("packId") as string;
    const pack = CREDIT_PACKS.find((p) => p.id === packId);

    if (pack) {
      await upsertShop(shop, { addCredits: pack.credits });
      return json({ 
        success: true, 
        pack: pack.name, 
        creditsAdded: pack.credits,
      });
    }
  } else if (intent === "custom-pack") {
    const customCredits = parseInt(formData.get("customCredits") as string);
    if (customCredits && customCredits >= 250) {
      const pricePerCredit = 0.30; // Same as Enterprise tier
      await upsertShop(shop, { addCredits: customCredits });
      return json({ 
        success: true, 
        pack: "Custom", 
        creditsAdded: customCredits,
        price: customCredits * pricePerCredit
      });
    } else {
      return json({ success: false, error: "Minimum 250 credits required for custom pack" });
    }
  }

  return json({ success: false, error: "Invalid purchase" });
};

export default function Credits() {
  const { shop, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const currentCredits = shop?.credits || 0;
  const [customAmount, setCustomAmount] = useState("500");

  const isSubmitting = fetcher.state === "submitting";

  // Recharger les données après un achat réussi
  useEffect(() => {
    if (fetcher.data?.success) {
      // Attendre un peu pour que la base de données soit mise à jour
      setTimeout(() => {
        revalidator.revalidate();
      }, 500);
    }
  }, [fetcher.data?.success, revalidator]);

  const handlePurchase = (packId: string) => {
    const formData = new FormData();
    formData.append("intent", "purchase-credits");
    formData.append("packId", packId);
    fetcher.submit(formData, { method: "post" });
  };

  const handleCustomPurchase = (formData: FormData) => {
    formData.append("intent", "custom-pack");
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Credits - VTON Magic" />
      <div className="vton-credits-page">
        {/* Header */}
        <header className="vton-header-simple">
          <div className="vton-header-logo">
            <div className="vton-logo-icon-blue">⚡</div>
            <span className="vton-header-title">VTON Magic</span>
          </div>
          <div className="vton-status-badge">
            <div className="vton-status-dot-green"></div>
            Active
          </div>
        </header>

        <div className="vton-credits-content">
          {/* Top Row: Credits + Value Prop */}
          <div className="vton-credits-top">
            {/* Current Credits Display */}
            <div className="vton-credits-display">
              <div className="vton-credits-label">Your Credits</div>
              <div className="vton-credits-amount">
                {currentCredits.toLocaleString("en-US")}
              </div>
              <div className="vton-credits-subtitle">Credits never expire</div>
            </div>

            {/* Value Proposition */}
            <div className="vton-value-prop">
              <div className="vton-value-icon">✨</div>
              <div className="vton-value-text">
                <strong>Reduce returns by 2.5x</strong> and boost conversions with virtual try-on
              </div>
            </div>
          </div>

          {/* 3 Pricing Plans */}
          <div className="vton-pricing-simple">
            {CREDIT_PACKS.map((pack) => (
              <div 
                key={pack.id} 
                className={`vton-plan-card ${pack.highlight ? "vton-plan-featured" : ""} ${pack.popular ? "vton-plan-popular" : ""}`}
              >
                {pack.badge && (
                  <div className={`vton-plan-badge ${pack.highlight ? "vton-plan-badge-featured" : ""}`}>
                    {pack.badge}
                  </div>
                )}
                
                <div className="vton-plan-header">
                  <h3 className="vton-plan-name">{pack.name}</h3>
                  <div className="vton-plan-credits">{pack.credits}</div>
                  <div className="vton-plan-credits-label">credits</div>
                </div>

                <div className="vton-plan-features">
                  <p className="vton-plan-description">{pack.description}</p>
                  {pack.savings && (
                    <div className="vton-plan-savings">Save {pack.savings}</div>
                  )}
                  <div className="vton-plan-price-per">€{pack.pricePerCredit.toFixed(2)} per credit</div>
                </div>

                <div className="vton-plan-footer">
                  <div className="vton-plan-price">€{pack.price.toFixed(2)}</div>
                  <button
                    className={`vton-plan-button ${pack.highlight ? "vton-plan-button-primary" : ""}`}
                    onClick={() => handlePurchase(pack.id)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Processing..." : "Get Started"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Custom Pack Section */}
          <div className="vton-custom-section">
            <div className="vton-custom-header">
              <span className="vton-custom-icon">🏢</span>
              <div className="vton-custom-info">
                <div className="vton-custom-title">Custom Pack</div>
                <div className="vton-custom-subtitle">Get bulk pricing for 250+ credits</div>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCustomPurchase(new FormData(e.currentTarget));
              }}
              className="vton-custom-form"
            >
              <div className="vton-custom-input-group">
                <input 
                  type="number" 
                  name="customCredits"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="vton-custom-input"
                  min={250}
                  placeholder="250"
                />
                <span className="vton-custom-input-label">credits</span>
                <button
                  type="submit"
                  className="vton-custom-button-submit"
                  disabled={isSubmitting || !customAmount || parseInt(customAmount) < 250}
                >
                  {isSubmitting ? "Processing..." : "Get Custom Pack"}
                </button>
              </div>
              <div className="vton-custom-price-info">
                €{(parseFloat(customAmount) || 0) * 0.30} total (€0.30 per credit)
              </div>
            </form>
          </div>
        </div>

        {error && (
          <Banner tone="critical" title="Error">
            {error}
          </Banner>
        )}

        {fetcher.data?.success && (
          <Banner tone="success" title="Success!">
            {fetcher.data.creditsAdded} credits added to your account.
          </Banner>
        )}
      </div>
    </Page>
  );
}
