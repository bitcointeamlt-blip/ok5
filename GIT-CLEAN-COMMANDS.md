# 🧹 Git Clean Commands - Tik Teisingas Kodas

## ✅ Kas Turėtų Būti Git'e

### Colyseus Server:
```
colyseus-server/
├── src/              ✅ (source kodas)
├── package.json     ✅
├── package-lock.json ✅
├── tsconfig.json    ✅
├── ecosystem.config.js ✅
├── Procfile         ✅
└── .gitignore       ✅ (ignoruoja build/)
```

### ❌ Kas NETURĖTŲ Būti Git'e:
```
colyseus-server/
├── build/           ❌
├── node_modules/    ❌
└── *.log            ❌
```

---

## 🚀 Komandos Išvalyti Git

### Option 1: Ištrinti Tik Build Folderį (Rekomenduojama)

**PowerShell (Windows):**
```powershell
# Eikite į repository root
cd C:\Users\p3p3l\Downloads\pvp03-new

# Ištrinkite build folderį iš Git (bet ne iš disk'o)
git rm -r --cached colyseus-server/build

# Pridėkite .gitignore
git add colyseus-server/.gitignore

# Commit → Push
git commit -m "Remove build folder from Git - should be generated automatically"
git push
```

---

### Option 2: Ištrinti Visą Colyseus-Server ir Įkelti Tik Teisingą Kodą

**PowerShell (Windows):**
```powershell
# Eikite į repository root
cd C:\Users\p3p3l\Downloads\pvp03-new

# Ištrinkite colyseus-server iš Git (bet ne iš disk'o)
git rm -r --cached colyseus-server

# Pridėkite tik teisingus failus
git add colyseus-server/.gitignore
git add colyseus-server/src/
git add colyseus-server/package.json
git add colyseus-server/package-lock.json
git add colyseus-server/tsconfig.json
git add colyseus-server/ecosystem.config.js
git add colyseus-server/Procfile

# Commit → Push
git commit -m "Clean Colyseus server - only source code, no build folder"
git push
```

---

## ✅ Kas Jau Padaryta:

1. ✅ `.gitignore` sukurtas (`colyseus-server/.gitignore`)
2. ✅ Source kodas teisingas (`colyseus-server/src/index.ts`)
3. ✅ CORS konfigūracija pataisyta

---

## 🔍 Patikrinimas Po Upload

### GitHub Repository:

**Patikrinkite:**
- [ ] `colyseus-server/build/` NĖRA Git'e
- [ ] `colyseus-server/src/` YRA Git'e
- [ ] `colyseus-server/.gitignore` YRA Git'e

---

### Colyseus Cloud Po Deploy:

**Colyseus Cloud automatiškai:**
1. Pull'ins kodą iš GitHub
2. Build'ins iš source kodo (`npm run build`)
3. Sukurs naują build folderį su teisinga CORS konfigūracija
4. Deploy'ins su nauja versija

**Logs turėtų rodyti:**
```
✅ Server running on port XXXX
[CORS] Matchmaking request from origin: https://jocular-zabaione-835b49.netlify.app
```

---

## 📋 Checklist

### Prieš Upload:
- [x] ✅ `.gitignore` sukurtas
- [x] ✅ Source kodas teisingas
- [ ] ⚠️ Build folderis ištrintas iš Git
- [ ] ⚠️ Commit → Push

### Po Upload:
- [ ] ⚠️ GitHub neturi build folderio
- [ ] ⚠️ Colyseus Cloud deploy'intas
- [ ] ⚠️ CORS log'ai yra
- [ ] ⚠️ Frontend prisijungia

---

## 🎯 Išvada

**Dabar:**
1. Ištrinkite build folderį iš Git (Option 1) ARBA visą colyseus-server (Option 2)
2. Commit → Push
3. Colyseus Cloud automatiškai build'ins iš source kodo
4. Redeploy'inti serverį

**Po to viskas veiks!** 🚀













