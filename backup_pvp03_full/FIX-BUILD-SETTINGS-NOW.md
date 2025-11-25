# 🔧 Fix Build Settings - DARBAI!

## ❌ Problema: Root Directory Neteisingas!

Matau, kad Build Settings:
- ❌ **Root Directory**: `/` (neturėtų būti root!)
- ✅ Install Command: `npm install`
- ✅ Build Command: `npm run build`

**Problema**: Root Directory yra `/` vietoj `colyseus-server`!

Tai reiškia, kad:
- Komandos vykdomos root folderyje
- `package.json` ir `build/` folderis yra `colyseus-server/` folderyje
- Serveris negali start'inti, nes negali rasti failų!

---

## ✅ Sprendimas: Pakeiskite Root Directory

### Step 1: Pakeiskite Root Directory

1. **Root Directory** laukelyje:
   - Ištrinkite `/`
   - Įdėkite: `colyseus-server`

2. **Install Command** palikite:
   - `npm install`

3. **Build Command** palikite:
   - `npm run build`

4. Spustelėkite **"SAVE"** mygtuką (apačioje, mėlynas)

---

## ✅ Po Pakeitimo

Po to, kai pakeisite Root Directory į `colyseus-server`:

1. **Colyseus Cloud** automatiškai redeploy'ins
2. ARBA eikite į **Deployments** tab → **Deploy**
3. Palaukite 2-5 min
4. Serveris turėtų start'inti!

---

## 📋 Checklist

- [ ] Root Directory: `/` → `colyseus-server`
- [ ] Install Command: `npm install` (palikite)
- [ ] Build Command: `npm run build` (palikite)
- [ ] SAVE
- [ ] Deploy (jei automatiškai nepadaryta)
- [ ] Patikrinkite logs
- [ ] Serveris veikia!

---

## 💡 Kodėl Tai Svarbu?

**Jei Root Directory yra `/`**:
- Komandos vykdomos root folderyje
- `npm install` ir `npm run build` vykdomi root folderyje
- Bet `package.json` yra `colyseus-server/` folderyje!
- Serveris negali start'inti, nes negali rasti failų!

**Jei Root Directory yra `colyseus-server`**:
- Komandos vykdomos `colyseus-server/` folderyje
- `npm install` ir `npm run build` vykdomi teisingame folderyje
- Serveris gali start'inti!

---

## 🚀 Po Pakeitimo

Po pakeitimo:
1. Serveris turėtų start'inti
2. Logs turėtų rodyti: `✅ Colyseus server is running on port XXXX`
3. Instances turėtų pasikeisti į "Running"
4. Endpoint turėtų veikti!

**Pakeiskite Root Directory į `colyseus-server` ir SAVE!**

