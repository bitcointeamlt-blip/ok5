# FIX: Ready Button Not Working

## Problem
Console rodo klaidą: `"Could not find the 'p1Ready' column of 'matches' in the schema cache"`

Tai reiškia, kad Supabase `matches` lentelėje nėra `p1Ready` ir `p2Ready` stulpelių.

## Solution

### Step 1: Add Missing Columns to Supabase

1. Eikite į **Supabase Dashboard** → **SQL Editor**
2. Atidarykite failą **`supabase-FIX-COLUMNS.sql`** projekte
3. Nukopijuokite visą turinį (Ctrl+A, Ctrl+C)
4. Įklijuokite į Supabase SQL Editor
5. Paleiskite (Run)

Šis SQL:
- Pridės `p1Ready` stulpelį, jei jo nėra
- Pridės `p2Ready` stulpelį, jei jo nėra
- Atnaujins `state` constraint, kad apimtų `'ready'`
- Patikrins, ar stulpeliai egzistuoja
- Atnaujins esamus match'us su default reikšmėmis

### Step 2: Verify Columns Exist

Po SQL paleidimo, patikrinkite:

1. Eikite į **Supabase Dashboard** → **Table Editor** → **matches**
2. Patikrinkite, ar matote stulpelius:
   - `p1Ready` (BOOLEAN)
   - `p2Ready` (BOOLEAN)

Arba paleiskite šią SQL užklausą:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'matches' 
  AND column_name IN ('p1Ready', 'p2Ready');
```

Turėtumėte matyti abu stulpelius.

### Step 3: Restart Dev Server

1. Sustabdykite dev server (Ctrl+C)
2. Paleiskite dar kartą: `npm run dev`
3. Bandykite dar kartą su Ready mygtuku

## Expected Result

Po šių žingsnių:
- ✅ Ready mygtukas turėtų veikti
- ✅ Console neturėtų rodyti `"Could not find the 'p1Ready' column"` klaidos
- ✅ Paspaudus Ready, turėtumėte matyti: `"✅ Player ready set successfully!"`
- ✅ Abi pusės turėtų matyti viena kitos Ready statusą

## If Still Not Working

Jei vis dar neveikia, patikrinkite:

1. **Console klaidas** - ar yra kitų klaidų?
2. **Supabase RLS policies** - ar `matches` lentelė turi teisingas policies?
3. **Matchmaking funkcija** - ar ji naudoja `p1Ready` ir `p2Ready`?

Paleiskite `supabase-COMPLETE-SETUP.sql` dar kartą, jei reikia.

