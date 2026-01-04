import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { query } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  // Webhook received (log only in development)
  if (process.env.NODE_ENV !== "production") {
    console.log(`Received ${topic} webhook for ${shop}`);
  }

  try {
    // Ensure database tables exist before cleanup
    await ensureTables();

    // 1. Delete all sessions for this shop
    if (session) {
      await db.session.deleteMany({ where: { shop } });
    }

    // 2. Delete all business data for this shop
    // Delete tryon logs
    await query("DELETE FROM tryon_logs WHERE shop = $1", [shop]);
    
    // Delete rate limits
    await query("DELETE FROM rate_limits WHERE shop = $1", [shop]);
    
    // Delete product settings
    await query("DELETE FROM product_settings WHERE shop = $1", [shop]);
    
    // Delete shop record
    await query("DELETE FROM shops WHERE domain = $1", [shop]);

    // 3. Delete all script tags created by this app
    // Note: This requires admin access, which may not be available after uninstall
    // Script tags will be automatically cleaned up by Shopify after uninstall
    // But we try to clean them up if possible
    try {
      // This will only work if we still have admin access
      // If not, Shopify will clean up script tags automatically
      const scriptTagsQuery = `#graphql
        query {
          scriptTags(first: 50) {
            edges {
              node {
                id
                src
              }
            }
          }
        }
      `;
      
      // We can't use admin.graphql here because the session might be deleted
      // Script tags will be cleaned up by Shopify automatically
    } catch (scriptTagError) {
      // Ignore script tag cleanup errors - Shopify will handle it
    }

    // Cleanup completed successfully (log only in development)
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Uninstall] Successfully cleaned up all data for ${shop}`);
    }
  } catch (error) {
    // Log error but don't fail the webhook
    // Shopify expects a 200 response even if cleanup fails
    // Log only in development to avoid exposing errors in production
    if (process.env.NODE_ENV !== "production") {
      console.error(`[Uninstall] Error cleaning up data for ${shop}:`, error);
    }
  }

  return new Response();
};
