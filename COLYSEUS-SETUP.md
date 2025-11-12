# Colyseus Setup - Quick Start

## ✅ Kas padaryta

1. ✅ Colyseus server sukurtas (`colyseus-server/`)
2. ✅ ColyseusService sukurtas frontend'e
3. ✅ Integruota į `simple-main.ts`
4. ✅ Fallback į Supabase (jei Colyseus nepasiekiamas)

## 🚀 Greitas Start

### 1. Install Dependencies

```bash
# Frontend
npm install

# Server
cd colyseus-server
npm install
```

### 2. Environment Variables

Sukurkite `.env` failą root folderyje:
```
VITE_COLYSEUS_ENDPOINT=https://de-fra-f8820c12.colyseus.cloud
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_key
```

### 3. Testuoti Lokaliai

```bash
# Terminal 1 - Colyseus Server
cd colyseus-server
npm run dev

# Terminal 2 - Frontend
npm run dev
```

Frontend bus: `http://localhost:4000`
Server bus: `ws://localhost:2567`

### 4. Deploy į Colyseus Cloud

1. Push kodą į GitHub (įtraukite `colyseus-server/` folderį)
2. Colyseus Cloud → "LINK WITH GITHUB"
3. Build settings:
   - **Build command**: `cd colyseus-server && npm install && npm run build`
   - **Start command**: `cd colyseus-server && npm start`
   - **Root directory**: `colyseus-server`
   - **Node version**: 22

### 5. Update Frontend Endpoint

Po deployment, gausite naują endpoint (pvz: `https://de-fra-xxxxx.colyseus.cloud`)

Atnaujinkite `.env`:
```
VITE_COLYSEUS_ENDPOINT=https://de-fra-xxxxx.colyseus.cloud
```

## 📝 Kaip Veikia

### Colyseus Mode (pagrindinis)
- `enterLobby()` → Prisijungia prie Colyseus room
- `setPlayerReady()` → Siunčia ready status per Colyseus
- `sendInput()` → Siunčia input per Colyseus
- Automatinis matchmaking (Colyseus valdo)

### Supabase Fallback
- Jei Colyseus nepasiekiamas, naudoja Supabase
- Vis dar reikalingas Supabase PostgreSQL (profiles, stats)

## 🔧 Troubleshooting

### Server neveikia
- Patikrinkite Colyseus Cloud logs
- Patikrinkite build command

### Frontend negali prisijungti
- Patikrinkite `VITE_COLYSEUS_ENDPOINT` environment variable
- Patikrinkite, ar endpoint yra `https://` (bus konvertuotas į `wss://`)

### Matchmaking neveikia
- Colyseus automatiškai match'ina žaidėjus į rooms
- Jei neveikia, patikrinkite server logs

## 📚 Dokumentacija

- [Colyseus Docs](https://docs.colyseus.io/)
- [Colyseus Cloud](https://cloud.colyseus.io/)

