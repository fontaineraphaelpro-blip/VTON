export const PRODUCTS_PAGE_SIZE = 25;

export type ProductMediaImage = { id: string; url: string; altText?: string | null };

export type ShopifyProductRow = {
  id: string;
  title: string;
  handle?: string;
  featuredImage?: { url: string; altText?: string | null } | null;
  totalInventory?: number;
  status?: string;
  mediaImages: ProductMediaImage[];
};

export type ProductsPageInfo = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
};

export function buildProductsListUrl(params: {
  q?: string;
  after?: string | null;
  before?: string | null;
}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.after) search.set("after", params.after);
  if (params.before) search.set("before", params.before);
  const qs = search.toString();
  return qs ? `/app/products?${qs}` : "/app/products";
}
