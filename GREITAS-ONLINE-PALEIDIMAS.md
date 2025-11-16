# ⚡ GREITAS ONLINE PALEIDIMAS - 5 ŽINGSNIAI

## 🎯 TIKSLAS: Paleisti žaidimą online

---

## ✅ STEP 1: Patikrinkite Colyseus Server Status

### 1.1. Atidarykite naršyklėje:
```
https://de-fra-f8820c12.colyseus.cloud/health
```

**Jei matote `{"status":"ok"}`:**
- ✅ Serveris veikia!
- Eikite į STEP 2

**Jei matote error:**
- ❌ Serveris neveikia
- Eikite į STEP 1.2

### 1.2. Deploy Colyseus Server (Jei neveikia):

1. **Eikite:** https://cloud.colyseus.io
2. **Prisijunkite** ir pasirinkite aplikaciją
3. **Deployments** → **Deploy** (arba **Redeploy**)
4. **Palaukite** 2-5 min
5. **Gaukite endpoint** (pvz: `https://de-fra-xxxxx.colyseus.cloud`)

---

## ✅ STEP 2: Patikrinkite Netlify Environment Variables

### 2.1. Eikite į Netlify Dashboard:

1. **URL:** https://app.netlify.com
2. **Prisijunkite**
3. **Pasirinkite savo site**

### 2.2. Patikrinkite Environment Variables:

1. **Site settings** → **Environment variables**
2. **Ieškokite:** `VITE_COLYSEUS_ENDPOINT`

**Jei YRA:**
- Patikrinkite ar value = `https://de-fra-f8820c12.colyseus.cloud`
- Jei ne - pakeiskite į teisingą endpoint
- Eikite į STEP 3

**Jei NĖRA:**
- Eikite į STEP 2.3

### 2.3. Pridėkite Environment Variable:

1. **Spustelėkite:** "Add a variable"
2. **Key:** `VITE_COLYSEUS_ENDPOINT`
3. **Value:** `https://de-fra-f8820c12.colyseus.cloud`
   - (ARBA jūsų naujas endpoint iš STEP 1.2)
4. **Scope:** All scopes (arba Production)
5. **Save**

---

## ✅ STEP 3: Redeploy Frontend

### 3.1. Netlify Dashboard:

1. **Deploys** → **Trigger deploy**
2. **Pasirinkite:** "Clear cache and deploy site"
3. **Palaukite** build'o (2-5 min)

### 3.2. Patikrinkite Build Logs:

**Turėtumėte matyti:**
- ✅ Build command: `npm install && npm run build`
- ✅ Environment variables: `VITE_COLYSEUS_ENDPOINT` (masked)
- ✅ Deploy status: `Site is live ✨`

---

## ✅ STEP 4: Testuokite Žaidimą

### 4.1. Atidarykite Žaidimą:

1. Atidarykite Netlify URL (pvz: `https://your-site.netlify.app`)
2. Atidarykite **Browser Console** (F12)

### 4.2. Patikrinkite Console:

**Turėtumėte matyti:**
```
🔍 Environment check: { hasEnv: true, endpoint: "https://de-fra-..." }
🔵 Colyseus endpoint found: https://de-fra-...
✅ Colyseus client initialized: wss://de-fra-...
```

**Jei matote:**
```
⚠️ VITE_COLYSEUS_ENDPOINT not set
```
→ Environment variable nėra nustatytas! Grįžkite į STEP 2.

### 4.3. Testuokite PvP:

1. Prisijunkite su **Ronin Wallet**
2. Pasirinkite **"PvP Online"**
3. Turėtumėte prisijungti prie Colyseus room
4. Kai 2 žaidėjai prisijungia, turėtų pradėti žaidimą

---

## ✅ STEP 5: Patikrinkite Rezultatą

### Sėkmingas Deployment Turėtų Rodyti:

- ✅ Colyseus server veikia (`/health` endpoint)
- ✅ Frontend deploy'intas Netlify
- ✅ `VITE_COLYSEUS_ENDPOINT` nustatytas
- ✅ Browser console rodo sėkmingą prisijungimą
- ✅ PvP prisijungimas veikia
- ✅ 2 žaidėjai gali žaisti kartu

---

## 🔧 TROUBLESHOOTING

### Problema: "Failed to connect to Colyseus server"

**Sprendimas:**
1. Patikrinkite Colyseus server status (`/health`)
2. Patikrinkite `VITE_COLYSEUS_ENDPOINT` Netlify
3. Redeploy frontend

### Problema: "Colyseus not configured"

**Sprendimas:**
1. Netlify → Environment Variables
2. Pridėkite `VITE_COLYSEUS_ENDPOINT`
3. Redeploy

### Problema: Build logs nerodo environment variable

**Sprendimas:**
1. Patikrinkite variable name (tiksliai `VITE_COLYSEUS_ENDPOINT`)
2. Išvalykite cache
3. Redeploy

---

## 📋 CHECKLIST

- [ ] Colyseus server veikia (`/health` endpoint)
- [ ] `VITE_COLYSEUS_ENDPOINT` pridėtas Netlify
- [ ] Frontend redeploy'intas
- [ ] Build logs rodo environment variable
- [ ] Browser console rodo sėkmingą prisijungimą
- [ ] PvP prisijungimas veikia

---

## 🎉 SĖKMĖ!

Jei visi žingsniai atlikti teisingai, žaidimas turėtų veikti online!

**Jei vis dar yra problemų, žr. `ANALIZE-IR-ONLINE-PALEIDIMAS.md` pilną vadovą.**


