# 🔧 Greitas Sprendimas - "Failed to connect to game server"

## ❌ Problema

Žaidimas rodo: "FAILED TO ENTER LOBBY - Failed to connect to game server"

---

## ✅ Greitas Sprendimas

### Step 1: Patikrinkite Colyseus Server Status

Atidarykite naršyklėje:
```
https://de-fra-f8820c12.colyseus.cloud/health
```

**Jei matote `{"status":"ok"}`**:
- ✅ Serveris veikia
- Problema frontend konfigūracijoje

**Jei matote error**:
- ❌ Serveris neveikia
- Reikia deploy'inti Colyseus serverį

---

### Step 2: Patikrinkite Colyseus Cloud Deployment

1. Eikite: **https://cloud.colyseus.io**
2. Pasirinkite **"dot game"**
3. Patikrinkite **Deployments** tab:
   - Ar yra deployment?
   - Ar status "Running"?
   - Ar "Instances" rodo "1"?

**Jei nėra deployment**:
- Pasirinkite branch (SELECT BRANCH → main)
- Spustelėkite "Deploy"
- Palaukite 2-5 min

---

### Step 3: Patikrinkite Endpoint Formatą

`.env` failas turi:
```
VITE_COLYSEUS_ENDPOINT=https://de-fra-f8820c12.colyseus.cloud
```

**ColyseusService automatiškai konvertuoja**:
- `https://` → `wss://` (WebSocket Secure)
- `http://` → `ws://` (WebSocket)

Tai turėtų veikti automatiškai.

---

### Step 4: Restart Frontend

Jei lokaliai testuojate:

1. Sustabdykite dev serverį (Ctrl+C)
2. Paleiskite dar kartą:
   ```bash
   npm run dev
   ```

Jei production:
- Redeploy frontend (Netlify/Cloudflare)

---

## 🔍 Troubleshooting

### Problema: Serveris neveikia

**Sprendimas**:
1. Colyseus Cloud → Deployments
2. Jei "Not deployed" → Deploy
3. Jei fails → Patikrinkite Logs

### Problema: Endpoint neteisingas

**Sprendimas**:
- Patikrinkite `.env` failą
- Patikrinkite, ar endpoint formatas teisingas
- Redeploy frontend

### Problema: WebSocket connection fails

**Sprendimas**:
1. Patikrinkite browser console (F12)
2. Patikrinkite Network tab → WebSocket connection
3. Patikrinkite, ar yra CORS errors

---

## 📋 Checklist

- [ ] Colyseus serveris deployed (Colyseus Cloud)
- [ ] Endpoint veikia (`/health` endpoint)
- [ ] `.env` failas teisingas
- [ ] Frontend restart'intas
- [ ] Browser console patikrintas (F12)

---

## 💡 Greitas Būdas

1. **Patikrinkite serverį**: `https://de-fra-f8820c12.colyseus.cloud/health`
2. **Jei neveikia** → Colyseus Cloud → Deploy
3. **Jei veikia** → Restart frontend
4. **Patikrinkite browser console** (F12) errors

**Ar Colyseus serveris deployed ir veikia?**

