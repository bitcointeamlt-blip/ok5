# 🚀 Netlify Deployment Vadovas - Kaip Teisingai Įdėti Žaidimo Atnaujinimą

## ⚠️ SVARBU: Pagrindinė Problema

**Netlify UI Settings override'ina `netlify.toml` iš ZIP failo!**

Jei Netlify Dashboard turi hardcoded Build command, jis naudoja tą, ne iš ZIP failo.

---

## ✅ Teisingas Deployment Procesas

### Step 1: Paruoškite ZIP Failą

1. **Patikrinkite, kad turite naujausią versiją:**
   ```bash
   # Patikrinkite, ar src/simple-main.ts turi visus naujausius atnaujinimus
   ```

2. **Sukurkite GG22.zip** (jei dar nepadaryta):
   - ZIP failas jau paruoštas: `GG22.zip`
   - Jame yra visi failai: `src/`, `package.json`, `netlify.toml`, `vite.config.ts`, `index.html`

---

### Step 2: Netlify Dashboard - Build Settings ⚠️ LABAI SVARBU

**SVARBIAUSIAS ŽINGSNIS - Netlify UI turi override'inti netlify.toml!**

1. **Eikite į Netlify Dashboard:**
   - https://app.netlify.com
   - Pasirinkite savo site

2. **Eikite į Build Settings:**
   - Kairėje meniu: **"Site settings"**
   - Tada: **"Build & deploy"**
   - Tada: **"Build settings"**

3. **IŠTRINKITE Build Command:**
   - Raskite **"Build command"** laukelį
   - **IŠTRINKITE visą tekstą** (palikite TUŠČIĄ)
   - ARBA jei Netlify reikalauja kažko, įrašykite: `rm -rf dist && npm install && npm run build`

4. **Patikrinkite Publish Directory:**
   - Raskite **"Publish directory"** laukelį
   - Turėtų būti: `dist` arba TUŠČIĄ (Netlify naudos iš netlify.toml)

5. **SAVE** nustatymus

**Kodėl tai svarbu?**
- Jei Build command laukelis nėra tuščias, Netlify naudoja tą command, ne iš ZIP failo
- Netlify turi naudoti `netlify.toml` iš ZIP failo, kuris turi teisingą build command

---

### Step 3: Išvalykite Cache ir Deploy

1. **Eikite į Deploys sekciją:**
   - Kairėje meniu: **"Deploys"**

2. **Trigger Deploy:**
   - Spustelėkite **"Trigger deploy"** arba **"Deploy site"** mygtuką
   - ARBA jei yra **"Deploy manually"**, pasirinkite tą

3. **Pasirinkite "Clear cache and deploy site":**
   - **SVARBU:** Pasirinkite **"Clear cache and deploy site"** (ne tik "Deploy site")
   - Tai išvalys visą Netlify cache

4. **Įkelkite ZIP failą:**
   - Drag & drop **GG22.zip** į upload laukelį
   - ARBA pasirinkite failą iš kompiuterio

5. **Palaukite build:**
   - Build gali užtrukti 2-5 minučių
   - Stebėkite build logs

---

### Step 4: Patikrinkite Build Logs

Po build, patikrinkite build logs:

**Turėtų rodyti:**

1. **Build Command:**
   ```
   rm -rf dist && npm install && npm run build
   ```
   - ARBA: `npm install && npm run build` (jei netlify.toml neturi rm -rf)

2. **Version:**
   ```
   version: 1.0.18
   ```
   - Turėtų rodyti naują version iš package.json

3. **Build Output:**
   ```
   dist/assets/index-[HASH].js
   ```
   - Hash turėtų būti **NAUJAS** (ne tas pats kaip anksčiau)

4. **Upload:**
   ```
   2+ new file(s) to upload
   ```
   - **SVARBU:** Turėtų rodyti **"2+ new file(s)"**, ne "0 new file(s)"!

5. **Deploy Status:**
   ```
   Site is live ✨
   ```
   - Turėtų rodyti sėkmingą deploy

---

### Step 5: Browser Cache

**Netlify build sėkmingas, bet naršyklė rodo seną versiją?**

1. **Hard Refresh:**
   - Windows: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

2. **ARBA DevTools:**
   - Atidarykite DevTools (F12)
   - Network tab → "Disable cache"
   - Refresh puslapį

3. **ARBA Incognito/Private Mode:**
   - Atidarykite puslapį Incognito/Private režime

---

## 🔧 Troubleshooting

### Problema: Build logs rodo "0 new file(s) to upload"

**Priežastys:**
- Netlify cache nėra išvalytas
- Build output hash tas pats (source failai identiški)
- Netlify UI Build command override'ina netlify.toml

**Sprendimas:**
1. Patikrinkite, ar Build command laukelis TUŠČIAS Netlify UI
2. Išvalykite cache: "Clear cache and deploy site"
3. Patikrinkite, ar source failai tikrai skiriasi

---

### Problema: Build logs rodo seną version (1.0.12 vietoj 1.0.18)

**Priežastys:**
- Netlify naudoja cached package.json
- ZIP failas neturi naujo package.json

**Sprendimas:**
1. Patikrinkite, ar GG22.zip turi package.json su version 1.0.18
2. Išvalykite cache
3. Įkelkite naują ZIP failą

---

### Problema: Build logs rodo seną build command

**Priežastys:**
- Netlify UI Build command override'ina netlify.toml

**Sprendimas:**
1. Netlify Dashboard → Site settings → Build & deploy → Build settings
2. IŠTRINKITE Build command laukelį
3. SAVE
4. Deploy iš naujo

---

### Problema: Žaidimas vis dar rodo seną versiją po deploy

**Priežastys:**
- Browser cache
- Netlify CDN cache

**Sprendimas:**
1. Hard refresh: `Ctrl+Shift+R`
2. Incognito mode
3. Patikrinkite, ar build logs rodo naują hash
4. Palaukite 5-10 minučių (CDN cache gali užtrukti)

---

## 📋 Deployment Checklist

Prieš deploy, patikrinkite:

- [ ] GG22.zip failas paruoštas
- [ ] GG22.zip turi naujausią `src/simple-main.ts`
- [ ] GG22.zip turi `package.json` su version 1.0.18
- [ ] GG22.zip turi `netlify.toml` su teisingu build command
- [ ] Netlify UI Build command laukelis TUŠČIAS arba teisingas
- [ ] Netlify UI Publish directory = `dist` arba TUŠČIAS
- [ ] Pasirinkta "Clear cache and deploy site"
- [ ] Build logs rodo naują version (1.0.18)
- [ ] Build logs rodo naują hash
- [ ] Build logs rodo "2+ new file(s) to upload"
- [ ] Browser cache išvalytas (hard refresh)

---

## ✅ Sėkmingas Deployment Turėtų Rodyti:

1. ✅ Build command: `npm install && npm run build` (arba su `rm -rf dist`)
2. ✅ Version: `1.0.18`
3. ✅ Build output: `index-[NEW-HASH].js` (naujas hash)
4. ✅ Upload: `"2+ new file(s) to upload"` (ne 0!)
5. ✅ Deploy status: `"Site is live ✨"`
6. ✅ Žaidimas atnaujintas (hard refresh naršyklėje)

---

## 💡 Svarbiausia:

**Pagrindinė problema yra Netlify UI settings, kurie override'ina netlify.toml!**

**Reikia:**
1. IŠTRINTI Build command laukelį Netlify UI (arba palikti tik `rm -rf dist && npm install && npm run build`)
2. IŠVALYTI cache ("Clear cache and deploy site")
3. ĮKELTI naują ZIP failą

**Tada turėtų veikti!**

---

## 📞 Jei Vis Dar Neveikia:

1. Patikrinkite build logs - kokį build command naudoja?
2. Patikrinkite Netlify UI - ar Build command laukelis TUŠČIAS?
3. Patikrinkite cache - ar išvalytas?
4. Patikrinkite ZIP failą - ar turi teisingus failus?
5. Patikrinkite browser cache - ar hard refresh padėjo?

**Jei vis dar neveikia, kreipkitės į Netlify support su build logs ir site settings screenshot.**

