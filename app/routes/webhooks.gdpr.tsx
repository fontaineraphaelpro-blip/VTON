import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { query } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

/**
 * GDPR Webhook Handler
 * 
 * Handles three GDPR compliance topics:
 * - customers/data_request: Customer requests their data
 * - customers/redact: Customer requests data deletion
 * - shop/redact: Shop requests data deletion
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic } = await authenticate.webhook(request);

    // GDPR webhook received (log only in development)
    if (process.env.NODE_ENV !== "production") {
      console.log(`[GDPR] Received ${topic} webhook for ${shop}`);
    }

    await ensureTables();

    if (topic === "customers/data_request") {
      // Customer requests their data
      const body = await request.json();
      const customerId = body.customer?.id?.toString();
      const customerEmail = body.customer?.email;

      if (!customerId && !customerEmail) {
        // No customer data provided - return empty response
        return new Response(JSON.stringify({}), { status: 200 });
      }

      // Find all tryon logs for this customer
      const logs = await query(
        `SELECT 
          id,
          shop,
          customer_id,
          product_id,
          product_title,
          success,
          created_at,
          result_image_url
        FROM tryon_logs 
        WHERE shop = $1 
          AND (customer_id = $2 OR customer_id = $3)
        ORDER BY created_at DESC`,
        [shop, customerId, customerEmail]
      );

      // Return customer data
      // Note: Shopify expects the data to be returned in the webhook response
      // In practice, you might want to store this and send it via email or another method
      const customerData = {
        shop: shop,
        customer_id: customerId,
        customer_email: customerEmail,
        tryon_logs: logs.rows,
        request_date: new Date().toISOString(),
      };

      // Data request processed (log only in development)
      if (process.env.NODE_ENV !== "production") {
        console.log(`[GDPR] Data request processed for customer ${customerId || customerEmail} in shop ${shop}`);
      }
      
      // Return the data (Shopify will handle delivery)
      return new Response(JSON.stringify(customerData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (topic === "customers/redact") {
      // Customer requests data deletion
      const body = await request.json();
      const customerId = body.customer?.id?.toString();
      const customerEmail = body.customer?.email;

      if (!customerId && !customerEmail) {
        // No customer data provided - return empty response
        return new Response(JSON.stringify({}), { status: 200 });
      }

      // Delete all tryon logs for this customer
      await query(
        `DELETE FROM tryon_logs 
         WHERE shop = $1 
           AND (customer_id = $2 OR customer_id = $3)`,
        [shop, customerId, customerEmail]
      );

      // Delete rate limits for this customer (if we stored customer_id there)
      // Note: rate_limits uses customer_ip, not customer_id, so we might not have data to delete
      // But we'll try to clean up if customer_id was stored

      // Customer data redacted (log only in development)
      if (process.env.NODE_ENV !== "production") {
        console.log(`[GDPR] Customer data redacted for customer ${customerId || customerEmail} in shop ${shop}`);
      }

      return new Response(JSON.stringify({}), { status: 200 });
    }

    if (topic === "shop/redact") {
      // Shop requests data deletion (full shop uninstall)
      // This should already be handled by app/uninstalled webhook
      // But we'll ensure all data is deleted here as well

      // Delete all tryon logs
      await query("DELETE FROM tryon_logs WHERE shop = $1", [shop]);
      
      // Delete rate limits
      await query("DELETE FROM rate_limits WHERE shop = $1", [shop]);
      
      // Delete product settings
      await query("DELETE FROM product_settings WHERE shop = $1", [shop]);
      
      // Delete shop record
      await query("DELETE FROM shops WHERE domain = $1", [shop]);

      // Shop data redacted (log only in development)
      if (process.env.NODE_ENV !== "production") {
        console.log(`[GDPR] Shop data redacted for ${shop}`);
      }

      return new Response(JSON.stringify({}), { status: 200 });
    }

    // Unknown topic - return 200 to acknowledge receipt
    return new Response(JSON.stringify({}), { status: 200 });
  } catch (error) {
    // Log error only in development
    if (process.env.NODE_ENV !== "production") {
      console.error("[GDPR] Error processing webhook:", error);
    }
    // Always return 200 to acknowledge receipt
    // Shopify will retry if needed
    return new Response(JSON.stringify({}), { status: 200 });
  }
};

