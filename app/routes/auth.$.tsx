import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ensureTopLevelLoader } from "../lib/top-level.server";
import { TopLevelRedirect } from "../lib/top-level.client";

// Headers to ensure OAuth opens in main window (not iframe) - required for Firefox
export const headers: HeadersFunction = () => {
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

  // Redirect to app dashboard after successful authentication
  return redirect("/app");
};

// Client component to ensure top-level
export default function AuthCallback() {
  return <TopLevelRedirect />;
}
