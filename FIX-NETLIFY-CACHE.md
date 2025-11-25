# Kaip išspręsti Netlify Cache Problemą

## Problema
Netlify rodo "0 new file(s) to upload" - tai reiškia, kad build output yra identiškas prieš tai esančiam, net jei source failai buvo atnaujinti.

## Sprendimai

### 1. Išvalykite Netlify Cache (Greitausias būdas)

**Netlify Dashboard:**
1. Eikite į: https://app.netlify.com
2. Pasirinkite savo projektą
3. Eikite į **"Deploys"** tab
4. Spustelėkite **"Trigger deploy"** → **"Clear cache and deploy site"**
5. Įkelkite naują **GG6.zip**

**ARBA:**

1. Eikite į **"Deploys"** tab
2. Raskite paskutinį deploy
3. Spustelėkite **"..."** (three dots) → **"Clear cache and retry deploy"**

### 2. Pridėkite Build Hook (Automatinis cache clear)

1. Netlify → **Site settings** → **Build & deploy** → **Build hooks**
2. Sukurkite naują build hook
3. Naudokite šį hook kiekvieną kartą, kai norite deploy'inti

### 3. Pakeiskite Build Command (Priversti cache clear)

Pridėkite į `netlify.toml`:

```toml
[build]
  command = "rm -rf dist && npm install && npm run build"
  publish = "dist"
```

Arba Windows PowerShell:

```toml
[build]
  command = "if (Test-Path dist) { Remove-Item -Recurse -Force dist }; npm install && npm run build"
  publish = "dist"
```

### 4. Pridėkite Version Number (Priversti naują build)

Pridėkite į `package.json`:

```json
{
  "version": "1.0.1",
  "scripts": {
    "build": "echo 'Build version 1.0.1' && tsc && vite build"
  }
}
```

Kiekvieną kartą, kai atnaujinate versiją, build bus naujas.

### 5. Patikrinkite, ar Source Failai Atnaujinti

**Lokaliai:**
```bash
# Patikrinkite, ar GG6.zip turi naujus failus
Get-Item GG6.zip | Select-Object LastWriteTime

# Patikrinkite, ar source failai atnaujinti
Get-ChildItem GG6\src\simple-main.ts | Select-Object LastWriteTime
```

**Netlify:**
1. Netlify → **Deploys** → **Deploy log**
2. Patikrinkite, ar build log rodo:
   - `✓ 90 modules transformed` (gerai!)
   - `dist/assets/index-XXXXX.js` (hash turėtų būti kitoks)

### 6. Priverstinai Sukurkite Naują Build

**Lokaliai:**
```bash
# Ištrinkite dist folderį
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue

# Sukurkite naują build
npm run build

# Patikrinkite, ar JavaScript failas yra naujas
Get-ChildItem dist\assets\*.js | Select-Object Name, LastWriteTime
```

**Tada:**
1. Sukurkite naują GG6.zip
2. Įkelkite į Netlify
3. Išvalykite cache prieš deploy

## Rekomenduojamas Sprendimas

**Greitausias būdas:**
1. Netlify → **Deploys** → **"Clear cache and retry deploy"**
2. Įkelkite naują **GG6.zip**
3. Palaukite, kol build baigsis

**Ilgalaikis sprendimas:**
1. Pridėkite į `netlify.toml`:
   ```toml
   [build]
     command = "rm -rf dist && npm install && npm run build"
   ```
2. Kiekvieną kartą deploy'inti su "Clear cache and deploy site"

## Patikrinimas

Po cache clear ir deploy:
1. Patikrinkite build log - turėtų rodyti naują JavaScript failo hash
2. Patikrinkite deploy file browser - turėtų rodyti naują `index-XXXXX.js` failą
3. Patikrinkite naršyklėje - turėtų rodyti naują versiją (hard refresh: Ctrl+Shift+R)

## Pastabos

- Netlify cache yra naudingas greitam build, bet gali sukelti problemas, kai source failai keičiasi
- "0 new file(s) to upload" reiškia, kad build output yra identiškas, bet tai gali būti dėl cache
- Visada išvalykite cache, kai atnaujinate source failus

