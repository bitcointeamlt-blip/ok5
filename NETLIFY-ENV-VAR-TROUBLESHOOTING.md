# 🔧 Netlify Environment Variable Troubleshooting

## ❌ Problema: Console Rodo "Cannot enter lobby: Colyseus endpoint not configured"

**Matau console log'us:**
- `Cannot enter lobby: Colyseus endpoint not configured`
- Build output: `index-B0TFbIq9-v1.0.12.js` (senas build)

---

## ✅ Patikrinimo Žingsniai

### Step 1: Patikrinkite Ar Environment Variable Pridėtas

1. **Netlify Dashboard:**
   - Eikite: Site settings → Environment variables
   - Patikrinkite, ar yra `VITE_COLYSEUS_ENDPOINT`
   - Patikrinkite, ar value = `https://de-fra-f8820c12.colyseus.cloud`

### Step 2: Patikrinkite Scope

- **Scope turėtų būti:** "All scopes"
- **NE** "Specific scopes" (tai reikalauja paid plan)

### Step 3: Redeploy Site

**SVARBU:** Po pridėjimo environment variable, **BŪTINAI** reikia redeploy'inti site!

1. **Netlify → Deploys:**
   - Spustelėkite "Trigger deploy" → "Deploy site"
   - ARBA: Jei naudojate GitHub, padarykite naują commit ir push

2. **Palaukite build:**
   - Build gali užtrukti 2-5 minučių
   - Stebėkite build logs

### Step 4: Patikrinkite Build Logs

Po redeploy, patikrinkite build logs:

**Turėtų rodyti:**
- ✅ Environment variables loaded
- ✅ `VITE_COLYSEUS_ENDPOINT` = `https://de-fra-f8820c12.colyseus.cloud`
- ✅ Build output: `index-[NEW-HASH]-v1.0.19-[timestamp].js` (naujas hash)

**NE turėtų rodyti:**
- ❌ Build output: `index-B0TFbIq9-v1.0.12.js` (senas build)

### Step 5: Hard Refresh Naršyklėje

1. **Hard refresh:**
   - Windows: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

2. **ARBA Incognito/Private mode:**
   - Atidarykite puslapį Incognito režime

### Step 6: Patikrinkite Browser Console

Po hard refresh, patikrinkite console:

**Turėtų rodyti:**
- ✅ `Colyseus client initialized: wss://de-fra-f8820c12.colyseus.cloud`
- ✅ `Entered PvP Online lobby` (be klaidų)

**NE turėtų rodyti:**
- ❌ `Cannot enter lobby: Colyseus endpoint not configured`

---

## 🔧 Jei Vis Dar Neveikia

### Problema 1: Environment Variable Neatsiranda Build'e

**Sprendimas:**
1. Patikrinkite, ar variable scope = "All scopes"
2. Patikrinkite, ar value teisingas (be tarpų, be kabučių)
3. Redeploy'inkite site
4. Patikrinkite build logs - turėtų rodyti environment variables

### Problema 2: Build Output Vis Dar Senas

**Sprendimas:**
1. Patikrinkite, ar GitHub repo turi naujausią versiją
2. Patikrinkite, ar Netlify build'ina iš GitHub (ne cached)
3. Clear cache: "Trigger deploy" → "Clear cache and deploy site"

### Problema 3: Console Vis Dar Rodo Klaidą

**Sprendimas:**
1. Hard refresh naršyklėje (`Ctrl+Shift+R`)
2. Incognito mode
3. Patikrinkite, ar build output naujas (ne `v1.0.12`)
4. Patikrinkite, ar environment variable pridėtas teisingai

---

## 📋 Checklist

- [ ] `VITE_COLYSEUS_ENDPOINT` pridėtas Netlify Environment Variables
- [ ] Value = `https://de-fra-f8820c12.colyseus.cloud`
- [ ] Scope = "All scopes"
- [ ] Site redeploy'intas po environment variable pridėjimo
- [ ] Build logs rodo naują hash (ne `v1.0.12`)
- [ ] Build logs rodo environment variable
- [ ] Hard refresh naršyklėje (`Ctrl+Shift+R`)
- [ ] Browser console rodo `Colyseus client initialized`
- [ ] Browser console NE rodo "Cannot enter lobby"

---

## 💡 Svarbiausia

**Po pridėjimo environment variable, BŪTINAI reikia redeploy'inti site!**

Netlify neperskaitys environment variable, jei site nėra redeploy'intas.

**Taip pat patikrinkite, ar build output naujas (ne senas `v1.0.12`).**

