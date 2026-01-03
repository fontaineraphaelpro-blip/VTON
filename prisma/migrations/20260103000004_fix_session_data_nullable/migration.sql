-- Fix Session model: make data column nullable
-- Shopify doesn't provide data field by default, so it must be optional

-- Add data column if it doesn't exist (nullable)
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "data" JSONB;

-- Make data column nullable (remove NOT NULL constraint if exists)
ALTER TABLE "Session" ALTER COLUMN "data" DROP NOT NULL;

-- Remove default if exists (not needed for optional field)
ALTER TABLE "Session" ALTER COLUMN "data" DROP DEFAULT;

