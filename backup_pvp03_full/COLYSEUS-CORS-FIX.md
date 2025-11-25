# 🔧 Colyseus CORS Fix

## ❌ Problema: CORS Error

Console rodo:
```
Access to XMLHttpRequest at 'https://de-fra-f8820c12.colyseus.cloud/matchmake/joinOrCreate/pvp_room' 
from origin 'https://jocular-zabaione-835b49.netlify.app' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

**Priežastis:** Colyseus server CORS konfigūracija neleidžia request'ų iš Netlify domain.

---

## ✅ Sprendimas: Atnaujinti CORS Konfigūraciją

### Option 1: Colyseus Cloud CORS Settings (Rekomenduojama)

**Colyseus Cloud turėtų automatiškai valdyti CORS**, bet jei neveikia:

1. **Eikite į Colyseus Cloud Dashboard:**
   - https://cloud.colyseus.io
   - Pasirinkite savo aplikaciją

2. **Eikite į Settings:**
   - Raskite "CORS" arba "Security" sekciją
   - Pridėkite Netlify domain: `https://jocular-zabaione-835b49.netlify.app`
   - ARBA pasirinkite "Allow all origins"

3. **Redeploy Server:**
   - Deployments → Redeploy
   - Palaukite 2-5 min

---

### Option 2: Atnaujinti Server CORS Konfigūraciją

**Jei Colyseus Cloud neturi CORS settings:**

1. **Atnaujinti `colyseus-server/src/index.ts`:**
   - CORS konfigūracija jau pataisyta su `origin: true`
   - Pridėti `preflightContinue: false` ir `optionsSuccessStatus: 204`

2. **Commit → Push → Deploy:**
   - GitHub Desktop → Commit → Push
   - Colyseus Cloud → Deployments → Deploy

---

## 🔍 Patikrinimas

Po CORS fix, patikrinkite:

1. **Browser Console:**
   - Turėtų rodyti: `Colyseus client initialized`
   - Turėtų rodyti: `Entered PvP Online lobby`
   - **NE** turėtų rodyti: CORS error

2. **Network Tab:**
   - DevTools → Network
   - Raskite `matchmake/joinOrCreate/pvp_room` request
   - Patikrinkite Response Headers:
     - `Access-Control-Allow-Origin: *` arba `Access-Control-Allow-Origin: https://jocular-zabaione-835b49.netlify.app`

---

## 📋 Checklist

- [ ] Colyseus Cloud CORS settings patikrinti
- [ ] Netlify domain pridėtas į allowed origins (jei reikia)
- [ ] Server CORS konfigūracija atnaujinta
- [ ] Server redeploy'intas
- [ ] Browser console NE rodo CORS error
- [ ] Network tab rodo CORS headers

---

## 💡 Svarbiausia

**Colyseus Cloud turėtų automatiškai valdyti CORS**, bet jei neveikia, reikia patikrinti Colyseus Cloud Dashboard CORS settings.

**Jei Colyseus Cloud neturi CORS settings UI, server CORS konfigūracija jau pataisyta su `origin: true`.**

