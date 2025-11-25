# 🚀 GG2.zip Deployment Guide

## Quick Deploy Command

After making any changes to the game, run:

```bash
npm run deploy:gg2
```

This will:
1. ✅ Update GG2 folder with latest files
2. ✅ Create GG2.zip with Unix paths (for Netlify)
3. ✅ Verify all critical files are included
4. ✅ Show deployment instructions

## How It Works

### Build Process:
1. **GG2 folder** - Contains all source files
2. **Python script** (`create-GG2-zip-unix.py`) - Creates ZIP with Unix path separators (`/`)
3. **PowerShell script** (`build-gg2.ps1`) - Orchestrates the build process

### Files Included:
- ✅ `src/` folder (all source files)
- ✅ `package.json`
- ✅ `tsconfig.json`
- ✅ `vite.config.ts`
- ✅ `netlify.toml`
- ✅ `index.html`

### Files NOT Included:
- ❌ `node_modules/` (Netlify installs automatically)
- ❌ `dist/` (Netlify builds automatically)
- ❌ `GG2/` folder (only the ZIP is needed)

## Manual Steps

1. **Build the deployment package:**
   ```bash
   npm run deploy:gg2
   ```

2. **Upload to Netlify:**
   - Go to: https://app.netlify.com
   - Click "Deploy manually" (or select your site → "Deploys" → "Deploy site")
   - Drag & drop: **GG2.zip**
   - Wait for build to complete

3. **Verify deployment:**
   - Check build log: Should see "✓ 90 modules transformed"
   - Check JavaScript bundle: Should be ~232 KB
   - Test Ronin Wallet connection button
   - Test DOT balance display

## Troubleshooting

### Build fails with "File not found"
- Make sure you ran `npm run deploy:gg2` after changes
- Check that all files exist in `GG2/` folder

### Still seeing old version
- Clear Netlify cache: "Deploys" → "Clear cache and retry deploy"
- Make sure you uploaded the latest `GG2.zip`

### Wallet button not showing
- Check browser console for errors
- Verify Supabase environment variables are set in Netlify
- Make sure build log shows "✓ 90 modules transformed" (not 6!)

### DOT balance not showing
- Check browser console for "Failed to get token balance" errors
- Verify wallet is connected
- Check that token address is correct: `0x4a4e24b057b595f530417860a901f3a540995256`

## What's New in This Version

- ✅ Wallet connection (stays connected even if Supabase auth fails)
- ✅ DOT token balance check and display
- ✅ Separate frame for DOT balance display
- ✅ Upgrade buttons hidden in PvP mode
- ✅ Wallet and Game Mode buttons moved down

## Next Version (GG3)

When you need to create GG3.zip:
1. Copy `build-gg2.ps1` to `build-gg3.ps1`
2. Replace all "GG2" with "GG3" in the script
3. Copy `create-GG2-zip-unix.py` to `create-GG3-zip-unix.py`
4. Replace all "GG2" with "GG3" in the Python script
5. Add `"build:gg3"` and `"deploy:gg3"` to `package.json`
6. Run `npm run deploy:gg3`


