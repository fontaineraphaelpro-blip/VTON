import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// /auth route handles OAuth flow
// authenticate.admin() will automatically redirect to Shopify OAuth if no session
// It preserves the return_to parameter in the OAuth redirect
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    // authenticate.admin() handles OAuth flow automatically
    // If no session, it redirects to Shopify OAuth with return_to preserved
    // If session exists, it returns normally
    const { session } = await authenticate.admin(request);
    
    if (session && session.shop) {
      // Session exists - check if there's a return_to parameter
      const url = new URL(request.url);
      const returnTo = url.searchParams.get("return_to");
      
      if (returnTo) {
        // Redirect to the return_to URL
        return redirect(returnTo);
      }
      
      // No return_to, redirect to app
      return redirect("/app");
    }
    
    // Should not reach here if authenticate.admin() works correctly
    return redirect("/app");
  } catch (error) {
    // If authenticate.admin() throws a Response (redirect), propagate it
    if (error instanceof Response) {
      throw error;
    }
    // For other errors, redirect to app
    return redirect("/app");
  }
};
