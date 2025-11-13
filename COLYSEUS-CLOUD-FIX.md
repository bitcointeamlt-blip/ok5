# ✅ Colyseus Cloud - Paruoštas Kodas

## 🎯 Kas Padaryta

✅ **CORS konfigūracija** - leidžia visus origin'us (localhost ir production)  
✅ **Serverio startavimas** - naudoja `gameServer.listen()` (reikalinga Colyseus Cloud)  
✅ **Kompiliacija** - serveris kompiliuojasi be klaidų  

## 🚀 Kaip Deploy'inti į Colyseus Cloud

### Step 1: Push į GitHub

```bash
git add .
git commit -m "Fix Colyseus server for cloud deployment - CORS and listen()"
git push
```

**SVARBU**: Įsitikinkite, kad `colyseus-server/` folderis yra GitHub'e!

---

### Step 2: Colyseus Cloud Dashboard

1. Eikite į: **https://cloud.colyseus.io**
2. Prisijunkite prie savo account'o
3. Pasirinkite **"dot game"** aplikaciją (arba sukurkite naują)

---

### Step 3: Link su GitHub

1. Spustelėkite **"LINK WITH GITHUB"** arba **"Connect Repository"**
2. Pasirinkite savo repository
3. Patvirtinkite

---

### Step 4: Build Settings

Colyseus Cloud → **Settings** → **Build Configuration**:

#### Build Command:
```
cd colyseus-server && npm install && npm run build
```

#### Start Command:
```
cd colyseus-server && npm start
```

#### Root Directory:
```
colyseus-server
```

#### Node Version:
```
22
```
(arba `20` - bet `22` rekomenduojama)

#### Port:
Palikite **tuščią** - Colyseus Cloud nustato automatiškai

---

### Step 5: Deploy

1. Spustelėkite **"Deploy"** arba **"Redeploy"** mygtuką
2. Palaukite 2-5 minučių
3. Patikrinkite **Logs** sekciją

**Sėkmingas deployment turėtų rodyti**:
- ✅ `Colyseus server is running on port XXXX`
- ✅ **NĖRA** error'ų
- ✅ Instance status: "Running"

---

### Step 6: Gaukite Endpoint

Po sėkmingo deployment:
- Gausite endpoint (pvz: `https://de-fra-xxxxx.colyseus.cloud`)
- Kopijuokite šį endpoint

---

### Step 7: Atnaujinkite Frontend

#### Lokaliai (`.env` failas):
```env
VITE_COLYSEUS_ENDPOINT=https://de-fra-xxxxx.colyseus.cloud
```

#### Production (Netlify/Cloudflare):
1. **Netlify**: Site settings → Environment variables
   - Key: `VITE_COLYSEUS_ENDPOINT`
   - Value: jūsų Colyseus endpoint

2. **Cloudflare Pages**: Settings → Environment variables
   - Key: `VITE_COLYSEUS_ENDPOINT`
   - Value: jūsų Colyseus endpoint

3. **Redeploy** frontend

---

## ✅ Patikrinimas

### 1. Health Check
Atidarykite naršyklėje:
```
https://de-fra-xxxxx.colyseus.cloud/health
```

Turėtumėte matyti:
```json
{"status":"ok"}
```

### 2. Testuokite Žaidimą
1. Atidarykite žaidimą (`http://localhost:7000`)
2. Prisijunkite su Ronin Wallet
3. Pasirinkite **"PvP Online"**
4. Turėtumėte prisijungti be CORS klaidų!

---

## 🔍 Troubleshooting

### Problema: CORS klaida vis dar yra

**Sprendimas**:
- Patikrinkite, ar deployment sėkmingas
- Patikrinkite logs Colyseus Cloud dashboard'e
- Įsitikinkite, kad `.env` failas turi teisingą endpoint

### Problema: Serveris neveikia

**Patikrinkite**:
- Build command teisingas?
- Start command teisingas?
- Root directory teisingas?
- Node version teisingas?

### Problema: "Failed to join Colyseus room"

**Sprendimas**:
- Patikrinkite, ar serveris veikia (`/health` endpoint)
- Patikrinkite browser console (F12) → Network tab
- Patikrinkite, ar WebSocket connection sėkmingas

---

## 📋 Checklist

- [ ] Kodas push'intas į GitHub
- [ ] Colyseus Cloud susietas su GitHub
- [ ] Build settings nustatyti
- [ ] Deployment sėkmingas
- [ ] Health check veikia (`/health`)
- [ ] Frontend `.env` atnaujintas
- [ ] Žaidimas veikia be CORS klaidų

---

## 💡 Pastabos

- **CORS**: Serveris dabar leidžia visus origin'us (`origin: true`), tai veikia ir lokaliai, ir production'e
- **Listen**: Naudojame `gameServer.listen()` vietoj `server.listen()` - tai reikalinga Colyseus Cloud
- **Port**: Colyseus Cloud automatiškai nustato portą per `process.env.PORT`

---

**Ar viskas veikia?** 🎮

Jei vis dar yra problemų, patikrinkite:
1. Colyseus Cloud logs
2. Browser console (F12)
3. Network tab (F12 → Network)

