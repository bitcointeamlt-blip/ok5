# 🚀 OK06 DEPLOYMENT INSTRUKCIJOS

## 📋 JŪSŲ KONFIGŪRACIJA

- **GitHub:** `ok06`
- **Colyseus:** `https://de-fra-c81e866a.colyseus.cloud`
- **Netlify:** `https://thriving-mandazi-d23051.netlify.app/`

---

## ✅ STEP 1: Patikrinkite Colyseus Server

### 1.1. Patikrinkite Serverio Status:

Atidarykite naršyklėje:
```
https://de-fra-c81e866a.colyseus.cloud/health
```

**Turėtumėte matyti:** `{"status":"ok"}`

### 1.2. Jei Serveris Neveikia:

1. Eikite į: **https://cloud.colyseus.io**
2. Pasirinkite aplikaciją **"dot"**
3. Patikrinkite **Deployments** → **Status**
4. Jei neveikia → **Redeploy**

---

## ✅ STEP 2: Nustatykite Netlify Environment Variables

### 2.1. Eikite į Netlify Dashboard:

1. **URL:** https://app.netlify.com
2. Prisijunkite
3. Pasirinkite site: **`thriving-mandazi-d23051`**

### 2.2. Pridėkite Environment Variable:

1. **Site settings** → **Environment variables**
2. Spustelėkite **"Add a variable"**
3. **Key:** `VITE_COLYSEUS_ENDPOINT`
4. **Value:** `https://de-fra-c81e866a.colyseus.cloud`
5. **Scope:** All scopes (arba Production)
6. **Save**

**SVARBU:** 
- Key turi būti tiksliai `VITE_COLYSEUS_ENDPOINT`
- Value turi būti `https://de-fra-c81e866a.colyseus.cloud`

---

## ✅ STEP 3: Redeploy Frontend

### 3.1. Netlify Dashboard:

1. **Deploys** → **Trigger deploy**
2. Pasirinkite **"Clear cache and deploy site"**
3. Palaukite build'o (2-5 min)

### 3.2. Patikrinkite Build Logs:

**Turėtumėte matyti:**
- ✅ Build command: `npm install && npm run build`
- ✅ Environment variables: `VITE_COLYSEUS_ENDPOINT` (masked)
- ✅ Deploy status: `Site is live ✨`

---

## ✅ STEP 4: Testuokite

### 4.1. Atidarykite Žaidimą:

```
https://thriving-mandazi-d23051.netlify.app/
```

### 4.2. Patikrinkite Browser Console (F12):

**Turėtumėte matyti:**
```
🔍 Environment check: { hasEnv: true, endpoint: "https://de-fra-c81e866a..." }
🔵 Colyseus endpoint found: https://de-fra-c81e866a...
✅ Colyseus client initialized: wss://de-fra-c81e866a...
```

### 4.3. Testuokite PvP:

1. Prisijunkite su Ronin Wallet
2. Pasirinkite "PvP Online"
3. Turėtumėte prisijungti prie Colyseus room

---

## 🔧 AUTOMATINIS DEPLOYMENT

### GitHub → Netlify:

Jei Netlify susietas su GitHub `ok06`:
- Kiekvienas push į `main` automatiškai deploy'ins
- Netlify naudoja environment variables iš dashboard

### GitHub → Colyseus Cloud:

Jei Colyseus Cloud susietas su GitHub `ok06`:
- Kiekvienas push į `main` automatiškai deploy'ins
- Colyseus Cloud naudoja build settings iš dashboard

---

## 📋 CHECKLIST

- [ ] Colyseus server veikia (`/health` endpoint)
- [ ] `VITE_COLYSEUS_ENDPOINT` pridėtas Netlify
- [ ] Value = `https://de-fra-c81e866a.colyseus.cloud`
- [ ] Frontend redeploy'intas
- [ ] Build logs rodo environment variable
- [ ] Browser console rodo sėkmingą prisijungimą
- [ ] PvP prisijungimas veikia

---

## 🎉 SĖKMĖ!

Jei visi žingsniai atlikti teisingai, žaidimas turėtų veikti online!

**Jei vis dar yra problemų, žr. `OK06-KONFIGURACIJA.md` troubleshooting sekciją.**


