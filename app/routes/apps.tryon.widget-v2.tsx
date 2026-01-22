/**
 * ==========================================
 * APP PROXY - WIDGET JAVASCRIPT (V2)
 * ==========================================
 * 
 * Route: GET /apps/tryon/widget-v2.js
 * Serves the widget JavaScript for the storefront.
 * 
 * This is a legacy route - the actual widget is now in the App Embed Block (block.liquid)
 * This route is kept for backward compatibility.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // This route is kept for backward compatibility
  // The actual widget is now served via App Embed Block (block.liquid)
  // Return empty response or redirect to the widget route
  
  const emptyWidget = `(function(){})();`;

  return new Response(emptyWidget, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
