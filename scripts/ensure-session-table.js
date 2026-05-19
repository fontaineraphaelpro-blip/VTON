// Script to ensure Session table exists and has correct schema before starting the app
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function ensureSessionTable() {
  try {
    console.log('[SETUP] Checking if Session table exists...');
    
    // Try to query the table directly - if it doesn't exist, this will throw
    await prisma.$queryRaw`SELECT 1 FROM "Session" LIMIT 1`;
    
    console.log('[SETUP] Session table exists ✓');
    
    // Check and fix data column if needed (must be NOT NULL with default for PrismaSessionStorage)
    try {
      const columnInfo = await prisma.$queryRaw`
        SELECT is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Session' 
        AND column_name = 'data'
      `;
      
      if (Array.isArray(columnInfo) && columnInfo.length > 0) {
        const col = columnInfo[0];
        // PrismaSessionStorage requires data to be NOT NULL with default
        if (col.is_nullable === 'YES' || !col.column_default) {
          console.log('[SETUP] ⚠️  data column must be NOT NULL with default - fixing...');
          
          // Set default first
          await prisma.$executeRaw`ALTER TABLE "Session" ALTER COLUMN "data" SET DEFAULT '{}'::jsonb`;
          
          // Update any NULL values
          await prisma.$executeRaw`UPDATE "Session" SET "data" = '{}'::jsonb WHERE "data" IS NULL`;
          
          // Make it NOT NULL
          await prisma.$executeRaw`ALTER TABLE "Session" ALTER COLUMN "data" SET NOT NULL`;
          
          console.log('[SETUP] ✅ Fixed data column (now NOT NULL with default)');
        } else {
          console.log('[SETUP] ✅ data column is correctly configured (NOT NULL with default)');
        }
      } else {
        // Column doesn't exist, add it
        console.log('[SETUP] ⚠️  data column missing - adding...');
        await prisma.$executeRaw`ALTER TABLE "Session" ADD COLUMN "data" JSONB NOT NULL DEFAULT '{}'::jsonb`;
        console.log('[SETUP] ✅ Added data column (NOT NULL with default)');
      }
    } catch (error) {
      console.warn('[SETUP] ⚠️  Could not check/fix data column:', error.message);
      // Continue anyway - migration should handle this
    }
    
    await prisma.$disconnect();
    return true;
  } catch (error) {
    if (error.message?.includes('does not exist') || error.message?.includes('relation') || error.code === '42P01') {
      console.error('[SETUP] ❌ Session table does not exist!');
      console.error('[SETUP] The migrations may not have run successfully.');
      console.error('[SETUP] Please check that:');
      console.error('[SETUP]   1. DATABASE_URL is correctly set');
      console.error('[SETUP]   2. The database is accessible');
      console.error('[SETUP]   3. Run: npx prisma migrate deploy');
      await prisma.$disconnect();
      process.exit(1);
    } else {
      // Other errors might be connection issues, but let's try to continue
      console.warn('[SETUP] ⚠️  Could not verify Session table:', error.message);
      console.warn('[SETUP] Continuing anyway - table might exist...');
      await prisma.$disconnect();
    }
  }
}

ensureSessionTable();

