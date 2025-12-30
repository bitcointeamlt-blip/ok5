# 🔧 Fix Build Duplicate Code Problem

## ❌ Problema: Build Kodas Senas!

**Radau problemą:**
- ✅ Source kodas (`colyseus-server/src/index.ts`) - **TEISINGAS** (leidžia visus origin'us)
- ❌ Build kodas (`colyseus-server/build/index.js`) - **SENAS** (naudoja allowedOrigins array)

**Tai reiškia:**
- Colyseus Cloud gali naudoti build folderį vietoj source kodo
- Build kodas yra senas ir neturėtų būti commit'intas į Git

---

## ✅ Sprendimas: Ištrinti Build Folderį

### Build Folderis Neturėtų Būti Git'e

**Build folderis turėtų būti:**
- ❌ NE commit'intas į Git
- ✅ Generuojamas automatiškai per `npm run build`
- ✅ Ignoruojamas per `.gitignore`

---

## 🚀 Kaip Pataisyti

### Step 1: Patikrinkite `.gitignore`

**`colyseus-server/.gitignore` turėtų turėti:**
```
build/
node_modules/
*.log
```

**Jei nėra `.gitignore`:**
- Sukurkite `colyseus-server/.gitignore`
- Pridėkite `build/`

---

### Step 2: Ištrinkite Build Folderį iš Git

**Jei build folderis yra Git'e:**

```bash
cd colyseus-server
git rm -r build/
git commit -m "Remove build folder - should be generated automatically"
git push
```

---

### Step 3: Patikrinkite Colyseus Cloud Build Settings

**Colyseus Cloud Dashboard:**
1. **Settings** → **Build & Deployment**
2. **Root Directory:** `colyseus-server` (be slash'ų!)
3. **Build Command:** `npm run build` (build'ins iš source kodo)
4. **Start Command:** `npm start` (naudoja build/index.js)

**SVARBU:**
- Build Command turėtų būti `npm run build` (ne tiesiog naudoti build folderį)
- Colyseus Cloud turėtų build'inti iš source kodo automatiškai

---

### Step 4: Redeploy Colyseus Serveris

**Colyseus Cloud Dashboard:**
1. **Deployments** → **Deploy** (arba **Redeploy**)
2. Palaukite 2-5 min

**Colyseus Cloud automatiškai:**
- Build'ins iš source kodo (`colyseus-server/src/index.ts`)
- Sukurs naują build folderį su teisinga CORS konfigūracija
- Deploy'ins su nauja versija

---

## 🔍 Patikrinimas

### Po Redeploy:

**Colyseus Cloud → Logs:**

Turėtumėte matyti:
```
✅ Server running on port XXXX
[CORS] Matchmaking request from origin: https://jocular-zabaione-835b49.netlify.app
```

**Jei matote CORS log'us:** Serveris deploy'intas su nauja versija iš source kodo! ✅

---

## 📋 Checklist

### Prieš Deploy:
- [ ] `.gitignore` turi `build/`
- [ ] Build folderis ištrintas iš Git (jei buvo)
- [ ] Colyseus Cloud Build Command = `npm run build`
- [ ] Colyseus Cloud Root Directory = `colyseus-server`

### Po Deploy:
- [ ] Serveris deploy'intas
- [ ] CORS log'ai yra (rodo naują versiją)
- [ ] Frontend prisijungia be CORS error'ų

---

## 🎯 Išvada

**Problema:**
- Build kodas senas (neturėtų būti Git'e)
- Colyseus Cloud gali naudoti build folderį vietoj source kodo

**Sprendimas:**
- Ištrinti build folderį iš Git
- Colyseus Cloud build'ins iš source kodo automatiškai
- Redeploy'inti serverį

**Po to viskas veiks!** 🚀
















