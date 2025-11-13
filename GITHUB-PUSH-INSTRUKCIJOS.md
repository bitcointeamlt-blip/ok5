# 🚀 GitHub Push Instrukcijos

## ✅ Kas Padaryta

1. ✅ **`colyseus-server/src/index.ts`** - PORT handling pataisytas (production'e neleidžia fallback)
2. ✅ **`colyseus-server/ecosystem.config.js`** - PORT fallback pašalintas
3. ✅ **`colyseus-server/build/index.js`** - kompiliuotas su naujais pakeitimais

---

## 📋 Ką Reikia Padaryti

### Option 1: GitHub Desktop (Lengviausia)

1. **Atidarykite GitHub Desktop**
2. **Patikrinkite pakeitimus**:
   - Turėtumėte matyti pakeitimus:
     - `colyseus-server/src/index.ts`
     - `colyseus-server/ecosystem.config.js`
     - `colyseus-server/build/index.js`
     - `PORT-PROBLEMA-SPRENDIMAS.md`
     - `COLYSEUS-FINAL-FIX.md`
     - `GITHUB-PUSH-INSTRUKCIJOS.md`

3. **Commit**:
   - Summary: `Fix PORT handling for Colyseus Cloud - require PORT in production`
   - Description: 
     ```
     - Remove PORT fallback in production (ecosystem.config.js)
     - Require PORT environment variable in production (index.ts)
     - Better error messages for PORT issues
     ```

4. **Push**:
   - Spustelėkite **"Push origin"** mygtuką

---

### Option 2: Terminal (Jei turite Git)

```bash
# Patikrinkite pakeitimus
git status

# Pridėkite visus pakeitimus
git add .

# Commit
git commit -m "Fix PORT handling for Colyseus Cloud - require PORT in production

- Remove PORT fallback in production (ecosystem.config.js)
- Require PORT environment variable in production (index.ts)
- Better error messages for PORT issues"

# Push
git push origin main
```

---

### Option 3: Colyseus Cloud Web Interface

Jei naudojate Colyseus Cloud web interface:

1. **Eikite į Colyseus Cloud Dashboard**
2. **Deployments** → **Manual Deploy**
3. **Upload files** arba **Connect GitHub** (jei dar nepadaryta)

---

## ✅ Po Push

1. **Palaukite** 1-2 minutes (kol GitHub atnaujins)
2. **Colyseus Cloud** → **Deployments** → **Redeploy**
3. **Patikrinkite Logs**:
   - Turėtumėte matyti: `🔧 Starting server on port: XXXX (PORT env: XXXX)`
   - Jei PORT nėra nustatytas: `❌ PORT environment variable is not set!`

---

## 🔍 Jei PORT Vis Dar Neveikia

Po redeploy, jei vis dar matote PORT klaidą:

1. **Colyseus Cloud** → **Settings** → **Environment Variables**
2. Patikrinkite, ar yra **PORT** variable
3. **Jei nėra** - tai gali būti Colyseus Cloud bug'as
4. **Bandykite pridėti PORT rankiniu būdu** (bet tai gali neveikti)

**Alternatyva**: Naudokite lokalų serverį:
```bash
cd colyseus-server
npm run dev
```

Ir atnaujinkite frontend `.env`:
```env
VITE_COLYSEUS_ENDPOINT=ws://localhost:2567
```

---

## 📋 Checklist

- [ ] GitHub Desktop atidarytas
- [ ] Pakeitimai matomi
- [ ] Commit padarytas
- [ ] Push padarytas
- [ ] Colyseus Cloud redeploy padarytas
- [ ] Logs patikrinti
- [ ] PORT patikrintas

---

**Ar viskas aišku? Jei kyla klausimų, klauskite!** 🎮

