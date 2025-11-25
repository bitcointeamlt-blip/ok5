# GG8 Deployment Guide

## Overview
GG8.zip yra naujausia žaidimo versija su **visais PvP pataisymais**:
- ✅ **Strėlių sync** - opponent mato jūsų strėles ir gauna damage
- ✅ **Piešimo sync** - opponent mato jūsų piešimą (atsokimo platforma)
- ✅ **Piešimas kaip platforma** - ne damage, tik atsokimo platforma (5 sec, 2 bounces)
- ✅ **HP/Armor stats label** - "YOU XXXX STATS" etiketė
- ✅ **Fiksuotos žaidėjų pozicijos** - P1 kairėje, P2 dešinėje
- ✅ **Fiksuotos spalvos** - mėlynas jūsų, raudonas oponentas
- ✅ Ronin Wallet integracija
- ✅ DOT token balance rodymas
- ✅ Training mode (PvP su botu)
- ✅ PvP Online mode (su tikrais žaidėjais)
- ✅ Supabase integracija
- ✅ **Automatic matchmaking** - automatiškai sujungia žaidėjus
- ✅ **Real-time position sync** - sklandus PvP žaidimas
- ✅ **Wallet address display** - paskutiniai 4 simboliai prie žaidėjų
- ✅ Responsive design - veikia visuose ekranuose

## Quick Deploy

### 1. Sukurkite GG8.zip
```bash
npm run build:gg8
```
arba
```bash
npm run deploy:gg8
```

### 2. Netlify Deployment

#### A. Manual Deployment
1. Eikite į: https://app.netlify.com
2. Pasirinkite savo projektą arba sukurkite naują
3. Spustelėkite **"Deploy manually"**
4. **SVARBU:** Spustelėkite **"Clear cache and deploy site"** (ne tik "Deploy manually")
5. Įkelkite **GG8.zip** failą
6. Palaukite, kol deploy baigsis

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

## What's New in GG8

### 🏹 Arrow Sync (KRITINIS PATAISYMAS)
- **Strėlės siunčiamos oponentui** - kai paleidžiate strėlę, opponent ją mato
- **Opponent arrow renderinamas** - opponent strėlės matomos jums
- **Damage pritaikomas** - kai strėlė pataiko, damage pritaikomas oponentui
- **Real-time sync** - strėlės pozicija sinchronizuojama per network

### 🎯 Projectile Sync (KRITINIS PATAISYMAS)
- **Piešimas siunčiamas oponentui** - kai paleidžiate piešimą, opponent jį mato
- **Opponent projectile renderinamas** - opponent piešimas matomas jums (oranžinė spalva)
- **Piešimas kaip platforma** - piešimas veikia kaip atsokimo platforma (ne damage!)
- **5 sekundžių lifetime** - piešimas išnyksta po 5 sekundžių
- **2 bounces limit** - galima atsokti du kartus, tada piešimas išnyksta
- **Real-time sync** - piešimo pozicija sinchronizuojama per network

### 🏷️ HP/Armor Stats Label
- **"YOU XXXX STATS"** etiketė virš HP/Armor rėmelio
- Rėmelis aiškiai pažymėtas kaip jūsų statistikos
- HP/Armor atnaujinimai veikia teisingai

### 🎯 Fixed Player Positions
- **Player 1 (p1)** visada kairėje pusėje (25% nuo kairės)
- **Player 2 (p2)** visada dešinėje pusėje (75% nuo kairės)
- Abi pusės mato save teisingoje pozicijoje pagal savo player ID

### 🎨 Fixed Player Colors
- **Mano žaidėjas** visada mėlynas (#0000ff)
- **Opponent** visada raudonas (#ff0000)
- Spalva nustatoma render metu pagal playerId

### 🔄 Real-time Position Sync
- **100ms interval** - pozicijos sinchronizuojamos kas 100ms (10 kartų per sekundę)
- Kiekvienas žaidėjas mato oponento poziciją real-time
- Sklandus PvP žaidimas be vėlavimų

### 🔄 Automatic Matchmaking
- Database trigger automatiškai sukuria match kai du žaidėjai yra lobby
- Nereikia rankiniu būdu sujungti žaidėjų
- Veikia real-time - match sukuriamas per kelias sekundes

### 📱 Responsive Design
- Canvas tinkamai skaliruojasi visuose ekranuose
- UI panelės visada matomos, net mažuose ekranuose
- Pridėti media queries skirtingiems ekranų dydžiams

## How PvP Works Now

### Arrow System
1. **Paleidžiate strėlę:**
   - Spustelėkite "1" klavišą, tada kairįjį pelės mygtuką
   - Strėlė siunčiama oponentui per network
   - Opponent mato jūsų strėlę skrydžio metu

2. **Opponent paleidžia strėlę:**
   - Jūs matote opponent strėlę skrydžio metu
   - Kai strėlė pataiko į jūsų žaidėją, damage pritaikomas
   - Strėlė daro 3x damage

### Projectile System (Bouncing Platform)
1. **Paleidžiate piešimą:**
   - Laikykite "2" klavišą, tada atleiskite
   - Piešimas siunčiamas oponentui per network
   - Opponent mato jūsų piešimą (oranžinė spalva)

2. **Piešimas kaip platforma:**
   - Piešimas veikia kaip atsokimo platforma (ne damage!)
   - Galima atsokti ant piešimo (kaip ant platformos)
   - Galima atsokti du kartus, tada piešimas išnyksta
   - Piešimas išnyksta po 5 sekundžių arba po 2 atsokimų

3. **Opponent paleidžia piešimą:**
   - Jūs matote opponent piešimą (oranžinė spalva)
   - Galite atsokti ant opponent piešimo
   - Opponent piešimas veikia taip pat (5 sec, 2 bounces)

### Player Identification
1. **Player ID nustatymas:**
   - Nustatomas pagal wallet address ir match duomenis
   - Jei wallet address sutampa su `match.p1`, esate **Player 1**
   - Jei wallet address sutampa su `match.p2`, esate **Player 2**

2. **Pozicijų logika:**
   - **Player 1 (p1):** Visada kairėje pusėje (25% nuo kairės)
   - **Player 2 (p2):** Visada dešinėje pusėje (75% nuo kairės)
   - Abi pusės mato save teisingoje pozicijoje

3. **Spalvų logika:**
   - **Mano žaidėjas:** Visada mėlynas (#0000ff)
   - **Opponent:** Visada raudonas (#ff0000)
   - Spalva nustatoma render metu pagal playerId

## Troubleshooting

### Strėlės nemato oponentas
- Patikrinkite, ar strėlės siunčiamos per network (patikrinkite console.log)
- Patikrinkite, ar Supabase realtime subscription veikia
- Patikrinkite, ar `pvpSyncService.isSyncing()` grąžina `true`
- Patikrinkite naršyklės konsolę (F12) dėl klaidų

### Piešimas nedaro damage (tai normalu!)
- **Piešimas neturėtų daryti damage** - jis yra tik atsokimo platforma
- Piešimas veikia kaip platforma - galima atsokti ant jo
- Piešimas išnyksta po 5 sekundžių arba po 2 atsokimų

### Piešimas nesimato oponentui
- Patikrinkite, ar piešimas siunčiamas per network (patikrinkite console.log)
- Patikrinkite, ar Supabase realtime subscription veikia
- Patikrinkite, ar `opponentProjectileFlying` yra `true`
- Patikrinkite naršyklės konsolę (F12) dėl klaidų

### HP/Armor nesiderina
- Patikrinkite, ar naudojate GG8.zip (ne senesnę versiją)
- Patikrinkite, ar "YOU XXXX STATS" etiketė rodoma
- Patikrinkite naršyklės konsolę (F12) dėl klaidų

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

## File Structure

GG8.zip turi:
- `src/` - visi source failai
- `package.json` - dependencies (version 1.0.8)
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
2. **Išvalykite Netlify cache** prieš deploy (svarbu!)
3. Atidarykite savo Netlify svetainę
4. Patikrinkite, ar UI panelės matomos skirtinguose ekranuose
5. Išbandykite mygtukus
6. Prisijunkite su Ronin Wallet
7. Išbandykite Training mode
8. Išbandykite PvP Online (reikia kito žaidėjo)
9. **Išbandykite strėles** - patikrinkite, ar opponent mato jūsų strėles
10. **Išbandykite piešimą** - patikrinkite, ar opponent mato jūsų piešimą ir galite atsokti ant jo

## Notes

- **SVARBU:** Matchmaking funkcija turi būti sukurta Supabase, kitaip žaidėjai nebus sujungiami
- **SVARBU:** Išvalykite Netlify cache prieš deploy, kitaip gali būti naudojamas senas build
- **SVARBU:** Piešimas nebedaro damage - jis yra tik atsokimo platforma
- `.env` failas yra įtrauktas į GG8.zip, bet Netlify naudoja environment variables
- Jei keičiate Supabase kredencialus, atnaujinkite Netlify environment variables
- Redeploy svetainę po environment variables pakeitimų
- Responsive design veikia automatiškai - nereikia jokių papildomų nustatymų
- Real-time position sync veikia automatiškai - nereikia jokių papildomų nustatymų

## Critical Fixes in GG8

GG8 išsprendžia šias problemas:
1. ✅ Strėlės nemato oponentas → Dabar opponent mato jūsų strėles ir gauna damage
2. ✅ Piešimas nedaro damage → Dabar piešimas veikia kaip atsokimo platforma (ne damage)
3. ✅ Piešimas nesimato oponentui → Dabar opponent mato jūsų piešimą
4. ✅ HP/Armor nesiderina → Dabar HP/Armor rodikliai teisingai atnaujinami su "YOU XXXX STATS" etikete

