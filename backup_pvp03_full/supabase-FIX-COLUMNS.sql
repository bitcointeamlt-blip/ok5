-- FIX: Add p1Ready and p2Ready columns to matches table if they don't exist
-- Run this in Supabase SQL Editor
-- This version handles case-insensitive column names

-- Check if columns exist and add them if they don't
DO $$ 
BEGIN
  -- Add p1Ready column if it doesn't exist (case-insensitive check)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'matches' 
      AND LOWER(column_name) = LOWER('p1Ready')
  ) THEN
    BEGIN
      ALTER TABLE matches ADD COLUMN "p1Ready" BOOLEAN DEFAULT FALSE;
      RAISE NOTICE 'Added p1Ready column';
    EXCEPTION WHEN duplicate_column THEN
      RAISE NOTICE 'p1Ready column already exists (different case)';
    END;
  ELSE
    RAISE NOTICE 'p1Ready column already exists';
  END IF;
  
  -- Add p2Ready column if it doesn't exist (case-insensitive check)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'matches' 
      AND LOWER(column_name) = LOWER('p2Ready')
  ) THEN
    BEGIN
      ALTER TABLE matches ADD COLUMN "p2Ready" BOOLEAN DEFAULT FALSE;
      RAISE NOTICE 'Added p2Ready column';
    EXCEPTION WHEN duplicate_column THEN
      RAISE NOTICE 'p2Ready column already exists (different case)';
    END;
  ELSE
    RAISE NOTICE 'p2Ready column already exists';
  END IF;
  
  -- Update state constraint to include 'ready' if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name LIKE '%matches_state%' AND table_name = 'matches'
  ) THEN
    -- Drop old constraint
    ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_state_check;
    -- Add new constraint with 'ready'
    ALTER TABLE matches ADD CONSTRAINT matches_state_check 
      CHECK (state IN ('waiting', 'ready', 'active', 'done'));
    RAISE NOTICE 'Updated state constraint to include ready';
  END IF;
END $$;

-- Verify columns exist
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'matches' 
  AND column_name IN ('p1Ready', 'p2Ready', 'state')
ORDER BY column_name;

-- Update any existing matches to have default ready values
UPDATE matches 
SET p1Ready = COALESCE(p1Ready, FALSE),
    p2Ready = COALESCE(p2Ready, FALSE)
WHERE p1Ready IS NULL OR p2Ready IS NULL;

