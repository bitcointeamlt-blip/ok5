# 🚀 Colyseus Server Deploy Fix - CORS Error

## ❌ Problema:

**Browser console rodo:**
```
Access to XMLHttpRequest at 'https://de-fra-f8820c12.colyseus.cloud/matchmake/joinOrCreate/pvp_room' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

**Netlify build:** ✅ Sėkmingas (rodo "Entered PvP Online lobby")

**Problema:** Colyseus serveris **NE siunčia CORS headers** matchmaking endpoint'ui.

---

## ✅ Sprendimas: Deploy Colyseus Serveris su CORS Fix

### Step 1: Patikrinkite Ar Kodas Yra Lokaliai

**Patikrinkite:** `colyseus-server/src/index.ts`

**Turėtų turėti:**
```typescript
import { Server, matchMaker } from "@colyseus/core";

// CRITICAL: Override Colyseus matchmaking CORS headers
matchMaker.controller.getCorsHeaders = function(req: any) {
  const origin = req.headers.origin;
  
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
};
```

**Jei nėra:** Pridėkite šį kodą prieš `gameServer.define("pvp_room", GameRoom);`

---

### Step 2: Build Serveris

```bash
cd colyseus-server
npm run build
```

**Patikrinkite:** Ar `colyseus-server/build/index.js` turi `matchMaker.controller.getCorsHeaders`?

---

### Step 3: Commit → Push į GitHub

**GitHub Desktop:**
1. **Commit message:** `"Fix CORS - add matchMaker.controller.getCorsHeaders override"`
2. **Commit to main** → **Push origin**

**ARBA terminal:**
```bash
cd colyseus-server
git add .
git commit -m "Fix CORS - add matchMaker.controller.getCorsHeaders override"
git push origin main
```

---

### Step 4: Deploy Colyseus Serveris

1. **Eikite į:** https://cloud.colyseus.io
2. **Pasirinkite savo aplikaciją**
3. **Eikite į:** **"Deployments"**
4. **Spustelėkite:** **"Deploy"** arba **"Redeploy"**
5. **Palaukite:** 2-5 min

---

### Step 5: Patikrinkite Server Logs

**Colyseus Cloud → Deployments → LOGS:**

**Turėtų rodyti:**
- ✅ `✅ Server running on port XXXX`
- ✅ Nėra CORS error'ų
- ✅ Serveris start'ina sėkmingai

---

### Step 6: Patikrinkite Browser Console

**Po serverio deploy:**

**Turėtų rodyti:**
- ✅ `🔵 Colyseus endpoint found: https://de-fra-f8820c12...`
- ✅ `✅ Colyseus client initialized: wss://de-fra-f8820c12...`
- ✅ `✅ Successfully joined Colyseus room: [room-id]`
- ✅ **NE** turėtų rodyti: CORS error'ų

---

## 🔍 Patikrinimas:

### Network Tab:

**DevTools → Network → `matchmake/joinOrCreate/pvp_room` request:**

**Response Headers turėtų rodyti:**
- ✅ `Access-Control-Allow-Origin: https://jocular-zabaione-835b49.netlify.app`
- ✅ `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- ✅ `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With`
- ✅ `Access-Control-Allow-Credentials: true`

---

## 📋 Checklist:

- [ ] `colyseus-server/src/index.ts` turi `matchMaker.controller.getCorsHeaders` override
- [ ] `npm run build` sėkmingas
- [ ] Commit → Push serveris į GitHub
- [ ] Colyseus Cloud → Deployments → Deploy
- [ ] Server logs rodo sėkmingą start'ą
- [ ] Browser console NE rodo CORS error'ų
- [ ] Network tab rodo CORS headers

---

## 💡 Svarbiausia

**Netlify build sėkmingas, bet Colyseus serveris neturi CORS fix!**

**Reikia deploy'inti Colyseus serveris su `matchMaker.controller.getCorsHeaders` override!**

---

**Dabar commit'inkite ir deploy'inkite Colyseus serveris!** 🚀

