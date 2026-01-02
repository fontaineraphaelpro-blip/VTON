import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

// For embedded apps, login is handled automatically via OAuth
// This route should redirect to the OAuth flow (/auth)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  // Always redirect to /auth for OAuth flow (never to /)
  if (shop) {
    return redirect(`/auth?shop=${shop}`);
  }
  
  // If no shop parameter, redirect to /auth (OAuth will handle it)
  // This prevents the redirect loop
  return redirect("/auth");
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const shop = formData.get("shop") as string;

  if (shop) {
    return redirect(`/auth?shop=${shop}`);
  }

  return redirect("/auth");
};
