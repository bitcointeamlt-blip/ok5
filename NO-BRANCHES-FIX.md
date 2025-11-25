# ❌ Problema: "No branches available"

## 🔍 Problema

Matau, kad "SELECT BRANCH" dropdown rodo:
- "No branches available"
- "0 of 0 branches"

Tai reiškia, kad repository neturi branch'ų arba Colyseus Cloud negali juos gauti.

---

## ✅ Sprendimas

### Option 1: Sukurkite Branch GitHub'e (Rekomenduojama)

#### Step 1: Patikrinkite GitHub Repository

1. Eikite į: `https://github.com/bitcointeamlt-blip/ok5`
2. Patikrinkite, ar repository turi failus
3. Patikrinkite, ar yra branch'ų (viršuje, šalia repository name)

#### Step 2: Jei Nėra Branch'ų

**Sukurkite `main` branch**:

1. GitHub → Repository → Code
2. Jei matote "main" arba "master" → jau yra branch
3. Jei ne → sukurkite branch:

**Būdas A: Per GitHub Web**
1. Spustelėkite branch dropdown (viršuje)
2. Įdėkite "main" ir spustelėkite "Create branch: main"

**Būdas B: Per GitHub Desktop**
1. Clone repository
2. Sukurkite failą (pvz: README.md)
3. Commit → Push
4. Automatiškai sukurs `main` branch

**Būdas C: Per Git CLI** (jei turite Git)
```bash
cd C:\Users\p3p3l\Downloads\ok4
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/bitcointeamlt-blip/ok5.git
git push -u origin main
```

#### Step 3: Patikrinkite Colyseus Cloud

1. Grįžkite į Colyseus Cloud
2. Spustelėkite "SELECT BRANCH" dar kartą
3. Turėtumėte matyti branch'us (pvz: `main`, `master`)

---

### Option 2: Patikrinkite GitHub Aplikacijos Teises

#### Step 1: Patikrinkite GitHub Aplikaciją

1. GitHub → Repository → Settings → Deploy keys
2. Patikrinkite, ar SSH key pridėtas
3. Patikrinkite, ar "Allow write access" pažymėtas

#### Step 2: Patikrinkite GitHub Aplikacijos Teises

1. GitHub → Settings → Applications → Installed GitHub Apps
2. Raskite "Colyseus Cloud Deploy"
3. Patikrinkite, ar turi access į repository

---

### Option 3: Susiekite Repository Dar Kartą

Jei branch'ų vis dar nėra:

1. Colyseus Cloud → Build & Deployment
2. Deployment sekcijoje
3. Spustelėkite "OK5" dropdown
4. Pasirinkite repository dar kartą
5. Patikrinkite, ar branch'ai atsiranda

---

## 🔍 Troubleshooting

### Problema: Repository Tuščias

**Sprendimas**:
- Sukurkite bent vieną failą (pvz: README.md)
- Commit → Push
- Sukurs branch

### Problema: GitHub Aplikacija Neturi Teisių

**Sprendimas**:
- GitHub → Settings → Applications
- Patikrinkite "Colyseus Cloud Deploy" teises
- Suteikite access į repository

### Problema: Branch'ai Egzistuoja, Bet Colyseus Cloud Nemato

**Sprendimas**:
- Patikrinkite, ar repository yra public arba turite access
- Patikrinkite GitHub aplikacijos teises
- Susiekite repository dar kartą

---

## 💡 Greitas Sprendimas

1. **Eikite į GitHub**: `https://github.com/bitcointeamlt-blip/ok5`
2. **Patikrinkite branch'us** (viršuje, šalia repository name)
3. **Jei nėra** → sukurkite `main` branch
4. **Grįžkite į Colyseus Cloud** → "SELECT BRANCH"
5. **Turėtumėte matyti branch'us**

---

## 📋 Checklist

- [ ] GitHub repository turi branch'us?
- [ ] GitHub aplikacija turi access?
- [ ] Repository susietas Colyseus Cloud?
- [ ] Branch'ai matomi Colyseus Cloud?

**Ar GitHub repository turi branch'us?**

