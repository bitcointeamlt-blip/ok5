# Alternatyvos Netlify - Nemokamos Platformos

## Problema nėra dėl nemokamo plano!

Netlify nemokamas planas gali lengvai valdyti:
- ✅ 232 KB JavaScript failą (mūsų dydis)
- ✅ 100 GB bandwidth per mėnesį
- ✅ 300 build minutes per mėnesį

**Problema yra ta, kad Netlify build'e trūksta source failų**, ne dėl plano apribojimų.

## Alternatyvos:

### 1. Vercel (Rekomenduojama)

**Privalumai:**
- ✅ Automatinis deploy iš Git
- ✅ Nemokamas planas (100 GB bandwidth)
- ✅ Greitas CDN
- ✅ Automatinis HTTPS
- ✅ Lengvas setup

**Kaip naudoti:**
1. Push kodą į GitHub
2. Eikite į: https://vercel.com
3. "Import Project" → pasirinkite repository
4. Vercel automatiškai aptiks Vite projektą
5. Deploy automatiškai!

**Build Settings:**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

### 2. Cloudflare Pages

**Privalumai:**
- ✅ Nemokamas planas (unlimited bandwidth!)
- ✅ Greitas CDN
- ✅ Automatinis HTTPS
- ✅ Git integration

**Kaip naudoti:**
1. Push kodą į GitHub
2. Eikite į: https://pages.cloudflare.com
3. "Create a project" → pasirinkite repository
4. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`

### 3. GitHub Pages

**Privalumai:**
- ✅ Visiškai nemokama
- ✅ Integruota su GitHub
- ✅ Automatinis deploy iš Git

**Problema:**
- Reikia build'inti lokaliai ir push'inti `dist/` folderį
- ARBA naudoti GitHub Actions

### 4. Render

**Privalumai:**
- ✅ Nemokamas planas
- ✅ Automatinis deploy iš Git
- ✅ Greitas setup

**Kaip naudoti:**
1. Push kodą į GitHub
2. Eikite į: https://render.com
3. "New Static Site" → pasirinkite repository
4. Build settings:
   - Build Command: `npm run build`
   - Publish Directory: `dist`

### 5. Surge.sh

**Privalumai:**
- ✅ Visiškai nemokama
- ✅ Greitas deploy
- ✅ Lengvas CLI

**Kaip naudoti:**
```bash
npm install -g surge
npm run build
surge dist/
```

## Rekomendacija:

**Geriausia: Vercel arba Cloudflare Pages**

Abi platformos:
- ✅ Nemokamos
- ✅ Automatinis deploy iš Git
- ✅ Greitas CDN
- ✅ Automatinis HTTPS
- ✅ Lengvas setup

## Svarbu:

**Problema nėra dėl platformos ar plano!**

Problema yra ta, kad:
- Netlify build'e trūksta source failų
- Reikia įkelti source failus (ne `dist/`), kad platforma galėtų build'inti

**Bet jei naudojate Git integration:**
- Vercel/Cloudflare/Render automatiškai turės visus source failus
- Nereikės rankiniu būdu įkelti ZIP
- Viskas veiks automatiškai!

## Greitas Sprendimas:

1. Push kodą į GitHub
2. Naudokite Vercel arba Cloudflare Pages
3. Pasirinkite repository
4. Platforma automatiškai deploy'ins su visais source failais
5. Viskas veiks!


