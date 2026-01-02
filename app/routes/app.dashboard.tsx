import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

// Redirect dashboard to home (they are now merged)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return redirect("/app");
};
