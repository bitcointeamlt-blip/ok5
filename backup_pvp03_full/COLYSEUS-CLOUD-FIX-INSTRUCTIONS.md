# ✅ Colyseus Cloud Fix - Instrukcijos

## 🎯 Situacija

- ✅ **Kodas:** Build'as sėkmingas lokaliai
- ✅ **Deployment:** "Deployed" Colyseus Cloud'e
- ❌ **Serveris:** "Service Unavailable"

**Problema:** Serveris neveikia nors deployment'as sėkmingas.

---

## ✅ Ką Aš Padariau Automatiškai

### 1. ✅ Patikrintas Kodas
- ✅ `colyseus-server/src/index.ts` - teisingas
- ✅ `colyseus-server/ecosystem.config.js` - teisingas (`instances: 1`)
- ✅ `colyseus-server/package.json` - visi dependencies yra
- ✅ Build sėkmingas - `build/index.js` egzistuoja

### 2. ✅ Patikrinta Struktūra
- ✅ `build/index.js` - egzistuoja
- ✅ `build/rooms/GameRoom.js` - egzistuoja
- ✅ `build/schema/GameState.js` - egzistuoja

---

## ❌ Ką Negaliu Padaryti Automatiškai

### 1. ❌ Negaliu Matyti Colyseus Cloud Logs
**Reikia jūsų:**
- Eikite į: https://cloud.colyseus.io
- Pasirinkite aplikaciją: `ok5`
- Eikite į: **"Stats"** arba **"Logs"** sekciją
- **Pasidalykite:** Kokius error'us matote?

---

### 2. ❌ Negaliu Keisti Build Settings Colyseus Cloud'e
**Reikia jūsų:**
- Eikite į: https://cloud.colyseus.io
- Pasirinkite aplikaciją: `ok5`
- Eikite į: **"Settings"** → **"Build Settings"**
- **Patikrinkite:**
  - **Root Directory:** Turėtų būti `colyseus-server` (jei serveris yra subfolder'yje)
  - **Build Command:** `npm run build`
  - **Start Command:** `npm start` (arba `node build/index.js`)

**SVARBU:**
- Jei repository root'e yra `colyseus-server/` folder'is, nustatykite **Root Directory = `colyseus-server`**
- Jei serveris yra repository root'e, palikite **Root Directory tuščią**

---

### 3. ❌ Negaliu Redeploy'inti Colyseus Cloud'e
**Reikia jūsų:**
- Eikite į: https://cloud.colyseus.io
- Pasirinkite aplikaciją: `ok5`
- Eikite į: **"Deployments"**
- Spustelėkite: **"Redeploy"** (arba **"Deploy"**)
- Palaukite 2-5 min

---

### 4. ❌ Negaliu Pridėti Environment Variables į Netlify
**Reikia jūsų:**
- Eikite į: https://app.netlify.com
- Pasirinkite site: `jocular-zabaione-835b49`
- **Site settings** → **Environment variables**
- **Add a variable:**
  - **Key:** `VITE_COLYSEUS_ENDPOINT`
  - **Value:** `https://de-fra-f8820c12.colyseus.cloud`
  - **Scope:** All scopes
- **Save**
- **Deploys** → **Trigger deploy** → **Clear cache and deploy site**

---

## 🔍 Dažniausios Problemos ir Sprendimai

### Problema 1: Root Directory Neteisingas

**Simptomai:**
- `Cannot find module 'build/index.js'`
- Serveris ne start'ina

**Sprendimas:**
1. Colyseus Cloud Dashboard → Settings → Build Settings
2. **Root Directory:** Nustatykite `colyseus-server` (jei serveris yra subfolder'yje)
3. **Save**
4. **Redeploy**

---

### Problema 2: Build Command Neteisingas

**Simptomai:**
- Build nepavyko
- Serveris ne start'ina

**Sprendimas:**
1. Colyseus Cloud Dashboard → Settings → Build Settings
2. **Build Command:** `npm run build`
3. **Start Command:** `npm start` (arba `node build/index.js`)
4. **Save**
5. **Redeploy**

---

### Problema 3: EADDRINUSE Error

**Simptomai:**
- `EADDRINUSE: address already in use :::2567`
- Serveris crash'ina

**Sprendimas:**
- ✅ Jūsų `ecosystem.config.js` jau turi `instances: 1` - tai teisingai
- Jei vis dar crash'ina, patikrinkite Application Logs

---

### Problema 4: Dependencies Trūksta

**Simptomai:**
- `Cannot find module '@colyseus/core'`
- Serveris ne start'ina

**Sprendimas:**
- ✅ Jūsų `package.json` turi visus dependencies
- Patikrinkite ar Colyseus Cloud build'e paleidžia `npm install`

---

## 📋 Checklist - Ką Reikia Padaryti Rankiniu Būdu

### Colyseus Cloud:

- [ ] **Patikrinti Application Logs:**
  - Colyseus Cloud Dashboard → Stats/Logs
  - Ieškokite error'ų
  - Pasidalykite error'ais su manimi

- [ ] **Patikrinti Build Settings:**
  - Settings → Build Settings
  - Root Directory: `colyseus-server` (jei serveris yra subfolder'yje)
  - Build Command: `npm run build`
  - Start Command: `npm start`

- [ ] **Redeploy:**
  - Deployments → Redeploy
  - Palaukite 2-5 min

- [ ] **Patikrinti Health Endpoint:**
  ```
  https://de-fra-f8820c12.colyseus.cloud/health
  ```
  Turėtumėte matyti: `{"status":"ok"}`

---

### Netlify:

- [ ] **Pridėti Environment Variable:**
  - Site settings → Environment variables
  - Add `VITE_COLYSEUS_ENDPOINT` = `https://de-fra-f8820c12.colyseus.cloud`

- [ ] **Redeploy:**
  - Deploys → Trigger deploy → Clear cache and deploy site

---

## 🚀 Greitas Fix - Jei Nežinote Kas Negerai

### 1. Patikrinkite Logs:
- Colyseus Cloud Dashboard → Stats/Logs
- Ieškokite error'ų
- **Pasidalykite su manimi** - galiu padėti išspręsti!

### 2. Patikrinkite Build Settings:
- Settings → Build Settings
- **Root Directory:** `colyseus-server` (jei serveris yra subfolder'yje)
- **Save**

### 3. Redeploy:
- Deployments → Redeploy
- Palaukite 2-5 min

### 4. Patikrinkite:
```
https://de-fra-f8820c12.colyseus.cloud/health
```

---

## 💡 Svarbu

**Jei matote error'us Logs'e, pasidalykite su manimi:**
- Galiu padėti išspręsti daugumą problemų
- Galiu pataisyti kodą jei reikia
- Galiu sukurti fix'us

**Status:** ✅ Kodas paruoštas! Reikia tik patikrinti Colyseus Cloud settings ir redeploy'inti!




