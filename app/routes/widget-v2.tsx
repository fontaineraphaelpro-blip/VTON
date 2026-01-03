/**
 * Fallback route for /widget-v2.js
 * Serves the widget directly (same as /apps/tryon/widget-v2.js)
 * This handles cases where the widget is loaded directly from the app URL
 * instead of through the Shopify App Proxy
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  
  // If request comes from Shopify App Proxy, redirect to the correct route
  // Otherwise, serve the widget directly (for direct app URL access)
  const referer = request.headers.get("referer") || "";
  const origin = request.headers.get("origin") || "";
  
  // Check if this is a Shopify storefront request
  const isShopifyStorefront = referer.includes(".myshopify.com") || origin.includes(".myshopify.com");
  
  if (isShopifyStorefront) {
    // Redirect to the App Proxy route
    const redirectUrl = url.pathname.replace('/widget-v2.js', '/apps/tryon/widget-v2.js');
    return redirect(redirectUrl + url.search, 301);
  }
  
  // For direct app URL access, redirect to the correct route
  const redirectUrl = url.pathname.replace('/widget-v2.js', '/apps/tryon/widget-v2.js');
  return redirect(redirectUrl + url.search, 301);
};

