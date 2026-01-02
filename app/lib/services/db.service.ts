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
  incrementTotalTryons?: boolean;
  incrementTotalAtc?: boolean;
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
    if (data.incrementTotalTryons) {
      updates.push(`total_tryons = total_tryons + 1`);
    }
    if (data.incrementTotalAtc) {
      updates.push(`total_atc = total_atc + 1`);
    }
    
    updates.push(`last_active_at = CURRENT_TIMESTAMP`);
    params.push(domain);
    
    await query(
      `UPDATE shops SET ${updates.join(", ")} WHERE domain = $${paramIndex}`,
      params
    );
  } else {
    // Create new shop
    await query(
      `INSERT INTO shops (domain, access_token, credits, widget_text, widget_bg, widget_color, max_tries_per_user)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        domain,
        data.accessToken || "",
        data.credits || 0,
        data.widgetText || "Try It On Now ✨",
        data.widgetBg || "#000000",
        data.widgetColor || "#ffffff",
        data.maxTriesPerUser || 5,
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
  
  const result = await query(queryText, params);
  return result.rows as any[];
}

/**
 * Creates a tryon log entry.
 */
export async function createTryonLog(data: {
  shop: string;
  customerIp?: string;
  customerId?: string;
  productId?: string;
  productTitle?: string;
  success: boolean;
  errorMessage?: string;
  latencyMs?: number;
  resultImageUrl?: string;
}) {
  await query(
    `INSERT INTO tryon_logs (shop, customer_ip, customer_id, product_id, product_title, success, error_message, latency_ms, result_image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      data.shop,
      data.customerIp || null,
      data.customerId || null,
      data.productId || null,
      data.productTitle || null,
      data.success,
      data.errorMessage || null,
      data.latencyMs || null,
      data.resultImageUrl || null,
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

