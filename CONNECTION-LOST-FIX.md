# 🔧 Fix: Connection Lost Error

## ❌ Problema

Matau error'ą:
- `ERROR: Connection reset by 95.179.254.214 port 22`
- `Connection lost with server instance`

**Tai reiškia, kad serveris crash'ina arba neveikia.**

---

## 🔍 Priežastis

Serveris crash'ina dėl:
1. **PORT klaidos** - serveris negali start'inti
2. **Kodo klaidos** - serveris crash'ina iškart po start'o
3. **PM2 problema** - serveris niekada nepasileidžia

---

## ✅ Sprendimas

### Step 1: Patikrinkite Error Logs

1. **Colyseus Cloud** → **Endpoints** → **LOGS**
2. **Įjunkite "Show only errors" toggle** (jis jau įjungtas)
3. Scroll žemyn ir patikrinkite, ar yra error'ų
4. Kopijuokite visus error'us

---

### Step 2: Patikrinkite Application Logs

1. **Išjunkite "Show only errors" toggle**
2. Scroll žemyn ir patikrinkite application logs
3. Ieškokite:
   - `🔧 Starting server...`
   - `✅ HTTP server is listening...`
   - Arba PORT klaidos

---

### Step 3: Patikrinkite Kodą

Jei vis dar crash'ina, patikrinkite:

1. **Ar kodas push'intas į GitHub?**
   - GitHub → repository → patikrinkite `colyseus-server/src/index.ts`

2. **Ar build settings teisingi?**
   - Colyseus Cloud → Settings → Build & Deployment
   - Root Directory: `/colyseus-server/` arba `colyseus-server`
   - Build Command: `npm run build`

3. **Ar serveris veikia lokaliai?**
   ```bash
   cd colyseus-server
   npm run build
   npm start
   ```

---

## 🔧 Jei Vis Dar Crash'ina

### Option 1: REBOOT INSTANCE Dar Kartą

1. **Colyseus Cloud** → **Endpoints** tab
2. Spustelėkite **"REBOOT INSTANCE"** mygtuką
3. Palaukite 2-3 minučių
4. Patikrinkite logs

---

### Option 2: Push Naują Kodą

Jei kodas nepush'intas:

1. **GitHub Desktop** → Commit → Push
2. Commit message: `Fix server.listen() for PM2`
3. Palaukite automatinį deployment (2-5 min)
4. Patikrinkite logs

---

## 📋 Checklist

- [ ] Patikrinti error logs (toggle įjungtas)
- [ ] Patikrinti application logs (toggle išjungtas)
- [ ] Patikrinti, ar kodas push'intas
- [ ] Patikrinti build settings
- [ ] REBOOT INSTANCE (jei reikia)
- [ ] Patikrinti logs po reboot

---

## 💡 Pastabos

- **Connection lost**: Serveris crash'ina arba neveikia
- **Port 22**: SSH connection error - serveris nepasileidžia
- **Reikia patikrinti logs**: Ten turėtų būti aiškesnė klaidos priežastis

---

**Ar patikrinote error logs?** Kopijuokite visus error'us ir patikrinkite!

