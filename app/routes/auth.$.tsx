import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ensureTopLevelLoader } from "../lib/top-level.server";
import { TopLevelRedirect } from "../lib/top-level.client";

// Headers to ensure OAuth opens in main window (not iframe) - required for Firefox
// Ne pas appliquer les headers si embedded=1 (on va rediriger de toute façon)
export const headers: HeadersFunction = (headersArgs) => {
  // Vérifier si request existe
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

  const { admin, session } = await authenticate.admin(request);

  // Redirect to app dashboard after successful authentication
  return redirect("/app");
};

// Client component to ensure top-level
export default function AuthCallback() {
  // Only render on client side (TopLevelRedirect uses window)
  if (typeof window === "undefined") {
    return null;
  }
  return <TopLevelRedirect />;
}
