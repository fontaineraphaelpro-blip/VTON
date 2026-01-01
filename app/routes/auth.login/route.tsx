import { useEffect } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from "@shopify/app-bridge/actions";
import { login } from "../../shopify.server";

// Headers - allow iframe for embedded apps
export const headers: HeadersFunction = () => {
  // Don't block iframe - we'll use App Bridge Redirect
  return {};
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const embedded = url.searchParams.get("embedded") === "1";

  // If embedded=1, return data for App Bridge Redirect
  // If not embedded, use traditional login() redirect
  if (embedded && shop) {
    // Return shop and embedded flag for App Bridge Redirect
    return { shop, embedded: true, apiKey: process.env.SHOPIFY_API_KEY || "" };
  }

  // Not embedded - use traditional login() redirect (top-level)
  if (shop) {
    return login(request);
  }

  return { shop: null, embedded: false, apiKey: process.env.SHOPIFY_API_KEY || "" };
};

// Component to handle App Bridge Redirect for OAuth
export default function AuthLogin() {
  const { shop, embedded, apiKey } = useLoaderData<typeof loader>();
  const app = useAppBridge();

  useEffect(() => {
    if (embedded && shop && app) {
      // Step 1: Launch OAuth from iframe using App Bridge Redirect.Action.REMOTE
      const redirect = Redirect.create(app);
      redirect.dispatch(
        Redirect.Action.REMOTE,
        `https://accounts.shopify.com/select?shop=${shop}`
      );
    }
  }, [embedded, shop, app]);

  // If embedded, wrap in AppProvider for App Bridge access
  if (embedded && apiKey) {
    return (
      <AppProvider isEmbeddedApp apiKey={apiKey}>
        <div>
          <p>Redirecting to Shopify OAuth...</p>
        </div>
      </AppProvider>
    );
  }

  // Not embedded - show loading
  return (
    <div>
      <p>Loading...</p>
    </div>
  );
}
