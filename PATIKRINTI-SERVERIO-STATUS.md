# 🔍 Patikrinkite Serverio Status

## ✅ Frontend Status (Lokaliai)

Pagal console log'us:
- ✅ Frontend veikia lokaliai (localhost:7000)
- ✅ Colyseus client inicializuotas
- ✅ Environment variable nustatytas (`VITE_COLYSEUS_ENDPOINT`)
- ✅ Bando prisijungti prie: `wss://de-fra-c81e866a.colyseus.cloud`

---

## 🔍 Patikrinkite Colyseus Cloud Serverio Status

### Step 1: Patikrinkite Health Endpoint

Atidarykite naršyklėje:
```
https://de-fra-c81e866a.colyseus.cloud/health
```

**Jei matote `{"status":"ok"}`:**
- ✅ Serveris VEIKIA
- Frontend turėtų galėti prisijungti

**Jei matote "Service Unavailable":**
- ❌ Serveris NEVEIKIA
- Reikia patikrinti logs Colyseus Cloud'e

---

### Step 2: Patikrinkite Logs Colyseus Cloud'e

1. **Colyseus Cloud** → **Endpoints** tab
2. Spustelėkite **"LOGS"** mygtuką
3. **Išjunkite "Show only errors" toggle** (OFF)
4. **Refresh'inkite puslapį** (F5)
5. Patikrinkite:
   - Ar yra "✅ Colyseus server is running on port 2567"?
   - Ar yra crash error'ų?
   - Ar yra uncaught exception?

---

### Step 3: Patikrinkite Instance Status

1. **Colyseus Cloud** → **Endpoints** tab
2. Patikrinkite instance status:
   - "✓ Deployed" - deployment sėkmingas
   - Bet ar serveris tikrai veikia?

---

## 💡 Galimos Problemos

### 1. Serveris Neveikia (Service Unavailable)

**Sprendimas:**
- Patikrinkite logs Colyseus Cloud'e
- Jei serveris crash'ina - reboot instance
- Jei vis dar neveikia - commit → push naują kodą

### 2. CORS Problema

**Sprendimas:**
- Serveris jau turi CORS middleware
- Jei vis dar CORS error - patikrinkite, ar naujausias kodas deploy'intas

### 3. Connection Timeout

**Sprendimas:**
- Patikrinkite, ar serveris veikia (`/health` endpoint)
- Patikrinkite logs Colyseus Cloud'e

---

## 🎯 Kitas Žingsnis

1. **Patikrinkite health endpoint** - ar serveris veikia?
2. **Patikrinkite logs** - ar yra error'ų?
3. **Jei serveris neveikia** - reboot instance arba commit → push

**Dabar patikrinkite health endpoint ir logs!**


