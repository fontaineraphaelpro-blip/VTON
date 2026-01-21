-- AlterTable: Update Session model to use data JSON field
-- Remove old columns that should be in data JSON
ALTER TABLE "Session" DROP COLUMN IF EXISTS "state";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "isOnline";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "scope";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "expires";

-- Add data column if it doesn't exist, or ensure it has default
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "data" JSONB;
ALTER TABLE "Session" ALTER COLUMN "data" SET DEFAULT '{}'::jsonb;










