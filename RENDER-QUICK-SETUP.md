# 🚀 Render.com Quick Setup - Colyseus Server

## ✅ Kodas Paruoštas!

Jūsų Colyseus serveris veikia lokaliai - dabar tiesiog paleisime jį ant Render.com.

---

## 📋 Render.com Konfigūracija (5 min)

### Step 1: Eikite į Render Dashboard

1. **Atidarykite:** https://dashboard.render.com
2. **Spustelėkite:** "New +" → "Web Service"
3. **Prijunkite GitHub:** Pasirinkite `ok05` repo

### Step 2: Užpildykite Formą

#### **Name:**
```
colyseus-pvp-server
```

#### **Language:**
```
Node
```

#### **Branch:**
```
main
```

#### **Region:**
```
Frankfurt (EU Central)
```
(arba artimiausias)

#### **Root Directory:**
```
colyseus-server
```
**SVARBU:** Būtinai `colyseus-server`!

#### **Build Command:**
```
npm install && npm run build
```

#### **Start Command:**
```
npm start
```

#### **Environment Variables:**
Nereikia - Render automatiškai nustato `PORT`

### Step 3: Deploy

1. **Spustelėkite:** "Create Web Service"
2. **Palaukite:** 5-10 min (build + deploy)
3. **Gausite URL:** `https://colyseus-pvp-server.onrender.com`

---

## 🔗 Frontend Konfigūracija

### Netlify Environment Variable

1. **Eikite:** https://app.netlify.com
2. **Site settings → Environment variables**
3. **Pridėkite arba atnaujinkite:**
   - **Key:** `VITE_COLYSEUS_ENDPOINT`
   - **Value:** `https://colyseus-pvp-server.onrender.com` (jūsų Render URL)
4. **Redeploy:** Netlify automatiškai redeploy'ins

---

## ✅ Patikrinimas

### 1. Render Serveris

Atidarykite naršyklėje:
```
https://colyseus-pvp-server.onrender.com/health
```

Turėtumėte matyti:
```json
{"status":"ok"}
```

### 2. Frontend

1. Atidarykite: https://jocular-zabaione-835b49.netlify.app/
2. Connect Ronin Wallet
3. Spustelėkite "PvP Online"
4. Browser console turėtų rodyti:
   - `🔵 Colyseus endpoint: https://colyseus-pvp-server.onrender.com`
   - `✅ Colyseus client initialized`

---

## 💰 Kainos

**Render Free Tier:**
- ✅ 750 valandų/mėn nemokamai
- ✅ Auto-sleep po 15 min neaktyvumo (bet veikia!)
- ✅ WebSocket palaikymas

**Jei reikia "Always On":**
- $7/mėn - nėra sleep

---

## 🔍 Troubleshooting

### Problema: "Build failed"

**Patikrinkite:**
- Ar `Root Directory` = `colyseus-server`?
- Ar `Build Command` = `npm install && npm run build`?

### Problema: "Service Unavailable"

**Patikrinkite:**
- Render Dashboard → Logs
- Ar serveris deployed?
- Ar matote `✅ Server running on port XXXX`?

### Problema: "CORS error"

**Sprendimas:**
- `colyseus-server/src/index.ts` jau turi `origin: true` - turėtų veikti

---

## ✅ Checklist

- [ ] Render.com Web Service sukurtas
- [ ] Root Directory = `colyseus-server`
- [ ] Build Command = `npm install && npm run build`
- [ ] Start Command = `npm start`
- [ ] Serveris deployed ir veikia (`/health` endpoint)
- [ ] Netlify `VITE_COLYSEUS_ENDPOINT` atnaujintas
- [ ] Frontend redeployed
- [ ] PvP Online veikia!

---

**Status:** ✅ Kodas paruoštas - tiesiog sekite instrukcijas aukščiau!

