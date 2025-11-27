# 🔧 Fix "Failed to connect to game server"

## ❌ Problema: "FAILED TO ENTER LOBBY"

Žaidimas negali prisijungti prie Colyseus serverio.

---

## ✅ Sprendimas

### Step 1: Patikrinkite .env Failą

Sukurkite arba patikrinkite `.env` failą root folderyje (`ok4/.env`):

```env
VITE_COLYSEUS_ENDPOINT=https://de-fra-f8820c12.colyseus.cloud
```

**SVARBU**: 
- Naudokite `https://` (ne `wss://`)
- ColyseusService automatiškai konvertuoja į `wss://`

---

### Step 2: Patikrinkite Colyseus Server Status

Atidarykite naršyklėje:
```
https://de-fra-f8820c12.colyseus.cloud/health
```

**Jei matote `{"status":"ok"}`**:
- ✅ Serveris veikia
- Problema frontend konfigūracijoje

**Jei matote error**:
- ❌ Serveris neveikia
- Reikia patikrinti Colyseus Cloud logs

---

### Step 3: Restart Dev Server

Jei `.env` failą ką tik sukūrėte arba pakeitėte:

1. **Sustabdykite** dev serverį (Ctrl+C terminal'e)
2. **Paleiskite** dar kartą:
   ```bash
   npm run dev
   ```

**SVARBU**: Vite reikalauja restart'o, kad įkeltų naują `.env` failą!

---

### Step 4: Patikrinkite Browser Console

1. Atidarykite browser console (F12)
2. Patikrinkite **Console** tab:
   - Ar yra error'ų?
   - Ar yra "Colyseus client initialized" pranešimas?
3. Patikrinkite **Network** tab:
   - Ar yra WebSocket connection?
   - Ar connection sėkmingas?

---

## 🔍 Troubleshooting

### Problema: .env failas neįkeliamas

**Sprendimas**:
- Patikrinkite, ar `.env` failas yra root folderyje (`ok4/.env`)
- Patikrinkite, ar failo vardas tiksliai `.env` (ne `.env.txt`)
- Restart dev serverį

### Problema: WebSocket connection fails

**Sprendimas**:
1. Patikrinkite browser console → Network tab
2. Patikrinkite, ar WebSocket connection bando prisijungti
3. Patikrinkite CORS errors

### Problema: Serveris neveikia

**Sprendimas**:
1. Colyseus Cloud → Endpoints → LOGS
2. Patikrinkite, ar serveris veikia
3. Jei ne → patikrinkite deployment status

---

## 📋 Checklist

- [ ] `.env` failas sukurtas
- [ ] `VITE_COLYSEUS_ENDPOINT` teisingas
- [ ] Dev server restart'as padarytas
- [ ] Browser console patikrintas
- [ ] WebSocket connection patikrintas
- [ ] Serveris veikia (`/health` endpoint)

---

**Ar padarėte restart dev serverį po .env failo sukūrimo?**

