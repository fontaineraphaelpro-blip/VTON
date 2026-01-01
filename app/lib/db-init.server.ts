/**
 * ==========================================
 * DATABASE INITIALIZATION
 * ==========================================
 * 
 * Initializes the business database tables (shops, tryon_logs, etc.)
 * This is separate from Prisma Session storage which handles OAuth sessions.
 * 
 * This file ensures all business tables exist in PostgreSQL.
 */

import prisma from "../db.server";

/**
 * Initializes all business database tables.
 * Called at app startup.
 */
/**
 * Ensures Session table exists with all required columns for PrismaSessionStorage
 */
async function ensureSessionTable() {
  try {
    // Check if table exists
    const tableExists = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'Session'
      );
    `);
    
    const exists = (tableExists as any[])[0]?.exists;
    
    if (!exists) {
      // Create table if it doesn't exist
      console.log("📦 Creating Session table...");
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "Session" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "sessionId" TEXT NOT NULL UNIQUE,
          "shop" TEXT NOT NULL,
          "state" TEXT NOT NULL,
          "isOnline" BOOLEAN NOT NULL DEFAULT false,
          "scope" TEXT,
          "expires" TIMESTAMP,
          "accessToken" TEXT NOT NULL,
          "userId" BIGINT,
          "firstName" TEXT,
          "lastName" TEXT,
          "email" TEXT,
          "accountOwner" BOOLEAN NOT NULL DEFAULT false,
          "locale" TEXT,
          "collaborator" BOOLEAN DEFAULT false,
          "emailVerified" BOOLEAN DEFAULT false,
          "refreshToken" TEXT,
          "refreshTokenExpires" TIMESTAMP
        )
      `);
      console.log("✅ Session table created");
    } else {
      // Table exists, add missing columns
      console.log("🔍 Session table exists, checking for missing columns...");
      
      const addColumnIfNotExists = async (columnName: string, columnDef: string) => {
        try {
          await prisma.$executeRawUnsafe(`
            ALTER TABLE "Session" 
            ADD COLUMN IF NOT EXISTS ${columnName} ${columnDef}
          `);
        } catch (error: any) {
          // Column might already exist, ignore
          if (!error.message?.includes("already exists") && !error.message?.includes("duplicate")) {
            console.warn(`⚠️  Could not add column ${columnName}:`, error.message);
          }
        }
      };
      
      await addColumnIfNotExists('"sessionId"', 'TEXT UNIQUE');
      await addColumnIfNotExists('scope', 'TEXT');
      await addColumnIfNotExists('"accessToken"', 'TEXT');
      await addColumnIfNotExists('expires', 'TIMESTAMP');
      await addColumnIfNotExists('"refreshToken"', 'TEXT');
      await addColumnIfNotExists('"refreshTokenExpires"', 'TIMESTAMP');
      await addColumnIfNotExists('"userId"', 'BIGINT');
      await addColumnIfNotExists('"firstName"', 'TEXT');
      await addColumnIfNotExists('"lastName"', 'TEXT');
      await addColumnIfNotExists('email', 'TEXT');
      await addColumnIfNotExists('"accountOwner"', 'BOOLEAN DEFAULT false');
      await addColumnIfNotExists('locale', 'TEXT');
      await addColumnIfNotExists('collaborator', 'BOOLEAN DEFAULT false');
      await addColumnIfNotExists('"emailVerified"', 'BOOLEAN DEFAULT false');
      
      // Ensure required columns have NOT NULL constraints if missing
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "Session" 
          ALTER COLUMN "shop" SET NOT NULL,
          ALTER COLUMN "state" SET NOT NULL,
          ALTER COLUMN "isOnline" SET NOT NULL,
          ALTER COLUMN "accessToken" SET NOT NULL
        `);
      } catch (error: any) {
        // Ignore if constraints already exist
      }
      
      console.log("✅ Session table columns verified/added");
    }
    
    // Verify table is accessible
    const count = await prisma.session.count();
    console.log(`✅ Session table accessible (${count} sessions)`);
  } catch (error: any) {
    console.error("❌ Error ensuring Session table:", error.message);
    throw error;
  }
}

export async function initBusinessDatabase() {
  try {
    console.log("🔧 Initializing business database tables...");

    // Ensure Session table exists with all required columns
    await ensureSessionTable();

    // Create shops table if it doesn't exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS shops (
        domain VARCHAR(255) PRIMARY KEY,
        access_token TEXT NOT NULL DEFAULT '',
        credits INTEGER DEFAULT 0,
        lifetime_credits INTEGER DEFAULT 0,
        total_tryons INTEGER DEFAULT 0,
        total_atc INTEGER DEFAULT 0,
        widget_text VARCHAR(255) DEFAULT 'Try It On Now ✨',
        widget_bg VARCHAR(7) DEFAULT '#000000',
        widget_color VARCHAR(7) DEFAULT '#ffffff',
        max_tries_per_user INTEGER DEFAULT 5,
        installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        uninstalled_at TIMESTAMP NULL
      )
    `);

    // Create tryon_logs table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS tryon_logs (
        id SERIAL PRIMARY KEY,
        shop VARCHAR(255) NOT NULL,
        customer_ip VARCHAR(45),
        customer_id VARCHAR(255),
        product_id VARCHAR(255),
        product_title TEXT,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        latency_ms INTEGER,
        result_image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for tryon_logs
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_tryon_logs_shop ON tryon_logs(shop)
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_tryon_logs_created_at ON tryon_logs(created_at)
    `);

    // Create rate_limits table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        id SERIAL PRIMARY KEY,
        shop VARCHAR(255) NOT NULL,
        customer_ip VARCHAR(45) NOT NULL,
        date VARCHAR(10) NOT NULL,
        count INTEGER DEFAULT 0,
        UNIQUE(shop, customer_ip, date)
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits(shop, customer_ip, date)
    `);

    // Create credit_purchases table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS credit_purchases (
        id SERIAL PRIMARY KEY,
        shop VARCHAR(255) NOT NULL,
        charge_id VARCHAR(255) UNIQUE,
        amount_usd DECIMAL(10, 2),
        credits_purchased INTEGER,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        activated_at TIMESTAMP NULL
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_credit_purchases_shop ON credit_purchases(shop)
    `);

    console.log("✅ Business database tables initialized successfully");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    throw error;
  }
}

/**
 * Tests the database connection.
 */
export async function testDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connection successful");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}

