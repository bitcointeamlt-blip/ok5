-- FIX: Add p1Ready and p2Ready columns to matches table if they don't exist
-- Run this in Supabase SQL Editor
-- VERSION 2: Handles existing columns gracefully

-- First, check what columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'matches' 
  AND LOWER(column_name) IN (LOWER('p1Ready'), LOWER('p2Ready'))
ORDER BY column_name;

-- Try to add columns (will fail gracefully if they exist)
DO $$ 
BEGIN
  -- Try to add p1Ready column
  BEGIN
    ALTER TABLE matches ADD COLUMN "p1Ready" BOOLEAN DEFAULT FALSE;
    RAISE NOTICE '✅ Added p1Ready column';
  EXCEPTION 
    WHEN duplicate_column THEN
      RAISE NOTICE 'ℹ️ p1Ready column already exists - OK';
    WHEN OTHERS THEN
      RAISE NOTICE '⚠️ Error adding p1Ready: %', SQLERRM;
  END;
  
  -- Try to add p2Ready column
  BEGIN
    ALTER TABLE matches ADD COLUMN "p2Ready" BOOLEAN DEFAULT FALSE;
    RAISE NOTICE '✅ Added p2Ready column';
  EXCEPTION 
    WHEN duplicate_column THEN
      RAISE NOTICE 'ℹ️ p2Ready column already exists - OK';
    WHEN OTHERS THEN
      RAISE NOTICE '⚠️ Error adding p2Ready: %', SQLERRM;
  END;
  
  -- Update state constraint to include 'ready' if needed
  BEGIN
    -- Drop old constraint if exists
    ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_state_check;
    -- Add new constraint with 'ready'
    ALTER TABLE matches ADD CONSTRAINT matches_state_check 
      CHECK (state IN ('waiting', 'ready', 'active', 'done'));
    RAISE NOTICE '✅ Updated state constraint to include ready';
  EXCEPTION 
    WHEN OTHERS THEN
      RAISE NOTICE '⚠️ Error updating constraint: %', SQLERRM;
  END;
END $$;

-- Verify columns exist (case-insensitive)
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'matches' 
  AND LOWER(column_name) IN (LOWER('p1Ready'), LOWER('p2Ready'), LOWER('state'))
ORDER BY column_name;

-- Update any existing matches to have default ready values (if columns exist)
DO $$
BEGIN
  -- Check if p1Ready exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'matches' AND LOWER(column_name) = LOWER('p1Ready')
  ) THEN
    UPDATE matches 
    SET "p1Ready" = COALESCE("p1Ready", FALSE)
    WHERE "p1Ready" IS NULL;
    RAISE NOTICE '✅ Updated p1Ready defaults';
  END IF;
  
  -- Check if p2Ready exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'matches' AND LOWER(column_name) = LOWER('p2Ready')
  ) THEN
    UPDATE matches 
    SET "p2Ready" = COALESCE("p2Ready", FALSE)
    WHERE "p2Ready" IS NULL;
    RAISE NOTICE '✅ Updated p2Ready defaults';
  END IF;
END $$;

