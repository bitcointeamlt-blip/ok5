# 🚀 Final Deployment Plan - Pagal OK05 Dokumentus

## 📊 Dabartinė Situacija

### ✅ Kas Jau Padaryta:
- ✅ **Lokalus kodas** paruoštas teisingai (`pvp03-new/colyseus-server/`)
- ✅ **CORS konfigūracija** pataisyta (leidžia visus origin'us)
- ✅ **Source kodas** teisingas (`src/index.ts`, `src/rooms/GameRoom.ts`)
- ✅ **PM2 konfigūracija** teisinga (`ecosystem.config.js`)
- ✅ **Build komandos** teisingos (`package.json`)

### ❌ Kas Neveikia:
- ❌ **Colyseus Cloud** grąžina "Service Unavailable"
- ❌ **Netlify** neturi `VITE_COLYSEUS_ENDPOINT` environment variable (pagal OK05 dokumentus)

---

## 🎯 Tikslus Planas

### 1️⃣ Patikrinkite GitHub Repository

**Klausimas:** Ar projektas (`pvp03-new`) yra GitHub'e?

**Jei TAIP:**
- Repository pavadinimas: `ok05` arba `ok5`?
- Branch: `main` arba `master`?
- Ar `colyseus-server/` folderis yra Git'e?

**Jei NE:**
- Reikia push'inti kodą į GitHub

---

### 2️⃣ Patikrinkite Colyseus Cloud Konfigūraciją

**Eikite į:** https://cloud.colyseus.io

**Patikrinkite:**
1. **Aplikacijos pavadinimas:** `ok5` arba `ok05`?
2. **GitHub Connection:**
   - Ar prijungtas prie GitHub repository?
   - Repository: `ok05` arba `ok5`?
   - Branch: `main` arba `master`?
3. **Build Settings:**
   - **Root Directory:** `colyseus-server` (be slash'ų!)
   - **Build Command:** `npm run build` (jei Root Directory teisingas)
   - **Start Command:** `npm start` (jei Root Directory teisingas)
   - **Node Version:** `22` arba `20`

---

### 3️⃣ Deploy Colyseus Serveris

#### Option A: GitHub Auto-Deploy (Rekomenduojama)

**Jei Colyseus Cloud prijungtas prie GitHub:**

1. **Patikrinkite ar kodas yra GitHub'e:**
   - Eikite į: `https://github.com/bitcointeamlt-blip/ok5` (arba jūsų repo)
   - Patikrinkite ar `colyseus-server/` folderis yra

2. **Colyseus Cloud Dashboard:**
   - **Deployments** → **Deploy** (arba **Redeploy**)
   - Palaukite 2-5 min

3. **Patikrinkite Logs:**
   - Colyseus Cloud → **Logs**
   - Turėtumėte matyti:
     ```
     ✅ Server running on port XXXX
     [CORS] Matchmaking request from origin: ...
     ```

#### Option B: Manual Deploy (Jei GitHub neveikia)

1. **Build serveris lokaliai:**
   ```powershell
   cd colyseus-server
   npm install
   npm run build
   ```

2. **Zip failai:**
   - Zip `colyseus-server/build/` folderį
   - Zip `colyseus-server/package.json`
   - Zip `colyseus-server/ecosystem.config.js`
   - Zip `colyseus-server/Procfile`

3. **Colyseus Cloud Dashboard:**
   - **Deployments** → **Upload**
   - Upload zip file
   - Palaukite 2-5 min

---

### 4️⃣ Patikrinkite Ar Serveris Veikia

**Atidarykite browser:**
```
https://de-fra-f8820c12.colyseus.cloud/health
```

**Turėtumėte matyti:**
```json
{"status":"ok"}
```

✅ **Jei matote `{"status":"ok"}`:** Serveris veikia!

❌ **Jei matote "Service Unavailable":** Serveris neveikia - reikia deploy'inti!

---

### 5️⃣ Pridėkite Netlify Environment Variable

**Eikite į:** https://app.netlify.com

1. **Pasirinkite site:** `jocular-zabaione-835b49`
2. **Site settings** → **Environment variables**
3. **Add variable:**
   - **Key:** `VITE_COLYSEUS_ENDPOINT`
   - **Value:** `https://de-fra-f8820c12.colyseus.cloud`
   - **Save**

4. **Redeploy:**
   - **Deploys** → **Trigger deploy** → **Clear cache and deploy site**
   - Palaukite 2-5 min

---

### 6️⃣ Patikrinkite Frontend

**Atidarykite:** `https://jocular-zabaione-835b49.netlify.app`

**Browser Console (F12):**
- Turėtumėte matyti:
  ```
  ✅ Connected to Colyseus server...
  ✅ Successfully joined Colyseus room
  ```
- **NĖRA:**
  - ❌ CORS error'ų
  - ❌ "Service Unavailable" error'ų

---

## 📋 Checklist

### Prieš Deploy:
- [ ] ⚠️ Kodas push'intas į GitHub (`ok05` arba `ok5` repo)
- [ ] ⚠️ Colyseus Cloud prijungtas prie GitHub repo
- [ ] ⚠️ Colyseus Cloud Build Settings teisingi

### Po Deploy:
- [ ] ⚠️ Colyseus Cloud serveris veikia (`/health` grąžina `{"status":"ok"}`)
- [ ] ⚠️ Colyseus Cloud logs rodo CORS log'us
- [ ] ⚠️ Netlify turi `VITE_COLYSEUS_ENDPOINT` environment variable
- [ ] ⚠️ Frontend prisijungia be error'ų

---

## 🔍 Troubleshooting

### Colyseus Cloud "Service Unavailable"

**Patikrinkite:**
1. Ar kodas yra GitHub'e?
2. Ar Colyseus Cloud prijungtas prie GitHub repo?
3. Ar Build Settings teisingi?
4. Ar deployment sėkmingas? (Logs sekcija)

### Netlify CORS Error

**Patikrinkite:**
1. Ar `VITE_COLYSEUS_ENDPOINT` nustatytas Netlify?
2. Ar Netlify redeploy'intas po environment variable pridėjimo?
3. Ar Colyseus serveris veikia? (`/health` endpoint)

---

## 🎯 Išvada

**Dabar reikia:**
1. Patikrinti ar kodas yra GitHub'e (`ok05` arba `ok5` repo)
2. Patikrinti ar Colyseus Cloud prijungtas prie GitHub
3. Deploy'inti Colyseus serverį
4. Pridėti Netlify environment variable
5. Testuoti frontend

**Po to viskas veiks!** 🚀















