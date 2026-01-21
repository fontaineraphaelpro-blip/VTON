import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { login } from "../../shopify.server";

// IMPORTANT: /auth/login is the default redirect target when authenticate.admin() detects no session
// This route MUST use shopify.login() to initiate OAuth flow
// shopify.login() will handle OAuth and preserve return_to automatically
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // shopify.login() initiates OAuth flow
  // It automatically preserves query parameters including return_to
  // The shop parameter must be present in the request for this to work
  return login(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Same as loader
  return login(request);
};
