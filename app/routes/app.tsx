import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useNavigation, useRouteError } from "@remix-run/react";
import { useMemo } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import appStyles from "../styles/app.css?url";

import { authenticate } from "../shopify.server";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = useMemo(() => navigation.state === "loading", [navigation.state]);

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      {isLoading && (
        <div className="nav-loading-bar" role="progressbar" aria-busy="true" aria-valuetext="Loading" />
      )}
      <NavMenu>
        <Link to="/app" rel="home" prefetch="intent">
          Dashboard
        </Link>
        <Link to="/app/products" prefetch="intent">Products</Link>
        <Link to="/app/widget" prefetch="intent">Widget</Link>
        <Link to="/app/history" prefetch="intent">History</Link>
        <Link to="/app/credits" prefetch="intent">Credits</Link>
        <Link to="/app/privacy" prefetch="intent">Privacy Policy</Link>
        <Link to="/app/terms" prefetch="intent">Terms of Service</Link>
        <Link to="/app/support" prefetch="intent">Support</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  const shopifyHeaders = boundary.headers(headersArgs);
  
  // Remove X-Frame-Options if boundary added it (entry.server.tsx will handle CSP)
  const headers = new Headers(shopifyHeaders);
  headers.delete("X-Frame-Options");
  
  return headers;
};
