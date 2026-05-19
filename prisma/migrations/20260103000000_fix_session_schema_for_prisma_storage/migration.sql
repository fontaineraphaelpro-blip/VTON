-- Fix Session model to match PrismaSessionStorage requirements
-- Step 1: Make data column nullable and remove default (if it exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'Session' AND column_name = 'data') THEN
    -- Remove NOT NULL constraint if it exists
    BEGIN
      ALTER TABLE "Session" ALTER COLUMN "data" DROP NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      -- Column might not have NOT NULL constraint, ignore
      NULL;
    END;
    
    -- Remove default if it exists
    BEGIN
      ALTER TABLE "Session" ALTER COLUMN "data" DROP DEFAULT;
    EXCEPTION WHEN OTHERS THEN
      -- No default, ignore
      NULL;
    END;
    
    -- Now drop the column
    ALTER TABLE "Session" DROP COLUMN "data" CASCADE;
  END IF;
END $$;

-- Step 2: Add required fields that PrismaSessionStorage expects
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "isOnline" BOOLEAN DEFAULT false;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "scope" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "expires" TIMESTAMP(3);

