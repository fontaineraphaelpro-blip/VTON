import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Preserve query parameters when redirecting to dashboard
  const url = new URL(request.url);
  const searchParams = url.searchParams.toString();
  const redirectUrl = searchParams 
    ? `/app/dashboard?${searchParams}` 
    : "/app/dashboard";
  
  return redirect(redirectUrl);
};
