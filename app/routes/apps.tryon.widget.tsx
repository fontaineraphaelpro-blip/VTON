/**
 * Legacy route: GET /apps/tryon/widget.js
 * Widget is served via App Embed (extensions/vton-widget/blocks/block.liquid).
 * Empty stub avoids loading a duplicate ~40KB script if an old ScriptTag remains.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async (_args: LoaderFunctionArgs) => {
  const emptyWidget = `(function(){})();`;

  return new Response(emptyWidget, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
