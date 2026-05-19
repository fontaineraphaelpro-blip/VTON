/** Deep link to Theme editor → App embeds for this app's block. */
export function getAppEmbedActivationUrl(
  shop: string,
  apiKey: string,
  blockHandle = "vton-widget"
): string {
  const shopDomain = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  const key = apiKey || process.env.SHOPIFY_API_KEY || "";
  return `https://${shopDomain}/admin/themes/current/editor?context=apps&activateAppId=${key}/${blockHandle}`;
}
