-- AlterTable: Make sessionId optional (nullable) in Session table
-- This allows PrismaSessionStorage to work correctly as it generates sessionId automatically

ALTER TABLE "Session" ALTER COLUMN "sessionId" DROP NOT NULL;

