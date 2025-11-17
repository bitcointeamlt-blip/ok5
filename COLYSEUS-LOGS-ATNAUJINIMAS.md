# 🔍 Colyseus Cloud Logs Atnaujinimas

## 📋 Kaip Veikia Log'ų Atnaujinimas

### 1. Real-Time vs Delayed

**Colyseus Cloud logai:**
- ✅ **PM2 logs** - atnaujinami **real-time** (iš karto)
- ⚠️ **Application logs** - gali būti **delayed** (10-30 sekundžių)
- ⚠️ **Dashboard logs** - gali būti **cached** (reikia refresh'inti)

---

## 🔄 Log'ų Atnaujinimo Dažnis

### PM2 Logs (Real-Time)
- **Atnaujinimas:** Real-time (iš karto)
- **Kada matote:** Iškart po to, kai serveris output'ina log'ą
- **Kodėl:** PM2 stream'ina log'us tiesiogiai

### Application Logs (Delayed)
- **Atnaujinimas:** 10-30 sekundžių delay
- **Kada matote:** Po 10-30 sekundžių po to, kai serveris output'ina log'ą
- **Kodėl:** Colyseus Cloud agreguoja log'us prieš rodant

### Dashboard Logs (Cached)
- **Atnaujinimas:** Reikia **refresh'inti** puslapį
- **Kada matote:** Po refresh'inimo
- **Kodėl:** Browser cache'ina log'us

---

## ✅ Kaip Patikrinti Naujausius Log'us

### Būdas 1: Refresh'inkite Puslapį

1. **Colyseus Cloud Dashboard** → **Logs**
2. **Refresh'inkite puslapį** (F5 arba Ctrl+R)
3. Scroll žemyn - matysite naujausius log'us

---

### Būdas 2: Palaukite 10-30 Sekundžių

1. **Colyseus Cloud Dashboard** → **Logs**
2. **Palaukite 10-30 sekundžių**
3. Log'ai turėtų atnaujintis automatiškai

---

### Būdas 3: Išjunkite "Show only errors" Toggle

1. **Colyseus Cloud Dashboard** → **Logs**
2. **Išjunkite "Show only errors" toggle** (OFF)
3. Dabar matysite VISUS log'us, ne tik error'us

---

## 📊 Jūsų Situacija

### Kas Matau Log'uose:

**15:17:32** - EADDRINUSE error
**15:35:48** - EADDRINUSE error  
**16:01:33** - EADDRINUSE error
**16:01:39** - ✅ Serveris start'ino sėkmingai!

**Išvada:**
- ✅ Serveris **GALIAUSIAI START'INO** 16:01:39
- ✅ PM2 restart'inimas su delay veikė
- ✅ Po kelių bandymų serveris start'ino

---

## ⏰ Kada Matysite Naujausius Log'us

### Jei Serveris Tik Start'ino:

1. **Palaukite 10-30 sekundžių**
2. **Refresh'inkite puslapį** (F5)
3. Turėtumėte matyti:
   - ✅ `Colyseus server is running on port 2567`
   - ✅ `Server listening on 0.0.0.0:2567`
   - ✅ `HTTP server is ready`
   - ✅ `WebSocket transport is ready`

### Jei Testuojate Žaidimą:

1. **Paleiskite žaidimą** (PvP ONLINE)
2. **Palaukite 10-30 sekundžių**
3. **Refresh'inkite log'us** (F5)
4. Turėtumėte matyti:
   - Connection log'us
   - Room join log'us
   - CORS request'us (jei yra)

---

## 💡 Rekomendacija

**Patikrinkite log'us dabar:**
1. Refresh'inkite Colyseus Cloud Dashboard (F5)
2. Scroll žemyn - turėtumėte matyti naujausius log'us
3. Ieškokite: `✅ Colyseus server is running on port 2567`

**Jei vis dar matote tik senus log'us:**
- Palaukite 30 sekundžių ir refresh'inkite dar kartą
- Arba patikrinkite, ar serveris tikrai veikia (testuokite žaidimą)

---

## 🎯 Galutinė Išvada

**Pagal jūsų log'us:**
- ✅ Serveris **START'INO** 16:01:39
- ✅ Log'ai rodo sėkmingą start'ą
- ✅ Dabar reikia **testuoti žaidimą** ir patikrinti, ar CORS veikia

**Log'ai atnaujinasi:**
- PM2 logs - real-time
- Application logs - 10-30 sekundžių delay
- Dashboard - reikia refresh'inti

**Dabar testuokite žaidimą ir patikrinkite, ar CORS veikia!**



