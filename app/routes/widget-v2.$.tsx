/**
 * Catch-all route for /widget-v2.js and /widget-v2.*
 * This route handles requests from Shopify App Proxy which strips the /apps/tryon prefix.
 * 
 * Shopify App Proxy configuration:
 * - subpath: "tryon"
 * - prefix: "apps"
 * 
 * So requests to https://store.myshopify.com/apps/tryon/widget-v2.js
 * are proxied to https://app-url.com/widget-v2.js (prefix stripped)
 * 
 * This route re-exports the loader from apps.tryon.widget-v2.tsx
 */

import * as widgetRoute from "./apps.tryon.widget-v2";

// Re-export the loader to serve the widget when App Proxy strips the prefix
export const loader = widgetRoute.loader;

