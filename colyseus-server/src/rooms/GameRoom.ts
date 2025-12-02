import { Room, Client } from "@colyseus/core";
import { GameState, Player } from "../schema/GameState";
import { registerRoom, unregisterRoom, updateRoomPlayerCount } from "../metrics/RoomMetrics";

type PlayerInputType =
  | "click"
  | "arrow"
  | "projectile"
  | "position"
  | "arrow_position"
  | "projectile_position"
  | "line"
  | "projectile_explode"
  | "stats"
  | "bullet"
  | "hit";

interface PlayerInputMessage {
  type: PlayerInputType;
  timestamp: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  targetX?: number;
  targetY?: number;
  chargeTime?: number;
  isCrit?: boolean;
  angle?: number;
  points?: Array<{ x: number; y: number }>;
  hp?: number;
  armor?: number;
  maxHP?: number;
  maxArmor?: number;
  dmg?: number;
  damage?: number;
  targetPlayerId?: string;
  isBullet?: boolean;
  paralysisDuration?: number;
  paralyzedUntil?: number;
}

interface PendingInputEntry {
  client: Client;
  input: PlayerInputMessage;
  timestamp: number;
}

const SIMULATION_RATE = 30; // Hz
const SIMULATION_INTERVAL_MS = Math.floor(1000 / SIMULATION_RATE);
const POSITION_LERP_FACTOR = 0.45;
const MAX_EVENT_QUEUE_LENGTH = 20;

export class GameRoom extends Room<GameState> {
  maxClients = 2; // 2 players per match
  private latestPositionInputs = new Map<string, PendingInputEntry>();
  private pendingEventInputs = new Map<string, PendingInputEntry[]>();

  onCreate(options: any) {
    try {
      console.log("GameRoom created:", this.roomId);
      registerRoom(this.roomId);
      
      // Initialize game state
      const state = new GameState();
      state.seed = Math.floor(Math.random() * 1000000);
      this.setState(state);
      console.log("GameState initialized successfully");
      
      // Set up room handlers
      this.onMessage("player_input", (client, message) => {
        try {
          this.handlePlayerInput(client, message);
        } catch (error: any) {
          console.error("Error handling player_input:", error);
        }
      });
      
      this.onMessage("player_ready", (client, message) => {
        try {
          this.handlePlayerReady(client, message);
        } catch (error: any) {
          console.error("Error handling player_ready:", error);
        }
      });
      
      this.setPatchRate(SIMULATION_RATE);
      this.setSimulationInterval(() => this.processPendingInputs(), SIMULATION_INTERVAL_MS);

      console.log("GameRoom onCreate completed successfully");
    } catch (error: any) {
      console.error("❌ Error in GameRoom.onCreate:", error);
      console.error("Error name:", error?.name);
      console.error("Error message:", error?.message);
      console.error("Error stack:", error?.stack);
      throw error; // Re-throw to let Colyseus handle it
    }
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
    
    updateRoomPlayerCount(this.roomId, this.state.players.size);
    
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
    this.latestPositionInputs.delete(client.sessionId);
    this.pendingEventInputs.delete(client.sessionId);
    
    updateRoomPlayerCount(this.roomId, this.state.players.size);
    
    // Broadcast player left
    this.broadcast("player_left", {
      sessionId: client.sessionId,
      playerCount: this.state.players.size
    });
  }

  onDispose() {
    console.log("GameRoom disposed:", this.roomId);
    this.latestPositionInputs.clear();
    this.pendingEventInputs.clear();
    unregisterRoom(this.roomId);
  }

  handlePlayerInput(client: Client, message: any) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const sanitizedInput = this.sanitizeInput(message);
    const pending: PendingInputEntry = {
      client,
      input: sanitizedInput,
      timestamp: Date.now()
    };

    if (sanitizedInput.type === "position" || sanitizedInput.type === "arrow_position" || sanitizedInput.type === "projectile_position") {
      this.latestPositionInputs.set(client.sessionId, pending);
    } else {
      const queue = this.pendingEventInputs.get(client.sessionId) || [];
      if (queue.length >= MAX_EVENT_QUEUE_LENGTH) {
        queue.shift(); // drop oldest to keep queue bounded
      }
      queue.push(pending);
      this.pendingEventInputs.set(client.sessionId, queue);
    }
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

  private processPendingInputs(): void {
    if (this.latestPositionInputs.size === 0 && this.pendingEventInputs.size === 0) {
      return;
    }

    const serverTimestamp = Date.now();

    for (const [sessionId, pending] of this.latestPositionInputs.entries()) {
      this.applyInputToState(sessionId, pending.input);
      this.emitInputToOpponents(pending, serverTimestamp);
      this.latestPositionInputs.delete(sessionId);
    }

    for (const [sessionId, queue] of this.pendingEventInputs.entries()) {
      if (!queue.length) {
        this.pendingEventInputs.delete(sessionId);
        continue;
      }

      while (queue.length) {
        const pending = queue.shift();
        if (!pending) {
          break;
        }
        this.applyInputToState(sessionId, pending.input);
        this.emitInputToOpponents(pending, serverTimestamp);
      }

      if (!queue.length) {
        this.pendingEventInputs.delete(sessionId);
      }
    }
  }

  private emitInputToOpponents(pending: PendingInputEntry, serverTimestamp: number): void {
    this.broadcast("player_input", {
      ...pending.input,
      serverTimestamp
    }, {
      except: pending.client
    });
  }

  private applyInputToState(sessionId: string, input: PlayerInputMessage): void {
    const player = this.state.players.get(sessionId);
    if (!player) {
      return;
    }

    switch (input.type) {
      case "position":
        this.applyPosition(player, input);
        break;
      case "arrow":
      case "arrow_position":
        this.applyArrow(player, input);
        break;
      case "projectile":
      case "projectile_position":
        this.applyProjectile(player, input);
        break;
      case "click":
        this.applyClick(player, input);
        break;
      case "stats":
        this.applyStats(player, input);
        break;
      case "hit":
        this.applyHit(player, input);
        break;
      default:
        break;
    }
  }

  private applyPosition(player: Player, input: PlayerInputMessage): void {
    if (typeof input.x === "number") {
      player.x = this.lerp(player.x, input.x, POSITION_LERP_FACTOR);
    }
    if (typeof input.y === "number") {
      player.y = this.lerp(player.y, input.y, POSITION_LERP_FACTOR);
    }
    player.vx = typeof input.vx === "number" ? input.vx : player.vx;
    player.vy = typeof input.vy === "number" ? input.vy : player.vy;
  }

  private applyArrow(player: Player, input: PlayerInputMessage): void {
    if (typeof input.x === "number") {
      player.arrowX = input.x;
    }
    if (typeof input.y === "number") {
      player.arrowY = input.y;
    }
    player.arrowVx = typeof input.vx === "number" ? input.vx : player.arrowVx;
    player.arrowVy = typeof input.vy === "number" ? input.vy : player.arrowVy;
  }

  private applyProjectile(player: Player, input: PlayerInputMessage): void {
    if (typeof input.x === "number") {
      player.projectileX = input.x;
    }
    if (typeof input.y === "number") {
      player.projectileY = input.y;
    }
    player.projectileVx = typeof input.vx === "number" ? input.vx : player.projectileVx;
    player.projectileVy = typeof input.vy === "number" ? input.vy : player.projectileVy;
  }

  private applyClick(player: Player, input: PlayerInputMessage): void {
    if (typeof input.x === "number") {
      player.lastClickX = input.x;
    }
    if (typeof input.y === "number") {
      player.lastClickY = input.y;
    }
    player.lastClickTime = Date.now();
  }

  private applyStats(player: Player, input: PlayerInputMessage): void {
    if (typeof input.hp === "number") {
      player.hp = input.hp;
    }
    if (typeof input.armor === "number") {
      player.armor = input.armor;
    }
    if (typeof input.maxHP === "number") {
      player.maxHP = input.maxHP;
    }
    if (typeof input.maxArmor === "number") {
      player.maxArmor = input.maxArmor;
    }
  }

  private applyHit(player: Player, input: PlayerInputMessage): void {
    if (typeof input.damage === "number") {
      player.hp = Math.max(0, player.hp - input.damage);
    }
  }

  private sanitizeInput(message: any): PlayerInputMessage {
    const normalizedType = this.normalizeInputType(message?.type);
    const sanitized: PlayerInputMessage = {
      ...message,
      type: normalizedType,
      timestamp: typeof message?.timestamp === "number" ? message.timestamp : Date.now()
    };
    return sanitized;
  }

  private normalizeInputType(type: any): PlayerInputType {
    const allowedTypes: PlayerInputType[] = [
      "click",
      "arrow",
      "projectile",
      "position",
      "arrow_position",
      "projectile_position",
      "line",
      "projectile_explode",
      "stats",
      "bullet",
      "hit"
    ];

    return allowedTypes.includes(type) ? type : "position";
  }

  private lerp(current: number, target: number, factor: number): number {
    return current + (target - current) * factor;
  }

}

