import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// /auth route - catch-all for auth paths
// If session exists, authenticate.admin() returns normally
// If no session, authenticate.admin() redirects to /auth/login (which uses shopify.login())
// This route should only be reached if there's already a session
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // authenticate.admin() will redirect to /auth/login if no session
  // If session exists, we can redirect to /app
  const { session } = await authenticate.admin(request);
  
  if (session && session.shop) {
    // Session exists - redirect to app
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/app",
      },
    });
  }
  
  // Should not reach here, but just in case
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/auth/login",
    },
  });
};
