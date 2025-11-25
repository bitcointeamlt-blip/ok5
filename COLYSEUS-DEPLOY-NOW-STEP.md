# 🚀 Colyseus Cloud Deployment - Dabar

## ✅ Kas Jau Padaryta

- ✅ Repository susietas ("OK5")
- ✅ Endpoint sukurtas: `https://de-fra-f8820c12.colyseus.cloud`
- ✅ Branch selector matomas

## ❌ Kas Dar Ne

- ❌ Deployment nepadarytas ("No deployments yet")
- ❌ Instances nepasirinkti ("Not deployed")

## 📋 Ką Daryti Dabar

### Step 1: Pasirinkite Branch

1. Spustelėkite **"SELECT BRANCH"** dropdown
2. Pasirinkite branch (pvz: `main` arba `master`)
3. Patikrinkite, ar branch turi `colyseus-server/` folderį

### Step 2: Nustatykite Build Settings

Colyseus Cloud → Settings → Build Configuration:

**Build Command**:
```
cd colyseus-server && npm install && npm run build
```

**Start Command**:
```
cd colyseus-server && npm start
```

**Root Directory**:
```
colyseus-server
```

**Node Version**: `22` (jau nustatyta)

### Step 3: Deploy

1. Spustelėkite **"Deploy"** mygtuką (turėtų būti šalia "SELECT BRANCH")
2. ARBA eikite į **"Deployments"** tab → **"New Deployment"**
3. Palaukite, kol deployment baigsis (2-5 min)

### Step 4: Patikrinkite Status

Po deployment:
- "Latest Deployment" turėtų rodyti deployment info
- "Instances" turėtų rodyti "1" arba "Running"
- Logs turėtų rodyti serverio start'ą

### Step 5: Testuokite Endpoint

Endpoint jau sukurtas: `https://de-fra-f8820c12.colyseus.cloud`

Patikrinkite:
- Spustelėkite **"Copy"** šalia endpoint
- Atidarykite naršyklėje: `https://de-fra-f8820c12.colyseus.cloud/health`
- Turėtumėte matyti: `{"status":"ok"}`

## 🔍 Troubleshooting

### Deployment fails
- Patikrinkite **Logs** (spustelėkite "LOGS" mygtuką)
- Patikrinkite, ar build command teisingas
- Patikrinkite, ar `colyseus-server/` folderis yra repository'e

### Cannot select branch
- Patikrinkite, ar repository turi branch'us
- Patikrinkite, ar GitHub aplikacija turi access

### Build fails
- Patikrinkite logs
- Patikrinkite Node version (turėtų būti 22)

