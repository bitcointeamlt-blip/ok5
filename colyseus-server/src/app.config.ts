import config from "@colyseus/tools";
import { matchMaker } from "@colyseus/core";
import cors, { CorsOptions } from "cors";
import express from "express";
import { GameRoom } from "./rooms/GameRoom";
import { PresenceRoom } from "./rooms/PresenceRoom";
import { ChatRoom } from "./rooms/ChatRoom";
import { UnitsRoom } from "./rooms/UnitsRoom";
import { getRoomMetrics } from "./metrics/RoomMetrics";
import { replayStore } from "./replay/ReplayStore";

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Type"],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

const corsMiddleware = cors(corsOptions);

export default config({
  initializeGameServer: (gameServer) => {
    // Register PvP room
    gameServer.define("pvp_room", GameRoom);
    // Register 5SEC PvP room (turn-based micro-turn arena)
    gameServer.define("pvp_5sec_room", GameRoom);
    // Register FUN PvP room (no ticket burn/payout; no stakes)
    gameServer.define("pvp_fun_room", GameRoom);
    // Register presence room (counts all website visitors as online)
    gameServer.define("presence_room", PresenceRoom);
    // Register global chat room
    gameServer.define("chat_room", ChatRoom);
    // Register Units galaxy conquest room (multiplayer)
    gameServer.define("units_room", UnitsRoom);

    // Ensure matchmaker endpoints send CORS headers
    matchMaker.controller.getCorsHeaders = (req: any) => {
      const origin = req.headers.origin;
      console.log("[CORS] Matchmaking request from origin:", origin);
      return {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Expose-Headers": "Content-Length, Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
      };
    };
  },
  initializeExpress: (app) => {
    app.use(corsMiddleware);
    app.options("*", corsMiddleware);
    app.use(express.json());

    app.get("/health", (_req, res) => {
      res.json({ status: "ok" });
    });
    
    app.get("/status", (_req, res) => {
      const metrics = getRoomMetrics();
      res.json({
        status: "ok",
        timestamp: Date.now(),
        ...metrics
      });
    });

    app.get("/", (_req, res) => {
      res.json({
        message: "Colyseus PvP Server",
        status: "running",
        rooms: ["pvp_room", "pvp_5sec_room", "pvp_fun_room", "presence_room", "chat_room", "units_room"],
        endpoints: {
          health: "/health",
          matchmake: "/matchmake"
          ,
          replays: "/replays"
        }
      });
    });

    // --- Replay endpoints (server-side debug + player dispute resolution) ---
    // GET /replays?limit=50
    app.get("/replays", async (req, res) => {
      try {
        const limitRaw = String((req as any)?.query?.limit ?? "").trim();
        const limit = limitRaw ? Math.max(1, Math.min(200, parseInt(limitRaw, 10) || 50)) : 50;
        const items = await replayStore.list(limit);
        res.json({ ok: true, dir: replayStore.getDir(), items });
      } catch (e: any) {
        res.status(500).json({ ok: false, error: e?.message || "replays_list_failed" });
      }
    });

    // GET /replays/:id
    app.get("/replays/:id", async (req, res) => {
      try {
        const id = String((req as any)?.params?.id ?? "").trim();
        if (!id) return res.status(400).json({ ok: false, error: "missing_id" });
        const replay = await replayStore.read(id);
        res.json({ ok: true, replay });
      } catch (e: any) {
        const msg = e?.message || "replay_read_failed";
        // Basic not-found mapping (fs throws ENOENT wrapped)
        if (String(msg).toLowerCase().includes("enoent")) {
          return res.status(404).json({ ok: false, error: "not_found" });
        }
        res.status(500).json({ ok: false, error: msg });
      }
    });
  },
  beforeListen: () => {
    console.log("✅ Colyseus configured via @colyseus/tools");
  }
});

