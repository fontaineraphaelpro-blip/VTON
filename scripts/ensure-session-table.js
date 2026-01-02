// Script to ensure Session table exists before starting the app
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function ensureSessionTable() {
  try {
    console.log('[SETUP] Checking if Session table exists...');
    
    // Try to query the table directly - if it doesn't exist, this will throw
    await prisma.$queryRaw`SELECT 1 FROM "Session" LIMIT 1`;
    
    console.log('[SETUP] Session table exists ✓');
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

