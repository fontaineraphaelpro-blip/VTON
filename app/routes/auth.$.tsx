import { useEffect } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from "@shopify/app-bridge/actions";

// Headers - allow iframe for embedded apps
export const headers: HeadersFunction = () => {
  // Don't block iframe - we'll use App Bridge Redirect
  return {};
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const embedded = url.searchParams.get("embedded") === "1";

  // Authenticate
  const { admin, session } = await authenticate.admin(request);

  // Return data for App Bridge Redirect (Step 3: Redirect to Admin Shopify)
  return {
    authenticated: true,
    embedded,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
  };
};

// Step 3: After OAuth callback, redirect to Admin Shopify using App Bridge
export default function AuthCallback() {
  const { authenticated, embedded, apiKey, shop } = useLoaderData<typeof loader>();
  const app = useAppBridge();

  useEffect(() => {
    if (authenticated && embedded && app && shop) {
      // Step 3: Redirect to Admin Shopify using App Bridge Redirect.Action.APP
      const redirect = Redirect.create(app);
      redirect.dispatch(Redirect.Action.APP, "/app");
    }
  }, [authenticated, embedded, app, shop]);

  // Wrap in AppProvider for App Bridge access
  if (embedded && apiKey) {
    return (
      <AppProvider isEmbeddedApp apiKey={apiKey}>
        <div>
          <p>Authenticating... Redirecting to app...</p>
        </div>
      </AppProvider>
    );
  }

  return (
    <div>
      <p>Authenticating...</p>
    </div>
  );
}
