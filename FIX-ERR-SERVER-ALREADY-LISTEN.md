# 🔧 Fix ERR_SERVER_ALREADY_LISTEN

## ❌ Problema: ERR_SERVER_ALREADY_LISTEN

Logs rodo:
```
❌ Failed to start Colyseus server: Error [ERR_SERVER_ALREADY_LISTEN]: 
Listen method has been called more than once without closing.
```

**Problema**: 
- HTTP server start'ina su `server.listen(PORT)`
- Po to Colyseus server bando start'inti su `gameServer.listen(PORT)`
- Bet Colyseus jau naudoja tą patį HTTP server per `WebSocketTransport`
- Todėl kyla konfliktas

---

## ✅ Sprendimas: Pašalinti gameServer.listen()

**Colyseus jau naudoja HTTP serverį per WebSocketTransport**, todėl:
- ❌ Nereikia `gameServer.listen(PORT)`
- ✅ Užtenka `server.listen(PORT)`
- ✅ Colyseus automatiškai veiks ant HTTP serverio

---

## 📋 Kitas Žingsnis: Commit → Push → Deploy

### Step 1: Commit ir Push

1. **GitHub Desktop** → Commit → Push
2. Arba terminal:
   ```bash
   git add colyseus-server/src/index.ts
   git commit -m "Fix ERR_SERVER_ALREADY_LISTEN - remove gameServer.listen()"
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
   - **NĖRA** `ERR_SERVER_ALREADY_LISTEN` error

2. **Endpoint**: `https://de-fra-f8820c12.colyseus.cloud/health`
   - Turėtumėte matyti: `{"status":"ok"}`

3. **Instances** turėtų pasikeisti į "Running"

---

## ✅ Checklist

- [x] ERR_SERVER_ALREADY_LISTEN pataisyta
- [ ] Commit → Push į GitHub
- [ ] Deployment padarytas
- [ ] Logs patikrinti
- [ ] Serveris veikia (`/health` endpoint)

---

**Ar padarėte commit ir push?**

