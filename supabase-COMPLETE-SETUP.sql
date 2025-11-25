-- ============================================
-- COMPLETE SUPABASE SETUP FOR PvP GAME
-- ============================================
-- Copy and paste this ENTIRE file into Supabase SQL Editor and run it
-- This will set up everything correctly without conflicts
-- ============================================

-- ============================================
-- STEP 1: DROP EXISTING OBJECTS (to avoid conflicts)
-- ============================================

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_find_opponent ON waiting_players;

-- Drop functions
DROP FUNCTION IF EXISTS find_opponent_and_create_match();
DROP FUNCTION IF EXISTS check_and_create_matches();

-- Drop policies
DROP POLICY IF EXISTS "Allow all on profiles" ON profiles;
DROP POLICY IF EXISTS "Allow all on waiting_players" ON waiting_players;
DROP POLICY IF EXISTS "Allow all on matches" ON matches;
DROP POLICY IF EXISTS "Allow all on pvp_inputs" ON pvp_inputs;

-- ============================================
-- STEP 2: CREATE/UPDATE TABLES
-- ============================================

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
-- IMPORTANT: This includes p1Ready and p2Ready columns, and 'ready' state
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

-- Add p1Ready and p2Ready columns if they don't exist (for existing tables)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'matches' AND column_name = 'p1Ready') THEN
    ALTER TABLE matches ADD COLUMN p1Ready BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'matches' AND column_name = 'p2Ready') THEN
    ALTER TABLE matches ADD COLUMN p2Ready BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Update state constraint to include 'ready' if needed
DO $$
BEGIN
  -- Check if constraint exists and update it
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
             WHERE constraint_name LIKE '%matches_state%' AND table_name = 'matches') THEN
    -- Drop old constraint
    ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_state_check;
    -- Add new constraint with 'ready'
    ALTER TABLE matches ADD CONSTRAINT matches_state_check 
      CHECK (state IN ('waiting', 'ready', 'active', 'done'));
  END IF;
END $$;

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

-- ============================================
-- STEP 3: CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_matches_state ON matches(state);
CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(p1, p2);
CREATE INDEX IF NOT EXISTS idx_pvp_inputs_match ON pvp_inputs(match_id);
CREATE INDEX IF NOT EXISTS idx_pvp_inputs_player ON pvp_inputs(player_address);

-- ============================================
-- STEP 4: ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pvp_inputs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 5: CREATE RLS POLICIES
-- ============================================

-- Profiles: allow all operations (for testing - adjust for production)
CREATE POLICY "Allow all on profiles" ON profiles
  FOR ALL USING (true) WITH CHECK (true);

-- Waiting players: allow all operations
CREATE POLICY "Allow all on waiting_players" ON waiting_players
  FOR ALL USING (true) WITH CHECK (true);

-- Matches: allow all operations
CREATE POLICY "Allow all on matches" ON matches
  FOR ALL USING (true) WITH CHECK (true);

-- PvP inputs: allow all operations
CREATE POLICY "Allow all on pvp_inputs" ON pvp_inputs
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- STEP 6: CREATE MATCHMAKING FUNCTIONS
-- ============================================
-- IMPORTANT: This is the CORRECT version with state='waiting' and p1Ready/p2Ready

-- Function to find opponent and create match
CREATE OR REPLACE FUNCTION find_opponent_and_create_match()
RETURNS TRIGGER AS $$
DECLARE
  opponent_address TEXT;
  new_match_id UUID;
  random_seed INTEGER;
BEGIN
  -- Try to find an opponent who joined before this player
  SELECT wp.ronin_address INTO opponent_address
  FROM waiting_players wp
  WHERE wp.ronin_address != NEW.ronin_address
  ORDER BY wp.joined_at ASC
  LIMIT 1;

  -- If opponent found, create a match
  IF opponent_address IS NOT NULL THEN
    -- Generate a random seed for the match
    random_seed := floor(random() * 1000000);
    
    -- Create a new match with state 'waiting' (will change to 'ready' when players click Ready)
    -- Both players start as NOT READY (p1Ready = FALSE, p2Ready = FALSE)
    INSERT INTO matches (p1, p2, state, seed, p1Ready, p2Ready)
    VALUES (NEW.ronin_address, opponent_address, 'waiting', random_seed, FALSE, FALSE)
    RETURNING id INTO new_match_id;

    -- Remove both players from waiting_players table
    DELETE FROM waiting_players
    WHERE ronin_address IN (NEW.ronin_address, opponent_address);

    RAISE NOTICE 'Match created: % between % and %', new_match_id, NEW.ronin_address, opponent_address;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that runs when a new player joins waiting_players
CREATE TRIGGER trigger_find_opponent
  AFTER INSERT ON waiting_players
  FOR EACH ROW
  EXECUTE FUNCTION find_opponent_and_create_match();

-- Also create a function that can be called manually to check for matches
CREATE OR REPLACE FUNCTION check_and_create_matches()
RETURNS INTEGER AS $$
DECLARE
  player1_address TEXT;
  player2_address TEXT;
  new_match_id UUID;
  random_seed INTEGER;
  matches_created INTEGER := 0;
BEGIN
  -- Find pairs of players waiting
  WHILE (SELECT COUNT(*) FROM waiting_players) >= 2 LOOP
    -- Get first two players
    SELECT ronin_address INTO player1_address
    FROM waiting_players
    ORDER BY joined_at ASC
    LIMIT 1;

    SELECT ronin_address INTO player2_address
    FROM waiting_players
    WHERE ronin_address != player1_address
    ORDER BY joined_at ASC
    LIMIT 1;

    -- If we have two players, create a match
    IF player1_address IS NOT NULL AND player2_address IS NOT NULL THEN
      random_seed := floor(random() * 1000000);
      
      -- Create match with state 'waiting' and both players NOT READY
      INSERT INTO matches (p1, p2, state, seed, p1Ready, p2Ready)
      VALUES (player1_address, player2_address, 'waiting', random_seed, FALSE, FALSE)
      RETURNING id INTO new_match_id;

      -- Remove both players from waiting_players
      DELETE FROM waiting_players
      WHERE ronin_address IN (player1_address, player2_address);

      matches_created := matches_created + 1;
      RAISE NOTICE 'Match created: % between % and %', new_match_id, player1_address, player2_address;
    ELSE
      EXIT; -- No more pairs found
    END IF;
  END LOOP;

  RETURN matches_created;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 7: GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION find_opponent_and_create_match() TO anon;
GRANT EXECUTE ON FUNCTION check_and_create_matches() TO anon;

-- ============================================
-- DONE! Setup complete.
-- ============================================
-- Now both players should be able to enter lobby and find matches correctly.
-- Matches will be created with state='waiting' and both players NOT READY.
-- Players must click "Ready" to start the game.
-- ============================================

