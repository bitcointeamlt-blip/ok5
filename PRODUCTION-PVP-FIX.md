# 🔧 Production PvP Fix - Netlify + Colyseus Cloud

## ❌ Problema:

- ✅ Lokalus PvP veikia (portas 7005)
- ❌ Production (Netlify) neveikia

## 🔍 Patikrinimas:

### 1. Netlify Environment Variables

**SVARBU:** Netlify turi turėti `VITE_COLYSEUS_ENDPOINT` environment variable!

**Kaip patikrinti:**
1. Eikite į Netlify Dashboard
2. Pasirinkite jūsų site: `jocular-zabaione-835b49`
3. Eikite į **Site settings** → **Environment variables**
4. Patikrinkite ar yra:
   - **Key:** `VITE_COLYSEUS_ENDPOINT`
   - **Value:** `https://de-fra-f8820c12.colyseus.cloud`

**Jei NĖRA:**
1. Spauskite **"Add variable"**
2. **Key:** `VITE_COLYSEUS_ENDPOINT`
3. **Value:** `https://de-fra-f8820c12.colyseus.cloud`
4. **Scopes:** Production, Preview, Deploy Previews (visi)
5. Spauskite **"Save"**

### 2. Colyseus Cloud CORS

**SVARBU:** Colyseus Cloud serveris turi turėti teisingą CORS konfigūraciją!

**Patikrinkite:**
- Ar Colyseus Cloud deployment'as turi naują build su CORS fix'u?
- Ar reikia redeploy'inti Colyseus Cloud?

**Kaip redeploy'inti Colyseus Cloud:**
1. Eikite į Colyseus Cloud Dashboard
2. Pasirinkite jūsų deployment
3. Spauskite **"Redeploy"** arba **"Deploy"**
4. Patikrinkite ar build folder'is yra commit'intas į git

### 3. Netlify Build

**SVARBU:** Netlify turi rebuild'inti su nauju environment variable!

**Po pridėjimo `VITE_COLYSEUS_ENDPOINT`:**
1. Eikite į Netlify Dashboard
2. Pasirinkite jūsų site
3. Eikite į **Deploys**
4. Spauskite **"Trigger deploy"** → **"Deploy site"**
5. Palaukite kol build baigsis

## 🔍 Debug Production:

### 1. Patikrinkite Browser Console:

Atidarykite `https://jocular-zabaione-835b49.netlify.app` ir patikrinkite console (F12):

**Turėtumėte matyti:**
```
🔍 Colyseus Service Environment: {
  hasEnv: true,
  endpoint: 'wss://de-fra-f8820c12.colyseus.cloud...',
  isProduction: true,
  hostname: 'jocular-zabaione-835b49.netlify.app'
}
```

**Jei matote:**
- `hasEnv: false` → Netlify neturi `VITE_COLYSEUS_ENDPOINT`
- `endpoint: 'not set'` → Netlify neturi `VITE_COLYSEUS_ENDPOINT`
- `❌ VITE_COLYSEUS_ENDPOINT not set` → Netlify neturi env variable

### 2. Patikrinkite Network Tab:

1. Atidarykite Developer Tools (F12)
2. Eikite į **Network** tab
3. Spauskite "PvP ONLINE"
4. Patikrinkite ar yra WebSocket connection:

**Turėtumėte matyti:**
- Type: `websocket`
- Status: `101 Switching Protocols`
- URL: `wss://de-fra-f8820c12.colyseus.cloud/matchmake/joinOrCreate/pvp_room`

**Jei matote CORS error:**
- Colyseus Cloud serveris neturi teisingų CORS header'ių
- Reikia redeploy'inti Colyseus Cloud su nauju build'u

### 3. Patikrinkite Colyseus Cloud Health:

```bash
curl https://de-fra-f8820c12.colyseus.cloud/health
```

Turėtumėte matyti: `{"status":"ok"}`

## ✅ Sprendimas:

### Step 1: Pridėkite Netlify Environment Variable

1. Netlify Dashboard → Site settings → Environment variables
2. Add variable:
   - **Key:** `VITE_COLYSEUS_ENDPOINT`
   - **Value:** `https://de-fra-f8820c12.colyseus.cloud`
   - **Scopes:** All (Production, Preview, Deploy Previews)

### Step 2: Redeploy Netlify

1. Netlify Dashboard → Deploys
2. Trigger deploy → Deploy site
3. Palaukite kol build baigsis

### Step 3: Redeploy Colyseus Cloud (jei reikia)

1. Colyseus Cloud Dashboard
2. Pasirinkite deployment
3. Redeploy
4. Patikrinkite ar build folder'is commit'intas

### Step 4: Patikrinkite

1. Atidarykite `https://jocular-zabaione-835b49.netlify.app`
2. Patikrinkite console - turėtumėte matyti teisingą endpoint'ą
3. Spauskite "PvP ONLINE"
4. Patikrinkite ar connection veikia

## 🐛 Jei vis dar neveikia:

### 1. Patikrinkite ar env variable teisingas:

Netlify turi turėti:
- **Key:** `VITE_COLYSEUS_ENDPOINT` (tiksliai taip, be tarpų!)
- **Value:** `https://de-fra-f8820c12.colyseus.cloud` (tiksliai taip!)

### 2. Patikrinkite ar build turi env variable:

Po rebuild, patikrinkite browser console:
- Turėtumėte matyti: `hasEnv: true`
- Turėtumėte matyti: `endpoint: 'wss://de-fra-f8820c12.colyseus.cloud...'`

### 3. Patikrinkite CORS:

Jei matote CORS error:
- Colyseus Cloud turi būti redeploy'intas su nauju build'u
- Build turi turėti teisingą CORS konfigūraciją (`build/index.js`)

### 4. Patikrinkite Colyseus Cloud logs:

Colyseus Cloud Dashboard → Logs:
- Turėtumėte matyti: `[CORS] Matchmaking request from origin: https://jocular-zabaione-835b49.netlify.app`
- Turėtumėte matyti: `GameRoom created: [room-id]`










