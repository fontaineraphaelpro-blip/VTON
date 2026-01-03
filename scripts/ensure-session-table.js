// Script to ensure Session table exists and has correct schema before starting the app
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function ensureSessionTable() {
  try {
    console.log('[SETUP] Checking if Session table exists...');
    
    // Try to query the table directly - if it doesn't exist, this will throw
    await prisma.$queryRaw`SELECT 1 FROM "Session" LIMIT 1`;
    
    console.log('[SETUP] Session table exists ✓');
    
    // Check if 'data' column exists and remove it if it does
    try {
      const columnCheck = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Session' 
        AND column_name = 'data'
      `;
      
      if (Array.isArray(columnCheck) && columnCheck.length > 0) {
        console.log('[SETUP] ⚠️  Found obsolete "data" column in Session table');
        console.log('[SETUP] Removing "data" column...');
        
        // Make column nullable first
        try {
          await prisma.$executeRaw`ALTER TABLE "Session" ALTER COLUMN "data" DROP NOT NULL`;
        } catch (e) {
          // Ignore if already nullable or constraint doesn't exist
          console.log('[SETUP]   (Column might already be nullable)');
        }
        
        // Remove default
        try {
          await prisma.$executeRaw`ALTER TABLE "Session" ALTER COLUMN "data" DROP DEFAULT`;
        } catch (e) {
          // Ignore if no default
        }
        
        // Drop the column
        await prisma.$executeRaw`ALTER TABLE "Session" DROP COLUMN "data" CASCADE`;
        console.log('[SETUP] ✓ Successfully removed "data" column');
      } else {
        console.log('[SETUP] ✓ Session table schema is correct (no "data" column)');
      }
    } catch (error) {
      console.warn('[SETUP] ⚠️  Could not check/remove "data" column:', error.message);
      // Continue anyway - migrations should handle this
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

