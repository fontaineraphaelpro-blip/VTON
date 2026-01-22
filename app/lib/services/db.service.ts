/**
 * ==========================================
 * DATABASE SERVICE
 * ==========================================
 * 
 * Service for business database operations (shops, tryon_logs, etc.)
 * Uses pg directly for raw SQL queries since Prisma schema is primarily for Session storage.
 */

import pg from "pg";
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
    
    updates.push(`last_active_at = CURRENT_TIMESTAMP`);
    params.push(domain);
    
    await query(
      `UPDATE shops SET ${updates.join(", ")} WHERE domain = $${paramIndex}`,
      params
    );
  } else {
    // Create new shop - automatically initialize with free plan (4 credits/month)
    const defaultMonthlyQuota = data.monthlyQuota !== undefined ? data.monthlyQuota : 4;
    const isEnabled = data.isEnabled !== undefined ? data.isEnabled : true; // Widget enabled by default for new shops
    await query(
      `INSERT INTO shops (domain, access_token, credits, widget_text, widget_bg, widget_color, max_tries_per_user, monthly_quota, is_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        domain,
        data.accessToken || "",
        data.credits !== undefined ? data.credits : defaultMonthlyQuota, // Initialize credits to match monthly_quota for compatibility
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
 */
export async function getTopProducts(shop: string, limit: number = 10) {
  const result = await query(
    `SELECT product_id, COUNT(*) as count 
     FROM tryon_logs 
     WHERE shop = $1 AND success = true AND product_id IS NOT NULL 
     GROUP BY product_id 
     ORDER BY count DESC 
     LIMIT $2`,
    [shop, limit]
  );
  
  return result.rows.map((p: any) => ({
    product_id: p.product_id,
    tryons: parseInt(p.count),
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
export async function getProductTryonSetting(shop: string, productId: string, productHandle?: string): Promise<boolean | null> {
  // Use batch function for single product (more efficient)
  // But we also need to check by handle if provided
  const result = await getProductTryonSettingsBatch(shop, [productId]);
  let setting = result[productId] ?? null;
  
  // If not found by ID and we have a handle, try by handle
  if (setting === null && productHandle) {
    try {
      const handleResult = await query(
        `SELECT tryon_enabled 
         FROM product_settings 
         WHERE shop = $1 AND product_handle = $2 
         LIMIT 1`,
        [shop, productHandle]
      );
      
      if (handleResult.rows.length > 0) {
        const enabled = handleResult.rows[0].tryon_enabled;
        const enabledBool = enabled === true || enabled === 'true' || enabled === 1;
        const disabledBool = enabled === false || enabled === 'false' || enabled === 0;
        setting = disabledBool ? false : (enabledBool ? true : null);
      }
    } catch (error: any) {
      // Column might not exist - ignore
      if (!error.message?.includes('product_handle') && !error.message?.includes('column')) {
        throw error;
      }
    }
  }
  
  return setting;
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
    `SELECT product_id, tryon_enabled, product_handle 
     FROM product_settings 
     WHERE shop = $1 AND product_id IN (${placeholders})`,
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
        settingsMap[productId] = settingValue;
        processedSettings.add(productId);
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
  // Save with the exact ID provided first (most important)
  await query(
    `INSERT INTO product_settings (shop, product_id, product_handle, tryon_enabled, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (shop, product_id) 
     DO UPDATE SET tryon_enabled = $4, product_handle = COALESCE($3, product_settings.product_handle), updated_at = CURRENT_TIMESTAMP`,
    [shop, productId, productHandle || null, enabled]
  );
  
  // Also save with alternative formats to ensure we can retrieve it regardless of format used
  const formatsToSave: string[] = [];
  
  // If numeric, also save as GID
  if (/^\d+$/.test(productId)) {
    formatsToSave.push(`gid://shopify/Product/${productId}`);
  }
  
  // If GID format, extract numeric and save numeric version too
  const gidMatch = productId.match(/^gid:\/\/shopify\/Product\/(\d+)$/);
  if (gidMatch) {
    formatsToSave.push(gidMatch[1]);
  }
  
  // Save with alternative formats (if different from original)
  for (const idFormat of formatsToSave) {
    if (idFormat !== productId) {
      try {
        await query(
          `INSERT INTO product_settings (shop, product_id, product_handle, tryon_enabled, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (shop, product_id) 
           DO UPDATE SET tryon_enabled = $4, product_handle = COALESCE($3, product_settings.product_handle), updated_at = CURRENT_TIMESTAMP`,
          [shop, idFormat, productHandle || null, enabled]
        );
      } catch {
        // Ignore errors for alternative formats
      }
    }
  }
  
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
  widgetSettings: {
    widget_text: string;
    widget_bg: string;
    widget_color: string;
    maxTriesPerUser: number;
  } | null;
}> {
  // Get shop settings
  const shopRecord = await getShop(shop);
  
  if (!shopRecord) {
    return {
      enabled: false,
      shopEnabled: false,
      productEnabled: false,
      widgetSettings: null,
    };
  }
  
  // Shop-level: if is_enabled is null/undefined, treat as enabled; if explicitly false, disabled
  const shopEnabled = shopRecord.is_enabled !== false;
  
  const productSetting = await getProductTryonSetting(shop, productId, productHandle);

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
    widgetSettings,
  };
}

