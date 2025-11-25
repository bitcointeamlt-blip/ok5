# Netlify Cache Problem - Kaip Išspręsti

## Problema
Netlify build logs rodo:
- Build komanda: `npm install && npm run build` (be cache clearing)
- Version: `1.0.11` (ne `1.0.12`)
- Build naudoja cached dependencies

Tai reiškia, kad **Netlify Build Settings override'ina netlify.toml** arba naudoja seną cache.

## Sprendimas

### 1. Patikrinkite Netlify Build Settings

1. Eikite į **Netlify Dashboard** → Jūsų projektas
2. Eikite į **Site settings** → **Build & deploy** → **Build settings**
3. **IŠTRINKITE** arba **PALIKITE TUŠČIĄ** Build command laukelį
4. **IŠTRINKITE** arba **PALIKITE TUŠČIĄ** Publish directory laukelį
5. Leiskite Netlify naudoti **tik netlify.toml** iš zip failo

### 2. Išvalykite Netlify Cache

1. Eikite į **Deploys** tab
2. Spustelėkite **"Trigger deploy"** → **"Clear cache and deploy site"**
3. Įkelkite naują **GG18.zip**

### 3. Patikrinkite, ar Zip Turi Teisingus Failus

GG18.zip turėtų turėti:
- `netlify.toml` su build komanda: `rm -rf dist node_modules && npm install && npm run build`
- `package.json` su version: `1.0.12`

### 4. Jei Vis Dar Neveikia

1. **Netlify Dashboard** → **Site settings** → **Build & deploy** → **Build settings**
2. **Build command:** palikite TUŠČIĄ (Netlify naudos netlify.toml)
3. **Publish directory:** palikite TUŠČIĄ arba įrašykite `dist`
4. **Environment variables:** patikrinkite, ar nėra `NETLIFY_BUILD_COMMAND` ar kitų override'ų

### 5. Alternatyvus Sprendimas (Jei Netlify Neleidžia Tuščių Laukelių)

Jei Netlify reikalauja build command:
1. **Build command:** `rm -rf dist node_modules && npm install && npm run build`
2. **Publish directory:** `dist`
3. Tada Netlify naudos šiuos nustatymus vietoj netlify.toml

## Patikrinimas

Po deploy, patikrinkite build logs:
- Turėtų rodyti: `rm -rf dist node_modules`
- Turėtų rodyti: `version 1.0.12`
- Turėtų rodyti: `2 new file(s) to upload` (ne 0)

## Browser Cache

Jei build'as sėkmingas, bet naršyklė vis dar rodo seną versiją:
1. Hard refresh: `Ctrl+Shift+R` (Windows) arba `Cmd+Shift+R` (Mac)
2. ARBA DevTools → Network → pažymėkite "Disable cache"
3. ARBA naudokite Incognito/Private mode

