# Netlify Troubleshooting - Jei vis dar neveikia

## Patikrinkite:

### 1. Ar įkėlėte TEISINGĄ ZIP?

**SVARBU:** Įkelkite ZIP, kurį sukūrėte su `npm run deploy:zip`, ne seną ZIP!

**Patikrinkite ZIP turinį:**
- ZIP turėtų turėti: `src/services/WalletService.ts`
- ZIP turėtų turėti: `src/services/SupabaseService.ts`
- ZIP turėtų turėti: `netlify.toml`
- ZIP turėtų turėti: `package.json`

### 2. Ar išvalėte Netlify cache?

Netlify gali naudoti seną cache. Reikia išvalyti:

1. Netlify Dashboard → Deploys
2. Spustelėkite "Clear cache and retry deploy"
3. ARBA: "Trigger deploy" → "Clear cache and deploy site"

### 3. Patikrinkite Build Log:

Netlify → Deploy log → ieškokite:
- **"✓ 90 modules transformed"** - gerai!
- **"✓ 6 modules transformed"** - blogai! (trūksta source failų)

### 4. Patikrinkite JavaScript Failo Dydį:

Netlify → Deploy file browser → `assets/` folderis:
- **~232 KB** - gerai!
- **~48 KB** - blogai! (trūksta modulių)

## Jei vis dar neveikia:

### Sprendimas A: Išvalykite cache ir redeploy

1. Netlify → Deploys → "Clear cache and retry deploy"
2. Įkelkite naują ZIP (sukurkite su `npm run deploy:zip`)
3. Patikrinkite build log

### Sprendimas B: Patikrinkite, ar ZIP turi visus failus

1. Išpakuokite ZIP lokaliai
2. Patikrinkite, ar yra `src/services/` folderis
3. Patikrinkite, ar yra visi failai:
   - `src/services/WalletService.ts`
   - `src/services/SupabaseService.ts`
   - `src/services/MatchmakingService.ts`
   - `src/services/PvPSyncService.ts`

### Sprendimas C: Naudokite Git Integration

Jei manual deploy vis dar neveikia, naudokite Git integration:
1. Push kodą į GitHub
2. Netlify → Import from Git
3. Netlify automatiškai deploy'ins su visais source failais


