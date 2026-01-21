import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// /auth route handles OAuth flow
// authenticate.admin() will automatically redirect to Shopify OAuth if no session
// It preserves the full request URL (with query params) in the OAuth return_to parameter
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // authenticate.admin() handles OAuth flow automatically
  // It preserves query parameters (like charge_id) in the OAuth redirect
  // After OAuth, it will return to the original URL with all params intact
  return authenticate.admin(request);
};
