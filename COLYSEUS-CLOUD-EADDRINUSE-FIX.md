# 🔧 Colyseus Cloud EADDRINUSE Fix

## ❌ Problema

Colyseus Cloud logs rodo:
```
Error: listen EADDRINUSE: address already in use :::2567
Port 2567 is already in use
```

**Priežastis:**
- PM2 bando start'inti kelis serverio instance'us vienu metu
- Kiekvienas instance bando naudoti tą patį portą 2567
- Tai sukuria `EADDRINUSE` error'ą
- Serveris crash'ina ir PM2 bando restart'inti, bet problema kartojasi

---

## ✅ Sprendimas

### 1. Pataisytas `ecosystem.config.js`

**Kas pridėta:**
- `kill_timeout: 5000` - laukti 5 sekundes prieš uždarant procesą
- `restart_delay: 4000` - laukti 4 sekundes prieš restart'inti
- `min_uptime: '10s'` - minimalus veikimo laikas prieš restart'inti
- `max_restarts: 5` - maksimalus restart'ų skaičius

**Kodėl tai veikia:**
- PM2 lauks, kol senas procesas užsidarys prieš start'inti naują
- Restart delay padeda išvengti greitų restart'ų ciklų

---

### 2. Pataisytas `colyseus-server/src/index.ts`

**Kas pridėta:**
- `server.listen(PORT, '0.0.0.0', ...)` - aiškiai nustatytas bind address
- Geriau error handling su `EADDRINUSE` - laukti 5 sekundes prieš exit

**Kodėl tai veikia:**
- `0.0.0.0` bind address garantuoja, kad serveris klauso visų interface'ų
- 5 sekundžių laukimas padeda PM2 užsidaryti senam procesui

---

## 🚀 Deployment Instrukcijos

### Step 1: Commit → Push į GitHub

```bash
git add colyseus-server/ecosystem.config.js
git add colyseus-server/src/index.ts
git commit -m "Fix EADDRINUSE - prevent multiple PM2 instances"
git push origin main
```

### Step 2: Colyseus Cloud Automatiškai Deploy'ins

- Colyseus Cloud automatiškai deploy'ins po GitHub push
- Palaukite 2-5 min

### Step 3: Patikrinkite Colyseus Cloud Logs

**Turėtumėte matyti:**
```
✅ Server running on port 2567
✅ Server listening on 0.0.0.0:2567
```

**NETURĖTUMĖTE MATYTI:**
```
❌ Port 2567 is already in use
Error: listen EADDRINUSE
```

---

## 🔍 Troubleshooting

### Problema: Vis tiek matote EADDRINUSE

**Sprendimas:**
1. Patikrinkite Colyseus Cloud Dashboard → Deployments
2. Patikrinkite, ar paskutinis deployment turi naują versiją
3. Patikrinkite PM2 logs - ar vis dar bando start'inti kelis instance'us?

**Jei vis tiek neveikia:**
- Colyseus Cloud gali naudoti savo PM2 konfigūraciją
- Kreipkitės į Colyseus Cloud support

---

### Problema: Serveris neveikia po fix'o

**Sprendimas:**
1. Patikrinkite Colyseus Cloud logs - ar serveris start'ina?
2. Patikrinkite `http://de-fra-c81e866a.colyseus.cloud/health`
3. Patikrinkite, ar build output turi naują kodą

---

## 📋 Checklist

- [ ] `ecosystem.config.js` pataisytas su `kill_timeout` ir `restart_delay`
- [ ] `colyseus-server/src/index.ts` pataisytas su `0.0.0.0` bind address
- [ ] Kodas commit'intas ir push'intas į GitHub
- [ ] Colyseus Cloud deployment padarytas
- [ ] Colyseus Cloud logs nerodo `EADDRINUSE` error'ų
- [ ] Serveris veikia (`/health` endpoint)

---

## 💡 Svarbiausia

**Pagrindinė problema:**
- PM2 bando start'inti kelis instance'us vienu metu
- Tai sukuria portų konfliktą

**Sprendimas:**
- `ecosystem.config.js` su `kill_timeout` ir `restart_delay`
- Serverio kodas su `0.0.0.0` bind address
- Geriau error handling su `EADDRINUSE`

---

## 📚 Susiję Failai

- `colyseus-server/ecosystem.config.js` - PM2 konfigūracija
- `colyseus-server/src/index.ts` - Serverio kodas
- `colyseus-server/build/index.js` - Build output





