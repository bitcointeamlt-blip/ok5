# ✅ OK05 Konfigūracija - Colyseus Server

## 🎯 Kas Padaryta

### 1. ✅ Colyseus Server (`colyseus-server/src/index.ts`)
- **CORS konfigūracija** pagal oficialias rekomendacijas
- **Express CORS middleware** su Netlify origin
- **Health check endpoint** `/health`
- **Matchmaking endpoint** `/matchmake`

### 2. ✅ Frontend Service (`src/services/ColyseusService.ts`)
- **Endpoint:** `https://de-fra-f8820c12.colyseus.cloud`
- **WebSocket conversion:** `https://` → `wss://`
- **Environment variable:** `VITE_COLYSEUS_ENDPOINT`

### 3. ✅ PM2 Configuration (`colyseus-server/ecosystem.config.js`)
- **Instances:** 1
- **Script:** `build/index.js`
- **Port:** `process.env.PORT` (Colyseus Cloud nustato)

---

## 📋 Endpoint'ai

### Colyseus Cloud Server:
- **URL:** `https://de-fra-f8820c12.colyseus.cloud`
- **Health:** `https://de-fra-f8820c12.colyseus.cloud/health`
- **Matchmaking:** `https://de-fra-f8820c12.colyseus.cloud/matchmake/joinOrCreate/pvp_room`

### Frontend (Netlify):
- **URL:** `https://jocular-zabaione-835b49.netlify.app`

---

## 🔧 CORS Konfigūracija

Serveris leidžia request'us iš:
- ✅ `https://jocular-zabaione-835b49.netlify.app`
- ✅ `http://localhost:7000`
- ✅ `http://localhost:5173`

---

## 🚀 Deployment Instrukcijos

### Step 1: Netlify Environment Variables

1. **Eikite į Netlify Dashboard:**
   - https://app.netlify.com
   - Pasirinkite `jocular-zabaione-835b49`

2. **Site settings → Environment variables:**
   - **Key:** `VITE_COLYSEUS_ENDPOINT`
   - **Value:** `https://de-fra-f8820c12.colyseus.cloud`
   - **Save**

3. **Redeploy:**
   - Deploys → Trigger deploy → Clear cache and deploy site

---

### Step 2: Colyseus Cloud Deployment

1. **Eikite į Colyseus Cloud:**
   - https://cloud.colyseus.io
   - Pasirinkite aplikaciją

2. **Patikrinkite GitHub Connection:**
   - Repository: `ok05`
   - Branch: `main` (arba `master`)

3. **Deploy:**
   - Colyseus Cloud automatiškai deploy'ina iš GitHub
   - Palaukite 2-5 min

---

### Step 3: Patikrinkite

1. **Health Check:**
   ```bash
   curl https://de-fra-f8820c12.colyseus.cloud/health
   ```
   **Turėtų grąžinti:**
   ```json
   {"status":"ok","timestamp":"2024-..."}
   ```

2. **Frontend:**
   - Atidarykite `https://jocular-zabaione-835b49.netlify.app`
   - Console turėtų rodyti: `✅ Colyseus client initialized`
   - Neturėtų būti CORS error'ų

---

## 📝 Build Commands

### Local Development:
```bash
cd colyseus-server
npm run build
npm start
```

### Production (Colyseus Cloud):
- Automatiškai build'ina iš GitHub
- Naudoja `npm run build` → `build/index.js`
- PM2 paleidžia `build/index.js`

---

## ✅ Checklist

- [x] Colyseus server su CORS konfigūracija
- [x] Frontend su teisingu endpoint'u
- [x] PM2 configuration
- [x] Build sėkmingas
- [ ] Netlify environment variable nustatytas
- [ ] Colyseus Cloud deploy'intas
- [ ] Health check veikia
- [ ] Frontend prisijungia prie serverio

---

## 🔍 Troubleshooting

### CORS Error:
- Patikrinkite, ar Netlify environment variable nustatytas
- Patikrinkite, ar Colyseus server CORS konfigūracija teisinga
- Patikrinkite browser console logs

### Connection Error:
- Patikrinkite, ar Colyseus Cloud serveris veikia (`/health`)
- Patikrinkite, ar endpoint teisingas (`https://de-fra-f8820c12.colyseus.cloud`)

### Build Error:
- Patikrinkite, ar `npm install` buvo paleistas
- Patikrinkite, ar TypeScript versija teisinga

---

## 📚 Oficialios Rekomendacijos

Pagal [Colyseus Documentation](https://docs.colyseus.io/):
- ✅ Express su CORS middleware
- ✅ WebSocketTransport
- ✅ Health check endpoint
- ✅ PM2 production configuration
- ✅ Environment variables

---

**Status:** ✅ Konfigūracija paruošta pagal oficialias rekomendacijas

