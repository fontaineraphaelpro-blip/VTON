import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import {
  Link,
  Outlet,
  useLoaderData,
  useLocation,
  useNavigation,
  useRouteError,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "@remix-run/react";
import { useEffect, useMemo } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getLayoutShopContext } from "../lib/layout-shop-cache.server";
import { computeCreditsAlert } from "../lib/credits-alert";
import { CreditsAlertBanner } from "../components/CreditsAlertBanner";
import { GarmentUploadProvider } from "../contexts/GarmentUploadContext";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import appStyles from "../styles/app.css?url";
import adminUiStyles from "../styles/admin-ui.css?url";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appStyles },
  { rel: "stylesheet", href: adminUiStyles },
];

/**
 * Remix data requests (?_data=) authenticate via session token — URL has no ?shop=,
 * so Shopify logs "shop: null" even when the session is valid. Harmless noise.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const { session } = await authenticate.admin(request);

  try {
    const { creditsAlert } = await getLayoutShopContext(session.shop);
    return { apiKey, creditsAlert };
  } catch {
    return {
      apiKey,
      creditsAlert: computeCreditsAlert({
        credits: 0,
        monthlyUsage: 0,
        monthlyQuota: null,
      }),
    };
  }
};

/**
 * Layout shop/credits banner uses a 20s server cache (layout-shop-cache.server.ts).
 * Do not skip full layout revalidation on tab changes — that broke client navigations
 * (stuck page / raw JSON with braces) when combined with singleFetch.
 */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formMethod && formMethod !== "GET") {
    return true;
  }
  if (
    currentUrl.pathname.startsWith("/app/credits") ||
    nextUrl.pathname.startsWith("/app/credits")
  ) {
    return true;
  }
  return defaultShouldRevalidate;
}

export const headers: HeadersFunction = (headersArgs) => {
  return {
    ...boundary.headers(headersArgs),
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  };
};

export default function App() {
  const { apiKey, creditsAlert } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigation = useNavigation();
  const showGlobalCreditsAlert =
    creditsAlert.level !== "ok" && !location.pathname.startsWith("/app/credits");
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
        <Link to="/app" rel="home" prefetch="render">
          Dashboard
        </Link>
        <Link to="/app/products" prefetch="render">
          Products
        </Link>
        <Link to="/app/widget" prefetch="render">
          Widget
        </Link>
        <Link to="/app/history" prefetch="render">
          History
        </Link>
        <Link to="/app/credits" prefetch="render">
          Credits
        </Link>
        <Link to="/app/privacy" prefetch="render">
          Privacy Policy
        </Link>
        <Link to="/app/terms" prefetch="render">
          Terms of Service
        </Link>
        <Link to="/app/support" prefetch="render">
          Support
        </Link>
      </NavMenu>
      <div className="vton-admin">
        {showGlobalCreditsAlert && (
          <CreditsAlertBanner alert={creditsAlert} variant="global" />
        )}
        <GarmentUploadProvider>
          <Outlet />
        </GarmentUploadProvider>
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    const data =
      typeof error.data === "string"
        ? error.data.trim()
        : "";
    // Shopify boundary renders error.data as HTML; JSON bodies show as raw {…} and block the UI.
    if (data.startsWith("{") || data.startsWith("[")) {
      return (
        <div className="vton-admin app-container" style={{ padding: 24 }}>
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Unable to load this page</h1>
          <p style={{ color: "#6b7280", margin: "0 0 16px" }}>
            The navigation request failed. Refresh the app or open this section again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 16px",
              background: "#008060",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return boundary.error(error);
  }

  return boundary.error(error);
}
