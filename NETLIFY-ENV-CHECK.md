# ✅ Netlify Environment Variables - Patikrinimas

## 🔍 Kaip Patikrinti:

### 1. Netlify Dashboard:

1. Eikite į: https://app.netlify.com
2. Pasirinkite jūsų site: `jocular-zabaione-835b49`
3. Eikite į **Site settings** (kairėje meniu)
4. Spauskite **Environment variables** (kairėje sub-meniu)

### 2. Patikrinkite ar yra:

**Turėtumėte matyti:**
- **Key:** `VITE_COLYSEUS_ENDPOINT`
- **Value:** `https://de-fra-f8820c12.colyseus.cloud`
- **Scopes:** Production, Preview, Deploy Previews (arba "All")

**Jei NĖRA:**

1. Spauskite **"Add a variable"** (viršuje dešinėje)
2. **Key:** `VITE_COLYSEUS_ENDPOINT` (tiksliai taip, be tarpų!)
3. **Value:** `https://de-fra-f8820c12.colyseus.cloud` (tiksliai taip!)
4. **Scopes:** Pasirinkite **"All scopes"** (Production, Preview, Deploy Previews)
5. Spauskite **"Save"**

### 3. Po Pridėjimo - Redeploy:

**SVARBU:** Netlify turi rebuild'inti su nauju environment variable!

1. Eikite į **Deploys** (viršutiniame meniu)
2. Spauskite **"Trigger deploy"** → **"Deploy site"**
3. Palaukite kol build baigsis (2-5 minutes)

### 4. Patikrinkite Build Log'us:

1. Spauskite ant naujo deployment'o
2. Patikrinkite **Build log**
3. Turėtumėte matyti, kad build sėkmingas

## 🔍 Browser Console Patikrinimas:

Po redeploy, atidarykite `https://jocular-zabaione-835b49.netlify.app`:

1. Atidarykite Developer Tools (F12)
2. Eikite į **Console** tab
3. Patikrinkite log'us:

**Turėtumėte matyti:**
```
🔍 Colyseus Service Environment: {
  hasEnv: true,  ← Turi būti TRUE!
  endpoint: 'wss://de-fra-f8820c12.colyseus.cloud...',  ← Turi būti teisingas!
  isProduction: true,
  hostname: 'jocular-zabaione-835b49.netlify.app'
}
```

**Jei matote:**
- `hasEnv: false` → Netlify neturi env variable ARBA build nebuvo atnaujintas
- `endpoint: 'not set'` → Netlify neturi env variable
- `❌ VITE_COLYSEUS_ENDPOINT not set` → Netlify neturi env variable

## ⚠️ SVARBU:

1. **Key turi būti tiksliai:** `VITE_COLYSEUS_ENDPOINT` (be tarpų, didžiosios raidės)
2. **Value turi būti tiksliai:** `https://de-fra-f8820c12.colyseus.cloud` (be tarpų, su https://)
3. **Po pridėjimo TURITE redeploy'inti** - kitaip env variable nebus naudojamas build'e
4. **Patikrinkite ar build sėkmingas** - jei build fail'ina, env variable nebus naudojamas

## 🐛 Jei vis dar neveikia:

### 1. Patikrinkite ar env variable teisingas:

- Key: `VITE_COLYSEUS_ENDPOINT` (tiksliai taip!)
- Value: `https://de-fra-f8820c12.colyseus.cloud` (tiksliai taip!)

### 2. Patikrinkite ar build turi env variable:

Po rebuild, patikrinkite browser console:
- Turėtumėte matyti: `hasEnv: true`
- Turėtumėte matyti: `endpoint: 'wss://de-fra-f8820c12.colyseus.cloud...'`

### 3. Patikrinkite ar yra CORS error:

Jei matote CORS error browser console:
- Colyseus Cloud turi būti redeploy'intas su nauju build'u
- Build turi turėti teisingą CORS konfigūraciją

### 4. Hard Refresh Browser:

Po redeploy, bandykite hard refresh:
- Windows: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`

