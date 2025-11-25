# ✅ SSH Key Pridėtas - Ką Daryti Dabar

## ✅ Kas Padaryta

- ✅ SSH deploy key pridėtas į GitHub
- ✅ Status: "Never used — Read/write"
- ✅ Key paruoštas naudojimui

## 🚀 Kitas Žingsnis - Deployment

### Step 1: Eikite į Colyseus Cloud

1. Atidarykite: **https://cloud.colyseus.io**
2. Prisijunkite
3. Pasirinkite **"dot game"** aplikaciją

### Step 2: Patikrinkite Build Settings

1. Eikite į **"Build & Deployment"** tab
2. Patikrinkite Build settings:

   **Root Directory**: `colyseus-server`
   **Install Command**: `npm install`
   **Build Command**: `npm run build`

   Jei nėra teisingai nustatyta → pakeiskite ir **SAVE**

### Step 3: Pasirinkite Branch

1. Deployment sekcijoje
2. Spustelėkite **"SELECT BRANCH"** dropdown
3. Pasirinkite branch (pvz: `main` arba `master`)

**SVARBU**: Patikrinkite, kad branch turi `colyseus-server/` folderį!

### Step 4: Deploy

**Option A: Automatinis Deployment (Jei GitHub Connection)**

Jei GitHub connection veikia:
- Deployment įvyks automatiškai po push į GitHub
- ARBA spustelėkite "Deploy" mygtuką

**Option B: Manual Deployment**

1. Eikite į **"Deployments"** tab
2. Spustelėkite **"New Deployment"** arba **"Deploy"**
3. Palaukite 2-5 min
4. Patikrinkite **Logs** sekciją

### Step 5: Patikrinkite Deployment

Po deployment:

1. **Latest Deployment** turėtų rodyti:
   - Status: "Success" arba "Running"
   - Deployment time
   - Build logs

2. **Instances** turėtų rodyti:
   - "1" arba "Running"

3. **Test Endpoint**:
   ```
   https://de-fra-f8820c12.colyseus.cloud/health
   ```
   Turėtumėte matyti: `{"status":"ok"}`

---

## 📋 Checklist

- [x] SSH key pridėtas į GitHub
- [ ] Build settings nustatyti (Root: colyseus-server)
- [ ] Branch pasirinktas
- [ ] Deployment padarytas
- [ ] Endpoint veikia (/health)

---

## 🔍 Troubleshooting

### Deployment Fails

**Patikrinkite**:
- Ar build settings teisingi
- Ar `colyseus-server/` folderis yra repository'e
- Logs sekcijoje (spustelėkite "LOGS")

### Cannot Select Branch

**Patikrinkite**:
- Ar repository turi branch'us
- Ar GitHub aplikacija turi access
- Ar SSH key pridėtas teisingai

### Build Fails

**Patikrinkite**:
- Ar Root Directory: `colyseus-server`
- Ar `colyseus-server/package.json` egzistuoja
- Logs sekcijoje

---

## 💡 Greitas Būdas

1. Colyseus Cloud → Build & Deployment
2. Patikrinkite build settings
3. Pasirinkite branch
4. Deploy
5. Patikrinkite endpoint

**Ar norite, kad padėčiau su deployment?**

