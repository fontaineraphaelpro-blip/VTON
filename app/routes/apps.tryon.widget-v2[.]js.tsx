/**
 * Route for /apps/tryon/widget-v2.js
 * This route handles direct requests to /apps/tryon/widget-v2.js
 * 
 * IMPORTANT: Using square brackets [.] to escape the dot in the filename.
 * This is the Remix flatRoutes() convention for routes with special characters.
 * 
 * This route serves a deprecated empty widget script.
 * The actual widget is now served via App Embed Block (block.liquid).
 */

import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // This route is kept for backward compatibility
  // The actual widget is now served via App Embed Block (block.liquid)
  // Return empty JavaScript that does nothing
  
  const emptyWidget = `(function() {
    console.warn('[VTON] widget-v2.js is deprecated. Please use the App Embed Block instead.');
  })();`;

  return new Response(emptyWidget, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

