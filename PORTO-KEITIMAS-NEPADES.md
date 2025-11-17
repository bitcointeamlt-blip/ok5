# ❌ Porto Keitimas NEPADĖS - Kodėl?

## ❌ Atsakymas: NEPADĖS

**Porto keitimas NEPADĖS**, nes:

### 1. Colyseus Cloud Nustato PORT

Colyseus Cloud nustato `PORT` per environment variable ir tikisi, kad serveris veiks ant to porto.

**Jei serveris start'ina ant kito porto:**
- ❌ Colyseus Cloud negalės rasti serverio
- ❌ Routing neveiks teisingai
- ❌ Frontend negalės prisijungti
- ❌ Endpoint'as neveiks

### 2. Colyseus Cloud Routing

Colyseus Cloud naudoja reverse proxy, kuris route'ina traffic į serverį ant PORT, kurį nustato Colyseus Cloud.

**Jei serveris veikia ant kito porto:**
- Reverse proxy bando pasiekti `localhost:PORT` (pvz: `localhost:2567`)
- Bet serveris veikia ant `localhost:2568`
- Reverse proxy negali rasti serverio
- **Viskas neveikia!**

---

## ✅ Teisingas Sprendimas

**NEGALIME keisti porto!** Reikia:

1. **Išspręsti PM2 konfigūraciją:**
   - `instances: 1` - tik vienas instance'as
   - `unique: true` - garantuoja vieną instance'ą
   - `kill_timeout: 20000` - duoda laiko užsidaryti senam procesui
   - `restart_delay: 15000` - laukia prieš restart'inti

2. **Leisti PM2 restart'inti su delay:**
   - Jei portas užimtas - exit su `process.exit(1)`
   - PM2 restart'ins su `restart_delay: 15000`
   - Po 15 sekundžių portas turėtų būti laisvas

---

## 📋 Kas Dabar Padaryta

### `colyseus-server/src/index.ts`:
```typescript
// CRITICAL: Must use PORT from environment - Colyseus Cloud routing depends on it!
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 2567;

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    console.error('💡 CRITICAL: Cannot change port - Colyseus Cloud expects server on PORT!');
    // Exit - PM2 restart'ins su delay
    setTimeout(() => {
      process.exit(1);
    }, 5000);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
```

**Kas svarbu:**
- ✅ Naudoja PORT iš environment (Colyseus Cloud nustato)
- ✅ NEGALIMA keisti porto
- ✅ Jei užimtas - exit ir leisti PM2 restart'inti

---

## 💡 Kodėl Tai Turėtų Veikti

1. **PM2 valdo retry** - su `restart_delay: 15000` ir `kill_timeout: 20000`
2. **Teisingas PORT** - Colyseus Cloud routing veiks
3. **Nėra porto keitimo** - viskas veiks teisingai

---

## ✅ Galutinė Išvada

**Porto keitimas NEPADĖS** - reikia išspręsti PM2 konfigūraciją!

**Dabar kodas:**
- ✅ Naudoja PORT iš environment
- ✅ NEGALIMA keisti porto
- ✅ PM2 valdo retry su delay

**Kodas paruoštas commit'ui!**



