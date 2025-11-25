# 🚀 Netlify PvP Online - Pilnas Fix

## 🎯 Problema

- ❌ Colyseus Cloud serveris rodo "Service Unavailable"
- ❌ Netlify neturi `VITE_COLYSEUS_ENDPOINT` environment variable
- ❌ PvP Online neveikia ant Netlify

---

## ✅ Sprendimas - 2 Žingsniai

### Step 1: Deploy Colyseus Serveris į Colyseus Cloud

**SVARBU:** Colyseus Cloud serveris turi būti deploy'intas ir veikti!

#### 1.1. Patikrinkite Colyseus Cloud Status

1. **Eikite į:** https://cloud.colyseus.io
2. **Prisijunkite**
3. **Pasirinkite aplikaciją** (pvz: `ok05` arba `dot`)
4. **Patikrinkite:** Ar yra deployment'as?

**Jei NĖRA deployment'as:**

#### 1.2. Deploy Colyseus Serveris

**Option A: GitHub Auto-Deploy (Rekomenduojama)**

1. **Patikrinkite ar kodas yra GitHub:**
   - Repository: `ok05` (arba kitas)
   - Branch: `main` (arba `master`)

2. **Colyseus Cloud Dashboard:**
   - **Settings** → **GitHub Repository**
   - Pasirinkite `ok05` repository
   - Pasirinkite branch `main`
   - **Save**

3. **Deployments:**
   - Spustelėkite **"Deploy"** arba **"Redeploy"**
   - Palaukite 2-5 min

**Option B: Manual Deploy**

1. **Build serveris lokaliai:**
   ```powershell
   cd colyseus-server
   npm run build
   ```

2. **Zip build folder:**
   - Zip `colyseus-server/build` folder
   - Zip `colyseus-server/package.json`
   - Zip `colyseus-server/ecosystem.config.js`

3. **Colyseus Cloud Dashboard:**
   - **Deployments** → **Upload**
   - Upload zip file
   - Palaukite 2-5 min

#### 1.3. Patikrinkite Ar Serveris Veikia

**Atidarykite browser:**
```
https://de-fra-f8820c12.colyseus.cloud/health
```

**Turėtumėte matyti:**
```json
{"status":"ok","timestamp":"..."}
```

✅ **Jei matote `{"status":"ok"}`:** Serveris veikia!

❌ **Jei matote "Service Unavailable":** Serveris neveikia - reikia deploy'inti!

---

### Step 2: Pridėkite Environment Variable į Netlify

**SVARBU:** Netlify turi turėti `VITE_COLYSEUS_ENDPOINT` su teisingu endpoint!

#### 2.1. Eikite į Netlify Dashboard

1. **Atidarykite:** https://app.netlify.com
2. **Prisijunkite**
3. **Pasirinkite site:** `jocular-zabaione-835b49`

#### 2.2. Eikite į Environment Variables

1. **Kairėje meniu:** Spustelėkite **"Site settings"**
2. **Tada:** Spustelėkite **"Environment variables"**
3. **ARBA:** Spustelėkite **"Build & deploy"** → **"Environment"** → **"Environment variables"**

#### 2.3. Pridėkite `VITE_COLYSEUS_ENDPOINT`

1. **Spustelėkite:** **"Add a variable"** arba **"Add variable"**
2. **Key:** `VITE_COLYSEUS_ENDPOINT`
3. **Value:** `https://de-fra-f8820c12.colyseus.cloud`
4. **Scope:** Pasirinkite **"All scopes"** (arba **"Production"**)
5. **Spustelėkite:** **"Save"** arba **"Add variable"**

**SVARBU:**
- ✅ Key turi būti tiksliai `VITE_COLYSEUS_ENDPOINT` (be tarpų!)
- ✅ Value turi būti `https://de-fra-f8820c12.colyseus.cloud` (su `https://`!)
- ✅ Scope turi būti **"All scopes"** arba **"Production"**

#### 2.4. Redeploy Netlify

**SVARBU:** Po environment variable pridėjimo, reikia redeploy'inti site!

1. **Netlify Dashboard** → **"Deploys"** sekcija
2. **Spustelėkite:** **"Trigger deploy"** → **"Clear cache and deploy site"**
3. **Palaukite 2-5 min**, kol deploy baigsis

---

## 🔍 Patikrinimas

### 1. Colyseus Cloud Serveris

**Atidarykite browser:**
```
https://de-fra-f8820c12.colyseus.cloud/health
```

**Turėtumėte matyti:**
```json
{"status":"ok","timestamp":"..."}
```

✅ **Jei matote `{"status":"ok"}`:** Serveris veikia!

---

### 2. Netlify Browser Console

1. **Atidarykite:** `https://jocular-zabaione-835b49.netlify.app/`
2. **Atidarykite:** Browser Developer Tools (F12)
3. **Eikite į:** Console tab
4. **Spauskite:** "PvP ONLINE"

**Turėtumėte matyti:**
- ✅ `🔍 Environment check in enterLobby: {hasEnv: true, endpoint: 'wss://de-fra-f8820c12.colyseus.cloud...'}`
- ✅ `🔵 Using Colyseus Cloud endpoint`
- ✅ `✅ Colyseus client initialized`
- ✅ `Joined Colyseus room: [room-id]`

**NETURĖTŲ būti:**
- ❌ `ERR_CONNECTION_REFUSED`
- ❌ `CORS policy: No 'Access-Control-Allow-Origin' header`
- ❌ `VITE_COLYSEUS_ENDPOINT not set`
- ❌ `Service Unavailable`

---

## 🔧 Troubleshooting

### Problema: "Service Unavailable"

**Priežastis:** Colyseus Cloud serveris neveikia arba nebuvo deploy'intas.

**Sprendimas:**
1. Eikite į Colyseus Cloud Dashboard
2. Patikrinkite ar yra deployment'as
3. Jei nėra, deploy'inkite serverį (žr. Step 1.2)
4. Palaukite 2-5 min, kol serveris start'ina

---

### Problema: "VITE_COLYSEUS_ENDPOINT not set"

**Priežastis:** Netlify neturi environment variable.

**Sprendimas:**
1. Eikite į Netlify Dashboard → Site settings → Environment variables
2. Pridėkite `VITE_COLYSEUS_ENDPOINT` = `https://de-fra-f8820c12.colyseus.cloud`
3. Redeploy site

---

### Problema: "ERR_CONNECTION_REFUSED"

**Priežastis:** Colyseus Cloud serveris neveikia.

**Sprendimas:**
1. Patikrinkite: `https://de-fra-f8820c12.colyseus.cloud/health`
2. Jei neveikia, patikrinkite Colyseus Cloud Dashboard
3. Jei reikia, redeploy Colyseus serverį

---

### Problema: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Priežastis:** Colyseus serveris neturi CORS konfigūracijos.

**Sprendimas:**
- ✅ CORS jau konfigūruotas serveryje (`colyseus-server/src/index.ts`)
- Jei vis dar neveikia, patikrinkite ar Colyseus Cloud serveris naudoja naujausią kodą
- Redeploy Colyseus serverį su nauju kodu

---

## ✅ Checklist

- [ ] Colyseus Cloud serveris deploy'intas
- [ ] Colyseus Cloud serveris veikia (`/health` endpoint)
- [ ] Netlify turi `VITE_COLYSEUS_ENDPOINT` environment variable
- [ ] `VITE_COLYSEUS_ENDPOINT` = `https://de-fra-f8820c12.colyseus.cloud`
- [ ] Netlify site redeploy'intas po environment variable pridėjimo
- [ ] Browser console rodo `✅ Colyseus client initialized`
- [ ] Browser console rodo `Joined Colyseus room: [room-id]`
- [ ] Nėra `ERR_CONNECTION_REFUSED` error'ų
- [ ] Nėra CORS error'ų
- [ ] Nėra "Service Unavailable" error'ų

---

## 📋 Serverio Endpoint'ai

### Colyseus Cloud:
- **URL:** `https://de-fra-f8820c12.colyseus.cloud`
- **Health:** `https://de-fra-f8820c12.colyseus.cloud/health`
- **Matchmaking:** `https://de-fra-f8820c12.colyseus.cloud/matchmake/joinOrCreate/pvp_room`

### Netlify:
- **URL:** `https://jocular-zabaione-835b49.netlify.app`
- **Environment Variable:** `VITE_COLYSEUS_ENDPOINT` = `https://de-fra-f8820c12.colyseus.cloud`

---

## 🚀 Greitas Paleidimas

### 1. Deploy Colyseus Serveris:
- Colyseus Cloud Dashboard → Deployments → Deploy

### 2. Pridėkite Netlify Environment Variable:
- Netlify Dashboard → Site settings → Environment variables → Add `VITE_COLYSEUS_ENDPOINT`

### 3. Redeploy Netlify:
- Netlify Dashboard → Deploys → Trigger deploy → Clear cache and deploy site

### 4. Patikrinkite:
- Browser: `https://jocular-zabaione-835b49.netlify.app/`
- Console: Turėtų rodyti `✅ Colyseus client initialized`

---

**Status:** ✅ Instrukcijos paruoštos! Sekite Step 1-2 ir PvP Online turėtų veikti!




