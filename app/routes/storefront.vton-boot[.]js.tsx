/**
 * Storefront bootstrap — loaded via ScriptTag on install (all pages; boots on product pages only).
 */

import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const origin = new URL(request.url).origin;
  const base = appUrl || origin;

  const boot = `(function(){
  "use strict";
  if (window.__VTON_WIDGET_BOOTED) return;
  if (!/\\/products\\/[^\\/\\?#]+/i.test(window.location.pathname)) return;

  var shop = (window.Shopify && window.Shopify.shop) || "";
  var productId = null;
  var productHandle = null;

  if (window.Shopify && window.Shopify.product) {
    if (window.Shopify.product.id) {
      productId = "gid://shopify/Product/" + window.Shopify.product.id;
    }
    if (window.Shopify.product.handle) {
      productHandle = window.Shopify.product.handle;
    }
  }
  if (!productHandle) {
    var m = window.location.pathname.match(/\\/products\\/([^\\/\\?#]+)/);
    if (m) productHandle = m[1];
  }

  window.VTON_LIQUID = {
    productId: productId,
    productHandle: productHandle,
    customAnchor: "",
    appUrl: ${JSON.stringify(base)},
    pageType: "product",
    templateName: "product"
  };

  var s = document.createElement("script");
  s.src = ${JSON.stringify(base + "/storefront/vton-widget.js")};
  s.defer = true;
  s.crossOrigin = "anonymous";
  document.head.appendChild(s);
})();`;

  return new Response(boot, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
