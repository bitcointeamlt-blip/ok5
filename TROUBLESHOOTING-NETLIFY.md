# 🔍 Troubleshooting - Netlify PvP Online Neveikia

## ✅ Kas Jau Padaryta

- ✅ `VITE_COLYSEUS_ENDPOINT` pridėtas į Netlify Environment Variables
- ✅ Frontend kodas paruoštas
- ❌ Bet vis tiek neveikia

---

## 🔍 Patikrinkite Šiuos Dalykus

### 1. Ar Colyseus Cloud Serveris Veikia?

**Atidarykite naršyklėje:**
```
https://de-fra-f8820c12.colyseus.cloud/health
```

**Jei matote `{"status":"ok"}`:**
- ✅ Serveris veikia
- Problema frontend connection'e

**Jei matote error arba "Service Unavailable":**
- ❌ Serveris neveikia
- Reikia patikrinti Colyseus Cloud deployment

---

### 2. Patikrinkite Browser Console

**Atidarykite:** https://jocular-zabaione-835b49.netlify.app/
**Atidarykite:** Browser Console (F12 → Console)
**Spustelėkite:** "PvP Online"

**Ką ieškoti:**
- `🔵 Colyseus endpoint: ...` - ar endpoint teisingas?
- `✅ Colyseus client initialized` - ar client sukurtas?
- `❌ Failed to connect` - ar yra connection error'ų?
- `WebSocket connection failed` - ar WebSocket neveikia?

**Pasakykite, ką matote console'e!**

---

### 3. Patikrinkite Network Tab

**Atidarykite:** Browser DevTools → Network tab
**Filtruokite:** WS (WebSocket)
**Spustelėkite:** "PvP Online"

**Ką ieškoti:**
- Ar yra WebSocket connection?
- Ar connection sėkmingas (101 Switching Protocols)?
- Ar yra error'ų?

---

### 4. Patikrinkite Netlify Environment Variable

**Eikite:** https://app.netlify.com → Jūsų projektas → Environment variables

**Patikrinkite:**
- Ar `VITE_COLYSEUS_ENDPOINT` yra?
- Ar value = `https://de-fra-f8820c12.colyseus.cloud`?
- Ar scope = "Production" arba "All scopes"?

**SVARBU:** Po pridėjimo environment variable, reikia **redeploy'inti**!

---

### 5. Patikrinkite Colyseus Cloud Deployment

**Eikite:** https://cloud.colyseus.io
**Pasirinkite:** Jūsų aplikaciją
**Patikrinkite:**
- Ar deployment status = "Running"?
- Ar instances = "1" arba daugiau?
- Ar yra error'ų logs'e?

---

## 🚨 Dažniausios Problemos

### Problema 1: "Service Unavailable"

**Priežastis:** Colyseus Cloud serveris neveikia

**Sprendimas:**
1. Colyseus Cloud → Deployments
2. Patikrinkite status
3. Jei "Not deployed" → Deploy
4. Jei fails → Patikrinkite logs

---

### Problema 2: "WebSocket connection failed"

**Priežastis:** CORS arba WebSocket neveikia

**Sprendimas:**
1. Patikrinkite, ar Colyseus serveris turi `origin: true` CORS
2. Patikrinkite, ar endpoint formatas teisingas (`https://` ne `http://`)

---

### Problema 3: "Failed to connect to Colyseus server"

**Priežastis:** Frontend negali prisijungti

**Sprendimas:**
1. Patikrinkite Netlify environment variable
2. Redeploy frontend
3. Patikrinkite browser console error'us

---

## 📋 Ką Man Pasakyti

**Prašau pasakykite:**
1. Ar `https://de-fra-f8820c12.colyseus.cloud/health` veikia?
2. Ką matote browser console'e kai spauskate "PvP Online"?
3. Ar yra WebSocket connection Network tab'e?
4. Ar Netlify environment variable nustatytas ir redeploy'intas?

**Su šia informacija galėsiu tiksliai nustatyti problemą!**



