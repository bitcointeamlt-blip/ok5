# Colyseus Integration Guide

## Overview

Šis projektas naudoja Colyseus vietoj Supabase Realtime PvP multiplayer funkcionalumui.

## Architektūra

- **Frontend**: Vite + TypeScript (esamas kodas)
- **Backend**: Colyseus Server (naujas)
- **Database**: Supabase PostgreSQL (profiles, stats)

## Setup

### 1. Colyseus Server

```bash
cd colyseus-server
npm install
npm run dev
```

### 2. Frontend

```bash
npm install
```

Pridėkite į `.env` failą:
```
VITE_COLYSEUS_ENDPOINT=wss://de-fra-f8820c12.colyseus.cloud
```

### 3. Deployment

#### Colyseus Cloud (Server)

1. Push `colyseus-server/` į GitHub
2. Colyseus Cloud → "LINK WITH GITHUB"
3. Build settings:
   - Build: `cd colyseus-server && npm install && npm run build`
   - Start: `cd colyseus-server && npm start`

#### Frontend (Cloudflare Pages / Netlify)

1. Build: `npm run build`
2. Deploy `dist/` folder
3. Set environment variable: `VITE_COLYSEUS_ENDPOINT`

## Migracija iš Supabase

### Kas pakeista:

1. ✅ `PvPSyncService` → `ColyseusService`
2. ✅ Supabase Realtime → Colyseus Rooms
3. ✅ Matchmaking → Colyseus matchmaking
4. ⚠️ Supabase PostgreSQL → Vis dar naudojama (profiles, stats)

### Kas lieka:

- Supabase PostgreSQL (duomenų bazė)
- WalletService (Ronin Wallet)
- Solo mode (veikia be Colyseus)

## Naudojimas

### PvP Mode

```typescript
import { colyseusService } from './services/ColyseusService';

// Join room
const room = await colyseusService.joinOrCreateRoom(
  walletAddress,
  handleOpponentInput
);

// Send input
colyseusService.sendInput({
  type: 'position',
  x: playerX,
  y: playerY,
  vx: velocityX,
  vy: velocityY
});
```

## Troubleshooting

### Server neveikia
- Patikrinkite, ar Colyseus Cloud deployment sėkmingas
- Patikrinkite logs Colyseus Cloud dashboard

### Frontend negali prisijungti
- Patikrinkite `VITE_COLYSEUS_ENDPOINT` environment variable
- Patikrinkite, ar endpoint yra `wss://` (WebSocket Secure)

### Latency problemos
- Colyseus turėtų būti geresnis nei Supabase Realtime
- Patikrinkite Colyseus Cloud region (Frankfurt dabar)

