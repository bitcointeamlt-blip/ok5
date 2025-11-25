# 🔍 Service Unavailable - Debug

## ❌ Problema: Service Unavailable

Matau, kad:
- ❌ `/health` endpoint grąžina "Service Unavailable"
- ❌ Serveris vis dar nepasileidžia

**Tai reiškia, kad serveris niekada nepasileidžia arba crash'ina iškart po start'o.**

---

## 🔍 Troubleshooting Steps

### Step 1: Patikrinkite Logs Colyseus Cloud'e

1. **Colyseus Cloud** → Endpoints tab
2. Spustelėkite **"LOGS"** mygtuką (šalia instance)
3. Patikrinkite, ką rodo logs:
   - Ar yra error messages?
   - Ar yra "Colyseus server is running" pranešimas?
   - Ar yra crash messages?

### Step 2: Patikrinkite, Ar Ecosystem Config Commit'intas

1. Patikrinkite GitHub'e, ar `ecosystem.config.js` yra repository'e
2. Jei nėra → commit → push
3. Jei yra → patikrinkite, ar deployment padarytas po commit'o

### Step 3: Patikrinkite Serverio Kodą

**Patikrinkite `colyseus-server/src/index.ts`**:
- Ar serveris teisingai start'ina?
- Ar yra error handling?
- Ar PORT teisingai nustatytas?

---

## 💡 Galimos Priežastys

### 1. Ecosystem Config Neteisingas

**Patikrinkite**:
- Ar `ecosystem.config.js` yra `colyseus-server/` folderyje?
- Ar `script: 'build/index.js'` teisingas?
- Ar `build/index.js` egzistuoja po build?

### 2. Serveris Crash'ina Po Start'o

**Patikrinkite logs**:
- Ar yra error messages?
- Ar yra import errors?
- Ar yra dependency issues?

### 3. PORT Problema

**Patikrinkite**:
- Ar `process.env.PORT` teisingai naudojamas?
- Ar Colyseus Cloud nustato PORT?

---

## ✅ Sprendimas: Patikrinkite Logs

**SVARBIAUSIA**: Patikrinkite logs Colyseus Cloud'e!

1. **Colyseus Cloud** → Endpoints tab
2. Spustelėkite **"LOGS"** mygtuką
3. Kopijuokite logs ir parodykite man

**Ar matote logs Colyseus Cloud'e?**

