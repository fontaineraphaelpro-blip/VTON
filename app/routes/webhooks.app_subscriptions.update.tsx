import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getShop, upsertShop } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

/**
 * Webhook Handler for App Subscription Updates
 * 
 * Handles app_subscriptions/update webhook from Shopify.
 * This webhook is triggered when:
 * - A subscription is created and activated
 * - A subscription status changes (active, cancelled, expired, etc.)
 * - A subscription is renewed
 * 
 * We use this to sync subscription status with our database
 * and update credits accordingly.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic } = await authenticate.webhook(request);

    // Log webhook received (always log for debugging subscription issues)
    console.log(`[Subscription Webhook] Received ${topic} webhook for ${shop}`);

    await ensureTables();

    // Parse webhook payload
    const body = await request.json();
    const appSubscription = body.app_subscription;

    if (!appSubscription) {
      console.error("[Subscription Webhook] No app_subscription in webhook payload");
      return new Response("Missing app_subscription", { status: 400 });
    }

    const subscriptionId = appSubscription.id;
    const status = appSubscription.status; // ACTIVE, CANCELLED, EXPIRED, etc.
    const name = appSubscription.name;
    const lineItems = appSubscription.line_items || [];

    console.log(`[Subscription Webhook] Subscription ${subscriptionId} status: ${status} for shop ${shop}`);

    // Get current shop data
    const shopData = await getShop(shop);
    if (!shopData) {
      console.warn(`[Subscription Webhook] Shop ${shop} not found in database`);
      return new Response("Shop not found", { status: 404 });
    }

    // Extract monthly quota from subscription name or line items
    // Format: "Starter Plan - 50 try-ons/month" or similar
    let monthlyQuota = 0;
    if (name) {
      const match = name.match(/(\d+)\s*try-ons?/i);
      if (match) {
        monthlyQuota = parseInt(match[1], 10);
      }
    }

    // If we can't extract from name, try to get from line items
    // For now, we'll use the stored monthly_quota or default based on plan name
    if (monthlyQuota === 0 && shopData.monthly_quota) {
      monthlyQuota = shopData.monthly_quota;
    }

    // Handle different subscription statuses
    if (status === "ACTIVE") {
      // Subscription is active - ensure credits are set correctly
      console.log(`[Subscription Webhook] Subscription ${subscriptionId} is ACTIVE for shop ${shop}`);
      
      // If subscription just became active, add credits if needed
      // But don't override existing credits if they're higher
      const currentCredits = shopData.credits || 0;
      const newCredits = Math.max(currentCredits, monthlyQuota);

      await upsertShop(shop, {
        monthlyQuota: monthlyQuota,
        credits: newCredits,
      });

      console.log(`[Subscription Webhook] Updated shop ${shop}: monthly_quota=${monthlyQuota}, credits=${newCredits}`);
    } else if (status === "CANCELLED" || status === "EXPIRED" || status === "DECLINED") {
      // Subscription cancelled or expired - reset to free plan
      console.log(`[Subscription Webhook] Subscription ${subscriptionId} is ${status} for shop ${shop}`);
      
      // Reset to free plan (4 credits/month)
      await upsertShop(shop, {
        monthlyQuota: 4, // Free plan
        credits: Math.min(shopData.credits || 0, 4), // Cap at free plan credits
      });

      console.log(`[Subscription Webhook] Reset shop ${shop} to free plan`);
    } else {
      // Other statuses (PENDING, etc.) - just log
      console.log(`[Subscription Webhook] Subscription ${subscriptionId} status is ${status} for shop ${shop} - no action taken`);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[Subscription Webhook] Error processing webhook:", error);
    // Return 200 to prevent Shopify from retrying (we'll handle errors internally)
    return new Response("Error processing webhook", { status: 200 });
  }
};

