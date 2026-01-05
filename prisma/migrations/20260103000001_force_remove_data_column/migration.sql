-- Force remove data column from Session table
-- This migration ensures the data column is completely removed
-- even if previous migrations failed

DO $$ 
BEGIN
  -- Check if data column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'Session' 
    AND column_name = 'data'
  ) THEN
    -- First, try to make it nullable (in case it has NOT NULL constraint)
    BEGIN
      EXECUTE 'ALTER TABLE "Session" ALTER COLUMN "data" DROP NOT NULL';
    EXCEPTION WHEN OTHERS THEN
      -- Ignore if already nullable or constraint doesn't exist
      NULL;
    END;
    
    -- Remove default if exists
    BEGIN
      EXECUTE 'ALTER TABLE "Session" ALTER COLUMN "data" DROP DEFAULT';
    EXCEPTION WHEN OTHERS THEN
      -- Ignore if no default
      NULL;
    END;
    
    -- Finally, drop the column
    EXECUTE 'ALTER TABLE "Session" DROP COLUMN "data" CASCADE';
    
    RAISE NOTICE 'Successfully removed data column from Session table';
  ELSE
    RAISE NOTICE 'Data column does not exist, skipping removal';
  END IF;
END $$;






