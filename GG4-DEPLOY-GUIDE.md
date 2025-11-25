# GG4 Deployment Guide

## Overview
GG4.zip yra naujausia žaidimo versija su:
- ✅ Ronin Wallet integracija
- ✅ DOT token balance rodymas
- ✅ Training mode (PvP su botu)
- ✅ PvP Online mode (su tikrais žaidėjais)
- ✅ Supabase integracija
- ✅ **Responsive design** - veikia visuose ekranuose
- ✅ **Fixed mouse coordinates** - mygtukai veikia teisingai

## Quick Deploy

### 1. Sukurkite GG4.zip
```bash
npm run build:gg4
```
arba
```bash
npm run deploy:gg4
```

### 2. Netlify Deployment

#### A. Manual Deployment
1. Eikite į: https://app.netlify.com
2. Pasirinkite savo projektą arba sukurkite naują
3. Spustelėkite **"Deploy manually"**
4. Įkelkite **GG4.zip** failą
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

## What's New in GG4

### 🎯 Responsive Design
- Canvas dabar tinkamai skaliruojasi visuose ekranuose
- UI panelės visada matomos, net mažuose ekranuose
- Pridėti media queries skirtingiems ekranų dydžiams

### 🖱️ Fixed Mouse Coordinates
- Pridėta `getCanvasMousePos()` funkcija
- Visi mouse event handler'iai dabar teisingai konvertuoja koordinates
- Mygtukai veikia teisingai net kai canvas yra skaliruojamas

### 📱 Mobile Support
- Pridėtas responsive CSS
- Canvas naudoja `object-fit: contain` ir `max-width/max-height`
- Mažesniems ekranams (< 800px) pritaikytas scaling

## Troubleshooting

### UI panelės nematomos
- Patikrinkite, ar naudojate GG4.zip (ne senesnę versiją)
- Patikrinkite naršyklės konsolę (F12) dėl klaidų
- Bandykite perkrauti puslapį (Ctrl+R)

### Mygtukai neveikia
- Patikrinkite, ar canvas yra tinkamo dydžio
- Patikrinkite naršyklės konsolę dėl JavaScript klaidų
- Bandykite kitą naršyklę

### PvP Online neveikia
- Patikrinkite, ar Netlify environment variables yra nustatyti
- Patikrinkite, ar Supabase lentelės yra sukurtos
- Atidarykite naršyklės konsolę (F12) ir patikrinkite klaidas

### Build nepavyksta
- Įsitikinkite, kad visi failai yra projekte
- Patikrinkite, ar Python yra įdiegtas (reikalingas ZIP kūrimui)
- Patikrinkite PowerShell execution policy

## File Structure

GG4.zip turi:
- `src/` - visi source failai
- `package.json` - dependencies
- `tsconfig.json` - TypeScript config
- `vite.config.ts` - Vite config
- `netlify.toml` - Netlify config
- `index.html` - HTML entry point su responsive CSS
- `.env` - Supabase kredencialai (jei yra)

## Technical Details

### Responsive CSS Changes
- `#gameContainer` - pridėtas `max-width: 100vw` ir `max-height: 100vh`
- `#gameCanvas` - pridėtas `object-fit: contain` ir `max-width/max-height`
- Media queries mažesniems ekranams

### Mouse Coordinate Fix
- `getCanvasMousePos()` funkcija konvertuoja mouse koordinates
- Naudoja `canvas.width / rect.width` ir `canvas.height / rect.height` scaling
- Visi mouse event handler'iai naudoja šią funkciją

## Next Steps

Po sėkmingo deploy:
1. Atidarykite savo Netlify svetainę
2. Patikrinkite, ar UI panelės matomos skirtinguose ekranuose
3. Išbandykite mygtukus
4. Prisijunkite su Ronin Wallet
5. Išbandykite Training mode
6. Išbandykite PvP Online (reikia kito žaidėjo)

## Notes

- `.env` failas yra įtrauktas į GG4.zip, bet Netlify naudoja environment variables
- Jei keičiate Supabase kredencialus, atnaujinkite Netlify environment variables
- Redeploy svetainę po environment variables pakeitimų
- Responsive design veikia automatiškai - nereikia jokių papildomų nustatymų

