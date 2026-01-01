-- Fix Session table to match exact Shopify Remix JS schema
-- Drop and recreate with correct schema

DROP TABLE IF EXISTS "Session";

CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT UNIQUE,
  "shop" TEXT NOT NULL,
  "state" TEXT,
  "isOnline" BOOLEAN,
  "scope" TEXT,
  "expires" TIMESTAMP,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "refreshTokenExpires" TIMESTAMP,
  "userId" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "email" TEXT,
  "accountOwner" BOOLEAN,
  "locale" TEXT,
  "collaborator" BOOLEAN,
  "emailVerified" BOOLEAN,
  "data" TEXT NOT NULL
);

