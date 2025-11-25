# 🎮 Kaip Paleisti Žaidimą Testavimui

## ✅ Greitas Start

### Step 1: Sukurkite .env Failą

Sukurkite `.env` failą root folderyje (`ok4/.env`):
```env
VITE_COLYSEUS_ENDPOINT=https://de-fra-f8820c12.colyseus.cloud
```

**SVARBU**: ColyseusService automatiškai konvertuoja `https://` į `wss://` WebSocket connection'ui.

---

### Step 2: Paleiskite Žaidimą

Terminal'e (root folderyje `ok4`):
```bash
npm run dev
```

Žaidimas bus prieinamas:
- **URL**: `http://localhost:4000`
- Naršyklė turėtų automatiškai atsidaryti

---

### Step 3: Testuokite PvP

1. **Atidarykite**: `http://localhost:4000`
2. **Prisijunkite** su Ronin Wallet
3. **Pasirinkite**: "PvP Online"
4. **Palaukite** matchmaking (Colyseus automatiškai suporuoja žaidėjus)

---

## 🔍 Troubleshooting

### Problema: "Failed to connect to game server"

**Patikrinkite**:
1. Ar `.env` failas egzistuoja?
2. Ar `VITE_COLYSEUS_ENDPOINT` teisingas?
3. Ar Colyseus serveris veikia? (`https://de-fra-f8820c12.colyseus.cloud/health`)

**Sprendimas**:
- Patikrinkite browser console (F12) → Network tab
- Patikrinkite, ar WebSocket connection sėkmingas

---

### Problema: Ronin Wallet neveikia

**Sprendimas**:
- Ronin Wallet reikalauja HTTPS
- Lokaliai gali veikti su `localhost`
- Jei neveikia → deploy į Netlify/Cloudflare (automatic HTTPS)

---

### Problema: Žaidimas neatsidaro

**Patikrinkite**:
1. Ar `npm run dev` veikia?
2. Ar port 4000 laisvas?
3. Ar yra error'ų terminal'e?

---

## 📋 Checklist

- [ ] `.env` failas sukurtas
- [ ] `VITE_COLYSEUS_ENDPOINT` nustatytas
- [ ] `npm run dev` paleistas
- [ ] Žaidimas atsidarė `http://localhost:4000`
- [ ] Prisijungta su Ronin Wallet
- [ ] PvP testuotas

---

## 🎯 Testavimo Scenarijai

### 1. Single Player Test
- Paleiskite žaidimą
- Pasirinkite "Single Player"
- Patikrinkite, ar veikia

### 2. PvP Test (Reikia 2 žaidėjų)
- Atidarykite 2 naršyklės langus
- Abi prisijunkite su skirtingais Ronin Wallet
- Abi pasirinkite "PvP Online"
- Palaukite matchmaking
- Patikrinkite, ar žaidėjai mato vienas kitą

---

## 💡 Pastabos

- **Colyseus Server**: Veikia Colyseus Cloud'e (`https://de-fra-f8820c12.colyseus.cloud`)
- **Frontend**: Veikia lokaliai (`http://localhost:4000`)
- **WebSocket**: Automatiškai konvertuojamas iš `https://` į `wss://`

---

**Ar viskas veikia?**

