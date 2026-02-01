/**
 * ==========================================
 * DATABASE SERVICE
 * ==========================================
 * 
 * Service for database operations using PostgreSQL.
 */

import pg from "pg";
const { Pool } = pg;

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
 * Execute a raw SQL query
 * @param text SQL query text with $1, $2, etc. placeholders
 * @param params Array of parameter values
 * @returns Query result with rows property
 */
export async function query(text: string, params?: any[]): Promise<pg.QueryResult> {
  if (!pool) {
    throw new Error("Database connection pool is not initialized. DATABASE_URL is required.");
  }
  return await pool.query(text, params);
}

/**
 * Get shop data by domain
 */
export async function getShop(shop: string) {
  if (!pool) return null;
  
  const result = await pool.query(
    `SELECT * FROM shops WHERE domain = $1`,
    [shop]
  );
  
  return result.rows[0] || null;
}

/**
 * Upsert shop data
 */
export async function upsertShop(
  shop: string,
  data: {
    accessToken?: string;
    credits?: number;
    addCredits?: number;
    widgetText?: string;
    widgetBg?: string;
    widgetColor?: string;
    maxTriesPerUser?: number;
    isEnabled?: boolean;
    dailyLimit?: number;
    monthlyQuota?: number | null;
    monthly_quota_used?: number;
    qualityMode?: string;
    incrementTotalTryons?: boolean;
    incrementTotalAtc?: boolean;
  }
) {
  if (!pool) return null;

  const existing = await getShop(shop);
  
  if (existing) {
    // Update existing shop
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.accessToken !== undefined) {
      updates.push(`access_token = $${paramIndex++}`);
      values.push(data.accessToken);
    }
    if (data.credits !== undefined) {
      updates.push(`credits = $${paramIndex++}`);
      values.push(data.credits);
    }
    if (data.addCredits !== undefined) {
      updates.push(`credits = credits + $${paramIndex++}`);
      values.push(data.addCredits);
    }
    if (data.widgetText !== undefined) {
      updates.push(`widget_text = $${paramIndex++}`);
      values.push(data.widgetText);
    }
    if (data.widgetBg !== undefined) {
      updates.push(`widget_bg = $${paramIndex++}`);
      values.push(data.widgetBg);
    }
    if (data.widgetColor !== undefined) {
      updates.push(`widget_color = $${paramIndex++}`);
      values.push(data.widgetColor);
    }
    if (data.maxTriesPerUser !== undefined) {
      updates.push(`max_tries_per_user = $${paramIndex++}`);
      values.push(data.maxTriesPerUser);
    }
    if (data.isEnabled !== undefined) {
      updates.push(`is_enabled = $${paramIndex++}`);
      values.push(data.isEnabled);
    }
    if (data.dailyLimit !== undefined) {
      updates.push(`daily_limit = $${paramIndex++}`);
      values.push(data.dailyLimit);
    }
    if (data.monthlyQuota !== undefined) {
      updates.push(`monthly_quota = $${paramIndex++}`);
      values.push(data.monthlyQuota);
    }
    if (data.monthly_quota_used !== undefined) {
      updates.push(`monthly_quota_used = $${paramIndex++}`);
      values.push(data.monthly_quota_used);
    }
    if (data.qualityMode !== undefined) {
      updates.push(`quality_mode = $${paramIndex++}`);
      values.push(data.qualityMode);
    }
    if (data.incrementTotalTryons) {
      updates.push(`total_tryons = total_tryons + 1`);
    }
    if (data.incrementTotalAtc) {
      updates.push(`total_atc = total_atc + 1`);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    updates.push(`last_active_at = CURRENT_TIMESTAMP`);

    if (updates.length > 0) {
      values.push(shop);
      await pool.query(
        `UPDATE shops SET ${updates.join(", ")} WHERE domain = $${paramIndex}`,
        values
      );
    }
  } else {
    // Insert new shop
    await pool.query(
      `INSERT INTO shops (
        domain, access_token, credits, widget_text, widget_bg, widget_color,
        max_tries_per_user, is_enabled, daily_limit, monthly_quota, quality_mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (domain) DO NOTHING`,
      [
        shop,
        data.accessToken || "",
        data.credits ?? 0,
        data.widgetText || "Try It On Now ✨",
        data.widgetBg || "#000000",
        data.widgetColor || "#ffffff",
        data.maxTriesPerUser ?? 5,
        data.isEnabled !== false,
        data.dailyLimit ?? 100,
        data.monthlyQuota ?? null,
        data.qualityMode || "balanced",
      ]
    );
  }

  return await getShop(shop);
}

/**
 * Get try-on logs for a shop
 */
export async function getTryonLogs(
  shop: string,
  options: { limit?: number; offset?: number } = {}
) {
  if (!pool) return [];
  
  const limit = options.limit || 50;
  const offset = options.offset || 0;
  
  const result = await pool.query(
    `SELECT * FROM tryon_logs 
     WHERE shop = $1 
     ORDER BY created_at DESC 
     LIMIT $2 OFFSET $3`,
    [shop, limit, offset]
  );
  
  return result.rows;
}

/**
 * Create a try-on log entry
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
}) {
  if (!pool) return null;
  
  const result = await pool.query(
    `INSERT INTO tryon_logs (
      shop, customer_ip, customer_id, product_id, product_handle, product_title,
      success, error_message, latency_ms, result_image_url
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
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
  
  return result.rows[0];
}

/**
 * Get top products by try-on count
 */
export async function getTopProducts(shop: string, limit: number = 5) {
  if (!pool) return [];
  
  const result = await pool.query(
    `SELECT 
      product_id,
      product_handle,
      COUNT(*) as tryons
     FROM tryon_logs
     WHERE shop = $1 AND success = true
     GROUP BY product_id, product_handle
     ORDER BY tryons DESC
     LIMIT $2`,
    [shop, limit]
  );
  
  return result.rows;
}

/**
 * Get try-on stats by day
 */
export async function getTryonStatsByDay(shop: string, days: number = 30) {
  if (!pool) return [];
  
  const result = await pool.query(
    `SELECT 
      DATE(created_at) as date,
      COUNT(*) as count
     FROM tryon_logs
     WHERE shop = $1 
       AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [shop]
  );
  
  return result.rows;
}

/**
 * Get monthly try-on usage
 */
export async function getMonthlyTryonUsage(shop: string): Promise<number> {
  if (!pool) return 0;
  
  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM tryon_logs
     WHERE shop = $1 
       AND success = true
       AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
    [shop]
  );
  
  return parseInt(result.rows[0]?.count || "0", 10);
}

/**
 * Get daily try-on usage
 */
export async function getDailyTryonUsage(shop: string): Promise<number> {
  if (!pool) return 0;
  
  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM tryon_logs
     WHERE shop = $1 
       AND success = true
       AND created_at >= CURRENT_DATE`,
    [shop]
  );
  
  return parseInt(result.rows[0]?.count || "0", 10);
}

/**
 * Get customer daily try-on usage
 */
export async function getCustomerDailyTryonUsage(
  shop: string,
  customerIp: string
): Promise<number> {
  if (!pool) return 0;
  
  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM tryon_logs
     WHERE shop = $1 
       AND customer_ip = $2
       AND success = true
       AND created_at >= CURRENT_DATE`,
    [shop, customerIp]
  );
  
  return parseInt(result.rows[0]?.count || "0", 10);
}

/**
 * Get product try-on counts
 */
export async function getProductTryonCounts(
  shop: string,
  productIds: string[]
): Promise<Record<string, number>> {
  if (!pool || productIds.length === 0) return {};
  
  const result = await pool.query(
    `SELECT 
      product_id,
      COUNT(*) as count
     FROM tryon_logs
     WHERE shop = $1 
       AND product_id = ANY($2)
       AND success = true
     GROUP BY product_id`,
    [shop, productIds]
  );
  
  const counts: Record<string, number> = {};
  result.rows.forEach((row: any) => {
    counts[row.product_id] = parseInt(row.count || "0", 10);
  });
  
  return counts;
}

/**
 * Set product try-on setting
 */
export async function setProductTryonSetting(
  shop: string,
  productId: string,
  enabled: boolean,
  productHandle?: string
) {
  if (!pool) return null;
  
  await pool.query(
    `INSERT INTO product_settings (shop, product_id, product_handle, tryon_enabled)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (shop, product_id)
     DO UPDATE SET 
       tryon_enabled = $4,
       product_handle = COALESCE($3, product_settings.product_handle),
       updated_at = CURRENT_TIMESTAMP`,
    [shop, productId, productHandle || null, enabled]
  );
  
  return { shop, productId, enabled };
}

/**
 * Get product try-on settings batch
 */
export async function getProductTryonSettingsBatch(
  shop: string,
  productIds: string[]
): Promise<Record<string, boolean>> {
  if (!pool || productIds.length === 0) return {};
  
  const result = await pool.query(
    `SELECT product_id, tryon_enabled
     FROM product_settings
     WHERE shop = $1 AND product_id = ANY($2)`,
    [shop, productIds]
  );
  
  const settings: Record<string, boolean> = {};
  result.rows.forEach((row: any) => {
    settings[row.product_id] = row.tryon_enabled !== false;
  });
  
  return settings;
}

/**
 * Get comprehensive try-on status for a product
 * Checks both shop-level and product-level settings
 */
export async function getProductTryonStatus(
  shop: string,
  productId: string,
  productHandle?: string
): Promise<{
  enabled: boolean;
  shopEnabled: boolean;
  productEnabled: boolean | null;
  widgetSettings: {
    widget_text: string;
    widget_bg: string;
    widget_color: string;
  } | null;
}> {
  if (!pool) {
    return {
      enabled: false,
      shopEnabled: false,
      productEnabled: null,
      widgetSettings: null,
    };
  }

  // 1. Get shop settings
  const shopData = await getShop(shop);
  const shopEnabled = shopData?.is_enabled !== false; // Default to true if not set

  // 2. Get product-specific setting
  let productEnabled: boolean | null = null;

  // Try multiple product ID formats
  const productIdVariations = [
    productId,
    productId.replace(/^gid:\/\/shopify\/Product\//, ""), // Numeric ID
    `gid://shopify/Product/${productId.replace(/^gid:\/\/shopify\/Product\//, "")}`, // GID format
  ];

  // Also try with handle if provided
  if (productHandle) {
    productIdVariations.push(productHandle);
  }

  // Query product settings with all variations
  for (const idVar of productIdVariations) {
    const result = await pool.query(
      `SELECT tryon_enabled
       FROM product_settings
       WHERE shop = $1 AND product_id = $2
       LIMIT 1`,
      [shop, idVar]
    );

    if (result.rows.length > 0) {
      productEnabled = result.rows[0].tryon_enabled !== false;
      break; // Found a match, stop searching
    }
  }

  // 3. Determine final enabled status
  // Product setting overrides shop setting:
  // - If product setting exists and is false, disabled
  // - If product setting exists and is true, enabled (if shop enabled)
  // - If product setting doesn't exist, use shop setting (default enabled)
  let enabled = false;
  if (productEnabled !== null) {
    // Product has explicit setting
    enabled = productEnabled && shopEnabled;
  } else {
    // No product setting, use shop default (enabled by default)
    enabled = shopEnabled;
  }

  // 4. Get widget settings if enabled
  const widgetSettings = enabled && shopData
    ? {
        widget_text: shopData.widget_text || "Try It On Now ✨",
        widget_bg: shopData.widget_bg || "#000000",
        widget_color: shopData.widget_color || "#ffffff",
      }
    : null;

  return {
    enabled,
    shopEnabled,
    productEnabled,
    widgetSettings,
  };
}
