# 🚀 GitHub Setup - Kaip Paruošti Projektą Netlify Deployment

## ✅ Kas Jau Paruošta

1. ✅ `.gitignore` failas su teisingais nustatymais
2. ✅ Source failai paruošti
3. ✅ `netlify.toml` konfigūracija
4. ✅ `package.json` su dependencies

---

## 📋 Žingsnis po Žingsnio Instrukcijos

### Step 1: Įdiekite Git (Jei Neturite)

**Option A: GitHub Desktop (Rekomenduojama - Lengviausia)**

1. **Parsisiųskite GitHub Desktop:**
   - https://desktop.github.com
   - Įdiekite su default settings

2. **Prisijunkite:**
   - Atidarykite GitHub Desktop
   - Prisijunkite su GitHub account

**Option B: Git CLI**

1. **Parsisiųskite Git:**
   - https://git-scm.com/download/win
   - Įdiekite su default settings

---

### Step 2: Sukurkite GitHub Repository

1. **Eikite į GitHub:**
   - https://github.com
   - Prisijunkite

2. **Sukurkite Naują Repository:**
   - Spustelėkite "+" (viršuje dešinėje) → "New repository"
   - **Repository name:** `pvp03` (arba bet koks kitas)
   - **Description:** "PvP Game - DOT Clicker"
   - **Public** arba **Private** (nesvarbu)
   - **NEPRIDĖKITE** README, .gitignore, ar license (tuščias repo)
   - Spustelėkite "Create repository"

3. **Kopijuokite Repository URL:**
   - Pvz: `https://github.com/jusu-username/pvp03.git`
   - ARBA: `git@github.com:jusu-username/pvp03.git`

---

### Step 3: Inicializuokite Git Lokaliame Projekte

**Jei Naudojate GitHub Desktop:**

1. **Atidarykite GitHub Desktop**
2. **File → Add Local Repository**
3. **Pasirinkite:** `C:\Users\p3p3l\Downloads\pvp03`
4. **Publish Repository:**
   - Spustelėkite "Publish repository"
   - Pasirinkite repository name: `pvp03`
   - Pasirinkite "Keep this code private" (jei norite)
   - Spustelėkite "Publish repository"

**Jei Naudojate Git CLI:**

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

---

### Step 4: Patikrinkite Kas Push'inta

**GitHub Desktop:**
- Turėtumėte matyti visus failus GitHub'e

**GitHub Web:**
- Eikite į: `https://github.com/jusu-username/pvp03`
- Turėtumėte matyti visus failus:
  - ✅ `src/` folder
  - ✅ `package.json`
  - ✅ `netlify.toml`
  - ✅ `vite.config.ts`
  - ✅ `index.html`

---

### Step 5: Netlify → Import from Git

1. **Eikite į Netlify Dashboard:**
   - https://app.netlify.com
   - Prisijunkite

2. **Add New Site:**
   - Spustelėkite "Add new site" (viršuje dešinėje)
   - Spustelėkite "Import an existing project"

3. **Pasirinkite GitHub:**
   - Spustelėkite "GitHub" (arba "GitLab"/"Bitbucket")
   - Autorizuokite Netlify prieigą prie GitHub (jei reikia)

4. **Pasirinkite Repository:**
   - Ieškokite `pvp03` (arba jūsų repo name)
   - Spustelėkite repository

5. **Configure Build Settings:**
   - **Build command:** PALIKITE TUŠČIĄ (Netlify naudos `netlify.toml`)
   - **Publish directory:** `dist` (arba palikite TUŠČIĄ, Netlify naudos iš `netlify.toml`)
   - **Base directory:** PALIKITE TUŠČIĄ

6. **Environment Variables (Jei Reikia):**
   - Spustelėkite "Show advanced"
   - Pridėkite:
     - **Key:** `VITE_SUPABASE_URL`
     - **Value:** jūsų Supabase URL
   - Pridėkite:
     - **Key:** `VITE_SUPABASE_ANON_KEY`
     - **Value:** jūsų Supabase anon key
   - Pridėkite (jei turite Colyseus):
     - **Key:** `VITE_COLYSEUS_ENDPOINT`
     - **Value:** jūsų Colyseus endpoint

7. **Deploy Site:**
   - Spustelėkite "Deploy site"
   - Netlify automatiškai build'ina ir deploy'ina!

---

### Step 6: Patikrinkite Build Logs

Po deploy, patikrinkite build logs:

**Turėtų rodyti:**
- ✅ Build command: `rm -rf dist && npm install && npm run build` (iš `netlify.toml`)
- ✅ Version: `1.0.19`
- ✅ Build output: `dist/assets/index-[hash]-1.0.19-[timestamp].js`
- ✅ **"2+ new file(s) to upload"** (ne 0!)
- ✅ Deploy status: `"Site is live ✨"`

---

## 🔄 Kiekvieną Kartą Kai Atnaujinate Žaidimą

### Workflow:

1. **Padarykite Pakeitimus:**
   - Redaguokite failus (pvz: `src/simple-main.ts`)

2. **Commit'inkite ir Push'inkite:**

   **GitHub Desktop:**
   - Parašykite commit message (pvz: "Add new weapon")
   - Spustelėkite "Commit to main"
   - Spustelėkite "Push origin"

   **Git CLI:**
   ```bash
   git add .
   git commit -m "Add new weapon - bullet with paralysis"
   git push
   ```

3. **Netlify Automatiškai:**
   - Detektuoja naują commit
   - Build'ina
   - Deploy'ina
   - Žaidimas atnaujinamas per 2-3 minutes!

---

## ✅ Patikrinimo Checklist

- [ ] Git įdiegtas (GitHub Desktop arba Git CLI)
- [ ] GitHub repository sukurtas
- [ ] Kodas push'intas į GitHub
- [ ] Netlify site sukurtas
- [ ] GitHub integration nustatyta
- [ ] Build settings patikrinti (Build command TUŠČIAS)
- [ ] Environment variables pridėti (jei reikia)
- [ ] Pirmas deployment sėkmingas
- [ ] Build logs rodo naują hash
- [ ] Build logs rodo "2+ new file(s) to upload"

---

## 🔧 Troubleshooting

### Problema: "Repository not found"

**Sprendimas:**
- Patikrinkite, ar repository URL teisingas
- Patikrinkite, ar Netlify turi prieigą prie GitHub

### Problema: Build fails

**Sprendimas:**
- Patikrinkite build logs
- Patikrinkite, ar `netlify.toml` yra repo root
- Patikrinkite, ar `package.json` turi teisingus dependencies

### Problema: "0 new file(s) to upload"

**Sprendimas:**
- Patikrinkite, ar `vite.config.ts` turi `buildId` su timestamp
- Patikrinkite, ar `netlify.toml` turi `rm -rf dist` build command

---

## 💡 Svarbiausia

**GitHub Deployment yra STANDARTINIS būdas deploy'inti į Netlify!**

✅ Automatinis deployment  
✅ Nėra cache problemų  
✅ Netlify naudoja `netlify.toml` iš repo  
✅ Build history su commit messages  
✅ Lengviau atnaujinti  

**Po setup'o, tiesiog `git push` → automatinis deploy!**

