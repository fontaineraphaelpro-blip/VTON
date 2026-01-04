/**
 * Route for /widget-v2.js
 * This route handles requests from Shopify App Proxy which strips the /apps/tryon prefix.
 * 
 * IMPORTANT: Using square brackets [.] to escape the dot in the filename.
 * This is the Remix flatRoutes() convention for routes with special characters.
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

import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Import and call the loader from the actual widget route
  const widgetRoute = await import("./apps.tryon.widget-v2");
  return widgetRoute.loader({ request });
};


