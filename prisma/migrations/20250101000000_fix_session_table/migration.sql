-- AlterTable: Update Session table to match new schema with sessionId
-- Drop existing table if it exists (will be recreated by prisma db push)
DROP TABLE IF EXISTS "Session";

-- CreateTable: Create Session table with correct schema
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL UNIQUE,
    "data" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT,
    "isOnline" BOOLEAN NOT NULL,
    "expires" TIMESTAMP
);

