import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

// For embedded apps, login is handled automatically via OAuth
// This route should redirect to the OAuth flow (/auth)
// Preserve all query parameters for proper Shopify authentication
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  
  // Preserve all query parameters when redirecting to /auth
  const searchParams = url.searchParams.toString();
  const redirectUrl = searchParams ? `/auth?${searchParams}` : "/auth";
  
  return redirect(redirectUrl);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  
  // Preserve all query parameters when redirecting to /auth
  const searchParams = url.searchParams.toString();
  const redirectUrl = searchParams ? `/auth?${searchParams}` : "/auth";
  
  return redirect(redirectUrl);
};
