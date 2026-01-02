import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState } from "react";
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

// Packs de crédits - Basé sur le design VtonDesign
const CREDIT_PACKS = [
  {
    id: "discovery",
    name: "Discovery",
    credits: 10,
    price: 4.99,
    description: "Start offering Virtual Testing",
    badge: null,
    highlight: false,
  },
  {
    id: "standard",
    name: "Standard",
    credits: 30,
    price: 12.99,
    description: "Turn visitors into buyers",
    badge: "BEST SELLER",
    savePercent: 15,
    highlight: true,
  },
  {
    id: "business",
    name: "Business",
    credits: 100,
    price: 29.99,
    description: "Slash return rates by 30%",
    badge: "BEST ROI",
    highlight: false,
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
    if (customCredits && customCredits >= 200) {
      const pricePerCredit = 0.25;
      await upsertShop(shop, { addCredits: customCredits });
      return json({ 
        success: true, 
        pack: "Custom", 
        creditsAdded: customCredits,
        price: customCredits * pricePerCredit
      });
    }
  }

  return json({ success: false, error: "Invalid purchase" });
};

export default function Credits() {
  const { shop, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const currentCredits = shop?.credits || 0;
  const [customAmount, setCustomAmount] = useState("200");

  const isSubmitting = fetcher.state === "submitting";

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
      <TitleBar title="Crédits - VTON Magic" />
      <div className="vton-credits-page">
        {/* Header Simple */}
        <header className="vton-header-simple">
          <div className="vton-header-logo">
            <div className="vton-logo-icon-blue">⚡</div>
            <span className="vton-header-title">VTON Magic Admin</span>
          </div>
          <div className="vton-status-badge">
            <div className="vton-status-dot-green"></div>
            System Active
          </div>
        </header>

        <div className="vton-credits-content">
          {/* Alert Banner */}
          <div className="vton-alert-banner">
            <div className="vton-info-icon">
              ℹ️
            </div>
            <p className="vton-alert-text">
              <strong>Stop losing money on returns.</strong> Letting customers{" "}
              <span className="vton-alert-underline">test products virtually</span> removes doubt. 
              This slashes refunds and boosts conversion by{" "}
              <strong className="vton-alert-green">2.5x</strong> instantly.
            </p>
          </div>

          {/* Grid Principale (Credits + Pricing) */}
          <div className="vton-pricing-grid">
            {/* Carte de gauche (Bleu Nuit) */}
            <div className="vton-credits-card-blue">
              <div className="vton-credits-card-glow"></div>
              <div className="vton-credits-card-content">
                <div className="vton-credits-label-blue">Remaining Credits</div>
                
                {/* Credits amount */}
                <div className="vton-credits-amount-blue">
                  {currentCredits.toLocaleString("fr-FR")}
                </div>

                <div className="vton-credits-footer-blue">
                  <span className="vton-infinity">∞</span> Credits never expire
                </div>
              </div>
            </div>

            {/* Pricing Cards */}
            {CREDIT_PACKS.map((pack) => (
              <div 
                key={pack.id} 
                className={`vton-pricing-card ${pack.highlight ? "vton-pricing-card-highlight" : ""}`}
              >
                {pack.highlight && pack.badge && (
                  <div className="vton-badge-best-seller">
                    🔥 BEST SELLER
                  </div>
                )}
                {pack.savePercent && (
                  <div className="vton-badge-save">
                    SAVE {pack.savePercent}%
                  </div>
                )}
                {pack.badge && !pack.highlight && (
                  <div className="vton-badge-roi">
                    {pack.badge}
                  </div>
                )}

                <h3 className={`vton-pack-name ${pack.highlight ? "vton-pack-name-highlight" : ""}`}>
                  {pack.name}
                </h3>
                <div className={`vton-pack-credits-number ${pack.highlight ? "vton-pack-credits-highlight" : ""}`}>
                  {pack.credits}
                </div>
                <p className="vton-pack-description-text">
                  {pack.description}
                </p>

                <div className="vton-pack-bottom">
                  <div className={`vton-pack-price-number ${pack.highlight ? "vton-pack-price-highlight" : ""}`}>
                    {pack.price.toFixed(2)}€
                  </div>
                  <button
                    className={`vton-pack-button ${pack.highlight ? "vton-pack-button-primary" : "vton-pack-button-secondary"}`}
                    onClick={() => handlePurchase(pack.id)}
                    disabled={isSubmitting}
                  >
                    {pack.highlight ? "Top Up Now" : "Select"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Custom Pack (Barre du bas) */}
          <div className="vton-custom-pack">
            <div className="vton-custom-pack-left">
              <div className="vton-custom-icon">
                <span className="vton-custom-icon-emoji">🏢</span>
              </div>
              <div>
                <h4 className="vton-custom-title">High Volume Store?</h4>
                <p className="vton-custom-text">
                  Get our lowest rate (<span className="vton-custom-price">€0.25 / try-on</span>) for bulk orders.
                </p>
              </div>
            </div>
            <div className="vton-custom-pack-right">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCustomPurchase(new FormData(e.currentTarget));
                }}
              >
                <input 
                  type="number" 
                  name="customCredits"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="vton-custom-input"
                  min={200}
                />
                <button 
                  type="submit"
                  className="vton-custom-button"
                  disabled={isSubmitting}
                >
                  Get Custom Pack
                </button>
              </form>
            </div>
          </div>
        </div>

        {error && (
          <Banner tone="critical" title="Erreur">
            Erreur lors du chargement des données: {error}
          </Banner>
        )}

        {fetcher.data?.success && (
          <Banner tone="success" title="Achat réussi">
            Pack "{fetcher.data.pack}" acheté avec succès ! {fetcher.data.creditsAdded} crédits
            ont été ajoutés à votre compte.
          </Banner>
        )}
      </div>
    </Page>
  );
}
