import config from "@colyseus/tools";
import { matchMaker, LobbyRoom } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import cors, { CorsOptions } from "cors";
import express from "express";
import { F9PvpRoom } from "./rooms/F9PvpRoom";

// ── Lenta F9 PvP Colyseus serveris (švarus, f9-only). ──
// DOT Clicker GameRoom/Chat/Presence + jų debug-ingest NEĮTRAUKTI (žr. project_lenta_pvp_colyseus).

const corsOptions: CorsOptions = {
  origin: (_origin, callback) => callback(null, true),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 204,
};
const corsMiddleware = cors(corsOptions);

export default config({
  // Ping heartbeat IŠJUNGTAS (pingInterval:0): fone esantis / occluded langas (Chrome pristabdo timer'ius)
  // NEbus išmestas dėl praleisto pong → nebebus „host iškrito → forfeit, unitai dingo". Realus disconnect
  // (uždarytas tab'as) vis tiek aptinkamas per WS close frame. Sprendžia single-PC 2-langų testą.
  initializeTransport: () => new WebSocketTransport({ pingInterval: 0 }),
  initializeGameServer: (gameServer) => {
    // Room browser lobby: žaidėjai MATO atvirus matchus (host vardas, 1/2) ir PATYS pasirenka
    // sukurti/prisijungti — jokio priverstinio auto-suporavimo. enableRealtimeListing → f9_pvp_room
    // atsiranda lobby sąraše kol nepilnas/neužrakintas; prasidėjus mūšiui (lock) dingsta iš sąrašo.
    gameServer.define("lobby", LobbyRoom);
    // filterBy(owner): 🏰 HOME pilis sukuriama su owner=wallet → puolikas join'ina KONKRETAUS žaidėjo
    //   pilį per join({owner: targetAddr}). 1v1/#f9live naudoja create()/joinById → filtras jų neliečia
    //   (create ignoruoja filterBy; tos pilys owner=undefined → tarpusavyje nesimaišo su home).
    // 🏰 F1 (2026-07-15): + sortBy({clients:-1}) — jei dėl race liktų 2 kambariai tam pačiam owner,
    //   joinOrCreate ima PILNIAUSIĄ (kur gynėjas sėdi), ne tuščią dublį → puolikas visada randa gynėją.
    //   Kartu su klientu: HOME dabar joinOrCreate (ne create()) → dublių išvis nebekuria.
    gameServer.define("f9_pvp_room", F9PvpRoom).enableRealtimeListing().filterBy(["owner"]).sortBy({ clients: -1 });

    matchMaker.controller.getCorsHeaders = (req: any) => {
      const origin = req.headers.origin;
      return {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
      };
    };
  },
  initializeExpress: (app) => {
    app.use(corsMiddleware);
    app.options("*", corsMiddleware);
    app.use(express.json());

    app.get("/health", (_req, res) => res.json({ status: "ok" }));
    app.get("/", (_req, res) => res.json({
      message: "Lenta F9 PvP Colyseus Server",
      status: "running",
      rooms: ["f9_pvp_room"],
    }));
  },
  beforeListen: () => {
    console.log("✅ Lenta F9 PvP server configured (f9_pvp_room)");
  },
});
