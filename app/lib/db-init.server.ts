/**
 * ==========================================
 * DATABASE INITIALIZATION
 * ==========================================
 * 
 * Creates business tables (shops, tryon_logs, rate_limits) if they don't exist.
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
 * Ensures all business tables exist.
 */
export async function ensureTables() {
  if (!pool) {
    // Log only in development
    if (process.env.NODE_ENV !== "production") {
      console.warn("DATABASE_URL not configured, skipping table creation");
    }
    return;
  }

  try {
    // Create shops table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shops (
        domain TEXT PRIMARY KEY,
        access_token TEXT DEFAULT '',
        credits INTEGER DEFAULT 0,
        widget_text TEXT DEFAULT 'Try It On Now ✨',
        widget_bg TEXT DEFAULT '#000000',
        widget_color TEXT DEFAULT '#ffffff',
        max_tries_per_user INTEGER DEFAULT 5,
        total_tryons INTEGER DEFAULT 0,
        total_atc INTEGER DEFAULT 0,
        last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create tryon_logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tryon_logs (
        id SERIAL PRIMARY KEY,
        shop TEXT NOT NULL,
        customer_ip TEXT,
        customer_id TEXT,
        product_id TEXT,
        product_title TEXT,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        latency_ms INTEGER,
        result_image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create rate_limits table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        id SERIAL PRIMARY KEY,
        shop TEXT NOT NULL,
        customer_ip TEXT NOT NULL,
        date DATE NOT NULL,
        count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(shop, customer_ip, date)
      )
    `);

    // ADDED: Create product_settings table for per-product try-on toggle
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_settings (
        id SERIAL PRIMARY KEY,
        shop TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_handle TEXT,
        tryon_enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(shop, product_id)
      )
    `);

    // ADDED: Add missing columns to shops table if they don't exist
    await pool.query(`
      ALTER TABLE shops 
      ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS daily_limit INTEGER DEFAULT 100,
      ADD COLUMN IF NOT EXISTS monthly_quota INTEGER DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS quality_mode TEXT DEFAULT 'balanced'
    `);

    // ADDED: Add product_handle column to product_settings table if it doesn't exist (migration)
    try {
      await pool.query(`
        ALTER TABLE product_settings 
        ADD COLUMN IF NOT EXISTS product_handle TEXT
      `);
    } catch (error: any) {
      // Column might already exist or other error - ignore if it's about duplicate column
      if (!error.message?.includes('duplicate') && !error.message?.includes('already exists')) {
        // Log only in development
        if (process.env.NODE_ENV !== "production") {
          console.error('Error adding product_handle column:', error);
        }
      }
    }

    // Log only in development
    if (process.env.NODE_ENV !== "production") {
      console.log("✅ Business tables initialized");
    }
  } catch (error) {
    // Log error only in development
    if (process.env.NODE_ENV !== "production") {
      console.error("❌ Error initializing business tables:", error);
    }
    throw error;
  }
}
