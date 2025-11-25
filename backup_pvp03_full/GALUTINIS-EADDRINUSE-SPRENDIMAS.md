# 🔧 Galutinis EADDRINUSE Sprendimas

## ❌ Problema

Colyseus Cloud logs vis dar rodo:
```
Error: listen EADDRINUSE: address already in use :::2567
Port 2567 is already in use
```

**Priežastis:** PM2 bando start'inti kelis instance'us vienu metu arba senas procesas neužsidaro greitai.

---

## ✅ Naujas Sprendimas

### 1. Port Check Prieš Listen (SU RETRY)

**Kas pridėta:**
- `waitForPort()` funkcija - tikrina portą prieš listen su retry mechanism
- 10 bandymų su 1 sekundės delay tarp bandymų
- Jei portas užimtas - laukia ir bando dar kartą
- Tik kai portas laisvas - start'ina serverį

**Kodėl tai veikia:**
- Serveris nebandys listen'inti, jei portas užimtas
- Retry mechanism duoda PM2 laiko užsidaryti senam procesui
- Išvengia `EADDRINUSE` error'o

### 2. Pagerinta PM2 Konfigūracija

**Kas pakeista:**
- `kill_timeout: 20000` - 20 sekundžių laukti, kol senas procesas užsidarys
- `listen_timeout: 30000` - 30 sekundžių laukti, kol serveris start'ina
- `restart_delay: 15000` - 15 sekundžių laukti prieš restart'inti
- `min_uptime: '60s'` - serveris turi veikti 60 sekundžių prieš būti laikomas stabilus
- `stop_exit_codes: [0, 1]` - priima ir success ir error exit codes

**Kodėl tai veikia:**
- Ilgesni timeout'ai duoda PM2 laiko užsidaryti senam procesui
- `unique: true` garantuoja, kad bus tik vienas instance'as
- `force: false` neleidžia force start'inti, jei jau veikia

---

## 📋 Pakeisti Failai

### 1. `colyseus-server/src/index.ts`
- Pridėta `waitForPort()` funkcija su retry mechanism
- Port check prieš listen su 10 bandymų
- 1 sekundės delay tarp bandymų
- Explicit `0.0.0.0` bind address

### 2. `colyseus-server/ecosystem.config.js`
- Padidinti timeout'ai (20s kill, 30s listen)
- Padidintas restart delay (15s)
- Padidintas min_uptime (60s)
- `stop_exit_codes: [0, 1]` - priima abu exit codes

---

## 🚀 Commit ir Push

```bash
git add colyseus-server/src/index.ts
git add colyseus-server/ecosystem.config.js
git commit -m "Fix EADDRINUSE - add port check with retry and improved PM2 config"
git push origin main
```

---

## 🔍 Patikrinimas

Po deployment patikrinkite Colyseus Cloud logs:
- Turėtumėte matyti: `⏳ Port 2567 in use, retrying...` (jei portas užimtas)
- Turėtumėte matyti: `✅ Server running on port 2567` (kai portas laisvas)
- NETURĖTUMĖTE MATYTI: `❌ Port 2567 is already in use` (be retry)
- NETURĖTUMĖTE MATYTI: `ERR_SERVER_ALREADY_LISTEN`

---

## 💡 Kodėl Tai Turėtų Veikti

1. **Port check su retry** - išvengia `EADDRINUSE` error'o
2. **Ilgesni timeout'ai** - duoda PM2 laiko užsidaryti senam procesui
3. **Unique instance** - garantuoja, kad bus tik vienas instance'as
4. **Stop exit codes** - priima abu success ir error, kad PM2 galėtų teisingai valdyti

---

## ✅ Checklist

- [x] Port check su retry pridėtas
- [x] PM2 config pagerintas
- [x] Build sėkmingas
- [ ] Commit → Push į GitHub
- [ ] Deployment padarytas
- [ ] Logs patikrinti
- [ ] Serveris veikia be EADDRINUSE error'ų





