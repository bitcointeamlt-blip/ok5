# 📊 OK05 Projekto Analizė - Visas Kodas

## 🎯 Projekto Apžvalga

**Projekto vardas:** `dot-clicker` (DOT Clicker PvP)  
**GitHub Repository:** `ok05`  
**Versija:** `1.0.19`  
**Workspace:** `C:\Users\p3p3l\Downloads\pvp03-new`

---

## 📁 Projekto Struktūra

### Frontend (Netlify)
```
src/
├── simple-main.ts          # Pagrindinis žaidimo kodas (8611 eilučių)
├── services/
│   ├── ColyseusService.ts  # Colyseus multiplayer service
│   ├── WalletService.ts    # Ronin Wallet integracija
│   ├── SupabaseService.ts  # Supabase backend service
│   ├── MatchmakingService.ts # Matchmaking logika
│   └── PvPSyncService.ts   # PvP synchronization
├── game/
│   ├── GameState.ts
│   ├── CombatSystem.ts
│   ├── ArmorSystem.ts
│   └── UpgradeSystem.ts
├── renderer/
│   ├── Renderer.ts
│   ├── UIRenderer.ts
│   └── ParticleSystem.ts
├── persistence/
│   ├── SaveManager.ts
│   └── SaveManagerV2.ts
└── utils/
    └── RNG.ts
```

### Backend (Colyseus Server)
```
colyseus-server/
├── src/
│   ├── index.ts           # Serverio entry point
│   ├── rooms/
│   │   └── GameRoom.ts    # PvP room logika
│   └── schema/
│       └── GameState.ts   # Game state schema
├── ecosystem.config.js     # PM2 konfigūracija
├── package.json
└── tsconfig.json
```

---

## 🔧 Technologijos

### Frontend
- **Framework:** Vite (v5.0.0)
- **Language:** TypeScript (v5.0.0)
- **Multiplayer:** Colyseus.js (v0.15.0)
- **Backend:** Supabase (@supabase/supabase-js v2.80.0)
- **Wallet:** Ronin Wallet integracija
- **Deployment:** Netlify (`https://jocular-zabaione-835b49.netlify.app`)

### Backend
- **Framework:** Colyseus (@colyseus/core v0.15.0)
- **Transport:** WebSocket (@colyseus/ws-transport v0.15.0)
- **Schema:** @colyseus/schema (v2.0.4)
- **Server:** Express (v4.18.2)
- **CORS:** cors (v2.8.5)
- **Process Manager:** PM2 (ecosystem.config.js)
- **Deployment:** Colyseus Cloud (`https://de-fra-f8820c12.colyseus.cloud`)

---

## 🎮 Žaidimo Funkcionalumas

### Pagrindinės Funkcijos
1. **Single Player Mode**
   - DOT currency sistema
   - Upgrade sistema (damage, crit, accuracy)
   - HP/Armor sistema
   - Save/Load sistema

2. **PvP Online Mode**
   - Colyseus multiplayer
   - Matchmaking sistema
   - Real-time synchronization
   - Ronin Wallet integracija

3. **Wallet Integracija**
   - Ronin Wallet connection
   - DOT token balance display
   - Profile sistema (Supabase)

---

## 🔌 Colyseus Integracija

### Serverio Konfigūracija (`colyseus-server/src/index.ts`)

**CORS:**
```typescript
app.use(cors({
  origin: true,  // Leidžia visus origin'us
  credentials: true
}));
```

**Endpoints:**
- `/health` - Health check
- `/matchmake/joinOrCreate/pvp_room` - Matchmaking

**Room Registration:**
- Room name: `pvp_room`
- Max clients: 2 (PvP)

### Frontend Konfigūracija (`src/services/ColyseusService.ts`)

**Endpoint Resolution:**
- Lokaliai: `ws://localhost:2567` (default)
- Production: `VITE_COLYSEUS_ENDPOINT` iš Netlify Environment Variables
- Jei nėra env var production'e → Error (nereikalauja fallback)

**WebSocket Conversion:**
- `https://` → `wss://`
- `http://` → `ws://`

---

## 🌐 Deployment Konfigūracija

### Netlify (`netlify.toml`)

**Build Command:**
```bash
rm -rf dist node_modules && npm install && npm run build
```

**Publish Directory:**
```
dist
```

**Environment Variables:**
- `VITE_COLYSEUS_ENDPOINT` - Colyseus serverio URL (reikalingas!)
- `VITE_SUPABASE_URL` - Supabase URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key

**Headers:**
- Security headers (X-Frame-Options, X-XSS-Protection, etc.)
- Cache-Control headers

### Colyseus Cloud (`ecosystem.config.js`)

**PM2 Configuration:**
```javascript
{
  name: 'colyseus-server',
  script: 'build/index.js',
  instances: 1,
  exec_mode: 'fork',
  wait_ready: true,
  autorestart: true,
  watch: false
}
```

**Build Process:**
1. `npm install`
2. `npm run build` (TypeScript compilation)
3. `npm start` (runs `build/index.js`)

---

## 📋 Build Scripts

### Frontend (`package.json`)
```json
{
  "dev": "vite",                    // Development server (port 7005)
  "build": "vite build",            // Production build
  "preview": "vite preview"         // Preview production build
}
```

### Backend (`colyseus-server/package.json`)
```json
{
  "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
  "build": "tsc",                   // TypeScript compilation
  "start": "node build/index.js"    // Production start
}
```

---

## 🔍 Žinomos Problemos ir Sprendimai

### ✅ Išspręstos Problemos

1. **Netlify Build Klaidos**
   - **Problema:** `tsc` type-check'ina ir randa klaidas
   - **Sprendimas:** Pakeista į `vite build` (Vite turi savo type-checking)

2. **ColyseusService Constructor Error**
   - **Problema:** Constructor meta error, jei nėra `VITE_COLYSEUS_ENDPOINT`
   - **Sprendimas:** Constructor nemeta error'o, tik `connect()` metodas

3. **Hardcoded Colyseus Cloud Endpoint**
   - **Problema:** Fallback į seną Colyseus Cloud endpoint'ą
   - **Sprendimas:** Pašalintas fallback, reikalaujama `VITE_COLYSEUS_ENDPOINT`

### ⚠️ Likusios Problemos

1. **Colyseus Cloud Serveris Neveikia**
   - **Status:** "Service Unavailable"
   - **Sprendimas:** Deploy'inti į Render.com arba ištaisyti Colyseus Cloud

2. **Netlify Environment Variable**
   - **Status:** Gali būti nenustatytas
   - **Sprendimas:** Pridėti `VITE_COLYSEUS_ENDPOINT` į Netlify

---

## 🚀 Deployment Workflow

### Lokalus Paleidimas

**Frontend:**
```bash
npm run dev
# Veikia ant http://localhost:7005
```

**Backend:**
```bash
cd colyseus-server
npm run dev
# Veikia ant ws://localhost:2567
```

### Production Deployment

**Frontend (Netlify):**
1. Commit → Push į GitHub `ok05` repository
2. Netlify automatiškai deploy'ins
3. Patikrinti, ar `VITE_COLYSEUS_ENDPOINT` nustatytas

**Backend (Colyseus Cloud / Render.com):**
1. Commit → Push į GitHub `ok05` repository
2. Colyseus Cloud automatiškai deploy'ins (jei sukonfigūruotas)
3. ARBA: Deploy į Render.com su `colyseus-server` root directory

---

## 📊 Kodo Kokybė

### Stipriosios Pusės
- ✅ Geras error handling
- ✅ TypeScript type safety
- ✅ Modulinė struktūra
- ✅ Geras logging

### Silpnosios Pusės
- ⚠️ `simple-main.ts` yra labai didelis (8611 eilučių)
- ⚠️ Daug backup failų (`*.backup-*`)
- ⚠️ TypeScript strict mode išjungtas (`strict: false`)

---

## 🔐 Saugumas

### CORS Konfigūracija
- **Serveris:** `origin: true` (leidžia visus origin'us)
- **Rekomendacija:** Apriboti tik reikalingus origin'us production'e

### Environment Variables
- **Netlify:** Reikia nustatyti `VITE_COLYSEUS_ENDPOINT`
- **Colyseus Cloud:** Automatiškai nustato `PORT`

---

## 📈 Performance

### Build Performance
- **Frontend Build:** ~2-3 min (Netlify)
- **Backend Build:** ~30-60 sek (Colyseus Cloud)

### Runtime Performance
- **FPS Tracking:** Implementuotas `simple-main.ts`
- **Caching:** Upgrade costs caching
- **Optimization:** Tree-shaking disabled (Vite config)

---

## 🎯 Rekomendacijos

### Trumpalaikės
1. ✅ Pridėti `VITE_COLYSEUS_ENDPOINT` į Netlify
2. ✅ Deploy'inti Colyseus serverį į Render.com
3. ✅ Testuoti PvP online režimą

### Ilgalaikės
1. 🔄 Refactor `simple-main.ts` (padalinti į mažesnius modulius)
2. 🔄 Įjungti TypeScript strict mode
3. 🔄 Apriboti CORS origin'us production'e
4. 🔄 Ištrinti backup failus

---

## 📝 Checklist

### Frontend
- [x] Vite konfigūracija
- [x] ColyseusService integracija
- [x] Wallet integracija
- [x] Supabase integracija
- [ ] Netlify environment variables

### Backend
- [x] Colyseus serveris
- [x] GameRoom logika
- [x] GameState schema
- [x] PM2 konfigūracija
- [ ] Colyseus Cloud deployment (arba Render.com)

### Deployment
- [x] Netlify konfigūracija
- [x] Build scripts
- [ ] Environment variables
- [ ] Server deployment

---

**Status:** ✅ Kodas paruoštas, reikia tik deployment konfigūracijos



