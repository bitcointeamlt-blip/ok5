# 🔧 Fix Colyseus Listen - Final Solution

## ❌ Problema: ERR_SERVER_ALREADY_LISTEN

Error rodo, kad Colyseus vis dar bando kviesti `listen()` net kai naudojame `WebSocketTransport` su `server` option.

**Problema**: 
- Kai naudojame `WebSocketTransport({ server: server })`, Colyseus **TURI** būti start'inamas su `gameServer.listen(PORT)`
- **NE** `server.listen(PORT)` atskirai
- Colyseus automatiškai start'ina HTTP serverį per `gameServer.listen()`

---

## ✅ Sprendimas: Naudoti gameServer.listen()

**Teisingas būdas**:
```typescript
const server = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: server,
  }),
});

// Start Colyseus server (it will handle HTTP server)
gameServer.listen(PORT)
  .then(() => {
    console.log(`✅ Colyseus server is running on port ${PORT}`);
  })
  .catch((error) => {
    console.error('❌ Failed to start Colyseus server:', error);
    process.exit(1);
  });
```

**NE**:
```typescript
// ❌ NETINKAMA - sukels ERR_SERVER_ALREADY_LISTEN
server.listen(PORT, () => {
  // ...
});
```

---

## 📋 Kitas Žingsnis: Commit → Push → Deploy

### Step 1: Commit ir Push

1. **GitHub Desktop** → Commit → Push
2. Arba terminal:
   ```bash
   git add colyseus-server/src/index.ts
   git commit -m "Fix Colyseus listen - use gameServer.listen() instead of server.listen()"
   git push
   ```

### Step 2: Deploy

1. **Colyseus Cloud** → Deployments tab
2. Spustelėkite **"Deploy"** arba **"Redeploy"**
3. Palaukite 2-5 min
4. Patikrinkite **LOGS**

---

## ✅ Patikrinimas

Po deployment:

1. **Logs** turėtų rodyti:
   - `✅ Colyseus server is running on port XXXX`
   - **NĖRA** `ERR_SERVER_ALREADY_LISTEN` error
   - **NĖRA** crash loop

2. **Endpoint**: `https://de-fra-f8820c12.colyseus.cloud/health`
   - Turėtumėte matyti: `{"status":"ok"}`

3. **Instances** turėtų pasikeisti į "Running"

---

## ✅ Checklist

- [x] Colyseus listen logika pakeista
- [ ] Commit → Push į GitHub
- [ ] Deployment padarytas
- [ ] Logs patikrinti
- [ ] Serveris veikia (`/health` endpoint)

---

**Ar padarėte commit ir push?**

