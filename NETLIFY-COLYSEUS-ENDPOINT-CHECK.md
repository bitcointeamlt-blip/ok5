# 🔍 Netlify Colyseus Endpoint Patikrinimas

## ❌ Problema

**Vartotojo pastebėjimas:**
- ✅ Lokaliai (port 7000) viskas veikia gerai - prijungtas prie Colyseus serverio
- ✅ Per Netlify zaidimas atsinaujina ir yra naujausia versija
- ❌ Bet PvP funkcija neveikia per Netlify - Colyseus serveris nepriima Netlify linko

**Problema:** `VITE_COLYSEUS_ENDPOINT` environment variable nėra nustatytas Netlify, arba yra neteisingas.

---

## ✅ Sprendimas: Patikrinti ir Nustatyti Netlify Environment Variables

### Step 1: Patikrinti Netlify Environment Variables

1. **Eikite į Netlify Dashboard:**
   - https://app.netlify.com
   - Prisijunkite
   - Pasirinkite savo projektą

2. **Eikite į Site Settings → Environment Variables:**
   - Kairėje meniu: **Site settings**
   - Spustelėkite: **Environment variables**

3. **Patikrinkite ar yra `VITE_COLYSEUS_ENDPOINT`:**
   - Jei NĖRA - pridėkite (žr. Step 2)
   - Jei YRA - patikrinkite ar reikšmė teisinga (žr. Step 3)

---

### Step 2: Pridėti `VITE_COLYSEUS_ENDPOINT` į Netlify

1. **Netlify Dashboard → Site Settings → Environment Variables**

2. **Spustelėkite "Add a variable"**

3. **Pridėkite:**
   - **Key:** `VITE_COLYSEUS_ENDPOINT`
   - **Value:** `https://de-fra-f8820c12.colyseus.cloud`
   - **Scopes:** Pasirinkite "All scopes" arba "Production"

4. **Spustelėkite "Save"**

---

### Step 3: Patikrinti Endpoint Formatą

**Teisingas formatas:**
- ✅ `https://de-fra-f8820c12.colyseus.cloud` (HTTPS)
- ✅ `wss://de-fra-f8820c12.colyseus.cloud` (WebSocket Secure)

**Neteisingas formatas:**
- ❌ `http://de-fra-f8820c12.colyseus.cloud` (HTTP - neveiks su Netlify)
- ❌ `ws://de-fra-f8820c12.colyseus.cloud` (WebSocket - neveiks su Netlify)

**Kodas automatiškai konvertuoja:**
- `https://` → `wss://` (WebSocket Secure)
- `http://` → `ws://` (WebSocket)

---

### Step 4: Redeploy Netlify

Po pridėjimo arba pakeitimo `VITE_COLYSEUS_ENDPOINT`:

1. **Netlify Dashboard → Deploys**
2. **Spustelėkite "Trigger deploy" → "Deploy site"**
3. **Palaukite:** 2-5 min
4. **Patikrinkite browser console**

---

## 🔍 Patikrinimas Po Redeploy

### Browser Console (Netlify)

**Turėtų rodyti:**
- ✅ `Colyseus client initialized: wss://de-fra-f8820c12.colyseus.cloud`
- ✅ `🔵 Connecting to Colyseus server (low latency)...`
- ✅ `✅ Successfully joined Colyseus room: [room-id]`
- ✅ `Entered PvP Online lobby`

**NE turėtų rodyti:**
- ❌ `Colyseus not configured. Set VITE_COLYSEUS_ENDPOINT in .env file`
- ❌ `Cannot enter lobby: Colyseus endpoint not configured`
- ❌ `Failed to connect to Colyseus server`
- ❌ CORS error'ų

---

## 🐛 Troubleshooting

### Problema: "Colyseus not configured"

**Priežastis:** `VITE_COLYSEUS_ENDPOINT` nėra nustatytas Netlify.

**Sprendimas:**
1. Netlify Dashboard → Site Settings → Environment Variables
2. Pridėkite `VITE_COLYSEUS_ENDPOINT` su reikšme `https://de-fra-f8820c12.colyseus.cloud`
3. Redeploy Netlify

---

### Problema: "Failed to connect to Colyseus server"

**Priežastis:** Colyseus serveris neveikia arba CORS konfigūracija neteisinga.

**Sprendimas:**
1. Patikrinkite, ar Colyseus serveris deploy'intas su nauja CORS konfigūracija
2. Patikrinkite Colyseus Cloud Dashboard → Deployments → LOGS
3. Patikrinkite browser console - ar yra CORS error'ų

---

### Problema: CORS Error

**Priežastis:** Colyseus serveris neleidžia Netlify origins.

**Sprendimas:**
1. Patikrinkite, ar Colyseus serveris deploy'intas su `matchMaker.controller.getCorsHeaders` override
2. Patikrinkite `COLYSEUS-CORS-FINAL-FIX.md` dokumentaciją
3. Commit → Push → Deploy Colyseus serveris

---

## 📋 Checklist

- [ ] Netlify Dashboard → Site Settings → Environment Variables
- [ ] Patikrinti ar yra `VITE_COLYSEUS_ENDPOINT`
- [ ] Jei nėra - pridėti su reikšme `https://de-fra-f8820c12.colyseus.cloud`
- [ ] Patikrinti ar endpoint formatas teisingas (`https://` arba `wss://`)
- [ ] Redeploy Netlify
- [ ] Patikrinti browser console (nėra "Colyseus not configured" error)
- [ ] Patikrinti browser console (nėra CORS error'ų)
- [ ] Patikrinti ar PvP funkcija veikia

---

## 💡 Svarbiausia

**Netlify environment variables turi būti nustatyti Netlify Dashboard, ne `.env` faile!**

**`.env` failas veikia tik lokaliai (port 7000).**

**Netlify build naudoja Netlify Dashboard environment variables.**

---

**Dabar patikrinkite Netlify Dashboard → Site Settings → Environment Variables!** 🔍

