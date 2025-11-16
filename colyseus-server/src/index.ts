import express from "express";
import { createServer } from "http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom";
import cors from "cors";

const app = express();

// CRITICAL: Handle CORS BEFORE any other middleware
// This ensures CORS headers are sent for ALL requests, including preflight OPTIONS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Allow all origins (including Netlify)
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  
  // Handle preflight OPTIONS requests immediately
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  next();
});

// CORS middleware as backup
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  preflightContinue: false,
  optionsSuccessStatus: 204
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

// CRITICAL: Override Colyseus matchmaking CORS headers
// This ensures matchmaking endpoints (/matchmake/*) have CORS headers
// IMPORTANT: This must be set BEFORE gameServer.define()
matchMaker.controller.getCorsHeaders = function(req: any) {
  const origin = req.headers.origin;
  
  console.log('🔵 Colyseus CORS headers requested for origin:', origin);
  
  const headers: any = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  
  console.log('🔵 Colyseus CORS headers:', headers);
  
  return headers;
};

// Register room
gameServer.define("pvp_room", GameRoom);

// Get PORT from environment - Colyseus Cloud sets this automatically
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 2567;

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
  console.log(`✅ Server running on port ${PORT}`);
});
