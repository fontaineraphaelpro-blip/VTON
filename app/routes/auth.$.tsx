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

  // Si la page est dans une iframe (embedded=1), on force la sortie
  if (url.searchParams.get("embedded") === "1") {
    // Retirer le paramètre embedded et rediriger hors iframe
    url.searchParams.delete("embedded");
    return redirect(url.pathname + url.search, {
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
