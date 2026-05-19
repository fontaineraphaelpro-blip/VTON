import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useNavigation } from "@remix-run/react";
import { useMemo } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import appStyles from "../styles/app.css?url";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appStyles },
];

/** Child routes authenticate; parent only supplies the API key (avoids double auth per navigation). */
export const loader = async (_args: LoaderFunctionArgs) => {
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
        <Link to="/app" rel="home" prefetch="none">
          Dashboard
        </Link>
        <Link to="/app/products" prefetch="none">
          Products
        </Link>
        <Link to="/app/widget" prefetch="none">
          Widget
        </Link>
        <Link to="/app/history" prefetch="none">
          History
        </Link>
        <Link to="/app/credits" prefetch="none">
          Credits
        </Link>
        <Link to="/app/privacy" prefetch="none">
          Privacy Policy
        </Link>
        <Link to="/app/terms" prefetch="none">
          Terms of Service
        </Link>
        <Link to="/app/support" prefetch="none">
          Support
        </Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}
