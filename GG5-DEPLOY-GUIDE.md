# GG5 Deployment Guide

## Overview
GG5.zip yra naujausia žaidimo versija su:
- ✅ Ronin Wallet integracija
- ✅ DOT token balance rodymas
- ✅ Training mode (PvP su botu)
- ✅ PvP Online mode (su tikrais žaidėjais)
- ✅ Supabase integracija
- ✅ **Automatic matchmaking** - automatiškai sujungia žaidėjus
- ✅ Responsive design - veikia visuose ekranuose
- ✅ Fixed mouse coordinates - mygtukai veikia teisingai

## Quick Deploy

### 1. Sukurkite GG5.zip
```bash
npm run build:gg5
```
arba
```bash
npm run deploy:gg5
```

### 2. Netlify Deployment

#### A. Manual Deployment
1. Eikite į: https://app.netlify.com
2. Pasirinkite savo projektą arba sukurkite naują
3. Spustelėkite **"Deploy manually"**
4. Įkelkite **GG5.zip** failą
5. Palaukite, kol deploy baigsis

#### B. Environment Variables (SVARBU!)
Kad PvP Online veiktų, turite nustatyti Supabase kredencialus Netlify:

1. Eikite į **Site settings** > **Environment variables**
2. Pridėkite šiuos kintamuosius:

```
VITE_SUPABASE_URL=https://ahsjrhaegcjleprxxcdn.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoc2pyaGFlZ2NqbGVwcnh4Y2RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MDkwNTQsImV4cCI6MjA3ODE4NTA1NH0.iuKEZVkVyD1lYpb9MPJ3MrMm99uGVcxdwARu165SLKc
```

3. Spustelėkite **"Save"**
4. **Redeploy** savo svetainę, kad kintamieji būtų įkelti

### 3. Supabase Database Setup

#### A. Sukurkite lenteles (jei dar nepadaryta)
1. Eikite į Supabase dashboard: https://app.supabase.com
2. Pasirinkite projektą "ok1"
3. Eikite į **SQL Editor**
4. Vykdykite SQL kodą iš `supabase-setup.sql` failo

#### B. Sukurkite matchmaking funkciją (SVARBU!)
**Be šios funkcijos matchmaking neveiks!**

1. Eikite į **SQL Editor**
2. Vykdykite SQL kodą iš `supabase-matchmaking-function.sql` failo
3. Arba nukopijuokite ir vykdykite šį kodą:

```sql
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
    random_seed := floor(random() * 1000000);
    
    INSERT INTO matches (p1, p2, state, seed)
    VALUES (NEW.ronin_address, opponent_address, 'active', random_seed)
    RETURNING id INTO new_match_id;

    DELETE FROM waiting_players
    WHERE ronin_address IN (NEW.ronin_address, opponent_address);

    RAISE NOTICE 'Match created: % between % and %', new_match_id, NEW.ronin_address, opponent_address;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_find_opponent ON waiting_players;
CREATE TRIGGER trigger_find_opponent
  AFTER INSERT ON waiting_players
  FOR EACH ROW
  EXECUTE FUNCTION find_opponent_and_create_match();
```

## What's New in GG5

### 🎮 Automatic Matchmaking
- **Database trigger** automatiškai sukuria match kai du žaidėjai yra lobby
- Nereikia rankiniu būdu sujungti žaidėjų
- Veikia real-time - match sukuriamas per kelias sekundes

### 📱 Responsive Design
- Canvas tinkamai skaliruojasi visuose ekranuose
- UI panelės visada matomos, net mažuose ekranuose
- Pridėti media queries skirtingiems ekranų dydžiams

### 🖱️ Fixed Mouse Coordinates
- Pridėta `getCanvasMousePos()` funkcija
- Visi mouse event handler'iai teisingai konvertuoja koordinates
- Mygtukai veikia teisingai net kai canvas yra skaliruojamas

## How Matchmaking Works

1. **Žaidėjas prisijungia:**
   - Spustelėkite "PvP Online" mygtuką
   - Žaidėjas įtraukiamas į `waiting_players` lentelę

2. **Automatinis matchmaking:**
   - Database trigger automatiškai patikrina, ar yra kitas žaidėjas
   - Jei yra, sukuriamas match ir abu žaidėjai pašalinami iš `waiting_players`
   - Abi pusės gauna pranešimą per realtime subscription

3. **Žaidimas prasideda:**
   - Match sukuriamas su `state = 'active'`
   - Abu žaidėjai mato vienas kitą ir gali žaisti

## Troubleshooting

### Matchmaking neveikia
- **Patikrinkite, ar matchmaking funkcija yra sukuria:**
  ```sql
  SELECT proname FROM pg_proc WHERE proname = 'find_opponent_and_create_match';
  ```
- **Patikrinkite, ar trigger yra sukurtas:**
  ```sql
  SELECT tgname FROM pg_trigger WHERE tgname = 'trigger_find_opponent';
  ```
- **Jei funkcija neegzistuoja, vykdykite `supabase-matchmaking-function.sql`**

### Du žaidėjai lobby, bet match nesukuriamas
- **Rankiniu būdu sukurkite match:**
  ```sql
  SELECT check_and_create_matches();
  ```
- **Patikrinkite, ar abu žaidėjai yra `waiting_players` lentelėje:**
  ```sql
  SELECT * FROM waiting_players;
  ```

### UI panelės nematomos
- Patikrinkite, ar naudojate GG5.zip (ne senesnę versiją)
- Patikrinkite naršyklės konsolę (F12) dėl klaidų
- Bandykite perkrauti puslapį (Ctrl+R)

### Mygtukai neveikia
- Patikrinkite, ar canvas yra tinkamo dydžio
- Patikrinkite naršyklės konsolę dėl JavaScript klaidų
- Bandykite kitą naršyklę

### PvP Online neveikia
- Patikrinkite, ar Netlify environment variables yra nustatyti
- Patikrinkite, ar Supabase lentelės yra sukurtos
- Patikrinkite, ar matchmaking funkcija yra sukuria
- Atidarykite naršyklės konsolę (F12) ir patikrinkite klaidas

## File Structure

GG5.zip turi:
- `src/` - visi source failai
- `package.json` - dependencies
- `tsconfig.json` - TypeScript config
- `vite.config.ts` - Vite config
- `netlify.toml` - Netlify config
- `index.html` - HTML entry point su responsive CSS
- `.env` - Supabase kredencialai (jei yra)
- `supabase-setup.sql` - SQL kodas lentelių kūrimui
- `supabase-matchmaking-function.sql` - SQL kodas matchmaking funkcijai

## Next Steps

Po sėkmingo deploy:
1. **Įsitikinkite, kad matchmaking funkcija yra sukuria** (svarbiausia!)
2. Atidarykite savo Netlify svetainę
3. Patikrinkite, ar UI panelės matomos skirtinguose ekranuose
4. Išbandykite mygtukus
5. Prisijunkite su Ronin Wallet
6. Išbandykite Training mode
7. Išbandykite PvP Online (reikia kito žaidėjo)

## Notes

- **SVARBU:** Matchmaking funkcija turi būti sukurta Supabase, kitaip žaidėjai nebus sujungiami
- `.env` failas yra įtrauktas į GG5.zip, bet Netlify naudoja environment variables
- Jei keičiate Supabase kredencialus, atnaujinkite Netlify environment variables
- Redeploy svetainę po environment variables pakeitimų
- Responsive design veikia automatiškai - nereikia jokių papildomų nustatymų

