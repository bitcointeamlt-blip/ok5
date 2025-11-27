# Deployment Checklist - Colyseus Integration

## ✅ Kas Padaryta

- [x] Colyseus server sukurtas ir kompiliuojasi
- [x] ColyseusService sukurtas frontend'e
- [x] Integruota į simple-main.ts
- [x] Fallback į Supabase (jei Colyseus nepasiekiamas)
- [x] Dependencies įdiegti

## 🚀 Deployment Steps

### Step 1: GitHub Push

```bash
git add .
git commit -m "Add Colyseus server for PvP multiplayer"
git push origin main
```

**SVARBU**: Patikrinkite, kad `colyseus-server/` folderis yra GitHub'e!

### Step 2: Colyseus Cloud Deployment

1. Eikite į: https://cloud.colyseus.io
2. Prisijunkite
3. Pasirinkite "dot game" aplikaciją
4. Spustelėkite **"LINK WITH GITHUB"**
5. Pasirinkite savo repository
6. Nustatykite build settings:

   **Build Command**:
   ```
   cd colyseus-server && npm install && npm run build
   ```

   **Start Command**:
   ```
   cd colyseus-server && npm start
   ```

   **Root Directory**:
   ```
   colyseus-server
   ```

   **Node Version**: `22` (arba `20`)

7. Spustelėkite **"Deploy"**

### Step 3: Gaukite Endpoint

Po deployment, gausite endpoint (pvz: `https://de-fra-xxxxx.colyseus.cloud`)

### Step 4: Update Frontend Environment

**Netlify**:
1. Site settings → Environment variables
2. Pridėkite: `VITE_COLYSEUS_ENDPOINT` = jūsų endpoint
3. Redeploy

**Cloudflare Pages**:
1. Settings → Environment variables
2. Pridėkite: `VITE_COLYSEUS_ENDPOINT` = jūsų endpoint
3. Redeploy

**Lokaliai**:
Sukurkite `.env` failą:
```
VITE_COLYSEUS_ENDPOINT=https://de-fra-xxxxx.colyseus.cloud
```

### Step 5: Testuokite

1. Atidarykite žaidimą
2. Prisijunkite su Ronin Wallet
3. Pasirinkite "PvP Online"
4. Turėtumėte prisijungti prie Colyseus room

## 🔍 Troubleshooting

### Server neveikia Colyseus Cloud'e
- Patikrinkite logs Colyseus Cloud dashboard
- Patikrinkite build command
- Patikrinkite Node version

### Frontend negali prisijungti
- Patikrinkite `VITE_COLYSEUS_ENDPOINT` environment variable
- Patikrinkite, ar endpoint formatas teisingas
- Patikrinkite browser console errors

### Matchmaking neveikia
- Colyseus automatiškai match'ina žaidėjus
- Jei neveikia, patikrinkite server logs

## 📝 Notes

- Supabase vis dar reikalingas duomenų bazei (profiles, stats)
- Colyseus pakeičia tik PvP multiplayer (Realtime)
- Solo mode veikia be Colyseus

