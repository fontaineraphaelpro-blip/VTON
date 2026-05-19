/** Normalize Shopify product IDs between admin (GID) and storefront (numeric/GID). */

export function productIdVariants(productId: string): string[] {
  const variants = new Set<string>();
  const trimmed = (productId || "").trim();
  if (!trimmed) return [];

  variants.add(trimmed);

  const gidMatch = trimmed.match(/^gid:\/\/shopify\/Product\/(\d+)$/i);
  if (gidMatch) {
    variants.add(gidMatch[1]);
    variants.add(`gid://shopify/Product/${gidMatch[1]}`);
  } else if (/^\d+$/.test(trimmed)) {
    variants.add(`gid://shopify/Product/${trimmed}`);
  }

  return Array.from(variants);
}

export function normalizeProductGid(productId: string): string {
  const trimmed = (productId || "").trim();
  const gidMatch = trimmed.match(/^gid:\/\/shopify\/Product\/(\d+)$/i);
  if (gidMatch) return `gid://shopify/Product/${gidMatch[1]}`;
  if (/^\d+$/.test(trimmed)) return `gid://shopify/Product/${trimmed}`;
  return trimmed;
}
