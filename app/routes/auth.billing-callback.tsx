// Public route to handle Shopify billing/payment return
// This route does NOT require authentication (exit hatch)
// Redirect to /app (not /app/credits) so the session is rehydrated
import { type LoaderFunctionArgs, redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const chargeId = url.searchParams.get("charge_id");

  if (!shop || !chargeId) {
    return new Response("Missing parameters", { status: 400 });
  }

  // Redirect to /app so session is rehydrated; /app will pass charge_id to /app/credits
  return redirect(`/auth?shop=${encodeURIComponent(shop)}&return_to=${encodeURIComponent(`/app?charge_id=${encodeURIComponent(chargeId)}`)}`);
};

