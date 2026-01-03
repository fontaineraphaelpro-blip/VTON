/**
 * Fallback route for /widget-v2.js
 * This route handles requests from Shopify App Proxy which strips the /apps/tryon prefix.
 * 
 * Shopify App Proxy configuration:
 * - subpath: "tryon"
 * - prefix: "apps"
 * 
 * So requests to https://store.myshopify.com/apps/tryon/widget-v2.js
 * are proxied to https://app-url.com/widget-v2.js (prefix stripped)
 * 
 * This route serves the same widget code as /apps/tryon/widget-v2.js
 */

import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Get the app URL from environment or request
  const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || new URL(request.url).origin;
  
  // Import and use the same widget code from apps.tryon.widget-v2.tsx
  // We'll duplicate the loader logic here to avoid circular dependencies
  const widgetCode = `
(function() {
    'use strict';
    
    // ==========================================
    // CONFIGURATION
    // ==========================================
    const CONFIG = {
        apiBase: '${appUrl}/apps/tryon',
        selectors: {
            addToCartButton: [
                'form[action*="/cart/add"] button[type="submit"]',
                'button[name="add"]',
                '[data-add-to-cart]',
                '.product-form__cart-submit',
                '.btn--add-to-cart',
                '.add-to-cart',
                'button[type="submit"][form*="product"]',
                '.product-form button[type="submit"]',
                '.product-form__submit'
            ],
            productId: [
                'meta[property="og:url"]',
                'form[action*="/cart/add"] [name="id"]',
                '[data-product-id]',
                '.product-single__meta [data-product-id]'
            ]
        },
        maxRetries: 15,
        retryDelay: 500,
        shadowRootId: 'vton-widget-root'
    };
    
    // ... [Widget code continues - we need to import the full widget code]
})();
  `;
  
  // For now, redirect to the correct route to avoid code duplication
  // The widget code is too large to duplicate here
  const url = new URL(request.url);
  const redirectUrl = `/apps/tryon/widget-v2.js${url.search}`;
  
  // Return the widget code directly by importing from the actual route
  // Actually, let's just redirect since the code is the same
  return new Response(null, {
    status: 302,
    headers: {
      "Location": redirectUrl,
    },
  });
};

