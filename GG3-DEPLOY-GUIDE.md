# GG3 Deployment Guide

## Overview
GG3.zip yra naujausia žaidimo versija su:
- ✅ Ronin Wallet integracija
- ✅ DOT token balance rodymas
- ✅ Training mode (PvP su botu)
- ✅ PvP Online mode (su tikrais žaidėjais)
- ✅ Supabase integracija

## Quick Deploy

### 1. Sukurkite GG3.zip
```bash
npm run build:gg3
```
arba
```bash
npm run deploy:gg3
```

### 2. Netlify Deployment

#### A. Manual Deployment
1. Eikite į: https://app.netlify.com
2. Pasirinkite savo projektą arba sukurkite naują
3. Spustelėkite **"Deploy manually"**
4. Įkelkite **GG3.zip** failą
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

Prieš naudojant PvP Online, įsitikinkite, kad Supabase duomenų bazėje yra sukurtos lentelės:

1. Eikite į Supabase dashboard: https://app.supabase.com
2. Pasirinkite projektą "ok1"
3. Eikite į **SQL Editor**
4. Vykdykite SQL kodą iš `supabase-setup.sql` failo

Reikalingos lentelės:
- `profiles` - vartotojų profiliai
- `waiting_players` - lobby žaidėjai
- `matches` - žaidimų rungtynės
- `pvp_inputs` - žaidėjų įvestys

## Troubleshooting

### PvP Online neveikia
- Patikrinkite, ar Netlify environment variables yra nustatyti
- Patikrinkite, ar Supabase lentelės yra sukurtos
- Atidarykite naršyklės konsolę (F12) ir patikrinkite klaidas

### Build nepavyksta
- Įsitikinkite, kad visi failai yra projekte
- Patikrinkite, ar Python yra įdiegtas (reikalingas ZIP kūrimui)
- Patikrinkite PowerShell execution policy

## What's New in GG3

- ✅ Supabase integracija
- ✅ PvP Online matchmaking
- ✅ Training mode (PvP su botu)
- ✅ DOT token balance display
- ✅ Improved error handling

## File Structure

GG3.zip turi:
- `src/` - visi source failai
- `package.json` - dependencies
- `tsconfig.json` - TypeScript config
- `vite.config.ts` - Vite config
- `netlify.toml` - Netlify config
- `index.html` - HTML entry point
- `.env` - Supabase kredencialai (jei yra)

## Next Steps

Po sėkmingo deploy:
1. Atidarykite savo Netlify svetainę
2. Prisijunkite su Ronin Wallet
3. Išbandykite Training mode
4. Išbandykite PvP Online (reikia kito žaidėjo)

## Notes

- `.env` failas yra įtrauktas į GG3.zip, bet Netlify naudoja environment variables
- Jei keičiate Supabase kredencialus, atnaujinkite Netlify environment variables
- Redeploy svetainę po environment variables pakeitimų

