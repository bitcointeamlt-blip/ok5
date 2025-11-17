# 🔍 GILIOJI PROJEKTO ANALIZĖ IR ONLINE PALEIDIMAS

## 📋 PROJEKTO STRUKTŪRA

### Kas yra šis projektas?
Tai **multiplayer PvP žaidimas** (DOT Clicker), kuris naudoja:
- **Frontend**: Vite + TypeScript (žaidimo klientas)
- **Backend**: Colyseus server (multiplayer serveris)
- **Database**: Supabase (žaidėjų profiliai, statistika)

### Pagrindiniai komponentai:

#### 1. Frontend (`/src/`)
- `simple-main.ts` - pagrindinis žaidimo kodas
- `services/ColyseusService.ts` - Colyseus serverio ryšys
- `services/PvPSyncService.ts` - PvP sinchronizacija
- `index.html` - pagrindinis HTML failas

#### 2. Backend (`/colyseus-server/`)
- `src/index.ts` - Colyseus serverio startas
- `src/rooms/GameRoom.ts` - žaidimo kambario logika
- `src/schema/GameState.ts` - žaidimo būsenos schema

#### 3. Konfigūracija
- `package.json` - frontend dependencies
- `colyseus-server/package.json` - backend dependencies
- `vite.config.ts` - Vite build konfigūracija
- `netlify.toml` - Netlify deployment konfigūracija

---

## 🔧 KAIP VEIKIA ŽAIDIMAS

### Lokalus veikimas:
1. **Frontend** paleidžiamas: `npm run dev` → `http://localhost:7000`
2. **Backend** paleidžiamas: `cd colyseus-server && npm run dev` → `ws://localhost:2567`
3. Frontend prisijungia prie backend per WebSocket

### Online veikimas:
1. **Frontend** deploy'inamas į **Netlify**
2. **Backend** deploy'inamas į **Colyseus Cloud**
3. Frontend turi žinoti backend URL per `VITE_COLYSEUS_ENDPOINT` environment variable

---

## ⚠️ SVARBIAUSIOS PROBLEMOS IR SPRENDIMAI

### Problema 1: Colyseus Server Nėra Deploy'intas

**Simptomai:**
- Frontend negali prisijungti prie serverio
- Console rodo: "Failed to connect to Colyseus server"
- `VITE_COLYSEUS_ENDPOINT` nėra nustatytas

**Sprendimas:**
1. Deploy'inti Colyseus server į Colyseus Cloud
2. Gauti serverio endpoint (pvz: `https://de-fra-xxxxx.colyseus.cloud`)
3. Nustatyti `VITE_COLYSEUS_ENDPOINT` Netlify environment variables

---

### Problema 2: Environment Variables Neteisingai Nustatyti

**Simptomai:**
- Build logs nerodo `VITE_COLYSEUS_ENDPOINT`
- Browser console rodo: "Colyseus not configured"

**Sprendimas:**
1. Netlify Dashboard → Site Settings → Environment Variables
2. Pridėti: `VITE_COLYSEUS_ENDPOINT` = `https://de-fra-xxxxx.colyseus.cloud`
3. Redeploy frontend

---

### Problema 3: CORS Klaidos

**Simptomai:**
- Browser console rodo CORS errors
- WebSocket connection fails

**Sprendimas:**
- Colyseus server jau turi CORS konfigūraciją (`colyseus-server/src/index.ts`)
- Jei vis dar yra problemų, patikrinkite Colyseus Cloud logs

---

## 🚀 PILNAS ONLINE PALEIDIMO VADOVAS

### STEP 1: Paruoškite Colyseus Server Deployment

#### 1.1. Patikrinkite, kad serveris kompiliuojasi:

```bash
cd colyseus-server
npm install
npm run build
```

**Turėtų sukurti:** `colyseus-server/build/` folderį su kompiliuotais failais

#### 1.2. Patikrinkite GitHub:

```bash
# Patikrinkite, ar colyseus-server/ folderis yra GitHub'e
git status
git add colyseus-server/
git commit -m "Prepare Colyseus server for deployment"
git push
```

**SVARBU:** `colyseus-server/` folderis TURĖTŲ būti GitHub repository!

---

### STEP 2: Deploy Colyseus Server į Colyseus Cloud

#### 2.1. Prisijunkite prie Colyseus Cloud:

1. Eikite į: **https://cloud.colyseus.io**
2. Prisijunkite su savo account'u
3. Sukurkite naują aplikaciją arba pasirinkite esamą

#### 2.2. Susiekite su GitHub:

1. Spustelėkite **"LINK WITH GITHUB"**
2. Pasirinkite savo repository (`pvp03-new`)
3. Pasirinkite branch (`main` arba `master`)

#### 2.3. Nustatykite Build Settings:

**Build Command:**
```
cd colyseus-server && npm install && npm run build
```

**Start Command:**
```
cd colyseus-server && npm start
```

**Root Directory:**
```
colyseus-server
```

**Node Version:**
```
22
```
(arba `20` jei 22 neveikia)

#### 2.4. Deploy:

1. Spustelėkite **"Deploy"** arba **"Redeploy"**
2. Palaukite, kol deployment baigsis (2-5 min)
3. Gausite endpoint (pvz: `https://de-fra-xxxxx.colyseus.cloud`)

#### 2.5. Patikrinkite Serverio Veikimą:

Atidarykite naršyklėje:
```
https://de-fra-xxxxx.colyseus.cloud/health
```

**Turėtumėte matyti:** `{"status":"ok"}`

Jei matote error - patikrinkite Colyseus Cloud logs!

---

### STEP 3: Deploy Frontend į Netlify

#### 3.1. Paruoškite Frontend:

```bash
# Root folderyje
npm install
npm run build
```

**Turėtų sukurti:** `dist/` folderį su build'uotais failais

#### 3.2. Netlify Dashboard:

1. Eikite į: **https://app.netlify.com**
2. Prisijunkite
3. Pasirinkite site arba sukurkite naują

#### 3.3. Nustatykite Build Settings:

**Build Command:**
```
npm install && npm run build
```

**Publish Directory:**
```
dist
```

**ARBA** naudokite `netlify.toml` (jis jau turi teisingus nustatymus)

#### 3.4. Pridėkite Environment Variables:

1. Netlify Dashboard → **Site Settings** → **Environment Variables**
2. Spustelėkite **"Add variable"**
3. **Key:** `VITE_COLYSEUS_ENDPOINT`
4. **Value:** jūsų Colyseus endpoint (pvz: `https://de-fra-xxxxx.colyseus.cloud`)
5. **Scope:** Production, Preview, Deploy Previews (visi)
6. Spustelėkite **"Save"**

**SVARBU:** 
- Key turi būti tiksliai `VITE_COLYSEUS_ENDPOINT` (be tarpų!)
- Value turi būti `https://` (ne `wss://` - ColyseusService automatiškai konvertuoja)

#### 3.5. Deploy:

**Variantas A: Git Integration (Rekomenduojama)**
1. Netlify → **Site Settings** → **Build & deploy**
2. **Connect to Git provider**
3. Pasirinkite repository
4. Netlify automatiškai deploy'ins kiekvieną push

**Variantas B: Manual Deploy**
1. Netlify → **Deploys** → **Trigger deploy**
2. Pasirinkite **"Clear cache and deploy site"**
3. Įkelkite ZIP failą arba drag & drop `dist/` folderį

#### 3.6. Patikrinkite Build Logs:

Po deployment, patikrinkite build logs:

**Turėtumėte matyti:**
- ✅ Build command: `npm install && npm run build`
- ✅ Environment variables: `VITE_COLYSEUS_ENDPOINT` (masked)
- ✅ Build output: `dist/assets/index-[HASH].js`
- ✅ Deploy status: `Site is live ✨`

---

### STEP 4: Testuokite Online

#### 4.1. Atidarykite Žaidimą:

1. Atidarykite Netlify URL (pvz: `https://your-site.netlify.app`)
2. Atidarykite Browser Console (F12)
3. Patikrinkite Console logs

#### 4.2. Patikrinkite Console:

**Turėtumėte matyti:**
```
🔍 Environment check: { hasEnv: true, endpoint: "https://de-fra-..." }
🔵 Colyseus endpoint found: https://de-fra-...
✅ Colyseus client initialized: wss://de-fra-...
```

**Jei matote:**
```
⚠️ VITE_COLYSEUS_ENDPOINT not set, using default localhost
```
→ Environment variable nėra nustatytas Netlify!

#### 4.3. Testuokite PvP Prisijungimą:

1. Prisijunkite su Ronin Wallet
2. Pasirinkite **"PvP Online"**
3. Turėtumėte prisijungti prie Colyseus room
4. Kai 2 žaidėjai prisijungia, turėtų pradėti žaidimą

---

## 🔍 TROUBLESHOOTING

### Problema: "Failed to connect to Colyseus server"

**Patikrinkite:**
1. ✅ Ar Colyseus server deploy'intas? (`/health` endpoint)
2. ✅ Ar `VITE_COLYSEUS_ENDPOINT` nustatytas Netlify?
3. ✅ Ar endpoint formatas teisingas? (`https://` ne `wss://`)
4. ✅ Ar build logs rodo environment variable?

**Sprendimas:**
1. Patikrinkite Colyseus Cloud → Deployments → Status
2. Patikrinkite Netlify → Environment Variables
3. Redeploy frontend po environment variable pakeitimo

---

### Problema: "Colyseus not configured"

**Priežastis:** `VITE_COLYSEUS_ENDPOINT` nėra nustatytas

**Sprendimas:**
1. Netlify → Site Settings → Environment Variables
2. Pridėkite `VITE_COLYSEUS_ENDPOINT` su Colyseus endpoint
3. Redeploy

---

### Problema: Build logs nerodo environment variable

**Priežastis:** Netlify cache arba neteisingas variable name

**Sprendimas:**
1. Patikrinkite, ar variable name tiksliai `VITE_COLYSEUS_ENDPOINT`
2. Išvalykite cache: "Clear cache and deploy site"
3. Redeploy

---

### Problema: Serveris neveikia Colyseus Cloud

**Patikrinkite:**
1. Colyseus Cloud → Deployments → Logs
2. Ar build command teisingas?
3. Ar start command teisingas?
4. Ar Node version teisingas?

**Sprendimas:**
1. Patikrinkite build logs Colyseus Cloud
2. Patikrinkite, ar `colyseus-server/` folderis yra GitHub'e
3. Patikrinkite build/start commands

---

## 📋 DEPLOYMENT CHECKLIST

### Colyseus Server:
- [ ] Serveris kompiliuojasi (`npm run build`)
- [ ] `colyseus-server/` folderis yra GitHub'e
- [ ] Colyseus Cloud susietas su GitHub
- [ ] Build settings nustatyti (build command, start command, root directory)
- [ ] Deployment sėkmingas
- [ ] Endpoint gautas (`https://de-fra-xxxxx.colyseus.cloud`)
- [ ] `/health` endpoint veikia

### Frontend:
- [ ] Frontend build'inasi (`npm run build`)
- [ ] Netlify susietas su GitHub (arba manual deploy)
- [ ] Build settings nustatyti (build command, publish directory)
- [ ] `VITE_COLYSEUS_ENDPOINT` pridėtas į Environment Variables
- [ ] Environment variable value = Colyseus endpoint
- [ ] Deployment sėkmingas
- [ ] Build logs rodo environment variable
- [ ] Browser console rodo sėkmingą prisijungimą

### Testavimas:
- [ ] Žaidimas atsidaro Netlify URL
- [ ] Browser console nerodo error'ų
- [ ] Colyseus client inicializuojasi
- [ ] PvP prisijungimas veikia
- [ ] 2 žaidėjai gali prisijungti ir žaisti

---

## 🎯 GREITAS START (Jei Viskas Jau Paruošta)

### Jei Colyseus Server Jau Deploy'intas:

1. **Gaukite Colyseus endpoint:**
   - Colyseus Cloud → Deployments → Copy endpoint

2. **Pridėkite į Netlify:**
   - Netlify → Site Settings → Environment Variables
   - Key: `VITE_COLYSEUS_ENDPOINT`
   - Value: jūsų endpoint
   - Save

3. **Redeploy Frontend:**
   - Netlify → Deploys → Trigger deploy
   - Pasirinkite "Clear cache and deploy site"

4. **Testuokite:**
   - Atidarykite žaidimą
   - Patikrinkite browser console
   - Testuokite PvP prisijungimą

---

## 📞 PAGALBA

Jei vis dar yra problemų:

1. **Patikrinkite Logs:**
   - Colyseus Cloud → Deployments → Logs
   - Netlify → Deploys → Build logs
   - Browser Console (F12)

2. **Patikrinkite Konfigūraciją:**
   - Ar `VITE_COLYSEUS_ENDPOINT` nustatytas?
   - Ar endpoint formatas teisingas?
   - Ar serveris veikia?

3. **Kreipkitės į Support:**
   - Colyseus Cloud support (jei serverio problemos)
   - Netlify support (jei frontend problemos)

---

## ✅ SĖKMINGAS DEPLOYMENT TURĖTŲ RODYTI:

1. ✅ Colyseus server veikia (`/health` endpoint)
2. ✅ Frontend deploy'intas Netlify
3. ✅ `VITE_COLYSEUS_ENDPOINT` nustatytas
4. ✅ Browser console rodo sėkmingą prisijungimą
5. ✅ PvP prisijungimas veikia
6. ✅ 2 žaidėjai gali žaisti kartu

---

## 🎮 GALUTINIS REZULTATAS

Po sėkmingo deployment:

- **Frontend:** `https://your-site.netlify.app`
- **Backend:** `https://de-fra-xxxxx.colyseus.cloud`
- **Žaidimas:** Veikia online, multiplayer PvP funkcionalumas veikia

**Sveikiname! Žaidimas dabar veikia online! 🎉**



