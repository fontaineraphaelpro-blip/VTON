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
} from "../lib/services/db.service";
import { generateTryOn } from "../lib/services/replicate.service";

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

export const action = async ({ request }: ActionFunctionArgs) => {
  const startTime = Date.now();

  // This is a public route for App Proxy - we verify Shopify signature manually

  try {
    const url = new URL(request.url);
    const queryParams = url.searchParams;

    // 1. Verify Shopify signature (CRITICAL)
    if (!verifyProxySignature(queryParams)) {
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

    // 4. Check credits
    if ((shopRecord.credits || 0) < 1) {
      return json(
        {
          error: "Insufficient credits",
          credits: 0,
        },
        { status: 402 }
      );
    }

    // 5. Rate limiting by IP
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

    // 6. Prepare images
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

    // 7. Generate try-on via Replicate
    const resultUrl = await generateTryOn(
      personBuffer,
      garmentInput,
      "upper_body"
    );

    // 8. Update stats in PostgreSQL
    const latencyMs = Date.now() - startTime;

    // Decrement credits and increment total_tryons
    const newCredits = (shopRecord.credits || 0) - 1;
    await upsertShop(shop, {
      credits: newCredits,
      incrementTotalTryons: true,
    });

    await incrementRateLimit(shop, clientIp, today);

    await createTryonLog({
      shop,
      customerIp: clientIp,
      productId: product_id || null,
      success: true,
      latencyMs,
      resultImageUrl: resultUrl,
    });

    // Get remaining credits
    const updatedShop = await getShop(shop);
    const creditsRemaining = updatedShop?.credits || 0;

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

