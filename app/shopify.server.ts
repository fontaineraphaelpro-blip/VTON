import { shopifyApp } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { BillingInterval } from "@shopify/shopify-app-remix/server";
import { prisma } from "./db.server";

export const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: process.env.SCOPES?.split(",")!,
  appUrl: process.env.SHOPIFY_APP_URL!,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: "AppStore",
  useOnlineTokens: true, // CRITIQUE: Utilise des tokens online pour les paiements et draft orders
  billing: {
    "starter": {
      // Handle technique: "starter", Display name: "Starter"
      lineItems: [
        {
          amount: 29.0,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    "pro": {
      // Handle technique: "pro", Display name: "Pro"
      lineItems: [
        {
          amount: 99.0,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    "studio": {
      // Handle technique: "studio", Display name: "Enterprise"
      // Le prix doit correspondre au prix dans le Partner Dashboard ($399/month)
      lineItems: [
        {
          amount: 399.0,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
});

export default shopify;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
