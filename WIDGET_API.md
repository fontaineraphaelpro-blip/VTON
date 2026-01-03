# Widget API Documentation

This document describes the public API endpoints available for the client-side widget (to be implemented).

## Status Endpoint

### GET /apps/tryon/status

Public read-only endpoint to check if try-on is enabled for a product. This endpoint is accessible from the storefront and uses Shopify HMAC signature verification for security.

#### Query Parameters

- `shop` (required): Shop domain (e.g., `mystore.myshopify.com`)
- `product_id` (required): Shopify product ID (GID format: `gid://shopify/Product/123456` or numeric: `123456`)
- `signature` (required): HMAC signature from Shopify App Proxy

#### Response

```json
{
  "enabled": true,
  "shop_enabled": true,
  "product_enabled": true,
  "product_id": "gid://shopify/Product/123456",
  "shop": "mystore.myshopify.com",
  "widget_settings": {
    "text": "Try It On Now ✨",
    "backgroundColor": "#000000",
    "textColor": "#ffffff",
    "maxTriesPerUser": 5
  }
}
```

#### Response Fields

- `enabled`: `boolean` - Whether try-on is enabled for this product (both shop and product must be enabled)
- `shop_enabled`: `boolean` - Whether try-on is enabled at the shop level
- `product_enabled`: `boolean` - Whether try-on is enabled for this specific product
- `product_id`: `string` - The product ID that was queried
- `shop`: `string` - The shop domain
- `widget_settings`: `object | null` - Widget configuration (only present if `enabled` is `true`)
  - `text`: Button text
  - `backgroundColor`: Button background color
  - `textColor`: Button text color
  - `maxTriesPerUser`: Maximum try-ons per user per day

#### Error Responses

**403 Forbidden** - Invalid signature
```json
{
  "error": "Invalid signature - request not from Shopify"
}
```

**400 Bad Request** - Missing parameters
```json
{
  "error": "Shop parameter missing"
}
```
or
```json
{
  "error": "product_id parameter required"
}
```

**500 Internal Server Error** - Server error
```json
{
  "error": "Failed to check try-on status",
  "message": "Error details"
}
```

#### Usage Example (Future Widget Implementation)

```javascript
// Example: Check if try-on is enabled for current product
async function checkTryOnEnabled(productId) {
  const shop = window.Shopify?.shop || getShopFromUrl();
  const url = new URL('/apps/tryon/status', window.location.origin);
  
  // Add Shopify App Proxy parameters (signature will be added by Shopify)
  url.searchParams.set('shop', shop);
  url.searchParams.set('product_id', productId);
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.enabled && data.widget_settings) {
      // Show try-on button with custom settings
      showTryOnButton(data.widget_settings);
    }
  } catch (error) {
    console.error('Failed to check try-on status:', error);
  }
}
```

## Generate Endpoint

### POST /apps/tryon/generate

Existing endpoint for generating try-on results. See `apps.tryon.generate.tsx` for details.

## Security

Both endpoints use Shopify HMAC signature verification to ensure requests come from authenticated Shopify App Proxy requests. The signature is automatically added by Shopify when the request is made through the App Proxy.

## Data Models

### Shop Settings (`shops` table)
- `is_enabled`: Shop-level try-on toggle (default: `true`)
- `widget_text`: Button text
- `widget_bg`: Button background color
- `widget_color`: Button text color
- `max_tries_per_user`: Maximum try-ons per user per day
- `daily_limit`: Daily limit for all users
- `monthly_quota`: Monthly quota limit (optional)
- `quality_mode`: Quality vs speed setting

### Product Settings (`product_settings` table)
- `tryon_enabled`: Product-level try-on toggle (default: `true`)
- `shop`: Shop domain
- `product_id`: Shopify product ID

### Try-On Logic

Try-on is enabled for a product if:
1. Shop-level `is_enabled` is `true` (or not set, defaults to `true`)
2. Product-level `tryon_enabled` is `true` (or not set, defaults to `true`)

Both conditions must be met for try-on to be available.

