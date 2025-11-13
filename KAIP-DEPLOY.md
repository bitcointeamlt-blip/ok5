# 🚀 Kaip Deploy'inti - TIESIOG

## ✅ Kaip Veikia Colyseus Cloud

Colyseus Cloud **AUTOMATIŠKAI** deploy'ina po push į GitHub `main` branch!

**NĖRA "Redeploy" mygtuko** - deployment vyksta automatiškai po kiekvieno push.

---

## 🚀 Ką Daryti

### Step 1: Push Kodą į GitHub

**GitHub Desktop**:
1. Atidarykite GitHub Desktop
2. Matysite pakeitimus:
   - `colyseus-server/src/index.ts` (PORT handling pataisytas)
   - `colyseus-server/build/index.js` (kompiliuotas)
   - `colyseus-server/ecosystem.config.js` (PORT fallback pašalintas)
3. **Commit**:
   - Summary: `Fix PORT handling for Colyseus Cloud`
   - Description: `Use process.env.PORT with fallback to 2567 for local dev`
4. **Push** - spustelėkite "Push origin"

**Arba Terminal** (jei turite git):
```bash
git add .
git commit -m "Fix PORT handling for Colyseus Cloud"
git push origin main
```

---

### Step 2: Palaukite Automatinį Deployment

Po push:
1. **Palaukite 2-5 minučių**
2. **Colyseus Cloud** → **Deployments** tab
3. Turėtumėte matyti naują deployment su jūsų commit hash
4. Status turėtų būti "Deployed" (su žaliu checkmark)

---

### Step 3: Patikrinkite Logs

Po deployment:
1. **Colyseus Cloud** → **Endpoints** tab
2. Spustelėkite **"LOGS"** mygtuką prie endpoint'o
3. Patikrinkite, ar matote:
   ```
   🔧 Starting server (PORT env: XXXX, NODE_ENV: production, using port: XXXX)
   ✅ HTTP server is listening on port XXXX
   ✅ Colyseus server is running on port XXXX
   ```

**Jei vis dar matote PORT klaidą**:
- Patikrinkite, ar kodas tikrai push'intas į GitHub
- Patikrinkite, ar deployment sėkmingas (žalias checkmark)
- Patikrinkite logs - turėtumėte matyti detalesnius error'us

---

## 📋 Checklist

- [ ] Kodas push'intas į GitHub
- [ ] Palaukite 2-5 min (automatinis deployment)
- [ ] Patikrinkite Deployments tab - naujas deployment turėtų būti
- [ ] Patikrinkite Logs - serveris turėtų veikti
- [ ] Patikrinkite Endpoints - instance turėtų būti "Running" (ne "Deploying...")

---

## 💡 Pastabos

- **Automatinis deployment**: Colyseus Cloud deploy'ina automatiškai po push į `main` branch
- **Nėra "Redeploy" mygtuko**: Deployment vyksta automatiškai
- **Deployment History**: Matysite visus deployment'us su commit hash'ais

---

**Ar padarėte push į GitHub?** Palaukite 2-5 min ir patikrinkite Deployments tab!

