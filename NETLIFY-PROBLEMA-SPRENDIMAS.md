# Netlify Problema - Kodėl Neveikia?

## 🔍 Identifikuotos Problemos:

### 1. **Netlify UI Override'ina netlify.toml**
Netlify Dashboard → Build Settings gali turėti hardcoded build command, kuris override'ina `netlify.toml` iš zip failo.

### 2. **Cache Problema**
Netlify naudoja cached dependencies ir build output, todėl hash nekeičiasi.

### 3. **Build Output Hash Nekeičiasi**
Netlify build logs rodo tą patį hash (`index-D3zjpK3v.js`), nes build output identiškas.

---

## ✅ Sprendimas - GG19.zip:

### 1. **Timestamp Build Output**
`vite.config.ts` dabar naudoja `Date.now()` timestamp build output filenames:
```typescript
entryFileNames: `assets/index-[hash]-v1.0.14-${Date.now()}.js`
```
**Kiekvienas build turės UNIKALŲ hash dėl timestamp!**

### 2. **Cache Clearing**
`netlify.toml` build command dabar išvalo cache:
```toml
command = "rm -rf dist node_modules/.cache && npm install && npm run build"
```

### 3. **Version Hash**
`package.json` version: `1.0.14`

---

## 🚀 Ką Daryti Dabar:

### Step 1: Netlify Dashboard → Build Settings

1. Eikite į **Netlify Dashboard** → Jūsų projektas
2. Eikite į **Site settings** → **Build & deploy** → **Build settings**
3. **IŠTRINKITE** arba **PALIKITE TUŠČIĄ** Build command laukelį
4. **IŠTRINKITE** arba **PALIKITE TUŠČIĄ** Publish directory laukelį
5. Leiskite Netlify naudoti **tik netlify.toml** iš zip failo

### Step 2: Clear Cache & Deploy

1. Eikite į **Deploys** tab
2. Spustelėkite **"Trigger deploy"** → **"Clear cache and deploy site"**
3. Įkelkite naują **GG19.zip**

### Step 3: Patikrinkite Build Logs

Po deploy, patikrinkite build logs:
- ✅ Turėtų rodyti: `rm -rf dist node_modules/.cache`
- ✅ Turėtų rodyti: `version 1.0.14`
- ✅ Turėtų rodyti: **UNIKALŲ hash** su timestamp (pvz: `index-[hash]-v1.0.14-1234567890.js`)
- ✅ Turėtų rodyti: **"2+ new file(s) to upload"** (ne 0 arba 1)

---

## 🔧 Jei Vis Dar Neveikia:

### Option 1: Hardcoded Build Command Netlify UI

Jei Netlify reikalauja build command UI:
1. **Build command:** `rm -rf dist node_modules/.cache && npm install && npm run build`
2. **Publish directory:** `dist`
3. Tada Netlify naudos šiuos nustatymus vietoj netlify.toml

### Option 2: Patikrinkite Environment Variables

1. **Netlify Dashboard** → **Site settings** → **Environment variables**
2. Patikrinkite, ar nėra `NETLIFY_BUILD_COMMAND` ar kitų override'ų
3. Ištrinkite visus override'us

### Option 3: Browser Cache

Jei build'as sėkmingas, bet naršyklė vis dar rodo seną versiją:
1. Hard refresh: `Ctrl+Shift+R` (Windows) arba `Cmd+Shift+R` (Mac)
2. ARBA DevTools → Network → pažymėkite "Disable cache"
3. ARBA naudokite Incognito/Private mode

---

## 📋 Patikrinimas:

Po deploy, build logs turėtų rodyti:
- ✅ Build command: `rm -rf dist node_modules/.cache && npm install && npm run build`
- ✅ Version: `1.0.14`
- ✅ Build output: `index-[UNIQUE-HASH]-v1.0.14-[TIMESTAMP].js`
- ✅ Upload: `2+ new file(s) to upload`

Jei vis dar rodo seną hash arba `0 new file(s)`, problema yra Netlify UI override'uose arba cache.

