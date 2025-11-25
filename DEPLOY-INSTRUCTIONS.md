# Netlify Deploy - Instrukcijos

## Problema:
Netlify build'e transformuojama tik **6 moduliai** (JavaScript 48 KB), o lokaliame build'e - **90 modulių** (232 KB).

## Sprendimas:

### Įkelkite SOURCE FAILUS (ne dist/):

1. **Sukurkite ZIP su šiais failais:**
   - `src/` folderis (su visais failais)
   - `package.json`
   - `tsconfig.json`
   - `vite.config.ts`
   - `netlify.toml`
   - `index.html` (root level)
   - **NEĮKELKITE** `node_modules/` (Netlify įdiegs automatiškai)
   - **NEĮKELKITE** `dist/` (Netlify sukurs automatiškai)

2. **Netlify → Deploy manually:**
   - Įkelkite ZIP su source failais
   - Netlify automatiškai paleis: `npm install && npm run build`

3. **Patikrinkite build log:**
   - Turėtumėte matyti: **"✓ 90 modules transformed"** (ne 6!)
   - JavaScript failas turėtų būti **~232 KB** (ne 48 KB!)


