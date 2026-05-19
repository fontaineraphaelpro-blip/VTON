/**
 * POST /apps/tryon/atc — track add-to-cart after virtual try-on
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { upsertShop } from "../lib/services/db.service";
import {
  verifyShopifyProxySignature,
  isShopifyStorefrontRequest,
  storefrontCorsHeaders,
} from "../lib/proxy-verify.server";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";

function extractShopFromProxy(queryParams: URLSearchParams): string {
  let shop = queryParams.get("shop") || "";
  if (shop && !shop.endsWith(".myshopify.com")) {
    shop = `${shop}.myshopify.com`;
  }
  return shop;
}

function corsHeadersFor(request: Request): Headers {
  const headers = storefrontCorsHeaders(request);
  if (!headers.get("Access-Control-Allow-Origin")) {
    const origin = request.headers.get("origin");
    headers.set("Access-Control-Allow-Origin", origin || "*");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function isAuthorizedProxyRequest(
  request: Request,
  queryParams: URLSearchParams
): boolean {
  const shopParam = queryParams.get("shop");
  if (verifyShopifyProxySignature(queryParams, SHOPIFY_API_SECRET)) {
    return true;
  }
  if (isShopifyStorefrontRequest(request, shopParam)) {
    return true;
  }
  // Custom domain storefront: same-origin request via App Proxy (no .myshopify.com in Origin)
  const referer = request.headers.get("referer") || "";
  const host = request.headers.get("host") || "";
  if (referer && host) {
    try {
      if (new URL(referer).host === host) return true;
    } catch {
      // ignore invalid referer
    }
  }
  return false;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const headers = corsHeadersFor(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  return json(
    { message: "Add to Cart tracking endpoint. Use POST to track." },
    { headers }
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = corsHeadersFor(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    const queryParams = new URL(request.url).searchParams;

    if (!isAuthorizedProxyRequest(request, queryParams)) {
      return json(
        { error: "Invalid signature - request not from Shopify" },
        { status: 403, headers }
      );
    }

    const shop = extractShopFromProxy(queryParams);
    if (!shop) {
      return json({ error: "Shop parameter missing" }, { status: 400, headers });
    }

    await upsertShop(shop, { incrementTotalAtc: true });

    return json({ success: true }, { headers });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Error in /apps/tryon/atc:", err);
    }
    return json(
      {
        error: "Failed to track add to cart",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500, headers }
    );
  }
};
