/**
 * Route for /status
 * This route handles requests from Shopify App Proxy which strips the /apps/tryon prefix.
 * 
 * IMPORTANT: Shopify App Proxy configuration strips the /apps/tryon prefix,
 * so requests to https://store.myshopify.com/apps/tryon/status
 * are proxied to https://app-url.com/status (prefix stripped)
 * 
 * This route re-exports the loader from apps.tryon.status.tsx
 */

import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Import and call the loader from the actual status route
  const statusRoute = await import("./apps.tryon.status");
  return statusRoute.loader({ request });
};






