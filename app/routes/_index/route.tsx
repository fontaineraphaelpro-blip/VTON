import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

// For embedded Shopify apps, redirect root to /app
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  
  // If shop parameter is present, redirect to /app with all params
  if (url.searchParams.get("shop")) {
    return redirect(`/app?${url.searchParams.toString()}`);
  }
  
  // Otherwise redirect to /app (Shopify will add params if needed)
  return redirect("/app");
};
