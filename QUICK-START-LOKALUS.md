# ⚡ Greitas Paleidimas - Lokalus

## 🚀 2 Žingsniai

### 1️⃣ Colyseus Serveris

**Atidarykite naują terminalą:**
```powershell
cd colyseus-server
npm run dev
```

**Palaukite, kol pamatysite:**
```
✅ Colyseus server is running on port 2567
```

---

### 2️⃣ Frontend

**Atidarykite kitą terminalą:**
```powershell
npm run dev
```

**Atidarykite browser:**
```
http://localhost:7000
```

---

## ✅ Patikrinimas

**Browser console turėtų rodyti:**
- ✅ `🔍 Colyseus Service Environment:`
- ✅ `⚠️ VITE_COLYSEUS_ENDPOINT not set, using default localhost`
- ✅ `✅ Colyseus client initialized`
- ✅ `Joined Colyseus room: [room-id]`

---

## 🔧 Jei Neveikia

### Portas 7000 užimtas:
```powershell
netstat -ano | findstr :7000
taskkill /PID <PID> /F
```

### Portas 2567 užimtas:
```powershell
netstat -ano | findstr :2567
taskkill /PID <PID> /F
```

### Colyseus serveris neveikia:
- Patikrinkite, ar `cd colyseus-server && npm run dev` veikia
- Patikrinkite, ar portas 2567 nėra užimtas

---

## 📝 Svarbu

**Serveris TURI veikia PRIEŠ frontend!**

1. **Terminal 1:** Colyseus serveris (`npm run dev`)
2. **Terminal 2:** Frontend (`npm run dev`)
3. **Browser:** `http://localhost:7000`

---

**Status:** ✅ Instrukcijos paruoštos

