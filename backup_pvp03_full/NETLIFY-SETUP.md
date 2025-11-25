# Netlify Setup - Automatinis Deploy

## Problema:
Netlify build'e transformuojama tik 6 moduliai, nes trūksta source failų.

## Sprendimas: Git Integration (Rekomenduojama)

### 1. Sukurkite Git Repository:

```bash
git init
git add .
git commit -m "Initial commit"
```

### 2. Push į GitHub/GitLab/Bitbucket:

```bash
# GitHub example:
git remote add origin https://github.com/yourusername/your-repo.git
git push -u origin main
```

### 3. Netlify → Import from Git:

1. Eikite į [Netlify Dashboard](https://app.netlify.com)
2. Spustelėkite "Add new site" → "Import an existing project"
3. Pasirinkite "GitHub" (arba GitLab/Bitbucket)
4. Pasirinkite savo repository
5. Netlify automatiškai aptiks:
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`

### 4. Pridėkite Environment Variables:

Netlify → Site settings → Environment variables:
- `VITE_SUPABASE_URL` = jūsų Supabase URL
- `VITE_SUPABASE_ANON_KEY` = jūsų Supabase anon key

### 5. Deploy:

Netlify automatiškai deploy'ins kiekvieną push į main branch!

## Privalumai:

✅ **Automatinis deploy** - kiekvienas push automatiškai deploy'ina
✅ **Visada teisingi source failai** - Netlify turi visus failus
✅ **90 modulių transformuojama** - ne 6!
✅ **Nereikia rankiniu būdu** - viskas automatiškai

## Patikrinkite:

Po deploy, patikrinkite build log:
- Turėtumėte matyti: **"✓ 90 modules transformed"**
- JavaScript failas turėtų būti **~232 KB**


