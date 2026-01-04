# Testing Payments with Managed Pricing App

## Problem

When your app is configured as a **Managed Pricing App** in Shopify Partners, Shopify blocks all calls to the Billing API (`appSubscriptionCreate`, `appPurchaseOneTimeCreate`, etc.). This is expected behavior - Shopify handles billing automatically via the App Store listing.

## Solution for Testing

For testing purposes, you have two options:

### Option 1: Direct Plan Activation (Recommended for Development)

The app now includes a test mode that activates plans directly in the database when:
- `NODE_ENV !== "production"` (development mode), OR
- `ENABLE_DIRECT_PLAN_ACTIVATION=true` environment variable is set

This allows you to test all plan features without needing actual payments.

**To enable in production for testing:**
```env
ENABLE_DIRECT_PLAN_ACTIVATION=true
```

**How it works:**
- When you click "Purchase" on a paid plan, it activates the plan directly in the database
- No payment flow, no Shopify Billing API calls
- Perfect for testing quota limits, plan switching, etc.

### Option 2: Disable Managed Pricing (Temporary)

If you need to test the actual payment flow with Shopify Billing API:

1. Go to your Shopify Partners Dashboard
2. Navigate to your app settings
3. **Disable** "Managed Pricing" temporarily
4. Test the payment flow
5. **Re-enable** "Managed Pricing" before submitting to App Store

⚠️ **Warning**: You must re-enable Managed Pricing before submitting to the App Store, as this is typically a requirement for approval.

## Production Behavior

In production with Managed Pricing enabled:
- Shopify automatically handles billing via the App Store listing
- Merchants subscribe through the App Store, not through your app
- Your app receives subscription status updates via webhooks (if configured)
- You should activate plans based on webhook events, not direct purchases

## Recommended Testing Flow

1. **Development/Testing**: Use `ENABLE_DIRECT_PLAN_ACTIVATION=true` to test all features
2. **Pre-production**: Disable Managed Pricing temporarily to test payment flows
3. **Production**: Re-enable Managed Pricing and handle subscriptions via App Store

## Environment Variables

```env
# For testing payments directly (bypasses Managed Pricing restriction)
ENABLE_DIRECT_PLAN_ACTIVATION=true

# Standard environment variables
NODE_ENV=production
DATABASE_URL=...
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
REPLICATE_API_TOKEN=...
```

