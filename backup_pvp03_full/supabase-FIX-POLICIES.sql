-- Fix Supabase Policies - Safe to run multiple times
-- This script will drop and recreate policies without errors

-- Drop existing policies (safe - won't error if they don't exist)
DROP POLICY IF EXISTS "Allow all on profiles" ON profiles;
DROP POLICY IF EXISTS "Allow all on waiting_players" ON waiting_players;
DROP POLICY IF EXISTS "Allow all on matches" ON matches;
DROP POLICY IF EXISTS "Allow all on pvp_inputs" ON pvp_inputs;

-- Recreate policies
CREATE POLICY "Allow all on profiles" ON profiles
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on waiting_players" ON waiting_players
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on matches" ON matches
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on pvp_inputs" ON pvp_inputs
  FOR ALL USING (true) WITH CHECK (true);

-- Verify policies exist
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('profiles', 'waiting_players', 'matches', 'pvp_inputs')
ORDER BY tablename, policyname;

