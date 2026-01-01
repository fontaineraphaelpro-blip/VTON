import { useEffect } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { useAppBridge } from "@shopify/app-bridge-react";
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
  const loaderData = useLoaderData<typeof loader>();
  const app = useAppBridge();
  
  // Type guard to check if we have the embedded data
  const isEmbeddedData = (data: any): data is { shop: string; embedded: boolean; apiKey: string } => {
    return data && typeof data === "object" && "embedded" in data && "apiKey" in data;
  };
  
  const { shop, embedded, apiKey } = isEmbeddedData(loaderData) ? loaderData : { shop: null, embedded: false, apiKey: "" };

  useEffect(() => {
    if (embedded && shop && app && typeof window !== "undefined") {
      // Step 1: Launch OAuth from iframe using App Bridge Redirect.Action.REMOTE
      // Try to use App Bridge Redirect if available
      try {
        // @ts-ignore - @shopify/app-bridge/actions may not have types
        import("@shopify/app-bridge/actions").then((module) => {
          const { Redirect } = module;
          if (Redirect && Redirect.create) {
            const redirect = Redirect.create(app);
            redirect.dispatch(
              Redirect.Action.REMOTE,
              `https://accounts.shopify.com/select?shop=${shop}`
            );
          }
        }).catch(() => {
          // Fallback: use window.location if App Bridge Redirect not available
          window.location.href = `https://accounts.shopify.com/select?shop=${shop}`;
        });
      } catch (e) {
        // Fallback: use window.location
        window.location.href = `https://accounts.shopify.com/select?shop=${shop}`;
      }
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
