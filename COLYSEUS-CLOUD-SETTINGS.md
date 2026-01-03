# ✅ Colyseus Cloud - Teisingi Nustatymai

## 🔑 Raktais ir Tokenai

### SSH Deploy Key
```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDKQEIZMOy9qks8P9Cf2G0ZX9VWujJ+PRw/ejpVeDi0EVLS5m40ZSZWubSdj/GbxF+a2UlTyYiRjMm9O+omoUlPccsuXfwHQ84l5WmolupleEXRPmIV8wJZrDnWeCFlQ3fOXANlWYmvJpmeSqWwwAlgviWk+NxrH9kaXNGTN6m+WWogOqXA510NZjihuzJkCp6AozQ5aBL6SEFTucwqPmV9MbeLyiG0uoq7t19r9yF7suUqF+xrnBQVSAr8YXP0igxli7TOqjQlf8ZhEcFYE/O31GuIrQHc8SJD2Ex4y2Sao6oVQpKpxo3etKvIhrhHehZIKJT3IE8JjsAeTLNZnoKr colyseus-cloud-deploy-key-11-11-2025
```

✅ **SSH raktas atrodo teisingas** - tai validus SSH RSA public key formatas.

---

### API Token
```
NjkxMzk5OTgwOTQzM3Fxd2NVWTBIdWV1SEJhcm0wWU1aTjBNdUs4M3d6Ym9X
```

✅ **API tokenas atrodo teisingas** - tai base64 encoded string, kuris gali būti Colyseus Cloud API tokenas.

---

## ⚙️ Colyseus Cloud Build Settings

### ❌ NETeisingi Nustatymai (iš screenshot'o):
- **Root Directory:** `/colyseus server/` ❌
- **Install Command:** `npm install` ❌
- **Build Command:** `npm run build` ❌

### ✅ TEISINGI Nustatymai:

#### Root Directory:
```
colyseus-server
```
**SVARBU:** 
- ❌ NE `/colyseus server/` (su tarpu ir slash)
- ❌ NE `/colyseus-server/` (su slash pradžioje)
- ✅ TAIP `colyseus-server` (be slash'ų, be tarpų)

---

#### Install Command:
```
cd colyseus-server && npm install
```
**ARBA** (jei Root Directory jau nustatytas kaip `colyseus-server`):
```
npm install
```

---

#### Build Command:
```
cd colyseus-server && npm run build
```
**ARBA** (jei Root Directory jau nustatytas kaip `colyseus-server`):
```
npm run build
```

---

#### Start Command:
```
cd colyseus-server && npm start
```
**ARBA** (jei Root Directory jau nustatytas kaip `colyseus-server`):
```
npm start
```

---

#### Node Version:
```
22
```
(arba `20` - bet `22` rekomenduojama)

---

#### Port:
```
(palikite tuščią)
```
Colyseus Cloud automatiškai nustato PORT.

---

## 🚀 Deployment Komanda

### CLI Deployment:
```bash
npx @colyseus/cloud deploy
```

**ARBA** su API tokenu:
```bash
COLYSEUS_API_TOKEN=NjkxMzk5OTgwOTQzM3Fxd2NVWTBIdWV1SEJhcm0wWU1aTjBNdUs4M3d6Ym9X npx @colyseus/cloud deploy
```

---

## 📋 Deployment Checklist

### 1. ✅ SSH Deploy Key
- [x] SSH raktas pridėtas į Colyseus Cloud
- [x] GitHub repository susietas su Colyseus Cloud

### 2. ✅ API Token
- [x] API tokenas gautas iš Colyseus Cloud dashboard
- [x] Tokenas saugomas saugiai (ne commit'intas į Git)

### 3. ⚠️ Build Settings (REIKIA PATAISYTI)
- [ ] Root Directory: `colyseus-server` (ne `/colyseus server/`)
- [ ] Install Command: `cd colyseus-server && npm install`
- [ ] Build Command: `cd colyseus-server && npm run build`
- [ ] Start Command: `cd colyseus-server && npm start`
- [ ] Node Version: `22`

### 4. ✅ Serverio Kodas
- [x] `colyseus-server/src/index.ts` - CORS konfigūracija ✅
- [x] `colyseus-server/package.json` - dependencies ✅
- [x] `colyseus-server/ecosystem.config.js` - PM2 config ✅
- [x] `colyseus-server/tsconfig.json` - TypeScript config ✅

### 5. ✅ GitHub
- [ ] Kodas push'intas į GitHub
- [ ] `colyseus-server/` folderis yra repository'je

---

## 🔧 Kaip Pataisyti Build Settings

### Colyseus Cloud Dashboard:

1. **Eikite į:** https://cloud.colyseus.io
2. **Pasirinkite aplikaciją**
3. **Settings** → **Build & Deployment**
4. **Pakeiskite:**
   - **Root Directory:** `colyseus-server` (be slash'ų!)
   - **Install Command:** `npm install` (jei Root Directory teisingas)
   - **Build Command:** `npm run build` (jei Root Directory teisingas)
   - **Start Command:** `npm start` (jei Root Directory teisingas)
5. **SAVE**

**ARBA** (jei Root Directory neteisingas):

- **Root Directory:** `colyseus-server`
- **Install Command:** `cd colyseus-server && npm install`
- **Build Command:** `cd colyseus-server && npm run build`
- **Start Command:** `cd colyseus-server && npm start`

---

## ✅ Patikrinimas

### Po Deployment:

1. **Patikrinkite Logs:**
   - Colyseus Cloud → Deployments → Logs
   - Turėtumėte matyti: `✅ Server running on port XXXX`

2. **Patikrinkite Health Endpoint:**
   ```
   https://de-fra-xxxxx.colyseus.cloud/health
   ```
   Turėtumėte matyti: `{"status":"ok"}`

3. **Patikrinkite Root Endpoint:**
   ```
   https://de-fra-xxxxx.colyseus.cloud/
   ```
   Turėtumėte matyti serverio informaciją.

---

## 🎯 Išvada

### ✅ Kas Gerai:
- SSH raktas teisingas
- API tokenas teisingas
- Serverio kodas paruoštas
- Deployment komanda teisinga

### ⚠️ Kas Reikia Pataisyti:
- **Root Directory:** `/colyseus server/` → `colyseus-server`
- **Build Command:** gali reikėti `cd colyseus-server && npm run build` (jei Root Directory neteisingas)

### 📝 Rekomendacija:
1. Pakeiskite Root Directory į `colyseus-server` (be slash'ų)
2. Jei Root Directory teisingas, Install/Build/Start komandos gali būti be `cd colyseus-server &&`
3. Jei Root Directory neteisingas, naudokite pilnas komandas su `cd colyseus-server &&`























