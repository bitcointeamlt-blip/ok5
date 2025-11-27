# 📋 Step-by-Step: Kaip Išvalyti Git ir Įkelti Tik Teisingą Kodą

## 🎯 Tikslus Planas

### Option 1: GitHub Desktop (Lengviausias Būdas) ⭐ REKOMENDUOJAMA

#### Step 1: Atidarykite GitHub Desktop

1. Atidarykite **GitHub Desktop**
2. Pasirinkite repository: `pvp03-new`

---

#### Step 2: Ištrinkite Build Folderį iš Git

1. **Kairėje pusėje** (Changes) matysite visus failus
2. **Raskite** `colyseus-server/build/` folderį
3. **Dešiniuoju pelės mygtuku** ant `build/` → **Discard** (arba **Unstage**)
4. **ARBA:** Pažymėkite checkbox'ą prie `build/` → **Unstage**

**SVARBU:** Tai ištrins build folderį iš Git, bet **NE iš jūsų kompiuterio**!

---

#### Step 3: Pridėkite .gitignore

1. **Raskite** `colyseus-server/.gitignore` failą
2. **Pažymėkite checkbox'ą** prie `.gitignore`
3. Jis bus **staged** (paruoštas commit'ui)

---

#### Step 4: Commit → Push

1. **Apatinėje dalyje** (Summary) įrašykite:
   ```
   Remove build folder from Git - should be generated automatically
   ```
2. Spustelėkite **Commit to main** (arba **Commit to master**)
3. Spustelėkite **Push origin** (viršuje)

**✅ DONE!** Build folderis dabar nėra Git'e!

---

### Option 2: PowerShell (Jei Naudojate Komandų Eilutę)

#### Step 1: Atidarykite PowerShell

1. Spustelėkite **Windows** mygtuką
2. Ieškokite **PowerShell**
3. Atidarykite **PowerShell**

---

#### Step 2: Eikite į Repository Folderį

```powershell
cd C:\Users\p3p3l\Downloads\pvp03-new
```

**Patikrinkite:** Turėtumėte matyti `pvp03-new` folderyje.

---

#### Step 3: Ištrinkite Build Folderį iš Git

```powershell
git rm -r --cached colyseus-server/build
```

**SVARBU:** `--cached` reiškia, kad ištrins tik iš Git, bet **NE iš jūsų kompiuterio**!

---

#### Step 4: Pridėkite .gitignore

```powershell
git add colyseus-server/.gitignore
```

---

#### Step 5: Commit → Push

```powershell
git commit -m "Remove build folder from Git - should be generated automatically"
git push
```

**✅ DONE!** Build folderis dabar nėra Git'e!

---

## 🔍 Patikrinimas

### Po Commit → Push:

1. **Eikite į GitHub** (jūsų repository)
2. **Patikrinkite:**
   - [ ] `colyseus-server/build/` **NĖRA** Git'e ✅
   - [ ] `colyseus-server/src/` **YRA** Git'e ✅
   - [ ] `colyseus-server/.gitignore` **YRA** Git'e ✅

---

## 🚀 Po To: Redeploy Colyseus Serveris

### Colyseus Cloud Dashboard:

1. **Eikite į:** https://cloud.colyseus.io
2. **Prisijunkite**
3. **Pasirinkite aplikaciją**
4. **Deployments** → **Deploy** (arba **Redeploy**)
5. **Palaukite 2-5 min**

**Colyseus Cloud automatiškai:**
- Pull'ins kodą iš GitHub
- Build'ins iš source kodo (`npm run build`)
- Sukurs naują build folderį su teisinga CORS konfigūracija
- Deploy'ins su nauja versija

---

## ✅ Patikrinimas Po Deploy

### Colyseus Cloud → Logs:

**Turėtumėte matyti:**
```
✅ Server running on port XXXX
[CORS] Matchmaking request from origin: https://jocular-zabaione-835b49.netlify.app
```

**Jei matote CORS log'us:** Serveris deploy'intas su nauja versija! ✅

---

## 📋 Checklist

### Prieš:
- [x] ✅ `.gitignore` sukurtas
- [x] ✅ Source kodas teisingas
- [ ] ⚠️ Build folderis ištrintas iš Git
- [ ] ⚠️ Commit → Push

### Po:
- [ ] ⚠️ GitHub neturi build folderio
- [ ] ⚠️ Colyseus Cloud deploy'intas
- [ ] ⚠️ CORS log'ai yra
- [ ] ⚠️ Frontend prisijungia

---

## 🎯 Išvada

**Dabar:**
1. Ištrinkite build folderį iš Git (GitHub Desktop ARBA PowerShell)
2. Commit → Push
3. Colyseus Cloud automatiškai build'ins iš source kodo
4. Redeploy'inti serverį

**Po to viskas veiks!** 🚀

