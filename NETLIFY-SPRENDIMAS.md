# Netlify Sprendimas - Kaip Paleisti Žaidimą

## ❌ Problema:
Netlify build logs rodo "0 new file(s) to upload" - Netlify mato, kad build output identiškas.

## ✅ Sprendimas:

### 1. **Force NEW Build Output Hash**
`vite.config.ts` dabar naudoja `BUILD_ID` (timestamp + random):
- Kiekvienas build turės UNIKALŲ hash
- Filename: `index-[hash]-build-TIMESTAMP-RANDOM.js`
- Netlify VISADA matys kaip naują failą

### 2. **Clear Dist Before Build**
`netlify.toml` build command:
```toml
command = "rm -rf dist && npm install && npm run build"
```
- Išvalo `dist/` prieš build
- Priverčia fresh build

### 3. **Netlify UI Settings**
**SVARBU:** Netlify Dashboard → Site settings → Build & deploy → Build settings:
- **Build command:** PALIKITE TUŠČIĄ (Netlify naudos netlify.toml)
- **Publish directory:** PALIKITE TUŠČIĄ arba `dist`

### 4. **Clear Cache**
Netlify → Deploys → "Trigger deploy" → **"Clear cache and deploy site"**

## 📋 Ką Daryti:

1. **Netlify Dashboard** → Site settings → Build & deploy → Build settings
2. IŠTRINKITE Build command laukelį
3. IŠTRINKITE Publish directory laukelį
4. **Deploys** → "Trigger deploy" → **"Clear cache and deploy site"**
5. Įkelkite **GG22.zip**

## ✅ Rezultatas:

Build logs turėtų rodyti:
- ✅ Build command: `rm -rf dist && npm install && npm run build`
- ✅ Version: `1.0.17`
- ✅ Build output: `index-[NEW-HASH]-build-[TIMESTAMP]-[RANDOM].js`
- ✅ **"2+ new file(s) to upload"** (ne 0!)

## 🔧 Jei Vis Dar Neveikia:

1. Patikrinkite build logs - turėtų rodyti naują hash
2. Patikrinkite Netlify UI - ar Build command laukelis TUŠČIAS?
3. Patikrinkite cache - ar išvalytas?

---

**Šis sprendimas PRIVERS Netlify sukurti naują build output kiekvieną kartą!**

