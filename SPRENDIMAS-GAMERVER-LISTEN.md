# 🔧 Sprendimas - gameServer.listen() Vietoj server.listen()

## ❌ Problema

Dabartinėje versijoje naudojame `server.listen()`, bet dokumentacijoje (`FIX-COLYSEUS-LISTEN-FINAL.md`) sako, kad reikia naudoti `gameServer.listen()`.

## ✅ Sprendimas

### Kas Pakeista:

**Prieš:**
```typescript
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
```

**Po:**
```typescript
gameServer.listen(PORT)
  .then(() => {
    console.log(`✅ Colyseus server is running on port ${PORT}`);
  })
  .catch((error) => {
    console.error('❌ Failed to start Colyseus server:', error);
    // Error handling
  });
```

### Kodėl Tai Veikia:

1. **Colyseus valdo HTTP serverį:** Kai naudojame `WebSocketTransport({ server: server })`, Colyseus turėtų valdyti HTTP serverį per `gameServer.listen()`
2. **Išvengia ERR_SERVER_ALREADY_LISTEN:** `gameServer.listen()` yra teisingas būdas, kai naudojame `WebSocketTransport({ server: server })`
3. **Port check prieš listen:** Vis dar tikriname portą prieš start'inti

---

## 📋 Pakeisti Failai

1. `colyseus-server/src/index.ts`
   - Pakeista `server.listen()` → `gameServer.listen()`
   - Pašalintas `server.on('error')` handler'is
   - Pridėtas `.catch()` error handling

---

## 🚀 Commit ir Push

```bash
git add colyseus-server/src/index.ts
git commit -m "Fix server listen - use gameServer.listen() instead of server.listen()"
git push origin main
```

---

## 💡 Kodėl Tai Turėtų Veikti

Pagal dokumentaciją `FIX-COLYSEUS-LISTEN-FINAL.md`:
- Kai naudojame `WebSocketTransport({ server: server })`, reikia naudoti `gameServer.listen()`
- Colyseus automatiškai valdo HTTP serverį
- Tai išvengia `ERR_SERVER_ALREADY_LISTEN` ir `EADDRINUSE` error'ų

---

## 🔍 Patikrinimas

Po deployment patikrinkite Colyseus Cloud logs:
- Turėtumėte matyti: `✅ Colyseus server is running on port 2567`
- NETURĖTUMĖTE MATYTI: `❌ Port 2567 is already in use`
- NETURĖTUMĖTE MATYTI: `ERR_SERVER_ALREADY_LISTEN`





