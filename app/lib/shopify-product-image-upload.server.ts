import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { uploadGarmentImageToShopifyFiles } from "./shopify-garment-file-upload.server";

/**
 * @deprecated Use uploadGarmentImageToShopifyFiles — does not attach to product media.
 */
export async function uploadProductGarmentImage(
  admin: AdminApiContext["admin"],
  _productId: string,
  file: File
): Promise<string> {
  return uploadGarmentImageToShopifyFiles(admin, file);
}

export { uploadGarmentImageToShopifyFiles } from "./shopify-garment-file-upload.server";
