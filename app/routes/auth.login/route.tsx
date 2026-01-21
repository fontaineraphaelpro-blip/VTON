import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

// For embedded apps, /auth/login should redirect to /auth
// /auth handles the OAuth flow via authenticate.admin()
// This preserves query parameters (like charge_id) in the OAuth redirect
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  
  // Preserve all query parameters when redirecting to /auth
  // This ensures charge_id and other params are preserved through OAuth
  const searchParams = url.searchParams.toString();
  const redirectUrl = searchParams ? `/auth?${searchParams}` : "/auth";
  
  return redirect(redirectUrl);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Same as loader - redirect to /auth with all params
  const url = new URL(request.url);
  const searchParams = url.searchParams.toString();
  const redirectUrl = searchParams ? `/auth?${searchParams}` : "/auth";
  
  return redirect(redirectUrl);
};
