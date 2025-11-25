# 🔍 Colyseus Cloud - Deployed Bet Neveikia

## 🎯 Situacija

- ✅ **Deployment Status:** "Deployed" (20 min prieš)
- ✅ **Repository:** `git@github.com:bitcointeamlt-blip/ok5.git`
- ✅ **Branch:** `main`
- ✅ **Commit:** `2ae671b` ("oop2")
- ❌ **Serveris:** "Service Unavailable"

**Problema:** Deployment sėkmingas, bet serveris neveikia arba crash'ina.

---

## 🔍 Galimos Priežastys

### 1. Serveris Crash'ina Po Start'ino

**Simptomai:**
- Deployment sėkmingas
- Serveris start'ina
- Bet po kelių sekundžių crash'ina
- Health endpoint neveikia

**Tikrinimas:**
- Patikrinkite Colyseus Cloud **Application Logs**
- Ieškokite error'ų: `EADDRINUSE`, `uncaughtException`, `unhandledRejection`

---

### 2. Serveris Ne Start'ina

**Simptomai:**
- Deployment sėkmingas
- Bet serveris niekada ne start'ina
- Health endpoint neveikia

**Tikrinimas:**
- Patikrinkite Colyseus Cloud **Application Logs**
- Ieškokite: `Failed to start server`, `Error`, `Cannot find module`

---

### 3. Port Problema

**Simptomai:**
- Serveris bando start'inti
- Bet gauna `EADDRINUSE` error'ą
- Crash'ina

**Tikrinimas:**
- Patikrinkite `ecosystem.config.js` - ar `instances: 1`?
- Patikrinkite ar nėra kelių PM2 instance'ų

---

## ✅ Sprendimas

### Step 1: Patikrinkite Application Logs

1. **Eikite į:** https://cloud.colyseus.io
2. **Pasirinkite aplikaciją:** `ok5` (arba `dot`)
3. **Eikite į:** **"Stats"** arba **"Logs"** sekciją
4. **Patikrinkite:** Ar yra error'ų?

**Ieškokite:**
- `EADDRINUSE`
- `Failed to start server`
- `uncaughtException`
- `unhandledRejection`
- `Cannot find module`

---

### Step 2: Patikrinkite Build Settings

1. **Colyseus Cloud Dashboard** → **Settings**
2. **Build Settings:**
   - **Root Directory:** `colyseus-server` (jei serveris yra subfolder'yje)
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start` (arba `node build/index.js`)

**SVARBU:**
- Jei serveris yra `colyseus-server/` folder'yje, reikia nustatyti **Root Directory**
- Jei serveris yra root'e, palikite tuščią

---

### Step 3: Patikrinkite Ecosystem Config

**Failas:** `colyseus-server/ecosystem.config.js`

**Turėtų būti:**
```javascript
module.exports = {
  apps: [{
    name: 'colyseus-server',
    script: 'build/index.js',
    instances: 1,  // SVARBU: Tik 1 instance!
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 2567
    }
  }]
};
```

**SVARBU:**
- ✅ `instances: 1` - tik vienas instance
- ✅ `exec_mode: 'fork'` - ne 'cluster'
- ✅ `script: 'build/index.js'` - teisingas build path

---

### Step 4: Redeploy su Fix'ais

Jei radote problemą:

1. **Pataisykite kodą lokaliai**
2. **Commit → Push į GitHub:**
   ```bash
   git add .
   git commit -m "Fix: Colyseus server startup"
   git push origin main
   ```

3. **Colyseus Cloud automatiškai redeploy'ins**
4. **Palaukite 2-5 min**
5. **Patikrinkite:** `https://de-fra-f8820c12.colyseus.cloud/health`

---

## 🔧 Dažniausios Problemos

### Problema 1: EADDRINUSE

**Simptomai:**
- `EADDRINUSE: address already in use :::2567`
- Serveris crash'ina

**Sprendimas:**
- Patikrinkite `ecosystem.config.js` - ar `instances: 1`?
- Patikrinkite ar nėra kelių PM2 instance'ų

---

### Problema 2: Cannot Find Module

**Simptomai:**
- `Cannot find module '@colyseus/core'`
- `Cannot find module './rooms/GameRoom'`

**Sprendimas:**
- Patikrinkite ar `package.json` turi visus dependencies
- Patikrinkite ar `npm install` buvo paleistas build'e
- Patikrinkite Colyseus Cloud Build Settings

---

### Problema 3: Build Path Neteisingas

**Simptomai:**
- `Cannot find module 'build/index.js'`
- Serveris ne start'ina

**Sprendimas:**
- Patikrinkite Colyseus Cloud **Root Directory** settings
- Jei serveris yra `colyseus-server/`, nustatykite Root Directory = `colyseus-server`
- Patikrinkite ar `build/index.js` egzistuoja po build'o

---

## 📋 Checklist

- [ ] Patikrinta Application Logs (Colyseus Cloud Dashboard)
- [ ] Patikrinta Build Settings (Root Directory, Build Command)
- [ ] Patikrinta `ecosystem.config.js` (`instances: 1`)
- [ ] Patikrinta ar `build/index.js` egzistuoja
- [ ] Patikrinta ar `package.json` turi visus dependencies
- [ ] Redeploy'intas su fix'ais
- [ ] Patikrinta health endpoint po redeploy

---

## 🚀 Greitas Fix

### Jei Nežinote Kas Negerai:

1. **Patikrinkite Logs:**
   - Colyseus Cloud Dashboard → Stats/Logs
   - Ieškokite error'ų

2. **Redeploy:**
   - Colyseus Cloud Dashboard → Deployments → Redeploy
   - Palaukite 2-5 min

3. **Patikrinkite:**
   ```
   https://de-fra-f8820c12.colyseus.cloud/health
   ```

---

**Status:** ✅ Instrukcijos paruoštos! Patikrinkite Application Logs ir Build Settings!




