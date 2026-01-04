# 🔧 Fix Local PvP Ready Problema

## ❌ Problema: PvP Ready Neveikia

**Simptomai:**
- Viena pusė gauna ready patvirtinimą
- Kita pusė negauna ready patvirtinimą
- PvP rezimas neveikia

**Priežastis:**
- Lokalūs serveriai užstrigę
- WebSocket connection problemos
- Portai užimti

---

## ✅ Sprendimas: Restart Lokalūs Serveriai

### Step 1: Restart'inkite Serverius

**PowerShell:**
```powershell
cd C:\Users\p3p3l\Downloads\pvp03-new
.\restart-local-servers.ps1
```

**Script'as:**
- ✅ Uždarys visus Node procesus
- ✅ Išlaisvins portus (7005, 2567, 5173)
- ✅ Paruoš serverius paleidimui

---

### Step 2: Paleiskite Serverius

**PowerShell:**
```powershell
.\start-local-servers.ps1
```

**Script'as:**
- ✅ Paleis Colyseus serverį (port 2567)
- ✅ Paleis Frontend serverį (port 5173)
- ✅ Atidarys naujus PowerShell langus

---

## 📋 Rankinis Būdas

### Step 1: Uždarykite Visus Serverius

**Task Manager:**
1. Atidarykite **Task Manager** (Ctrl + Shift + Esc)
2. Raskite **Node.js** procesus
3. **End Task** visiems Node procesams

**ARBA PowerShell:**
```powershell
Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force
```

---

### Step 2: Patikrinkite Portus

**PowerShell:**
```powershell
netstat -ano | findstr ":7005"
netstat -ano | findstr ":2567"
netstat -ano | findstr ":5173"
```

**Jei portai užimti:**
- Ištraukite PID iš output
- Uždarykite procesą:
```powershell
Stop-Process -Id <PID> -Force
```

---

### Step 3: Paleiskite Colyseus Serverį

**PowerShell (Terminal 1):**
```powershell
cd C:\Users\p3p3l\Downloads\pvp03-new\colyseus-server
npm run dev
```

**Turėtumėte matyti:**
```
✅ Server running on port 2567
✅ Health check: http://localhost:2567/health
✅ Matchmaking: http://localhost:2567/matchmake
```

---

### Step 4: Paleiskite Frontend Serverį

**PowerShell (Terminal 2):**
```powershell
cd C:\Users\p3p3l\Downloads\pvp03-new
npm run dev
```

**Turėtumėte matyti:**
```
  VITE v5.0.0  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

### Step 5: Testuokite PvP

1. **Atidarykite:** `http://localhost:5173`
2. **Prisijunkite** su Ronin Wallet
3. **Pasirinkite "PvP Online"**
4. **Patikrinkite** ar abi pusės gauna ready patvirtinimą

---

## 🔍 Troubleshooting

### Portai Vis Dar Užimti

**Sprendimas:**
```powershell
# Raskite procesą
netstat -ano | findstr ":7005"

# Ištraukite PID (paskutinis skaičius)
# Uždarykite procesą
Stop-Process -Id <PID> -Force
```

### Colyseus Serveris Neveikia

**Patikrinkite:**
1. Ar `colyseus-server` folderis yra?
2. Ar `npm install` buvo paleistas?
3. Ar yra error'ų console'e?

**Restart'inkite:**
```powershell
cd colyseus-server
npm run dev
```

### Frontend Serveris Neveikia

**Patikrinkite:**
1. Ar `node_modules` yra?
2. Ar `npm install` buvo paleistas?
3. Ar yra error'ų console'e?

**Restart'inkite:**
```powershell
npm run dev
```

---

## 📋 Checklist

### Prieš Restart:
- [ ] ✅ Uždaryti visi Node procesai
- [ ] ✅ Portai laisvi (7005, 2567, 5173)

### Po Restart:
- [ ] ✅ Colyseus serveris veikia (port 2567)
- [ ] ✅ Frontend serveris veikia (port 5173)
- [ ] ✅ PvP ready veikia abiejose pusėse

---

## 🎯 Išvada

**Problema:**
- Lokalūs serveriai užstrigę
- Ready sync neveikia

**Sprendimas:**
1. Restart'inkite serverius (script'as arba rankiniu būdu)
2. Paleiskite serverius iš naujo
3. Testuokite PvP

**Po restart turėtų veikti!** 🚀
























