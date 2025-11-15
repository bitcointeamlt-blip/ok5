# 🔄 Ištrinti ir Deploy Iš Naujo - Nuo Nulio

## ✅ Taip, Galima!

Galite ištrinti seną deployment location ir sukurti naują nuo nulio ant to paties serverio.

---

## 🗑️ Step 1: Ištrinti Seną Deployment Location

### Option A: Ištrinti per Endpoints Tab

1. **Colyseus Cloud** → **Endpoints** tab
2. Raskite **"Europe (Germany - Frankfurt)"** sekciją
3. Spustelėkite **"DELETE"** arba **"REMOVE"** mygtuką (jei yra)
4. Patvirtinkite ištrinimą

### Option B: Ištrinti per Settings

1. **Colyseus Cloud** → **Settings** tab
2. Scroll iki **"Deployment Locations"** sekcijos
3. Raskite **"Europe (Germany - Frankfurt)"**
4. Spustelėkite **"DELETE"** arba **"REMOVE"**
5. Patvirtinkite

**SVARBU**: Tai ištrins tik deployment location, bet **NE** repository arba kodą!

---

## 🚀 Step 2: Sukurti Naują Deployment Location

1. **Colyseus Cloud** → **Endpoints** tab
2. Spustelėkite **"+ ADD DEPLOYMENT LOCATION"** mygtuką (apačioje)
3. Pasirinkite region:
   - **"Europe - Germany - Frankfurt"** (tą patį, jei norite)
   - Arba kitą region
4. Patvirtinkite

---

## ⚙️ Step 3: Patikrinkite Build Settings

Po sukūrimo naujo deployment location, patikrinkite:

1. **Colyseus Cloud** → **Settings** → **Build & Deployment**
2. Patikrinkite:
   - **Root Directory**: `/colyseus-server/` arba `colyseus-server`
   - **Install Command**: `npm install`
   - **Build Command**: `npm run build`
   - **Node Version**: `22` (arba `20`)

3. Jei reikia - pakeiskite ir **SAVE**

---

## 📤 Step 4: Push Kodą į GitHub

Prieš deploy'inti, įsitikinkite, kad kodas yra GitHub'e:

1. **GitHub Desktop** → Commit → Push
2. Arba terminal:
   ```bash
   git add .
   git commit -m "Reset deployment - fresh start"
   git push origin main
   ```

---

## 🚀 Step 5: Automatinis Deployment

Po push į GitHub:
1. **Palaukite 2-5 minučių**
2. Colyseus Cloud **automatiškai deploy'ins** naują kodą
3. Patikrinkite **Deployments** tab - turėtumėte matyti naują deployment

---

## ✅ Step 6: Patikrinkite Logs

Po deployment:
1. **Colyseus Cloud** → **Endpoints** tab
2. Spustelėkite **"LOGS"** mygtuką
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

## 🔄 Alternatyva: REBOOT INSTANCE

Jei negalite ištrinti deployment location, galite:

1. **Colyseus Cloud** → **Endpoints** tab
2. Spustelėkite **"REBOOT INSTANCE"** mygtuką
3. Palaukite 2-3 minučių
4. Patikrinkite logs

Tai restart'ins serverį su nauju kodu (jei jis jau push'intas).

---

## 📋 Checklist

- [ ] Ištrinti seną deployment location
- [ ] Sukurti naują deployment location
- [ ] Patikrinti build settings
- [ ] Push kodą į GitHub
- [ ] Palaukite automatinį deployment (2-5 min)
- [ ] Patikrinkite Deployments tab
- [ ] Patikrinkite Logs
- [ ] Patikrinkite, ar serveris veikia (`/health` endpoint)

---

## 💡 Pastabos

- **Ištrinimas**: Ištrins tik deployment location, bet ne repository arba kodą
- **Naujas deployment**: Sukurs naują instance su nauju kodu
- **Automatinis deployment**: Colyseus Cloud deploy'ina automatiškai po push į GitHub

---

**Ar padarėte ištrinimą ir sukūrėte naują deployment location?** Po to palaukite automatinį deployment!


