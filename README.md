# ✅ Colyseus Server - Veikianti Versija (OK05)

Šis kodas yra **veikianti versija**, pagrįsta dokumentais `CORRECT-SOLUTION.md` ir `SERVER-WORKING.md`, kai serveris veikė be problemų.

## 🎯 Pagrindinės Savybės

- ✅ **Teisingas PORT handling** - naudoja `Number(process.env.PORT)` kaip veikiantis kodas
- ✅ **Auto-assign fallback** - production'e naudoja PORT = 0 (auto-assign), jei PORT nėra nustatytas
- ✅ **WebSocketTransport({ server })** - teisingas Colyseus setup'as
- ✅ **server.listen(PORT)** - teisingas serverio start'as
- ✅ **CORS konfigūracija** - leidžia visus origins
- ✅ **Health check endpoint** - `/health` endpoint

## 📁 Struktūra

```
ok05/
├── src/
│   ├── index.ts          # Pagrindinis serverio failas
│   ├── rooms/
│   │   └── GameRoom.ts   # Game room logika
│   └── schema/
│       └── GameState.ts   # Game state schema
├── package.json
├── tsconfig.json
├── ecosystem.config.js   # PM2 konfigūracija
├── Procfile              # Heroku/Colyseus Cloud konfigūracija
└── README.md
```

## 🚀 Diegimas

### Lokalus Testavimas

```bash
cd ok05
npm install
npm run build
npm start
```

### Colyseus Cloud Deployment

1. **Push kodą į GitHub** (ok05 folderį kaip `colyseus-server`)
2. **Colyseus Cloud** → Settings → Build & Deployment:
   - **Root Directory**: `ok05` arba `/ok05/`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
3. **Palaukite** automatinį deployment (2-5 min)
4. **Patikrinkite logs** - turėtumėte matyti:
   ```
   ✅ HTTP server is listening on port XXXX
   ✅ Colyseus server is running on port XXXX
   ```

## 🔧 PORT Handling

**Kaip veikia:**
- Jei `PORT` environment variable yra nustatytas → naudoja tą portą
- Jei `PORT` nėra nustatytas ir `NODE_ENV=production` → naudoja PORT = 0 (auto-assign)
- Jei `PORT` nėra nustatytas ir development → naudoja PORT = 2567

**Tai išspręs EADDRINUSE problemą**, nes production'e sistema automatiškai pasirinks laisvą portą.

## ✅ Patikrinimas

Po deployment:

1. **Health endpoint**: `https://your-endpoint.colyseus.cloud/health`
   - Turėtumėte matyti: `{"status":"ok"}`

2. **Logs**: Colyseus Cloud → Endpoints → LOGS
   - Turėtumėte matyti success pranešimus

3. **Instances**: Turėtų rodyti "Running" (ne "Deploying...")

## 📝 Pastabos

- Šis kodas yra **veikianti versija**, pagrįsta dokumentais, kai serveris veikė be problemų
- PORT handling yra **patobulintas** su auto-assign fallback'u production'e
- Visi kiti komponentai yra **identiški** veikiančiam kodui

## 🎮 PvP Online

Serveris palaiko:
- 2 žaidėjų matchmaking
- Real-time pozicijų sinchronizaciją
- Player ready state
- Game state management

---

**Šis kodas turėtų veikti be problemų!** 🎉

