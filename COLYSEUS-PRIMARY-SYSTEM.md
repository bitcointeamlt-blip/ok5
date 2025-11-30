# ✅ Colyseus Primary System su Supabase Fallback

## 🎯 Kaip Veikia Sistema

### Pagrindinė Sistema: Colyseus (Primary)
- **Pirmiausia** bando prisijungti prie Colyseus serverio
- Jei Colyseus veikia → naudoja Colyseus kaip pagrindinę sistemą
- Colyseus yra **geresnė** sistema (mažesnis latency, geriau veikia)

### Atsarginė Sistema: Supabase (Fallback)
- Jei Colyseus **nepavyksta** prisijungti → automatiškai perjungia į Supabase
- Supabase naudojama kaip **backup** sistema
- Sistema **visada** veiks, net jei Colyseus nepasiekiamas

---

## 🔄 Kaip Veikia Fallback

### 1. Bando Prisijungti prie Colyseus
```typescript
try {
  // Connect to Colyseus
  const room = await colyseusService.joinOrCreateRoom(myAddress, handleOpponentInput);
  // ✅ Success - naudoja Colyseus
} catch (error) {
  // ❌ Failed - fallback to Supabase
}
```

### 2. Jei Colyseus Nepavyksta → Supabase
```typescript
catch (error) {
  // Automatiškai perjungia į Supabase
  await matchmakingService.enterLobby(myAddress, callback);
  // ✅ Naudoja Supabase kaip fallback
}
```

---

## 📋 Kas Naudojama Kada

### Colyseus Naudojamas:
- ✅ Jei `VITE_COLYSEUS_ENDPOINT` nustatytas IR serveris veikia
- ✅ Jei Colyseus prisijungia sėkmingai
- ✅ **Pagrindinė sistema** - visada bandoma pirmiausia

### Supabase Naudojamas:
- ✅ Jei Colyseus nepavyksta prisijungti
- ✅ Automatiškai kaip fallback sistema
- ✅ Visada veiks, net jei Colyseus nepasiekiamas

---

## 🔧 Konfigūracija

### Lokaliai (Development):
```env
# .env failas (optional)
VITE_COLYSEUS_ENDPOINT=ws://localhost:2567
```

**Jei nėra `VITE_COLYSEUS_ENDPOINT`:**
- Naudoja `ws://localhost:2567` (default)
- Jei nepavyksta → fallback į Supabase

### Production (Netlify):
```env
# Netlify Environment Variables
VITE_COLYSEUS_ENDPOINT=https://de-fra-xxxxx.colyseus.cloud
```

**Jei nėra `VITE_COLYSEUS_ENDPOINT`:**
- Naudoja `https://de-fra-f8820c12.colyseus.cloud` (default fallback)
- Jei nepavyksta → fallback į Supabase

---

## 🎮 Kaip Veikia Žaidimas

### Su Colyseus:
1. Prisijungia prie Colyseus room
2. Colyseus automatiškai suporuoja žaidėjus
3. Naudoja Colyseus WebSocket sinchronizaciją
4. **Geresnis performance** (mažesnis latency)

### Su Supabase (Fallback):
1. Prisijungia prie Supabase lobby
2. Supabase trigger'iai suporuoja žaidėjus
3. Naudoja Supabase Realtime sinchronizaciją
4. **Veikia**, bet gali būti šiek tiek lėčiau

---

## 📊 Log'ai

### Sėkmingas Colyseus Prisijungimas:
```
🔵 Attempting Colyseus connection first...
🔵 Connecting to Colyseus server...
✅ Connected to Colyseus server, joining room...
✅ Successfully joined Colyseus room: xxxxx
✅ Using Colyseus as primary PvP system
```

### Colyseus Failed → Supabase Fallback:
```
⚠️ Colyseus connection failed, falling back to Supabase
🔄 Falling back to Supabase matchmaking...
✅ Successfully entered Supabase lobby (fallback mode)
```

---

## ✅ Privalumai

### Colyseus (Primary):
- ✅ **Mažesnis latency** - geriau veikia real-time
- ✅ **Geresnis performance** - optimizuotas multiplayer
- ✅ **Automatinis matchmaking** - Colyseus tvarko viską
- ✅ **Geresnė sinchronizacija** - WebSocket protokolas

### Supabase (Fallback):
- ✅ **Visada veikia** - net jei Colyseus nepasiekiamas
- ✅ **Patikima sistema** - jau naudojama duomenų bazėje
- ✅ **Automatinis fallback** - nereikia rankinio perjungimo

---

## 🔍 Troubleshooting

### Problema: "Colyseus connection failed"
**Sprendimas:** Sistema automatiškai perjungia į Supabase. Patikrinkite:
- Ar Colyseus serveris veikia?
- Ar `VITE_COLYSEUS_ENDPOINT` teisingas?
- Ar yra CORS problemų?

### Problema: "Using Supabase fallback"
**Tai Normalus:** Jei Colyseus nepavyksta, sistema automatiškai naudoja Supabase. Žaidimas vis tiek veiks!

### Problema: Abi sistemos nepavyksta
**Sprendimas:** Patikrinkite:
- Ar Supabase credentials teisingi?
- Ar yra interneto ryšio?
- Ar yra firewall problemų?

---

## 📝 Išvada

**Sistema dabar veikia taip:**
1. ✅ **Pirmiausia** bando Colyseus (geriausia sistema)
2. ✅ **Jei nepavyksta** → automatiškai perjungia į Supabase
3. ✅ **Visada veiks** - turi dvi sistemas kaip backup

**Tai reiškia:**
- Colyseus yra **pagrindinė sistema** (geriausia)
- Supabase yra **atsarginė sistema** (fallback)
- **Visada** turėsite veikiančią PvP sistemą!


