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

// Cache pour éviter de vérifier les tables à chaque requête
let tablesEnsured = false;
let tablesEnsuring = false; // Flag pour éviter les appels concurrents
const ensureTablesPromise: Promise<void> | null = null;

/**
 * Ensures all business tables exist.
 * OPTIMIZED: Utilise un cache en mémoire pour éviter les vérifications répétées.
 */
export async function ensureTables() {
  if (!pool) {
    // Log only in development
    if (process.env.NODE_ENV !== "production") {
      console.warn("DATABASE_URL not configured, skipping table creation");
    }
    return;
  }

  // Si les tables sont déjà vérifiées, retourner immédiatement
  if (tablesEnsured) {
    return;
  }

  // Si une vérification est en cours, attendre qu'elle se termine
  if (tablesEnsuring) {
    // Attendre un peu et réessayer
    await new Promise(resolve => setTimeout(resolve, 50));
    if (tablesEnsured) return;
    // Si toujours en cours, attendre encore un peu
    await new Promise(resolve => setTimeout(resolve, 100));
    if (tablesEnsured) return;
  }

  // Marquer comme en cours
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

    // Marquer comme terminé
    tablesEnsured = true;
    
    // Log only in development
    if (process.env.NODE_ENV !== "production") {
      console.log("✅ Business tables initialized");
    }
  } catch (error) {
    // En cas d'erreur, réinitialiser le flag pour permettre une nouvelle tentative
    tablesEnsuring = false;
    
    // Log error only in development
    if (process.env.NODE_ENV !== "production") {
      console.error("❌ Error initializing business tables:", error);
    }
    throw error;
  } finally {
    // Toujours réinitialiser le flag "en cours"
    tablesEnsuring = false;
  }
}
