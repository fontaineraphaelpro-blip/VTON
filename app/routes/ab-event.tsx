/**
 * App Proxy strips /apps/tryon — storefront calls /ab-event
 * (https://shop.myshopify.com/apps/tryon/ab-event → https://app-url/ab-event)
 */
export { action, loader } from "./apps.tryon.ab-event";
