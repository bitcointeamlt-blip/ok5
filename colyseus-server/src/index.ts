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

// Colyseus Cloud automatically sets PORT environment variable
// For local development, use 2567 as fallback
const PORT = process.env.PORT ? Number(process.env.PORT) : 2567;

console.log(`🔧 Starting server on port: ${PORT} (PORT env: ${process.env.PORT || 'not set'})`);

// Start Colyseus server (it will handle HTTP server automatically)
// This is the correct way for Colyseus Cloud deployment
gameServer.listen(PORT)
  .then(() => {
    console.log(`✅ HTTP server is listening on port ${PORT}`);
    console.log(`✅ Colyseus server is running on port ${PORT}`);
  })
  .catch((error) => {
    console.error('❌ Failed to start Colyseus server:', error);
    // If port is in use, try to get a different port from Colyseus Cloud
    if (error.code === 'EADDRINUSE') {
      console.error(`⚠️ Port ${PORT} is already in use. Colyseus Cloud should set PORT automatically.`);
      console.error('💡 Check Colyseus Cloud settings - PORT should be set automatically.');
    }
    process.exit(1);
  });

