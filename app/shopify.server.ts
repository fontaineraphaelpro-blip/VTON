import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import type { Session } from "@shopify/shopify-app-remix/server";
import prisma from "./db.server";

// Validate required environment variables
if (!process.env.SHOPIFY_API_KEY) {
  throw new Error("SHOPIFY_API_KEY is required");
}
if (!process.env.SHOPIFY_API_SECRET) {
  throw new Error("SHOPIFY_API_SECRET is required");
}
if (!process.env.SHOPIFY_APP_URL) {
  throw new Error("SHOPIFY_APP_URL is required. Set it in your environment variables.");
}

// #region agent log
// Wrapper to instrument PrismaSessionStorage and ensure sessionId is set
class InstrumentedPrismaSessionStorage extends PrismaSessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    const logData = {
      sessionId: (session as any).sessionId,
      id: session.id,
      shop: session.shop,
      hasSessionId: !!(session as any).sessionId,
      sessionKeys: Object.keys(session),
    };
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'shopify.server.ts:storeSession:entry',message:'storeSession called',data:logData,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    
    // Ensure sessionId is set (use session.id as fallback if not provided)
    if (!(session as any).sessionId) {
      (session as any).sessionId = session.id;
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'shopify.server.ts:storeSession:fix',message:'Added missing sessionId',data:{sessionId:session.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    }
    // #endregion
    
    try {
      const result = await super.storeSession(session);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'shopify.server.ts:storeSession:success',message:'storeSession succeeded',data:{result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return result;
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'shopify.server.ts:storeSession:error',message:'storeSession failed',data:{error:error.message,stack:error.stack,errorName:error.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      throw error;
    }
  }
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new InstrumentedPrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
