# ✅ Lokalūs Serveriai Paleisti

## ✅ Kas Padaryta:

### 1. ✅ Frontend Serveris Paleistas
- Portas: **7005**
- URL: **http://localhost:7005**
- Status: **Veikia**

### 2. ✅ Colyseus Serveris Turėtų Būti Paleistas

**Jei Colyseus serveris neveikia, paleiskite:**

**PowerShell (Terminal 2):**
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

## 🚀 Dabar Testuokite:

### 1. Atidarykite Browser

**URL:**
```
http://localhost:7005
```

**Turėtumėte matyti žaidimą!**

---

### 2. Testuokite PvP Ready

1. **Atidarykite:** `http://localhost:7005` (2 browser langai)
2. **Prisijunkite** su Ronin Wallet (abiejuose languose)
3. **Pasirinkite "PvP Online"** (abiejuose languose)
4. **Patikrinkite** ar abi pusės gauna ready patvirtinimą

**Turėtumėte matyti:**
- ✅ Abi pusės prisijungia prie room
- ✅ Abi pusės gauna ready patvirtinimą
- ✅ PvP veikia

---

## 🔍 Troubleshooting

### Frontend Neveikia

**Patikrinkite:**
1. Ar frontend serveris veikia? (PowerShell terminal)
2. Ar portas 7005 laisvas?
3. Ar yra error'ų console'e?

**Restart'inkite:**
```powershell
npm run dev
```

### Colyseus Serveris Neveikia

**Patikrinkite:**
1. Ar Colyseus serveris veikia? (PowerShell terminal)
2. Ar portas 2567 laisvas?
3. Ar yra error'ų console'e?

**Paleiskite:**
```powershell
cd colyseus-server
npm run dev
```

### Ready Vis Dar Neveikia

**Patikrinkite:**
1. Ar abu serveriai veikia? (Colyseus + Frontend)
2. Ar abi pusės prisijungia prie room?
3. Ar yra error'ų browser console?

**Jei vis dar neveikia:**
- Uždarykite visus browser langus
- Restart'inkite serverius:
```powershell
.\restart-local-servers.ps1
.\start-local-servers.ps1
```

---

## 📋 Checklist

- [x] ✅ Frontend serveris paleistas (port 7005)
- [ ] ⚠️ Colyseus serveris paleistas (port 2567)
- [ ] ⚠️ Browser atidarytas: `http://localhost:7005`
- [ ] ⚠️ PvP ready veikia abiejose pusėse

---

## 🎯 Išvada

**Frontend serveris paleistas ant porto 7005!**

**Dabar:**
1. Patikrinkite ar Colyseus serveris veikia
2. Atidarykite: `http://localhost:7005`
3. Testuokite PvP ready

**Po to žaidimas turėtų veikti!** 🚀








