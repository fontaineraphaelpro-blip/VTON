-- Fix Session model: make data column nullable
-- Shopify doesn't provide data field by default, so it must be optional
-- This migration FORCES the column to be nullable even if it has NOT NULL constraint

DO $$ 
BEGIN
  -- Check if data column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'Session' 
    AND column_name = 'data'
  ) THEN
    -- Force remove NOT NULL constraint (PostgreSQL doesn't support IF EXISTS for this)
    BEGIN
      EXECUTE 'ALTER TABLE "Session" ALTER COLUMN "data" DROP NOT NULL';
      RAISE NOTICE 'Successfully removed NOT NULL constraint from data column';
    EXCEPTION WHEN OTHERS THEN
      -- Column might already be nullable, ignore error
      RAISE NOTICE 'data column is already nullable or constraint removal failed: %', SQLERRM;
    END;
    
    -- Remove default if exists
    BEGIN
      EXECUTE 'ALTER TABLE "Session" ALTER COLUMN "data" DROP DEFAULT';
    EXCEPTION WHEN OTHERS THEN
      -- No default, ignore
      NULL;
    END;
  ELSE
    -- Add data column if it doesn't exist (nullable from the start)
    ALTER TABLE "Session" ADD COLUMN "data" JSONB;
    RAISE NOTICE 'Added data column as nullable';
  END IF;
END $$;

