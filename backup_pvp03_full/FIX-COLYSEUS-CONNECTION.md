# 🔧 Kaip Išspręsti "Failed to connect to game server"

## ❌ Problema: "FAILED TO ENTER LOBBY"

Žaidimas negali prisijungti prie Colyseus serverio. Tai reiškia:
- Frontend bando prisijungti prie Colyseus
- Bet serveris nepasiekiamas arba neveikia

---

## ✅ Sprendimas

### Step 1: Patikrinkite Colyseus Deployment

1. Eikite į: **https://cloud.colyseus.io**
2. Pasirinkite **"dot game"** aplikaciją
3. Patikrinkite **Deployments** tab:
   - Ar yra deployment?
   - Ar status "Running" arba "Success"?
   - Ar "Instances" rodo "1" arba "Running"?

**Jei nėra deployment**:
- Pasirinkite branch
- Deploy

**Jei deployment fails**:
- Patikrinkite Logs
- Patikrinkite build settings

---

### Step 2: Patikrinkite Endpoint

Atidarykite naršyklėje:
```
https://de-fra-f8820c12.colyseus.cloud/health
```

**Jei matote `{"status":"ok"}`**:
- ✅ Serveris veikia
- Problema frontend konfigūracijoje

**Jei matote error**:
- ❌ Serveris neveikia
- Reikia deploy'inti arba patikrinti logs

---

### Step 3: Patikrinkite Frontend Konfigūraciją

#### Lokaliai (.env failas)

Patikrinkite `.env` failą:
```
VITE_COLYSEUS_ENDPOINT=https://de-fra-f8820c12.colyseus.cloud
```

**ARBA jei testuojate lokaliai**:
```
VITE_COLYSEUS_ENDPOINT=ws://localhost:2567
```

#### Production (Netlify/Cloudflare)

1. Netlify/Cloudflare → Environment Variables
2. Patikrinkite `VITE_COLYSEUS_ENDPOINT`:
   ```
   https://de-fra-f8820c12.colyseus.cloud
   ```
3. Redeploy frontend

---

### Step 4: Patikrinkite ColyseusService

Patikrinkite `src/services/ColyseusService.ts`:
- Ar endpoint teisingas?
- Ar WebSocket connection teisingas?

---

## 🔍 Troubleshooting

### Problema: Serveris neveikia

**Sprendimas**:
1. Colyseus Cloud → Deployments
2. Patikrinkite status
3. Jei "Not deployed" → Deploy
4. Jei fails → Patikrinkite Logs

### Problema: Endpoint neteisingas

**Sprendimas**:
1. Patikrinkite `.env` failą
2. Patikrinkite Netlify/Cloudflare environment variables
3. Redeploy frontend

### Problema: WebSocket connection fails

**Sprendimas**:
1. Patikrinkite, ar endpoint formatas teisingas (`https://` arba `wss://`)
2. Patikrinkite, ar serveris veikia (`/health` endpoint)
3. Patikrinkite browser console (F12) errors

---

## 📋 Checklist

- [ ] Colyseus serveris deployed ir veikia
- [ ] Endpoint veikia (`/health` endpoint)
- [ ] Frontend `.env` teisingas
- [ ] Production environment variables teisingi
- [ ] Frontend redeploy'intas (jei production)

---

## 💡 Greitas Sprendimas

1. **Patikrinkite Colyseus Cloud**: Ar serveris deployed?
2. **Patikrinkite endpoint**: `https://de-fra-f8820c12.colyseus.cloud/health`
3. **Patikrinkite `.env`**: Ar endpoint teisingas?
4. **Redeploy frontend**: Jei production

**Ar Colyseus serveris deployed ir veikia?**

