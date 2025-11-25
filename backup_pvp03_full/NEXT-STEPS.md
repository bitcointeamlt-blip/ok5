# 🎯 Ką Daryti Dabar - Step by Step

## ✅ Kas Jau Padaryta

- ✅ Colyseus server sukurtas ir kompiliuojasi
- ✅ Frontend integracija paruošta
- ✅ .env failas atnaujintas su Colyseus endpoint
- ✅ Dependencies įdiegti

## 🚀 Kitas Žingsnis - Deployment

### Option 1: Testuoti Lokaliai (Rekomenduojama Pirmiausia)

#### 1. Paleiskite Colyseus Server

```bash
cd colyseus-server
npm run dev
```

Turėtumėte matyti: `✅ Colyseus server running on port 2567`

#### 2. Paleiskite Frontend (Kitas Terminal)

```bash
npm run dev
```

Frontend bus: `http://localhost:4000`

#### 3. Testuokite

1. Atidarykite `http://localhost:4000`
2. Prisijunkite su Ronin Wallet
3. Pasirinkite "PvP Online"
4. Turėtumėte prisijungti prie Colyseus room

**Jei veikia lokaliai** → eikite į Option 2 (Deploy)

---

### Option 2: Deploy į Colyseus Cloud

#### Step 1: Push į GitHub

```bash
# Patikrinkite, ar viskas commit'inta
git status

# Jei yra necommit'intų failų
git add .
git commit -m "Add Colyseus server integration"
git push
```

**SVARBU**: Patikrinkite, kad `colyseus-server/` folderis yra GitHub'e!

#### Step 2: Colyseus Cloud Deployment

1. **Eikite į**: https://cloud.colyseus.io
2. **Prisijunkite** prie savo account'o
3. **Pasirinkite** "dot game" aplikaciją
4. **Spustelėkite** "LINK WITH GITHUB"
5. **Pasirinkite** savo repository
6. **Nustatykite Build Settings**:

   ```
   Build Command: cd colyseus-server && npm install && npm run build
   Start Command: cd colyseus-server && npm start
   Root Directory: colyseus-server
   Node Version: 22
   ```

7. **Spustelėkite** "Deploy" arba "Redeploy"

#### Step 3: Gaukite Naują Endpoint

Po deployment, Colyseus Cloud duos naują endpoint:
- Formatas: `https://de-fra-xxxxx.colyseus.cloud`
- Kopijuokite šį endpoint

#### Step 4: Update Frontend Environment

**Jei naudojate Netlify**:
1. Netlify Dashboard → Site settings → Environment variables
2. Pridėkite arba atnaujinkite:
   - Key: `VITE_COLYSEUS_ENDPOINT`
   - Value: jūsų naujas endpoint (pvz: `https://de-fra-xxxxx.colyseus.cloud`)
3. Redeploy site

**Jei naudojate Cloudflare Pages**:
1. Cloudflare Dashboard → Pages → Settings → Environment variables
2. Pridėkite arba atnaujinkite:
   - Key: `VITE_COLYSEUS_ENDPOINT`
   - Value: jūsų naujas endpoint
3. Redeploy

**Lokaliai**:
Atnaujinkite `.env` failą:
```
VITE_COLYSEUS_ENDPOINT=https://de-fra-xxxxx.colyseus.cloud
```

#### Step 5: Testuokite Production

1. Atidarykite deployed frontend
2. Prisijunkite su Ronin Wallet
3. Pasirinkite "PvP Online"
4. Turėtumėte prisijungti prie Colyseus room

---

## 🔍 Troubleshooting

### Server neveikia Colyseus Cloud'e
- Patikrinkite **Logs** Colyseus Cloud dashboard
- Patikrinkite, ar build command teisingas
- Patikrinkite, ar `colyseus-server/` folderis yra GitHub'e

### Frontend negali prisijungti
- Patikrinkite `VITE_COLYSEUS_ENDPOINT` environment variable
- Patikrinkite browser console (F12) errors
- Patikrinkite, ar endpoint formatas teisingas (`https://`)

### Matchmaking neveikia
- Colyseus automatiškai match'ina žaidėjus
- Jei neveikia, patikrinkite server logs

---

## 📋 Quick Checklist

- [ ] Colyseus server kompiliuojasi (`npm run build`)
- [ ] Testuota lokaliai (jei norite)
- [ ] Kodas push'intas į GitHub
- [ ] Colyseus Cloud susietas su GitHub
- [ ] Build settings nustatyti
- [ ] Deployment sėkmingas
- [ ] Endpoint gautas
- [ ] Frontend environment variable atnaujintas
- [ ] Frontend redeploy'intas
- [ ] Testuota production

---

## 💡 Rekomendacija

**Pradėkite nuo lokalinio testavimo** - tai greičiau ir lengviau debug'inti!

Jei lokaliai veikia → deploy į Colyseus Cloud
Jei lokaliai neveikia → patikrinkite klaidas prieš deploy

