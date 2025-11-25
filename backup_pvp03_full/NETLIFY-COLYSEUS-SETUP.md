# 🔧 Netlify Colyseus Endpoint Setup

## ❌ Problema

Žaidimas rodo:
- "FAILED TO ENTER LOBBY"
- "Colyseus not configured. Set VITE_COLYSEUS_ENDPOINT in .env file"

**Priežastis:** Netlify neturi `VITE_COLYSEUS_ENDPOINT` environment variable.

---

## ✅ Sprendimas: Pridėti Environment Variable į Netlify

### Step 1: Eikite į Netlify Dashboard

1. **Eikite į:** https://app.netlify.com
2. **Prisijunkite**
3. **Pasirinkite savo site** (pvz: `jocular-zabaione-835b49`)

---

### Step 2: Eikite į Environment Variables

1. **Kairėje meniu:** Spustelėkite **"Site settings"**
2. **Tada:** Spustelėkite **"Environment variables"**
3. **ARBA:** Spustelėkite **"Build & deploy"** → **"Environment"** → **"Environment variables"**

---

### Step 3: Pridėkite VITE_COLYSEUS_ENDPOINT

1. **Spustelėkite:** **"Add a variable"** arba **"Add variable"**

2. **Key:** `VITE_COLYSEUS_ENDPOINT`

3. **Value:** Jūsų Colyseus Cloud endpoint
   - Pvz: `https://de-fra-xxxxx.colyseus.cloud`
   - ARBA: `wss://de-fra-xxxxx.colyseus.cloud`
   - **SVARBU:** Jei naudojate `https://`, Netlify automatiškai konvertuos į `wss://`

4. **Scope:** Pasirinkite **"All scopes"** (arba **"Production"** jei norite tik production)

5. **Spustelėkite:** **"Save"** arba **"Add variable"**

---

### Step 4: Redeploy Site

Po pridėjimo environment variable, reikia redeploy'inti site:

1. **Eikite į:** **"Deploys"** sekciją
2. **Spustelėkite:** **"Trigger deploy"** → **"Deploy site"**
3. **ARBA:** Jei naudojate GitHub, tiesiog padarykite naują commit ir push

---

## 🔍 Kaip Rasti Colyseus Endpoint?

### Jei Turite Colyseus Cloud:

1. **Eikite į:** https://cloud.colyseus.io
2. **Pasirinkite savo aplikaciją**
3. **Eikite į:** **"Deployments"** arba **"Settings"**
4. **Raskite:** **"Endpoint"** arba **"URL"**
5. **Kopijuokite:** Endpoint (pvz: `https://de-fra-xxxxx.colyseus.cloud`)

### Jei Neturite Colyseus Cloud:

**Option 1: Naudokite Localhost (Development)**
- `VITE_COLYSEUS_ENDPOINT` = `ws://localhost:2567`
- **Bet:** Tai veiks tik lokaliai, ne ant Netlify

**Option 2: Sukurkite Colyseus Cloud Account**
- Eikite į: https://cloud.colyseus.io
- Sukurkite account
- Deploy'inkite Colyseus server
- Gaukite endpoint

---

## ✅ Patikrinimas

Po redeploy, patikrinkite:

1. **Build Logs:**
   - Netlify → Deploys → Build logs
   - Turėtų rodyti: `VITE_COLYSEUS_ENDPOINT` environment variable

2. **Browser Console:**
   - Atidarykite žaidimą
   - DevTools → Console
   - Turėtų rodyti: `Colyseus client initialized: wss://...`
   - **NE** turėtų rodyti: "Cannot enter lobby: Colyseus endpoint not configured"

3. **Žaidimas:**
   - Spustelėkite "PvP Online"
   - Turėtų prisijungti prie Colyseus server
   - **NE** turėtų rodyti: "FAILED TO ENTER LOBBY"

---

## 📋 Checklist

- [ ] Netlify Dashboard → Site settings → Environment variables
- [ ] Pridėtas `VITE_COLYSEUS_ENDPOINT` variable
- [ ] Value = jūsų Colyseus Cloud endpoint
- [ ] Scope = "All scopes" arba "Production"
- [ ] Site redeploy'intas
- [ ] Build logs rodo environment variable
- [ ] Browser console rodo "Colyseus client initialized"
- [ ] Žaidimas prisijungia prie Colyseus server

---

## 🔧 Troubleshooting

### Problema: Vis dar rodo "Colyseus not configured"

**Sprendimas:**
1. Patikrinkite, ar environment variable pridėtas teisingai
2. Patikrinkite, ar value teisingas (be tarpų, be kabučių)
3. Redeploy'inkite site
4. Hard refresh naršyklėje (`Ctrl+Shift+R`)

### Problema: "Failed to connect to Colyseus server"

**Sprendimas:**
1. Patikrinkite, ar Colyseus server veikia
2. Patikrinkite, ar endpoint teisingas
3. Patikrinkite, ar endpoint naudoja `https://` arba `wss://`

### Problema: Environment variable neatsiranda build'e

**Sprendimas:**
1. Patikrinkite, ar variable scope = "All scopes"
2. Redeploy'inkite site
3. Patikrinkite build logs - turėtų rodyti environment variables

---

## 💡 Svarbiausia

**Netlify reikalauja environment variables būti nustatyti Dashboard'e, ne `.env` faile!**

`.env` failas veikia tik lokaliai. Netlify naudoja environment variables iš Dashboard.

**Po pridėjimo environment variable, reikia redeploy'inti site!**

