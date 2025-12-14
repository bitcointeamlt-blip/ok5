# 🔧 Fix CORS ir Supabase Problemas

## ❌ Problema 1: CORS Error

**Console rodo:**
```
Access to XMLHttpRequest at 'https://de-fra-f8820c12.colyseus.cloud/matchmake/joinOrCreate/pvp_room' 
from origin 'https://jocular-zabaione-835b49.netlify.app' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

**Sprendimas:**
1. ✅ Pataisiau CORS konfigūraciją `colyseus-server/src/index.ts`
2. ⚠️ **REIKIA REDEPLOY'INTI COLYSEUS SERVERĮ**

---

## ❌ Problema 2: Supabase Client Null

**Console rodo:**
```
Cannot enter lobby: Supabase client is null
Failed to enter Supabase lobby
```

**Sprendimas:**
1. ⚠️ **REIKIA PRIDĖTI SUPABASE ENVIRONMENT VARIABLES Į NETLIFY**

---

## 🚀 Kaip Pataisyti

### Step 1: Deploy Colyseus Serveris (Fix CORS)

**Colyseus Cloud Dashboard:**
1. Eikite į: https://cloud.colyseus.io
2. Pasirinkite aplikaciją
3. **Deployments** → **Deploy** (arba **Redeploy**)
4. Palaukite 2-5 min

**ARBA GitHub Auto-Deploy:**
1. Commit → Push į GitHub
2. Colyseus Cloud automatiškai deploy'ins

---

### Step 2: Pridėkite Supabase Environment Variables (Fix Supabase)

**Netlify Dashboard:**
1. Eikite į: https://app.netlify.com
2. Pasirinkite site: `jocular-zabaione-835b49`
3. **Site settings** → **Environment variables**
4. Pridėkite:
   - **Key:** `VITE_SUPABASE_URL`
   - **Value:** jūsų Supabase URL (pvz: `https://xxxxx.supabase.co`)
   - **Save**
5. Pridėkite:
   - **Key:** `VITE_SUPABASE_ANON_KEY`
   - **Value:** jūsų Supabase anon key
   - **Save**

**SVARBU:** Po pridėjimo environment variables → **Redeploy frontend!**

---

### Step 3: Redeploy Frontend (Po Supabase Env Vars)

**Netlify Dashboard:**
1. **Deploys** → **Trigger deploy** → **Clear cache and deploy site**
2. Palaukite 2-5 min

---

## ✅ Po Pataisymų

### Patikrinkite:

1. **Colyseus CORS:**
   - Atidarykite browser console
   - Pasirinkite "PvP Online"
   - Turėtumėte matyti: `✅ Connected to Colyseus server...`
   - **NĖRA** CORS error'ų

2. **Supabase Fallback:**
   - Jei Colyseus nepavyksta, turėtų veikti Supabase
   - Turėtumėte matyti: `✅ Successfully entered Supabase lobby (fallback mode)`

---

## 📋 Checklist

### Colyseus Server:
- [ ] CORS konfigūracija pataisyta (`colyseus-server/src/index.ts`)
- [ ] Serveris redeploy'intas Colyseus Cloud
- [ ] Serveris veikia (health check OK)

### Netlify Frontend:
- [ ] `VITE_COLYSEUS_ENDPOINT` = `https://de-fra-f8820c12.colyseus.cloud`
- [ ] `VITE_SUPABASE_URL` = jūsų Supabase URL
- [ ] `VITE_SUPABASE_ANON_KEY` = jūsų Supabase anon key
- [ ] Frontend redeploy'intas (po env vars pridėjimo)

---

## 🎯 Išvada

**Reikia:**
1. ✅ Deploy'inti Colyseus serverį (fix CORS)
2. ✅ Pridėti Supabase env vars į Netlify
3. ✅ Redeploy'inti frontend

**Po to viskas veiks!** 🚀








