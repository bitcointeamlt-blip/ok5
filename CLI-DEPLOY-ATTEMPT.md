# 🚀 CLI Deployment - Bandymas

## ⚠️ Problema: CLI Reikalauja Git

CLI deployment reikalauja Git, bet jūsų sistemoje Git nėra įdiegtas.

---

## ✅ Sprendimas: 2 Variantai

### Option 1: Įdiekite Git (Jei Norite CLI)

1. Parsisiųskite: **https://git-scm.com/download/win**
2. Įdiekite su default settings
3. Restart terminal
4. Tada:
   ```bash
   cd colyseus-server
   npx @colyseus/cloud deploy
   ```

### Option 2: Naudokite GitHub Connection (Rekomenduojama)

**Jūsų repository jau susietas** - deployment vyksta automatiškai po push!

**Problema nėra deployment būde** - problema yra serverio start'e!

---

## 🔍 Pagrindinė Problema

**Problema nėra deployment būde** - problema yra ta, kad:
- ✅ Deployment sėkmingas ("Deployed")
- ❌ Serveris negali start'inti ("Deploying..." >20 valandų)

**CLI deployment nepadės**, jei serveris negali start'inti!

---

## ✅ Sprendimas: Patikrinti Serverio Start'ą

### Step 1: Patikrinkite Logs

1. **Colyseus Cloud** → Deployments → **LOGS**
2. Patikrinkite, kokios klaidos
3. Ieškokite:
   - "Failed to start"
   - "Error"
   - "Cannot start server"

### Step 2: Patikrinkite, Ar Serveris Veikia Lokaliai

```bash
cd colyseus-server
npm run build
npm start
```

**Jei veikia lokaliai**:
- Problema build settings'e
- Patikrinkite Colyseus Cloud build settings

**Jei neveikia lokaliai**:
- Problema serverio kode
- Reikia pataisyti kodą

---

## 💡 Rekomendacija

**Naudokite GitHub Connection** (jau naudojate) - tai lengviausias būdas!

**CLI deployment nepadės**, jei serveris negali start'inti. Reikia pataisyti serverio start'ą!

**Ar patikrinote Logs sekciją?**

