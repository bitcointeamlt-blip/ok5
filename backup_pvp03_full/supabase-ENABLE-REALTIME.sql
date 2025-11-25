-- ============================================
-- ENABLE SUPABASE REALTIME FOR PvP GAME
-- ============================================
-- This script enables Realtime (WebSocket) for your tables
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Check if Realtime is enabled (should return true)
SELECT * FROM pg_publication WHERE pubname = 'supabase_realtime';

-- Step 2: Enable Realtime for matches table (for matchmaking)
-- This allows real-time updates when matches are created/updated
DO $$
BEGIN
  -- Check if publication exists
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Create publication if it doesn't exist
    CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
    RAISE NOTICE '✅ Created supabase_realtime publication';
  ELSE
    RAISE NOTICE 'ℹ️ supabase_realtime publication already exists';
  END IF;
  
  -- Add matches table to publication (if not already added)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE matches;
    RAISE NOTICE '✅ Added matches table to Realtime publication';
  ELSE
    RAISE NOTICE 'ℹ️ matches table already in Realtime publication';
  END IF;
  
  -- Add waiting_players table to publication (if not already added)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'waiting_players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE waiting_players;
    RAISE NOTICE '✅ Added waiting_players table to Realtime publication';
  ELSE
    RAISE NOTICE 'ℹ️ waiting_players table already in Realtime publication';
  END IF;
  
  -- Add profiles table to publication (if not already added)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
    RAISE NOTICE '✅ Added profiles table to Realtime publication';
  ELSE
    RAISE NOTICE 'ℹ️ profiles table already in Realtime publication';
  END IF;
END $$;

-- Step 3: Verify Realtime is enabled for all tables
SELECT 
  pubname as publication_name,
  tablename as table_name
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ============================================
-- DONE! Realtime should now be enabled
-- ============================================
-- After running this script:
-- 1. Go to Supabase Dashboard → Database → Replication
-- 2. Verify that your tables (matches, waiting_players, profiles) are listed
-- 3. Test your PvP game - WebSocket should now work instead of REST API fallback
-- ============================================

