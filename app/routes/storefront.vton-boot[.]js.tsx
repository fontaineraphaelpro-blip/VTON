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
  var path = window.location.pathname || "";
  var isProduct = /\\/(?:products?|produits?|produit|produkt|producto|artikel|item|p)\\/[^\\/\\?#]+/i.test(path);
  if (!isProduct && !(window.Shopify && window.Shopify.product)) return;

  var shop = (window.Shopify && window.Shopify.shop) || "";
  if (!shop && window.ShopifyAnalytics && window.ShopifyAnalytics.lib && window.ShopifyAnalytics.lib.config) {
    shop = window.ShopifyAnalytics.lib.config.shop || "";
  }
  if (!shop) {
    var scripts = document.querySelectorAll("script:not([src])");
    for (var si = 0; si < scripts.length && !shop; si++) {
      var sm = (scripts[si].textContent || "").match(/Shopify\\.shop\\s*=\\s*["']([^"']+\\.myshopify\\.com)["']/i);
      if (sm) shop = sm[1];
    }
  }
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
    var m = path.match(/\\/(?:products?|produits?|produit|produkt|producto|artikel|item|p)\\/([^\\/\\?#]+)/i);
    if (m) productHandle = m[1];
  }
  if (!productId && productHandle) productId = productHandle;
  if (!productId) {
    var jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < jsonLd.length && !productId; i++) {
      try {
        var data = JSON.parse(jsonLd[i].textContent || "{}");
        var items = data["@graph"] && Array.isArray(data["@graph"]) ? data["@graph"] : [data];
        for (var j = 0; j < items.length; j++) {
          if (items[j] && items[j]["@type"] === "Product" && items[j].productID) {
            productId = "gid://shopify/Product/" + String(items[j].productID);
            break;
          }
        }
      } catch (e) {}
    }
  }

  window.VTON_LIQUID = {
    shop: shop || null,
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
