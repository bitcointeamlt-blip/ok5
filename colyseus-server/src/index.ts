import express from "express";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom";
import cors from "cors";

const app = express();
app.use(cors());
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

// Start the server
server.listen(PORT, () => {
  console.log(`✅ HTTP server is listening on port ${PORT}`);
  gameServer.listen(PORT)
    .then(() => {
      console.log(`✅ Colyseus server is running on port ${PORT}`);
    })
    .catch((error) => {
      console.error('❌ Failed to start Colyseus server:', error);
      process.exit(1);
    });
});

