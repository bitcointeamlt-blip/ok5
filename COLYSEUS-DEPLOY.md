# Colyseus Deployment Guide

## ✅ Serveris Paruoštas

Serveris sėkmingai kompiliuojasi ir paruoštas deployment'ui.

## 🚀 Deployment į Colyseus Cloud

### 1. Push į GitHub

```bash
git add .
git commit -m "Add Colyseus server integration"
git push
```

**SVARBU**: Įsitikinkite, kad `colyseus-server/` folderis yra GitHub'e!

### 2. Colyseus Cloud Setup

1. Eikite į: https://cloud.colyseus.io
2. Prisijunkite prie savo account'o
3. Pasirinkite "dot game" aplikaciją
4. Spustelėkite **"LINK WITH GITHUB"**

### 3. Build Settings

Colyseus Cloud → Settings → Build:

- **Build Command**: 
  ```
  cd colyseus-server && npm install && npm run build
  ```

- **Start Command**: 
  ```
  cd colyseus-server && npm start
  ```

- **Root Directory**: 
  ```
  colyseus-server
  ```

- **Node Version**: `22` (arba `20`)

### 4. Environment Variables

Colyseus Cloud → Settings → Environment Variables:

Nėra reikalingų environment variables dabar (PORT nustatomas automatiškai).

### 5. Deploy

1. Spustelėkite **"Deploy"** arba **"Redeploy"**
2. Palaukite, kol deployment baigsis
3. Gausite naują endpoint (pvz: `https://de-fra-xxxxx.colyseus.cloud`)

### 6. Update Frontend

Atnaujinkite `.env` failą su nauju endpoint'u:

```
VITE_COLYSEUS_ENDPOINT=https://de-fra-xxxxx.colyseus.cloud
```

Arba Netlify/Cloudflare Pages environment variables:
- `VITE_COLYSEUS_ENDPOINT` = jūsų Colyseus endpoint

## 🧪 Testavimas Lokaliai

### Test Server

```bash
cd colyseus-server
npm run dev
```

Serveris veiks: `ws://localhost:2567`

### Test Frontend

```bash
# Kitas terminal
npm run dev
```

Frontend bus: `http://localhost:4000`

Atnaujinkite `.env`:
```
VITE_COLYSEUS_ENDPOINT=ws://localhost:2567
```

## 📋 Deployment Checklist

- [ ] Serveris kompiliuojasi (`npm run build`)
- [ ] Kodas push'intas į GitHub
- [ ] Colyseus Cloud susietas su GitHub
- [ ] Build settings nustatyti
- [ ] Deployment sėkmingas
- [ ] Endpoint gautas
- [ ] Frontend `.env` atnaujintas
- [ ] Frontend redeploy'intas

## 🔍 Troubleshooting

### Build fails
- Patikrinkite, ar `colyseus-server/` folderis yra GitHub'e
- Patikrinkite build command (turėtų būti `cd colyseus-server && npm install && npm run build`)

### Server neveikia
- Patikrinkite Colyseus Cloud logs
- Patikrinkite, ar Node version yra 20 arba 22

### Frontend negali prisijungti
- Patikrinkite `VITE_COLYSEUS_ENDPOINT` environment variable
- Patikrinkite, ar endpoint formatas teisingas (`https://` arba `wss://`)

## 🎮 Testavimas

1. Atidarykite žaidimą naršyklėje
2. Prisijunkite su Ronin Wallet
3. Pasirinkite "PvP Online"
4. Turėtumėte prisijungti prie Colyseus room
5. Kai 2 žaidėjai prisijungia, turėtų pradėti žaidimą

