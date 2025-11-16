import express from "express";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom";
import cors from "cors";

const app = express();

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Create HTTP server
const server = createServer(app);

// Create Colyseus server with WebSocketTransport
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: server,
  }),
});

// Register room
gameServer.define("pvp_room", GameRoom);

// Get PORT from environment - Colyseus Cloud sets this automatically
// Use Number() like the working version, but with auto-assign fallback for production
const PORT = process.env.PORT 
  ? Number(process.env.PORT) 
  : (process.env.NODE_ENV === 'production' ? 0 : 2567); // Auto-assign (0) in production if PORT not set

console.log(`🔧 Starting server (PORT env: ${process.env.PORT || 'not set'}, NODE_ENV: ${process.env.NODE_ENV || 'development'}, using port: ${PORT === 0 ? 'auto-assign' : PORT})`);

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Start HTTP server - Colyseus is already attached via WebSocketTransport
server.on('error', (err: any) => {
  console.error('❌ Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    console.error('💡 Tip: In production, PORT should be set by Colyseus Cloud or use auto-assign (0)');
  }
  process.exit(1);
});

server.listen(PORT, () => {
  const actualPort = PORT === 0 ? (server.address() as any)?.port : PORT;
  console.log(`✅ HTTP server is listening on port ${actualPort}`);
  console.log(`✅ Colyseus server is running on port ${actualPort}`);
});
