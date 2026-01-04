-- Restore original Session schema with data JSON field
-- Remove the columns that were incorrectly added
ALTER TABLE "Session" DROP COLUMN IF EXISTS "state";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "isOnline";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "scope";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "expires";

-- Restore data column if it doesn't exist
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "data" JSONB;
ALTER TABLE "Session" ALTER COLUMN "data" SET DEFAULT '{}'::jsonb;
ALTER TABLE "Session" ALTER COLUMN "data" SET NOT NULL;





