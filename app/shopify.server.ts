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
// Wrapper to instrument PrismaSessionStorage and ensure required fields are set
class InstrumentedPrismaSessionStorage extends PrismaSessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    const logData = {
      sessionId: (session as any).sessionId,
      id: session.id,
      shop: session.shop,
      hasSessionId: !!(session as any).sessionId,
      sessionKeys: Object.keys(session),
      sessionValues: JSON.stringify(session),
    };
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'shopify.server.ts:storeSession:entry',message:'storeSession called',data:logData,timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
    
    // Ensure sessionId is set (use session.id as fallback if not provided)
    if (!(session as any).sessionId) {
      (session as any).sessionId = session.id;
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'shopify.server.ts:storeSession:fixSessionId',message:'Added missing sessionId',data:{sessionId:session.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'B'})}).catch(()=>{});
    }
    // #endregion
    
    try {
      const result = await super.storeSession(session);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'shopify.server.ts:storeSession:success',message:'storeSession succeeded',data:{result},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return result;
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'shopify.server.ts:storeSession:error',message:'storeSession failed',data:{error:error.message,stack:error.stack,errorName:error.name,errorCode:error.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // If error is about missing 'data' field, try to intercept the Prisma call
      if (error.message?.includes('data') && error.message?.includes('missing')) {
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'shopify.server.ts:storeSession:dataMissing',message:'Data field missing error detected',data:{sessionId:session.id,shop:session.shop},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
        
        // Try to manually store session with data field
        try {
          const serializedData = JSON.stringify(session);
          await prisma.session.upsert({
            where: { id: session.id },
            create: {
              id: session.id,
              sessionId: (session as any).sessionId || session.id,
              data: serializedData,
              shop: session.shop,
              state: session.state || '',
              isOnline: session.isOnline || false,
              scope: session.scope || null,
              expires: session.expires || null,
              accessToken: session.accessToken || '',
              userId: session.userId ? BigInt(session.userId) : null,
              firstName: session.firstName || null,
              lastName: session.lastName || null,
              email: session.email || null,
              accountOwner: session.accountOwner || false,
              locale: session.locale || null,
              collaborator: session.collaborator || null,
              emailVerified: session.emailVerified || null,
              refreshToken: session.refreshToken || null,
              refreshTokenExpires: session.refreshTokenExpires || null,
            },
            update: {
              sessionId: (session as any).sessionId || session.id,
              data: serializedData,
              shop: session.shop,
              state: session.state || '',
              isOnline: session.isOnline || false,
              scope: session.scope || null,
              expires: session.expires || null,
              accessToken: session.accessToken || '',
              userId: session.userId ? BigInt(session.userId) : null,
              firstName: session.firstName || null,
              lastName: session.lastName || null,
              email: session.email || null,
              accountOwner: session.accountOwner || false,
              locale: session.locale || null,
              collaborator: session.collaborator || null,
              emailVerified: session.emailVerified || null,
              refreshToken: session.refreshToken || null,
              refreshTokenExpires: session.refreshTokenExpires || null,
            },
          });
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'shopify.server.ts:storeSession:manualSuccess',message:'Manual storeSession succeeded',data:{sessionId:session.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
          return true;
        } catch (manualError: any) {
          fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'shopify.server.ts:storeSession:manualError',message:'Manual storeSession failed',data:{error:manualError.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
          throw manualError;
        }
      }
      
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
