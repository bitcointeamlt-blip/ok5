# GG7 Deployment Guide

## Overview
GG7.zip yra naujausia žaidimo versija su **kritiniais PvP pataisymais**:
- ✅ **Fiksuotos žaidėjų pozicijos** - P1 kairėje, P2 dešinėje (vienodai abiems pusėms)
- ✅ **Fiksuotos spalvos** - mėlynas jūsų, raudonas oponentas (visada teisingai)
- ✅ **Valdymo patikrinimas** - tik jūsų žaidėjas yra valdomas
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

### 1. Sukurkite GG7.zip
```bash
npm run build:gg7
```
arba
```bash
npm run deploy:gg7
```

### 2. Netlify Deployment

#### A. Manual Deployment
1. Eikite į: https://app.netlify.com
2. Pasirinkite savo projektą arba sukurkite naują
3. Spustelėkite **"Deploy manually"**
4. **SVARBU:** Spustelėkite **"Clear cache and deploy site"** (ne tik "Deploy manually")
5. Įkelkite **GG7.zip** failą
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

## What's New in GG7

### 🎯 Fixed Player Positions (KRITINIS PATAISYMAS)
- **Player 1 (p1)** visada kairėje pusėje (25% nuo kairės)
- **Player 2 (p2)** visada dešinėje pusėje (75% nuo kairės)
- Abi pusės mato save teisingoje pozicijoje pagal savo player ID
- **Problema išspręsta:** Anksčiau abi pusės matė save kairėje pusėje

### 🎨 Fixed Player Colors (KRITINIS PATAISYMAS)
- **Mano žaidėjas** visada mėlynas (#0000ff)
- **Opponent** visada raudonas (#ff0000)
- Spalva nustatoma render metu pagal playerId
- **Problema išspręsta:** Anksčiau abi pusės matė save kaip mėlyną tašką

### 🎮 Player Control Validation (KRITINIS PATAISYMAS)
- Tik savo žaidėjas yra valdomas
- Pridėtas patikrinimas, kad negalima valdyti oponento
- **Problema išspręsta:** Anksčiau abi pusės valdė tą patį mėlyną tašką

### 🏷️ Wallet Address Display
- **"YOU XXXX"** - jūsų piniginės adreso paskutiniai 4 simboliai
- **"OPPONENT XXXX"** - oponento piniginės adreso paskutiniai 4 simboliai
- Lengviau identifikuoti žaidėjus

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

### Game Flow
1. **Žaidėjas prisijungia:**
   - Spustelėkite "PvP Online" mygtuką
   - Žaidėjas įtraukiamas į `waiting_players` lentelę

2. **Automatinis matchmaking:**
   - Database trigger automatiškai patikrina, ar yra kitas žaidėjas
   - Jei yra, sukuriamas match ir abu žaidėjai pašalinami iš `waiting_players`
   - Abi pusės gauna pranešimą per realtime subscription

3. **Real-time sync:**
   - Kiekvienas žaidėjas siunčia savo poziciją kas 100ms
   - Opponent pozicija atnaujinama real-time
   - Abi pusės mato vienas kitą sklandžiai

4. **Žaidimas prasideda:**
   - Match sukuriamas su `state = 'active'`
   - Abu žaidėjai mato vienas kitą (mėlynas jūsų, raudonas oponentas)
   - Wallet adresai rodomi prie žaidėjų etikečių
   - Tik savo žaidėjas yra valdomas

## Troubleshooting

### Abi pusės mato tą patį mėlyną tašką
- **Patikrinkite, ar naudojate GG7.zip** (ne senesnę versiją)
- **Išvalykite Netlify cache** prieš deploy
- Patikrinkite naršyklės konsolę (F12) dėl klaidų
- Patikrinkite, ar `myPlayerId` ir `opponentId` yra teisingai nustatyti

### Opponent nejuda
- Patikrinkite, ar real-time sync veikia (patikrinkite console.log)
- Patikrinkite, ar Supabase realtime subscription veikia
- Patikrinkite, ar `pvpSyncService.isSyncing()` grąžina `true`
- Patikrinkite, ar opponent pozicija yra siunčiama per network

### Abi pusės valdo tą patį žaidėją
- **Patikrinkite, ar naudojate GG7.zip** (ne senesnę versiją)
- Patikrinkite, ar `myPlayerId` yra teisingai nustatytas
- Patikrinkite naršyklės konsolę dėl "Attempted to control wrong player!" pranešimų

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

## File Structure

GG7.zip turi:
- `src/` - visi source failai
- `package.json` - dependencies (version 1.0.7)
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

## Notes

- **SVARBU:** Matchmaking funkcija turi būti sukurta Supabase, kitaip žaidėjai nebus sujungiami
- **SVARBU:** Išvalykite Netlify cache prieš deploy, kitaip gali būti naudojamas senas build
- `.env` failas yra įtrauktas į GG7.zip, bet Netlify naudoja environment variables
- Jei keičiate Supabase kredencialus, atnaujinkite Netlify environment variables
- Redeploy svetainę po environment variables pakeitimų
- Responsive design veikia automatiškai - nereikia jokių papildomų nustatymų
- Real-time position sync veikia automatiškai - nereikia jokių papildomų nustatymų

## Critical Fixes in GG7

GG7 išsprendžia šias problemas:
1. ✅ Abi pusės matė tą patį mėlyną tašką → Dabar kiekvienas mato save kaip mėlyną, oponentą kaip raudoną
2. ✅ Abi pusės valdė tą patį žaidėją → Dabar tik savo žaidėjas yra valdomas
3. ✅ Abi pusės matė save kairėje pusėje → Dabar P1 kairėje, P2 dešinėje (vienodai abiems pusėms)
4. ✅ Opponent nejudėjo → Dabar opponent pozicija sinchronizuojama real-time

