-- AlterTable: Remove data column and add required Session fields
ALTER TABLE "Session" DROP COLUMN IF EXISTS "data";
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "scope" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "expires" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "accessToken" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "userId" BIGINT;
ALTER TABLE "Session" ALTER COLUMN "isOnline" SET DEFAULT false;

