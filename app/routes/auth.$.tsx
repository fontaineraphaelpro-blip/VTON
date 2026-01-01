import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Headers to ensure OAuth opens in main window (not iframe) - required for Firefox
export const headers: HeadersFunction = () => {
  return {
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  // Si embedded=1 ou qu'on est dans un iframe, rediriger vers /auth
  if (url.searchParams.get("embedded") === "1") {
    // Rediriger vers /auth avec le shop si présent
    const authUrl = shop ? `/auth?shop=${shop}` : "/auth";
    return redirect(authUrl, {
      headers: {
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "frame-ancestors 'none'",
      },
    });
  }

  const { admin, session } = await authenticate.admin(request);

  // Redirect to app dashboard after successful authentication
  return redirect("/app");
};
