/**
 * ==========================================
 * DATABASE SERVICE
 * ==========================================
 * 
 * Service for business database operations (shops, tryon_logs, etc.)
 * Uses pg directly for raw SQL queries since Prisma schema is primarily for Session storage.
 */

import pg from "pg";
import { productIdVariants } from "../product-id.server";
import {
  invalidateStatusCacheForProduct,
  invalidateStatusCacheForShop,
} from "../status-cache.server";

export { productIdVariants, normalizeProductGid } from "../product-id.server";
const { Pool } = pg;

// Database connection pool
const DATABASE_URL = process.env.DATABASE_URL;
const connectionString = DATABASE_URL?.replace(/^postgres:\/\//, "postgresql://");

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  : null;

/**
 * Executes a raw SQL query.
 */
export async function query(text: string, params: any[] = []) {
  if (!pool) {
    throw new Error("PostgreSQL not configured");
  }
  return pool.query(text, params);
}

/**
 * Gets a shop by domain.
 */
export async function getShop(domain: string) {
  const result = await query(
    "SELECT * FROM shops WHERE domain = $1",
    [domain]
  );
  
  return (result.rows as any[]).length > 0 ? result.rows[0] : null;
}

/**
 * Creates or updates a shop.
 */
export async function upsertShop(domain: string, data: {
  accessToken?: string;
  credits?: number;
  addCredits?: number;
  widgetText?: string;
  widgetBg?: string;
  widgetColor?: string;
  maxTriesPerUser?: number;
  isEnabled?: boolean;
  dailyLimit?: number;
  incrementTotalTryons?: boolean;
  incrementTotalAtc?: boolean;
  total_tryons?: number;
  monthlyQuota?: number | null;
  qualityMode?: string;
  monthly_quota_used?: number;
  last_quota_reset?: string;
  review_shown?: boolean;
  last_review_prompt_date?: Date | null;
  abTestEnabled?: boolean;
  abTestPercent?: number;
}) {
  const shop = await getShop(domain);
  
  if (shop) {
    // Update existing shop
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (data.accessToken !== undefined) {
      updates.push(`access_token = $${paramIndex++}`);
      params.push(data.accessToken);
    }
    if (data.credits !== undefined) {
      updates.push(`credits = $${paramIndex++}`);
      params.push(data.credits);
    }
    if (data.addCredits !== undefined) {
      updates.push(`credits = credits + $${paramIndex++}`);
      params.push(data.addCredits);
    }
    
    // Special handling for specific shop: 3aavx5-9u.myshopify.com
    // Ensure credits are at least 1000 if not explicitly being modified
    if (domain === "3aavx5-9u.myshopify.com" && data.credits === undefined && data.addCredits === undefined) {
      updates.push(`credits = GREATEST(credits, 1000)`);
    }
    if (data.widgetText !== undefined) {
      updates.push(`widget_text = $${paramIndex++}`);
      params.push(data.widgetText);
    }
    if (data.widgetBg !== undefined) {
      updates.push(`widget_bg = $${paramIndex++}`);
      params.push(data.widgetBg);
    }
    if (data.widgetColor !== undefined) {
      updates.push(`widget_color = $${paramIndex++}`);
      params.push(data.widgetColor);
    }
    if (data.maxTriesPerUser !== undefined) {
      updates.push(`max_tries_per_user = $${paramIndex++}`);
      params.push(data.maxTriesPerUser);
    }
    if (data.isEnabled !== undefined) {
      updates.push(`is_enabled = $${paramIndex++}`);
      params.push(data.isEnabled);
    }
    if (data.dailyLimit !== undefined) {
      updates.push(`daily_limit = $${paramIndex++}`);
      params.push(data.dailyLimit);
    }
    if (data.incrementTotalTryons) {
      updates.push(`total_tryons = total_tryons + 1`);
    }
    if (data.incrementTotalAtc) {
      updates.push(`total_atc = total_atc + 1`);
    }
    if (data.total_tryons !== undefined) {
      updates.push(`total_tryons = $${paramIndex++}`);
      params.push(data.total_tryons);
    }
    if (data.monthlyQuota !== undefined) {
      updates.push(`monthly_quota = $${paramIndex++}`);
      params.push(data.monthlyQuota);
    }
    if (data.monthly_quota_used !== undefined) {
      updates.push(`monthly_quota_used = $${paramIndex++}`);
      params.push(data.monthly_quota_used);
    }
    if (data.qualityMode !== undefined) {
      updates.push(`quality_mode = $${paramIndex++}`);
      params.push(data.qualityMode);
    }
    if (data.last_quota_reset !== undefined) {
      updates.push(`last_quota_reset = $${paramIndex++}`);
      params.push(data.last_quota_reset);
    }
    if (data.review_shown !== undefined) {
      updates.push(`review_shown = $${paramIndex++}`);
      params.push(data.review_shown);
    }
    if (data.last_review_prompt_date !== undefined) {
      updates.push(`last_review_prompt_date = $${paramIndex++}`);
      params.push(data.last_review_prompt_date);
    }
    if (data.abTestEnabled !== undefined) {
      updates.push(`ab_test_enabled = $${paramIndex++}`);
      params.push(data.abTestEnabled);
    }
    if (data.abTestPercent !== undefined) {
      updates.push(`ab_test_percent = $${paramIndex++}`);
      params.push(data.abTestPercent);
    }
    
    updates.push(`last_active_at = CURRENT_TIMESTAMP`);
    params.push(domain);
    
    await query(
      `UPDATE shops SET ${updates.join(", ")} WHERE domain = $${paramIndex}`,
      params
    );

    if (
      data.widgetText !== undefined ||
      data.widgetBg !== undefined ||
      data.widgetColor !== undefined ||
      data.isEnabled !== undefined
    ) {
      invalidateStatusCacheForShop(domain);
    }
  } else {
    // Create new shop - automatically initialize with free plan (4 credits/month)
    const defaultMonthlyQuota = data.monthlyQuota !== undefined ? data.monthlyQuota : 4;
    const isEnabled = data.isEnabled !== undefined ? data.isEnabled : true; // Widget enabled by default for new shops
    
    // Special handling for specific shop: 3aavx5-9u.myshopify.com
    // Give 1000 credits at creation, only if credits are not explicitly set
    let initialCredits = data.credits !== undefined ? data.credits : defaultMonthlyQuota;
    if (domain === "3aavx5-9u.myshopify.com" && data.credits === undefined) {
      initialCredits = 1000;
    }
    
    await query(
      `INSERT INTO shops (domain, access_token, credits, widget_text, widget_bg, widget_color, max_tries_per_user, monthly_quota, is_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        domain,
        data.accessToken || "",
        initialCredits, // Initialize credits (1000 for specific shop, or provided value, or default)
        data.widgetText || "Try It On Now ✨",
        data.widgetBg || "#000000",
        data.widgetColor || "#ffffff",
        data.maxTriesPerUser || 5,
        defaultMonthlyQuota, // Default to 4 (free plan) for new shops
        isEnabled, // Widget enabled by default
      ]
    );
  }
  
  return getShop(domain);
}

/**
 * Gets tryon logs for a shop.
 */
export async function getTryonLogs(shop: string, filters: {
  date?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
} = {}) {
  let queryText = "SELECT * FROM tryon_logs WHERE shop = $1";
  const params: any[] = [shop];
  let paramIndex = 2;
  
  if (filters.date) {
    queryText += ` AND DATE(created_at) = $${paramIndex++}`;
    params.push(filters.date);
  } else if (filters.startDate) {
    queryText += ` AND created_at >= $${paramIndex++}`;
    params.push(filters.startDate);
  }
  
  if (filters.endDate) {
    queryText += ` AND created_at <= $${paramIndex++}`;
    params.push(filters.endDate);
  }
  
  queryText += " ORDER BY created_at DESC";
  
  // Add LIMIT and OFFSET if specified
  if (filters.limit !== undefined) {
    queryText += ` LIMIT $${paramIndex++}`;
    params.push(filters.limit);
  }
  if (filters.offset !== undefined) {
    queryText += ` OFFSET $${paramIndex++}`;
    params.push(filters.offset);
  }
  
  const result = await query(queryText, params);
  return result.rows as any[];
}

/**
 * Creates a tryon log entry.
 * Returns the ID of the created log entry.
 */
export async function createTryonLog(data: {
  shop: string;
  customerIp?: string;
  customerId?: string;
  productId?: string;
  productHandle?: string;
  productTitle?: string;
  success: boolean;
  errorMessage?: string;
  latencyMs?: number;
  resultImageUrl?: string;
}): Promise<number> {
  const result = await query(
    `INSERT INTO tryon_logs (shop, customer_ip, customer_id, product_id, product_handle, product_title, success, error_message, latency_ms, result_image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      data.shop,
      data.customerIp || null,
      data.customerId || null,
      data.productId || null,
      data.productHandle || null,
      data.productTitle || null,
      data.success,
      data.errorMessage || null,
      data.latencyMs || null,
      data.resultImageUrl || null,
    ]
  );
  return result.rows[0].id;
}

/**
 * Updates an existing tryon log with result or error.
 */
export async function updateTryonLog(logId: number, data: {
  success: boolean;
  errorMessage?: string;
  latencyMs?: number;
  resultImageUrl?: string;
}): Promise<void> {
  await query(
    `UPDATE tryon_logs 
     SET success = $1, error_message = $2, latency_ms = $3, result_image_url = $4
     WHERE id = $5`,
    [
      data.success,
      data.errorMessage || null,
      data.latencyMs || null,
      data.resultImageUrl || null,
      logId,
    ]
  );
}

/**
 * Gets or creates a rate limit entry.
 */
export async function getOrCreateRateLimit(shop: string, customerIp: string, date: string) {
  const result = await query(
    "SELECT * FROM rate_limits WHERE shop = $1 AND customer_ip = $2 AND date = $3",
    [shop, customerIp, date]
  );
  
  if (result.rows.length > 0) {
    return result.rows[0];
  }
  
  await query(
    "INSERT INTO rate_limits (shop, customer_ip, date, count) VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING",
    [shop, customerIp, date]
  );
  
  const newResult = await query(
    "SELECT * FROM rate_limits WHERE shop = $1 AND customer_ip = $2 AND date = $3",
    [shop, customerIp, date]
  );
  
  return newResult.rows[0];
}

/**
 * Increments rate limit count.
 */
export async function incrementRateLimit(shop: string, customerIp: string, date: string) {
  await query(
    "UPDATE rate_limits SET count = count + 1 WHERE shop = $1 AND customer_ip = $2 AND date = $3",
    [shop, customerIp, date]
  );
}

/**
 * Gets top products by tryon count.
 * Groups by normalized product id (GID and numeric merged) and includes product_handle-only rows.
 */
export async function getTopProducts(shop: string, limit: number = 10) {
  const result = await query(
    `SELECT 
       COALESCE( (regexp_match(product_id, '^gid://shopify/Product/([0-9]+)$'))[1], product_id, product_handle ) AS product_key,
       MAX(product_id) AS max_product_id,
       MAX(product_handle) AS max_product_handle,
       COUNT(*) AS count 
     FROM tryon_logs 
     WHERE shop = $1 AND success = true 
       AND (product_id IS NOT NULL OR product_handle IS NOT NULL)
       AND (product_id IS NULL OR product_id NOT IN ('undefined', 'null'))
     GROUP BY 1 
     ORDER BY count DESC 
     LIMIT $2`,
    [shop, limit]
  );

  return result.rows.map((p: any) => ({
    product_id: p.max_product_id || p.max_product_handle || p.product_key,
    product_handle: p.max_product_handle || undefined,
    tryons: parseInt(p.count, 10),
  }));
}

/**
 * Gets tryon counts grouped by day for the last 30 days.
 */
export async function getTryonStatsByDay(shop: string, days: number = 30) {
  const result = await query(
    `SELECT 
      DATE(created_at) as date,
      COUNT(*) as count
     FROM tryon_logs 
     WHERE shop = $1 
       AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
       AND success = true
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [shop]
  );
  
  return result.rows.map((r: any) => ({
    date: r.date,
    count: parseInt(r.count),
  }));
}

/**
 * ADDED: Gets product try-on setting (enabled/disabled).
 * Returns true if enabled, false if disabled, or null if not set.
 * Note: null means not explicitly set - defaults to ENABLED (all products enabled by default at installation).
 * Admin can then explicitly enable/disable individual products.
 */
function rowTryonEnabledValue(enabled: unknown): boolean | null {
  if (enabled === false || enabled === "false" || enabled === 0) return false;
  if (enabled === true || enabled === "true" || enabled === 1) return true;
  return null;
}

export async function getProductTryonSetting(
  shop: string,
  productId: string,
  productHandle?: string
): Promise<boolean | null> {
  const variants = productIdVariants(productId);
  if (variants.length === 0) return null;

  const idPlaceholders = variants.map((_, i) => `$${i + 2}`).join(", ");
  const params: unknown[] = [shop, ...variants];
  let sql = `SELECT tryon_enabled, updated_at
     FROM product_settings
     WHERE shop = $1 AND (
       product_id IN (${idPlaceholders})`;

  if (productHandle) {
    sql += ` OR product_handle = $${params.length + 1}`;
    params.push(productHandle);
  }

  sql += ") ORDER BY updated_at DESC LIMIT 1";

  const result = await query(sql, params);
  if (result.rows.length === 0) return null;

  return rowTryonEnabledValue(result.rows[0].tryon_enabled);
}

/**
 * OPTIMIZED: Gets try-on settings for multiple products at once (batch query).
 * Returns a map of product_id -> boolean | null (true=enabled, false=disabled, null=not set/default enabled).
 */
export async function getProductTryonSettingsBatch(shop: string, productIds: string[]): Promise<Record<string, boolean | null>> {
  if (productIds.length === 0) {
    return {};
  }
  
  // Normalize all product IDs to try multiple formats
  const allFormatsToTry = new Set<string>();
  productIds.forEach(productId => {
    allFormatsToTry.add(productId);
    // If numeric, add GID format
    if (/^\d+$/.test(productId)) {
      allFormatsToTry.add(`gid://shopify/Product/${productId}`);
    }
    // If GID format, extract numeric part
    const gidMatch = productId.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
    if (gidMatch) {
      allFormatsToTry.add(gidMatch[1]);
    }
  });
  
  const formatsArray = Array.from(allFormatsToTry);
  if (formatsArray.length === 0) {
    return {};
  }
  
  // Single query to get all settings matching any of the formats
  const placeholders = formatsArray.map((_, i) => `$${i + 2}`).join(', ');
  const result = await query(
    `SELECT product_id, tryon_enabled, product_handle, updated_at
     FROM product_settings 
     WHERE shop = $1 AND product_id IN (${placeholders})
     ORDER BY updated_at DESC`,
    [shop, ...formatsArray]
  );
  
  // Build map: normalize enabled values and match by all formats
  const settingsMap: Record<string, boolean | null> = {};
  const processedSettings = new Set<string>();
  
  result.rows.forEach((row: any) => {
    const enabled = row.tryon_enabled;
    const enabledBool = enabled === true || enabled === 'true' || enabled === 1;
    const disabledBool = enabled === false || enabled === 'false' || enabled === 0;
    
    const settingValue = disabledBool ? false : (enabledBool ? true : null);

    // Match this setting to all product IDs that could match
    const storedProductId = row.product_id;
    const numericFromStored = storedProductId.match(/\d+/)?.[0];
    
    productIds.forEach(productId => {
      if (processedSettings.has(productId)) return; // Already set
      
      const numericFromProductId = productId.match(/\d+/)?.[0];
      const gidMatch = productId.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
      const numericId = gidMatch ? gidMatch[1] : (numericFromProductId || productId);
      
      // Match by exact ID, GID format, numeric ID
      const matchesExact = storedProductId === productId;
      const matchesGID = storedProductId === `gid://shopify/Product/${numericId}`;
      const matchesNumeric = numericFromStored && numericFromStored === numericId;
      const matchesDirectNumeric = storedProductId === numericId;
      
      if (matchesExact || matchesGID || matchesNumeric || matchesDirectNumeric) {
        if (!processedSettings.has(productId)) {
          settingsMap[productId] = settingValue;
          processedSettings.add(productId);
        } else if (settingValue === false) {
          settingsMap[productId] = false;
        }
      }
    });
  });

  // Try matching by handle if product_handle column exists and we still have unmatched products
  const unmatchedIds = productIds.filter(id => !processedSettings.has(id));
  if (unmatchedIds.length > 0) {
    try {
      // Extract handles from productIds if they are handles
      const handlesToTry = unmatchedIds.filter(id => !id.startsWith('gid://') && !/^\d+$/.test(id));
      if (handlesToTry.length > 0) {
        const handlePlaceholders = handlesToTry.map((_, i) => `$${i + 2}`).join(', ');
        const handleResult = await query(
          `SELECT product_id, tryon_enabled, product_handle 
           FROM product_settings 
           WHERE shop = $1 AND product_handle IN (${handlePlaceholders})`,
          [shop, ...handlesToTry]
        );
        
        handleResult.rows.forEach((row: any) => {
          const enabled = row.tryon_enabled;
          const enabledBool = enabled === true || enabled === 'true' || enabled === 1;
          const disabledBool = enabled === false || enabled === 'false' || enabled === 0;
          const settingValue = disabledBool ? false : (enabledBool ? true : null);
          
          unmatchedIds.forEach(productId => {
            if (processedSettings.has(productId)) return;
            if (row.product_handle === productId) {
              settingsMap[productId] = settingValue;
              processedSettings.add(productId);
            }
          });
        });
      }
    } catch (error: any) {
      // Column might not exist yet - ignore
      if (!error.message?.includes('product_handle') && !error.message?.includes('column')) {
        throw error;
      }
    }
  }
  
  // All products without explicit settings default to null (enabled by default)
  productIds.forEach(id => {
    if (!(id in settingsMap)) {
      settingsMap[id] = null;
    }
  });
  
  return settingsMap;
}

/**
 * ADDED: Sets product try-on enabled/disabled state.
 */
export async function setProductTryonSetting(shop: string, productId: string, enabled: boolean, productHandle?: string) {
  const formatsToSave = productIdVariants(productId);
  for (const idFormat of formatsToSave) {
    await query(
      `INSERT INTO product_settings (shop, product_id, product_handle, tryon_enabled, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (shop, product_id) 
       DO UPDATE SET tryon_enabled = $4, product_handle = COALESCE($3, product_settings.product_handle), updated_at = CURRENT_TIMESTAMP`,
      [shop, idFormat, productHandle || null, enabled]
    );
  }

  // Keep every row for this product in sync (avoids stale enabled rows on other id formats / handle)
  if (formatsToSave.length > 0) {
    if (productHandle) {
      await query(
        `UPDATE product_settings
         SET tryon_enabled = $2, updated_at = CURRENT_TIMESTAMP
         WHERE shop = $1 AND (product_id = ANY($3::text[]) OR product_handle = $4)`,
        [shop, enabled, formatsToSave, productHandle]
      );
    } else {
      await query(
        `UPDATE product_settings
         SET tryon_enabled = $2, updated_at = CURRENT_TIMESTAMP
         WHERE shop = $1 AND product_id = ANY($3::text[])`,
        [shop, enabled, formatsToSave]
      );
    }
  }

  invalidateStatusCacheForShop(shop);
  invalidateStatusCacheForProduct(shop, productId, productHandle || null);
}

export async function getProductTryonImageUrl(
  shop: string,
  productId: string,
  productHandle?: string
): Promise<string | null> {
  const variants = productIdVariants(productId);
  if (variants.length === 0) return null;

  const idPlaceholders = variants.map((_, i) => `$${i + 2}`).join(", ");
  const params: unknown[] = [shop, ...variants];
  let sql = `SELECT tryon_image_url, updated_at
     FROM product_settings
     WHERE shop = $1 AND (
       product_id IN (${idPlaceholders})`;

  if (productHandle) {
    sql += ` OR product_handle = $${params.length + 1}`;
    params.push(productHandle);
  }

  sql += ") AND tryon_image_url IS NOT NULL AND tryon_image_url <> '' ORDER BY updated_at DESC LIMIT 1";

  const result = await query(sql, params);
  if (result.rows.length === 0) return null;
  return String(result.rows[0].tryon_image_url);
}

export async function setProductTryonImageUrl(
  shop: string,
  productId: string,
  imageUrl: string | null,
  productHandle?: string
) {
  const formatsToSave = productIdVariants(productId);
  const normalizedUrl = imageUrl && imageUrl.trim() ? imageUrl.trim() : null;

  for (const idFormat of formatsToSave) {
    await query(
      `INSERT INTO product_settings (shop, product_id, product_handle, tryon_enabled, tryon_image_url, updated_at)
       VALUES ($1, $2, $3, true, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (shop, product_id)
       DO UPDATE SET
         tryon_image_url = $4,
         product_handle = COALESCE($3, product_settings.product_handle),
         updated_at = CURRENT_TIMESTAMP`,
      [shop, idFormat, productHandle || null, normalizedUrl]
    );
  }

  if (formatsToSave.length > 0 && productHandle) {
    await query(
      `UPDATE product_settings
       SET tryon_image_url = $2, updated_at = CURRENT_TIMESTAMP
       WHERE shop = $1 AND (product_id = ANY($3::text[]) OR product_handle = $4)`,
      [shop, normalizedUrl, formatsToSave, productHandle]
    );
  } else if (formatsToSave.length > 0) {
    await query(
      `UPDATE product_settings
       SET tryon_image_url = $2, updated_at = CURRENT_TIMESTAMP
       WHERE shop = $1 AND product_id = ANY($3::text[])`,
      [shop, normalizedUrl, formatsToSave]
    );
  }

  invalidateStatusCacheForShop(shop);
  invalidateStatusCacheForProduct(shop, productId, productHandle || null);
}

export type ProductSettingsRow = {
  enabled: boolean | null;
  tryonImageUrl: string | null;
};

export async function getProductSettingsBatch(
  shop: string,
  productIds: string[]
): Promise<Record<string, ProductSettingsRow>> {
  const enabledMap = await getProductTryonSettingsBatch(shop, productIds);
  const imageMap: Record<string, string | null> = {};

  if (productIds.length === 0) {
    return {};
  }

  const allFormatsToTry = new Set<string>();
  productIds.forEach((productId) => {
    productIdVariants(productId).forEach((v) => allFormatsToTry.add(v));
  });
  const formatsArray = Array.from(allFormatsToTry);
  if (formatsArray.length === 0) {
    return {};
  }

  const placeholders = formatsArray.map((_, i) => `$${i + 2}`).join(", ");
  const result = await query(
    `SELECT product_id, tryon_image_url, product_handle, updated_at
     FROM product_settings
     WHERE shop = $1 AND product_id IN (${placeholders})
       AND tryon_image_url IS NOT NULL AND tryon_image_url <> ''
     ORDER BY updated_at DESC`,
    [shop, ...formatsArray]
  );

  const processed = new Set<string>();
  result.rows.forEach((row: { product_id: string; tryon_image_url: string }) => {
    const storedProductId = row.product_id;
    const numericFromStored = storedProductId.match(/\d+/)?.[0];
    productIds.forEach((productId) => {
      if (processed.has(productId)) return;
      const gidMatch = productId.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
      const numericId = gidMatch ? gidMatch[1] : productId.match(/\d+/)?.[0] || productId;
      const matches =
        storedProductId === productId ||
        storedProductId === `gid://shopify/Product/${numericId}` ||
        (numericFromStored && numericFromStored === numericId) ||
        storedProductId === numericId;
      if (matches) {
        imageMap[productId] = row.tryon_image_url;
        processed.add(productId);
      }
    });
  });

  const out: Record<string, ProductSettingsRow> = {};
  productIds.forEach((id) => {
    out[id] = {
      enabled: enabledMap[id] ?? null,
      tryonImageUrl: imageMap[id] ?? null,
    };
  });
  return out;
}

export async function recordAbEvent(
  shop: string,
  data: {
    productId?: string;
    bucket: string;
    eventType: "impression" | "tryon" | "atc";
    visitorId?: string;
  }
) {
  await query(
    `INSERT INTO ab_events (shop, product_id, bucket, event_type, visitor_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      shop,
      data.productId || null,
      data.bucket,
      data.eventType,
      data.visitorId || null,
    ]
  );
}

export async function getAbTestStats(shop: string, days = 30) {
  const result = await query(
    `SELECT bucket, event_type, COUNT(*)::int AS count
     FROM ab_events
     WHERE shop = $1 AND created_at >= NOW() - make_interval(days => $2::int)
     GROUP BY bucket, event_type`,
    [shop, days]
  );

  const stats = {
    tryon: { impression: 0, tryon: 0, atc: 0 },
    control: { impression: 0, tryon: 0, atc: 0 },
  };

  for (const row of result.rows as { bucket: string; event_type: string; count: number }[]) {
    const bucket = row.bucket === "control" ? "control" : "tryon";
    const type = row.event_type as "impression" | "tryon" | "atc";
    if (stats[bucket][type] !== undefined) {
      stats[bucket][type] += row.count;
    }
  }

  return stats;
}

/**
 * ADDED: Gets try-on usage count for a specific product.
 */
export async function getProductTryonCount(shop: string, productId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*) as count 
     FROM tryon_logs 
     WHERE shop = $1 AND product_id = $2 AND success = true`,
    [shop, productId]
  );
  
  return result.rows.length > 0 ? parseInt(result.rows[0].count) : 0;
}

/**
 * ADDED: Gets try-on usage counts for multiple products at once.
 * Returns a map of product_id -> count.
 */
export async function getProductTryonCounts(shop: string, productIds: string[]): Promise<Record<string, number>> {
  if (productIds.length === 0) {
    return {};
  }
  
  const placeholders = productIds.map((_, i) => `$${i + 2}`).join(', ');
  const result = await query(
    `SELECT product_id, COUNT(*) as count 
     FROM tryon_logs 
     WHERE shop = $1 AND product_id IN (${placeholders}) AND success = true
     GROUP BY product_id`,
    [shop, ...productIds]
  );
  
  const counts: Record<string, number> = {};
  result.rows.forEach((row: any) => {
    counts[row.product_id] = parseInt(row.count);
  });
  
  // Ensure all product IDs have a count (default to 0)
  productIds.forEach(id => {
    if (!(id in counts)) {
      counts[id] = 0;
    }
  });
  
  return counts;
}

/**
 * ADDED: Gets monthly try-on usage count for a shop (current month).
 */
export async function getMonthlyTryonUsage(shop: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*) as count 
     FROM tryon_logs 
     WHERE shop = $1 
       AND success = true
       AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`,
    [shop]
  );
  
  return result.rows.length > 0 ? parseInt(result.rows[0].count) : 0;
}

/**
 * ADDED: Gets daily try-on usage count for a shop (today).
 */
export async function getDailyTryonUsage(shop: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*) as count 
     FROM tryon_logs 
     WHERE shop = $1 
       AND success = true
       AND DATE(created_at) = CURRENT_DATE`,
    [shop]
  );
  
  return result.rows.length > 0 ? parseInt(result.rows[0].count) : 0;
}

/**
 * ADDED: Gets daily try-on usage count for a specific customer IP (today).
 */
export async function getCustomerDailyTryonUsage(shop: string, customerIp: string): Promise<number> {
  if (!customerIp) {
    return 0;
  }
  
  const result = await query(
    `SELECT COUNT(*) as count 
     FROM tryon_logs 
     WHERE shop = $1 
       AND customer_ip = $2
       AND success = true
       AND DATE(created_at) = CURRENT_DATE`,
    [shop, customerIp]
  );
  
  return result.rows.length > 0 ? parseInt(result.rows[0].count) : 0;
}

/**
 * ADDED: Gets comprehensive try-on status for a product.
 * Returns both shop-level and product-level settings in one call.
 * Used by the public status endpoint for widgets.
 */
export async function getProductTryonStatus(shop: string, productId: string, productHandle?: string): Promise<{
  enabled: boolean;
  shopEnabled: boolean;
  productEnabled: boolean;
  tryonImageUrl: string | null;
  abTestEnabled: boolean;
  abTestPercent: number;
  widgetSettings: {
    widget_text: string;
    widget_bg: string;
    widget_color: string;
    maxTriesPerUser: number;
  } | null;
}> {
  const [shopRecord, productSetting, tryonImageUrl] = await Promise.all([
    getShop(shop),
    getProductTryonSetting(shop, productId, productHandle),
    getProductTryonImageUrl(shop, productId, productHandle),
  ]);

  if (!shopRecord) {
    return {
      enabled: false,
      shopEnabled: false,
      productEnabled: false,
      tryonImageUrl: null,
      abTestEnabled: false,
      abTestPercent: 50,
      widgetSettings: null,
    };
  }

  const abTestEnabled = shopRecord.ab_test_enabled === true;
  const abTestPercent =
    typeof shopRecord.ab_test_percent === "number"
      ? shopRecord.ab_test_percent
      : parseInt(String(shopRecord.ab_test_percent ?? 50), 10) || 50;

  const shopEnabled = shopRecord.is_enabled !== false;

  // IMPORTANT: 
  // - If productSetting is explicitly true, product is enabled
  // - If productSetting is explicitly false, product is disabled
  // - If productSetting is null (not set), default to ENABLED (all products enabled by default at installation)
  // Admin can then explicitly disable products they don't want
  const productEnabled = productSetting !== false;

  // Final enabled status: both shop and product must be enabled
  const enabled = shopEnabled && productEnabled;
  
  // Get widget settings (only if enabled)
  // Use widget_text, widget_bg, widget_color to match what the client widget expects
  const widgetSettings = enabled ? {
    widget_text: shopRecord.widget_text || "Try It On Now ✨",
    widget_bg: shopRecord.widget_bg || "#000000",
    widget_color: shopRecord.widget_color || "#ffffff",
    maxTriesPerUser: shopRecord.max_tries_per_user || 5,
  } : null;
  
  return {
    enabled,
    shopEnabled,
    productEnabled,
    tryonImageUrl,
    abTestEnabled,
    abTestPercent,
    widgetSettings,
  };
}

/**
 * Get count of successful try-ons for a shop
 */
export async function getSuccessfulTryonsCount(shop: string): Promise<number> {
  const result = await query(
    "SELECT COUNT(*) as count FROM tryon_logs WHERE shop = $1 AND success = true",
    [shop]
  );
  
  return result.rows.length > 0 ? parseInt(result.rows[0].count) : 0;
}

