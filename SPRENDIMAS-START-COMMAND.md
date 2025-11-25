# 🔧 Sprendimas: Serveris Nepasileidžia

## ❌ Problema

- ✅ Deployment rodo "Deployed" statusą
- ❌ Instances vis dar "Deploying..." (>20 valandų)
- ❌ Stats rodo, kad serveris niekada neveikė (visi metrikai 0)

**Tai reiškia, kad deployment sėkmingas, bet serveris niekada nepasileidžia!**

---

## ✅ Sprendimas: Nustatyti Start Command

Colyseus Cloud gali naudoti:
1. **Start Command** (Build & Deployment settings)
2. **ARBA** `ecosystem.config.js` (jei automatiškai aptinkamas)

### Step 1: Patikrinkite Build & Deployment Settings

1. Eikite į **Colyseus Cloud** → **Settings** → **Build & Deployment**
2. Scroll iki **"Deployment"** sekcijos (žemiau Build settings)
3. Patikrinkite, ar yra **Start Command** laukelis

**Jei yra Start Command laukelis**:
- Įrašykite: `npm start`
- Išsaugokite pakeitimus

**Jei nėra Start Command laukelio**:
- Colyseus Cloud turėtų naudoti `ecosystem.config.js`
- Patikrinkite Step 2

---

### Step 2: Patikrinkite, ar `ecosystem.config.js` Teisingas

Failas `colyseus-server/ecosystem.config.js` turėtų būti:
- ✅ Root directory: `/colyseus-server/`
- ✅ Failas egzistuoja: `colyseus-server/ecosystem.config.js`
- ✅ Script: `build/index.js`

**Jei vis dar neveikia**, pabandykite Step 3.

---

### Step 3: Sukurkite Procfile (Alternatyvus Sprendimas)

Kai kurie cloud provideriai naudoja `Procfile`:

**Sukurkite `colyseus-server/Procfile`**:
```
web: npm start
```

Tada:
1. Commit → Push į GitHub
2. Redeploy Colyseus Cloud

---

### Step 4: Patikrinkite Logs

Po deployment:

1. **Colyseus Cloud** → **Endpoints** → **LOGS**
2. Ieškokite:
   - `✅ Server running on port XXXX`
   - Arba error'ų apie start'ą

**Jei matote error'us**:
- Kopijuokite error'us
- Patikrinkite, ar `build/index.js` egzistuoja
- Patikrinkite, ar PORT nustatytas

---

## 🔍 Troubleshooting

### Problema: Start Command Neteisingas

**Sprendimas**:
- Jei Root Directory: `/colyseus-server/` → Start Command: `npm start`
- ARBA patikrinkite `ecosystem.config.js`

### Problema: Serveris Vis Dar Nepasileidžia

**Sprendimas**:
1. Patikrinkite, ar kodas push'intas į GitHub
2. Patikrinkite Build & Deployment settings:
   - Root Directory: `/colyseus-server/`
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - **Start Command: `npm start`** (SVARBU!)
3. Redeploy iš naujo

---

## 📋 Checklist

- [ ] Patikrinti Build & Deployment settings'e Start Command
- [ ] Jei nėra Start Command → patikrinti `ecosystem.config.js`
- [ ] Commit → Push į GitHub
- [ ] Redeploy Colyseus Cloud
- [ ] Patikrinti Logs
- [ ] Patikrinti, ar serveris veikia (`/health` endpoint)

---

## 💡 Rekomendacija

**Pirmiausia patikrinkite**:
1. Ar yra Start Command laukelis Build & Deployment settings'e?
2. Jei yra → įrašykite `npm start`
3. Jei nėra → patikrinkite `ecosystem.config.js`

**Po to**:
- Commit → Push → Redeploy
- Patikrinkite Logs

**Ar patikrinote Build & Deployment settings'e, ar yra Start Command laukelis?**

