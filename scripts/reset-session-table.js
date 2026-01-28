// Script to reset Session table schema (equivalent to migrate reset for Session table only)
// This will be run on Railway during deployment
// Run manually: node scripts/reset-session-table.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetSessionTable() {
  try {
    console.log('[RESET] Starting Session table reset...');
    
    // Drop the Session table completely
    console.log('[RESET] Dropping Session table...');
    await prisma.$executeRaw`DROP TABLE IF EXISTS "Session" CASCADE`;
    console.log('[RESET] ✅ Session table dropped');
    
    // Recreate with correct schema
    console.log('[RESET] Creating Session table with correct schema...');
    await prisma.$executeRaw`
      CREATE TABLE "Session" (
        "id" TEXT NOT NULL,
        "shop" TEXT NOT NULL,
        "state" TEXT,
        "isOnline" BOOLEAN NOT NULL DEFAULT false,
        "scope" TEXT,
        "expires" TIMESTAMP(3),
        "accessToken" TEXT NOT NULL,
        "userId" BIGINT,
        "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
      )
    `;
    console.log('[RESET] ✅ Session table created with correct schema');
    
    // Verify the schema
    const columnInfo = await prisma.$queryRaw`
      SELECT 
        column_name,
        is_nullable,
        column_default,
        data_type
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'Session'
      ORDER BY ordinal_position
    `;
    
    console.log('[RESET] ✅ Session table schema verified:');
    if (Array.isArray(columnInfo)) {
      columnInfo.forEach(col => {
        console.log(`[RESET]   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
      });
    }
    
    await prisma.$disconnect();
    console.log('[RESET] ✅ Reset completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('[RESET] ❌ Error resetting Session table:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

resetSessionTable();












