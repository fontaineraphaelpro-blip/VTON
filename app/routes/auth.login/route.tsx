import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { login } from "../../shopify.server";

// For embedded apps, the /auth/login route must use shopify.login() directly
// This is required by Shopify - authenticate.admin() should NOT be used here
// shopify.login() handles the OAuth flow and redirects appropriately
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // shopify.login() handles the OAuth flow automatically
  // It will redirect to Shopify's OAuth or back to the app as needed
  return login(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Same as loader - use shopify.login() for the login route
  return login(request);
};
