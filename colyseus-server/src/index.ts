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

const server = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: server,
  }),
});

// Register room
gameServer.define("pvp_room", GameRoom);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = Number(process.env.PORT) || 2567;

// Attach Colyseus to existing HTTP server (instead of listen)
gameServer.attach({ server });

// Start the HTTP server
server.listen(PORT, () => {
  console.log(`✅ HTTP server is listening on port ${PORT}`);
  console.log(`✅ Colyseus server is running on port ${PORT}`);
});

