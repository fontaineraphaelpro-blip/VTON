/**
 * Route for /widget-v2 (without .js extension)
 * This route handles requests from Shopify App Proxy which strips the /apps/tryon prefix.
 * 
 * Shopify App Proxy configuration:
 * - subpath: "tryon"
 * - prefix: "apps"
 * 
 * So requests to https://store.myshopify.com/apps/tryon/widget-v2.js
 * are proxied to https://app-url.com/widget-v2.js (prefix stripped)
 * 
 * This route serves the widget by re-exporting the loader from apps.tryon.widget-v2.tsx
 * 
 * Note: Remix flatRoutes() may not recognize routes with .js extension in the filename.
 * This route uses a catch-all parameter to handle /widget-v2.js requests.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import * as widgetRoute from "./apps.tryon.widget-v2";

// Re-export the loader to serve the widget when App Proxy strips the prefix
export const loader = widgetRoute.loader;
