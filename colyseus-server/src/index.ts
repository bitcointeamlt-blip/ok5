import express from "express";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import cors from "cors";
import { GameRoom } from "./rooms/GameRoom";

const app = express();

// CORS configuration - allow Netlify origin
app.use(cors({
  origin: [
    "https://jocular-zabaione-835b49.netlify.app",
    "http://localhost:7000",
    "http://localhost:5173"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Create HTTP server
const server = createServer(app);

// Create Colyseus server
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: server,
  }),
});

// Register room
gameServer.define("pvp_room", GameRoom);

// Get PORT from environment (Colyseus Cloud sets this)
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 2567;

// Start server
gameServer.listen(PORT)
  .then(() => {
    console.log(`✅ Colyseus server is running on port ${PORT}`);
    console.log(`✅ Health endpoint: http://0.0.0.0:${PORT}/health`);
    console.log(`✅ Matchmaking endpoint: http://0.0.0.0:${PORT}/matchmake`);
  })
  .catch((err: any) => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  });
