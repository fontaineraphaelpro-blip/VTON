import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { ensureTables } from "./lib/db-init.server";
import { ensureShopFreePlan } from "./lib/ensure-shop-free-plan.server";
import {
  scheduleStorefrontWidgetScriptTag,
  sessionCanInstallScriptTag,
} from "./lib/storefront-widget-install.server";
import { upsertShop } from "./lib/services/db.service";

// Warm DB schema once at boot so storefront /status never pays migration cost per request
void ensureTables().catch(() => {});

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
  billing: {
    "free-installation-setup": {
      amount: 0.0,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days as any,
    },
    starter: {
      amount: 19.0,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days as any,
    },
    growth: {
      amount: 49.0,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days as any,
    },
    scale: {
      amount: 149.0,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days as any,
    },
  },
  hooks: {
    afterAuth: async ({ admin, session }) => {
      try {
        await upsertShop(session.shop, { accessToken: session.accessToken });
        await ensureShopFreePlan(session.shop, {
          accessToken: session.accessToken,
        });
      } catch {
        // Shop bootstrap must not block install
      }
      if (sessionCanInstallScriptTag(session.scope)) {
        scheduleStorefrontWidgetScriptTag(admin);
      }
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
