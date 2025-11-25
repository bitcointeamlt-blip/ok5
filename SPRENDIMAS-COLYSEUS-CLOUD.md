# ✅ Sprendimas: Colyseus Cloud Serveris Neveikia

## 🎯 Situacija

- ✅ Lokalus serveris veikia puikiai
- ❌ Colyseus Cloud serveris neveikia patikimai
- ❌ Vieną kartą pasileido, bet dabar nebeveikia

---

## 🔍 Greitas Patikrinimas

### 1. Patikrinkite, Ar Serveris Veikia

Atidarykite naršyklėje:
```
https://de-fra-f8820c12.colyseus.cloud/health
```

**Jei matote `{"status":"ok"}`:**
- ✅ Serveris VEIKIA - problema gali būti CORS arba frontend

**Jei matote klaidą:**
- ❌ Serveris NEVEIKIA - reikia atstatyti

---

## ✅ Sprendimas 1: Atstatyti Colyseus Cloud Serverį

### Step 1: Patikrinkite Colyseus Cloud Logs

1. **Eikite į:** https://cloud.colyseus.io
2. **Prisijunkite** ir pasirinkite savo aplikaciją
3. **Eikite į:** **"Endpoints"** tab
4. **Spustelėkite:** **"LOGS"** mygtuką
5. **Išjunkite:** "Show only errors" toggle (OFF)
6. **Refresh'inkite:** F5

**Ieškokite:**
- ❌ Crash error'ų
- ❌ "Uncaught Exception"
- ❌ "EADDRINUSE" (portas užimtas)
- ❌ "Failed to start"

---

### Step 2: Reboot Instance

1. **Colyseus Cloud** → **Endpoints** tab
2. **Ieškokite:** **"RESTART"** arba **"REBOOT"** mygtuko
3. **Spustelėkite** ir palaukite 1-2 minutes
4. **Patikrinkite:** Ar serveris dabar veikia?

---

### Step 3: Redeploy Serveris

Jei reboot nepadėjo:

1. **Colyseus Cloud** → **Deployments** tab
2. **Spustelėkite:** **"Redeploy"** arba **"Deploy"**
3. **Palaukite:** 2-5 minutes
4. **Patikrinkite:** Ar serveris dabar veikia?

---

### Step 4: Patikrinkite Build Settings

Jei vis dar neveikia:

1. **Colyseus Cloud** → **Settings** tab
2. **Patikrinkite:**
   - **Root Directory:** `colyseus-server`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Node Version:** `22` (arba `20`)

---

### Step 5: Commit → Push Naują Kodą

Jei vis dar neveikia:

1. **Patikrinkite, ar kodas commit'intas:**
   ```powershell
   git status
   ```

2. **Jei yra necommit'intų pakeitimų:**
   ```powershell
   git add colyseus-server/src/index.ts
   git commit -m "Fix CORS - add matchMaker.controller.getCorsHeaders override"
   git push origin main
   ```

3. **Palaukite:** Colyseus Cloud automatiškai deploy'ins (2-5 min)

---

## 🎯 Alternatyvus Sprendimas: Lokalus Serveris + ngrok

Jei Colyseus Cloud vis dar neveikia, naudokite lokalų serverį su ngrok:

### Step 1: Instaliuokite ngrok

1. **Eikite į:** https://ngrok.com
2. **Sign up** (nemokamas)
3. **Download** ngrok
4. **Extract** į bet kokį folder'į (pvz: `C:\ngrok\`)

### Step 2: Paleiskite Colyseus Serverį Lokaliai

**Terminal 1:**
```powershell
cd colyseus-server
npm run dev
```

Turėtumėte matyti:
```
✅ Server running on port 2567
```

### Step 3: Paleiskite ngrok Tunnel

**Terminal 2 (naujas terminal):**
```powershell
# Jei ngrok yra C:\ngrok\ngrok.exe
C:\ngrok\ngrok.exe http 2567
```

Turėtumėte matyti:
```
Forwarding  https://xxxx-xx-xx-xx-xx.ngrok-free.app -> http://localhost:2567
```

**Kopijuokite:** `https://xxxx-xx-xx-xx-xx.ngrok-free.app`

### Step 4: Atnaujinkite Netlify Environment Variable

1. **Netlify** → **Site Settings** → **Environment Variables**
2. **Redaguokite:** `VITE_COLYSEUS_ENDPOINT`
3. **Value:** `https://xxxx-xx-xx-xx-xx.ngrok-free.app` (iš ngrok)
4. **Save**
5. **Redeploy** Netlify

**SVARBU:**
- ngrok nemokamas planas keičia URL kiekvieną kartą
- Reikia atnaujinti Netlify environment variable kiekvieną kartą
- Arba naudokite ngrok paid plan (fiksuotas URL)

---

## 📋 Checklist

- [ ] Patikrinta `/health` endpoint
- [ ] Patikrinti Colyseus Cloud logs
- [ ] Bandytas reboot instance
- [ ] Bandytas redeploy
- [ ] Patikrinti build/start commands
- [ ] Commit → push naują kodą
- [ ] Arba naudoti lokalų serverį + ngrok

---

## 💡 Svarbiausia

**Colyseus Cloud serveris turi būti:**
1. ✅ Deploy'intas su teisingais build/start commands
2. ✅ Veikti (rodo `{"status":"ok"}` `/health` endpoint'e)
3. ✅ Turėti CORS konfigūraciją (jau pridėta kode)

**Jei vis dar neveikia:**
- Patikrinkite Colyseus Cloud logs - ten bus konkretus error'as
- Arba naudokite lokalų serverį + ngrok kaip alternatyvą


