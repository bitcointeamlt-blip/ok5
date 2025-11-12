# 🔍 Kodėl Deployment Nepasileidžia?

## ❌ Problema: "No deployments yet" ir "Not deployed"

Matau, kad:
- ✅ Repository susietas ("OK5")
- ✅ SSH key pridėtas
- ❌ Branch nepasirinktas ("SELECT BRANCH")
- ❌ Deployment nepadarytas

## ✅ Sprendimas

### Step 1: Pasirinkite Branch (SVARBU!)

1. Spustelėkite **"SELECT BRANCH"** dropdown
2. Pasirinkite branch (pvz: `main` arba `master`)

**SVARBU**: Be pasirinkto branch, deployment negali pradėti!

### Step 2: Patikrinkite Build Settings

Eikite į **"Build & Deployment"** tab ir patikrinkite:

- **Root Directory**: `colyseus-server`
- **Install Command**: `npm install`
- **Build Command**: `npm run build`

Jei nėra teisingai → pakeiskite ir **SAVE**

### Step 3: Deploy

Po pasirinkto branch, turėtumėte matyti:
- **"Deploy"** mygtuką
- ARBA automatinis deployment

Spustelėkite **"Deploy"** arba palaukite automatinio deployment.

### Step 4: Patikrinkite Logs

Jei deployment fails:
1. Spustelėkite **"LOGS"** mygtuką
2. Patikrinkite, kokios klaidos
3. Dažniausios klaidos:
   - Build fails (neteisingi build settings)
   - Branch neturi `colyseus-server/` folderio
   - Node version neteisingas

---

## 🔍 Troubleshooting

### Problema: Negaliu pasirinkti branch

**Patikrinkite**:
- Ar repository turi branch'us?
- Ar GitHub aplikacija turi access?
- Ar repository yra public arba turite access?

**Sprendimas**:
- Patikrinkite GitHub repository → turėtumėte matyti branch'us
- Jei nėra branch'ų → sukurkite `main` branch

### Problema: Branch pasirinktas, bet deployment nepasileidžia

**Patikrinkite**:
- Ar build settings teisingi?
- Ar `colyseus-server/` folderis yra repository'e?
- Logs sekcijoje (spustelėkite "LOGS")

**Sprendimas**:
- Patikrinkite build settings
- Patikrinkite, ar repository turi `colyseus-server/` folderį
- Patikrinkite logs

### Problema: Build Fails

**Patikrinkite Logs**:
- Spustelėkite "LOGS" mygtuką
- Patikrinkite, kokios klaidos

**Dažniausios klaidos**:
- `cd: colyseus-server: No such file or directory` → Root Directory neteisingas
- `npm: command not found` → Node version neteisingas
- `package.json not found` → Root Directory neteisingas

---

## 📋 Checklist

- [ ] Branch pasirinktas (SELECT BRANCH → main/master)
- [ ] Build settings nustatyti (Root: colyseus-server)
- [ ] Deploy mygtukas matomas
- [ ] Deployment pradėtas
- [ ] Logs patikrinti (jei fails)

---

## 💡 Greitas Sprendimas

1. **Pasirinkite branch** (SELECT BRANCH → main)
2. **Patikrinkite build settings** (Root: colyseus-server)
3. **Spustelėkite Deploy** (jei yra mygtukas)
4. **Patikrinkite Logs** (jei fails)

**Ar pasirinkote branch? Tai svarbiausia!**

