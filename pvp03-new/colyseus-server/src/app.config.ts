import config from "@colyseus/tools";
import { matchMaker } from "@colyseus/core";
import cors, { CorsOptions } from "cors";
import express from "express";
import { GameRoom } from "./rooms/GameRoom";
import { getRoomMetrics } from "./metrics/RoomMetrics";

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
        rooms: ["pvp_room"],
        endpoints: {
          health: "/health",
          matchmake: "/matchmake"
        }
      });
    });
  },
  beforeListen: () => {
    console.log("✅ Colyseus configured via @colyseus/tools");
  }
});

