import { useEffect } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { ensureTopLevelLoader } from "../lib/top-level.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from "@shopify/app-bridge/actions";

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

  const { admin, session } = await authenticate.admin(request);

  // After successful auth, redirect to /app using Remix redirect
  // The /app route will handle App Bridge navigation
  return redirect("/app");
};

// Simple component - redirect is handled by loader
export default function AuthCallback() {
  return (
    <div>
      <p>Redirecting to app...</p>
    </div>
  );
}
