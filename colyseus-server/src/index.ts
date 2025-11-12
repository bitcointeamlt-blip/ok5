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

const PORT = parseInt(process.env.PORT || "2567", 10);
gameServer.listen(PORT).then(() => {
  console.log(`✅ Colyseus server running on port ${PORT}`);
});

