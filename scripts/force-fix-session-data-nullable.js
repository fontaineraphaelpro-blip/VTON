// Script to force fix Session.data column to be nullable
// Run this if migrations don't work: node scripts/force-fix-session-data-nullable.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function forceFixSessionDataNullable() {
  try {
    console.log('[FIX] Checking Session.data column...');
    
    // Check current state
    const columnInfo = await prisma.$queryRaw`
      SELECT 
        column_name,
        is_nullable,
        column_default,
        data_type
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'Session' 
      AND column_name = 'data'
    `;
    
    if (Array.isArray(columnInfo) && columnInfo.length > 0) {
      const col = columnInfo[0];
      console.log('[FIX] Current data column state:', {
        is_nullable: col.is_nullable,
        has_default: !!col.column_default,
        data_type: col.data_type
      });
      
      if (col.is_nullable === 'NO') {
        console.log('[FIX] ⚠️  data column is NOT NULL - fixing...');
        
        // Force remove NOT NULL
        await prisma.$executeRaw`ALTER TABLE "Session" ALTER COLUMN "data" DROP NOT NULL`;
        console.log('[FIX] ✅ Removed NOT NULL constraint');
        
        // Remove default if exists
        try {
          await prisma.$executeRaw`ALTER TABLE "Session" ALTER COLUMN "data" DROP DEFAULT`;
          console.log('[FIX] ✅ Removed DEFAULT');
        } catch (e) {
          console.log('[FIX] ℹ️  No DEFAULT to remove (or already removed)');
        }
        
        console.log('[FIX] ✅ data column is now nullable');
      } else {
        console.log('[FIX] ✅ data column is already nullable');
      }
    } else {
      console.log('[FIX] ⚠️  data column does not exist - adding as nullable...');
      await prisma.$executeRaw`ALTER TABLE "Session" ADD COLUMN "data" JSONB`;
      console.log('[FIX] ✅ Added data column as nullable');
    }
    
    await prisma.$disconnect();
    console.log('[FIX] ✅ Fix completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('[FIX] ❌ Error fixing Session.data column:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

forceFixSessionDataNullable();









