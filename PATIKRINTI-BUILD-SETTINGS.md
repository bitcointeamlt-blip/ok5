# 🔍 PATIKRINTI BUILD SETTINGS - Serveris Niekaip Neužsikrauna

## ❌ Problema

- ✅ Latest Deployment: "Deployed at 7 minutes ago" (commit 2df100f)
- ❌ Instances: vis dar "Deploying..." (jau >1 valandą)
- ❌ Serveris niekada nepasileidžia

**Tai reiškia, kad deployment vyksta, bet serveris crash'ina iškart po start'o.**

---

## ✅ Ką Padariau

Pridėjau **daugiau debug logging** į `colyseus-server/src/index.ts`:
- ✅ Log'uojama iškart, kai failas užsikrauna
- ✅ Log'uojama PORT konfigūracija
- ✅ Log'uojama, jei PORT neteisingas
- ✅ Log'uojama, jei serveris nepasileidžia per 5 sekundes

**Dabar turėtumėte matyti application logs, kurie parodys tikrąją problemą!**

---

## 🔍 PATIKRINTI COLYSEUS CLOUD BUILD SETTINGS

### Step 1: Eikite į Settings

1. **Colyseus Cloud** → **Settings** tab
2. Scroll iki **"Build Configuration"** sekcijos

---

### Step 2: Patikrinkite Build Command

**Turėtų būti:**
```
cd colyseus-server && npm install && npm run build
```

**ARBA** (jei Root Directory yra `/colyseus-server/`):
```
npm install && npm run build
```

**SVARBU**: Jei Root Directory yra `/colyseus-server/`, Build Command **NĖRA** `cd colyseus-server && ...` - jis jau yra toje direktorijoje!

---

### Step 3: Patikrinkite Start Command

**Turėtų būti:**
```
cd colyseus-server && npm start
```

**ARBA** (jei Root Directory yra `/colyseus-server/`):
```
npm start
```

**SVARBU**: Start Command turėtų paleisti `npm start`, kuris vykdo `node build/index.js` (pagal `package.json`).

---

### Step 4: Patikrinkite Root Directory

**Turėtų būti:**
```
colyseus-server
```

**ARBA** (jei Colyseus Cloud reikalauja absoliutaus kelio):
```
/colyseus-server
```

**SVARBU**: Root Directory turėtų rodyti į `colyseus-server/` folderį, kur yra `package.json`, `ecosystem.config.js`, ir `build/` folderis.

---

### Step 5: Patikrinkite Node Version

**Turėtų būti:**
```
22
```

**ARBA:**
```
20
```

---

### Step 6: Patikrinkite Port

**Turėtų būti:**
```
(empty - palikite tuščią)
```

**SVARBU**: Colyseus Cloud nustato PORT automatiškai. **NĖRA** nustatyti PORT čia!

---

## 📋 PATIKRINTI APPLICATION LOGS

### Step 1: Eikite į Logs

1. **Colyseus Cloud** → **Endpoints** tab
2. Spustelėkite **"LOGS"** mygtuką (deployment location'e)

---

### Step 2: Išjunkite "Show only errors" Toggle

1. Scroll iki viršaus
2. **Išjunkite** "Show only errors" toggle (jei įjungtas)
3. Scroll žemyn

---

### Step 3: Patikrinkite Application Logs

Dabar turėtumėte matyti:
- `/home/deploy/source/colyseus-server/logs/err.log`
- `/home/deploy/source/colyseus-server/logs/out.log`

**ARBA**:
- `colyseus-server` application logs (jei PM2 log'uojama tiesiogiai)

---

### Step 4: Ieškokite Debug Logs

Ieškokite šių log'ų:
- `🚀 Server file loaded - starting initialization...`
- `📦 Environment: { PORT: ..., NODE_ENV: ..., PWD: ... }`
- `✅ All imports loaded successfully`
- `🔧 PORT configuration: { ... }`
- `🔧 Starting server (PORT env: ..., NODE_ENV: ..., using port: ...)`
- `🔧 Attempting to listen on port ...`

**Jei matote šiuos log'us**:
- ✅ Serveris bent jau pradeda vykdyti kodą
- ❌ Bet crash'ina vėliau - patikrinkite error'us

**Jei NĖRA šių log'ų**:
- ❌ Serveris crash'ina prieš spėjant vykdyti kodą
- ❌ Problema build'e arba import'uose

---

## 🔧 JEI VIS DAR NEVEIKIA

### Option 1: Patikrinkite Build Logs

1. **Colyseus Cloud** → **Deployments** tab
2. Spustelėkite paskutinį deployment (2df100f)
3. Patikrinkite **Build Logs**
4. Ieškokite error'ų arba warning'ų

**Jei build fail'ina**:
- Patikrinkite build command
- Patikrinkite, ar `colyseus-server/` folderis yra GitHub'e
- Patikrinkite, ar `package.json` turi `build` script'ą

---

### Option 2: Patikrinkite Lokaliai

Patikrinkite, ar serveris veikia lokaliai:

```bash
cd colyseus-server
npm run build
npm start
```

**Jei veikia lokaliai**:
- ✅ Problema build settings'e arba deployment'e
- Patikrinkite Colyseus Cloud build settings

**Jei neveikia lokaliai**:
- ❌ Problema serverio kode
- Patikrinkite error'us lokaliai

---

### Option 3: REBOOT INSTANCE

1. **Colyseus Cloud** → **Endpoints** tab
2. Spustelėkite **"REBOOT INSTANCE"** mygtuką
3. Palaukite 1-2 minutes
4. Patikrinkite logs

---

## 📋 CHECKLIST

- [ ] Patikrinti build settings (Build Command, Start Command, Root Directory)
- [ ] Patikrinti application logs (išjungti toggle)
- [ ] Ieškoti debug logs (`🚀 Server file loaded...`)
- [ ] Patikrinti build logs (Deployments tab)
- [ ] Patikrinti lokaliai (`npm run build && npm start`)
- [ ] REBOOT INSTANCE (jei reikia)

---

## 💡 SVARBU

**Dabar turėtumėte matyti application logs su debug informacija!**

Jei vis dar nėra application logs:
- ❌ Build settings neteisingi
- ❌ Serveris crash'ina prieš spėjant rašyti į logs
- ❌ Reikia patikrinti build output

---

**Push'inkite kodą į GitHub ir patikrinkite logs po deployment!**

