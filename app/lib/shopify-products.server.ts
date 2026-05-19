import {
  PRODUCTS_PAGE_SIZE,
  type ShopifyProductRow,
  type ProductsPageInfo,
  type ProductMediaImage,
} from "./shopify-products.shared";

export {
  PRODUCTS_PAGE_SIZE,
  type ShopifyProductRow,
  type ProductsPageInfo,
  type ProductMediaImage,
} from "./shopify-products.shared";

export class ShopifyProductsFetchError extends Error {
  readonly status?: number;
  readonly reauthUrl?: string | null;

  constructor(
    message: string,
    options?: { status?: number; reauthUrl?: string | null }
  ) {
    super(message);
    this.name = "ShopifyProductsFetchError";
    this.status = options?.status;
    this.reauthUrl = options?.reauthUrl;
  }
}

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> }
  ) => Promise<Response>;
};

export function buildProductSearchQuery(term: string): string | undefined {
  const trimmed = term.trim();
  if (!trimmed) return undefined;
  const escaped = trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `title:*${escaped}* OR handle:*${escaped}*`;
}

export function parseShopifyProductNode(
  node: Record<string, unknown>
): ShopifyProductRow {
  const n = node as {
    id: string;
    title: string;
    handle?: string;
    featuredImage?: { url: string; altText?: string | null };
    totalInventory?: number;
    status?: string;
    media?: {
      edges?: {
        node?: {
          id?: string;
          image?: { url?: string; altText?: string | null };
        };
      }[];
    };
  };

  const mediaImages: ProductMediaImage[] = [];
  const seen = new Set<string>();

  const pushUrl = (id: string, url?: string, altText?: string | null) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    mediaImages.push({ id, url, altText });
  };

  if (n.featuredImage?.url) {
    pushUrl("featured", n.featuredImage.url, n.featuredImage.altText);
  }

  n.media?.edges?.forEach((m, idx) => {
    const img = m.node?.image;
    if (img?.url) {
      pushUrl(m.node?.id || `media-${idx}`, img.url, img.altText);
    }
  });

  return {
    id: n.id,
    title: n.title,
    handle: n.handle,
    featuredImage: n.featuredImage,
    totalInventory: n.totalInventory,
    status: n.status,
    mediaImages,
  };
}

export async function fetchProductsPage(
  admin: AdminGraphql,
  options: {
    search?: string;
    after?: string | null;
    before?: string | null;
    pageSize?: number;
  }
): Promise<{
  products: ShopifyProductRow[];
  pageInfo: ProductsPageInfo;
}> {
  const pageSize = options.pageSize ?? PRODUCTS_PAGE_SIZE;
  const queryFilter = buildProductSearchQuery(options.search ?? "");

  const useBackward = Boolean(options.before);
  const variables: Record<string, unknown> = {
    query: queryFilter ?? null,
  };

  if (useBackward) {
    variables.last = pageSize;
    variables.before = options.before;
  } else {
    variables.first = pageSize;
    variables.after = options.after || null;
  }

  const response = await admin.graphql(
    `#graphql
    query VtonProductsCatalog(
      $first: Int
      $last: Int
      $after: String
      $before: String
      $query: String
    ) {
      products(
        first: $first
        last: $last
        after: $after
        before: $before
        query: $query
        sortKey: TITLE
      ) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        edges {
          node {
            id
            title
            handle
            featuredImage {
              url
              altText
            }
            totalInventory
            status
            media(first: 12) {
              edges {
                node {
                  ... on MediaImage {
                    id
                    image {
                      url
                      altText
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { variables }
  );

  if (!response.ok) {
    const reauthUrl =
      response.status === 401
        ? response.headers.get(
            "x-shopify-api-request-failure-reauthorize-url"
          )
        : null;
    const errorText = await response
      .text()
      .catch(() => `HTTP ${response.status}`);
    throw new ShopifyProductsFetchError(
      `Shopify API error (${response.status}): ${errorText.substring(0, 200)}`,
      { status: response.status, reauthUrl }
    );
  }

  const responseJson = (await response.json()) as {
    data?: {
      products?: {
        pageInfo?: ProductsPageInfo;
        edges?: { node: Record<string, unknown> }[];
      };
    };
    errors?: { message: string }[];
  };

  if (responseJson.errors?.length) {
    throw new ShopifyProductsFetchError(
      `GraphQL error: ${responseJson.errors.map((e) => e.message).join(", ")}`
    );
  }

  const connection = responseJson.data?.products;
  const products =
    connection?.edges?.map((edge) => parseShopifyProductNode(edge.node)) ?? [];

  const pageInfo = connection?.pageInfo ?? {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null,
  };

  return { products, pageInfo };
}
