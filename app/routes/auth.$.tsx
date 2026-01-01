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

  // Return data instead of redirect - we'll use App Bridge Redirect on client
  return { authenticated: true };
};

// Client component to redirect using App Bridge (OFFICIAL Shopify method)
export default function AuthCallback() {
  const loaderData = useLoaderData<typeof loader>();
  const app = useAppBridge();

  useEffect(() => {
    if (loaderData?.authenticated && app) {
      // Use App Bridge Redirect.Action.ADMIN_PATH (OFFICIAL Shopify method)
      // This properly handles iframe navigation and respects Shopify's security policies
      const redirectAction = Redirect.create(app);
      // Redirect to app path - App Bridge will handle the full admin.shopify.com URL
      redirectAction.dispatch(Redirect.Action.APP, "/app");
    }
  }, [loaderData, app]);

  return (
    <div>
      <p>Authenticating... Please wait.</p>
    </div>
  );
}
