# 🎯 Veiksmų Planas - Kas Daryti Dabar

## ⚡ Greitasis Sprendimas (10 min)

### Step 1: Patikrinkite Colyseus Cloud CORS Settings UI ⭐ PIRMAS

**Tai turėtų išspręsti problemą iš karto!**

1. **Eikite į Colyseus Cloud Dashboard:**
   - https://cloud.colyseus.io
   - Prisijunkite su savo account

2. **Pasirinkite savo projektą:**
   - Raskite projektą `ok06` arba endpoint `de-fra-c81e866a`

3. **Eikite į Settings:**
   - Settings → **CORS** (arba **Security** arba **API**)
   - Jei nerandate CORS sekcijos, patikrinkite visus Settings skyrius

4. **Pridėkite Netlify Domain:**
   - Pridėkite: `https://thriving-mandazi-d23051.netlify.app`
   - ARBA pridėkite: `https://*.netlify.app` (visi Netlify domain'ai)
   - ARBA pasirinkite "Allow all origins" / "Allow *"

5. **Išsaugokite ir Redeploy:**
   - Spauskite "Save" arba "Apply"
   - Eikite į Deployments → Redeploy
   - Palaukite 2-5 min

6. **Testuokite:**
   - Atidarykite `https://thriving-mandazi-d23051.netlify.app`
   - Spauskite "PvP ONLINE"
   - Patikrinkite browser console - neturėtų būti CORS error'ų

**Jei neveikia, pereikite prie Step 2.**

---

### Step 2: Priversti Colyseus Cloud Deploy'inti Naują Versiją

**Problema:** Colyseus Cloud gali naudoti seną versiją.

1. **Padarykite Dummy Pakeitimą:**
   ```bash
   cd colyseus-server
   # Atidarykite package.json ir pridėkite komentarą
   ```

2. **Pakeiskite `colyseus-server/package.json`:**
   ```json
   {
     "name": "dot-game-colyseus-server",
     "version": "1.0.1",  // Pakeiskite iš 1.0.0 į 1.0.1
     "description": "Colyseus server for DOT Clicker PvP - CORS fix v2",
     // ... rest
   }
   ```

3. **Commit → Push:**
   ```bash
   git add colyseus-server/package.json
   git commit -m "Force Colyseus Cloud redeploy - CORS fix v2"
   git push origin main
   ```

4. **Colyseus Cloud Automatiškai Deploy'ins:**
   - Palaukite 2-5 min
   - Patikrinkite Colyseus Cloud Dashboard → Deployments

5. **Patikrinkite Logs:**
   - Colyseus Cloud Dashboard → Logs
   - Ieškokite: `🟢 ALL /matchmake/* handler - Origin: ...`
   - Jei nerandate - serveris vis dar naudoja seną versiją

**Jei neveikia, pereikite prie Step 3.**

---

### Step 3: Patikrinkite Colyseus Cloud Build Process

**Problema:** Build gali neveikti teisingai.

1. **Patikrinkite Build Output Lokaliai:**
   ```bash
   cd colyseus-server
   npm run build
   ```

2. **Patikrinkite `build/index.js`:**
   - Turėtų būti: `app.all('/matchmake/*', ...)`
   - Turėtų būti: `🟢 ALL /matchmake/* handler`
   - Turėtų būti: `🔴 Matchmake route handler`
   - Turėtų būti: `🔵 Colyseus CORS headers`

3. **Patikrinkite Colyseus Cloud Build Logs:**
   - Colyseus Cloud Dashboard → Deployments → Build Logs
   - Patikrinkite, ar build'as sėkmingas
   - Patikrinkite, ar build output turi naują kodą

4. **Jei Build Neveikia:**
   - Patikrinkite `colyseus-server/tsconfig.json`
   - Patikrinkite `colyseus-server/package.json` scripts
   - Patikrinkite Node.js versiją

**Jei neveikia, pereikite prie Step 4.**

---

### Step 4: Sukurkite Naują Colyseus Cloud Deployment Location

**Problema:** Esamas deployment location gali turėti problemų.

1. **Colyseus Cloud Dashboard → Endpoints:**
   - Spauskite "+ ADD DEPLOYMENT LOCATION"
   - Pasirinkite kitą region (pvz: "Europe (Germany - Frankfurt)")

2. **Susiekite su GitHub:**
   - Pasirinkite repository `ok06`
   - Pasirinkite branch `main`
   - Pasirinkite root directory `colyseus-server`

3. **Deploy'inkite:**
   - Spauskite "Deploy"
   - Palaukite 2-5 min

4. **Gaukite Naują Endpoint:**
   - Naujas endpoint bus panašus į: `https://de-fra-XXXXX.colyseus.cloud`
   - Atnaujinkite Netlify Environment Variable:
     - `VITE_COLYSEUS_ENDPOINT` = naujas endpoint

5. **Redeploy'inkite Netlify:**
   - Netlify Dashboard → Deployments → Trigger deploy
   - Palaukite 2-3 min

6. **Testuokite:**
   - Atidarykite `https://thriving-mandazi-d23051.netlify.app`
   - Spauskite "PvP ONLINE"
   - Patikrinkite browser console

**Jei neveikia, pereikite prie Step 5.**

---

### Step 5: Naudokite Netlify Functions Proxy (Paskutinis Sprendimas)

**Šis sprendimas turėtų veikti garantuotai!**

#### 5.1: Sukurkite Netlify Function

Sukurkite `netlify/functions/colyseus-proxy.ts`:
```typescript
import { Handler } from '@netlify/functions';

export const handler: Handler = async (event, context) => {
  const { httpMethod, path, body, headers } = event;
  
  // Proxy request to Colyseus server
  const colyseusUrl = `https://de-fra-c81e866a.colyseus.cloud${path}`;
  
  try {
    const response = await fetch(colyseusUrl, {
      method: httpMethod,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: body
    });
    
    const responseBody = await response.text();
    
    return {
      statusCode: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Content-Type': response.headers.get('Content-Type') || 'application/json'
      },
      body: responseBody
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Proxy error', message: error.message })
    };
  }
};
```

#### 5.2: Pridėkite Netlify Functions Dependency

Pridėkite į `package.json`:
```json
{
  "dependencies": {
    "@netlify/functions": "^2.0.0"
  }
}
```

#### 5.3: Pakeiskite ColyseusService.ts

**SVARBU:** Colyseus client naudoja WebSocket, ne HTTP. Netlify Functions proxy veiks tik HTTP request'ams (matchmaking), bet WebSocket connection turės naudoti tiesiogiai iš browser.

**Problema:** Colyseus `joinOrCreate` daro HTTP request'ą į `/matchmake/joinOrCreate/pvp_room`, kurį galime proxy'ti per Netlify Functions. Bet WebSocket connection turės naudoti tiesiogiai.

**Sprendimas:** Naudokite Netlify Functions proxy tik matchmaking HTTP request'ams, o WebSocket connection naudokite tiesiogiai.

**Bet:** Colyseus client automatiškai daro HTTP request'us, todėl negalime lengvai proxy'ti.

**Alternatyvus sprendimas:** Naudokite custom matchmaking endpoint, kuris naudoja Netlify Functions proxy.

**Bet:** Tai reikalauja daug pakeitimų kode.

**Rekomendacija:** Pirmiausia išbandykite Step 1-4, o jei neveikia, kreipkitės į Colyseus Cloud support.

---

## 📋 Checklist

- [ ] Step 1: Colyseus Cloud CORS Settings UI patikrinti
- [ ] Step 2: Priversti Colyseus Cloud deploy'inti naują versiją
- [ ] Step 3: Patikrinkite Colyseus Cloud build process
- [ ] Step 4: Sukurkite naują Colyseus Cloud deployment location
- [ ] Step 5: Naudokite Netlify Functions proxy (paskutinis sprendimas)

---

## 💡 Svarbiausia

**Rekomendacija:**
1. **PIRMAS:** Patikrinkite Colyseus Cloud CORS Settings UI (Step 1)
2. **ANTRAS:** Priversti Colyseus Cloud deploy'inti naują versiją (Step 2)
3. **TRECIAS:** Sukurkite naują deployment location (Step 4)

**Jei vis tiek neveikia:**
- Kreipkitės į Colyseus Cloud support: support@colyseus.io
- Naudokite alternatyvų hosting (pvz: Railway, Render, Fly.io)

---

## 🔍 Troubleshooting

### Problema: Colyseus Cloud nerodo CORS Settings UI

**Sprendimas:**
- Patikrinkite, ar naudojate mokamą planą (jei reikia)
- Kreipkitės į Colyseus Cloud support

### Problema: Colyseus Cloud vis tiek naudoja seną versiją

**Sprendimas:**
- Sukurkite naują deployment location (Step 4)
- ARBA kreipkitės į Colyseus Cloud support

### Problema: Netlify Functions proxy neveikia

**Sprendimas:**
- Patikrinkite, ar Netlify Functions yra įjungtos
- Patikrinkite, ar `netlify/functions/colyseus-proxy.ts` yra teisingai sukurtas
- Patikrinkite Netlify build logs

---

## 📚 Dokumentacija

- [Colyseus Cloud Documentation](https://docs.colyseus.io/deployment/cloud)
- [Colyseus CORS Configuration](https://docs.colyseus.io/server/cors)
- [Netlify Functions Documentation](https://docs.netlify.com/functions/overview/)



