# 🚀 Lokalus Paleidimas - Dabar

## ✅ Problema Išspręsta

Portas 7000 buvo užimtas - procesas uždarytas.

---

## 📋 Kaip Paleisti Lokaliai

### Step 1: Paleiskite Colyseus Serverį

**Terminal 1:**
```powershell
cd colyseus-server
npm run dev
```

**Turėtumėte matyti:**
```
✅ Colyseus server is running on port 2567
✅ Health endpoint: http://0.0.0.0:2567/health
✅ Matchmaking endpoint: http://0.0.0.0:2567/matchmake
```

**Jei matote error'ą:**
- Patikrinkite, ar portas 2567 nėra užimtas: `netstat -ano | findstr :2567`
- Jei užimtas, uždarykite procesą: `taskkill /PID <PID> /F`

---

### Step 2: Paleiskite Frontend

**Terminal 2 (naujas terminal):**
```powershell
npm run dev
```

**Turėtumėte matyti:**
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:7000/
```

---

### Step 3: Atidarykite Browser

1. **Atidarykite:** `http://localhost:7000`
2. **Prisijunkite su Ronin Wallet**
3. **Spauskite "PvP ONLINE"**
4. **Patikrinkite browser console:**
   - Turėtų būti: `🔍 Colyseus Service Environment:`
   - Turėtų būti: `⚠️ VITE_COLYSEUS_ENDPOINT not set, using default localhost`
   - Turėtų būti: `✅ Colyseus client initialized`
   - Turėtų būti: `Joined Colyseus room: [room-id]`

---

## 🔍 Troubleshooting

### Problema: "Port 7000 is already in use"

**Sprendimas:**
```powershell
# Rasti procesą
netstat -ano | findstr :7000

# Uždaryti procesą
taskkill /PID <PID> /F
```

---

### Problema: "Port 2567 is already in use"

**Sprendimas:**
```powershell
# Rasti procesą
netstat -ano | findstr :2567

# Uždaryti procesą
taskkill /PID <PID> /F
```

---

### Problema: "ERR_CONNECTION_REFUSED"

**Priežastis:** Colyseus serveris neveikia.

**Sprendimas:**
1. Patikrinkite, ar Colyseus serveris veikia Terminal 1
2. Patikrinkite, ar portas 2567 nėra užimtas
3. Patikrinkite browser console - turėtų rodyti `ws://localhost:2567`

---

### Problema: Frontend neatsidaro

**Sprendimas:**
1. Patikrinkite, ar `npm install` buvo paleistas
2. Patikrinkite, ar `node_modules` egzistuoja
3. Bandykite: `npm run dev` iš naujo

---

## ✅ Checklist

- [ ] Colyseus serveris veikia (`npm run dev` terminale)
- [ ] Frontend veikia (`npm run dev` kitu terminale)
- [ ] Browser atidarytas `http://localhost:7000`
- [ ] Browser console rodo `✅ Colyseus client initialized`
- [ ] Nėra CORS error'ų
- [ ] Nėra connection error'ų

---

## 💡 Svarbiausia

**Serveris TURI veikti PRIEŠ paleidžiant frontend!**

1. **Terminal 1:** `cd colyseus-server && npm run dev`
2. **Terminal 2:** `npm run dev`
3. **Browser:** `http://localhost:7000`

---

## 📝 Lokalaus Endpoint'o Konfigūracija

**Lokaliai:**
- Frontend: `http://localhost:7000`
- Colyseus: `ws://localhost:2567` (default, jei nėra `VITE_COLYSEUS_ENDPOINT`)

**Production (Netlify):**
- Frontend: `https://jocular-zabaione-835b49.netlify.app`
- Colyseus: `https://de-fra-f8820c12.colyseus.cloud` (reikalauja `VITE_COLYSEUS_ENDPOINT`)

---

**Status:** ✅ Instrukcijos paruoštos


