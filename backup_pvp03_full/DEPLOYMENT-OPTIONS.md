# 🚀 Deployment Options - 2 Būdai

## ❌ Problema: CLI Reikalauja Git

Colyseus Cloud CLI deployment reikalauja Git, bet jūsų sistemoje Git nėra įdiegtas.

## ✅ Sprendimas: 2 Variantai

### Variantas 1: GitHub Web Integration (Rekomenduojama - Lengviausia)

Jūsų repository jau susietas ("OK5"), todėl galite deploy'inti per web:

#### Steps:

1. **Eikite į Colyseus Cloud Dashboard**
   - https://cloud.colyseus.io
   - Pasirinkite "dot game"

2. **Pasirinkite Branch**
   - Spustelėkite **"SELECT BRANCH"**
   - Pasirinkite branch (pvz: `main`)

3. **Nustatykite Build Settings**
   - Eikite į **Settings** tab
   - Build Command: `cd colyseus-server && npm install && npm run build`
   - Start Command: `cd colyseus-server && npm start`
   - Root Directory: `colyseus-server`

4. **Deploy**
   - Eikite į **Deployments** tab
   - Spustelėkite **"New Deployment"** arba **"Deploy"**
   - Palaukite 2-5 min

---

### Variantas 2: Įdiekite Git ir Naudokite CLI

#### 1. Įdiekite Git

- Parsisiųskite: https://git-scm.com/download/win
- Įdiekite su default settings
- Restart terminal

#### 2. Inicializuokite Git

```bash
cd C:\Users\p3p3l\Downloads\ok4
git init
git add .
git commit -m "Initial commit"
```

#### 3. Susiekite su GitHub

```bash
git remote add origin https://github.com/JUSU_USERNAME/JUSU_REPO.git
git push -u origin main
```

#### 4. Deploy per CLI

```bash
cd colyseus-server
npx @colyseus/cloud deploy
```

---

## 💡 Rekomendacija

**Naudokite Variantą 1 (GitHub Web Integration)** - lengviausia ir jau turite repository susietą!

Ar norite, kad padėčiau su GitHub web deployment setup?

