import { useEffect } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { ensureTopLevelLoader } from "../lib/top-level.server";
import { useAppBridge } from "@shopify/app-bridge-react";

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

  // Return data instead of redirect - we'll use App Bridge Redirect on client
  return { authenticated: true };
};

// Client component to redirect using App Bridge
export default function AuthCallback() {
  const loaderData = useLoaderData<typeof loader>();
  const app = useAppBridge();

  useEffect(() => {
    if (loaderData?.authenticated) {
      // Use window.location for top-level redirect (App Bridge not needed here)
      // After auth, redirect to app - this will work because we're already top-level
      window.location.href = "/app";
    }
  }, [loaderData]);

  return (
    <div>
      <p>Authenticating... Please wait.</p>
    </div>
  );
}
