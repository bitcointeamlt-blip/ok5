# 🚀 Deployment Workflow - Online Testing

## Quick Deploy Command

After making any changes to the game, run:

```bash
npm run deploy:gg1
```

This will:
1. ✅ Update GG1 folder with latest files
2. ✅ Create GG1.zip with Unix paths (for Netlify)
3. ✅ Verify all critical files are included
4. ✅ Show deployment instructions

## Manual Steps

1. **Build the deployment package:**
   ```bash
   npm run deploy:gg1
   ```

2. **Upload to Netlify:**
   - Go to: https://app.netlify.com
   - Click "Deploy manually" (or select your site → "Deploys" → "Deploy site")
   - Drag & drop: **GG1.zip**
   - Wait for build to complete

3. **Verify deployment:**
   - Check build log: Should see "✓ 90 modules transformed"
   - Check JavaScript bundle: Should be ~232 KB
   - Test Ronin Wallet connection button

## What Gets Deployed

The `GG1.zip` includes:
- ✅ All source files (`src/` folder)
- ✅ Configuration files (`package.json`, `tsconfig.json`, `vite.config.ts`)
- ✅ Netlify config (`netlify.toml`)
- ✅ HTML entry point (`index.html`)

**NOT included** (Netlify will handle):
- ❌ `node_modules/` (installed automatically)
- ❌ `dist/` (built automatically)

## Troubleshooting

### Build fails with "File not found"
- Make sure you ran `npm run deploy:gg1` after changes
- Check that all files exist in `GG1/` folder

### Still seeing old version
- Clear Netlify cache: "Deploys" → "Clear cache and retry deploy"
- Make sure you uploaded the latest `GG1.zip`

### Wallet button not showing
- Check browser console for errors
- Verify Supabase environment variables are set in Netlify
- Make sure build log shows "✓ 90 modules transformed" (not 6!)

## Automated Workflow (Future)

For even faster testing, you can:
1. Make code changes
2. Run `npm run deploy:gg1`
3. Upload `GG1.zip` to Netlify
4. Test immediately online

**Total time: ~2-3 minutes** ⚡


