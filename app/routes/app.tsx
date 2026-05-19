import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useNavigation } from "@remix-run/react";
import { useEffect, useMemo } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import appStyles from "../styles/app.css?url";
import adminUiStyles from "../styles/admin-ui.css?url";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appStyles },
  { rel: "stylesheet", href: adminUiStyles },
];

/** Child routes authenticate; parent only supplies the API key (avoids double auth per navigation). */
export const loader = async (_args: LoaderFunctionArgs) => {
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = useMemo(() => navigation.state === "loading", [navigation.state]);

  useEffect(() => {
    const blockPinch = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    };
    const blockGesture = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener("touchstart", blockPinch, { passive: false });
    document.addEventListener("touchmove", blockPinch, { passive: false });
    document.addEventListener("gesturestart", blockGesture, { passive: false });
    document.addEventListener("gesturechange", blockGesture, { passive: false });
    document.addEventListener("gestureend", blockGesture, { passive: false });

    return () => {
      document.removeEventListener("touchstart", blockPinch);
      document.removeEventListener("touchmove", blockPinch);
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
      document.removeEventListener("gestureend", blockGesture);
    };
  }, []);

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
      <div className="vton-admin">
        <Outlet />
      </div>
    </AppProvider>
  );
}
