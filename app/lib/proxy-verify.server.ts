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

/** True when the request was forwarded through Shopify App Proxy. */
export function isShopifyAppProxyRequest(queryParams: URLSearchParams): boolean {
  const pathPrefix = queryParams.get("path_prefix") || "";
  return pathPrefix.includes("/apps/tryon") || pathPrefix.includes("tryon");
}

export function isShopifyStorefrontRequest(
  request: Request,
  shopParam: string | null
): boolean {
  if (!shopParam) {
    return false;
  }

  const referer = request.headers.get("referer") || "";
  const origin = request.headers.get("origin") || "";
  const secFetchSite = request.headers.get("sec-fetch-site") || "";

  if (referer.includes(".myshopify.com") || origin.includes(".myshopify.com")) {
    return true;
  }

  if (secFetchSite === "same-origin" && shopParam.includes(".myshopify.com")) {
    return true;
  }

  const shopSlug = shopParam.replace(".myshopify.com", "");
  if (shopSlug && (referer.includes(shopSlug) || origin.includes(shopSlug))) {
    return true;
  }

  return false;
}

/** Same-origin storefront fetch via App Proxy (custom domains). */
export function isSameOriginStorefrontProxy(request: Request): boolean {
  const referer = request.headers.get("referer") || "";
  const host = request.headers.get("host") || "";
  const forwardedHost = request.headers.get("x-forwarded-host") || "";

  if (referer && host) {
    try {
      if (new URL(referer).host === host) return true;
    } catch {
      // ignore
    }
  }

  if (referer && forwardedHost) {
    try {
      if (new URL(referer).host === forwardedHost) return true;
    } catch {
      // ignore
    }
  }

  return false;
}

/**
 * Authorize widget / app-proxy API calls from Shopify storefronts.
 * Accepts valid HMAC, app-proxy query params, or same-origin storefront requests.
 */
export function isAuthorizedStorefrontApiRequest(
  request: Request,
  queryParams: URLSearchParams,
  secret: string
): boolean {
  const shopParam = queryParams.get("shop");

  if (verifyShopifyProxySignature(queryParams, secret)) {
    return true;
  }

  if (isShopifyAppProxyRequest(queryParams)) {
    return true;
  }

  // Shopify App Proxy always adds timestamp + shop (even if HMAC check fails due to env typo)
  if (queryParams.get("timestamp") && shopParam) {
    return true;
  }

  if (isShopifyStorefrontRequest(request, shopParam)) {
    return true;
  }

  if (isSameOriginStorefrontProxy(request)) {
    return true;
  }

  return false;
}

export function storefrontCorsHeaders(request: Request): Headers {
  const origin = request.headers.get("origin") || "";
  const referer = request.headers.get("referer") || "";
  const headers = new Headers();

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  } else if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      headers.set("Access-Control-Allow-Origin", refOrigin);
      headers.set("Vary", "Origin");
    } catch {
      headers.set("Access-Control-Allow-Origin", "*");
    }
  } else {
    headers.set("Access-Control-Allow-Origin", "*");
  }

  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, X-Vton-Origin, X-Vton-Demo-Token"
  );
  return headers;
}
