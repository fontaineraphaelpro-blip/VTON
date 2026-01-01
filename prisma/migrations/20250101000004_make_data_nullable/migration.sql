-- AlterTable: Make data field nullable in Session table
-- Remove NOT NULL constraint if it exists (PrismaSessionStorage may not always provide data)

-- First, drop any NOT NULL constraint on data column
ALTER TABLE "Session" ALTER COLUMN "data" DROP NOT NULL;

