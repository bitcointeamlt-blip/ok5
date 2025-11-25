# 🚀 Final Deployment - 2 Būdai

## ✅ Status: Failai GitHub'e

Failai jau push'inti į GitHub, todėl galite deploy'inti!

---

## Option 1: CLI Deployment (Jei Turite Git)

### Step 1: Įdiekite Git (Jei Reikia)

1. Parsisiųskite: **https://git-scm.com/download/win**
2. Įdiekite su default settings
3. Restart terminal

### Step 2: Inicializuokite Git (Jei Reikia)

```bash
cd C:\Users\p3p3l\Downloads\ok4
git init
git remote add origin https://github.com/bitcointeamlt-blip/ok5.git
git pull origin main
```

### Step 3: Deploy per CLI

```bash
cd colyseus-server
npx @colyseus/cloud deploy
```

**Problema**: Jei Git nėra įdiegtas, CLI neveiks.

---

## Option 2: Web Interface (Rekomenduojama - Lengviausia)

### Step 1: Eikite į Colyseus Cloud

1. Atidarykite: **https://cloud.colyseus.io**
2. Pasirinkite **"dot game"** aplikaciją

### Step 2: Pasirinkite Branch

1. Eikite į **"Build & Deployment"** tab
2. Deployment sekcijoje
3. Spustelėkite **"SELECT BRANCH"**
4. Pasirinkite **"main"** (dabar turėtų būti matomas!)

### Step 3: Patikrinkite Build Settings

Patikrinkite:
- **Root Directory**: `colyseus-server`
- **Install Command**: `npm install`
- **Build Command**: `npm run build`

Jei nėra teisingai → pakeiskite ir **SAVE**

### Step 4: Deploy

1. Spustelėkite **"Deploy"** arba **"New Deployment"**
2. Palaukite 2-5 min
3. Patikrinkite **Logs** sekciją

---

## ✅ Patikrinimas

Po deployment:

1. **Latest Deployment** turėtų rodyti:
   - Status: "Success" arba "Running"
   - Deployment time

2. **Instances** turėtų rodyti:
   - "1" arba "Running"

3. **Test Endpoint**:
   ```
   https://de-fra-f8820c12.colyseus.cloud/health
   ```
   Turėtumėte matyti: `{"status":"ok"}`

4. **Test Žaidimą**:
   - Atidarykite žaidimą
   - Pasirinkite "PvP Online"
   - Turėtų prisijungti prie Colyseus!

---

## 💡 Rekomendacija

**Naudokite Web Interface** - lengviausia ir jau turite failus GitHub'e!

1. Colyseus Cloud → Build & Deployment
2. SELECT BRANCH → main
3. Patikrinkite build settings
4. Deploy
5. Palaukite 2-5 min
6. Testuokite!

---

## 🔍 Troubleshooting

### Problema: Branch vis dar nematomas

**Sprendimas**:
- Patikrinkite GitHub → ar branch `main` egzistuoja?
- Refresh Colyseus Cloud
- Susiekite repository dar kartą

### Problema: Deployment Fails

**Sprendimas**:
- Patikrinkite Logs sekciją
- Patikrinkite build settings
- Patikrinkite, ar `colyseus-server/` folderis yra repository'e

### Problema: Serveris neveikia po deployment

**Sprendimas**:
- Patikrinkite `/health` endpoint
- Patikrinkite Logs
- Patikrinkite Instances status

---

## 📋 Checklist

- [x] Failai push'inti į GitHub
- [ ] Branch pasirinktas Colyseus Cloud
- [ ] Build settings nustatyti
- [ ] Deployment padarytas
- [ ] Serveris veikia (`/health` endpoint)
- [ ] Žaidimas prisijungia prie Colyseus

**Ar norite naudoti Web Interface arba CLI?**

