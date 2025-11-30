# ✅ Deployment Checklist - Paruoštas Deploy'inti

## 🎯 Frontend (Netlify) - Paruoštas ✅

### ✅ Kas Jau Paruošta:
- ✅ `netlify.toml` konfigūracija teisinga
- ✅ Build komanda: `npm install && npm run build`
- ✅ Publish directory: `dist`
- ✅ Node version: `22.21.1`
- ✅ Redirects konfigūruoti (SPA support)
- ✅ Security headers nustatyti
- ✅ Colyseus primary system su Supabase fallback

### ⚠️ Reikia Patikrinti Netlify Dashboard:

#### 1. Environment Variables (SVARBU!)
Netlify Dashboard → Site settings → Environment variables:

**Privalomi:**
- ✅ `VITE_SUPABASE_URL` - jūsų Supabase URL
- ✅ `VITE_SUPABASE_ANON_KEY` - jūsų Supabase anon key
- ✅ `VITE_COLYSEUS_ENDPOINT` - jūsų Colyseus Cloud endpoint (pvz: `https://de-fra-xxxxx.colyseus.cloud`)

**Patikrinkite:**
- [ ] Ar visi 3 environment variables yra nustatyti?
- [ ] Ar `VITE_COLYSEUS_ENDPOINT` turi teisingą endpoint'ą?
- [ ] Ar `VITE_SUPABASE_URL` ir `VITE_SUPABASE_ANON_KEY` teisingi?

---

## 🎯 Colyseus Server (Colyseus Cloud) - Reikia Patikrinti

### ⚠️ Reikia Patikrinti Colyseus Cloud:

#### 1. Colyseus Cloud Dashboard:
1. Eikite į: **https://cloud.colyseus.io**
2. Prisijunkite prie savo account'o
3. Pasirinkite aplikaciją

#### 2. Build Settings:
Colyseus Cloud → Settings → Build & Deployment:

**Root Directory:**
```
colyseus-server
```
(be slash'ų, be tarpų!)

**Build Command:**
```
cd colyseus-server && npm install && npm run build
```

**Start Command:**
```
cd colyseus-server && npm start
```

**Node Version:**
```
22
```

**Port:**
```
(palikite tuščią)
```

#### 3. GitHub Connection:
- [ ] Ar Colyseus Cloud susietas su GitHub repository?
- [ ] Ar repository turi `colyseus-server/` folderį?
- [ ] Ar kodas push'intas į GitHub?

#### 4. Deployment:
- [ ] Ar Colyseus serveris deploy'intas?
- [ ] Ar deployment sėkmingas (status: "Running")?
- [ ] Ar gavote endpoint'ą (pvz: `https://de-fra-xxxxx.colyseus.cloud`)?

#### 5. Patikrinkite Endpoint:
Atidarykite browser:
```
https://de-fra-xxxxx.colyseus.cloud/health
```

Turėtumėte matyti:
```json
{"status":"ok"}
```

✅ **Jei matote `{"status":"ok"}`:** Serveris veikia!

---

## 🚀 Deployment Žingsniai

### Step 1: Patikrinkite Colyseus Server
1. Eikite į Colyseus Cloud Dashboard
2. Patikrinkite ar serveris veikia
3. Kopijuokite endpoint'ą (pvz: `https://de-fra-xxxxx.colyseus.cloud`)

### Step 2: Netlify Environment Variables
1. Eikite į Netlify Dashboard
2. Site settings → Environment variables
3. Patikrinkite/atnaujinkite:
   - `VITE_COLYSEUS_ENDPOINT` = jūsų Colyseus endpoint
   - `VITE_SUPABASE_URL` = jūsų Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = jūsų Supabase anon key

### Step 3: Deploy Frontend
1. Netlify Dashboard → Deploys
2. Spustelėkite **"Trigger deploy"** → **"Clear cache and deploy site"**
3. Palaukite, kol deployment baigsis (2-5 min)

### Step 4: Patikrinkite Deployment
1. Atidarykite deployed site
2. Patikrinkite browser console (F12)
3. Turėtumėte matyti:
   ```
   🔵 Attempting Colyseus connection first...
   ✅ Connected to Colyseus server...
   ✅ Using Colyseus as primary PvP system
   ```
   ARBA (jei Colyseus nepavyksta):
   ```
   ⚠️ Colyseus connection failed, falling back to Supabase
   ✅ Successfully entered Supabase lobby (fallback mode)
   ```

---

## ✅ Deployment Checklist

### Prieš Deploy'inti:
- [ ] Colyseus serveris deploy'intas ir veikia
- [ ] Colyseus endpoint gautas ir kopijuotas
- [ ] Netlify environment variables nustatyti:
  - [ ] `VITE_COLYSEUS_ENDPOINT`
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] Kodas push'intas į GitHub (jei naudojate auto-deploy)

### Po Deployment:
- [ ] Netlify deployment sėkmingas
- [ ] Site veikia (atidarykite browser)
- [ ] Browser console neturi error'ų
- [ ] Colyseus prisijungia (arba Supabase fallback veikia)
- [ ] PvP Online veikia

---

## 🔍 Troubleshooting

### Problema: "VITE_COLYSEUS_ENDPOINT not set"
**Sprendimas:** Pridėkite `VITE_COLYSEUS_ENDPOINT` į Netlify Environment Variables

### Problema: "Colyseus connection failed"
**Tai Normalus:** Sistema automatiškai perjungia į Supabase fallback. Patikrinkite:
- Ar Colyseus serveris veikia?
- Ar endpoint teisingas?

### Problema: "Failed to connect to Supabase"
**Sprendimas:** Patikrinkite:
- Ar `VITE_SUPABASE_URL` teisingas?
- Ar `VITE_SUPABASE_ANON_KEY` teisingas?

---

## 📝 Išvada

**Kodas paruoštas deploy'inti!** ✅

**Reikia tik:**
1. ✅ Patikrinti Colyseus Cloud deployment
2. ✅ Patikrinti Netlify Environment Variables
3. ✅ Deploy'inti frontend

**Sistema veiks su:**
- ✅ Colyseus kaip primary (jei veikia)
- ✅ Supabase kaip fallback (jei Colyseus nepavyksta)

**Galite daryti deploy!** 🚀


