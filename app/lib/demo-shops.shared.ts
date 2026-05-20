/** Internal demo store — complimentary Studio access without Shopify billing. */
export const DEMO_SHOP_DOMAIN = "s1qf3z-70.myshopify.com";
export const DEMO_SHOP_PLAN = "studio";

export function isDemoShop(domain: string | null | undefined): boolean {
  return domain === DEMO_SHOP_DOMAIN;
}
