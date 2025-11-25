# 🔧 Fix Server Start - Service Unavailable

## ❌ Problema: Service Unavailable

Serveris vis dar nepasileidžia. Problema gali būti:
1. **Start Command** nėra nustatytas Colyseus Cloud'e
2. **Serveris crash'ina** iškart po start'o
3. **HTTP server** nepasileidžia prieš Colyseus

---

## ✅ Sprendimas: Pakeista Serverio Start Logika

Pakeičiau `colyseus-server/src/index.ts`:
- Dabar **HTTP server** start'ina pirmas
- Po to **Colyseus server** start'ina ant HTTP serverio

**Kas pasikeitė**:
- `server.listen(PORT)` pirmas
- Po to `gameServer.listen(PORT)`

---

## 📋 Kitas Žingsnis: Commit → Push → Deploy

### Step 1: Commit ir Push

1. **GitHub Desktop** → Commit → Push
2. Arba terminal:
   ```bash
   git add colyseus-server/src/index.ts
   git commit -m "Fix server start order"
   git push
   ```

### Step 2: Patikrinkite Build & Deployment Settings

**Colyseus Cloud** → Settings → Build & Deployment:

**Jei yra Start Command laukelis**:
- Start Command: `npm start`

**Jei nėra Start Command laukelio**:
- Colyseus Cloud naudoja `ecosystem.config.js` (jau sukurtas)

### Step 3: Deploy

1. **Colyseus Cloud** → Deployments tab
2. Spustelėkite **"Deploy"** arba **"Redeploy"**
3. Palaukite 2-5 min
4. Patikrinkite **LOGS**

---

## 🔍 Troubleshooting: Patikrinkite Logs

**SVARBIAUSIA**: Patikrinkite logs Colyseus Cloud'e!

1. **Colyseus Cloud** → Endpoints tab
2. Spustelėkite **"LOGS"** mygtuką
3. Patikrinkite:
   - Ar yra "HTTP server is listening" pranešimas?
   - Ar yra "Colyseus server is running" pranešimas?
   - Ar yra error messages?

---

## 💡 Alternatyvus Sprendimas: Start Command

Jei vis dar neveikia, patikrinkite, ar yra **Start Command** laukelis:

**Colyseus Cloud** → Settings → Build & Deployment:
- Scroll iki **"Deployment"** sekcijos
- Patikrinkite, ar yra **Start Command** laukelis

**Jei yra**:
- Start Command: `npm start` (jei Root Directory: `/colyseus-server/`)

**Jei nėra**:
- Colyseus Cloud naudoja `ecosystem.config.js`

---

## ✅ Checklist

- [x] Serverio start logika pakeista
- [ ] Commit → Push į GitHub
- [ ] Patikrinkite Start Command (jei yra)
- [ ] Deployment padarytas
- [ ] Logs patikrinti
- [ ] Serveris veikia (`/health` endpoint)

---

**Ar padarėte commit ir push? Ar patikrinote logs Colyseus Cloud'e?**

