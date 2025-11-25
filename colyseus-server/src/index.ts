import express from "express";
import { createServer } from "http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import cors from "cors";
import { GameRoom } from "./rooms/GameRoom";

const app = express();
const server = createServer(app);

// CORS - allow all origins for Colyseus Cloud
// CRITICAL: Must be configured BEFORE Colyseus server initialization
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type']
}));

// Handle preflight requests explicitly
app.options('*', cors());

app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Colyseus server
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: server
  })
});

// CRITICAL: Override Colyseus matchmaking CORS headers
// This ensures matchmaking endpoints (/matchmake/*) have CORS headers
matchMaker.controller.getCorsHeaders = function(req: any) {
  const origin = req.headers.origin;
  
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
};

// Register room
gameServer.define("pvp_room", GameRoom);

// Root path handler
app.get("/", (req, res) => {
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

// Start server
// When using WebSocketTransport({ server }), we use server.listen(), not gameServer.listen()
// Colyseus automatically handles WebSocket connections on the HTTP server
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 2567;

server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Matchmaking: http://localhost:${PORT}/matchmake`);
  });
