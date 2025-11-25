# ✅ Lokalus EADDRINUSE Fix

## 🎯 Problema

- ❌ Portas 2567 užimtas (procesas 12196)
- ❌ Colyseus serveris negali start'inti

---

## ✅ Sprendimas

### Uždaryti Procesą:

```powershell
taskkill /PID 12196 /F
```

### Arba Automatiškai:

```powershell
netstat -ano | findstr :2567
taskkill /PID <PID> /F
```

---

## 🚀 Po Uždarymo

Paleiskite Colyseus serverį:

```powershell
cd colyseus-server
npm run dev
```

---

**Status:** ✅ Procesas uždarytas. Dabar galite paleisti serverį.




