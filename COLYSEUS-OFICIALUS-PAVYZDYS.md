# 📚 Colyseus Oficialus Pavyzdys - Express Integracija

## ✅ Oficialus Pavyzdys iš `@colyseus/ws-transport` README

Pagal oficialų `@colyseus/ws-transport` README.md pavyzdį:

```typescript
import http from "http";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";

const app = express();
const server = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
  // ...
})
```

**SVARBU:** Oficialus pavyzdys rodo:
- ✅ Naudoja `http.createServer(app)` 
- ✅ Perduoda `server` į `WebSocketTransport({ server })`
- ❌ **NEPASAKO**, kaip start'inti serverį!

---

## 🔍 Kas Mūsų Kode

Mūsų kodas atitinka oficialų pavyzdį:

```typescript
import express from "express";
import { createServer } from "http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";

const app = express();
const server = createServer(app); // ✅ Atitinka oficialų pavyzdį

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: server, // ✅ Atitinka oficialų pavyzdį
  }),
});

// Mūsų kodas:
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
```

**IŠVADA:** Mūsų kodas **TEISINGAS** pagal oficialų pavyzdį!

---

## 💡 Alternatyvus Būdas: `gameServer.listen()`

Colyseus `Server` klasė turi `listen()` metodą:

```typescript
// Alternatyvus būdas (jei nenaudojame Express):
gameServer.listen(PORT).then(() => {
  console.log(`✅ Colyseus server running on port ${PORT}`);
});
```

**Bet:** Jei naudojame Express, turime naudoti `server.listen()`, nes:
- Express middleware turi būti prieš Colyseus
- HTTP server turi būti sukurtas prieš Colyseus
- `gameServer.listen()` sukuria naują HTTP serverį (ne Express!)

---

## ✅ Galutinė Išvada

**Mūsų kodas TEISINGAS!**

1. ✅ Naudojame `http.createServer(app)` - kaip oficialus pavyzdys
2. ✅ Perduodame `server` į `WebSocketTransport({ server })` - kaip oficialus pavyzdys
3. ✅ Start'iname su `server.listen()` - teisingai, nes naudojame Express

**Problema NE kode, o PM2 konfigūracijoje!**

---

## 🔧 Ką Reikia Ištaisyti

**NE kodą, o PM2 konfigūraciją:**

1. ✅ `instances: 1` - tik vienas instance'as
2. ✅ `unique: true` - garantuoja vieną instance'ą
3. ✅ `kill_timeout: 20000` - duoda laiko užsidaryti
4. ✅ `restart_delay: 15000` - laukia prieš restart'inti

**Kodas jau paruoštas - reikia tik commit'inti!**



