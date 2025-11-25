# 🔧 Fix Server & CORS Issues

## ❌ Problema: Dvi Problemas

1. **Service Unavailable** - Serveris vis dar neveikia
2. **CORS Error** - Net jei serveris veiktų, CORS konfigūracija neteisinga

---

## ✅ Sprendimas

### Step 1: Pataisyti CORS Konfigūraciją

CORS konfigūracija pataisyta serverio kode:
- `origin: true` - leidžia visus origins
- `credentials: true` - leidžia credentials

### Step 2: Commit → Push → Deploy

1. **GitHub Desktop** → Commit → Push
2. **Colyseus Cloud** → Deployments → Deploy
3. Palaukite 2-5 min
4. Patikrinkite logs

---

## 🔍 Troubleshooting

### Problema: Serveris vis dar neveikia

**Patikrinkite**:
1. Colyseus Cloud → Endpoints → LOGS
2. Ar yra error'ų?
3. Ar serveris start'ina?

**Jei vis dar ERR_SERVER_ALREADY_LISTEN**:
- Patikrinkite, ar kodas buvo deploy'intas
- Patikrinkite build logs

### Problema: CORS vis dar neveikia

**Patikrinkite**:
1. Ar CORS konfigūracija deploy'intas?
2. Ar serveris veikia?
3. Browser console → Network tab → CORS headers

---

## 📋 Checklist

- [x] CORS konfigūracija pataisyta
- [ ] Commit → Push į GitHub
- [ ] Deployment padarytas
- [ ] Serveris veikia (`/health` endpoint)
- [ ] CORS veikia (browser console)

---

**Ar padarėte commit ir push? Ar deployment padarytas?**

