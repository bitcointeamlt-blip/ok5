"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const core_1 = require("@colyseus/core");
const ws_transport_1 = require("@colyseus/ws-transport");
const cors_1 = __importDefault(require("cors"));
const GameRoom_1 = require("./rooms/GameRoom");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
// CORS - allow Netlify domain and localhost for development
// CRITICAL: Must be configured BEFORE Colyseus server initialization
const allowedOrigins = [
    'https://jocular-zabaione-835b49.netlify.app',
    'http://localhost:7005',
    'http://localhost:5173',
    'http://127.0.0.1:7005',
    'http://127.0.0.1:5173'
];
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        }
        else {
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
app.options('*', (0, cors_1.default)());
app.use(express_1.default.json());
// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});
// Colyseus server
const gameServer = new core_1.Server({
    transport: new ws_transport_1.WebSocketTransport({
        server: server
    })
});
// CRITICAL: Override Colyseus matchmaking CORS headers
// This ensures matchmaking endpoints (/matchmake/*) have CORS headers
core_1.matchMaker.controller.getCorsHeaders = function (req) {
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
gameServer.define("pvp_room", GameRoom_1.GameRoom);
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
