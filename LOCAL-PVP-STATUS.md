# ✅ Lokalus PvP Status

## ✅ Kas veikia:

1. **Frontend serveris** - ✅ Veikia ant porto **7005**
   - Procesas: 26732
   - URL: `http://localhost:7005`

2. **Colyseus serveris** - ✅ Veikia ant porto **2567**
   - Procesas: 12424
   - Health check: `http://localhost:2567/health` → `{"status":"ok"}`
   - Matchmaking: `http://localhost:2567/matchmake`

## 🔍 Kodėl PvP gali neveikti:

### 1. Patikrinkite browser console:

Atidarykite `http://localhost:7005` ir patikrinkite console (F12):

**Turėtumėte matyti:**
```
🔵 Using default localhost endpoint for local development
🔍 Environment check in enterLobby: {
  endpoint: 'ws://localhost:2567...',
  isProduction: false,
  hostname: 'localhost'
}
🔵 Connecting to Colyseus server... { endpoint: 'ws://localhost:2567' }
✅ Connected to Colyseus server, joining room...
✅ Successfully joined Colyseus room: [room-id]
```

**Jei matote klaidą:**
- `ERR_CONNECTION_REFUSED` → Colyseus serveris neveikia (bet dabar veikia ✅)
- `Failed to join Colyseus room` → Room connection problema
- `CORS error` → CORS problema (bet lokaliai neturėtų būti)

### 2. Patikrinkite ar wallet prisijungęs:

PvP režimas reikalauja:
- ✅ Wallet prisijungęs (Ronin Wallet)
- ✅ Wallet address turi būti matomas

Jei wallet neprisijungęs:
- Spauskite "PROFILE" button'ą
- Prisijunkite su Ronin Wallet
- Tada bandykite "PvP ONLINE"

### 3. Patikrinkite Network tab:

1. Atidarykite Developer Tools (F12)
2. Eikite į **Network** tab
3. Spauskite "PvP ONLINE" button'ą
4. Patikrinkite ar yra WebSocket connection:

**Turėtumėte matyti:**
- Type: `websocket`
- Status: `101 Switching Protocols`
- URL: `ws://localhost:2567/matchmake/joinOrCreate/pvp_room`

### 4. Patikrinkite Colyseus serverio log'us:

Colyseus serverio terminale (cmd langas) turėtumėte matyti:

```
[CORS] Matchmaking request from origin: http://localhost:7005
GameRoom created: [room-id]
Player [session-id] joined room [room-id]
```

## 🐛 Jei vis dar neveikia:

### Bandykite:

1. **Hard refresh browser:**
   - Windows: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

2. **Patikrinkite ar abu serveriai veikia:**
   ```powershell
   # Frontend
   netstat -ano | findstr ":7005" | findstr "LISTENING\|ABH?REN"
   
   # Colyseus
   netstat -ano | findstr ":2567" | findstr "LISTENING\|ABH?REN"
   ```

3. **Restart'inkite abu serverius:**
   ```powershell
   # Sustabdykite visus Node procesus
   Get-Process | Where-Object {$_.ProcessName -eq "node"} | Stop-Process -Force
   
   # Paleiskite iš naujo:
   # Terminal 1: Frontend
   npm run dev
   
   # Terminal 2: Colyseus
   cd colyseus-server
   npm run dev
   ```

4. **Patikrinkite console klaidas:**
   - Atidarykite browser console (F12)
   - Spauskite "PvP ONLINE"
   - Patikrinkite ar yra raudonų klaidų

## 📝 Testavimas su 2 žaidėjais:

1. Atidarykite `http://localhost:7005` **2 skirtinguose browser languose** (arba incognito)
2. Abiejuose prisijunkite su skirtingais wallet'ais
3. Abiejuose spauskite "PvP ONLINE"
4. Turėtumėte matyti, kad abu žaidėjai prisijungė prie to paties room'o

## ✅ Jei viskas veikia:

Turėtumėte matyti:
- ✅ Console log'ai rodo sėkmingą connection'ą
- ✅ Room sukūrimas veikia
- ✅ Laukiama antro žaidėjo (jei vienas žaidėjas)
- ✅ Match prasideda (jei 2 žaidėjai)










