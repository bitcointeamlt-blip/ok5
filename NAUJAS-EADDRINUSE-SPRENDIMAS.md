# 🔧 Naujas EADDRINUSE Sprendimas - Port Check Prieš Listen

## ❌ Problema

Ankstesnis sprendimas neveikia - Colyseus Cloud vis tiek gauna `EADDRINUSE` error'ą.

## ✅ Naujas Sprendimas

### 1. Port Check Prieš Listen

**Kas pridėta:**
- `checkPortAvailable()` funkcija - tikrina, ar portas laisvas PRIEŠ bandant listen'inti
- Jei portas užimtas - laukia 10 sekundžių ir bando dar kartą
- Jei vis dar užimtas - exit su error'u

**Kodėl tai veikia:**
- Serveris nebandys listen'inti, jei portas jau užimtas
- Tai išvengia `EADDRINUSE` error'o
- PM2 turės laiko užsidaryti senam procesui

### 2. Pagerinta PM2 Konfigūracija

**Kas pakeista `ecosystem.config.js`:**
- `kill_timeout: 10000` - padidinta iki 10 sekundžių
- `restart_delay: 10000` - padidinta iki 10 sekundžių
- `min_uptime: '30s'` - padidinta iki 30 sekundžių
- `max_restarts: 3` - sumažinta iki 3 restart'ų
- `unique: true` - garantuoja, kad bus tik vienas instance'as

**Kodėl tai veikia:**
- Ilgesnis laukimas padeda PM2 užsidaryti senam procesui
- `unique: true` garantuoja, kad bus tik vienas instance'as

---

## 📋 Pakeisti Failai

### 1. `colyseus-server/src/index.ts`
- Pridėta `checkPortAvailable()` funkcija
- Port check prieš listen
- 10 sekundžių laukimas, jei portas užimtas

### 2. `colyseus-server/ecosystem.config.js`
- Padidinti timeout'ai
- `unique: true` - garantuoja vieną instance'ą
- `force: false` - neforce'ina start'ą, jei jau veikia

---

## 🚀 Commit ir Push

```bash
git add colyseus-server/src/index.ts
git add colyseus-server/ecosystem.config.js
git commit -m "Fix EADDRINUSE - port check before listen and improved PM2 config"
git push origin main
```

---

## 🔍 Patikrinimas

**Po deployment patikrinkite Colyseus Cloud logs:**
- Turėtumėte matyti: `✅ Server running on port 2567`
- NETURĖTUMĖTE MATYTI: `❌ Port 2567 is already in use`

---

## 💡 Kodėl Tai Turėtų Veikti

1. **Port check prieš listen** - išvengia `EADDRINUSE` error'o
2. **10 sekundžių laukimas** - PM2 turi laiko užsidaryti senam procesui
3. **`unique: true`** - garantuoja, kad bus tik vienas instance'as
4. **Padidinti timeout'ai** - daugiau laiko PM2 valdymui

---

## 🚨 Jei Vis Tiek Neveikia

**Alternatyvus sprendimas:**
- Naudokite `Procfile` vietoj `ecosystem.config.js`
- ARBA kreipkitės į Colyseus Cloud support



