import crypto from "crypto";

/**
 * Verifies Shopify App Proxy query signature (HMAC-SHA256, hex digest).
 */
export function verifyShopifyProxySignature(
  queryParams: URLSearchParams,
  secret: string
): boolean {
  const signature = queryParams.get("signature");
  if (!signature || !secret) {
    return false;
  }

  const paramsToVerify: Record<string, string> = {};
  queryParams.forEach((value, key) => {
    if (key !== "signature") {
      paramsToVerify[key] = value;
    }
  });

  const sortedParams = Object.keys(paramsToVerify)
    .sort()
    .map((key) => `${key}=${paramsToVerify[key]}`)
    .join("&");

  const computedSignature = crypto
    .createHmac("sha256", secret)
    .update(sortedParams)
    .digest("hex");

  try {
    const sigBuf = Buffer.from(signature, "utf8");
    const compBuf = Buffer.from(computedSignature, "utf8");
    if (sigBuf.length !== compBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuf, compBuf);
  } catch {
    return false;
  }
}

export function isShopifyStorefrontRequest(
  request: Request,
  shopParam: string | null
): boolean {
  if (!shopParam || !shopParam.includes(".myshopify.com")) {
    return false;
  }
  const referer = request.headers.get("referer") || "";
  const origin = request.headers.get("origin") || "";
  return referer.includes(".myshopify.com") || origin.includes(".myshopify.com");
}

export function storefrontCorsHeaders(request: Request): Headers {
  const origin = request.headers.get("origin") || "";
  const referer = request.headers.get("referer") || "";
  const headers = new Headers();
  if (origin.includes(".myshopify.com") || referer.includes(".myshopify.com")) {
    headers.set("Access-Control-Allow-Origin", origin || "*");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
  }
  return headers;
}
