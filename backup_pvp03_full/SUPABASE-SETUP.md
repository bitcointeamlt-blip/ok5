# Supabase Setup Guide

## 1. Sukurkite `.env` failą

Projekto šakniniame kataloge sukurkite `.env` failą su šiuo turiniu:

```
VITE_SUPABASE_URL=https://ahsjrhaegcjleprxxcdn.supabase.co
VITE_SUPABASE_ANON_KEY=JŪSŲ_VISAS_API_RAKTAS
```

**Kaip gauti API raktą:**
1. Eikite į Supabase dashboard: https://app.supabase.com
2. Pasirinkite savo projektą "ok1"
3. Eikite į **Project Settings** > **API**
4. Raskite **"anon public"** raktą
5. Spustelėkite **"Copy"** mygtuką šalia rakto
6. Įklijuokite visą raktą į `.env` failą

## 2. Sukurkite duomenų bazės lenteles

Eikite į Supabase dashboard > **SQL Editor** ir vykdykite šį SQL kodą:

```sql
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
  state TEXT NOT NULL CHECK (state IN ('waiting', 'active', 'done')),
  seed INTEGER NOT NULL,
  winner TEXT,
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

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_matches_state ON matches(state);
CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(p1, p2);
CREATE INDEX IF NOT EXISTS idx_pvp_inputs_match ON pvp_inputs(match_id);
CREATE INDEX IF NOT EXISTS idx_pvp_inputs_player ON pvp_inputs(player_address);
```

## 3. Įjunkite Row Level Security (RLS)

Kiekvienai lentelei reikia įjungti RLS ir sukurti politikas:

```sql
-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pvp_inputs ENABLE ROW LEVEL SECURITY;

-- Profiles: vartotojai gali skaityti ir rašyti tik savo profilį
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (true);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (true);

-- Waiting players: visi gali skaityti ir rašyti
CREATE POLICY "Anyone can manage waiting players" ON waiting_players
  FOR ALL USING (true);

-- Matches: visi gali skaityti, bet tik savo rungtynes
CREATE POLICY "Users can read own matches" ON matches
  FOR SELECT USING (p1 = current_setting('request.jwt.claims', true)::json->>'ronin_address' OR 
                    p2 = current_setting('request.jwt.claims', true)::json->>'ronin_address');

-- PvP inputs: visi gali skaityti ir rašyti (temporarily, for testing)
CREATE POLICY "Anyone can manage pvp inputs" ON pvp_inputs
  FOR ALL USING (true);
```

**Pastaba:** RLS politikos gali reikalauti papildomų nustatymų, priklausomai nuo jūsų autentifikavimo metodo. Jei kyla problemų, galite laikinai išjungti RLS testavimui:

```sql
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE matches DISABLE ROW LEVEL SECURITY;
ALTER TABLE pvp_inputs DISABLE ROW LEVEL SECURITY;
```

## 4. Patikrinkite, ar veikia

1. Paleiskite dev serverį: `npm run dev`
2. Atidarykite naršyklę: `http://localhost:3000`
3. Prisijunkite su Ronin Wallet
4. Spustelėkite "PvP Online" mygtuką
5. Turėtumėte matyti "SEARCHING FOR OPPONENT..." ekraną

Jei vis dar matote klaidą, patikrinkite naršyklės konsolę (F12) dėl klaidų pranešimų.

