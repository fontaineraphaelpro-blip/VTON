/**
 * ==========================================
 * APP PROXY - GENERATE TRY-ON ENDPOINT
 * ==========================================
 * 
 * Route: POST /apps/tryon/generate
 * Public endpoint to generate virtual try-on images.
 * Used by client-side widget to generate try-on results.
 * 
 * This endpoint is public but verifies Shopify HMAC signature for security.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import { generateTryOn } from "../lib/services/replicate.service";
import { getShop, upsertShop, createTryonLog, getMonthlyTryonUsage, query } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";

/**
 * Verifies that the request comes from Shopify App Proxy.
 */
function verifyProxySignature(queryParams: URLSearchParams): boolean {
  const signature = queryParams.get("signature");
  if (!signature || !SHOPIFY_API_SECRET) {
    return false;
  }

  // Create a copy without signature
  const paramsToVerify: Record<string, string> = {};
  queryParams.forEach((value, key) => {
    if (key !== "signature") {
      paramsToVerify[key] = value;
    }
  });

  // Sort and build query string
  const sortedParams = Object.keys(paramsToVerify)
    .sort()
    .map((key) => `${key}=${paramsToVerify[key]}`)
    .join("&");

  // Calculate HMAC
  const computedSignature = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(sortedParams)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(computedSignature)
  );
}

/**
 * Extracts shop domain from Shopify parameters.
 */
function extractShopFromProxy(queryParams: URLSearchParams): string {
  let shop = queryParams.get("shop") || "";
  if (shop && !shop.endsWith(".myshopify.com")) {
    shop = `${shop}.myshopify.com`;
  }
  return shop;
}

/**
 * Converts base64 data URL to a regular URL or returns as-is if already a URL
 */
function convertBase64ToUrl(base64Data: string): string {
  // If it's already a URL, return as-is
  if (base64Data.startsWith("http://") || base64Data.startsWith("https://")) {
    return base64Data;
  }
  
  // If it's a data URL, extract the base64 part
  if (base64Data.startsWith("data:image/")) {
    // For Replicate, we can use the data URL directly or convert to a temporary URL
    // Replicate accepts data URLs, so we can return it as-is
    return base64Data;
  }
  
  // If it's just base64 without data: prefix, add it
  if (!base64Data.includes(",")) {
    return `data:image/jpeg;base64,${base64Data}`;
  }
  
  return base64Data;
}

/**
 * POST /apps/tryon/generate
 * 
 * Query parameters:
 * - shop: Shop domain (required, from Shopify App Proxy)
 * - product_id: Shopify product ID (optional, from query params)
 * - signature: HMAC signature (optional, from Shopify App Proxy)
 * 
 * Body:
 * - user_photo: Base64 encoded user photo (data:image/... or base64 string)
 * - product_image_url: URL of the product image
 * - product_id: Shopify product ID (optional, can be in query or body)
 * - product_handle: Product handle (optional)
 * 
 * Returns:
 * - result_url: URL of the generated try-on image
 * - job_id: Job ID for tracking (optional, for async mode)
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const startTime = Date.now();
  
  try {
    const url = new URL(request.url);
    const queryParams = url.searchParams;

    // 1. Verify Shopify signature OR check if request comes from storefront
    const hasValidSignature = verifyProxySignature(queryParams);
    
    // If no signature, check if request comes from a Shopify storefront
    if (!hasValidSignature) {
      const referer = request.headers.get("referer") || "";
      const origin = request.headers.get("origin") || "";
      const shopParam = queryParams.get("shop");
      
      // Check if request comes from a Shopify storefront (.myshopify.com)
      const isFromShopifyStorefront = 
        (referer.includes(".myshopify.com") || origin.includes(".myshopify.com")) &&
        shopParam &&
        shopParam.includes(".myshopify.com");
      
      if (!isFromShopifyStorefront) {
        return json(
          { error: "Invalid signature - request not from Shopify" },
          { status: 403 }
        );
      }
    }

    // 2. Extract shop
    const shop = extractShopFromProxy(queryParams);
    if (!shop) {
      return json({ error: "Shop parameter missing" }, { status: 400 });
    }

    // 3. Parse request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const userPhoto = body.user_photo || body.person_image_base64;
    const productImageUrl = body.product_image_url || body.clothing_url;
    const productId = body.product_id || queryParams.get("product_id");
    const productHandle = body.product_handle;

    if (!userPhoto) {
      return json({ error: "user_photo is required" }, { status: 400 });
    }

    if (!productImageUrl) {
      return json({ error: "product_image_url is required" }, { status: 400 });
    }

    // 4. Ensure database tables exist
    await ensureTables();

    // 5. Check shop settings and credits
    const shopData = await getShop(shop);
    if (!shopData) {
      return json({ error: "Shop not found" }, { status: 404 });
    }

    // Check if widget is enabled
    if (shopData.is_enabled === false) {
      return json({ error: "Try-on is disabled for this shop" }, { status: 403 });
    }

    // Check credits (if using credit system)
    const credits = shopData.credits || 0;
    if (credits <= 0) {
      return json({ 
        error: "Insufficient credits. Please purchase a subscription plan.",
        credits: credits 
      }, { status: 402 });
    }

    // Check monthly quota (if set)
    const monthlyQuota = shopData.monthly_quota;
    if (monthlyQuota && monthlyQuota > 0) {
      const monthlyUsage = await getMonthlyTryonUsage(shop);
      if (monthlyUsage >= monthlyQuota) {
        return json({ 
          error: "Monthly quota exceeded. Please upgrade your plan.",
          monthlyUsage,
          monthlyQuota 
        }, { status: 402 });
      }
    }

    // 6. Convert user photo to URL format
    const personImageUrl = convertBase64ToUrl(userPhoto);

    // 7. Get quality mode from shop settings
    const qualityMode = (shopData.quality_mode || "balanced") as "speed" | "balanced" | "quality";

    // 8. Generate try-on image using Replicate
    console.log("[Generate] Starting try-on generation:", {
      shop,
      productId,
      productHandle,
      qualityMode,
    });

    let resultUrl: string;
    let errorMessage: string | null = null;
    let success = false;

    try {
      const result = await generateTryOn(personImageUrl, productImageUrl, { qualityMode });
      resultUrl = result.resultUrl;
      success = true;
      console.log("[Generate] Try-on generation successful:", { resultUrl });
    } catch (generateError) {
      errorMessage = generateError instanceof Error ? generateError.message : "Unknown error";
      console.error("[Generate] Try-on generation failed:", errorMessage);
      throw generateError;
    }

    // 9. Calculate latency
    const latencyMs = Date.now() - startTime;

    // 10. Deduct credit and update usage
    if (success) {
      // Deduct one credit
      await upsertShop(shop, {
        addCredits: -1, // Deduct one credit
        incrementTotalTryons: true,
        monthly_quota_used: (shopData.monthly_quota_used || 0) + 1,
      });
    }

    // 11. Log the generation attempt
    const logId = await createTryonLog({
      shop,
      customerIp: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
      productId: productId || undefined,
      productHandle: productHandle || undefined,
      success,
      errorMessage: errorMessage || undefined,
      latencyMs,
      resultImageUrl: success ? resultUrl : undefined,
    });

    // 12. Return result with CORS headers
    const origin = request.headers.get("origin") || "";
    const referer = request.headers.get("referer") || "";
    const isFromShopifyStorefront = origin.includes(".myshopify.com") || referer.includes(".myshopify.com");
    
    const headers = new Headers();
    if (isFromShopifyStorefront) {
      headers.set("Access-Control-Allow-Origin", origin || "*");
      headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
    }

    if (success) {
      return json({
        result_url: resultUrl,
        job_id: logId.toString(), // Return log ID as job ID for tracking
      }, { headers });
    } else {
      return json({
        error: errorMessage || "Generation failed",
        job_id: logId.toString(),
      }, { status: 500, headers });
    }
  } catch (error) {
    console.error("[Generate] Error in /apps/tryon/generate:", error);
    
    const origin = request.headers.get("origin") || "";
    const referer = request.headers.get("referer") || "";
    const isFromShopifyStorefront = origin.includes(".myshopify.com") || referer.includes(".myshopify.com");
    
    const headers = new Headers();
    if (isFromShopifyStorefront) {
      headers.set("Access-Control-Allow-Origin", origin || "*");
      headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
    }

    return json(
      {
        error: "Failed to generate try-on",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers }
    );
  }
};
