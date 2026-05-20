/**
 * POST /apps/tryon/ab-event — A/B test impressions, try-ons, and ATC by bucket
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getShop, recordAbEvent } from "../lib/services/db.service";
import {
  isAuthorizedStorefrontApiRequest,
  storefrontCorsHeaders,
} from "../lib/proxy-verify.server";
import { normalizeProductGid } from "../lib/product-id.server";

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
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const headers = corsHeadersFor(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  return json({ message: "Use POST to track A/B events." }, { headers });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = corsHeadersFor(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    const queryParams = new URL(request.url).searchParams;

    let authorized = isAuthorizedStorefrontApiRequest(
      request,
      queryParams,
      SHOPIFY_API_SECRET
    );

    const shop = extractShopFromProxy(queryParams);

    if (!authorized && shop && queryParams.get("product_id")) {
      const shopRecord = await getShop(shop);
      if (shopRecord) {
        authorized = true;
      }
    }

    if (!authorized) {
      return json(
        { error: "Invalid signature - request not from Shopify" },
        { status: 403, headers }
      );
    }
    if (!shop) {
      return json({ error: "Shop parameter missing" }, { status: 400, headers });
    }

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const eventType = String(body.event_type || body.eventType || "").toLowerCase();
    const bucket = String(body.bucket || "").toLowerCase();
    const visitorId = String(body.visitor_id || body.visitorId || "");
    let productId = String(
      body.product_id || queryParams.get("product_id") || ""
    );

    if (!["impression", "tryon", "atc"].includes(eventType)) {
      return json({ error: "Invalid event_type" }, { status: 400, headers });
    }
    if (bucket !== "tryon" && bucket !== "control") {
      return json({ error: "Invalid bucket" }, { status: 400, headers });
    }

    if (productId) {
      productId = normalizeProductGid(productId);
    }

    await recordAbEvent(shop, {
      productId: productId || undefined,
      bucket,
      eventType: eventType as "impression" | "tryon" | "atc",
      visitorId: visitorId || undefined,
    });

    return json({ success: true }, { headers });
  } catch (err) {
    return json(
      {
        error: "Failed to record event",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500, headers: corsHeadersFor(request) }
    );
  }
};
