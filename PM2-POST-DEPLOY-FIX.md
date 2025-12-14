# 🔧 PM2 Post-Deploy Repeated Messages - Fix

## 📊 Problema

Matau, kad PM2 logs rodo daug kartojamų pranešimų:
```
PM2 post-deploy agent is up and running...
Received 'post-deploy' action!
```

**SVARBU:** Serveris veikia gerai! Matau:
- ✅ Rooms kuriami sėkmingai
- ✅ Players prisijungia
- ✅ CORS veikia (matau `[CORS] Matchmaking request from origin`)
- ✅ GameState inicializuojasi

Bet daug kartojamų post-deploy pranešimų gali reikšti:
- Deployment loop (deployment trigger'iai trigger'ina vienas kitą)
- Multiple deployment triggers (GitHub webhooks, auto-deploy, etc.)
- Watch mechanism'as, kuris detektuoja pakeitimus

---

## ✅ Sprendimas

### Option 1: Patikrinkite Colyseus Cloud Auto-Deploy Settings

1. **Eikite į:** https://cloud.colyseus.io
2. **Pasirinkite aplikaciją**
3. **Settings** → **Build & Deployment**
4. **Patikrinkite:**
   - Ar yra **"Auto-deploy on push"** arba **"GitHub webhook"**?
   - Ar yra **multiple deployment triggers**?

**Jei yra auto-deploy:**
- Galite **išjungti** auto-deploy ir deploy'inti rankiniu būdu
- ARBA palikti, jei serveris veikia gerai (pranešimai yra tik "noise")

---

### Option 2: Patikrinkite GitHub Webhooks

1. **GitHub Repository** → **Settings** → **Webhooks**
2. **Patikrinkite:**
   - Ar yra webhook'ų į Colyseus Cloud?
   - Ar yra **multiple webhooks** su tuo pačiu trigger'iu?

**Jei yra multiple webhooks:**
- Pašalinkite duplicate webhooks
- Palikite tik vieną webhook'ą

---

### Option 3: Ignoruokite (Jei Serveris Veikia)

**Jei serveris veikia gerai:**
- ✅ Rooms kuriami
- ✅ Players prisijungia
- ✅ CORS veikia
- ✅ Nėra error'ų

**Tada pranešimai yra tik "noise"** - galite juos ignoruoti.

PM2 post-deploy agent tiesiog log'ina kiekvieną deployment'ą, bet tai neturėtų įtakoti serverio veikimo.

---

## 🔍 Troubleshooting

### Problema: Serveris Restart'uojasi Per Dažnai

**Sprendimas:**
1. Patikrinkite `ecosystem.config.js`:
   ```javascript
   watch: false  // Turėtų būti false production'e
   ```

2. Patikrinkite Colyseus Cloud logs:
   - Ar yra error'ų, kurie trigger'ina restart'us?
   - Ar yra memory leaks?

---

### Problema: Deployment Loop

**Symptomai:**
- Post-deploy pranešimai be sustojimo
- Serveris restart'uojasi kas kelias sekundes
- Logs užpildyti post-deploy pranešimais

**Sprendimas:**
1. **Išjunkite auto-deploy** Colyseus Cloud
2. **Patikrinkite GitHub webhooks** - pašalinkite duplicate'us
3. **Deploy'inti rankiniu būdu** ir stebėti, ar pranešimai sustoja

---

## 📋 Checklist

- [ ] Patikrinta Colyseus Cloud auto-deploy settings
- [ ] Patikrinti GitHub webhooks (nėra duplicate'ų)
- [ ] Patikrinta `ecosystem.config.js` (`watch: false`)
- [ ] Serveris veikia gerai (rooms kuriami, players prisijungia)
- [ ] Nėra error'ų logs'uose

---

## ✅ Dabartinė Situacija

**Pagal logs:**
- ✅ Serveris veikia gerai
- ✅ Rooms kuriami sėkmingai
- ✅ CORS veikia
- ⚠️ Daug post-deploy pranešimų (bet tai neturėtų įtakoti veikimo)

**Rekomendacija:**
- Jei serveris veikia gerai - galite ignoruoti pranešimus
- Jei norite sumažinti "noise" - patikrinkite auto-deploy settings ir webhooks






