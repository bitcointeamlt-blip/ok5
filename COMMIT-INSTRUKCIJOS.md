# 📋 Commit Instrukcijos

## ❌ Git Nėra Įdiegtas

Git nėra įdiegtas arba nėra PATH'e. Reikia naudoti GitHub Desktop.

---

## ✅ Sprendimas: GitHub Desktop

### Step 1: Atidarykite GitHub Desktop

1. Atidarykite **GitHub Desktop**
2. Pasirinkite **ok06** repository

### Step 2: Commit

1. **Select all files** (arba tik pakeisti failus)
2. **Commit message:**
   ```
   Simplify Colyseus server - minimal setup per official recommendations
   ```
3. Spustelėkite **"Commit to main"**

### Step 3: Push

1. Spustelėkite **"Push origin"**
2. Palaukite, kol push baigsis

---

## ✅ Arba: Įdiekite Git

Jei norite naudoti Git CLI:

1. **Atsisiųskite Git:** https://git-scm.com/download/win
2. **Įdiekite Git**
3. **Restart'inkite terminalą**
4. **Tada galėsite naudoti:**
   ```bash
   git add .
   git commit -m "Simplify Colyseus server - minimal setup per official recommendations"
   git push
   ```

---

## 📋 Kas Pakeista

### Failai:
- ✅ `colyseus-server/src/index.ts` - supaprastintas pagal oficialias rekomendacijas
- ✅ `colyseus-server/ecosystem.config.js` - minimalus PM2 config
- ✅ `README.md` - atnaujintas

### Kas Išlaikyta:
- ✅ `colyseus-server/src/rooms/GameRoom.ts` - žaidimo logika
- ✅ `colyseus-server/src/schema/GameState.ts` - schema

---

## 🎯 Po Commit

1. **Colyseus Cloud** automatiškai deploy'ins naują versiją
2. **Patikrinkite logs** Colyseus Cloud'e
3. **Turėtų veikti** be EADDRINUSE error'ų





