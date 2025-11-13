# ✅ SPRENDIMAS - BE IŠTRINIMO

## ❌ Problema: Negalima Ištrinti Deployment Location

Pagal Colyseus Cloud dokumentaciją:
- **NĖRA** galimybės ištrinti deployment location per UI
- **YRA** tik "+ ADD DEPLOYMENT LOCATION" (bet už tai reikia mokėti)
- **AUTOMATINIS** deployment perrašo esamą deployment po push į GitHub

---

## ✅ SPRENDIMAS: Naudoti REBOOT INSTANCE

Kadangi negalite ištrinti, naudokite **REBOOT INSTANCE**:

### Step 1: REBOOT INSTANCE

1. **Colyseus Cloud** → **Endpoints** tab
2. Raskite **"Europe (Germany - Frankfurt)"** sekciją
3. Spustelėkite **"REBOOT INSTANCE"** mygtuką (raudonas mygtukas)
4. Patvirtinkite
5. Palaukite 2-3 minučių

**Kas daro**: Restart'ins serverį su nauju kodu (jei jis jau push'intas į GitHub).

---

### Step 2: Push Naują Kodą į GitHub

Prieš reboot, įsitikinkite, kad naujas kodas yra GitHub'e:

1. **GitHub Desktop** → Commit → Push
2. Commit message: `Fix PORT - use server.listen() for PM2`
3. Push į GitHub

---

### Step 3: Palaukite Automatinį Deployment

Po push:
1. **Palaukite 2-5 minučių**
2. Colyseus Cloud **automatiškai deploy'ins** naują kodą
3. **ARBA** spustelėkite **REBOOT INSTANCE** po push

---

### Step 4: Patikrinkite Logs

Po reboot arba deployment:
1. **Colyseus Cloud** → **Endpoints** tab
2. Spustelėkite **"LOGS"** mygtuką (prie "RESIZE")
3. Patikrinkite, ar matote:
   ```
   🔧 Starting server (PORT env: XXXX, NODE_ENV: production, using port: XXXX)
   ✅ HTTP server is listening on port XXXX
   ✅ Colyseus server is running on port XXXX
   ```

**Jei vis dar matote PORT klaidą**:
- Patikrinkite logs - turėtumėte matyti detalesnius error'us
- Patikrinkite, ar kodas tikrai push'intas į GitHub

---

## 🔧 Alternatyvus Sprendimas: Patikrinti Kodą

Jei REBOOT nepadėjo, patikrinkite:

1. **Ar kodas tikrai push'intas?**
   - GitHub → repository → patikrinkite, ar `colyseus-server/src/index.ts` atnaujintas

2. **Ar build settings teisingi?**
   - Colyseus Cloud → Settings → Build & Deployment
   - Root Directory: `/colyseus-server/` arba `colyseus-server`
   - Build Command: `npm run build`
   - Install Command: `npm install`

3. **Ar serveris veikia lokaliai?**
   ```bash
   cd colyseus-server
   npm run build
   npm start
   ```

---

## 📋 Checklist

- [ ] Push naują kodą į GitHub
- [ ] REBOOT INSTANCE (po push)
- [ ] Palaukite 2-3 min
- [ ] Patikrinkite Logs
- [ ] Patikrinkite, ar serveris veikia (`/health` endpoint)

---

## 💡 Pastabos

- **Negalima ištrinti**: Colyseus Cloud nepateikia galimybės ištrinti deployment location
- **REBOOT INSTANCE**: Tai restart'ins serverį su nauju kodu
- **Automatinis deployment**: Po push į GitHub, Colyseus Cloud automatiškai deploy'ina

---

**Ar padarėte push ir REBOOT INSTANCE?** Patikrinkite logs po reboot!

