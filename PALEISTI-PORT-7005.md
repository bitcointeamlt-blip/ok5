# 🚀 Paleisti Frontend Ant Porto 7005 - Instrukcijos

## ✅ Vite Config Jau Teisingas

**`vite.config.ts` turi:**
```typescript
server: {
  port: 7005,
  host: 'localhost'
}
```

**Frontend serveris turėtų veikti ant porto 7005!**

---

## 🚀 Kaip Paleisti

### Step 1: Atidarykite PowerShell Terminal

**Naujas PowerShell terminal:**
- Windows + X → Windows PowerShell
- ARBA CMD → PowerShell

---

### Step 2: Eikite į Projekto Folderį

```powershell
cd C:\Users\p3p3l\Downloads\pvp03-new
```

---

### Step 3: Paleiskite Frontend Serverį

```powershell
npm run dev
```

**Turėtumėte matyti:**
```
  VITE v5.0.0  ready in XXX ms

  ➜  Local:   http://localhost:7005/
  ➜  Network: use --host to expose
```

---

### Step 4: Patikrinkite Ar Colyseus Serveris Veikia

**Jei Colyseus serveris neveikia, paleiskite naujame terminale:**

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

### Step 5: Atidarykite Browser

**URL:**
```
http://localhost:7005
```

**Turėtumėte matyti žaidimą!**

---

## 🔍 Troubleshooting

### Portas 7005 Užimtas

**Jei gaunate klaidą "Port 7005 is already in use":**

```powershell
# Raskite procesą
netstat -ano | findstr ":7005"

# Ištraukite PID (paskutinis skaičius)
# Uždarykite procesą
Stop-Process -Id <PID> -Force

# Tada paleiskite iš naujo
npm run dev
```

---

### Frontend Neveikia

**Patikrinkite:**
1. Ar `node_modules` yra?
2. Ar `npm install` buvo paleistas?
3. Ar yra error'ų PowerShell console'e?

**Jei reikia, install'inkite dependencies:**
```powershell
npm install
```

**Tada paleiskite:**
```powershell
npm run dev
```

---

### Colyseus Serveris Neveikia

**Patikrinkite:**
1. Ar Colyseus serveris veikia? (PowerShell terminal)
2. Ar portas 2567 laisvas?
3. Ar yra error'ų console'e?

**Paleiskite:**
```powershell
cd colyseus-server
npm install
npm run dev
```

---

## 📋 Checklist

- [ ] ⚠️ Frontend serveris paleistas (`npm run dev`)
- [ ] ⚠️ Colyseus serveris paleistas (`cd colyseus-server && npm run dev`)
- [ ] ⚠️ Browser atidarytas: `http://localhost:7005`
- [ ] ⚠️ Žaidimas veikia
- [ ] ⚠️ PvP ready veikia abiejose pusėse

---

## 🎯 Išvada

**Frontend serveris turėtų veikti ant porto 7005!**

**Paleiskite:**
```powershell
npm run dev
```

**Atidarykite:** `http://localhost:7005`

**Po to žaidimas turėtų veikti!** 🚀
























