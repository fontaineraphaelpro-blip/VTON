-- Fix Session model to match PrismaSessionStorage requirements
-- Add required fields that PrismaSessionStorage expects
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "isOnline" BOOLEAN DEFAULT false;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "scope" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "expires" TIMESTAMP(3);

-- Remove data column if it exists (not used by PrismaSessionStorage)
ALTER TABLE "Session" DROP COLUMN IF EXISTS "data";

