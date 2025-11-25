# 🔍 Colyseus Cloud Logs Patikrinimas

## ❌ Problema

Colyseus Cloud logs rodo:
- PM2 daemon veikia ✅
- `@colyseus/tools` modulis paleistas ✅
- `post-deploy` action'ai vyksta ✅
- **Bet NERANDU mano debug log'ų** (`🔵 Colyseus CORS headers requested`) ❌

---

## 🔍 Kaip Patikrinti

### Step 1: Išjungti "Show only errors" Toggle

**Problema:** Jei "Show only errors" toggle yra įjungtas, mano debug log'ai nebus matomi, nes jie nėra error'ai.

**Kaip padaryti:**
1. Colyseus Cloud Dashboard → Logs
2. Išjungti "Show only errors" toggle (OFF)
3. Dabar matysite VISUS log'us, ne tik error'us

---

### Step 2: Patikrinti APPLICATION Logs (ne PM2 logs)

**Problema:** PM2 logs rodo tik PM2 daemon informaciją, ne application logs.

**Kaip patikrinti:**
1. Colyseus Cloud Dashboard → Logs
2. Patikrinkite, ar yra **application logs** (ne PM2 logs)
3. Ieškokite:
   - `✅ Server running on port`
   - `🔵 Colyseus CORS headers requested for origin:`
   - `🔵 Colyseus CORS headers:`
   - `GameRoom created:`

**Jei nerandate:**
- Serveris gali neveikti
- ARBA serveris nebuvo deploy'intas su mano pakeitimais

---

### Step 3: Patikrinti Deployments Tab

**Problema:** Serveris gali naudoti seną versiją be mano pakeitimų.

**Kaip patikrinti:**
1. Colyseus Cloud Dashboard → **Deployments** tab
2. Patikrinkite paskutinį deployment:
   - Kada buvo deploy'intas?
   - Ar turi mano pakeitimus?
   - Ar deployment sėkmingas?

**Jei paskutinis deployment yra senas:**
- Reikia deploy'inti serverį iš naujo
- Commit → Push į GitHub
- Colyseus Cloud deploy'ins automatiškai

---

### Step 4: Patikrinti Ar Serveris Paleistas

**Problema:** Serveris gali neveikti.

**Kaip patikrinti:**
1. Colyseus Cloud Dashboard → **Stats** tab
2. Patikrinkite:
   - Ar serveris veikia?
   - Ar yra connections?
   - Ar yra errors?

**Jei serveris neveikia:**
- Spustelėkite **"REBOOT INSTANCE"** button
- ARBA patikrinkite, ar yra error'ų logs

---

## 📋 Checklist

- [ ] "Show only errors" toggle išjungtas?
- [ ] APPLICATION logs patikrinti (ne PM2 logs)?
- [ ] Ieškota: `Server running on port`?
- [ ] Ieškota: `Colyseus CORS headers requested`?
- [ ] Deployments tab patikrintas?
- [ ] Paskutinis deployment turi mano pakeitimus?
- [ ] Serveris veikia (Stats tab)?

---

## 🎯 Rekomendacija

**Pirmiausia:**
1. Išjungti "Show only errors" toggle
2. Patikrinti APPLICATION logs
3. Ieškoti mano debug log'ų

**Jei nerandate:**
1. Patikrinti Deployments tab
2. Deploy'inti serverį iš naujo (jei reikia)
3. Patikrinti Stats tab, ar serveris veikia

---

## ⚠️ Svarbu

**Mano debug log'ai:**
- `🔵 Colyseus CORS headers requested for origin:`
- `🔵 Colyseus CORS headers:`

**Jei šie log'ai nėra matomi:**
- Serveris nebuvo deploy'intas su mano pakeitimais
- ARBA serveris neveikia
- ARBA "Show only errors" toggle yra įjungtas

