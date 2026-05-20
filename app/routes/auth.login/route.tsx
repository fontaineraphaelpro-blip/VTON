import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { login } from "../../shopify.server";

// IMPORTANT: /auth/login is the default redirect target when authenticate.admin() detects no session
// This route MUST use shopify.login() to initiate OAuth flow
// shopify.login() will handle OAuth and preserve return_to automatically
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Health checks / probes send HEAD without a body — login() calls formData() and crashes
  if (request.method === "HEAD") {
    return new Response(null, { status: 200 });
  }
  return login(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "HEAD") {
    return new Response(null, { status: 200 });
  }
  return login(request);
};
