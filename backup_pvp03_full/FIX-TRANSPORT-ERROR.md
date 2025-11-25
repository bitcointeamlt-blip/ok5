# 🔧 Fix "Please provide a 'transport' layer" Error

## ❌ Problema: Transport Layer Error

Error rodo:
```
Error: Please provide a 'transport' layer. Default transport not set.
    at Server.getDefaultTransport
    at Server.attach
```

**Problema**: 
- `gameServer.attach({ server })` neveikia su `WebSocketTransport`
- Colyseus reikalauja transport layer, bet `attach()` negali jo rasti

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

// Start Colyseus server - it will handle the HTTP server
gameServer.listen(PORT)
  .then(() => {
    console.log(`✅ HTTP server is listening on port ${PORT}`);
    console.log(`✅ Colyseus server is running on port ${PORT}`);
  })
  .catch((error) => {
    console.error('❌ Failed to start Colyseus server:', error);
    process.exit(1);
  });
```

**NE**:
```typescript
// ❌ NETINKAMA - sukels transport error
gameServer.attach({ server });
server.listen(PORT);
```

---

## 📋 Kitas Žingsnis: Commit → Push → Deploy

### Step 1: Commit ir Push

1. **GitHub Desktop** → Commit → Push
2. Arba terminal:
   ```bash
   git add colyseus-server/src/index.ts
   git commit -m "Fix transport layer error - use gameServer.listen() instead of attach()"
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
   - `✅ HTTP server is listening on port XXXX`
   - `✅ Colyseus server is running on port XXXX`
   - **NĖRA** "Please provide a 'transport' layer" error
   - **NĖRA** crash loop

2. **Endpoint**: `https://de-fra-f8820c12.colyseus.cloud/health`
   - Turėtumėte matyti: `{"status":"ok"}`

3. **Instances** turėtų pasikeisti į "Running"

---

## ✅ Checklist

- [x] Transport layer error pataisyta
- [x] Naudojamas `gameServer.listen()` vietoj `attach()`
- [ ] Commit → Push į GitHub
- [ ] Deployment padarytas
- [ ] Logs patikrinti
- [ ] Serveris veikia (`/health` endpoint)

---

**Ar padarėte commit ir push?**

