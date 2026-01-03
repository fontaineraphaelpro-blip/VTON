/**
 * Route for /widget-v2.js
 * This route handles requests from Shopify App Proxy which strips the /apps/tryon prefix.
 * 
 * Shopify App Proxy configuration:
 * - subpath: "tryon"
 * - prefix: "apps"
 * 
 * So requests to https://store.myshopify.com/apps/tryon/widget-v2.js
 * are proxied to https://app-url.com/widget-v2.js (prefix stripped)
 * 
 * This route duplicates the loader logic from apps.tryon.widget-v2.tsx
 * because Remix flatRoutes() doesn't recognize widget-v2.js.tsx as a valid route.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Get the app URL from environment or request
  const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || new URL(request.url).origin;
  
  // Import the widget code from the actual route file
  // We need to dynamically import it to avoid circular dependencies
  const widgetRouteModule = await import("./apps.tryon.widget-v2");
  
  // Call the loader from the actual route
  return widgetRouteModule.loader({ request });
};
