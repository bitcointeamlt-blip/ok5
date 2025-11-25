# 🔍 Po Root Directory Pakeitimo

## ✅ Status: Reboot Padarytas

Po reboot:
- ✅ PM2 daemon start'avo (18:28:32)
- ✅ @colyseus/tools agent veikia
- ❌ **Vis dar NĖRA** serverio start'o pranešimo
- ❌ **Vis dar NĖRA** "Colyseus server is running on port XXXX"

**Tai reiškia, kad serveris vis dar negali start'inti!**

---

## 🔍 Patikrinkite: Ar Root Directory Pakeistas?

### Step 1: Patikrinkite Build Settings

1. **Colyseus Cloud** → Settings → Build & Deployment
2. Patikrinkite **Root Directory**:
   - Turėtų būti: `colyseus-server`
   - **NE** `/`

**Jei vis dar `/`**:
- Pakeiskite į `colyseus-server`
- **SAVE**

**Jei jau `colyseus-server`**:
- Problema kitur
- Patikrinkite Start Command

---

## ✅ Jei Root Directory Jau Pakeistas

### Step 1: Patikrinkite Start Command

1. **Colyseus Cloud** → Settings → Build & Deployment
2. Patikrinkite **Start Command**:
   - Jei Root Directory: `colyseus-server` → Start Command: `npm start`
   - Jei Root Directory: `/` → Start Command: `cd colyseus-server && npm start`

### Step 2: Redeploy

Po Root Directory pakeitimo:

1. **Colyseus Cloud** → Deployments
2. Spustelėkite **"Deploy"** arba **"Redeploy"**
3. Palaukite 2-5 min
4. Patikrinkite logs

---

## 🔍 Troubleshooting

### Problema: Root Directory Pakeistas, Bet Serveris Vis Dar Neveikia

**Patikrinkite**:
1. Ar **SAVE** padarytas po pakeitimo?
2. Ar **deployment padarytas** po pakeitimo?
3. Ar **Start Command** teisingas?

### Problema: Serveris Start'ina, Bet Iškart Crash'ina

**Patikrinkite**:
1. Application logs (ne tik PM2)
2. Error logs
3. Ar serveris veikia lokaliai?

---

## 💡 Rekomendacija

**Pirmiausia patikrinkite**:
1. Ar Root Directory pakeistas į `colyseus-server`?
2. Ar SAVE padarytas?
3. Ar deployment padarytas po pakeitimo?

**Jei vis dar neveikia**:
- Patikrinkite Start Command
- Patikrinkite application logs
- Testuokite lokaliai

---

## 📋 Checklist

- [ ] Root Directory: `/` → `colyseus-server`
- [ ] SAVE padarytas
- [ ] Deployment padarytas po pakeitimo
- [ ] Start Command teisingas
- [ ] Serveris veikia lokaliai?
- [ ] Application logs patikrinti

**Ar Root Directory pakeistas ir SAVE padarytas?**

