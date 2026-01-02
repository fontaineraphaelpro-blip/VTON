import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const exitIframe = url.searchParams.get("exitIframe");
  return redirect(exitIframe || "/");
};

