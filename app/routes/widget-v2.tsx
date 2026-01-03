/**
 * Fallback route for /widget-v2.js
 * Redirects to /apps/tryon/widget-v2.js
 */

import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // Redirect to the correct route
  const redirectUrl = url.pathname.replace('/widget-v2.js', '/apps/tryon/widget-v2.js');
  return redirect(redirectUrl + url.search, 301);
};

