# Netlify Neveikia - Visos Galimos Priežastys

## 🔍 Problema: Netlify Neatnaujina Žaidimo Nors Įkeliamas Naujas ZIP

### Kiek Kartų Bandyta:
- GG17, GG18, GG19, GG20, GG21 - visi neveikia
- GG10, GG16 - veikia (senesnės versijos)

---

## ❌ Galimos Priežastys (Prioritetas):

### 1. **Netlify UI Settings Override'ina netlify.toml** ⚠️ LABAI TIKĖTINA
**Problema:**
- Netlify Dashboard → Site settings → Build & deploy → Build settings
- Hardcoded Build command override'ina `netlify.toml` iš ZIP failo
- Netlify naudoja seną build command, ne naują iš ZIP

**Kaip Patikrinti:**
1. Eikite į Netlify Dashboard
2. Site settings → Build & deploy → Build settings
3. Patikrinkite Build command laukelį
4. Jei ten yra `npm install && npm run build` (be cache clearing), tai problema!

**Sprendimas:**
- IŠTRINKITE Build command laukelį (palikite TUŠČIĄ)
- ARBA įrašykite: `rm -rf dist node_modules/.cache && npm install && npm run build`
- Leiskite Netlify naudoti `netlify.toml` iš ZIP failo

---

### 2. **Netlify Cache Problema** ⚠️ LABAI TIKĖTINA
**Problema:**
- Netlify naudoja cached `node_modules` ir build output
- Netlify build logs rodo: "0 new file(s) to upload" arba "1 new file(s)"
- Build output hash nekeičiasi (`index-D3zjpK3v.js` vis tas pats)

**Kaip Patikrinti:**
1. Netlify → Deploys → Build logs
2. Patikrinkite, ar rodo seną hash
3. Patikrinkite, ar rodo "0 new file(s) to upload"

**Sprendimas:**
1. Netlify → Deploys → "Trigger deploy" → **"Clear cache and deploy site"**
2. ARBA Netlify → Site settings → Build & deploy → Environment variables
3. Pridėkite: `NETLIFY_CACHE_DISABLED = true`

---

### 3. **Package.json Version Nekeičia Build Output** ⚠️ TIKĖTINA
**Problema:**
- `package.json` version keičiasi (1.0.12 → 1.0.16)
- Bet `vite.config.ts` neturi version hash build output
- Build output hash vis tiek tas pats

**Kaip Patikrinti:**
- Build logs rodo tą patį JavaScript failo hash
- Netlify build output: `index-[SAME-HASH].js`

**Sprendimas:**
- `vite.config.ts` turėtų turėti version hash:
```typescript
entryFileNames: `assets/index-[hash]-v${process.env.npm_package_version || '1.0.16'}.js`
```

---

### 4. **Browser Cache** ⚠️ TIKĖTINA
**Problema:**
- Netlify build sėkmingas, bet naršyklė rodo seną versiją
- Browser cache'as naudoja seną JavaScript failą

**Kaip Patikrinti:**
- Hard refresh: `Ctrl+Shift+R` (Windows) arba `Cmd+Shift+R` (Mac)
- ARBA DevTools → Network → "Disable cache"
- ARBA Incognito/Private mode

**Sprendimas:**
- Hard refresh naršyklėje
- ARBA DevTools → Application → Clear storage

---

### 5. **Netlify Build Command Nenaudoja Cache Clearing** ⚠️ TIKĖTINA
**Problema:**
- `netlify.toml` turi: `command = "npm install && npm run build"`
- Neturi `rm -rf dist node_modules/.cache`
- Netlify naudoja cached dependencies

**Sprendimas:**
- Pakeisti į: `command = "rm -rf dist node_modules/.cache && npm install && npm run build"`

---

### 6. **Netlify Environment Variables** ⚠️ MAŽAI TIKĖTINA
**Problema:**
- Netlify Dashboard turi hardcoded environment variables
- Override'ina `netlify.toml` settings

**Kaip Patikrinti:**
- Netlify → Site settings → Environment variables
- Patikrinkite, ar nėra `NETLIFY_BUILD_COMMAND` ar kitų override'ų

---

### 7. **Netlify Build Logs Rodo Seną Versiją** ⚠️ MAŽAI TIKĖTINA
**Problema:**
- Build logs rodo seną `package.json` version
- Build logs rodo seną build command

**Kaip Patikrinti:**
- Netlify → Deploys → Build logs
- Patikrinkite, ar rodo naują version ir build command

---

## ✅ Rekomenduojamas Sprendimas (Eiliškumas):

### Step 1: Netlify UI Settings
1. Netlify Dashboard → Site settings → Build & deploy → Build settings
2. **IŠTRINKITE** Build command laukelį (palikite TUŠČIĄ)
3. **IŠTRINKITE** Publish directory laukelį (palikite TUŠČIĄ)
4. Leiskite Netlify naudoti **tik netlify.toml** iš ZIP failo

### Step 2: Clear Cache & Deploy
1. Netlify → Deploys → "Trigger deploy"
2. Pasirinkite **"Clear cache and deploy site"**
3. Įkelkite naują **GG21.zip**

### Step 3: Patikrinkite Build Logs
1. Po deploy, patikrinkite build logs
2. Turėtų rodyti:
   - Naują build command (iš netlify.toml)
   - Naują version (1.0.16)
   - Naują JavaScript failo hash
   - "2+ new file(s) to upload"

### Step 4: Browser Cache
1. Hard refresh: `Ctrl+Shift+R`
2. ARBA DevTools → Network → "Disable cache"
3. ARBA Incognito/Private mode

---

## 🔧 Jei Vis Dar Neveikia:

### Option 1: Hardcoded Build Command Netlify UI
Jei Netlify reikalauja build command UI:
1. **Build command:** `rm -rf dist node_modules/.cache && npm install && npm run build`
2. **Publish directory:** `dist`
3. Tada Netlify naudos šiuos nustatymus vietoj netlify.toml

### Option 2: Patikrinkite ZIP Failą
1. Išpakuokite GG21.zip
2. Patikrinkite, ar `netlify.toml` turi teisingą build command
3. Patikrinkite, ar `package.json` turi version 1.0.16

### Option 3: Netlify Support
Jei vis dar neveikia, kreipkitės į Netlify support su:
- Build logs
- Site settings screenshot
- ZIP failo struktūra

---

## 📋 Patikrinimo Checklist:

- [ ] Netlify UI Build command laukelis TUŠČIAS arba teisingas
- [ ] Netlify UI Publish directory laukelis TUŠČIAS arba `dist`
- [ ] Netlify cache išvalytas ("Clear cache and deploy site")
- [ ] Build logs rodo naują version (1.0.16)
- [ ] Build logs rodo naują build command
- [ ] Build logs rodo naują JavaScript failo hash
- [ ] Build logs rodo "2+ new file(s) to upload"
- [ ] Browser cache išvalytas (hard refresh)
- [ ] ZIP failas turi teisingus failus
- [ ] `netlify.toml` turi cache clearing build command

---

## 💡 Svarbiausia:

**Problema tikriausiai yra Netlify UI settings, kurie override'ina netlify.toml iš ZIP failo!**

Reikia:
1. IŠTRINTI Build command laukelį Netlify UI
2. IŠVALYTI cache
3. ĮKELTI naują ZIP

Tada turėtų veikti!

