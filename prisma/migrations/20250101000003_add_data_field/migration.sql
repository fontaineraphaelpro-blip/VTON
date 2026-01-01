-- AlterTable: Add data field to Session table (required by PrismaSessionStorage)
-- The data field stores serialized session data

-- Add column as nullable first (if it doesn't exist)
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "data" TEXT;

-- Set default value for existing rows
UPDATE "Session" SET "data" = '' WHERE "data" IS NULL;

-- Make column NOT NULL with default
ALTER TABLE "Session" ALTER COLUMN "data" SET NOT NULL;
ALTER TABLE "Session" ALTER COLUMN "data" SET DEFAULT '';

