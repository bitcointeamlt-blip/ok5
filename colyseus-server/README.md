# Colyseus Server - PvP Game

Colyseus serveris sukonfigūruotas pagal oficialias rekomendacijas.

## 🚀 Konfigūracija

### Endpoint'ai:
- **Production:** `https://de-fra-f8820c12.colyseus.cloud`
- **Local:** `ws://localhost:2567`

### Frontend:
- **Netlify:** `https://jocular-zabaione-835b49.netlify.app`

## 📦 Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build:**
   ```bash
   npm run build
   ```

3. **Start:**
   ```bash
   npm start
   ```

## 🔧 Konfigūracija

### CORS
Serveris sukonfigūruotas leisti request'us iš:
- `https://jocular-zabaione-835b49.netlify.app`
- `http://localhost:7000`
- `http://localhost:5173`

### Room Registration
- **Room name:** `pvp_room`
- **Max clients:** 2 (PvP)

## 📋 Endpoints

- **Health:** `GET /health`
- **Matchmaking:** `POST /matchmake/joinOrCreate/pvp_room`

## 🚀 Deployment

Colyseus Cloud automatiškai deploy'ina iš GitHub `ok05` repository.

### PM2 Configuration
- **Script:** `build/index.js`
- **Instances:** 1
- **Port:** `process.env.PORT` (Colyseus Cloud nustato)

## 📝 Notes

- Serveris naudoja `@colyseus/core` ir `@colyseus/ws-transport`
- CORS konfigūruotas Express middleware
- Health check endpoint'as prieinamas `/health`


