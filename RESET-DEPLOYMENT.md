# 🔄 Reset Deployment - Ištrinti ir Sukurti Iš Naujo

## ❌ Problema: Serveris Vis Dar "Deploying..."

Matau, kad:
- ✅ Latest deployment: "Deployed" (94ba965 gg2)
- ❌ Instances: vis dar "Deploying..." (jau >20 valandų)
- ❌ Serveris neveikia

**Tai reiškia, kad deployment sėkmingas, bet serveris negali start'inti.**

---

## ✅ Sprendimas: Reset Deployment Location

### Option 1: Patikrinti Logs Pirmiausia (Rekomenduojama)

Prieš ištrinant, patikrinkite logs:

1. **Colyseus Cloud** → Deployments
2. Spustelėkite **"LOGS"** mygtuką
3. Patikrinkite, kokios klaidos

**Jei logs rodo klaidą** → pataisykite ir redeploy
**Jei logs nerodo klaidos** → ištrinkite deployment location

---

### Option 2: Ištrinti Deployment Location

#### Step 1: Ištrinkite Esamą Deployment Location

1. **Colyseus Cloud** → Endpoints tab
2. Raskite **"Europe (Germany - Frankfurt)"** sekciją
3. Spustelėkite **"DELETE"** arba **"REMOVE"** mygtuką (jei yra)
4. ARBA eikite į **Settings** → **Deployment Locations** → Delete

**SVARBU**: Tai ištrins deployment location, bet ne repository arba kodą!

#### Step 2: Sukurkite Naują Deployment Location

1. **Colyseus Cloud** → Endpoints tab
2. Spustelėkite **"+ ADD DEPLOYMENT LOCATION"** mygtuką
3. Pasirinkite region (pvz: "Europe - Germany - Frankfurt")
4. Patvirtinkite

#### Step 3: Deploy Iš Naujo

1. **Colyseus Cloud** → Deployments
2. Spustelėkite **"Deploy"** arba **"Redeploy"**
3. Palaukite 2-5 min
4. Deployment turėtų sėkmingai baigtis!

---

## 🔍 Troubleshooting

### Problema: Negaliu Ištrinti Deployment Location

**Sprendimas**:
- Patikrinkite, ar turite admin teises
- Patikrinkite Settings → Deployment Locations
- ARBA susisiekite su Colyseus Cloud support

### Problema: Po Ištrinimo Vis Dar Neveikia

**Sprendimas**:
1. Patikrinkite build settings
2. Patikrinkite serverio kodą
3. Patikrinkite logs

---

## 💡 Alternatyvus Sprendimas: Patikrinti Serverio Kodą

Prieš ištrinant, patikrinkite:

1. **Ar serveris tikrai start'ina?**
   - Patikrinkite `colyseus-server/src/index.ts`
   - Patikrinkite, ar `gameServer.listen()` teisingas

2. **Ar build settings teisingi?**
   - Root Directory: `colyseus-server`
   - Start Command: `npm start`

3. **Ar serveris veikia lokaliai?**
   ```bash
   cd colyseus-server
   npm run build
   npm start
   ```

---

## 📋 Checklist

- [ ] Logs patikrinti (pirmiausia!)
- [ ] Deployment location ištrinti
- [ ] Naujas deployment location sukurti
- [ ] Deploy iš naujo
- [ ] Serveris veikia

---

## 💡 Rekomendacija

**Pirmiausia patikrinkite LOGS** - ten turėtų būti aiškesnė klaidos priežastis!

Jei logs nerodo klaidos → ištrinkite deployment location ir sukurkite naują.

**Ar patikrinote Logs sekciją?**

