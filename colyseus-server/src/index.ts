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

const PORT = Number(process.env.PORT) || 2567;

// Start HTTP server - Colyseus will handle WebSocket connections automatically
server.listen(PORT, () => {
  console.log(`✅ HTTP server is listening on port ${PORT}`);
  console.log(`✅ Colyseus server is running on port ${PORT}`);
});

