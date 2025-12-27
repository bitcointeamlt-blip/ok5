# 🔄 Greitas Serverių Restart - PvP Ready Fix

## ✅ Kas Padaryta:

### 1. ✅ Uždaryti Node Procesai
- Uždaryti visi Node procesai (PID: 16828, 40380, ir kt.)
- Portai turėtų būti laisvi dabar

### 2. ✅ Script'ai Sukurti
- `restart-local-servers.ps1` - restart'ina serverius
- `start-local-servers.ps1` - paleidžia serverius

---

## 🚀 Dabar Paleiskite Serverius:

### Option A: Naudokite Script'ą (Rekomenduojama)

**PowerShell:**
```powershell
cd C:\Users\p3p3l\Downloads\pvp03-new
.\start-local-servers.ps1
```

**Script'as automatiškai:**
- ✅ Patikrina ar portai laisvi
- ✅ Paleis Colyseus serverį (port 2567)
- ✅ Paleis Frontend serverį (port 5173)
- ✅ Atidarys naujus PowerShell langus

---

### Option B: Rankiniu Būdu

#### Terminal 1 - Colyseus Serveris:
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

#### Terminal 2 - Frontend:
```powershell
cd C:\Users\p3p3l\Downloads\pvp03-new
npm run dev
```

**Turėtumėte matyti:**
```
  VITE v5.0.0  ready in XXX ms

  ➜  Local:   http://localhost:5173/
```

---

## 🔍 Patikrinimas:

### 1. Patikrinkite Ar Serveriai Veikia

**Colyseus Serveris:**
- Atidarykite: `http://localhost:2567/health`
- Turėtumėte matyti: `{"status":"ok"}`

**Frontend:**
- Atidarykite: `http://localhost:5173`
- Turėtumėte matyti žaidimą

---

### 2. Testuokite PvP Ready

1. **Atidarykite:** `http://localhost:5173` (2 browser langai)
2. **Prisijunkite** su Ronin Wallet (abiejuose languose)
3. **Pasirinkite "PvP Online"** (abiejuose languose)
4. **Patikrinkite** ar abi pusės gauna ready patvirtinimą

**Turėtumėte matyti:**
- ✅ Abi pusės prisijungia prie room
- ✅ Abi pusės gauna ready patvirtinimą
- ✅ PvP veikia

---

## 🔍 Troubleshooting

### Portai Vis Dar Užimti

**Jei portai vis dar užimti:**
```powershell
# Raskite procesą
netstat -ano | findstr ":7005"
netstat -ano | findstr ":2567"

# Ištraukite PID (paskutinis skaičius)
# Uždarykite procesą
Stop-Process -Id <PID> -Force
```

**ARBA naudokite script'ą:**
```powershell
.\restart-local-servers.ps1
```

---

### Ready Vis Dar Neveikia

**Patikrinkite:**
1. Ar abu serveriai veikia? (Colyseus + Frontend)
2. Ar abi pusės prisijungia prie room?
3. Ar yra error'ų browser console?

**Jei vis dar neveikia:**
- Uždarykite visus browser langus
- Restart'inkite serverius dar kartą
- Bandykite dar kartą

---

## 📋 Checklist

### Po Restart:
- [ ] ✅ Colyseus serveris veikia (port 2567)
- [ ] ✅ Frontend serveris veikia (port 5173)
- [ ] ✅ Portai laisvi (7005, 2567, 5173)
- [ ] ✅ PvP ready veikia abiejose pusėse

---

## 🎯 Išvada

**Problema:**
- Serveriai užstrigę su senais WebSocket connection'ais
- Ready sync neveikia

**Sprendimas:**
- ✅ Node procesai uždaryti
- ⚠️ Dabar reikia paleisti serverius iš naujo

**Paleiskite serverius ir testuokite PvP!** 🚀















