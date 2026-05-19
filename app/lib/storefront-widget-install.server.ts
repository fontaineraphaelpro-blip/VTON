/**
 * Auto-install storefront widget via ScriptTag (works without Theme Editor app embed).
 */

const SCRIPT_PATH = "/storefront/vton-boot.js";

function getAppBaseUrl(): string {
  const url = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  if (!url) {
    throw new Error("SHOPIFY_APP_URL is not configured");
  }
  return url;
}

function isVtonScriptTag(src: string): boolean {
  const lower = src.toLowerCase();
  return (
    lower.includes("vton-boot") ||
    lower.includes("vton-widget") ||
    lower.includes("/apps/tryon/widget") ||
    lower.includes("widget-v2")
  );
}

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> }
  ) => Promise<Response>;
};

export async function ensureStorefrontWidgetScriptTag(
  admin: AdminGraphql
): Promise<{ installed: boolean; skipped?: string }> {
  const scriptSrc = `${getAppBaseUrl()}${SCRIPT_PATH}`;

  const listResponse = await admin.graphql(`#graphql
    query VtonScriptTags {
      scriptTags(first: 50) {
        edges {
          node {
            id
            src
          }
        }
      }
    }
  `);

  if (!listResponse.ok) {
    return { installed: false, skipped: `scriptTags query failed (${listResponse.status})` };
  }

  const listJson = (await listResponse.json()) as {
    data?: { scriptTags?: { edges?: { node: { id: string; src: string } }[] } };
    errors?: { message: string }[];
  };

  if (listJson.errors?.length) {
    return { installed: false, skipped: listJson.errors.map((e) => e.message).join(", ") };
  }

  const edges = listJson.data?.scriptTags?.edges || [];
  let hasCurrent = false;
  const staleIds: string[] = [];

  for (const edge of edges) {
    const node = edge.node;
    if (!node?.src) continue;
    if (node.src === scriptSrc) {
      hasCurrent = true;
      continue;
    }
    if (isVtonScriptTag(node.src)) {
      staleIds.push(node.id);
    }
  }

  for (const id of staleIds) {
    await admin.graphql(
      `#graphql
      mutation VtonScriptTagDelete($id: ID!) {
        scriptTagDelete(id: $id) {
          deletedScriptTagId
          userErrors { field message }
        }
      }`,
      { variables: { id } }
    );
  }

  if (hasCurrent) {
    return { installed: true };
  }

  const createResponse = await admin.graphql(
    `#graphql
    mutation VtonScriptTagCreate($input: ScriptTagInput!) {
      scriptTagCreate(input: $input) {
        scriptTag { id src }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: {
          src: scriptSrc,
          displayScope: "ONLINE_STORE",
          cache: false,
        },
      },
    }
  );

  if (!createResponse.ok) {
    return { installed: false, skipped: `scriptTagCreate failed (${createResponse.status})` };
  }

  const createJson = (await createResponse.json()) as {
    data?: {
      scriptTagCreate?: {
        scriptTag?: { id: string };
        userErrors?: { message: string }[];
      };
    };
    errors?: { message: string }[];
  };

  const userErrors = createJson.data?.scriptTagCreate?.userErrors || [];
  if (userErrors.length > 0) {
    return { installed: false, skipped: userErrors.map((e) => e.message).join(", ") };
  }

  if (createJson.errors?.length) {
    return { installed: false, skipped: createJson.errors.map((e) => e.message).join(", ") };
  }

  return { installed: Boolean(createJson.data?.scriptTagCreate?.scriptTag?.id) };
}
