# 🔍 Netlify Deep Diagnostics - Vis Dar Neveikia

## ✅ Kas Jau Padaryta:

- ✅ `VITE_COLYSEUS_ENDPOINT` pridėtas į Netlify Environment Variables
- ✅ Netlify redeploy'intas kelis kartus
- ✅ Bet vis dar neveikia!

---

## 🔍 Išsami Diagnostika:

### 1. Patikrinkite Netlify Build Logs

**Kur:** Netlify Dashboard → Deploys → Latest deploy → Build logs

**Ką ieškoti:**
- Ar build'as sėkmingas?
- Ar yra kokių nors error'ų?
- Ar `VITE_COLYSEUS_ENDPOINT` yra build log'uose?

**Jei nėra `VITE_COLYSEUS_ENDPOINT` build log'uose:**
- Patikrinkite, ar environment variable pridėtas teisingai
- Patikrinkite, ar scope = "All scopes" arba "Production"
- Redeploy'inkite Netlify

---

### 2. Patikrinkite Browser Console

**Kur:** Netlify-deployed žaidimas → DevTools → Console

**Ką ieškoti:**
- Ar rodo: `🔵 Colyseus endpoint found: https://de-fra-f8820c12...`?
- Ar rodo: `✅ Colyseus client initialized: wss://de-fra-f8820c12...`?
- Ar rodo: `❌ Cannot enter lobby: Colyseus endpoint not configured`?
- Ar rodo CORS error'us?

**Jei rodo "Colyseus not configured":**
- Netlify build neįtraukė environment variable
- Patikrinkite build logs
- Redeploy'inkite Netlify

**Jei rodo CORS error'us:**
- Colyseus serveris neturi CORS fix
- Patikrinkite Colyseus serveris deploy'intas su CORS fix

---

### 3. Patikrinkite Network Tab

**Kur:** DevTools → Network

**Ką ieškoti:**
- Raskite `matchmake/joinOrCreate/pvp_room` request
- Patikrinkite Response Headers:
  - Ar yra `Access-Control-Allow-Origin`?
  - Ar yra `Access-Control-Allow-Methods`?
  - Ar yra `Access-Control-Allow-Headers`?

**Jei nėra CORS headers:**
- Colyseus serveris neturi CORS fix
- Deploy'inkite Colyseus serveris su CORS fix

---

### 4. Patikrinkite Colyseus Serveris

**Kur:** Colyseus Cloud → Deployments → LOGS

**Ką ieškoti:**
- Ar serveris start'ina sėkmingai?
- Ar yra `✅ Server running on port XXXX`?
- Ar yra CORS error'ų?

**Jei serveris neveikia:**
- Patikrinkite Colyseus Cloud → Deployments → Status
- Redeploy'inkite serveris

---

### 5. Patikrinkite Environment Variable Format

**Netlify Dashboard → Environment Variables:**

**Patikrinkite:**
- Key: `VITE_COLYSEUS_ENDPOINT` (tiksliai taip, be tarpų)
- Value: `https://de-fra-f8820c12.colyseus.cloud` (tiksliai taip, be tarpų)
- Scope: "All scopes" arba "Production"

**Jei formatas neteisingas:**
- Pakeiskite environment variable
- Redeploy'inkite Netlify

---

## 🚀 Galimi Sprendimai:

### Solution 1: Patikrinkite Ar Build Naudoja Environment Variable

**Test:**
1. Netlify Dashboard → Deploys → Latest deploy → Build logs
2. Ieškokite: `VITE_COLYSEUS_ENDPOINT`
3. Jei nėra - environment variable neįtrauktas į build

**Fix:**
1. Patikrinkite environment variable formatą
2. Redeploy'inkite Netlify
3. Patikrinkite build logs vėl

---

### Solution 2: Patikrinkite Ar Colyseus Serveris Deploy'intas su CORS Fix

**Test:**
1. Colyseus Cloud → Deployments → LOGS
2. Patikrinkite, ar serveris start'ina sėkmingai
3. Browser console - ar yra CORS error'ų?

**Fix:**
1. Patikrinkite `colyseus-server/src/index.ts` - ar yra `matchMaker.controller.getCorsHeaders`?
2. Commit → Push → Deploy Colyseus serveris
3. Palaukite 2-5 min
4. Patikrinkite browser console

---

### Solution 3: Hard Refresh Browser

**Test:**
1. Atidarykite Netlify-deployed žaidimą
2. Hard refresh: `Ctrl+Shift+R` (Windows) arba `Cmd+Shift+R` (Mac)
3. Patikrinkite browser console

**Fix:**
1. Clear browser cache
2. ARBA: Atidarykite Incognito/Private mode
3. Patikrinkite browser console

---

### Solution 4: Patikrinkite Ar Vite Build Naudoja Environment Variable

**Test:**
1. Netlify Dashboard → Deploys → Latest deploy → Build logs
2. Ieškokite: `VITE_COLYSEUS_ENDPOINT`
3. Patikrinkite, ar build'as naudoja environment variable

**Fix:**
1. Patikrinkite `vite.config.ts` - ar yra specialių nustatymų?
2. Patikrinkite `package.json` - ar yra build script'ų?
3. Redeploy'inkite Netlify

---

## 📋 Checklist:

- [ ] Netlify build logs rodo `VITE_COLYSEUS_ENDPOINT`?
- [ ] Browser console rodo `🔵 Colyseus endpoint found`?
- [ ] Browser console NE rodo "Colyseus not configured"?
- [ ] Network tab rodo CORS headers?
- [ ] Colyseus serveris deploy'intas su CORS fix?
- [ ] Browser cache išvalytas (hard refresh)?
- [ ] Environment variable formatas teisingas?

---

## 💡 Svarbiausia

**Jei vis dar neveikia po visų šių patikrinimų:**

1. **Patikrinkite build logs** - ar `VITE_COLYSEUS_ENDPOINT` yra?
2. **Patikrinkite browser console** - kokie error'ai?
3. **Patikrinkite Network tab** - ar yra CORS headers?
4. **Patikrinkite Colyseus serveris** - ar deploy'intas su CORS fix?

**Reikia konkretių error'ų iš browser console ir build logs, kad galėčiau padėti!**

---

**Dabar patikrinkite build logs ir browser console - kokie konkretūs error'ai?** 🔍

