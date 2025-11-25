# 🔧 Colyseus CORS Sprendimas - Detali Instrukcija

## ❌ Problema: CORS Error Vis Dar Egzistuoja

Console rodo:
```
Access to XMLHttpRequest at 'https://de-fra-f8820c12.colyseus.cloud/matchmake/joinOrCreate/pvp_room' 
from origin 'https://jocular-zabaione-835b49.netlify.app' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

**Problema:** Colyseus Cloud serveris neleidžia CORS request'ų iš Netlify domain.

---

## ✅ Sprendimas: 2 Variantai

### Option 1: Colyseus Cloud Dashboard CORS Settings (Pirmiausia Patikrinkite)

**Colyseus Cloud gali turėti savo CORS nustatymus, kurie override'ina serverio CORS.**

1. **Eikite į Colyseus Cloud Dashboard:**
   - https://cloud.colyseus.io
   - Prisijunkite
   - Pasirinkite savo aplikaciją

2. **Eikite į Settings:**
   - Ieškokite "CORS" arba "Security" arba "API" sekcijos
   - Patikrinkite, ar yra "Allowed Origins" arba "CORS Origins" laukelis

3. **Pridėkite Netlify Domain:**
   - Pridėkite: `https://jocular-zabaione-835b49.netlify.app`
   - ARBA pridėkite: `https://*.netlify.app` (visi Netlify domain'ai)
   - ARBA pasirinkite "Allow all origins" / "Allow *"

4. **Save ir Redeploy:**
   - Spustelėkite "Save"
   - Eikite į Deployments → Redeploy
   - Palaukite 2-5 min

---

### Option 2: Deploy Serveris su Atnaujinta CORS Konfigūracija

**Jei Colyseus Cloud neturi CORS settings UI:**

1. **Patikrinkite Ar CORS Konfigūracija Atnaujinta:**
   - `colyseus-server/src/index.ts` turėtų turėti:
     ```typescript
     app.use(cors({
       origin: true,
       credentials: true,
       methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
       allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
       exposedHeaders: ['Content-Length', 'Content-Type'],
       preflightContinue: false,
       optionsSuccessStatus: 204
     }));
     ```

2. **Commit → Push:**
   - GitHub Desktop → Commit message: `"Fix CORS configuration for Netlify"`
   - Commit to main → Push origin

3. **Deploy Serveris:**
   - Colyseus Cloud → Deployments → Deploy
   - Palaukite 2-5 min
   - Patikrinkite LOGS

---

## 🔍 Patikrinimas

### Step 1: Patikrinkite Server Logs

**Colyseus Cloud → Deployments → LOGS:**

Turėtų rodyti:
- ✅ `Server running on port XXXX`
- ✅ Nėra CORS error'ų
- ✅ Serveris start'ina sėkmingai

### Step 2: Patikrinkite Browser Console

Po serverio redeploy:

**Turėtų rodyti:**
- ✅ `Colyseus client initialized: wss://de-fra-f8820c12.colyseus.cloud`
- ✅ `Entered PvP Online lobby`
- ✅ Nėra CORS error'ų

**NE turėtų rodyti:**
- ❌ `Access to XMLHttpRequest... blocked by CORS policy`
- ❌ `Failed to join Colyseus room`
- ❌ `Failed to connect to Colyseus server`

### Step 3: Patikrinkite Network Tab

**DevTools → Network:**

1. **Raskite `matchmake/joinOrCreate/pvp_room` request**
2. **Patikrinkite Response Headers:**
   - Turėtų rodyti: `Access-Control-Allow-Origin: *` arba `Access-Control-Allow-Origin: https://jocular-zabaione-835b49.netlify.app`
   - Turėtų rodyti: `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
   - Turėtų rodyti: `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With`

---

## 🔧 Troubleshooting

### Problema: Colyseus Cloud Neturi CORS Settings UI

**Sprendimas:**
- Deploy'inkite serverį su atnaujinta CORS konfigūracija
- `origin: true` turėtų leisti visus origins

### Problema: Serveris Vis Dar Neleidžia CORS

**Sprendimas:**
1. Patikrinkite, ar serveris deploy'intas su nauja CORS konfigūracija
2. Patikrinkite server logs - ar yra CORS error'ų?
3. Patikrinkite, ar `cors` package įdiegtas: `npm install cors`

### Problema: CORS Veikia Lokaliai, Bet Ne Ant Netlify

**Sprendimas:**
- Netlify naudoja HTTPS, todėl Colyseus turėtų naudoti `wss://` (WebSocket Secure)
- Patikrinkite, ar `VITE_COLYSEUS_ENDPOINT` naudoja `https://` arba `wss://`

---

## 📋 Checklist

- [ ] Colyseus Cloud Dashboard → Settings → CORS settings patikrinti
- [ ] Netlify domain pridėtas į allowed origins (jei yra CORS settings UI)
- [ ] Server CORS konfigūracija atnaujinta (`colyseus-server/src/index.ts`)
- [ ] Server commit'intas ir push'intas į GitHub
- [ ] Server deploy'intas Colyseus Cloud
- [ ] Server logs rodo sėkmingą start'ą
- [ ] Browser console NE rodo CORS error
- [ ] Network tab rodo CORS headers

---

## 💡 Svarbiausia

**Colyseus Cloud gali turėti savo CORS nustatymus, kurie override'ina serverio CORS konfigūraciją.**

**Pirmiausia patikrinkite Colyseus Cloud Dashboard CORS settings!**

Jei jų nėra, deploy'inkite serverį su atnaujinta CORS konfigūracija.

---

**Ar patikrinote Colyseus Cloud Dashboard CORS settings?**

