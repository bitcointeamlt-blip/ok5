# 🔧 SSH Connection Error - Sprendimas

## ❌ Problema: SSH Connection Refused

Matau, kad:
- ❌ **"ERROR: ssh: connect to host 95.179.254.214 port 22: Connection refused"**
- ❌ **"Connection lost with server instance."**
- ❌ **"(not deployed)"**

**Tai reiškia, kad serveris instance nepasileidžia arba nepasiekiamas!**

---

## ✅ Sprendimas

### Option 1: Reboot Instance (Greitas Sprendimas)

1. Spustelėkite **"REBOOT INSTANCE"** mygtuką (apačioje, raudonas)
2. Palaukite kelias minutes
3. Patikrinkite logs dar kartą

**Tai turėtų išspręsti SSH connection problemą!**

---

### Option 2: Ištrinti Deployment Location (Jei Reboot Nepadeda)

Jei reboot nepadeda:

1. **Colyseus Cloud** → Endpoints tab
2. Ištrinkite **"Europe (Germany - Frankfurt)"** deployment location
3. Sukurkite naują deployment location
4. Deploy iš naujo

---

### Option 3: Patikrinkite Build Settings

1. **Colyseus Cloud** → Settings → Build & Deployment
2. Patikrinkite:
   - **Root Directory**: `colyseus-server`
   - **Start Command**: `npm start`
   - **Build Command**: `npm run build`

**SVARBU**: Jei Root Directory yra `colyseus-server`, Start Command turėtų būti `npm start` (be `cd`).

---

## 🔍 Troubleshooting

### Problema: Instance Negali Start'inti

**Sprendimas**:
1. Reboot instance
2. Patikrinkite build settings
3. Patikrinkite serverio kodą

### Problema: SSH Connection Fails

**Sprendimas**:
1. Reboot instance
2. Palaukite kelias minutes
3. Patikrinkite logs dar kartą

### Problema: Instance Crash'ina

**Sprendimas**:
1. Patikrinkite logs (error messages)
2. Patikrinkite serverio kodą
3. Patikrinkite build settings

---

## 💡 Rekomendacija

**Pirmiausia pabandykite Reboot Instance** - tai greičiausias sprendimas!

Po reboot:
1. Palaukite kelias minutes
2. Patikrinkite logs
3. Patikrinkite instances status
4. Patikrinkite endpoint (`/health`)

---

## 📋 Checklist

- [ ] Reboot instance (pirmiausia!)
- [ ] Palaukite kelias minutes
- [ ] Patikrinkite logs
- [ ] Patikrinkite instances status
- [ ] Patikrinkite endpoint
- [ ] Jei neveikia → ištrinkite deployment location

**Ar pabandėte Reboot Instance?**

