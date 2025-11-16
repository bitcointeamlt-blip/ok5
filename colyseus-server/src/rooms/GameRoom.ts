import { Room, Client } from "@colyseus/core";
import { GameState, Player } from "../schema/GameState";

export class GameRoom extends Room<GameState> {
  maxClients = 2; // 2 players per match

  onCreate(options: any) {
    console.log("GameRoom created:", this.roomId);
    
    // Initialize game state
    this.setState(new GameState());
    
    // Set up room handlers
    this.onMessage("player_input", (client, message) => {
      this.handlePlayerInput(client, message);
    });
    
    this.onMessage("player_ready", (client, message) => {
      this.handlePlayerReady(client, message);
    });
  }

  onJoin(client: Client, options: any) {
    console.log(`Player ${client.sessionId} joined room ${this.roomId}`);
    
    const player = new Player();
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

  onLeave(client: Client, consented: boolean) {
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

  handlePlayerInput(client: Client, message: any) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // Update player position/state based on input
    if (message.type === "position") {
      player.x = message.x;
      player.y = message.y;
      player.vx = message.vx || 0;
      player.vy = message.vy || 0;
    } else if (message.type === "click") {
      // Handle click input
      player.lastClickX = message.x;
      player.lastClickY = message.y;
      player.lastClickTime = Date.now();
    } else if (message.type === "arrow") {
      // Handle arrow input
      player.arrowX = message.x;
      player.arrowY = message.y;
      player.arrowVx = message.vx;
      player.arrowVy = message.vy;
    } else if (message.type === "projectile") {
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

  handlePlayerReady(client: Client, message: any) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

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

