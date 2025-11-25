# ⚡ Netlify PvP Online - Greitas Fix

## 🎯 Problema

- ❌ Colyseus Cloud serveris rodo "Service Unavailable"
- ❌ PvP Online neveikia ant Netlify

---

## ✅ Greitas Sprendimas - 2 Žingsniai

### Step 1: Deploy Colyseus Serveris į Colyseus Cloud

**SVARBU:** Colyseus Cloud serveris turi būti deploy'intas!

1. **Eikite į:** https://cloud.colyseus.io
2. **Prisijunkite**
3. **Pasirinkite aplikaciją** (pvz: `ok05`)
4. **Deployments** → **Deploy** (arba **Redeploy**)
5. **Palaukite 2-5 min**

**Patikrinkite:**
```
https://de-fra-f8820c12.colyseus.cloud/health
```
**Turėtumėte matyti:** `{"status":"ok"}`

---

### Step 2: Pridėkite Environment Variable į Netlify

**SVARBU:** Netlify turi turėti `VITE_COLYSEUS_ENDPOINT`!

1. **Eikite į:** https://app.netlify.com
2. **Pasirinkite site:** `jocular-zabaione-835b49`
3. **Site settings** → **Environment variables**
4. **Add a variable:**
   - **Key:** `VITE_COLYSEUS_ENDPOINT`
   - **Value:** `https://de-fra-f8820c12.colyseus.cloud`
   - **Scope:** All scopes
5. **Save**
6. **Deploys** → **Trigger deploy** → **Clear cache and deploy site**
7. **Palaukite 2-5 min**

---

## ✅ Patikrinimas

**Atidarykite:** `https://jocular-zabaione-835b49.netlify.app/`

**Browser Console (F12):**
- ✅ Turėtų rodyti: `✅ Colyseus client initialized`
- ✅ Turėtų rodyti: `Joined Colyseus room: [room-id]`
- ❌ NETURĖTŲ būti: `ERR_CONNECTION_REFUSED`
- ❌ NETURĖTŲ būti: `Service Unavailable`

---

## 📋 Endpoint'ai

- **Colyseus Cloud:** `https://de-fra-f8820c12.colyseus.cloud`
- **Netlify:** `https://jocular-zabaione-835b49.netlify.app`
- **Netlify Env Var:** `VITE_COLYSEUS_ENDPOINT` = `https://de-fra-f8820c12.colyseus.cloud`

---

**Status:** ✅ Instrukcijos paruoštos! Sekite Step 1-2!




