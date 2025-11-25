# 🔍 Colyseus Cloud Diagnostika - Paprastas Sprendimas

## ❌ Problema

- ✅ Lokalus serveris veikia puikiai
- ❌ Colyseus Cloud serveris neveikia patikimai
- ❌ Vieną kartą pasileido, bet dabar nebeveikia
- ❌ Po update nutrūko ryšys

---

## 🔍 Step 1: Patikrinkite Serverio Status

### 1.1 Patikrinkite Health Endpoint

Atidarykite naršyklėje:
```
https://de-fra-f8820c12.colyseus.cloud/health
```

**Jei matote `{"status":"ok"}`:**
- ✅ Serveris VEIKIA
- Problema gali būti CORS arba frontend konfigūracija

**Jei matote "Service Unavailable" arba "ERR_CONNECTION_REFUSED":**
- ❌ Serveris NEVEIKIA
- Reikia patikrinti Colyseus Cloud logs

---

### 1.2 Patikrinkite Colyseus Cloud Logs

1. **Eikite į:** https://cloud.colyseus.io
2. **Prisijunkite** ir pasirinkite savo aplikaciją
3. **Eikite į:** **"Endpoints"** tab
4. **Spustelėkite:** **"LOGS"** mygtuką (šalia instance)
5. **Išjunkite:** "Show only errors" toggle (OFF)
6. **Refresh'inkite:** F5

**Patikrinkite:**
- ✅ Ar yra `✅ Server running on port 2567`?
- ❌ Ar yra crash error'ų?
- ❌ Ar yra "Uncaught Exception" arba "Unhandled Rejection"?
- ❌ Ar yra "EADDRINUSE" (portas užimtas)?

---

## ✅ Step 2: Sprendimai

### Sprendimas 1: Reboot Instance (Pirmiausia Bandykite)

1. **Colyseus Cloud** → **Endpoints** tab
2. **Ieškokite:** **"RESTART"** arba **"REBOOT"** mygtuko
3. **Spustelėkite** ir palaukite 1-2 minutes
4. **Patikrinkite:** Ar serveris dabar veikia? (`/health` endpoint)

---

### Sprendimas 2: Redeploy Serveris

1. **Colyseus Cloud** → **Deployments** tab
2. **Spustelėkite:** **"Redeploy"** arba **"Deploy"**
3. **Palaukite:** 2-5 minutes
4. **Patikrinkite:** Ar serveris dabar veikia?

---

### Sprendimas 3: Patikrinkite Build/Start Commands

1. **Colyseus Cloud** → **Settings** tab
2. **Patikrinkite Build Configuration:**
   - **Root Directory:** `colyseus-server` (jei serveris yra subfolder'yje)
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Node Version:** `22` (arba `20`)

**SVARBU:**
- Jei repository root'e yra `colyseus-server/` folder'is → **Root Directory = `colyseus-server`**
- Jei serveris yra repository root'e → **Root Directory = tuščias**

---

### Sprendimas 4: Commit → Push Naują Kodą

Jei serveris vis dar neveikia po reboot/redeploy:

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

3. **Palaukite:** Colyseus Cloud automatiškai deploy'ins naują versiją (2-5 min)

---

## 🎯 Alternatyvus Sprendimas: Lokalus Serveris + ngrok

Jei Colyseus Cloud vis dar neveikia, galite naudoti lokalų serverį su ngrok:

### Step 1: Instaliuokite ngrok

1. **Eikite į:** https://ngrok.com
2. **Sign up** (nemokamas)
3. **Download** ngrok
4. **Extract** į bet kokį folder'į

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
- ngrok nemokamas planas keičia URL kiekvieną kartą, kai paleidžiate ngrok
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


