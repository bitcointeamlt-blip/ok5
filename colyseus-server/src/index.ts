import express from "express";
import { createServer } from "http";
import { Server } from "@colyseus/core";
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

// Register room
gameServer.define("pvp_room", GameRoom);

// Start server
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 2567;

gameServer.listen(PORT)
  .then(() => {
    console.log(`✅ Server running on port ${PORT}`);
  })
  .catch((err) => {
    console.error("❌ Failed to start:", err);
    process.exit(1);
  });
