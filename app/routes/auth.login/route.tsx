import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

// For embedded apps, login is handled automatically via OAuth
// This route should redirect to the OAuth flow
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  // Always redirect to /auth for OAuth flow
  if (shop) {
    return redirect(`/auth?shop=${shop}`);
  }
  
  // If no shop parameter, redirect to root (Shopify will redirect with proper params)
  return redirect("/");
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const shop = formData.get("shop") as string;

  if (shop) {
    return redirect(`/auth?shop=${shop}`);
  }

  return redirect("/");
};
