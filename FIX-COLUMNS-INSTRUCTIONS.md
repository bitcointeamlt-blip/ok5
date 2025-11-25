# Kaip paleisti supabase-FIX-COLUMNS.sql

## Žingsniai:

1. **Atidarykite failą `supabase-FIX-COLUMNS.sql`** savo projekte (kompiuteryje)

2. **Nukopijuokite VISĄ turinį**:
   - Ctrl+A (pasirinkti viską)
   - Ctrl+C (nukopijuoti)

3. **Eikite į Supabase Dashboard** → **SQL Editor**

4. **Raskite pagrindinį SQL užklausų langą** (didelis baltas langas, kur rašote SQL)

5. **Ištrinkite viską, kas ten yra** (jei yra)

6. **Įklijuokite nukopijuotą kodą**:
   - Ctrl+V (įklijuoti)

7. **Paleiskite užklausą**:
   - Spauskite mygtuką **"Run"** arba **Ctrl+Enter**

## SVARBU:

- ❌ **NEREIKIA** kurti naujos skilties
- ❌ **NEREIKIA** įklijuoti į vieną iš esamų failų (pvz., "PvP Matchmaking Setup")
- ✅ **TIESIOG** įklijuokite kodą į pagrindinį SQL užklausų langą ir paleiskite

## Po paleidimo:

Turėtumėte matyti pranešimus:
- `Added p1Ready column` arba `p1Ready column already exists`
- `Added p2Ready column` arba `p2Ready column already exists`
- `Updated state constraint to include ready`

Ir lentelę su stulpelių informacija.

## Patikrinimas:

Po to eikite į **Table Editor** → **matches** ir patikrinkite, ar matote stulpelius:
- `p1Ready` (BOOLEAN)
- `p2Ready` (BOOLEAN)

Jei matote - viskas gerai! ✅

