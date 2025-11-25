# ✅ Lengviausias Būdas - GitHub Web Interface

## ❌ Problema: CLI Reikalauja Git

CLI deployment neveikia, nes Git nėra įdiegtas. Bet jūsų repository jau susietas ("OK5"), todėl galite deploy'inti per web!

## 🚀 Deployment per Web (5 Minutės)

### Step 1: Eikite į Colyseus Cloud

1. Atidarykite: https://cloud.colyseus.io
2. Prisijunkite
3. Pasirinkite "dot game" aplikaciją

### Step 2: Pasirinkite Branch

1. Deployments tab → "Deploy your code" sekcija
2. Spustelėkite **"SELECT BRANCH"** dropdown
3. Pasirinkite branch (pvz: `main` arba `master`)

### Step 3: Nustatykite Build Settings

1. Eikite į **Settings** tab (viršuje)
2. Scroll iki **Build Configuration**
3. Nustatykite:

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

4. Spustelėkite **"Save"**

### Step 4: Deploy

1. Eikite į **Deployments** tab
2. Spustelėkite **"New Deployment"** arba **"Deploy"** mygtuką
3. Palaukite 2-5 min

### Step 5: Patikrinkite

Po deployment:
- "Latest Deployment" turėtų rodyti deployment info
- "Instances" turėtų rodyti "Running"
- Endpoint: `https://de-fra-f8820c12.colyseus.cloud`

---

## ✅ Patikrinimas

Atidarykite naršyklėje:
```
https://de-fra-f8820c12.colyseus.cloud/health
```

Turėtumėte matyti: `{"status":"ok"}`

---

## 💡 Kodėl Web Interface Geriau?

- ✅ Nereikia Git
- ✅ Nereikia SSH key setup
- ✅ Lengviau ir greičiau
- ✅ Repository jau susietas

**Naudokite web interface - tai lengviausias būdas!**

