# 🖥️ Lokalus Paleidimas - Instrukcijos

## ⚠️ Problema

Žaidimas nebeveikia lokaliai, nes:
- `simple-main.ts` reikalavo `VITE_COLYSEUS_ENDPOINT` net lokaliai
- Colyseus serveris gali neveikti lokaliai

## ✅ Sprendimas

### 1. Pataisytas Kodas

**Kas pakeista:**
- `src/simple-main.ts` - dabar lokaliai naudoja default `ws://localhost:2567`
- `src/services/ColyseusService.ts` - pagerinta `connect()` funkcija

**Kaip veikia:**
- **Lokaliai:** Naudoja `ws://localhost:2567` (default)
- **Production (Netlify):** Reikalauja `VITE_COLYSEUS_ENDPOINT`

---

## 🚀 Kaip Paleisti Lokaliai

### Step 1: Paleiskite Colyseus Serverį

**Terminal 1:**
```bash
cd colyseus-server
npm install  # Jei dar nepadaryta
npm run dev
```

**Turėtumėte matyti:**
```
✅ Server running on port 2567
```

**Jei matote `Port 2567 is already in use`:**
- Uždarykite kitą procesą, kuris naudoja portą 2567
- ARBA pakeiskite portą `colyseus-server/src/index.ts`:
  ```typescript
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 2568; // Pakeiskite į 2568
  ```

---

### Step 2: Paleiskite Frontend

**Terminal 2:**
```bash
npm install  # Jei dar nepadaryta
npm run dev
```

**Turėtumėte matyti:**
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:7000/
```

---

### Step 3: Atidarykite Browser

1. Atidarykite `http://localhost:7000`
2. Prisijunkite su Ronin Wallet
3. Spauskite "PvP ONLINE"
4. Patikrinkite browser console:
   - Turėtų būti: `🔵 Colyseus endpoint: ws://localhost:2567...`
   - Turėtų būti: `✅ Colyseus client initialized`
   - Turėtų būti: `✅ Successfully joined Colyseus room: [room-id]`

---

## 🔍 Troubleshooting

### Problema: "ERR_CONNECTION_REFUSED"

**Priežastis:** Colyseus serveris neveikia.

**Sprendimas:**
1. Patikrinkite, ar Colyseus serveris veikia:
   ```bash
   cd colyseus-server
   npm run dev
   ```

2. Patikrinkite, ar portas 2567 nėra užimtas:
   ```bash
   # Windows PowerShell
   netstat -ano | findstr :2567
   
   # Jei randa procesą, uždarykite jį:
   taskkill /PID <PID> /F
   ```

---

### Problema: "Failed to join Colyseus room"

**Priežastis:** Serveris veikia, bet negali prisijungti.

**Sprendimas:**
1. Patikrinkite Colyseus serverio logs:
   - Turėtumėte matyti: `🟢 ALL /matchmake/* handler - Origin: ...`
   - Turėtumėte matyti: `🔴 Matchmake route handler - Origin: ...`

2. Patikrinkite browser console:
   - Turėtų būti: `🔵 Colyseus endpoint: ws://localhost:2567...`
   - Turėtų būti: `✅ Colyseus client initialized`

3. Patikrinkite Network tab:
   - Raskite `matchmake/joinOrCreate/pvp_room` request
   - Patikrinkite, ar response turi CORS headers

---

### Problema: "Port 2567 is already in use"

**Priežastis:** Kitas procesas naudoja portą 2567.

**Sprendimas:**
1. Raskite procesą:
   ```bash
   # Windows PowerShell
   netstat -ano | findstr :2567
   ```

2. Uždarykite procesą:
   ```bash
   taskkill /PID <PID> /F
   ```

3. ARBA pakeiskite portą:
   - `colyseus-server/src/index.ts`: `const PORT = 2568;`
   - `src/services/ColyseusService.ts`: `'ws://localhost:2568'`

---

### Problema: Frontend nerodo "PvP ONLINE" mygtuko

**Priežastis:** Ronin Wallet neprisijungęs.

**Sprendimas:**
1. Prisijunkite su Ronin Wallet
2. Patikrinkite, ar wallet address yra matomas

---

## 📋 Checklist

- [ ] Colyseus serveris veikia (`npm run dev` terminale)
- [ ] Frontend veikia (`npm run dev` terminale)
- [ ] Browser console nerodo error'ų
- [ ] Colyseus serverio logs rodo debug log'us
- [ ] Network tab rodo sėkmingus request'us

---

## 💡 Svarbiausia

**Lokaliai:**
- Frontend naudoja `ws://localhost:2567` (default)
- Colyseus serveris turi veikti ant porto 2567
- Nereikia `VITE_COLYSEUS_ENDPOINT` environment variable

**Production (Netlify):**
- Frontend reikalauja `VITE_COLYSEUS_ENDPOINT`
- Colyseus serveris veikia ant Colyseus Cloud

---

## 🎯 Greitasis Testas

1. **Terminal 1:**
   ```bash
   cd colyseus-server
   npm run dev
   ```

2. **Terminal 2:**
   ```bash
   npm run dev
   ```

3. **Browser:**
   - Atidarykite `http://localhost:7000`
   - Prisijunkite su Ronin Wallet
   - Spauskite "PvP ONLINE"
   - Patikrinkite console - turėtų veikti!

---

## 📚 Susiję Failai

- `src/simple-main.ts` - Pataisytas, kad lokaliai naudotų default endpoint
- `src/services/ColyseusService.ts` - Pagerinta `connect()` funkcija
- `colyseus-server/src/index.ts` - Colyseus serverio kodas


