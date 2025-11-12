# DOT Clicker Game

## Netlify Deployment

### Automatic Deployment (Recommended)

**Use Git Integration:**
1. Push code to GitHub/GitLab/Bitbucket
2. Connect repository to Netlify
3. Netlify will automatically build and deploy on every push

**Netlify Settings:**
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Environment variables (set in Netlify dashboard):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### Manual Deployment

If you need to deploy manually:
1. Run: `powershell -ExecutionPolicy Bypass -File create-deploy-zip.ps1`
2. Upload `netlify-deploy.zip` to Netlify → Deploy manually

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```


