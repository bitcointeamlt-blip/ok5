# 📋 GitHub Commit Instrukcijos

## 🎯 Kaip Commit'inti Paruoštą Kodą

Aš negaliu tiesiogiai commit'inti į GitHub be jūsų autentifikacijos, bet galiu paruošti viską commit'ui.

---

## ✅ Būdas 1: PowerShell Script (Jei Git įdiegtas)

### 1. Paleiskite Script'ą

```powershell
.\commit-to-github.ps1
```

Script'as automatiškai:
- ✅ Patikrina Git konfigūraciją
- ✅ Prideda visus failus
- ✅ Commit'ina su žinute
- ✅ Push'ina į GitHub

---

## ✅ Būdas 2: GitHub Desktop (REKOMENDUOJAMA)

### 1. Įdiekite GitHub Desktop

Atsisiųskite iš: https://desktop.github.com/

### 2. Prisijunkite prie GitHub

- Atidarykite GitHub Desktop
- Prisijunkite su savo GitHub account'u
- Pasirinkite repository `ok06`

### 3. Commit'inkite

1. GitHub Desktop automatiškai parodys visus pakeitimus
2. Matysite:
   - `colyseus-server/src/index.ts` - pakeistas CORS kodas
   - `colyseus-server/build/index.js` - kompiliuotas kodas
   - Kiti failai

3. **Summary** laukelyje įrašykite:
   ```
   Fix: Colyseus CORS - HTTP server request listener for matchmaking endpoints
   ```

4. Spustelėkite **"Commit to main"**

5. Spustelėkite **"Push origin"** arba **"Push"** mygtuką

---

## ✅ Būdas 3: VS Code Git Integracija

### 1. Atidarykite VS Code

### 2. Eikite į Source Control (Ctrl+Shift+G)

### 3. Matysite visus pakeitimus

### 4. Commit'inkite:

1. Spustelėkite **"+"** prie failų, kad pridėtumėte juos
2. Įrašykite commit message:
   ```
   Fix: Colyseus CORS - HTTP server request listener for matchmaking endpoints
   ```
3. Spustelėkite **"✓ Commit"**
4. Spustelėkite **"Sync Changes"** arba **"Push"**

---

## ✅ Būdas 4: Terminal Komandos (Jei Git įdiegtas)

### 1. Patikrinkite Git konfigūraciją

```powershell
git config --get user.name
git config --get user.email
```

Jei nerasta, nustatykite:
```powershell
git config --global user.name "Jūsų Vardas"
git config --global user.email "jūsų@email.com"
```

### 2. Patikrinkite Remote Repository

```powershell
git remote -v
```

Jei nerasta, pridėkite:
```powershell
git remote add origin https://github.com/jūsų-username/ok06.git
```

### 3. Commit'inkite

```powershell
# Pridėti visus failus
git add .

# Commit'inti
git commit -m "Fix: Colyseus CORS - HTTP server request listener for matchmaking endpoints"

# Push'inti į GitHub
git push origin main
```

---

## 📋 Kas Bus Commit'inta

### Pakeisti Failai:

1. **`colyseus-server/src/index.ts`**
   - Pridėtas HTTP server `request` event listener
   - CORS headers nustatomi prieš Colyseus apdoroja request'us
   - OPTIONS request'ai apdorojami iš karto

2. **`colyseus-server/build/index.js`**
   - Kompiliuotas TypeScript kodas

### Dokumentacijos Failai:

- `TEISINGAS-COLYSEUS-START.md`
- `GALUTINE-ANALIZE-IR-SPRENDIMAS.md`
- `COLYSEUS-OFICIALUS-PAVYZDYS.md`
- `PORTO-KEITIMAS-NEPADES.md`
- Ir kiti...

---

## 🚀 Po Commit'o

1. **Colyseus Cloud** automatiškai gaus naują kodą iš GitHub
2. **PM2** restart'ins serverį su nauju kodu
3. **CORS problema** turėtų būti išspręsta

---

## ❓ Jei Kyla Problemų

### Git Nerastas

**Sprendimas:** Įdiekite Git:
- https://git-scm.com/download/win
- Arba naudokite GitHub Desktop

### Remote Repository Nerastas

**Sprendimas:** Pridėkite remote:
```powershell
git remote add origin https://github.com/jūsų-username/ok06.git
```

### Push Nepavyko

**Sprendimas:** Patikrinkite:
- Ar turite teises push'inti
- Ar naudojate teisingą branch'ą (main/master)
- Ar turite interneto ryšį

---

## 💡 Rekomendacija

**Naudokite GitHub Desktop** - tai lengviausias būdas commit'inti ir push'inti kodą!
