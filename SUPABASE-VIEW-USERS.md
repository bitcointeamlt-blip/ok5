# Kaip rasti prisijungusias pinigines Supabase

## Kur rasti informaciją

Informaciją apie prisijungusias pinigines galite rasti **3 vietose** Supabase duomenų bazėje:

### 1. **`profiles` lentelė** (Pagrindinė)
Čia saugomi visi vartotojai, kurie kada nors prisijungė su Ronin Wallet.

**Stulpeliai:**
- `ronin_address` - Ronin piniginės adresas (pvz., `0x32782d97a180a0fd5b6f775517ac4e3727bb624a`)
- `created_at` - Kada pirmą kartą prisijungė
- `updated_at` - Paskutinis atnaujinimas
- `solo_data` - Solo žaidimo duomenys (JSON)
- `pvp_data` - PvP duomenys (ELO, wins, losses)

### 2. **`waiting_players` lentelė** (Lobby)
Čia saugomi vartotojai, kurie dabar yra PvP lobby ir ieško priešininko.

**Stulpeliai:**
- `ronin_address` - Ronin piniginės adresas
- `joined_at` - Kada prisijungė prie lobby

**Pastaba:** Ši lentelė gali būti tuščia, jei dabar niekas neieško priešininko.

### 3. **`matches` lentelė** (Rungtynės)
Čia saugomos visos žaidimų rungtynės su žaidėjų adresais.

**Stulpeliai:**
- `p1` - Pirmojo žaidėjo Ronin adresas
- `p2` - Antrojo žaidėjo Ronin adresas
- `created_at` - Kada rungtynės prasidėjo
- `state` - Būsena (`waiting`, `active`, `done`)
- `winner` - Laimėtojo adresas

## Kaip peržiūrėti Supabase Dashboard

### Metodas 1: Table Editor (Lengviausias)

1. **Eikite į Supabase Dashboard:**
   - https://app.supabase.com
   - Prisijunkite ir pasirinkite projektą "ok1"

2. **Atidarykite Table Editor:**
   - Kairėje meniu spustelėkite **"Table Editor"**
   - Pasirinkite **"profiles"** lentelę

3. **Peržiūrėkite duomenis:**
   - Matysite visus prisijungusius vartotojus
   - Kiekvienoje eilutėje bus `ronin_address` (piniginės adresas)
   - `created_at` rodo, kada pirmą kartą prisijungė

### Metodas 2: SQL Editor (Išsamesnė informacija)

1. **Eikite į SQL Editor:**
   - Kairėje meniu spustelėkite **"SQL Editor"**
   - Spustelėkite **"New query"**

2. **Vykdykite SQL užklausas:**

#### Visi prisijungę vartotojai:
```sql
SELECT 
  ronin_address,
  created_at,
  updated_at,
  pvp_data->>'elo' as elo,
  pvp_data->>'wins' as wins,
  pvp_data->>'losses' as losses
FROM profiles
ORDER BY created_at DESC;
```

#### Vartotojai, kurie dabar yra lobby:
```sql
SELECT 
  ronin_address,
  joined_at
FROM waiting_players
ORDER BY joined_at DESC;
```

#### Visi žaidėjai, kurie kada nors žaidė rungtynes:
```sql
SELECT DISTINCT 
  p1 as ronin_address,
  'Player 1' as role
FROM matches
UNION
SELECT DISTINCT 
  p2 as ronin_address,
  'Player 2' as role
FROM matches
ORDER BY ronin_address;
```

#### Statistika pagal vartotoją:
```sql
SELECT 
  ronin_address,
  created_at as first_login,
  pvp_data->>'elo' as elo,
  pvp_data->>'wins' as wins,
  pvp_data->>'losses' as losses,
  (SELECT COUNT(*) FROM matches WHERE p1 = profiles.ronin_address OR p2 = profiles.ronin_address) as total_matches
FROM profiles
ORDER BY created_at DESC;
```

### Metodas 3: API (Programiškai)

Jei norite gauti duomenis programiškai, galite naudoti Supabase API:

```javascript
// JavaScript pavyzdys
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ahsjrhaegcjleprxxcdn.supabase.co',
  'YOUR_ANON_KEY'
);

// Gauti visus profilius
const { data, error } = await supabase
  .from('profiles')
  .select('ronin_address, created_at, pvp_data')
  .order('created_at', { ascending: false });

console.log('Prisijungę vartotojai:', data);
```

## Praktiniai pavyzdžiai

### Kiek vartotojų prisijungė?
```sql
SELECT COUNT(*) as total_users FROM profiles;
```

### Paskutiniai 10 prisijungusių vartotojų:
```sql
SELECT ronin_address, created_at 
FROM profiles 
ORDER BY created_at DESC 
LIMIT 10;
```

### Vartotojai su aukščiausiu ELO:
```sql
SELECT 
  ronin_address,
  (pvp_data->>'elo')::int as elo,
  (pvp_data->>'wins')::int as wins
FROM profiles
ORDER BY (pvp_data->>'elo')::int DESC
LIMIT 10;
```

### Vartotojai, kurie žaidė šiandien:
```sql
SELECT DISTINCT 
  p1 as ronin_address
FROM matches
WHERE created_at >= CURRENT_DATE
UNION
SELECT DISTINCT 
  p2 as ronin_address
FROM matches
WHERE created_at >= CURRENT_DATE;
```

## Pastabos

- **`profiles` lentelė** yra pagrindinė vieta, kur saugomi visi prisijungę vartotojai
- **`waiting_players` lentelė** gali būti tuščia, jei dabar niekas neieško priešininko
- **`matches` lentelė** rodo, kurie žaidėjai žaidė rungtynes
- Visi adresai yra Ronin piniginių adresai (pradedant `0x`)

## Saugumas

Jei naudojate RLS (Row Level Security), gali reikėti:
- Prisijungti kaip admin
- Arba laikinai išjungti RLS testavimui:
  ```sql
  ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
  ```

**SVARBU:** Po testavimo vėl įjunkite RLS:
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
```

