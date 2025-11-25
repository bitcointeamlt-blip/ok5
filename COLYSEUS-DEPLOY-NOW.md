# 🚀 Colyseus Cloud Deployment - Dabar

## ✅ Kas Jau Padaryta

- ✅ GitHub aplikacija "Colyseus Cloud Deploy" įdiegta
- ✅ Repository access nustatytas
- ✅ Colyseus server paruoštas

## 📋 Kitas Žingsnis - Colyseus Cloud Setup

### Step 1: Eikite į Colyseus Cloud Dashboard

1. Eikite: https://cloud.colyseus.io
2. Prisijunkite prie savo account'o
3. Pasirinkite "dot game" aplikaciją

### Step 2: Link su GitHub Repository

1. Colyseus Cloud dashboard → "LINK WITH GITHUB" (or "Connect Repository")
2. Pasirinkite savo repository (turi būti matomas dėl GitHub aplikacijos)
3. Patvirtinkite

### Step 3: Nustatykite Build Settings

Colyseus Cloud → Settings → Build Configuration:

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

**Port**: Palikite tuščią (Colyseus Cloud nustato automatiškai)

### Step 4: Deploy

1. Spustelėkite **"Deploy"** arba **"Redeploy"**
2. Palaukite, kol deployment baigsis (gali užtrukti 2-5 min)
3. Patikrinkite **Logs** sekciją, jei yra klaidų

### Step 5: Gaukite Endpoint

Po sėkmingo deployment:
- Gausite naują endpoint (pvz: `https://de-fra-xxxxx.colyseus.cloud`)
- Kopijuokite šį endpoint

### Step 6: Update Frontend Environment

**Netlify**:
1. Netlify Dashboard → Site settings → Environment variables
2. Pridėkite/atnaujinkite:
   - Key: `VITE_COLYSEUS_ENDPOINT`
   - Value: jūsų naujas Colyseus endpoint
3. Redeploy site

**Cloudflare Pages**:
1. Cloudflare Dashboard → Pages → Settings → Environment variables
2. Pridėkite/atnaujinkite:
   - Key: `VITE_COLYSEUS_ENDPOINT`
   - Value: jūsų naujas Colyseus endpoint
3. Redeploy

### Step 7: Testuokite

1. Atidarykite deployed frontend
2. Prisijunkite su Ronin Wallet
3. Pasirinkite "PvP Online"
4. Turėtumėte prisijungti prie Colyseus room

## 🔍 Troubleshooting

### Deployment fails
- Patikrinkite **Logs** Colyseus Cloud dashboard
- Patikrinkite, ar build command teisingas
- Patikrinkite, ar `colyseus-server/` folderis yra repository root'e

### Cannot link repository
- Patikrinkite, ar GitHub aplikacija turi teises
- Patikrinkite, ar repository yra public arba turite access

### Server neveikia
- Patikrinkite logs
- Patikrinkite Node version (turėtų būti 20 arba 22)

