# 📤 Kaip Įkelti Žaidimą į GitHub - Detalios Instrukcijos

## 🎯 3 Būdai Įkelti į GitHub

### Būdas 1: GitHub Desktop (Lengviausias - Rekomenduojama)

#### 1. Įdiekite GitHub Desktop
- Parsisiųskite: https://desktop.github.com/
- Įdiekite ir prisijunkite prie GitHub account'o

#### 2. Sukurkite Repository GitHub'e
1. Eikite: https://github.com/new
2. Sukurkite repository:
   - Name: `dot-clicker-game` (arba bet koks)
   - Public arba Private
   - **NE** sukurkite README
3. Spustelėkite "Create repository"

#### 3. Clone arba Add Local Repository
**GitHub Desktop**:
1. File → Add Local Repository
2. Pasirinkite `C:\Users\p3p3l\Downloads\ok4` folderį
3. Jei prašo inicializuoti - spustelėkite "Create a Repository"

#### 4. Commit ir Push
1. GitHub Desktop → matysite visus failus
2. Užrašykite commit message: "Add Colyseus server integration"
3. Spustelėkite "Commit to main"
4. Spustelėkite "Push origin"

**SVARBU**: Patikrinkite, kad `colyseus-server/` folderis yra commit'intas!

---

### Būdas 2: GitHub Web Interface (Jei nėra Git)

#### 1. Sukurkite Repository GitHub'e
1. Eikite: https://github.com/new
2. Sukurkite repository (pvz: `dot-clicker-game`)
3. **NE** sukurkite README

#### 2. Upload Failus per Web
1. Repository → "uploading an existing file"
2. Drag & drop visus failus iš `ok4` folderio
3. **SVARBU**: Įtraukite `colyseus-server/` folderį!
4. Commit message: "Add Colyseus server integration"
5. Spustelėkite "Commit changes"

**Problema**: Negalite upload'inti folderių tiesiogiai. Reikia:
- Sukurti `colyseus-server` folderį GitHub'e
- Upload'inti failus po vieną arba naudoti ZIP

---

### Būdas 3: Git Command Line (Jei įdiegsite Git)

#### 1. Įdiekite Git
- Parsisiųskite: https://git-scm.com/download/win
- Įdiekite su default settings

#### 2. Terminal Komandos

```bash
# 1. Eikite į projektą
cd C:\Users\p3p3l\Downloads\ok4

# 2. Inicializuokite git (jei dar nepadaryta)
git init

# 3. Pridėkite remote repository
git remote add origin https://github.com/JUSU_USERNAME/JUSU_REPO.git

# 4. Pridėkite visus failus
git add .

# 5. Commit
git commit -m "Add Colyseus server integration"

# 6. Push
git push -u origin main
```

---

## ✅ Kas Turi Būti GitHub'e

**SVARBU**: Patikrinkite, kad šie failai/folderiai yra:

✅ **Turi būti**:
- `colyseus-server/` (su visais failais)
- `src/` folderis
- `package.json`
- `vite.config.ts`
- `tsconfig.json`
- `index.html`
- `.gitignore`

❌ **NETURI būti**:
- `node_modules/` (jau .gitignore)
- `dist/` (jau .gitignore)
- `.env` (jau .gitignore)

---

## 🔍 Patikrinimas

Po upload, patikrinkite GitHub repository:
1. Eikite į savo repository GitHub'e
2. Patikrinkite, ar matote `colyseus-server/` folderį
3. Patikrinkite, ar `colyseus-server/src/` turi failus

---

## 💡 Rekomendacija

**Naudokite GitHub Desktop** - lengviausias būdas!

1. Įdiekite GitHub Desktop
2. Sukurkite repository GitHub'e
3. Add Local Repository
4. Commit & Push

Ar norite, kad padėčiau su GitHub Desktop setup?

