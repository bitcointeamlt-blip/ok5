# 🚀 Deploy OK5 - Tikslus Planas

## ✅ Patvirtinta:
- ✅ Repository: `ok5`
- ✅ Kodas yra GitHub'e

---

## 🎯 Tikslus Planas

### Step 1: Patikrinkite Colyseus Cloud GitHub Connection

**Eikite į:** https://cloud.colyseus.io

1. **Prisijunkite**
2. **Pasirinkite aplikaciją** (`ok5`)
3. **Settings** → **GitHub Repository**

**Patikrinkite:**
- [ ] Ar repository susietas su `ok5`?
- [ ] Ar branch susietas su `main` arba `master`?

**Jei NĖRA susietas:**
- Spustelėkite **"Connect Repository"** arba **"Link with GitHub"**
- Pasirinkite `ok5` repository
- Pasirinkite branch `main` (arba `master`)
- **Save**

---

### Step 2: Patikrinkite Build Settings

**Colyseus Cloud → Settings → Build & Deployment:**

**Patikrinkite:**
- [ ] **Root Directory:** `colyseus-server` (be slash'ų!)
- [ ] **Build Command:** `npm run build` (jei Root Directory teisingas)
- [ ] **Start Command:** `npm start` (jei Root Directory teisingas)
- [ ] **Node Version:** `22` arba `20`

**Jei neteisingi:**
- Pakeiskite į teisingus
- **Save**

---

### Step 3: Deploy Colyseus Serveris

**Colyseus Cloud Dashboard:**

1. **Deployments** → **Deploy** (arba **Redeploy**)
2. **Palaukite 2-5 min**
3. **Patikrinkite Logs:**
   - Colyseus Cloud → **Logs**
   - Turėtumėte matyti:
     ```
     ✅ Server running on port XXXX
     ✅ Health check: http://localhost:XXXX/health
     ✅ Matchmaking: http://localhost:XXXX/matchmake
     [CORS] Matchmaking request from origin: ...
     ```

**✅ Jei matote CORS log'us:** Serveris deploy'intas su nauja versija!

---

### Step 4: Patikrinkite Ar Serveris Veikia

**Atidarykite browser:**
```
https://de-fra-f8820c12.colyseus.cloud/health
```

**Turėtumėte matyti:**
```json
{"status":"ok"}
```

✅ **Jei matote `{"status":"ok"}`:** Serveris veikia!

❌ **Jei matote "Service Unavailable":** 
- Patikrinkite Colyseus Cloud Logs
- Patikrinkite ar deployment sėkmingas

---

### Step 5: Pridėkite Netlify Environment Variable

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

### Step 6: Testuokite Frontend

**Atidarykite:** `https://jocular-zabaione-835b49.netlify.app`

**Browser Console (F12):**
- Turėtumėte matyti:
  ```
  🔵 Client endpoint: wss://de-fra-f8820c12.colyseus.cloud...
  ✅ Connected to Colyseus server, joining room...
  ✅ Successfully joined Colyseus room: xxxxx
  ```
- **NĖRA:**
  - ❌ CORS error'ų
  - ❌ "Service Unavailable" error'ų
  - ❌ "Room is null" error'ų

---

## 📋 Checklist

### Prieš Deploy:
- [x] ✅ Repository: `ok5`
- [x] ✅ Kodas yra GitHub'e
- [ ] ⚠️ Colyseus Cloud prijungtas prie GitHub `ok5` repo
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
1. Ar Colyseus Cloud prijungtas prie GitHub `ok5` repo?
2. Ar Build Settings teisingi?
3. Ar deployment sėkmingas? (Logs sekcija)
4. Ar `colyseus-server/` folderis yra GitHub'e?

### Netlify CORS Error

**Patikrinkite:**
1. Ar `VITE_COLYSEUS_ENDPOINT` nustatytas Netlify?
2. Ar Netlify redeploy'intas po environment variable pridėjimo?
3. Ar Colyseus serveris veikia? (`/health` endpoint)

---

## 🎯 Išvada

**Dabar reikia:**
1. Patikrinti ar Colyseus Cloud prijungtas prie GitHub `ok5` repo
2. Patikrinti ar Build Settings teisingi
3. Deploy'inti Colyseus serverį
4. Pridėti Netlify environment variable
5. Testuoti frontend

**Po to viskas veiks!** 🚀




