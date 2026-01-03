/**
 * Route for /widget-v2.js
 * This route handles requests from Shopify App Proxy which strips the /apps/tryon prefix.
 * 
 * IMPORTANT: This file must be named exactly "widget-v2.js.tsx" for Remix flatRoutes()
 * to recognize it as a route for "/widget-v2.js"
 * 
 * Shopify App Proxy configuration:
 * - subpath: "tryon"
 * - prefix: "apps"
 * 
 * So requests to https://store.myshopify.com/apps/tryon/widget-v2.js
 * are proxied to https://app-url.com/widget-v2.js (prefix stripped)
 * 
 * This route serves the same widget code as /apps/tryon/widget-v2.js
 * by duplicating the loader logic (to avoid import issues with Remix routing).
 */

import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Get the app URL from environment or request
  const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || new URL(request.url).origin;
  
  // Import the widget route module dynamically to avoid circular dependencies
  // and ensure the route is properly resolved
  try {
    const widgetRoute = await import("./apps.tryon.widget-v2");
    if (widgetRoute && widgetRoute.loader) {
      return widgetRoute.loader({ request });
    }
  } catch (error) {
    console.error("[widget-v2.js] Failed to import widget route:", error);
    // Fall through to return 404 if import fails
  }
  
  // If import fails, return 404
  return new Response("Widget route not found", { status: 404 });
};
