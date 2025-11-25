-- Matchmaking Function for PvP Game
-- This function automatically creates a match when two players are in waiting_players
-- IMPORTANT: Run this in Supabase SQL Editor to update the matchmaking function

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
DROP TRIGGER IF EXISTS trigger_find_opponent ON waiting_players;
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION find_opponent_and_create_match() TO anon;
GRANT EXECUTE ON FUNCTION check_and_create_matches() TO anon;

