/** Theme editor → App embeds panel (lists all app embeds). */
export function getThemeEditorAppEmbedsUrl(shop: string): string {
  const shopDomain = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  return `https://${shopDomain}/admin/themes/current/editor?context=apps`;
}

/** Deep link to activate a specific app embed block. */
export function getAppEmbedActivationUrl(
  shop: string,
  apiKey: string,
  blockHandle = "vton-widget"
): string {
  const shopDomain = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  const key = apiKey || process.env.SHOPIFY_API_KEY || "";
  return `https://${shopDomain}/admin/themes/current/editor?context=apps&activateAppId=${key}/${blockHandle}`;
}
