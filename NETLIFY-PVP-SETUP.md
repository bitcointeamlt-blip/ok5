# 🚀 Netlify PvP Online Setup - Final

## 🎯 Tikslas

Kad PvP Online veiktų ant `https://jocular-zabaione-835b49.netlify.app/`

---

## ✅ Kas Jau Padaryta

### 1. ✅ Colyseus Serveris Konfigūruotas
- **Endpoint:** `https://de-fra-f8820c12.colyseus.cloud`
- **CORS:** Leidžia `https://jocular-zabaione-835b49.netlify.app`
- **Health:** `https://de-fra-f8820c12.colyseus.cloud/health`

### 2. ✅ Frontend Kodas Paruoštas
- `ColyseusService.ts` naudoja `VITE_COLYSEUS_ENDPOINT`
- Automatiškai konvertuoja `https://` → `wss://`

---

## 🔧 Ką Reikia Padaryti

### Step 1: Patikrinkite Colyseus Cloud Serveris

**Atidarykite browser:**
```
https://de-fra-f8820c12.colyseus.cloud/health
```

**Turėtumėte matyti:**
```json
{"status":"ok","timestamp":"..."}
```

✅ **Jei matote `{"status":"ok"}`:** Serveris veikia!

---

### Step 2: Pridėkite Environment Variable į Netlify

**SVARBU:** Netlify turi turėti `VITE_COLYSEUS_ENDPOINT` su teisingu endpoint!

#### 2.1. Eikite į Netlify Dashboard

1. **Atidarykite:** https://app.netlify.com
2. **Prisijunkite**
3. **Pasirinkite site:** `jocular-zabaione-835b49`

#### 2.2. Eikite į Environment Variables

1. **Kairėje meniu:** Spustelėkite **"Site settings"**
2. **Tada:** Spustelėkite **"Environment variables"**
3. **ARBA:** Spustelėkite **"Build & deploy"** → **"Environment"** → **"Environment variables"**

#### 2.3. Pridėkite arba Patikrinkite `VITE_COLYSEUS_ENDPOINT`

**Jei NĖRA `VITE_COLYSEUS_ENDPOINT`:**

1. **Spustelėkite:** **"Add a variable"** arba **"Add variable"**
2. **Key:** `VITE_COLYSEUS_ENDPOINT`
3. **Value:** `https://de-fra-f8820c12.colyseus.cloud`
4. **Scope:** Pasirinkite **"All scopes"** (arba **"Production"**)
5. **Spustelėkite:** **"Save"** arba **"Add variable"**

**Jei YRA `VITE_COLYSEUS_ENDPOINT`:**

1. **Spustelėkite:** **"Edit"** prie `VITE_COLYSEUS_ENDPOINT`
2. **Patikrinkite ar Value =** `https://de-fra-f8820c12.colyseus.cloud`
3. **Jei neteisingas:** Pakeiskite į `https://de-fra-f8820c12.colyseus.cloud`
4. **Spustelėkite:** **"Save"**

**SVARBU:**
- ✅ Key turi būti tiksliai `VITE_COLYSEUS_ENDPOINT` (be tarpų!)
- ✅ Value turi būti `https://de-fra-f8820c12.colyseus.cloud` (su `https://`!)
- ✅ Scope turi būti **"All scopes"** arba **"Production"**

---

### Step 3: Redeploy Netlify

**SVARBU:** Po environment variable pridėjimo arba pakeitimo, reikia redeploy'inti site!

#### Option 1: Trigger Deploy (Greitas)

1. **Netlify Dashboard** → **"Deploys"** sekcija
2. **Spustelėkite:** **"Trigger deploy"** → **"Deploy site"**
3. **ARBA:** **"Trigger deploy"** → **"Clear cache and deploy site"** (rekomenduojama)

#### Option 2: GitHub Commit (Jei naudojate GitHub)

1. **Padarykite bet kokį commit** į GitHub
2. **Netlify automatiškai deploy'ins** naują versiją

**Palaukite 2-5 min**, kol deploy baigsis.

---

### Step 4: Patikrinkite

#### 4.1. Patikrinkite Browser Console

1. **Atidarykite:** `https://jocular-zabaione-835b49.netlify.app/`
2. **Atidarykite:** Browser Developer Tools (F12)
3. **Eikite į:** Console tab
4. **Spauskite:** "PvP ONLINE"

**Turėtumėte matyti:**
- ✅ `🔍 Colyseus Service Environment: {hasEnv: true, endpoint: 'wss://de-fra-f8820c12.colyseus.cloud...'}`
- ✅ `🔵 Using Colyseus Cloud endpoint`
- ✅ `✅ Colyseus client initialized`
- ✅ `Joined Colyseus room: [room-id]`

**NETURĖTŲ būti:**
- ❌ `ERR_CONNECTION_REFUSED`
- ❌ `CORS policy: No 'Access-Control-Allow-Origin' header`
- ❌ `VITE_COLYSEUS_ENDPOINT not set`

#### 4.2. Patikrinkite Network Tab

1. **Browser Developer Tools** → **Network** tab
2. **Spauskite:** "PvP ONLINE"
3. **Ieškokite:** `matchmake/joinOrCreate/pvp_room`

**Turėtumėte matyti:**
- ✅ Request URL: `https://de-fra-f8820c12.colyseus.cloud/matchmake/joinOrCreate/pvp_room`
- ✅ Status: `200 OK` arba `201 Created`
- ✅ Response: `{"roomId":"...","sessionId":"..."}`

**NETURĖTŲ būti:**
- ❌ Status: `0` arba `ERR_CONNECTION_REFUSED`
- ❌ Status: `CORS error`

---

## 🔍 Troubleshooting

### Problema: "VITE_COLYSEUS_ENDPOINT not set"

**Priežastis:** Netlify neturi environment variable.

**Sprendimas:**
1. Eikite į Netlify Dashboard → Site settings → Environment variables
2. Pridėkite `VITE_COLYSEUS_ENDPOINT` = `https://de-fra-f8820c12.colyseus.cloud`
3. Redeploy site

---

### Problema: "ERR_CONNECTION_REFUSED"

**Priežastis:** Colyseus Cloud serveris neveikia.

**Sprendimas:**
1. Patikrinkite: `https://de-fra-f8820c12.colyseus.cloud/health`
2. Jei neveikia, patikrinkite Colyseus Cloud Dashboard
3. Jei reikia, redeploy Colyseus serverį

---

### Problema: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Priežastis:** Colyseus serveris neturi CORS konfigūracijos.

**Sprendimas:**
- ✅ CORS jau konfigūruotas serveryje
- Jei vis dar neveikia, patikrinkite ar Colyseus Cloud serveris naudoja naujausią kodą

---

### Problema: "Failed to join Colyseus room"

**Priežastis:** Serveris neveikia arba endpoint neteisingas.

**Sprendimas:**
1. Patikrinkite ar Colyseus Cloud serveris veikia
2. Patikrinkite ar Netlify environment variable teisingas
3. Patikrinkite browser console error'us

---

## ✅ Checklist

- [ ] Colyseus Cloud serveris veikia (`/health` endpoint)
- [ ] Netlify turi `VITE_COLYSEUS_ENDPOINT` environment variable
- [ ] `VITE_COLYSEUS_ENDPOINT` = `https://de-fra-f8820c12.colyseus.cloud`
- [ ] Netlify site redeploy'intas po environment variable pridėjimo
- [ ] Browser console rodo `✅ Colyseus client initialized`
- [ ] Browser console rodo `Joined Colyseus room: [room-id]`
- [ ] Nėra `ERR_CONNECTION_REFUSED` error'ų
- [ ] Nėra CORS error'ų

---

## 📋 Serverio Endpoint'ai

### Colyseus Cloud:
- **URL:** `https://de-fra-f8820c12.colyseus.cloud`
- **Health:** `https://de-fra-f8820c12.colyseus.cloud/health`
- **Matchmaking:** `https://de-fra-f8820c12.colyseus.cloud/matchmake/joinOrCreate/pvp_room`

### Netlify:
- **URL:** `https://jocular-zabaione-835b49.netlify.app`
- **Environment Variable:** `VITE_COLYSEUS_ENDPOINT` = `https://de-fra-f8820c12.colyseus.cloud`

---

**Status:** ✅ Instrukcijos paruoštos! Sekite Step 1-4 ir PvP Online turėtų veikti!


