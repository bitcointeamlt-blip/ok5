# ⚙️ Colyseus Cloud Build Settings - Detalios Instrukcijos

## 📋 Ką Nustatyti Colyseus Cloud'e

### Step 1: Eikite į Settings

1. Atidarykite: **https://cloud.colyseus.io**
2. Prisijunkite
3. Pasirinkite **"dot game"** aplikaciją
4. Spustelėkite **"Settings"** tab (viršuje)

### Step 2: Build Configuration

Scroll iki **"Build Configuration"** sekcijos.

#### Build Command

Įdėkite šią komandą:
```
cd colyseus-server && npm install && npm run build
```

**Kas daro**:
- `cd colyseus-server` - eina į server folderį
- `npm install` - įdiegia dependencies
- `npm run build` - kompiliuoja TypeScript į JavaScript

#### Start Command

Įdėkite šią komandą:
```
cd colyseus-server && npm start
```

**Kas daro**:
- `cd colyseus-server` - eina į server folderį
- `npm start` - paleidžia serverį (`node build/index.js`)

#### Root Directory

Įdėkite:
```
colyseus-server
```

**Kas daro**: Nurodo, kad server kodas yra `colyseus-server/` folderyje.

#### Node Version

Pasirinkite: **`22`** (arba `20`)

#### Port

Palikite tuščią - Colyseus Cloud nustato automatiškai.

### Step 3: Save

Spustelėkite **"Save"** arba **"Update"** mygtuką.

---

## 📋 Deployment Settings

### Step 4: Pasirinkite Branch

1. Eikite į **"Deployments"** tab
2. Spustelėkite **"SELECT BRANCH"** dropdown
3. Pasirinkite branch (pvz: `main` arba `master`)

**SVARBU**: Patikrinkite, kad branch turi `colyseus-server/` folderį!

### Step 5: Deploy

1. Spustelėkite **"New Deployment"** arba **"Deploy"** mygtuką
2. Palaukite 2-5 min
3. Patikrinkite **Logs** sekciją

---

## ✅ Patikrinimas

### Po Deployment:

1. **Latest Deployment** turėtų rodyti:
   - Deployment status: "Success" arba "Running"
   - Deployment time
   - Build logs

2. **Instances** turėtų rodyti:
   - "1" arba "Running"

3. **Endpoint**:
   - `https://de-fra-f8820c12.colyseus.cloud`
   - Patikrinkite: `https://de-fra-f8820c12.colyseus.cloud/health`
   - Turėtumėte matyti: `{"status":"ok"}`

---

## 🔍 Troubleshooting

### Build Fails

**Patikrinkite**:
- Ar build command teisingas
- Ar `colyseus-server/` folderis yra repository'e
- Ar `colyseus-server/package.json` egzistuoja
- Logs sekcijoje (spustelėkite "LOGS")

### Start Fails

**Patikrinkite**:
- Ar start command teisingas
- Ar `colyseus-server/build/index.js` egzistuoja po build
- Logs sekcijoje

### Cannot Select Branch

**Patikrinkite**:
- Ar repository turi branch'us
- Ar GitHub aplikacija turi access
- Ar repository yra public arba turite access

---

## 📸 Screenshot Checklist

Kai nustatote, turėtumėte matyti:

- ✅ Build Command: `cd colyseus-server && npm install && npm run build`
- ✅ Start Command: `cd colyseus-server && npm start`
- ✅ Root Directory: `colyseus-server`
- ✅ Node Version: `22`
- ✅ Branch: pasirinktas (pvz: `main`)

---

## 🚀 Po Sėkmingo Deployment

1. Kopijuokite endpoint: `https://de-fra-f8820c12.colyseus.cloud`
2. Atnaujinkite frontend `.env`:
   ```
   VITE_COLYSEUS_ENDPOINT=https://de-fra-f8820c12.colyseus.cloud
   ```
3. Redeploy frontend (Netlify/Cloudflare)
4. Testuokite žaidimą!

---

**Ar viskas aišku? Jei kyla klausimų, klauskite!**

