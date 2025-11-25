# ✅ Teisingas Sprendimas - Colyseus Server Start

## ❌ Problema: Vis Ta Pati Klaida

Error vis dar rodo:
```
Error: Please provide a 'transport' layer. Default transport not set.
    at Server.attach
```

**Problema**: 
- Bandėme `attach()` - neveikia
- Bandėme `gameServer.listen()` su `WebSocketTransport({ server })` - sukėlė `ERR_SERVER_ALREADY_LISTEN`
- Bandėme `gameServer.listen()` su `WebSocketTransport()` be server - neveikia

---

## ✅ Teisingas Sprendimas

**Pagal Colyseus dokumentaciją**:
- Kai naudojame `WebSocketTransport({ server: server })`, mes **TURI** naudoti `server.listen()`, ne `gameServer.listen()`
- Colyseus automatiškai valdo WebSocket connections ant HTTP serverio

**Teisingas kodas**:
```typescript
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Create HTTP server with Express app
const server = createServer(app);

// Create Colyseus server with WebSocketTransport
// Pass the HTTP server to WebSocketTransport
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: server,
  }),
});

// Register room
gameServer.define("pvp_room", GameRoom);

const PORT = Number(process.env.PORT) || 2567;

// Start HTTP server - Colyseus will handle WebSocket connections automatically
server.listen(PORT, () => {
  console.log(`✅ HTTP server is listening on port ${PORT}`);
  console.log(`✅ Colyseus server is running on port ${PORT}`);
});
```

**Kas svarbu**:
- ✅ `WebSocketTransport({ server: server })` - perduodame HTTP serverį
- ✅ `server.listen(PORT)` - start'iname HTTP serverį
- ❌ **NE** `gameServer.listen()` - sukels `ERR_SERVER_ALREADY_LISTEN`
- ❌ **NE** `gameServer.attach()` - neveikia su `WebSocketTransport({ server })`

---

## 📋 Kitas Žingsnis: Commit → Push → Deploy

### Step 1: Commit ir Push

1. **GitHub Desktop** → Commit → Push
2. Arba terminal:
   ```bash
   git add colyseus-server/src/index.ts
   git commit -m "Fix Colyseus server - use server.listen() with WebSocketTransport({ server })"
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
   - **NĖRA** `ERR_SERVER_ALREADY_LISTEN` error
   - **NĖRA** crash loop

2. **Endpoint**: `https://de-fra-f8820c12.colyseus.cloud/health`
   - Turėtumėte matyti: `{"status":"ok"}`

3. **Instances** turėtų pasikeisti į "Running"

---

## ✅ Checklist

- [x] Teisingas sprendimas rastas
- [x] Kodas pataisytas
- [ ] Commit → Push į GitHub
- [ ] Deployment padarytas
- [ ] Logs patikrinti
- [ ] Serveris veikia (`/health` endpoint)

---

**Šis sprendimas turėtų veikti!**

