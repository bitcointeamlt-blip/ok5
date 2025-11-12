import express from "express";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom";
import cors from "cors";

const app = express();
// CORS configuration - allow all origins for development
app.use(cors({
  origin: true, // Allow all origins
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Create Colyseus server with WebSocketTransport
// WebSocketTransport will create its own HTTP server
const gameServer = new Server({
  transport: new WebSocketTransport(),
});

// Attach Express app to Colyseus server
gameServer.attach({ server: createServer(app) });

// Register room
gameServer.define("pvp_room", GameRoom);

const PORT = Number(process.env.PORT) || 2567;

// Start Colyseus server
gameServer.listen(PORT)
  .then(() => {
    console.log(`✅ HTTP server is listening on port ${PORT}`);
    console.log(`✅ Colyseus server is running on port ${PORT}`);
  })
  .catch((error) => {
    console.error('❌ Failed to start Colyseus server:', error);
    process.exit(1);
  });

