# 🔍 Problema: Serveris Crash'ina Iškart Po Start'o

## ❌ Kas Matau

Matau logs'e:
- ✅ PM2 daemon start'avo
- ✅ @colyseus/tools agent start'avo
- ✅ `colyseus-server:1` start'avo (18:25:05)
- ❌ **NĖRA application logs** - serveris crash'ina iškart po start'o

**Tai reiškia, kad serveris start'ina, bet iškart crash'ina dėl klaidos.**

---

## 🔍 Ką Daryti

### Step 1: Patikrinkite Application Error Logs

Colyseus Cloud → Endpoints → LOGS:

1. **Išjunkite "Show only errors" toggle** (jei įjungtas)
2. **Scroll žemyn** ir ieškokite:
   - `/home/deploy/source/colyseus-server/logs/err.log`
   - Arba `colyseus-server` error logs
3. **Patikrinkite**, ar yra error'ų

**Turėtumėte matyti**:
- PORT klaidos
- Crash error'us
- Kitos klaidos

---

### Step 2: Patikrinkite Application Output Logs

1. **Scroll žemyn** logs'e
2. Ieškokite:
   - `colyseus-server` output logs
   - Arba `/home/deploy/source/colyseus-server/logs/out.log`
3. **Patikrinkite**, ar yra:
   - `🔧 Starting server...`
   - Arba crash error'ų

---

### Step 3: Patikrinkite, Ar Kodas Push'intas

Jei vis dar nėra application logs:

1. **GitHub** → repository → patikrinkite `colyseus-server/src/index.ts`
2. Patikrinkite, ar paskutinis commit turi naują kodą
3. Jei ne - push'inkite kodą:
   - GitHub Desktop → Commit → Push

---

## 🔧 Jei Vis Dar Crash'ina

### Option 1: Patikrinkite Lokaliai

Patikrinkite, ar serveris veikia lokaliai:

```bash
cd colyseus-server
npm run build
npm start
```

**Jei veikia lokaliai**:
- Problema build settings'e arba deployment'e

**Jei neveikia lokaliai**:
- Problema serverio kode
- Reikia pataisyti kodą

---

### Option 2: Patikrinkite Build Settings

1. **Colyseus Cloud** → **Settings** → **Build & Deployment**
2. Patikrinkite:
   - **Root Directory**: `/colyseus-server/` arba `colyseus-server`
   - **Build Command**: `npm run build`
   - **Install Command**: `npm install`

---

## 📋 Checklist

- [ ] Išjungti "Show only errors" toggle
- [ ] Scroll žemyn - ieškoti application logs
- [ ] Patikrinti error logs (`/home/deploy/source/colyseus-server/logs/err.log`)
- [ ] Patikrinti output logs (`/home/deploy/source/colyseus-server/logs/out.log`)
- [ ] Patikrinti, ar kodas push'intas
- [ ] Patikrinti build settings
- [ ] Patikrinti lokaliai

---

## 💡 Pastabos

- **Serveris start'ina**: PM2 start'ina colyseus-server:1
- **Bet crash'ina**: Nėra application logs - serveris crash'ina iškart
- **Reikia error logs**: Ten turėtų būti aiškesnė klaidos priežastis

---

**Ar patikrinote application error logs?** Scroll žemyn logs'e ir patikrinkite `/home/deploy/source/colyseus-server/logs/err.log`!


