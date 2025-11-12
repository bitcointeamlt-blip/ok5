# 🔍 Start Command Patikrinimas

## ✅ Status: Root Directory Pakeistas

Matau, kad:
- ✅ Root Directory: `/colyseus-server/` (pakeistas!)
- ✅ Deployment history rodo "Deployed" statusus
- ❌ Instances vis dar "Deploying..." (>20 valandų)
- ❌ Stats rodo, kad serveris niekada neveikė (visi metrikai 0)

**Tai reiškia, kad deployment sėkmingas, bet serveris niekada nepasileidžia!**

---

## 🔍 Problema: Start Command?

**Matau Build Settings**:
- Root Directory: `/colyseus-server/`
- Install Command: `npm install`
- Build Command: `npm run build`

**Bet NEMATAU Start Command!**

Colyseus Cloud gali naudoti:
1. **Ecosystem config** (`ecosystem.config.js`)
2. **ARBA Start Command** (jei yra laukelis)

---

## ✅ Sprendimas: Patikrinkite Start Command

### Option 1: Patikrinkite Build & Deployment Settings

1. **Colyseus Cloud** → Settings → Build & Deployment
2. Scroll iki **"Deployment"** sekcijos (žemiau Build settings)
3. Patikrinkite, ar yra **Start Command** laukelis

**Jei yra Start Command laukelis**:
- Turėtų būti: `npm start` (jei Root Directory: `/colyseus-server/`)

**Jei nėra Start Command laukelio**:
- Colyseus Cloud naudoja `ecosystem.config.js`
- Reikia sukurti `ecosystem.config.js` failą

---

### Option 2: Sukurkite Ecosystem Config

Jei Start Command laukelio nėra, sukurkite `ecosystem.config.js`:

**Sukurkite `colyseus-server/ecosystem.config.js`**:
```javascript
module.exports = {
  apps: [{
    name: 'colyseus-server',
    script: 'build/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 2567
    }
  }]
};
```

Tada:
1. Commit → Push į GitHub
2. Deploy iš naujo

---

## 🔍 Troubleshooting

### Problema: Serveris Negali Start'inti

**Patikrinkite**:
1. Ar Start Command teisingas?
2. Ar `ecosystem.config.js` egzistuoja?
3. Ar `build/index.js` egzistuoja po build?

### Problema: Start Command Neteisingas

**Sprendimas**:
- Jei Root Directory: `/colyseus-server/` → Start Command: `npm start`
- ARBA sukurkite `ecosystem.config.js`

---

## 💡 Rekomendacija

**Pirmiausia patikrinkite**:
1. Ar yra Start Command laukelis Build & Deployment settings'e?
2. Ar yra `ecosystem.config.js` failas?

**Jei nėra nei vieno**:
- Sukurkite `ecosystem.config.js`
- Commit → Push → Deploy

**Ar patikrinote Build & Deployment settings'e, ar yra Start Command laukelis?**

