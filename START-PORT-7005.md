# 🚀 Paleisti Frontend Ant Porto 7005

## ✅ Vite Config Jau Teisingas

**`vite.config.ts` turi:**
```typescript
server: {
  port: 7005,
  host: 'localhost'
}
```

**Tai reiškia:** Frontend serveris turėtų veikti ant porto 7005!

---

## 🚀 Kaip Paleisti

### Step 1: Patikrinkite Ar Portas Laisvas

**PowerShell:**
```powershell
netstat -ano | findstr ":7005"
```

**Jei portas užimtas:**
- Raskite PID (paskutinis skaičius)
- Uždarykite procesą:
```powershell
Stop-Process -Id <PID> -Force
```

---

### Step 2: Paleiskite Frontend Serverį

**PowerShell:**
```powershell
cd C:\Users\p3p3l\Downloads\pvp03-new
npm run dev
```

**Turėtumėte matyti:**
```
  VITE v5.0.0  ready in XXX ms

  ➜  Local:   http://localhost:7005/
```

---

### Step 3: Patikrinkite Ar Veikia

**Atidarykite browser:**
```
http://localhost:7005
```

**Turėtumėte matyti žaidimą!**

---

## 🔍 Troubleshooting

### Portas 7005 Užimtas

**Sprendimas:**
```powershell
# Raskite procesą
netstat -ano | findstr ":7005"

# Ištraukite PID (paskutinis skaičius)
# Uždarykite procesą
Stop-Process -Id <PID> -Force

# Tada paleiskite iš naujo
npm run dev
```

### Frontend Neveikia

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

- [ ] ✅ Portas 7005 laisvas
- [ ] ✅ Frontend serveris paleistas (`npm run dev`)
- [ ] ✅ Browser atidarytas: `http://localhost:7005`
- [ ] ✅ Žaidimas veikia

---

## 🎯 Išvada

**Frontend serveris turėtų veikti ant porto 7005!**

**Paleiskite:**
```powershell
npm run dev
```

**Atidarykite:** `http://localhost:7005`

**Po to žaidimas turėtų veikti!** 🚀
















