// Log immediately - this will show in PM2 logs if file loads
console.log('=== SERVER STARTING ===');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('CWD:', process.cwd());

import express from "express";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom";
import cors from "cors";

console.log('=== IMPORTS LOADED ===');

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

// Get PORT from environment - Colyseus Cloud MUST set this
const PORT = process.env.PORT ? Number(process.env.PORT) : 0;

console.log('=== PORT CHECK ===');
console.log('process.env.PORT:', process.env.PORT);
console.log('PORT (parsed):', PORT);
console.log('PORT type:', typeof PORT);
console.log('isNaN(PORT):', isNaN(PORT));

// If PORT is not set, crash with clear error
if (!process.env.PORT || PORT === 0 || isNaN(PORT)) {
  console.error('❌ PORT environment variable is not set or invalid!');
  console.error('process.env.PORT:', process.env.PORT);
  console.error('Colyseus Cloud must set PORT automatically.');
  process.exit(1);
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// Start HTTP server - Colyseus is already attached via WebSocketTransport
server.on('error', (err: any) => {
  console.error('Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  const addr = server.address();
  const actualPort = (addr && typeof addr === 'object') ? addr.port : PORT;
  console.log(`✅ Server running on port ${actualPort}`);
  console.log(`✅ Server address:`, addr);
});

