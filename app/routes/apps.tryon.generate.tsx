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

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { generateTryOn } from "../lib/services/replicate.service";
import {
  getShop,
  createTryonLog,
  updateTryonLog,
  getMonthlyTryonUsage,
  getDailyTryonUsage,
  getCustomerDailyTryonUsage,
  getProductTryonImageUrl,
  isTryonLogEligibleForFreeRetry,
} from "../lib/services/db.service";
import { ensureShopFreePlan } from "../lib/ensure-shop-free-plan.server";
import { chargeTryonCreditOnSuccess } from "../lib/tryon-billing.server";
import { normalizeProductGid } from "../lib/product-id.server";
import { storefrontCorsHeaders } from "../lib/proxy-verify.server";
import {
  authorizeInstalledShopWidgetRequest,
  extractShopFromStorefrontQuery,
} from "../lib/storefront-api-auth.server";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";

/**
 * Converts base64 data URL to a regular URL or returns as-is if already a URL
 * Replicate API accepts data URLs, so we can use them directly
 */
function convertBase64ToUrl(base64Data: string): string {
  // If it's already a URL, return as-is
  if (base64Data.startsWith("http://") || base64Data.startsWith("https://")) {
    return base64Data;
  }
  
  // If it's a data URL, return as-is (Replicate accepts data URLs)
  if (base64Data.startsWith("data:image/")) {
    return base64Data;
  }
  
  // If it's just base64 without data: prefix, add it
  if (!base64Data.includes(",") && !base64Data.includes(":")) {
    return `data:image/jpeg;base64,${base64Data}`;
  }
  
  return base64Data;
}

function getCorsHeaders(request: Request): Headers {
  const headers = storefrontCorsHeaders(request);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    const headers = getCorsHeaders(request);
    return new Response(null, { status: 204, headers });
  }
  
  const headers = getCorsHeaders(request);
  return json({ error: "Method not allowed" }, { status: 405, headers });
};

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
  
  // Get CORS headers early for all error responses
  const corsHeaders = getCorsHeaders(request);
  
  try {
    const url = new URL(request.url);
    const queryParams = url.searchParams;
    const shop = extractShopFromStorefrontQuery(queryParams);

    const authorized = await authorizeInstalledShopWidgetRequest(
      request,
      queryParams,
      SHOPIFY_API_SECRET
    );

    if (!authorized) {
      return json(
        { error: "Invalid signature - request not from Shopify" },
        { status: 403, headers: corsHeaders }
      );
    }

    // 2. Shop already extracted above
    if (!shop) {
      return json({ error: "Shop parameter missing" }, { status: 400, headers: corsHeaders });
    }

    // 3. Parse request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
    }

    const userPhoto = body.user_photo || body.person_image_base64;
    let productImageUrl = body.product_image_url || body.clothing_url;
    let productId = body.product_id ?? queryParams.get("product_id") ?? undefined;
    let productHandle = body.product_handle ?? queryParams.get("product_handle") ?? undefined;
    if (productId === "undefined" || productId === "null" || productId === "") productId = undefined;
    if (productHandle === "undefined" || productHandle === "null" || productHandle === "") productHandle = undefined;

    if (!productId && productHandle) {
      productId = productHandle;
    }

    if (productId) {
      productId = normalizeProductGid(String(productId));
    }

    const retryOfJobIdRaw = body.retry_of_job_id ?? body.retryOfJobId;
    let freeRetryOfJobId: number | null = null;
    if (retryOfJobIdRaw != null && String(retryOfJobIdRaw).trim() !== "") {
      const parsed = parseInt(String(retryOfJobIdRaw), 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        const eligible = await isTryonLogEligibleForFreeRetry(shop, parsed);
        if (eligible) {
          freeRetryOfJobId = parsed;
        }
      }
    }

    if (!userPhoto) {
      return json({ error: "user_photo is required" }, { status: 400, headers: corsHeaders });
    }

    if (!productImageUrl && productId) {
      const adminGarmentUrl = await getProductTryonImageUrl(
        shop,
        productId,
        productHandle ? String(productHandle) : undefined
      );
      if (adminGarmentUrl) {
        productImageUrl = adminGarmentUrl;
      }
    }

    if (!productImageUrl) {
      return json({ error: "product_image_url is required" }, { status: 400, headers: corsHeaders });
    }

    const { ensureDemoShopAccess, isDemoShop } = await import("../lib/demo-shops.server");
    await ensureDemoShopAccess(shop);
    await ensureShopFreePlan(shop);

    // Check shop settings and credits
    let shopData = await getShop(shop);
    if (!shopData) {
      return json({ error: "Shop not found" }, { status: 404, headers: corsHeaders });
    }

    // Check if widget is enabled
    if (shopData.is_enabled === false) {
      return json({ error: "Try-on is disabled for this shop" }, { status: 403, headers: corsHeaders });
    }

    // Check credits (if using credit system)
    const credits = shopData.credits || 0;
    if (credits <= 0) {
      return json({ 
        error: "No generations left. Please upgrade your plan.",
        credits: credits 
      }, { status: 402, headers: corsHeaders });
    }

    // Check monthly quota (if set)
    const monthlyQuota = shopData.monthly_quota;
    const skipMonthlyQuotaCap =
      shop === "3aavx5-9u.myshopify.com" || isDemoShop(shop);
    if (monthlyQuota && monthlyQuota > 0 && !skipMonthlyQuotaCap) {
      const monthlyUsage = await getMonthlyTryonUsage(shop);
      if (monthlyUsage >= monthlyQuota) {
        return json({ 
          error: "Monthly generation limit reached. Please upgrade your plan.",
          monthlyUsage,
          monthlyQuota 
        }, { status: 402, headers: corsHeaders });
      }
    }

    // Check daily limit (if set)
    const dailyLimit = shopData.daily_limit;
    if (dailyLimit && dailyLimit > 0) {
      const dailyUsage = await getDailyTryonUsage(shop);
      if (dailyUsage >= dailyLimit) {
        return json({ 
          error: "Daily limit exceeded. Please try again tomorrow.",
          dailyUsage,
          dailyLimit 
        }, { status: 402, headers: corsHeaders });
      }
    }

    // Check max tries per user/day (if set)
    const maxTriesPerUser = shopData.max_tries_per_user;
    if (maxTriesPerUser && maxTriesPerUser > 0) {
      const customerIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
      if (customerIp) {
        // Extract first IP if comma-separated (x-forwarded-for can contain multiple IPs)
        const firstIp = customerIp.split(",")[0].trim();
        const customerDailyUsage = await getCustomerDailyTryonUsage(shop, firstIp);
        if (customerDailyUsage >= maxTriesPerUser) {
          return json({ 
            error: `You have reached the daily limit of ${maxTriesPerUser} generation${maxTriesPerUser > 1 ? "s" : ""} per shopper. Please try again tomorrow.`,
            customerDailyUsage,
            maxTriesPerUser 
          }, { status: 402, headers: corsHeaders });
        }
      }
    }

    // 6. Convert user photo to URL format
    const personImageUrl = convertBase64ToUrl(userPhoto);

    // 7. Create log entry immediately (before starting generation) for async tracking
    const customerIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    const logId = await createTryonLog({
      shop,
      customerIp,
      productId: productId || undefined,
      productHandle: productHandle || undefined,
      success: false, // Will be updated when generation completes
      errorMessage: undefined,
      latencyMs: undefined,
      resultImageUrl: undefined,
    });

    // 8. Start generation in background (don't await - respond immediately)
    // This function will run asynchronously and update the log when done
    (async () => {
      const generationStartTime = Date.now();
      let resultUrl: string;
      let errorMessage: string | null = null;
      let success = false;

      try {
        const result = await generateTryOn(personImageUrl, productImageUrl);
        resultUrl = result.resultUrl;
        success = true;
      } catch (generateError) {
        errorMessage = generateError instanceof Error ? generateError.message : "Unknown error";
        success = false;
      }

      // Calculate latency
      const latencyMs = Date.now() - generationStartTime;

      // Bill only after Replicate succeeds — failures never consume a credit
      if (success) {
        try {
          await chargeTryonCreditOnSuccess(shop, shopData);
        } catch (creditError) {
          console.error("[Generate] Error charging credit after success:", creditError);
        }
      }

      // Update the log with the result
      try {
        await updateTryonLog(logId, {
          success,
          errorMessage: errorMessage || undefined,
          latencyMs,
          resultImageUrl: success ? resultUrl : undefined,
        });
      } catch (logError) {
        console.error("[Generate] Error updating log:", logError);
      }
    })().catch((backgroundError) => {
      // Handle any errors in the background process
      console.error("[Generate] Background generation error:", backgroundError);
      updateTryonLog(logId, {
        success: false,
        errorMessage: backgroundError instanceof Error ? backgroundError.message : "Unknown error",
        latencyMs: Date.now() - startTime,
      }).catch((logError) => {
        console.error("[Generate] Error updating log after background error:", logError);
      });
    });

    // 9. Return immediately with job_id (don't wait for generation to complete)
    const headers = corsHeaders;
    return json(
      {
        job_id: logId.toString(),
        credit_policy: "charged_only_on_success",
        free_retry: freeRetryOfJobId != null,
      },
      { headers }
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[Generate] Error:", error);
    }
    // Use CORS headers that were set at the beginning
    return json(
      {
        error: "Failed to generate try-on",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: corsHeaders }
    );
  }
};
