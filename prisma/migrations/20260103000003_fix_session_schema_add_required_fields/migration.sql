-- Fix Session model to match PrismaSessionStorage requirements
-- Remove data column and add required fields that PrismaSessionStorage expects

-- First, remove data column if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_schema = 'public' 
             AND table_name = 'Session' 
             AND column_name = 'data') THEN
    ALTER TABLE "Session" ALTER COLUMN "data" DROP NOT NULL;
    ALTER TABLE "Session" ALTER COLUMN "data" DROP DEFAULT;
    ALTER TABLE "Session" DROP COLUMN "data" CASCADE;
  END IF;
END $$;

-- Add required fields that PrismaSessionStorage expects
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "isOnline" BOOLEAN DEFAULT false;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "scope" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "expires" TIMESTAMP(3);








