# 🔧 PORT Problema - Galutinis Sprendimas

## ❌ Problema

Colyseus Cloud serveris neveikia, nes:
1. **PORT nėra nustatytas** - Colyseus Cloud neperduoda PORT environment variable
2. **Fallback į 2567** - kodas naudoja portą 2567, kuris jau užimtas
3. **Serveris crash'ina** - dėl to CORS negali veikti

---

## ✅ Kas Padaryta

1. ✅ **Kodas pataisytas** - production'e neleidžia fallback į 2567
2. ✅ **Aiškesnės klaidos** - dabar matysite, ar PORT nustatytas
3. ✅ **Kompiliacija** - serveris kompiliuojasi be klaidų

---

## 🚀 Ką Daryti Dabar

### Step 1: Push Kodą į GitHub

```bash
git add .
git commit -m "Fix PORT handling - require PORT in production"
git push
```

---

### Step 2: Colyseus Cloud - Patikrinkite PORT

**Problema**: Colyseus Cloud neperduoda PORT environment variable.

**Sprendimas**: Reikia patikrinti Colyseus Cloud settings:

1. **Colyseus Cloud** → **Settings** → **Environment Variables**
2. Patikrinkite, ar yra **PORT** variable
3. **Jei nėra** - pridėkite:
   - **Name**: `PORT`
   - **Value**: Palikite **TUŠČIĄ** arba **NEPRIDĖKITE** (Colyseus Cloud turėtų automatiškai nustatyti)

**SVARBU**: Colyseus Cloud turėtų automatiškai nustatyti PORT. Jei neperduoda, tai gali būti Colyseus Cloud bug'as.

---

### Step 3: Alternatyvus Sprendimas - Naudoti @colyseus/tools

Jei Colyseus Cloud vis dar neperduoda PORT, galite naudoti `@colyseus/tools`:

**Instaliuokite**:
```bash
cd colyseus-server
npm install @colyseus/tools
```

**Pakeiskite `src/index.ts`**:
```typescript
import { listen } from "@colyseus/tools";
import app from "./app.config"; // Sukurkite app.config.ts

listen(app);
```

Bet tai reikalauja didesnių pakeitimų.

---

### Step 4: Redeploy

1. **Colyseus Cloud** → **Deployments** → **Redeploy**
2. Palaukite 2-5 minučių
3. Patikrinkite **Logs**

**Turėtumėte matyti**:
```
🔧 Starting server on port: XXXX (PORT env: XXXX, NODE_ENV: production)
✅ HTTP server is listening on port XXXX
✅ Colyseus server is running on port XXXX
```

**Jei vis dar matote**:
```
❌ PORT environment variable is not set!
💡 Colyseus Cloud should set PORT automatically.
```

Tai reiškia, kad Colyseus Cloud neperduoda PORT. Tokiu atveju:

---

## 🔧 Jei Colyseus Cloud Neperduoda PORT

### Option 1: Pridėkite PORT Rankiniu Būdu (NEREKOMENDUOJAMA)

1. **Colyseus Cloud** → **Settings** → **Environment Variables**
2. Pridėkite:
   - **Name**: `PORT`
   - **Value**: `8080` (arba kitą portą)

**PROBLEMA**: Tai gali neveikti, jei Colyseus Cloud jau naudoja kitą portą.

---

### Option 2: Naudokite Lokalų Serverį

Jei Colyseus Cloud vis dar neveikia, naudokite lokalų serverį:

1. **Paleiskite lokalų serverį**:
   ```bash
   cd colyseus-server
   npm run dev
   ```

2. **Atnaujinkite frontend `.env`**:
   ```env
   VITE_COLYSEUS_ENDPOINT=ws://localhost:2567
   ```

3. **Paleiskite frontend**:
   ```bash
   npm run dev
   ```

---

## 📋 Checklist

- [x] Kodas pataisytas (neleidžia fallback production'e)
- [ ] Kodas push'intas į GitHub
- [ ] Colyseus Cloud PORT patikrintas
- [ ] Redeploy padarytas
- [ ] Logs patikrinti (PORT turėtų būti nustatytas)
- [ ] Serveris veikia (`/health` endpoint)
- [ ] CORS veikia

---

## 💡 Pastabos

- **PORT**: Colyseus Cloud turėtų automatiškai nustatyti PORT. Jei neperduoda, tai gali būti Colyseus Cloud bug'as.
- **Fallback**: Production'e neleidžiama fallback į 2567 - PORT TURI būti nustatytas.
- **CORS**: CORS negali veikti, jei serveris neveikia (crash'ina dėl PORT problemos).

---

**Ar PORT yra nustatytas Colyseus Cloud'e?** Patikrinkite Environment Variables sekciją!


