-- Fix Session model: make data column REQUIRED with default
-- PrismaSessionStorage requires data to be NOT NULL and fills it automatically
-- This is the correct schema for Shopify v11+

-- Add data column if it doesn't exist (with NOT NULL and default)
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "data" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- If column exists but is nullable, make it NOT NULL with default
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'Session' 
    AND column_name = 'data'
  ) THEN
    -- Set default first (required before making NOT NULL if column has NULL values)
    ALTER TABLE "Session" ALTER COLUMN "data" SET DEFAULT '{}'::jsonb;
    
    -- Update any NULL values to empty JSON
    UPDATE "Session" SET "data" = '{}'::jsonb WHERE "data" IS NULL;
    
    -- Now make it NOT NULL
    ALTER TABLE "Session" ALTER COLUMN "data" SET NOT NULL;
    
    RAISE NOTICE 'Successfully made data column NOT NULL with default';
  ELSE
    -- Column doesn't exist, add it with NOT NULL and default
    ALTER TABLE "Session" ADD COLUMN "data" JSONB NOT NULL DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added data column as NOT NULL with default';
  END IF;
END $$;

















