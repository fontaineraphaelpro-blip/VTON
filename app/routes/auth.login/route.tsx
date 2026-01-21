import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../../shopify.server";

// IMPORTANT: /auth/login is the default redirect target when authenticate.admin() detects no session
// However, shopify.login() may not work if the request doesn't have shop/host parameters
// SOLUTION: Extract return_to from query params and redirect to /auth with it
// This allows authenticate.admin() in /auth to handle OAuth properly
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  
  // If there's a return_to parameter, use it
  // Otherwise, try to construct return_to from current URL
  let returnTo = url.searchParams.get("return_to");
  
  if (!returnTo) {
    // Try to extract from referer or construct from request
    const referer = request.headers.get("referer");
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        // Preserve charge_id and other important params
        const importantParams = ["charge_id", "purchase", "pack", "credits"];
        const params = new URLSearchParams();
        importantParams.forEach(param => {
          const value = refererUrl.searchParams.get(param);
          if (value) params.set(param, value);
        });
        if (params.toString()) {
          returnTo = `${refererUrl.pathname}?${params.toString()}`;
        } else {
          returnTo = refererUrl.pathname;
        }
      } catch {
        // If referer parsing fails, use /app/credits as default
        returnTo = "/app/credits";
      }
    } else {
      returnTo = "/app/credits";
    }
  }
  
  // Redirect to /auth with return_to parameter
  // /auth will use authenticate.admin() which handles OAuth properly
  const authUrl = new URL("/auth", url.origin);
  authUrl.searchParams.set("return_to", returnTo);
  
  // Preserve any other query params that might be needed
  url.searchParams.forEach((value, key) => {
    if (key !== "return_to") {
      authUrl.searchParams.set(key, value);
    }
  });
  
  return redirect(authUrl.toString());
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Same as loader
  const url = new URL(request.url);
  let returnTo = url.searchParams.get("return_to") || "/app/credits";
  
  const authUrl = new URL("/auth", url.origin);
  authUrl.searchParams.set("return_to", returnTo);
  
  url.searchParams.forEach((value, key) => {
    if (key !== "return_to") {
      authUrl.searchParams.set(key, value);
    }
  });
  
  return redirect(authUrl.toString());
};
