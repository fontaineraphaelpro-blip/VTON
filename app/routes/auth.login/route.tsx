import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// For embedded apps, login is handled automatically via OAuth
// This route should use authenticate.admin which will handle the OAuth flow automatically
// If there's no session, authenticate.admin will redirect to Shopify's OAuth flow
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // authenticate.admin will handle the OAuth flow automatically
  // It will redirect to Shopify's OAuth if no session exists
  await authenticate.admin(request);
  
  // If we reach here, authentication succeeded - redirect to /app
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/app",
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Same as loader
  await authenticate.admin(request);
  
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/app",
    },
  });
};
