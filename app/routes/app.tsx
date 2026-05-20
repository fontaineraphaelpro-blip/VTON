import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useLocation, useNavigation } from "@remix-run/react";
import { useEffect, useMemo } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShop, getMonthlyTryonUsage } from "../lib/services/db.service";
import { computeCreditsAlert } from "../lib/credits-alert";
import { CreditsAlertBanner } from "../components/CreditsAlertBanner";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import appStyles from "../styles/app.css?url";
import adminUiStyles from "../styles/admin-ui.css?url";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appStyles },
  { rel: "stylesheet", href: adminUiStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const apiKey = process.env.SHOPIFY_API_KEY || "";

  const { session } = await authenticate.admin(request);

  try {
    const shopData = await getShop(session.shop);
    const monthlyUsage = await getMonthlyTryonUsage(session.shop).catch(() => 0);
    const creditsAlert = computeCreditsAlert({
      credits: shopData?.credits ?? 0,
      monthlyUsage,
      monthlyQuota: shopData?.monthly_quota ?? null,
    });

    return { apiKey, creditsAlert, buildId: getBuildId() };
  } catch {
    return {
      apiKey,
      creditsAlert: computeCreditsAlert({
        credits: 0,
        monthlyUsage: 0,
        monthlyQuota: null,
      }),
      buildId: getBuildId(),
    };
  }
};

function getBuildId() {
  const id = process.env.APP_BUILD_ID || process.env.RAILWAY_GIT_COMMIT_SHA || "";
  return id ? id.slice(0, 7) : "dev";
}

export const headers: HeadersFunction = (headersArgs) => {
  return {
    ...boundary.headers(headersArgs),
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  };
};

export default function App() {
  const { apiKey, creditsAlert, buildId } = useLoaderData<typeof loader>();
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
        {showGlobalCreditsAlert && (
          <CreditsAlertBanner alert={creditsAlert} variant="global" />
        )}
        <Outlet />
        {buildId ? (
          <p className="vton-build-id" title={`Build ${buildId}`}>
            Build {buildId}
          </p>
        ) : null}
      </div>
    </AppProvider>
  );
}
