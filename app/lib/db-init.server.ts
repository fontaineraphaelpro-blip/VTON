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

// Cache to avoid checking tables on every request
let tablesEnsured = false;
let tablesEnsuring = false; // Flag to prevent concurrent checks
const ensureTablesPromise: Promise<void> | null = null;

/**
 * Ensures all business tables exist.
 * Uses in-memory cache to avoid repeated checks.
 */
export async function ensureTables() {
  if (!pool) return;

  if (tablesEnsured) {
    return;
  }

  if (tablesEnsuring) {
    await new Promise(resolve => setTimeout(resolve, 50));
    if (tablesEnsured) return;
    await new Promise(resolve => setTimeout(resolve, 100));
    if (tablesEnsured) return;
  }

  tablesEnsuring = true;

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
        product_handle TEXT,
        product_title TEXT,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        latency_ms INTEGER,
        result_image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add product_handle column if it doesn't exist (migration)
    await pool.query(`
      ALTER TABLE tryon_logs 
      ADD COLUMN IF NOT EXISTS product_handle TEXT
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
      ADD COLUMN IF NOT EXISTS monthly_quota_used INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_quota_reset TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS quality_mode TEXT DEFAULT 'balanced',
      ADD COLUMN IF NOT EXISTS review_shown BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS last_review_prompt_date TIMESTAMP DEFAULT NULL
    `);

    // ADDED: Add product_handle column to product_settings table if it doesn't exist (migration)
    try {
      await pool.query(`
        ALTER TABLE product_settings 
        ADD COLUMN IF NOT EXISTS product_handle TEXT
      `);
    } catch (error: any) {
      // Ignore duplicate column / already exists
      if (!error.message?.includes('duplicate') && !error.message?.includes('already exists')) {
        // Suppress other errors for this migration
      }
    }

    tablesEnsured = true;
  } catch (error) {
    tablesEnsuring = false;
    throw error;
  } finally {
    tablesEnsuring = false;
  }
}
