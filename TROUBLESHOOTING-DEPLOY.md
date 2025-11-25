# 🔧 Troubleshooting Deployment

## ❓ Kas Neveikia?

Patikrinkite, kurioje vietoje užstrigote:

### 1. SSH Key Pridėjimas į GitHub

**Problema**: Negaliu pridėti SSH key į GitHub

**Sprendimas**:
- Eikite į: `https://github.com/JUSU_USERNAME/OK5/settings/keys`
- Settings → Deploy keys → Add deploy key
- Kopijuokite SSH key iš Colyseus Cloud
- Spustelėkite "Add key"

---

### 2. Git Neįdiegtas

**Problema**: `git: command not found`

**Sprendimas**:
- Parsisiųskite: https://git-scm.com/download/win
- Įdiekite
- Restart terminal
- Patikrinkite: `git --version`

---

### 3. Repository Neinicializuotas

**Problema**: `Git is not set up`

**Sprendimas**:
```bash
cd C:\Users\p3p3l\Downloads\ok4
git init
git add .
git commit -m "Initial commit"
```

---

### 4. Negaliu Push'inti į GitHub

**Problema**: `Permission denied` arba `Repository not found`

**Sprendimas**:
- Patikrinkite repository URL
- Patikrinkite, ar SSH key pridėtas
- Naudokite HTTPS vietoj SSH:
  ```bash
  git remote add origin https://github.com/JUSU_USERNAME/OK5.git
  ```

---

### 5. Deployment Fails

**Problema**: `npx @colyseus/cloud deploy` neveikia

**Sprendimas**:
- Patikrinkite, ar repository push'intas į GitHub
- Patikrinkite, ar SSH key pridėtas
- Patikrinkite Colyseus Cloud logs

---

## ✅ Alternatyvus Būdas: GitHub Web Interface

Jei CLI neveikia, naudokite web interface:

### Steps:

1. **Eikite į Colyseus Cloud**
   - https://cloud.colyseus.io
   - Pasirinkite "dot game"

2. **Pasirinkite Branch**
   - Spustelėkite "SELECT BRANCH"
   - Pasirinkite branch (pvz: `main`)

3. **Nustatykite Build Settings**
   - Settings → Build:
     - Build: `cd colyseus-server && npm install && npm run build`
     - Start: `cd colyseus-server && npm start`
     - Root: `colyseus-server`

4. **Deploy**
   - Deployments → New Deployment
   - ARBA spustelėkite "Deploy" mygtuką

---

## 💡 Greitas Sprendimas

**Jei CLI neveikia** → Naudokite GitHub Web Interface!

1. Colyseus Cloud → Pasirinkite branch
2. Settings → Nustatykite build settings
3. Deploy

Ar norite, kad padėčiau su konkrečia problema?

