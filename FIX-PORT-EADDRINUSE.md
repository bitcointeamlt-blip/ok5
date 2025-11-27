# 🔧 Fix: Port EADDRINUSE Error Colyseus Cloud

## ❌ Problema

```
Error: listen EADDRINUSE: address already in use :::2567
```

**Priežastis**: Colyseus Cloud naudoja PM2, kuris jau naudoja portą 2567. Serveris bando naudoti tą patį portą.

---

## ✅ Sprendimas

Colyseus Cloud **TURI** automatiškai nustatyti PORT per environment variable. Problema gali būti:

1. **Colyseus Cloud neperduoda PORT** - patikrinkite Colyseus Cloud settings
2. **PM2 jau naudoja portą** - reikia naudoti PORT, kurį nustato Colyseus Cloud

---

## 🔧 Ką Padaryti

### Option 1: Patikrinkite Colyseus Cloud Settings

1. Eikite į **Colyseus Cloud Dashboard**
2. Pasirinkite aplikaciją
3. Eikite į **Settings** → **Environment Variables**
4. Patikrinkite, ar yra **PORT** variable
5. Jei nėra - **NEPRIDĖKITE** (Colyseus Cloud turėtų automatiškai nustatyti)

### Option 2: Pakeiskite Start Command

Colyseus Cloud → Settings → Build Configuration:

**Start Command** (dabar):
```
cd colyseus-server && npm start
```

**Start Command** (bandykite):
```
cd colyseus-server && PORT=$PORT node build/index.js
```

Arba:
```
cd colyseus-server && node build/index.js
```

**SVARBU**: Colyseus Cloud turėtų automatiškai nustatyti PORT per environment variable.

---

## 📋 Patikrinimas

Po deployment, patikrinkite logs:

1. **Turėtumėte matyti**:
   ```
   🔧 Starting server on port: XXXX (PORT env: XXXX)
   ✅ HTTP server is listening on port XXXX
   ✅ Colyseus server is running on port XXXX
   ```

2. **Jei vis dar matote**:
   ```
   Error: listen EADDRINUSE: address already in use :::2567
   ```
   
   Tai reiškia, kad Colyseus Cloud neperduoda PORT arba PORT nėra nustatytas.

---

## 🚀 Kitas Žingsnis

1. **Push kodą į GitHub**:
   ```bash
   git add .
   git commit -m "Fix PORT handling for Colyseus Cloud"
   git push
   ```

2. **Colyseus Cloud** → **Deployments** → **Redeploy**

3. **Patikrinkite logs** - turėtumėte matyti PORT, kurį nustato Colyseus Cloud

---

## 💡 Pastabos

- Colyseus Cloud **TURI** automatiškai nustatyti PORT
- Jei PORT nėra nustatytas, serveris naudoja default 2567
- PM2 gali jau naudoti portą 2567, todėl reikia naudoti PORT, kurį nustato Colyseus Cloud

---

**Ar PORT yra nustatytas Colyseus Cloud'e?**


