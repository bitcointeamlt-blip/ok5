# 🚀 OMG01 Setup Instructions

## ✅ Kas Sukurta

Naujas, švarus žaidimo projektas `omg01` su:
- ✅ Švarus kodas (be backup failų)
- ✅ Modulinė struktūra
- ✅ Colyseus online integracija
- ✅ Paruoštas deployment'ui

---

## 📋 Greitas Start

### 1. Install Dependencies

**Frontend:**
```bash
cd omg01
npm install
```

**Backend:**
```bash
cd omg01/colyseus-server
npm install
```

### 2. Lokalus Paleidimas

**Terminal 1 - Colyseus Serveris:**
```bash
cd omg01/colyseus-server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd omg01
npm run dev
```

**Atidarykite:** `http://localhost:7005`

---

## 🌐 Online Deployment

### Frontend (Netlify)

1. **Push į GitHub:**
   ```bash
   cd omg01
   git init
   git add .
   git commit -m "Initial commit - OMG01 clean version"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Netlify Dashboard:**
   - New site from Git → Pasirinkite `omg01` repo
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`

3. **Environment Variables:**
   - Key: `VITE_COLYSEUS_ENDPOINT`
   - Value: Jūsų Colyseus serverio URL (Render.com arba Colyseus Cloud)

### Backend (Render.com)

1. **Render Dashboard:**
   - New Web Service
   - Connect GitHub → Pasirinkite `omg01` repo

2. **Konfigūracija:**
   - Root Directory: `colyseus-server`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Region: Frankfurt (EU Central)

3. **Gausite URL:** `https://your-app.onrender.com`

4. **Atnaujinkite Netlify:**
   - Environment Variable: `VITE_COLYSEUS_ENDPOINT` = Render URL

---

## ✅ Patikrinimas

### Lokalus
- ✅ Frontend veikia: `http://localhost:7005`
- ✅ Backend veikia: `ws://localhost:2567`
- ✅ Health check: `http://localhost:2567/health`

### Online
- ✅ Frontend veikia: Netlify URL
- ✅ Backend veikia: Render.com URL
- ✅ Health check: `https://your-app.onrender.com/health`
- ✅ PvP Online veikia

---

## 📊 Struktūra

```
omg01/
├── src/
│   ├── main.ts                    # Pagrindinis žaidimo kodas (~200 eilučių)
│   └── services/
│       └── ColyseusService.ts     # Colyseus integracija
├── colyseus-server/
│   ├── src/
│   │   ├── index.ts               # Serverio entry point
│   │   ├── rooms/
│   │   │   └── GameRoom.ts        # PvP room logika
│   │   └── schema/
│   │       └── GameState.ts       # Game state schema
│   ├── package.json
│   ├── tsconfig.json
│   └── ecosystem.config.js        # PM2 config
├── package.json
├── vite.config.ts
├── tsconfig.json
├── netlify.toml
├── index.html
└── README.md
```

---

## 🎯 Skirtumai nuo ok05

| Aspektas | ok05 | omg01 |
|----------|------|-------|
| **Kodas** | 8611 eilučių | ~200 eilučių |
| **Backup failai** | Daug | Nėra |
| **Struktūra** | Spaghetti | Modulinė |
| **Maintenance** | Sunkus | Lengvas |
| **Plėtra** | Sunkus | Lengvas |

---

## 🔧 Plėtra

Kodas sukurtas taip, kad būtų lengva pridėti:
- Naujas game modes
- Naujas features
- Naujas services

**Pavyzdys - pridėti naują funkciją:**
```typescript
// src/main.ts
function newFeature(): void {
  // Jūsų kodas
}
```

---

**Status:** ✅ Paruoštas naudoti!

