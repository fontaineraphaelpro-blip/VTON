/**
 * Route for /generate
 * This route handles requests from Shopify App Proxy which strips the /apps/tryon prefix.
 * 
 * IMPORTANT: Shopify App Proxy configuration strips the /apps/tryon prefix,
 * so requests to https://store.myshopify.com/apps/tryon/generate
 * are proxied to https://app-url.com/generate (prefix stripped)
 * 
 * This route re-exports the action from apps.tryon.generate.tsx
 */

import type { ActionFunctionArgs } from "@remix-run/node";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Import and call the action from the actual generate route
  const generateRoute = await import("./apps.tryon.generate");
  return generateRoute.action({ request });
};
