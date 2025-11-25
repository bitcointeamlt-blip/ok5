# 🚀 Quick Start - Colyseus Integration

## ✅ Status: Paruošta Deployment'ui

### Kas Padaryta:
- ✅ Colyseus server sukurtas ir kompiliuojasi
- ✅ Frontend integracija paruošta
- ✅ Fallback į Supabase (jei Colyseus nepasiekiamas)

## 📋 Greitas Deployment

### 1. Push į GitHub

```bash
git add .
git commit -m "Add Colyseus server"
git push
```

### 2. Colyseus Cloud

1. Eikite: https://cloud.colyseus.io
2. Pasirinkite "dot game"
3. **"LINK WITH GITHUB"**
4. Build settings:
   - **Build**: `cd colyseus-server && npm install && npm run build`
   - **Start**: `cd colyseus-server && npm start`
   - **Root**: `colyseus-server`
5. **Deploy**

### 3. Gaukite Endpoint

Po deployment gausite: `https://de-fra-xxxxx.colyseus.cloud`

### 4. Update Frontend

Pridėkite į Netlify/Cloudflare environment variables:
```
VITE_COLYSEUS_ENDPOINT=https://de-fra-xxxxx.colyseus.cloud
```

Arba `.env` lokaliai:
```
VITE_COLYSEUS_ENDPOINT=https://de-fra-xxxxx.colyseus.cloud
```

### 5. Redeploy Frontend

Netlify/Cloudflare → Redeploy

## 🧪 Test Lokaliai

```bash
# Terminal 1
cd colyseus-server
npm run dev

# Terminal 2  
npm run dev
```

`.env`:
```
VITE_COLYSEUS_ENDPOINT=ws://localhost:2567
```

## 📚 Dokumentacija

- `COLYSEUS-INTEGRATION.md` - Detalios instrukcijos
- `COLYSEUS-DEPLOY.md` - Deployment guide
- `DEPLOYMENT-CHECKLIST.md` - Checklist

## ✨ Rezultatas

- **Geresnis PvP performance** (Colyseus optimizuotas multiplayer)
- **Mažiau lagų** (geresnis network sync)
- **Automatinis matchmaking** (Colyseus valdo)

