# 🔧 EADDRINUSE Sprendimas - Dabar

## ✅ Kas Matau Log'uose

### Pirmas Screenshot (Sėkmingas Start):
- ✅ "Colyseus server is running on port 2567"
- ✅ "Server listening on 0.0.0.0:2567"
- ✅ "HTTP server is ready"
- ✅ "WebSocket transport is ready"
- ✅ "GameRoom "pvp_room" registered successfully"
- ✅ "Last deployment: 4 minutes ago"

### Antras Screenshot (EADDRINUSE Error):
- ❌ "Port 2567 is already in use"
- ❌ "CRITICAL ERROR during server start"
- ❌ "Error code: EADDRINUSE"
- ❌ "Exiting due to EADDRINUSE..."

---

## 🔍 Problema

**Kas vyksta:**
1. Serveris start'ino sėkmingai (16:25:25)
2. Bet vėliau crash'ino dėl EADDRINUSE (16:25:30)
3. PM2 bando restart'inti
4. Bet vis dar gauna EADDRINUSE

**Priežastis:**
- PM2 bando start'inti kelis instance'us vienu metu
- Senas procesas neužsidaro greitai
- Portas 2567 vis dar užimtas, kai PM2 bando start'inti naują instance'ą

---

## ✅ Sprendimas

### Option 1: Reboot Instance (Greitas Sprendimas)

1. **Colyseus Cloud** → **Endpoints** tab → **LOGS**
2. Spustelėkite **"REBOOT INSTANCE"** mygtuką (rodo antrame screenshot'e)
3. Palaukite 2-3 minučių
4. Patikrinkite logs - turėtų start'inti be EADDRINUSE

**Kodėl tai veikia:**
- Reboot uždarė visus procesus
- Portas 2567 tampa laisvas
- PM2 start'ina naują instance'ą ant laisvo porto

---

### Option 2: Patikrinkite PM2 Konfigūraciją

Patikrinkite `colyseus-server/ecosystem.config.js`:
- `instances: 1` - tik vienas instance'as ✅
- `unique: true` - garantuoja vieną instance'ą ✅
- `kill_timeout: 20000` - 20s laukti, kol senas procesas užsidarys ✅
- `restart_delay: 15000` - 15s laukti prieš restart'inti ✅

**Jei vis dar neveikia:**
- Padidinkite `kill_timeout` iki `30000` (30 sekundžių)
- Padidinkite `restart_delay` iki `20000` (20 sekundžių)

---

### Option 3: Commit → Push Naujausią Kodą

Jei naujausias kodas su error handling nėra deploy'intas:

```bash
git add .
git commit -m "Fix EADDRINUSE with improved PM2 config"
git push
```

**Palaukite**, kol Colyseus Cloud deploy'ins naują versiją.

---

## 🎯 Rekomendacija

**Dabar padarykite:**
1. **REBOOT INSTANCE** - greitas sprendimas
2. **Patikrinkite logs** po reboot - turėtų start'inti be EADDRINUSE
3. **Jei vis dar neveikia** - commit → push naujausią kodą

---

## 📋 Po Reboot Patikrinimas

Po reboot, patikrinkite logs:
- ✅ Ar yra "Colyseus server is running on port 2567"?
- ✅ Ar NĖRA EADDRINUSE error'ų?
- ✅ Ar serveris veikia (`/health` endpoint)?

**Dabar spustelėkite "REBOOT INSTANCE" mygtuką!**


