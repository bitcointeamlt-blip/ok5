# OMG01 Game - Pilnas Žaidimas

Pilnas žaidimo kodas su visomis funkcijomis ir Colyseus online integracija.

## 🚀 Greitas Paleidimas

### Lokalus Paleidimas

**Terminal 1 - Colyseus Serveris:**
```bash
cd colyseus-server
npm install
npm run build
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm install
npm run dev
```

Atidarykite: `http://localhost:7005`

---

## 🌐 Online Deployment

### Frontend (Netlify)

1. **Commit → Push** į GitHub
2. **Netlify Dashboard:**
   - Site settings → Environment variables
   - Pridėkite: `VITE_COLYSEUS_ENDPOINT` = jūsų serverio URL
3. **Redeploy**

### Backend (Render.com / Colyseus Cloud)

**Render.com:**
- Root Directory: `colyseus-server`
- Build Command: `npm install && npm run build`
- Start Command: `npm start`

**Colyseus Cloud:**
- Automatiškai deploy'ina iš GitHub

---

## 📁 Struktūra

```
omg01/
├── src/
│   ├── main.ts              # Pagrindinis žaidimo kodas (švarus)
│   └── services/
│       └── ColyseusService.ts
├── colyseus-server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── rooms/
│   │   │   └── GameRoom.ts
│   │   └── schema/
│   │       └── GameState.ts
│   └── package.json
├── package.json
├── vite.config.ts
├── tsconfig.json
└── netlify.toml
```

---

## ✅ Skirtumai nuo ok05

- ✅ **Švarus kodas** - nėra backup failų
- ✅ **Modulinė struktūra** - lengvai išplėčiama
- ✅ **Supaprastintas** - tik pagrindinės funkcijos
- ✅ **Paruoštas online** - Colyseus integracija

---

## 🔧 Konfigūracija

### Environment Variables

**Netlify:**
- `VITE_COLYSEUS_ENDPOINT` - Colyseus serverio URL (reikalingas!)

**Lokaliai:**
- Nereikia - naudoja `ws://localhost:2567` default

---

## 📝 Plėtra

Kodas sukurtas taip, kad būtų lengva pridėti:
- Naujas game modes
- Naujas features
- Naujas services

---

**Status:** ✅ Paruoštas naudoti!

