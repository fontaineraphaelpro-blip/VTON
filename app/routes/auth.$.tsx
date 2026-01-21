import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate, login } from "../shopify.server";

// /auth route handles OAuth flow
// This route handles both:
// 1. Standard OAuth flow from Shopify Admin (via authenticate.admin)
// 2. Manual OAuth initiation when shop parameter is present (via shopify.login)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  const returnTo = url.searchParams.get("return_to");
  
  // Si le paramètre shop est présent dans l'URL, utiliser shopify.login() directement
  // Cela permet de lancer l'OAuth même si la requête ne vient pas de l'iframe Shopify
  if (shopParam) {
    // shopify.login() va lancer l'OAuth flow et préserver automatiquement le return_to
    return login(request);
  }
  
  // Sinon, utiliser authenticate.admin() pour le flux OAuth standard
  try {
    // authenticate.admin() handles OAuth flow automatically
    // If no session, it redirects to Shopify OAuth with return_to preserved
    // If session exists, it returns normally
    const { session } = await authenticate.admin(request);
    
    if (session && session.shop) {
      // Session exists - check if there's a return_to parameter
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
