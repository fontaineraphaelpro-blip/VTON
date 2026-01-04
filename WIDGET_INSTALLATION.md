# Virtual Try-On Widget Installation Guide

This guide explains how to install and use the Virtual Try-On widget on your Shopify storefront.

## Overview

The widget is a self-contained JavaScript file that:
- ✅ Uses **Shadow DOM** for complete CSS isolation (won't break your theme)
- ✅ Checks if try-on is enabled before showing
- ✅ Automatically injects a "Try On" button near the "Add to Cart" button
- ✅ Works on product pages only
- ✅ Mobile-responsive with bottom sheet on mobile
- ✅ Zero dependencies (vanilla JavaScript)

## Installation Methods

### Method 1: Shopify App Proxy (Recommended)

If you're using Shopify App Proxy, the widget will be automatically available at:
```
https://your-store.myshopify.com/apps/tryon/widget-v2.js
```

Add this script tag to your theme's product template (or use App Embed Blocks):

```liquid
{% comment %} Add to product.liquid or product-form.liquid {% endcomment %}
<script src="{{ shop.url }}/apps/tryon/widget-v2.js" defer></script>
```

### Method 2: Direct Script Injection

If you have access to your theme code, add this to your product template:

```liquid
{% comment %} In sections/product-form.liquid or similar {% endcomment %}
<script>
  (function() {
    var script = document.createElement('script');
    script.src = '{{ shop.url }}/apps/tryon/widget-v2.js';
    script.defer = true;
    document.head.appendChild(script);
  })();
</script>
```

### Method 3: App Embed Block (Theme App Extension)

If you're creating a Theme App Extension, create a block that injects the script:

```json
{
  "type": "app_embed",
  "name": "Virtual Try-On Widget",
  "settings": [
    {
      "type": "text",
      "id": "widget_url",
      "label": "Widget URL",
      "default": "/apps/tryon/widget-v2.js"
    }
  ]
}
```

Then in the block's liquid file:

```liquid
{% if block.settings.widget_url %}
  <script src="{{ block.settings.widget_url }}" defer></script>
{% endif %}
```

## How It Works

1. **Page Detection**: The widget automatically detects if the current page is a product page
2. **Status Check**: It calls `/apps/tryon/status` to check if try-on is enabled for the product
3. **Button Injection**: If enabled, it injects a "Try On" button near the "Add to Cart" button
4. **Modal Display**: Clicking the button opens a modal with:
   - Photo upload (drag & drop or click)
   - Preview of uploaded photo
   - Generate button
   - Loading state
   - Result display with before/after slider
   - Download and retry options

## Features

### CSS Isolation
- Uses **Shadow DOM** to completely isolate styles
- No CSS conflicts with your theme
- All styles are scoped to the widget

### Responsive Design
- Desktop: Centered modal
- Mobile: Bottom sheet animation
- Touch-friendly controls

### Error Handling
- Graceful error messages
- Retry functionality
- Status check before injection

## Configuration

The widget automatically uses settings from the admin panel:
- Button text
- Button colors (background and text)
- Maximum tries per user

These are fetched from the `/apps/tryon/status` endpoint.

## Troubleshooting

### Widget Not Showing

1. **Check if try-on is enabled**:
   - Go to admin → Products
   - Check if the toggle is ON for the product
   - Check if shop-level try-on is enabled in Dashboard

2. **Check browser console**:
   - Open Developer Tools (F12)
   - Look for `[VTON]` log messages
   - Check for any JavaScript errors

3. **Verify script is loaded**:
   - Check Network tab in DevTools
   - Look for `widget-v2.js` request
   - Should return 200 status

4. **Check product page detection**:
   - Widget only works on product pages
   - URL should contain `/products/`
   - Product ID must be extractable

### Button Not Appearing Near Add to Cart

The widget tries multiple methods to find the Add to Cart button. If it can't find it:
- Check browser console for `[VTON] Max retries reached`
- The widget will retry up to 15 times with 500ms delay
- Make sure your Add to Cart button has one of these selectors:
  - `form[action*="/cart/add"] button[type="submit"]`
  - `button[name="add"]`
  - `[data-add-to-cart]`
  - Or similar common Shopify selectors

### Modal Not Opening

1. Check if Shadow DOM is supported (all modern browsers)
2. Check browser console for errors
3. Verify the modal overlay is being created in the DOM

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

Requires Shadow DOM support (all modern browsers).

## Security

- Widget uses Shopify App Proxy signature verification
- All API calls go through authenticated endpoints
- No sensitive data stored in the widget
- HMAC signature verification on backend

## Customization

The widget uses settings from the admin panel. To customize:
1. Go to admin → Dashboard
2. Configure widget settings:
   - Button text
   - Button colors
   - Max tries per user

The widget will automatically use these settings.

## API Endpoints Used

- `GET /apps/tryon/status` - Check if try-on is enabled
- `POST /apps/tryon/generate` - Generate try-on result

Both endpoints require Shopify App Proxy authentication.

## Support

For issues or questions:
1. Check browser console for error messages
2. Verify backend endpoints are accessible
3. Check admin settings are configured correctly


