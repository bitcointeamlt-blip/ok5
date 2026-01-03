# 🔍 Lokalus PvP Troubleshooting

## ✅ Kas turėtų veikti:

1. **Frontend serveris** ant porto **7005** ✅ (veikia)
2. **Colyseus serveris** ant porto **2567** ✅ (dabar veikia)

## 🔍 Patikrinimas:

### 1. Patikrinkite ar abu serveriai veikia:

```powershell
# Frontend (7005)
netstat -ano | findstr ":7005" | findstr "LISTENING\|ABH?REN"

# Colyseus (2567)
netstat -ano | findstr ":2567" | findstr "LISTENING\|ABH?REN"
```

### 2. Patikrinkite Colyseus serverio health:

```powershell
curl http://localhost:2567/health
```

Turėtumėte matyti: `{"status":"ok"}`

### 3. Patikrinkite browser console:

Atidarykite `http://localhost:7005` ir patikrinkite console:

**Turėtumėte matyti:**
- `🔵 Using default localhost endpoint for local development`
- `🔍 Environment check in enterLobby: { endpoint: 'ws://localhost:2567...', isProduction: false }`
- `🔵 Connecting to Colyseus server...`
- `✅ Connected to Colyseus server, joining room...`
- `✅ Successfully joined Colyseus room: [room-id]`

**Jei matote klaidą:**
- `ERR_CONNECTION_REFUSED` - Colyseus serveris neveikia
- `CORS error` - CORS problema (bet lokaliai neturėtų būti)
- `Failed to join Colyseus room` - Room connection problema

## 🐛 Dažniausios problemos:

### Problema 1: "ERR_CONNECTION_REFUSED"

**Priežastis:** Colyseus serveris neveikia

**Sprendimas:**
```powershell
cd colyseus-server
npm run dev
```

Turėtumėte matyti:
```
✅ Server running on port 2567
✅ Health check: http://localhost:2567/health
✅ Matchmaking: http://localhost:2567/matchmake
```

### Problema 2: "Failed to join Colyseus room"

**Priežastis:** Room connection problema

**Sprendimas:**
1. Patikrinkite ar Colyseus serveris veikia
2. Patikrinkite browser console - ar yra detalių klaidos
3. Bandykite hard refresh (Ctrl+Shift+R)

### Problema 3: PvP button neveikia

**Patikrinkite:**
1. Ar wallet prisijungęs? (Turėtumėte matyti wallet address)
2. Ar spauskite "PvP ONLINE" button'ą?
3. Patikrinkite console - ar yra klaidų?

### Problema 4: Room sukūrimas neveikia

**Patikrinkite:**
1. Ar `colyseus-server/src/rooms/GameRoom.ts` yra teisingai sukonfigūruotas?
2. Ar `colyseus-server/src/index.ts` turi `gameServer.define("pvp_room", GameRoom)`?

## 📝 Debug žingsniai:

### 1. Patikrinkite ar Colyseus serveris log'ina request'us:

Colyseus serverio terminale turėtumėte matyti:
```
[CORS] Matchmaking request from origin: http://localhost:7005
GameRoom created: [room-id]
Player [session-id] joined room [room-id]
```

### 2. Patikrinkite browser Network tab:

1. Atidarykite Developer Tools (F12)
2. Eikite į Network tab
3. Spauskite "PvP ONLINE"
4. Patikrinkite ar yra request'ų į `ws://localhost:2567`

### 3. Patikrinkite WebSocket connection:

Network tab'e turėtumėte matyti WebSocket connection:
- Status: 101 Switching Protocols
- Type: websocket
- URL: `ws://localhost:2567/matchmake/joinOrCreate/pvp_room`

## ✅ Jei viskas veikia:

Turėtumėte matyti:
1. ✅ Frontend veikia: `http://localhost:7005`
2. ✅ Colyseus veikia: `http://localhost:2567/health`
3. ✅ Console log'ai rodo sėkmingą connection'ą
4. ✅ Room sukūrimas veikia
5. ✅ Laukiama antro žaidėjo

## 🚀 Testavimas:

1. Atidarykite `http://localhost:7005` **2 browser languose**
2. Abiejuose prisijunkite su wallet'ais
3. Abiejuose spauskite "PvP ONLINE"
4. Turėtumėte matyti, kad abu žaidėjai prisijungė prie to paties room'o























