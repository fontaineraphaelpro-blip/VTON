/**
 * Utilities for handling top-level vs embedded routes in Shopify Remix apps
 * 
 * Routes that MUST be top-level (not in iframe):
 * - OAuth callbacks (/auth/*)
 * - Admin authentication flows
 * - Token exchange endpoints
 * 
 * Routes that CAN be embedded:
 * - App UI routes (/app/*)
 */

import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

/**
 * Routes that must always be top-level (not in iframe)
 */
const TOP_LEVEL_ROUTES = [
  "/auth",
  "/auth/login",
  "/auth/callback",
];

/**
 * Check if a route must be top-level
 */
export function isTopLevelRoute(pathname: string): boolean {
  return TOP_LEVEL_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Check if request is in an iframe (embedded=1 parameter)
 */
export function isInIframe(request: Request): boolean {
  const url = new URL(request.url);
  return url.searchParams.get("embedded") === "1";
}

/**
 * Force route to open in top-level window
 * Returns a redirect response if the route is in an iframe
 */
export function ensureTopLevel(
  request: Request,
  options?: {
    redirectTo?: string;
    preserveParams?: boolean;
  }
) {
  const url = new URL(request.url);
  
  // If not in iframe, return null (no redirect needed)
  if (!isInIframe(request)) {
    return null;
  }

  // Build redirect URL
  let redirectUrl = options?.redirectTo || url.pathname;
  
  // Preserve query parameters if requested
  if (options?.preserveParams !== false) {
    const searchParams = new URLSearchParams(url.search);
    searchParams.delete("embedded"); // Remove embedded parameter
    if (searchParams.toString()) {
      redirectUrl += `?${searchParams.toString()}`;
    }
  }

  // Return redirect with headers to prevent iframe loading
  return redirect(redirectUrl, {
    headers: {
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "frame-ancestors 'none'",
    },
  });
}

/**
 * Helper for loaders that must be top-level
 * Usage: 
 *   const topLevelRedirect = ensureTopLevelLoader(request);
 *   if (topLevelRedirect) return topLevelRedirect;
 */
export function ensureTopLevelLoader(request: Request) {
  const url = new URL(request.url);
  
  // Check if this route must be top-level
  if (!isTopLevelRoute(url.pathname)) {
    return null; // Route can be embedded
  }

  // If in iframe, return HTML page that forces top-level redirect (not a Remix redirect)
  // This avoids CSP headers being applied
  if (isInIframe(request)) {
    // Build redirect URL without embedded parameter
    const redirectUrl = new URL(url);
    redirectUrl.searchParams.delete("embedded");
    const newUrl = redirectUrl.pathname + redirectUrl.search;
    
    // Return HTML page with JavaScript redirect (no CSP headers)
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <script>
    (function() {
      if (window.top && window.top !== window.self) {
        try {
          window.top.location.href = "${newUrl}";
        } catch (e) {
          window.open("${newUrl}", "_blank");
        }
      } else {
        window.location.href = "${newUrl}";
      }
    })();
  </script>
  <noscript>
    <meta http-equiv="refresh" content="0;url=${newUrl}">
  </noscript>
</head>
<body>
  <p>Redirecting... <a href="${newUrl}">Click here if you are not redirected</a></p>
</body>
</html>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html",
          // NO CSP headers - this allows the page to load in iframe temporarily
          // so the JavaScript can redirect the parent window
        },
      }
    );
  }

  return null; // Not in iframe, continue normally
}

