/**
 * Route for /atc
 * This route handles requests from Shopify App Proxy which strips the /apps/tryon prefix.
 * 
 * IMPORTANT: Shopify App Proxy configuration strips the /apps/tryon prefix,
 * so requests to https://store.myshopify.com/apps/tryon/atc
 * are proxied to https://app-url.com/atc (prefix stripped)
 * 
 * This route re-exports the action from apps.tryon.atc.tsx
 */

import type { ActionFunctionArgs } from "@remix-run/node";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Import and call the action from the actual atc route
  const atcRoute = await import("./apps.tryon.atc");
  return atcRoute.action({ request });
};







