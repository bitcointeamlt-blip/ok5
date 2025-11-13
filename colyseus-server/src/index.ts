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

// Colyseus Cloud uses PM2 which should set PORT automatically
// If PORT is not set, PM2/Colyseus Cloud will assign one
// For local development, use 2567 as fallback
// IMPORTANT: Don't use 0 or fallback in production - PM2 must set PORT
const PORT = process.env.PORT ? Number(process.env.PORT) : 2567;

console.log(`🔧 Starting server (PORT env: ${process.env.PORT || 'not set'}, NODE_ENV: ${process.env.NODE_ENV || 'not set'}, using port: ${PORT})`);

// Start Colyseus server - it will handle HTTP server automatically
// When using WebSocketTransport({ server: server }), gameServer.listen() is required
gameServer.listen(PORT)
  .then(() => {
    const actualPort = (server.address() as any)?.port || PORT;
    console.log(`✅ HTTP server is listening on port ${actualPort}`);
    console.log(`✅ Colyseus server is running on port ${actualPort}`);
  })
  .catch((error) => {
    console.error('❌ Failed to start Colyseus server:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      PORT: PORT,
      PORT_ENV: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV
    });
    process.exit(1);
  });

