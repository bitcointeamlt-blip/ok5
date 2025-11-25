"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRoom = void 0;
const core_1 = require("@colyseus/core");
const GameState_1 = require("../schema/GameState");
class GameRoom extends core_1.Room {
    constructor() {
        super(...arguments);
        this.maxClients = 2; // 2 players per match
    }
    onCreate(options) {
        try {
            console.log("GameRoom created:", this.roomId);
            // Initialize game state
            const state = new GameState_1.GameState();
            state.seed = Math.floor(Math.random() * 1000000);
            this.setState(state);
            console.log("GameState initialized successfully");
            // Set up room handlers
            this.onMessage("player_input", (client, message) => {
                try {
                    this.handlePlayerInput(client, message);
                }
                catch (error) {
                    console.error("Error handling player_input:", error);
                }
            });
            this.onMessage("player_ready", (client, message) => {
                try {
                    this.handlePlayerReady(client, message);
                }
                catch (error) {
                    console.error("Error handling player_ready:", error);
                }
            });
            console.log("GameRoom onCreate completed successfully");
        }
        catch (error) {
            console.error("❌ Error in GameRoom.onCreate:", error);
            console.error("Error name:", error?.name);
            console.error("Error message:", error?.message);
            console.error("Error stack:", error?.stack);
            throw error; // Re-throw to let Colyseus handle it
        }
    }
    onJoin(client, options) {
        console.log(`Player ${client.sessionId} joined room ${this.roomId}`);
        const player = new GameState_1.Player();
        player.sessionId = client.sessionId;
        player.address = options.address || ""; // Ronin wallet address
        player.x = options.x || 960; // Default position
        player.y = options.y || 540;
        player.hp = 100;
        player.maxHP = 100;
        player.armor = 50;
        player.maxArmor = 50;
        player.ready = false;
        // Add player to state
        if (!this.state.players.has(client.sessionId)) {
            this.state.players.set(client.sessionId, player);
        }
        // Broadcast player joined
        this.broadcast("player_joined", {
            sessionId: client.sessionId,
            playerCount: this.state.players.size
        });
        // If 2 players joined, notify both
        if (this.state.players.size === 2) {
            this.broadcast("match_ready", {
                message: "Both players joined! Get ready!"
            });
        }
    }
    onLeave(client, consented) {
        console.log(`Player ${client.sessionId} left room ${this.roomId}`);
        // Remove player from state
        this.state.players.delete(client.sessionId);
        // Broadcast player left
        this.broadcast("player_left", {
            sessionId: client.sessionId,
            playerCount: this.state.players.size
        });
    }
    onDispose() {
        console.log("GameRoom disposed:", this.roomId);
    }
    handlePlayerInput(client, message) {
        const player = this.state.players.get(client.sessionId);
        if (!player)
            return;
        // Update player position/state based on input
        if (message.type === "position") {
            player.x = message.x;
            player.y = message.y;
            player.vx = message.vx || 0;
            player.vy = message.vy || 0;
        }
        else if (message.type === "click") {
            // Handle click input
            player.lastClickX = message.x;
            player.lastClickY = message.y;
            player.lastClickTime = Date.now();
        }
        else if (message.type === "arrow") {
            // Handle arrow input
            player.arrowX = message.x;
            player.arrowY = message.y;
            player.arrowVx = message.vx;
            player.arrowVy = message.vy;
        }
        else if (message.type === "projectile") {
            // Handle projectile input
            player.projectileX = message.x;
            player.projectileY = message.y;
            player.projectileVx = message.vx;
            player.projectileVy = message.vy;
        }
        // Broadcast to other players (not sender)
        this.broadcast("player_input", message, {
            except: client
        });
    }
    handlePlayerReady(client, message) {
        const player = this.state.players.get(client.sessionId);
        if (!player)
            return;
        player.ready = message.ready || false;
        // Check if both players are ready
        const allReady = Array.from(this.state.players.values()).every(p => p.ready);
        if (allReady && this.state.players.size === 2) {
            this.broadcast("game_start", {
                message: "Game starting!"
            });
            this.state.gameStarted = true;
        }
    }
}
exports.GameRoom = GameRoom;
