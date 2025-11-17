# 🔧 Reboot ir PM2 Pataisymas

## ✅ Kas Padaryta

### 1. Padidinti PM2 Timeout'ai

**Pakeista `colyseus-server/ecosystem.config.js`:**
- `kill_timeout: 30000` (buvo 20000) - 30 sekundžių laukti, kol senas procesas užsidarys
- `restart_delay: 20000` (buvo 15000) - 20 sekundžių laukti prieš restart'inti

**Kodėl:**
- Duoda daugiau laiko PM2 užsidaryti senam procesui
- Išvengia EADDRINUSE error'o

---

## 🎯 Kitas Žingsnis

### Step 1: Reboot Instance (Dabar)

1. **Colyseus Cloud** → **Endpoints** tab → **LOGS**
2. Spustelėkite **"REBOOT INSTANCE"** mygtuką
3. Palaukite 2-3 minučių
4. Patikrinkite logs - turėtų start'inti be EADDRINUSE

---

### Step 2: Commit → Push Naujausią Kodą

Po reboot, jei vis dar neveikia:

```bash
git add colyseus-server/ecosystem.config.js
git commit -m "Increase PM2 timeouts to prevent EADDRINUSE"
git push
```

**Palaukite**, kol Colyseus Cloud deploy'ins naują versiją.

---

## 📋 Po Reboot Patikrinimas

Po reboot, patikrinkite logs:
- ✅ Ar yra "Colyseus server is running on port 2567"?
- ✅ Ar NĖRA EADDRINUSE error'ų?
- ✅ Ar serveris veikia (`/health` endpoint)?

**Dabar spustelėkite "REBOOT INSTANCE" mygtuką!**



