# DOT Clicker PvP - Colyseus Server

Minimalus Colyseus serveris pagal oficialias rekomendacijas.

## Deployment į Colyseus Cloud

1. **Commit → Push** kodą į GitHub
2. **Colyseus Cloud** automatiškai deploy'ins
3. Patikrinkite logs Colyseus Cloud'e

## Lokalus Paleidimas

```bash
cd colyseus-server
npm install
npm run build
npm start
```

Serveris veiks ant `http://localhost:2567`

## Struktūra

- `colyseus-server/src/index.ts` - Serverio entry point
- `colyseus-server/src/rooms/GameRoom.ts` - GameRoom logika
- `colyseus-server/src/schema/GameState.ts` - GameState schema
- `colyseus-server/ecosystem.config.js` - PM2 konfigūracija
