/**
 * ==========================================
 * APP PROXY - GENERATE ENDPOINT
 * ==========================================
 * 
 * Route: POST /apps/tryon/generate
 * Generates a virtual try-on from the storefront.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import {
  getShop,
  getOrCreateRateLimit,
  incrementRateLimit,
  createTryonLog,
  upsertShop,
  getMonthlyTryonUsage,
  getTryonStatsByDay,
} from "../lib/services/db.service";
import { generateTryOn } from "../lib/services/replicate.service";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";

/**
 * Verifies that the request comes from Shopify App Proxy or from a Shopify storefront.
 */
function verifyProxySignature(queryParams: URLSearchParams, request: Request): boolean {
  const signature = queryParams.get("signature");
  
  // If signature is present, verify it (App Proxy request)
  if (signature && SHOPIFY_API_SECRET) {
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
  
  // If no signature, check if request comes from a Shopify storefront
  const referer = request.headers.get("referer") || "";
  const origin = request.headers.get("origin") || "";
  const shop = queryParams.get("shop") || "";
  
  // Verify that request comes from a valid Shopify storefront
  const isShopifyStorefront = 
    (referer.includes(".myshopify.com") || origin.includes(".myshopify.com")) &&
    shop && 
    shop.includes(".myshopify.com");
  
  // Additional security: verify that the shop domain matches the referer/origin
  if (isShopifyStorefront) {
    const shopDomain = shop.replace(".myshopify.com", "");
    const refererMatches = referer.includes(shopDomain) || referer.includes(shop);
    const originMatches = origin.includes(shopDomain) || origin.includes(shop);
    
    // Allow if shop parameter matches the referer/origin domain
    if (refererMatches || originMatches) {
      console.log("[Generate] Allowing request without signature from verified Shopify storefront:", { 
        referer, 
        origin, 
        shop,
        shopDomain,
        refererMatches,
        originMatches
      });
      return true;
    }
  }
  
  // Reject if no valid signature and not from verified storefront
  console.warn("[Generate] Request rejected - no valid signature and not from verified storefront:", { 
    referer, 
    origin, 
    shop,
    hasSignature: !!signature
  });
  return false;
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

export const action = async ({ request }: ActionFunctionArgs) => {
  const startTime = Date.now();

  // This is a public route for App Proxy - we verify Shopify signature manually

  try {
    const url = new URL(request.url);
    const queryParams = url.searchParams;

    // 1. Verify Shopify signature or storefront origin
    if (!verifyProxySignature(queryParams, request)) {
      console.error("[Generate] Request verification failed:", {
        hasSignature: !!queryParams.get("signature"),
        referer: request.headers.get("referer"),
        origin: request.headers.get("origin"),
        shop: queryParams.get("shop"),
        url: request.url
      });
      return json(
        { error: "Invalid signature - request not from Shopify" },
        { status: 403 }
      );
    }

    // 2. Extract shop
    const shop = extractShopFromProxy(queryParams);
    if (!shop) {
      return json({ error: "Shop parameter missing" }, { status: 400 });
    }

    // 3. Get shop config from PostgreSQL
    let shopRecord = await getShop(shop);

    if (!shopRecord) {
      // Create shop if it doesn't exist
      shopRecord = await upsertShop(shop, {
        credits: 100, // Initial credits
      });
    }

    // 4. Check if try-on is enabled for this shop
    if (shopRecord.is_enabled === false) {
      return json(
        {
          error: "Try-on is disabled for this shop",
        },
        { status: 403 }
      );
    }

    // 5. Check credits
    if ((shopRecord.credits || 0) < 1) {
      return json(
        {
          error: "Insufficient credits",
          credits: 0,
        },
        { status: 402 }
      );
    }

    // 6. Check daily limit (global shop limit)
    const dailyLimit = shopRecord.daily_limit || 100;
    if (dailyLimit > 0) {
      // Get today's try-on count for this shop
      const today = new Date().toISOString().split("T")[0];
      const dailyStats = await getTryonStatsByDay(shop, 1);
      const todayStat = dailyStats.find((stat: any) => stat.date === today);
      const todayCount = todayStat ? todayStat.count : 0;
      
      if (todayCount >= dailyLimit) {
        return json(
          {
            error: "Daily limit reached for this shop",
            limit: dailyLimit,
            usage: todayCount,
          },
          { status: 429 }
        );
      }
    }

    // 7. Check monthly quota
    const monthlyQuota = shopRecord.monthly_quota;
    if (monthlyQuota && monthlyQuota > 0) {
      const monthlyUsage = await getMonthlyTryonUsage(shop);
      if (monthlyUsage >= monthlyQuota) {
        return json(
          {
            error: "Monthly quota exceeded",
            quota: monthlyQuota,
            usage: monthlyUsage,
          },
          { status: 429 }
        );
      }
    }

    // 8. Rate limiting by IP
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const today = new Date().toISOString().split("T")[0];

    const rateLimit = await getOrCreateRateLimit(shop, clientIp, today);

    if (
      rateLimit.count >= (shopRecord.max_tries_per_user || 5)
    ) {
      return json(
        {
          error: "Daily limit reached",
          limit: shopRecord.max_tries_per_user || 5,
        },
        { status: 429 }
      );
    }

    // 9. Prepare images
    const body = await request.json();
    const {
      person_image_base64,
      clothing_url,
      clothing_file_base64,
      product_id,
    } = body;

    if (!person_image_base64) {
      return json({ error: "Person image required" }, { status: 400 });
    }

    const personBuffer = Buffer.from(person_image_base64, "base64");

    let garmentInput: Buffer | string;
    if (clothing_file_base64) {
      garmentInput = Buffer.from(clothing_file_base64, "base64");
    } else if (clothing_url) {
      garmentInput = clothing_url.startsWith("//")
        ? `https:${clothing_url}`
        : clothing_url;
    } else {
      return json({ error: "No garment provided" }, { status: 400 });
    }

    // 10. Generate try-on via Replicate
    let resultUrl: string;
    try {
      resultUrl = await generateTryOn(
        personBuffer,
        garmentInput,
        "upper_body"
      );
      
      // Validate result URL
      if (!resultUrl || typeof resultUrl !== "string") {
        throw new Error("Invalid result URL from Replicate");
      }
      
      console.log("Try-on generation successful, result URL:", resultUrl);
    } catch (replicateError) {
      console.error("Replicate generation error:", replicateError);
      throw new Error(`Replicate generation failed: ${replicateError instanceof Error ? replicateError.message : String(replicateError)}`);
    }

    // 11. Update stats in PostgreSQL
    const latencyMs = Date.now() - startTime;

    // Decrement credits and increment total_tryons
    const newCredits = (shopRecord.credits || 0) - 1;
    await upsertShop(shop, {
      credits: newCredits,
      incrementTotalTryons: true,
    });

    await incrementRateLimit(shop, clientIp, today);

    // Validate resultUrl before logging
    const validResultUrl = resultUrl && typeof resultUrl === "string" ? resultUrl : null;

    await createTryonLog({
      shop,
      customerIp: clientIp,
      productId: product_id || null,
      success: true,
      latencyMs,
      resultImageUrl: validResultUrl,
    });

    // Get remaining credits
    const updatedShop = await getShop(shop);
    const creditsRemaining = updatedShop?.credits || 0;

    // Ensure resultUrl is a valid string before returning
    if (!resultUrl || typeof resultUrl !== "string") {
      throw new Error("Invalid result URL format from Replicate");
    }

    return json({
      result_image_url: resultUrl,
      credits_remaining: creditsRemaining,
      generation_time_ms: latencyMs,
    });
  } catch (error) {
    console.error("Error in /apps/tryon/generate:", error);

    // Log error in tryon_logs
    try {
      const url = new URL(request.url);
      const queryParams = url.searchParams;
      const shop = extractShopFromProxy(queryParams);
      const clientIp =
        request.headers.get("x-forwarded-for")?.split(",")[0] ||
        request.headers.get("x-real-ip") ||
        "unknown";
      const latencyMs = Date.now() - startTime;

      await createTryonLog({
        shop: shop || "unknown",
        customerIp: clientIp,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        latencyMs,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return json(
      {
        error: "Generation failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
};

