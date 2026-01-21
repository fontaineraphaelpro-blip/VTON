import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { login } from "../../shopify.server";

// IMPORTANT: /auth/login is the default redirect target when authenticate.admin() detects no session
// (because authPathPrefix: "/auth" in shopify.server.ts)
// This route MUST use shopify.login() to initiate OAuth flow directly
// DO NOT redirect to /auth as that creates an infinite loop
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // shopify.login() initiates the OAuth flow directly
  // It preserves query parameters (like charge_id) automatically in the OAuth return_to
  return login(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Same as loader - use shopify.login() to initiate OAuth
  return login(request);
};
