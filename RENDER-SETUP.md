# 🚀 Render.com Setup - Colyseus Server

## ✅ Kas Paruošta

- ✅ Colyseus serveris (`colyseus-server` folderis)
- ✅ Build veikia (`npm run build`)
- ✅ Start veikia (`npm start`)
- ✅ PORT naudoja `process.env.PORT` (Render automatiškai nustato)

---

## 📋 Render.com Konfigūracija

### Step 1: Sukurti Web Service

1. **Eikite į Render Dashboard:** https://dashboard.render.com
2. **Spustelėkite:** "New +" → "Web Service"
3. **Prijunkite GitHub repo:** `ok05` (jūsų repo)

### Step 2: Užpildykite Formą

#### **Name:**
```
colyseus-server
```
(arba bet koks kitas pavadinimas)

#### **Language:**
```
Node
```

#### **Branch:**
```
main
```
(arba jūsų pagrindinė šaka)

#### **Region:**
```
Frankfurt (EU Central)
```
(arba artimiausias jūsų vartotojams)

#### **Root Directory:**
```
colyseus-server
```
**SVARBU:** Nurodykite `colyseus-server`, nes serveris yra subfolderyje!

#### **Build Command:**
```
npm install && npm run build
```

#### **Start Command:**
```
npm start
```

### Step 3: Environment Variables

Render automatiškai nustato `PORT`, bet galite pridėti:

- **Key:** `NODE_ENV`
- **Value:** `production`

### Step 4: Deploy

1. **Spustelėkite:** "Create Web Service"
2. **Palaukite:** Build ir deploy (5-10 min)
3. **Gausite URL:** `https://colyseus-server.onrender.com` (arba panašus)

---

## 🔗 Frontend Konfigūracija

Po to, kai Render serveris pasileis, reikia atnaujinti frontend:

### Netlify Environment Variable

1. **Eikite į Netlify Dashboard:** https://app.netlify.com
2. **Site settings → Environment variables**
3. **Pridėkite arba atnaujinkite:**
   - **Key:** `VITE_COLYSEUS_ENDPOINT`
   - **Value:** `https://colyseus-server.onrender.com` (jūsų Render URL)
4. **Redeploy:** Netlify automatiškai redeploy'ins

---

## ✅ Patikrinimas

### 1. Render Serveris

Atidarykite naršyklėje:
```
https://colyseus-server.onrender.com/health
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
   - `🔵 Colyseus endpoint: https://colyseus-server.onrender.com`
   - `✅ Colyseus client initialized`

---

## 🔍 Troubleshooting

### Problema: "Build failed"

**Patikrinkite:**
- Ar `Root Directory` nustatytas kaip `colyseus-server`?
- Ar `Build Command` teisingas: `npm install && npm run build`?

### Problema: "Service Unavailable"

**Patikrinkite:**
- Ar serveris deployed? (Render Dashboard → Logs)
- Ar `PORT` naudojamas teisingai? (Render automatiškai nustato)

### Problema: "CORS error"

**Patikrinkite:**
- Ar `colyseus-server/src/index.ts` turi `origin: true` CORS konfigūraciją?
- Ar frontend URL pridėtas į CORS allowed origins?

---

## 💰 Kainos

**Render Free Tier:**
- ✅ 750 valandų/mėn nemokamai
- ✅ Auto-sleep po 15 min neaktyvumo
- ✅ WebSocket palaikymas

**Render Paid:**
- $7/mėn - Always on (nėra sleep)
- $25/mėn - Professional plan

---

## 📝 Svarbu

1. **Root Directory:** Būtinai `colyseus-server`!
2. **Build Command:** `npm install && npm run build`
3. **Start Command:** `npm start`
4. **PORT:** Render automatiškai nustato, nereikia nustatyti rankiniu būdu

---

**Status:** ✅ Kodas paruoštas Render.com!

