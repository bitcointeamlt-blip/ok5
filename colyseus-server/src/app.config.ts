import config from "@colyseus/tools";
import { matchMaker } from "@colyseus/core";
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
    gameServer.define("f9_pvp_room", F9PvpRoom);

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
