-- Supabase Database Setup for PvP Game
-- Copy and paste this entire file into Supabase SQL Editor and run it

-- 1. Create tables

-- Profiles table (vartotojų profiliai)
CREATE TABLE IF NOT EXISTS profiles (
  ronin_address TEXT PRIMARY KEY,
  solo_data JSONB DEFAULT '{}',
  pvp_data JSONB DEFAULT '{"elo": 1000, "wins": 0, "losses": 0}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Waiting players table (lobby)
CREATE TABLE IF NOT EXISTS waiting_players (
  ronin_address TEXT PRIMARY KEY,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matches table (žaidimų rungtynės)
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  p1 TEXT NOT NULL,
  p2 TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('waiting', 'ready', 'active', 'done')),
  seed INTEGER NOT NULL,
  winner TEXT,
  p1Ready BOOLEAN DEFAULT FALSE,
  p2Ready BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PvP inputs table (žaidėjų įvestys)
CREATE TABLE IF NOT EXISTS pvp_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_address TEXT NOT NULL,
  input_type TEXT NOT NULL,
  input_data JSONB NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_matches_state ON matches(state);
CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(p1, p2);
CREATE INDEX IF NOT EXISTS idx_pvp_inputs_match ON pvp_inputs(match_id);
CREATE INDEX IF NOT EXISTS idx_pvp_inputs_player ON pvp_inputs(player_address);

-- 3. Enable Row Level Security (RLS)
-- NOTE: For testing, you can temporarily disable RLS if you have issues
-- To disable: ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pvp_inputs ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
-- Drop existing policies if they exist, then create new ones
-- Profiles: allow all operations (for testing - adjust for production)
DROP POLICY IF EXISTS "Allow all on profiles" ON profiles;
CREATE POLICY "Allow all on profiles" ON profiles
  FOR ALL USING (true) WITH CHECK (true);

-- Waiting players: allow all operations
DROP POLICY IF EXISTS "Allow all on waiting_players" ON waiting_players;
CREATE POLICY "Allow all on waiting_players" ON waiting_players
  FOR ALL USING (true) WITH CHECK (true);

-- Matches: allow all operations
DROP POLICY IF EXISTS "Allow all on matches" ON matches;
CREATE POLICY "Allow all on matches" ON matches
  FOR ALL USING (true) WITH CHECK (true);

-- PvP inputs: allow all operations
DROP POLICY IF EXISTS "Allow all on pvp_inputs" ON pvp_inputs;
CREATE POLICY "Allow all on pvp_inputs" ON pvp_inputs
  FOR ALL USING (true) WITH CHECK (true);

