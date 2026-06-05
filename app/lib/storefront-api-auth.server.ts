import { getShop } from "./services/db.service";
import { isAuthorizedStorefrontApiRequest } from "./proxy-verify.server";

export function extractShopFromStorefrontQuery(
  queryParams: URLSearchParams
): string {
  let shop = queryParams.get("shop") || "";
  if (shop && !shop.endsWith(".myshopify.com")) {
    shop = `${shop}.myshopify.com`;
  }
  return shop;
}

/**
 * Authorize widget API calls from installed shops without App Proxy HMAC
 * (custom domains, ScriptTag-only installs, complex themes).
 */
export async function authorizeInstalledShopWidgetRequest(
  request: Request,
  queryParams: URLSearchParams,
  secret: string
): Promise<boolean> {
  if (isAuthorizedStorefrontApiRequest(request, queryParams, secret)) {
    return true;
  }

  const shop = extractShopFromStorefrontQuery(queryParams);
  if (!shop) {
    return false;
  }

  const hasProductRef =
    queryParams.get("product_id") || queryParams.get("product_handle");
  if (!hasProductRef) {
    return false;
  }

  const shopRecord = await getShop(shop);
  return Boolean(shopRecord);
}
