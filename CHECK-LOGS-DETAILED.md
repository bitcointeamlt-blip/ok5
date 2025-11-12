# 🔍 Detalūs Logs Patikrinimas

## ✅ Kas Matau Logs'e

Matau, kad:
- ✅ PM2 daemon start'avo
- ✅ @colyseus/tools agent veikia ("PM2 post-deploy agent is up and running...")
- ❌ **NĖRA** "Colyseus server is running on port XXXX" pranešimo
- ❌ **NĖRA** application logs

**Tai reiškia, kad serveris niekada nepasileidžia!**

---

## 🔍 Ką Patikrinti

### Step 1: Patikrinkite Application Logs

Logs rodo tik PM2 logs, bet **nėra application logs**!

**Reikia patikrinti**:
1. Ar yra **application-specific logs**?
2. Ar yra **error logs**?
3. Ar serveris tikrai start'ina?

**Patikrinkite**:
- Spustelėkite **"Show only errors"** toggle (viršuje)
- ARBA ieškokite application logs (ne tik PM2 logs)

### Step 2: Patikrinkite Build Settings

1. **Colyseus Cloud** → Settings → Build & Deployment
2. Patikrinkite:
   - **Root Directory**: `colyseus-server`
   - **Start Command**: `npm start`
   - **Build Command**: `npm run build`

**SVARBU**: Jei Root Directory yra `colyseus-server`, Start Command turėtų būti `npm start` (be `cd`).

### Step 3: Patikrinkite, Ar Serveris Veikia Lokaliai

```bash
cd colyseus-server
npm run build
npm start
```

**Jei veikia lokaliai**:
- Problema build settings'e
- Patikrinkite Colyseus Cloud build settings

**Jei neveikia lokaliai**:
- Problema serverio kode
- Reikia pataisyti kodą

---

## 💡 Problema: Serveris Negali Start'inti

**Matau, kad**:
- PM2 start'avo
- @colyseus/tools agent veikia
- Bet **serveris niekada nepasileidžia**

**Tikėtina priežastis**:
1. Serveris start'ina, bet fail'ina dėl klaidos
2. Build settings neteisingi
3. Serveris start'ina, bet neveikia teisingai

---

## ✅ Sprendimas

### Option 1: Patikrinkite Error Logs

1. Spustelėkite **"Show only errors"** toggle
2. Patikrinkite, ar yra klaidų
3. Ieškokite:
   - "Failed to start"
   - "Error"
   - "Cannot start server"

### Option 2: Patikrinkite Build Settings

1. **Colyseus Cloud** → Settings → Build & Deployment
2. Patikrinkite:
   - **Root Directory**: `colyseus-server`
   - **Start Command**: `npm start`

### Option 3: Testuokite Lokaliai

```bash
cd colyseus-server
npm run build
npm start
```

**Ar serveris veikia lokaliai?**

---

## 🔄 Alternatyva: Reboot Instance

Jei vis dar neveikia:

1. Spustelėkite **"REBOOT INSTANCE"** mygtuką (apačioje)
2. Palaukite kelias minutes
3. Patikrinkite logs dar kartą

**Ar patikrinote "Show only errors" toggle?**

