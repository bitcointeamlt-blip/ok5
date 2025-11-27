# 📤 Kaip Įkelti Žaidimą į GitHub

## 🚀 Greitas Start

### Jei Repository Jau Egzistuoja

```bash
# 1. Patikrinkite git status
git status

# 2. Pridėkite visus failus
git add .

# 3. Commit
git commit -m "Add Colyseus server integration"

# 4. Push į GitHub
git push origin main
```

### Jei Repository Dar Nėra

#### Option 1: Sukurti Naują Repository GitHub'e

1. Eikite: https://github.com/new
2. Sukurkite naują repository:
   - Name: `dot-clicker-game` (arba bet koks kitas)
   - Public arba Private
   - **NE** sukurkite README (jau turime)
3. Spustelėkite "Create repository"

#### Option 2: Push į Esamą Repository

```bash
# 1. Inicializuokite git (jei dar nepadaryta)
git init

# 2. Pridėkite remote repository
git remote add origin https://github.com/JUSU_USERNAME/JUSU_REPO.git

# 3. Pridėkite visus failus
git add .

# 4. Commit
git commit -m "Initial commit with Colyseus integration"

# 5. Push
git push -u origin main
```

## 📋 Detalios Instrukcijos

### Step 1: Patikrinkite Git Status

```bash
git status
```

Jei matai "not a git repository":
```bash
git init
```

### Step 2: Sukurkite .gitignore (jei nėra)

```bash
# Sukurkite .gitignore failą
```

### Step 3: Pridėkite Failus

```bash
git add .
```

### Step 4: Commit

```bash
git commit -m "Add Colyseus server integration"
```

### Step 5: Susiekite su GitHub

```bash
# Jei repository jau egzistuoja
git remote add origin https://github.com/JUSU_USERNAME/JUSU_REPO.git

# Arba jei jau yra remote
git remote set-url origin https://github.com/JUSU_USERNAME/JUSU_REPO.git
```

### Step 6: Push

```bash
git push -u origin main
```

## ⚠️ SVARBU: Kas Turi Būti GitHub'e

✅ **Turi būti**:
- `colyseus-server/` folderis (su visais failais)
- `src/` folderis
- `package.json`
- `vite.config.ts`
- `tsconfig.json`
- `index.html`

❌ **NETURI būti**:
- `node_modules/` (pridėkite į .gitignore)
- `dist/` (pridėkite į .gitignore)
- `.env` (pridėkite į .gitignore)
- `build/` (pridėkite į .gitignore)

## 🔧 Troubleshooting

### "Permission denied"
- Patikrinkite, ar turite access į repository
- Naudokite SSH key arba GitHub token

### "Repository not found"
- Patikrinkite repository URL
- Patikrinkite, ar repository egzistuoja GitHub'e

### "Large files"
- Patikrinkite .gitignore
- Neįtraukite `node_modules/` ir `dist/`

