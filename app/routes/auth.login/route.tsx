import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { login } from "../../shopify.server";
import { ensureTopLevelLoader } from "../../lib/top-level.server";

// Headers to ensure OAuth opens in main window (not iframe) - required for Firefox
export const headers: HeadersFunction = (headersArgs) => {
  if (!headersArgs?.request) {
    return {
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "frame-ancestors 'none'",
    };
  }
  
  const url = new URL(headersArgs.request.url);
  // Si embedded=1, ne pas appliquer les headers (le loader va rediriger)
  if (url.searchParams.get("embedded") === "1") {
    return {};
  }
  return {
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Force top-level if in iframe
  const topLevelRedirect = ensureTopLevelLoader(request);
  if (topLevelRedirect) {
    return topLevelRedirect;
  }

  // Extract shop from URL parameters (Shopify passes it automatically)
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  // If shop is provided, use login() which automatically redirects to OAuth
  // login() handles the OAuth flow and redirects to /auth/callback
  if (shop) {
    return login(request);
  }

  // If no shop parameter, return error page
  // In embedded apps, Shopify always provides the shop parameter
  return new Response("Shop parameter is required", { status: 400 });
};

// No component needed - loader handles redirect
export default function AuthLogin() {
  return null;
}
