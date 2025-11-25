# 📤 Kaip Push'inti Kodą į GitHub

## ❌ Problema: Repository Tuščias

GitHub repository yra tuščias - nėra branch'ų, nėra failų. Reikia push'inti kodą.

---

## 🚀 Sprendimas: Push Kodą į GitHub

### Option 1: GitHub Desktop (Lengviausias)

#### Step 1: Įdiekite GitHub Desktop

1. Parsisiųskite: **https://desktop.github.com/**
2. Įdiekite ir prisijunkite

#### Step 2: Clone Repository

1. GitHub Desktop → File → Clone Repository → URL
2. Įdėkite: `https://github.com/bitcointeamlt-blip/ok5.git`
3. Clone Location: `C:\Users\p3p3l\Downloads\ok5-github`
4. Clone

#### Step 3: Kopijuokite Failus

1. Nukopijuokite **VISUS** failus iš `C:\Users\p3p3l\Downloads\ok4`
2. Į `C:\Users\p3p3l\Downloads\ok5-github`
3. **SVARBU**: Įtraukite `colyseus-server/` folderį!

#### Step 4: Commit & Push

1. GitHub Desktop → matysite visus failus
2. Commit message: "Initial commit with Colyseus server"
3. Spustelėkite **"Commit to main"**
4. Spustelėkite **"Push origin"**

---

### Option 2: GitHub Web Upload

#### Step 1: Upload Failus

1. GitHub → Repository → Code
2. Spustelėkite **"uploading an existing file"**
3. Drag & drop failus iš `ok4` folderio
4. **Problema**: Negalite upload'inti folderių tiesiogiai

**Sprendimas**: Naudokite ZIP arba GitHub Desktop

---

### Option 3: Git CLI (Jei Turite Git)

#### Step 1: Inicializuokite Git

```bash
cd C:\Users\p3p3l\Downloads\ok4
git init
git add .
git commit -m "Initial commit with Colyseus server"
```

#### Step 2: Susiekite su GitHub

```bash
git remote add origin https://github.com/bitcointeamlt-blip/ok5.git
git branch -M main
git push -u origin main
```

**Problema**: Git nėra įdiegtas jūsų sistemoje.

---

## 💡 Rekomendacija: GitHub Desktop

**Naudokite GitHub Desktop** - lengviausias būdas!

1. Įdiekite GitHub Desktop
2. Clone repository
3. Kopijuokite failus
4. Commit & Push

---

## ✅ Po Push

Po sėkmingo push:

1. GitHub → Repository → turėtumėte matyti failus
2. Branch `main` bus sukurtas
3. Colyseus Cloud → "SELECT BRANCH" → turėtumėte matyti `main`

---

## 📋 Checklist

- [ ] GitHub Desktop įdiegtas
- [ ] Repository clone'intas
- [ ] Failai nukopijuoti
- [ ] Commit padarytas
- [ ] Push į GitHub
- [ ] Branch `main` sukurtas
- [ ] Colyseus Cloud mato branch'us

**Ar turite GitHub Desktop įdiegtą?**

