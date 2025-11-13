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

// Colyseus Cloud automatically sets PORT environment variable
// If PORT is not set in production, use 0 to let system assign a free port automatically
// For local development, use 2567 as fallback
const PORT = process.env.PORT 
  ? Number(process.env.PORT) 
  : (process.env.NODE_ENV === 'production' ? 0 : 2567);

console.log(`🔧 Starting server (PORT env: ${process.env.PORT || 'not set'}, NODE_ENV: ${process.env.NODE_ENV || 'not set'}, using port: ${PORT === 0 ? 'auto-assign' : PORT})`);

// Start Colyseus server - it will handle HTTP server automatically
// Using PORT 0 allows the system to assign a free port if PORT env is not set
gameServer.listen(PORT)
  .then(() => {
    const actualPort = PORT || (server.address() as any)?.port || 2567;
    console.log(`✅ HTTP server is listening on port ${actualPort}`);
    console.log(`✅ Colyseus server is running on port ${actualPort}`);
  })
  .catch((error) => {
    console.error('❌ Failed to start Colyseus server:', error);
    if (error.code === 'EADDRINUSE') {
      console.error(`⚠️ Port ${PORT} is already in use. Trying to use system-assigned port...`);
      // Try again with port 0 (auto-assign)
      if (PORT !== 0) {
        gameServer.listen(0)
          .then(() => {
            const actualPort = (server.address() as any)?.port;
            console.log(`✅ Server started on auto-assigned port ${actualPort}`);
          })
          .catch((err) => {
            console.error('❌ Failed to start on auto-assigned port:', err);
            process.exit(1);
          });
      } else {
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  });

