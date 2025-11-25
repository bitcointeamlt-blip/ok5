# 📁 Kaip Nukopijuoti Failus į GitHub Repository

## ❌ Problema: "No local changes"

GitHub Desktop rodo "No local changes" - tai reiškia, kad failai dar nebuvo nukopijuoti į repository folderį.

---

## ✅ Sprendimas: Nukopijuokite Failus

### Step 1: Raskite Repository Folderį

GitHub Desktop → Repository → Show in Explorer
ARBA
Spustelėkite "Show in Explorer" mygtuką GitHub Desktop'e

Tai atidarys folderį, kur clone'intas repository (pvz: `C:\Users\p3p3l\Downloads\ok5`)

### Step 2: Nukopijuokite VISUS Failus

1. Atidarykite **File Explorer**
2. Eikite į: `C:\Users\p3p3l\Downloads\ok4`
3. **Pasirinkite VISUS failus** (Ctrl+A)
4. **Nukopijuokite** (Ctrl+C)
5. Eikite į repository folderį (pvz: `C:\Users\p3p3l\Downloads\ok5`)
6. **Įdėkite** (Ctrl+V)

**SVARBU**: Įtraukite:
- ✅ `colyseus-server/` folderis
- ✅ `src/` folderis
- ✅ `package.json`
- ✅ `vite.config.ts`
- ✅ `tsconfig.json`
- ✅ `index.html`
- ✅ Visi kiti failai

### Step 3: Patikrinkite GitHub Desktop

1. Grįžkite į **GitHub Desktop**
2. Turėtumėte matyti **"Changes"** tab'e visus failus
3. Turėtumėte matyti: "X changed files" (pvz: "50 changed files")

### Step 4: Commit

1. **Summary**: "Initial commit with Colyseus server"
2. **Description**: (palikite tuščią arba pridėkite aprašymą)
3. Spustelėkite **"Commit to main"**

### Step 5: Push

1. Po commit, turėtumėte matyti **"Publish branch"** arba **"Push origin"**
2. Spustelėkite **"Push origin"** arba **"Publish branch"**
3. Palaukite, kol push baigsis

---

## 📋 Checklist

- [ ] Repository folderis atidarytas (Show in Explorer)
- [ ] Failai nukopijuoti iš `ok4` į repository folderį
- [ ] `colyseus-server/` folderis įtrauktas
- [ ] GitHub Desktop rodo "X changed files"
- [ ] Commit padarytas
- [ ] Push į GitHub

---

## 🔍 Troubleshooting

### Problema: Negaliu rasti repository folderio

**Sprendimas**:
- GitHub Desktop → Repository → Show in Explorer
- ARBA spustelėkite "Show in Explorer" mygtuką

### Problema: Failai neatsiranda GitHub Desktop'e

**Sprendimas**:
- Patikrinkite, ar failai nukopijuoti į teisingą folderį
- Refresh GitHub Desktop (F5)
- Patikrinkite, ar nėra `.gitignore` failo, kuris slepia failus

### Problema: "Cannot publish: no commits"

**Sprendimas**:
- Padarykite commit pirmiausia
- Tada bus galima push'inti

---

## 💡 Greitas Būdas

1. **GitHub Desktop** → "Show in Explorer"
2. **File Explorer** → `ok4` → Ctrl+A → Ctrl+C
3. **Repository folderis** → Ctrl+V
4. **GitHub Desktop** → Commit → Push

**Ar nukopijavote failus?**

