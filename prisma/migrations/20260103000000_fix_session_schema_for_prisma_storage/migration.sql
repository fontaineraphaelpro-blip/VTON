-- Fix Session model to match PrismaSessionStorage requirements
-- Remove data column first (if it exists) to avoid constraint violations
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'Session' AND column_name = 'data') THEN
    ALTER TABLE "Session" DROP COLUMN "data" CASCADE;
  END IF;
END $$;

-- Add required fields that PrismaSessionStorage expects
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "isOnline" BOOLEAN DEFAULT false;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "scope" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "expires" TIMESTAMP(3);

