import type { LoaderFunctionArgs } from "@remix-run/node";

/** Lightweight health check for Railway / uptime monitors (no Shopify auth). */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "HEAD") {
    return new Response(null, { status: 200 });
  }

  const buildId =
    process.env.APP_BUILD_ID ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    "unknown";

  return Response.json({
    ok: true,
    service: "vton",
    commit: buildId.slice(0, 7),
    fullCommit: buildId,
  });
};
