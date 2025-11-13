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

// Colyseus Cloud PM2 sets PORT automatically - use it directly
// If PORT is not set, PM2/Colyseus Cloud will crash - that's expected
// For local development, use 2567 as fallback
const PORT = process.env.PORT ? Number(process.env.PORT) : 2567;

// Add error handling to catch any startup errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

console.log(`🔧 Starting server (PORT env: ${process.env.PORT || 'not set'}, NODE_ENV: ${process.env.NODE_ENV || 'not set'}, using port: ${PORT})`);

// Start HTTP server first, then Colyseus attaches automatically
// This is the correct way for PM2/Colyseus Cloud
try {
  server.listen(PORT, () => {
    const actualPort = (server.address() as any)?.port || PORT;
    console.log(`✅ HTTP server is listening on port ${actualPort}`);
    console.log(`✅ Colyseus server is running on port ${actualPort}`);
    
    // Colyseus is already attached via WebSocketTransport({ server: server })
    // No need to call gameServer.listen() separately
  });
  
  server.on('error', (error: any) => {
    console.error('❌ Server error:', error);
    if (error.code === 'EADDRINUSE') {
      console.error(`⚠️ Port ${PORT} is already in use`);
    }
    process.exit(1);
  });
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}

