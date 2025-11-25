# 🔧 Service Unavailable - Sprendimas

## ❌ Problema: Deployment Sėkmingas, Bet Serveris Neveikia

Matau, kad:
- ✅ Deployment sėkmingas ("Deployed" su žaliu checkmark)
- ❌ Serveris neveikia ("Service Unavailable")

Tai reiškia, kad deployment baigtas, bet serveris negali start'inti arba neveikia teisingai.

---

## ✅ Sprendimas

### Step 1: Patikrinkite Logs

1. **Colyseus Cloud** → Deployments tab
2. Spustelėkite **"LOGS"** mygtuką (šalia deployment)
3. Patikrinkite, kokios klaidos

**Dažniausios klaidos**:
- Serveris negali start'inti
- Port jau užimtas
- Build settings neteisingi
- Start command neteisingas

---

### Step 2: Patikrinkite Build Settings

1. **Colyseus Cloud** → Settings → Build & Deployment
2. Patikrinkite:

   **Root Directory**: `colyseus-server`
   **Install Command**: `npm install`
   **Build Command**: `npm run build`
   **Start Command**: `npm start` (ARBA `cd colyseus-server && npm start`)

**SVARBU**: Jei Root Directory yra `colyseus-server`, tai Start Command turėtų būti `npm start` (be `cd`).

---

### Step 3: Patikrinkite Serverio Kodą

Patikrinkite `colyseus-server/src/index.ts`:
- Ar serveris teisingai start'ina?
- Ar PORT teisingas?
- Ar yra error handling?

---

### Step 4: Patikrinkite Instances

1. **Colyseus Cloud** → Deployments
2. Patikrinkite **"Instances"** sekciją:
   - Ar rodo "1" arba "Running"?
   - ARBA rodo "Not deployed"?

**Jei "Not deployed"**:
- Serveris nepasileido
- Reikia patikrinti logs

---

## 🔍 Troubleshooting

### Problema: Serveris Negali Start'inti

**Sprendimas**:
1. Patikrinkite logs
2. Patikrinkite build settings
3. Patikrinkite, ar `colyseus-server/build/index.js` egzistuoja

### Problema: Port Jau Užimtas

**Sprendimas**:
- Colyseus Cloud automatiškai nustato PORT
- Patikrinkite, ar serveris naudoja `process.env.PORT`

### Problema: Start Command Neteisingas

**Sprendimas**:
- Jei Root Directory: `colyseus-server`
- Start Command: `npm start` (be `cd`)
- ARBA: `cd colyseus-server && npm start` (jei Root Directory: `/`)

---

## 📋 Checklist

- [ ] Logs patikrinti
- [ ] Build settings patikrinti
- [ ] Start command patikrinti
- [ ] Instances status patikrinti
- [ ] Serveris veikia

---

## 💡 Greitas Sprendimas

1. **Colyseus Cloud** → Deployments → **LOGS**
2. Patikrinkite klaidas
3. Patikrinkite build settings
4. Jei reikia → pakeiskite start command
5. Redeploy

**Ar patikrinote Logs sekciją?**

