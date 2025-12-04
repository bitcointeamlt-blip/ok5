# 🗑️ Kaip Ištrinti build ir node_modules iš Git

## ✅ Ką Reikia Ištrinti iš Git:

1. ❌ `colyseus-server/build/` - neturėtų būti Git'e
2. ❌ `colyseus-server/node_modules/` - neturėtų būti Git'e

**SVARBU:** Ištrinsime tik iš Git, bet NE iš jūsų kompiuterio!

---

## 🚀 GitHub Desktop - Step-by-Step

### Step 1: Atidarykite GitHub Desktop

1. Atidarykite **GitHub Desktop**
2. Pasirinkite repository: `pvp03-new`

---

### Step 2: Ištrinkite build ir node_modules iš Git

**Kairėje pusėje (Changes) matysite visus failus:**

1. **Raskite** `colyseus-server/build/` folderį
2. **Dešiniuoju pelės mygtuku** ant `build/` → **Discard** (arba **Unstage**)
   - **ARBA:** Pažymėkite checkbox'ą prie `build/` → **Unstage**

3. **Raskite** `colyseus-server/node_modules/` folderį
4. **Dešiniuoju pelės mygtuku** ant `node_modules/` → **Discard** (arba **Unstage**)
   - **ARBA:** Pažymėkite checkbox'ą prie `node_modules/` → **Unstage**

**SVARBU:** 
- Tai ištrins folderius iš Git, bet **NE iš jūsų kompiuterio**!
- Folderiai liks jūsų kompiuteryje, bet nebus commit'inti

---

### Step 3: Pridėkite .gitignore

1. **Raskite** `colyseus-server/.gitignore` failą
2. **Pažymėkite checkbox'ą** prie `.gitignore`
3. Jis bus **staged** (paruoštas commit'ui)

**Patikrinkite:** `.gitignore` turėtų turėti:
```
build/
node_modules/
```

---

### Step 4: Commit → Push

1. **Apatinėje dalyje** (Summary) įrašykite:
   ```
   Remove build and node_modules from Git - should be generated automatically
   ```
2. Spustelėkite **Commit to main** (arba **Commit to master**)
3. Spustelėkite **Push origin** (viršuje)

**✅ DONE!** `build` ir `node_modules` dabar nėra Git'e!

---

## 🔍 Patikrinimas Po Commit → Push

### GitHub Repository:

1. **Eikite į GitHub** (jūsų repository)
2. **Patikrinkite:**
   - [ ] `colyseus-server/build/` **NĖRA** Git'e ✅
   - [ ] `colyseus-server/node_modules/` **NĖRA** Git'e ✅
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
- Pull'ins kodą iš GitHub (be build ir node_modules)
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
- [ ] ⚠️ `build` folderis ištrintas iš Git
- [ ] ⚠️ `node_modules` folderis ištrintas iš Git
- [ ] ⚠️ Commit → Push

### Po:
- [ ] ⚠️ GitHub neturi `build` folderio
- [ ] ⚠️ GitHub neturi `node_modules` folderio
- [ ] ⚠️ Colyseus Cloud deploy'intas
- [ ] ⚠️ CORS log'ai yra
- [ ] ⚠️ Frontend prisijungia

---

## 🎯 Išvada

**Dabar:**
1. Ištrinkite `build` ir `node_modules` iš Git (GitHub Desktop)
2. Commit → Push
3. Colyseus Cloud automatiškai build'ins iš source kodo
4. Redeploy'inti serverį

**Po to viskas veiks!** 🚀




