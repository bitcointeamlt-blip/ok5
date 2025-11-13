# 🔍 Patikrinkite Application Logs

## ✅ Kas Matau PM2 Logs'e

Matau, kad:
- ✅ PM2 daemon start'avo
- ✅ @colyseus/tools agent start'avo
- ✅ colyseus-server start'avo (18:25:05 ir 18:58:47)
- ❌ **NĖRA application logs** - tik PM2 logs

---

## 🔍 Problema: Nėra Application Logs

PM2 logs rodo tik PM2 veiksmus, bet **nėra application logs** (jūsų serverio output).

**Reikia patikrinti application logs**, ne tik PM2 logs!

---

## ✅ Ką Daryti

### Step 1: Patikrinkite Application Logs

Colyseus Cloud → Endpoints → LOGS:

1. **Išjunkite "Show only errors"** toggle (viršuje dešinėje)
2. **Scroll žemyn** - turėtumėte matyti application logs
3. **Ieškokite**:
   - `🔧 Starting server...`
   - `✅ HTTP server is listening...`
   - Arba PORT klaidos

**Jei vis dar matote tik PM2 logs**:
- Patikrinkite, ar yra kitas log failas
- Patikrinkite, ar serveris tikrai start'ina

---

### Step 2: Patikrinkite Error Logs

1. **Colyseus Cloud** → **Endpoints** → **LOGS**
2. **Įjunkite "Show only errors"** toggle
3. Patikrinkite, ar yra error'ų

**Jei yra error'ų**:
- Kopijuokite error'us
- Patikrinkite, kokios klaidos

---

### Step 3: Patikrinkite Serverio Kodą

Jei application logs nerodo nieko, patikrinkite:

1. **Ar kodas push'intas į GitHub?**
   - GitHub → repository → patikrinkite `colyseus-server/src/index.ts`

2. **Ar build settings teisingi?**
   - Colyseus Cloud → Settings → Build & Deployment
   - Root Directory: `/colyseus-server/` arba `colyseus-server`
   - Build Command: `npm run build`

3. **Ar serveris veikia lokaliai?**
   ```bash
   cd colyseus-server
   npm run build
   npm start
   ```

---

## 📋 Checklist

- [ ] Išjungti "Show only errors" toggle
- [ ] Scroll žemyn - ieškoti application logs
- [ ] Patikrinti, ar yra "🔧 Starting server..." pranešimas
- [ ] Patikrinti, ar yra "✅ HTTP server is listening..." pranešimas
- [ ] Patikrinti, ar yra PORT klaidos

---

## 💡 Pastabos

- **PM2 logs**: Rodo tik PM2 veiksmus, ne application output
- **Application logs**: Turėtų rodyti jūsų serverio console.log() output
- **Jei nėra application logs**: Serveris gali nepasileisti arba crash'inti iškart

---

**Ar matote application logs (ne tik PM2 logs)?** Scroll žemyn LOGS sekcijoje ir patikrinkite!

