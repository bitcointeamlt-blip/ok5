import express from "express";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom";
import cors from "cors";

const app = express();

// CORS configuration - allow all origins (works for both localhost and production)
// Colyseus Cloud handles CORS automatically, but we need this for localhost development
app.use(cors({
  origin: true, // Allow all origins (localhost, production domains, etc.)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

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

// Health check endpoint (must be after gameServer is created)
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Colyseus Cloud PM2 sets PORT automatically
// Use PORT from environment or default to 2567 for local development
const PORT = process.env.PORT ? Number(process.env.PORT) : 2567;

// Add error handling to catch any startup errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start HTTP server - Colyseus attaches automatically via WebSocketTransport
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

