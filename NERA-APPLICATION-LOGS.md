# 🔍 Problema: Nėra Application Logs

## ❌ Kas Matau

Matau tik:
- ✅ PM2 daemon start'avo
- ✅ @colyseus/tools agent start'avo
- ❌ **NĖRA application logs** (colyseus-server output)

**Tai reiškia, kad serveris gali crash'inti iškart po start'o arba niekada nepasileisti.**

---

## 🔍 Ką Daryti

### Step 1: Išjunkite "Show only errors" Toggle

1. **Colyseus Cloud** → **Endpoints** → **LOGS**
2. **Išjunkite "Show only errors" toggle** (spustelėkite, kad jis taptų pilkas)
3. Scroll žemyn ir patikrinkite, ar yra application logs

**Turėtumėte matyti**:
```
🔧 Starting server (PORT env: XXXX, NODE_ENV: production, using port: XXXX)
✅ HTTP server is listening on port XXXX
✅ Colyseus server is running on port XXXX
```

---

### Step 2: Patikrinkite Error Logs

Jei vis dar nėra application logs:

1. **Įjunkite "Show only errors" toggle** atgal
2. Scroll žemyn ir patikrinkite error logs
3. Ieškokite:
   - PORT klaidų
   - Crash error'ų
   - Kitos klaidos

---

### Step 3: Patikrinkite, Ar Kodas Push'intas

Jei application logs vis dar nėra:

1. **GitHub** → repository → patikrinkite `colyseus-server/src/index.ts`
2. Patikrinkite, ar paskutinis commit turi naują kodą
3. Jei ne - push'inkite kodą:
   - GitHub Desktop → Commit → Push

---

### Step 4: Patikrinkite Build Settings

1. **Colyseus Cloud** → **Settings** → **Build & Deployment**
2. Patikrinkite:
   - **Root Directory**: `/colyseus-server/` arba `colyseus-server`
   - **Build Command**: `npm run build`
   - **Install Command**: `npm install`

---

## 🔧 Jei Vis Dar Neveikia

### Option 1: REBOOT INSTANCE

1. **Colyseus Cloud** → **Endpoints** tab
2. Spustelėkite **"REBOOT INSTANCE"** mygtuką
3. Palaukite 2-3 minučių
4. Patikrinkite logs (išjunkite toggle)

---

### Option 2: Patikrinkite Lokaliai

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

## 📋 Checklist

- [ ] Išjungti "Show only errors" toggle
- [ ] Scroll žemyn - ieškoti application logs
- [ ] Patikrinti, ar yra "🔧 Starting server..." pranešimas
- [ ] Patikrinti error logs (jei nėra application logs)
- [ ] Patikrinti, ar kodas push'intas
- [ ] Patikrinti build settings
- [ ] REBOOT INSTANCE (jei reikia)

---

## 💡 Pastabos

- **Nėra application logs**: Serveris gali crash'inti iškart po start'o
- **PM2 logs**: Rodo tik PM2 veiksmus, ne application output
- **Reikia application logs**: Ten turėtų būti jūsų serverio console.log() output

---

**Ar išjungėte toggle ir patikrinote visus logs?** Scroll žemyn ir patikrinkite, ar yra application logs!

