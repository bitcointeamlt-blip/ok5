import express from "express";
import { createServer } from "http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import cors from "cors";
import { GameRoom } from "./rooms/GameRoom";

const app = express();
const server = createServer(app);

// CORS - allow Netlify domain and localhost for development
// CRITICAL: Must be configured BEFORE Colyseus server initialization
const allowedOrigins = [
  'https://jocular-zabaione-835b49.netlify.app',
  'http://localhost:7005',
  'http://localhost:5173',
  'http://127.0.0.1:7005',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('[CORS] Blocked origin:', origin);
      callback(null, true); // Still allow for now, but log it
    }
  },
  credentials: true,
  methods: ['OPTIONS', 'GET', 'POST', 'PUT', 'DELETE'],
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

// CRITICAL: Override Colyseus matchmaking CORS headers
// This ensures matchmaking endpoints (/matchmake/*) have CORS headers
matchMaker.controller.getCorsHeaders = function(req: any) {
  const origin = req.headers.origin;
  
  // Netlify production domain
  const netlifyDomain = 'https://jocular-zabaione-835b49.netlify.app';
  
  // Use specific origin if present, otherwise use Netlify domain
  // Never use '*' with credentials: true
  const allowedOrigin = origin || netlifyDomain;
  
  // Log CORS request for debugging
  console.log('[CORS] getCorsHeaders called', {
    origin: origin,
    allowedOrigin: allowedOrigin,
    method: req.method,
    path: req.url
  });
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'OPTIONS, GET, POST, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
};

// Register room
gameServer.define("pvp_room", GameRoom);

// Root path handler
app.get("/", (req, res) => {
  res.json({ 
    message: "Colyseus PvP Server",
    status: "running",
    rooms: ["pvp_room"],
    endpoints: {
      health: "/health",
      matchmake: "/matchmake"
    }
  });
});

// Start server
// When using WebSocketTransport({ server }), we use server.listen(), not gameServer.listen()
// Colyseus automatically handles WebSocket connections on the HTTP server
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 2567;

server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Matchmaking: http://localhost:${PORT}/matchmake`);
  });
