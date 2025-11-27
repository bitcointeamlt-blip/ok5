# 🚀 GitHub Deployment į Netlify - Kaip Veikia

## ✅ Privalumai GitHub Deployment

### Kodėl GitHub Deployment Geriau nei Manual ZIP:

1. **Automatinis Deployment**
   - Kiekvieną kartą kai push'inate kodą į GitHub → Netlify automatiškai build'ina ir deploy'ina
   - Nereikia rankiniu būdu įkelti ZIP failų

2. **Nėra Cache Problemų**
   - Netlify build'ina iš GitHub repo (fresh code)
   - Nėra senų cached failų problemų
   - Kiekvienas build yra naujas

3. **Build History**
   - Matote visus build'us su commit messages
   - Galite rollback'inti į ankstesnę versiją
   - Matote kas pakeista kiekviename build'e

4. **Automatinių Build'ų Privalumai**
   - Netlify automatiškai naudoja `netlify.toml` iš repo
   - Netlify automatiškai naudoja teisingą build command
   - Nėra UI override problemų

---

## 📋 Kaip Nustatyti GitHub Deployment

### Step 1: Sukurkite GitHub Repository (Jei Neturite)

1. **Eikite į GitHub:**
   - https://github.com
   - Prisijunkite

2. **Sukurkite Naują Repository:**
   - Spustelėkite "+" → "New repository"
   - Repository name: `pvp03` (arba bet koks kitas)
   - Public arba Private (nesvarbu)
   - **NEPRIDĖKITE** README, .gitignore, ar license (tuščias repo)

3. **Kopijuokite Repository URL:**
   - Pvz: `https://github.com/jusu-username/pvp03.git`

---

### Step 2: Push'inkite Kodą į GitHub

**Option A: Naudojant Git CLI (Jei Turite Git)**

```bash
cd C:\Users\p3p3l\Downloads\pvp03

# Inicializuokite Git (jei dar nepadaryta)
git init

# Pridėkite remote repository
git remote add origin https://github.com/jusu-username/pvp03.git

# Pridėkite visus failus
git add .

# Commit'inkite
git commit -m "Initial commit - PvP game"

# Push'inkite į GitHub
git push -u origin main
```

**Option B: Naudojant GitHub Desktop (Lengviau)**

1. **Parsisiųskite GitHub Desktop:**
   - https://desktop.github.com
   - Įdiekite

2. **Atidarykite GitHub Desktop:**
   - File → Add Local Repository
   - Pasirinkite: `C:\Users\p3p3l\Downloads\pvp03`

3. **Publish Repository:**
   - Spustelėkite "Publish repository"
   - Pasirinkite repository name
   - Spustelėkite "Publish repository"

---

### Step 3: Netlify GitHub Integration

1. **Eikite į Netlify Dashboard:**
   - https://app.netlify.com
   - Prisijunkite

2. **Add New Site:**
   - Spustelėkite "Add new site" → "Import an existing project"
   - ARBA jei jau turite site → Site settings → "Build & deploy" → "Link to Git provider"

3. **Pasirinkite GitHub:**
   - Spustelėkite "GitHub"
   - Autorizuokite Netlify prieigą prie GitHub

4. **Pasirinkite Repository:**
   - Ieškokite `pvp03` (arba jūsų repo name)
   - Spustelėkite repository

5. **Configure Build Settings:**
   - **Build command:** Palikite TUŠČIĄ (Netlify naudos `netlify.toml`)
   - **Publish directory:** `dist` (arba palikite TUŠČIĄ, Netlify naudos iš `netlify.toml`)
   - **Base directory:** Palikite TUŠČIĄ

6. **Environment Variables (Jei Reikia):**
   - Pridėkite:
     - `VITE_SUPABASE_URL` = jūsų Supabase URL
     - `VITE_SUPABASE_ANON_KEY` = jūsų Supabase anon key
     - `VITE_COLYSEUS_ENDPOINT` = jūsų Colyseus endpoint (jei turite)

7. **Deploy Site:**
   - Spustelėkite "Deploy site"
   - Netlify automatiškai build'ina ir deploy'ina!

---

## 🔄 Kaip Veikia Automatinis Deployment

### Kiekvieną Kartą Kai Push'inate:

1. **Push į GitHub:**
   ```bash
   git add .
   git commit -m "Update game - new features"
   git push
   ```

2. **Netlify Automatiškai:**
   - Detektuoja naują commit
   - Pradeda build procesą
   - Build'ina su `netlify.toml` settings
   - Deploy'ina naują versiją

3. **Build Logs:**
   - Matote build procesą real-time
   - Matote build output hash
   - Matote "X new file(s) to upload"

---

## 📁 Failų Struktūra GitHub Repo

### Kas Turėtų Būti GitHub Repo:

```
pvp03/
├── src/                    # Source code
├── public/                 # Public assets (jei turite)
├── index.html              # Entry point
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
├── vite.config.ts          # Vite config
├── netlify.toml            # Netlify config
├── _redirects              # Netlify redirects
└── .gitignore             # Git ignore rules
```

### Kas NETURĖTŲ Būti GitHub Repo:

```
❌ node_modules/           # Netlify installs automatically
❌ dist/                   # Netlify builds automatically
❌ GG16/, GG17/, etc/      # Backup folders
❌ *.zip                   # ZIP files
❌ .env                    # Environment variables (naudokite Netlify UI)
```

---

## 🔧 Netlify Build Settings su GitHub

### Netlify Automatiškai Naudoja:

1. **Build Command:**
   - Iš `netlify.toml`: `command = "rm -rf dist && npm install && npm run build"`
   - ARBA jei nėra `netlify.toml`, naudoja default: `npm install && npm run build`

2. **Publish Directory:**
   - Iš `netlify.toml`: `publish = "dist"`
   - ARBA jei nėra, naudoja default: `dist`

3. **Environment Variables:**
   - Iš Netlify Dashboard → Site settings → Environment variables
   - ARBA iš `netlify.toml` (bet geriau naudoti Dashboard)

---

## ✅ Kaip Tai Išspręstų Dabartines Problemas

### Problema 1: "0 new file(s) to upload"
**Sprendimas:**
- GitHub deployment build'ina iš fresh code
- Netlify nekeša senų cached failų
- Kiekvienas build yra naujas

### Problema 2: Netlify UI Override'ina netlify.toml
**Sprendimas:**
- GitHub deployment naudoja `netlify.toml` iš repo
- Netlify UI settings neoverride'ina (jei paliksite tuščius)
- Build command visada iš `netlify.toml`

### Problema 3: Cache Problema
**Sprendimas:**
- GitHub deployment build'ina iš fresh repo
- Netlify cache naudoja tik `node_modules` (ne build output)
- Build output visada naujas

### Problema 4: Manual ZIP Upload
**Sprendimas:**
- Nereikia rankiniu būdu kurti ZIP failų
- Tiesiog `git push` → automatinis deployment

---

## 🚀 Deployment Workflow su GitHub

### Kiekvieną Kartą Kai Atnaujinate Žaidimą:

1. **Padarykite Pakeitimus:**
   ```bash
   # Redaguokite failus
   # Pvz: src/simple-main.ts
   ```

2. **Commit'inkite:**
   ```bash
   git add .
   git commit -m "Add new weapon - bullet with paralysis"
   ```

3. **Push'inkite:**
   ```bash
   git push
   ```

4. **Netlify Automatiškai:**
   - Detektuoja naują commit
   - Build'ina
   - Deploy'ina
   - Žaidimas atnaujinamas!

**Total time: ~2-3 minutes** ⚡

---

## 📋 Checklist: GitHub Deployment Setup

- [ ] GitHub repository sukurtas
- [ ] Kodas push'intas į GitHub
- [ ] Netlify site sukurtas
- [ ] GitHub integration nustatyta
- [ ] Build settings patikrinti (palikti tuščius arba teisingi)
- [ ] Environment variables pridėti (jei reikia)
- [ ] Pirmas deployment sėkmingas
- [ ] Build logs rodo naują hash
- [ ] Build logs rodo "2+ new file(s) to upload"

---

## 💡 Rekomendacija

**GitHub Deployment yra GERESNIS nei Manual ZIP:**

✅ Automatinis deployment  
✅ Nėra cache problemų  
✅ Build history  
✅ Lengviau atnaujinti  
✅ Nėra UI override problemų  

**Rekomenduoju pereiti į GitHub Deployment!**

---

## 🔧 Jei Vis Dar Turite Problemas

1. **Patikrinkite Build Logs:**
   - Netlify → Deploys → Build logs
   - Turėtų rodyti naują hash

2. **Patikrinkite Build Settings:**
   - Netlify → Site settings → Build & deploy → Build settings
   - Build command turėtų būti TUŠČIAS (arba teisingas)
   - Netlify naudos `netlify.toml` iš repo

3. **Patikrinkite GitHub Repo:**
   - Ar `netlify.toml` yra repo root?
   - Ar `package.json` turi teisingą version?
   - Ar visi source failai yra repo?

---

**GitHub Deployment yra STANDARTINIS būdas deploy'inti į Netlify!**

