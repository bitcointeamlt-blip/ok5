# 🚨 SVARBU: Kaip Paleisti Serverį Lokaliai

## ❌ Problema

Console rodo `ERR_CONNECTION_REFUSED` - tai reiškia, kad **Colyseus serveris neveikia**.

## ✅ Sprendimas: Paleiskite Colyseus Serverį

### Step 1: Atidarykite Naują Terminal

**Windows PowerShell arba Command Prompt:**

```bash
cd colyseus-server
npm run dev
```

### Step 2: Palaukite, Kol Serveris Start'ina

**Turėtumėte matyti:**
```
✅ Server running on port 2567
```

**Jei matote `Port 2567 is already in use`:**
- Uždarykite kitą procesą, kuris naudoja portą 2567
- ARBA pakeiskite portą

### Step 3: Patikrinkite, Ar Serveris Veikia

**Atidarykite browser ir eikite į:**
```
http://localhost:2567/health
```

**Turėtumėte matyti:**
```json
{"status":"ok"}
```

### Step 4: Dabar Paleiskite Frontend

**Kitas terminal:**
```bash
npm run dev
```

**Atidarykite browser:**
```
http://localhost:7000
```

**Spauskite "PvP ONLINE" - turėtų veikti!**

---

## 🔍 Troubleshooting

### Problema: "Port 2567 is already in use"

**Sprendimas:**
```bash
# Windows PowerShell
netstat -ano | findstr :2567
taskkill /PID <PID> /F
```

### Problema: "npm run dev" nerodo jokių log'ų

**Sprendimas:**
1. Patikrinkite, ar `colyseus-server/package.json` turi `dev` script'ą
2. Patikrinkite, ar `colyseus-server/node_modules` yra įdiegtas:
   ```bash
   cd colyseus-server
   npm install
   ```

### Problema: Serveris start'ina, bet frontend vis tiek gauna ERR_CONNECTION_REFUSED

**Sprendimas:**
1. Patikrinkite, ar serveris tikrai veikia: `http://localhost:2567/health`
2. Patikrinkite browser console - turėtų rodyti `ws://localhost:2567`
3. Patikrinkite firewall - gali blokuoti portą 2567

---

## 💡 Svarbiausia

**Serveris TURI veikti PRIEŠ paleidžiant frontend!**

1. **Terminal 1:** `cd colyseus-server && npm run dev`
2. **Terminal 2:** `npm run dev`
3. **Browser:** `http://localhost:7000`

---

## 📋 Checklist

- [ ] Colyseus serveris veikia (`npm run dev` terminale)
- [ ] Serveris rodo: `✅ Server running on port 2567`
- [ ] `http://localhost:2567/health` grąžina `{"status":"ok"}`
- [ ] Frontend veikia (`npm run dev` terminale)
- [ ] Browser console nerodo `ERR_CONNECTION_REFUSED`



