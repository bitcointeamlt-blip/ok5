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
const CONTINUOUS_TYPES: PlayerInputType[] = ["position", "arrow_position", "projectile_position", "stats"];
const POSITION_BROADCAST_DISTANCE_EPSILON = 8;
const POSITION_BROADCAST_VELOCITY_EPSILON = 1;
const POSITION_BROADCAST_HEARTBEAT_MS = 400;
const PROJECTILE_BROADCAST_DISTANCE_EPSILON = 12;
const PROJECTILE_BROADCAST_VELOCITY_EPSILON = 1;
const PROJECTILE_BROADCAST_HEARTBEAT_MS = 350;
const ARROW_BROADCAST_ANGLE_EPSILON = 0.12;
const STATS_BROADCAST_HEARTBEAT_MS = 1500;

interface ContinuousSnapshot {
  timestamp: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  angle?: number;
  hp?: number;
  armor?: number;
  maxHP?: number;
  maxArmor?: number;
  paralyzedUntil?: number;
}

export class GameRoom extends Room<GameState> {
  maxClients = 2; // 2 players per match
  private latestPositionInputs = new Map<string, PendingInputEntry>();
  private pendingEventInputs = new Map<string, PendingInputEntry[]>();
  private lastContinuousBroadcasts = new Map<string, Map<PlayerInputType, ContinuousSnapshot>>();

  // #region agent log
  private _agentStats = {
    lastFlushTs: 0,
    inCount: 0,
    inBytes: 0,
    inByType: {} as Record<string, number>,
    outCount: 0,
    outBytes: 0,
    outByType: {} as Record<string, number>,
    droppedCount: 0,
    droppedByType: {} as Record<string, number>,
    tickCount: 0,
    tickMsTotal: 0
  };
  private _agentSafeJsonSize(obj: any): number {
    try { return JSON.stringify(obj).length; } catch { return -1; }
  }
  private _agentMaybeFlush(serverTimestamp: number, extra?: any): void {
    if (serverTimestamp - this._agentStats.lastFlushTs < 1000) return;
    this._agentStats.lastFlushTs = serverTimestamp;
    // NOTE: We log to BOTH local ingest (for local debugging) and console (for Colyseus Cloud logs).
    const payload = {
      roomId: this.roomId,
      players: this.state?.players?.size || 0,
      inCount: this._agentStats.inCount,
      inBytes: this._agentStats.inBytes,
      inByType: this._agentStats.inByType,
      outCount: this._agentStats.outCount,
      outBytes: this._agentStats.outBytes,
      outByType: this._agentStats.outByType,
      droppedCount: this._agentStats.droppedCount,
      droppedByType: this._agentStats.droppedByType,
      tickCount: this._agentStats.tickCount,
      tickMsAvg: this._agentStats.tickCount ? Math.round(this._agentStats.tickMsTotal / this._agentStats.tickCount) : 0,
      queues: extra?.queues
    };
    try {
      console.log("[AGENT_STATS]", JSON.stringify(payload));
    } catch {
      console.log("[AGENT_STATS]", payload);
    }
    fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'colyseus-server/src/rooms/GameRoom.ts:agentFlush',message:'room net/tick stats (1s window)',data:payload,timestamp:Date.now(),sessionId:'debug-session',runId:'baseline',hypothesisId:'H3'})}).catch(()=>{});
    this._agentStats.inCount = 0;
    this._agentStats.inBytes = 0;
    this._agentStats.inByType = {};
    this._agentStats.outCount = 0;
    this._agentStats.outBytes = 0;
    this._agentStats.outByType = {};
    this._agentStats.droppedCount = 0;
    this._agentStats.droppedByType = {};
    this._agentStats.tickCount = 0;
    this._agentStats.tickMsTotal = 0;
  }
  // #endregion

  onCreate(options: any) {
    try {
      console.log("GameRoom created:", this.roomId);
      registerRoom(this.roomId);

      // #region agent log
      try {
        const f: any = (globalThis as any).fetch;
        if (typeof f === "function") {
          f('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'colyseus-server/src/rooms/GameRoom.ts:onCreate',message:'server started room (agent probe)',data:{roomId:this.roomId},timestamp:Date.now(),sessionId:'debug-session',runId:'baseline',hypothesisId:'H3'})}).catch(()=>{});
        }
      } catch {}
      // #endregion
      
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

      this.onMessage("ping", (client, message) => {
        try {
          client.send("pong", { t0: message?.t0, serverTs: Date.now() });
        } catch {}
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
    this.lastContinuousBroadcasts.delete(client.sessionId);
    
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
    this.lastContinuousBroadcasts.clear();
    unregisterRoom(this.roomId);
  }

  handlePlayerInput(client: Client, message: any) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const sanitizedInput = this.sanitizeInput(message);
    // #region agent log
    try {
      const t = sanitizedInput?.type || "unknown";
      this._agentStats.inCount += 1;
      this._agentStats.inBytes += this._agentSafeJsonSize(sanitizedInput);
      this._agentStats.inByType[t] = (this._agentStats.inByType[t] || 0) + 1;
    } catch {}
    // #endregion
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
    // #region agent log
    const _agentTickStart = serverTimestamp;
    // #endregion

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

    // #region agent log
    try {
      const tickMs = Date.now() - _agentTickStart;
      this._agentStats.tickCount += 1;
      this._agentStats.tickMsTotal += tickMs;
      let pendingEventTotal = 0;
      for (const q of this.pendingEventInputs.values()) pendingEventTotal += q.length;
      this._agentMaybeFlush(Date.now(), { queues: { latestPosition: this.latestPositionInputs.size, pendingEventTotal } });
    } catch {}
    // #endregion
  }

  private emitInputToOpponents(pending: PendingInputEntry, serverTimestamp: number): void {
    if (!this.shouldBroadcastInput(pending, serverTimestamp)) {
      // #region agent log
      try {
        const t = pending?.input?.type || "unknown";
        this._agentStats.droppedCount += 1;
        this._agentStats.droppedByType[t] = (this._agentStats.droppedByType[t] || 0) + 1;
      } catch {}
      // #endregion
      return;
    }

    // #region agent log
    try {
      const outMsg = { ...pending.input, serverTimestamp };
      const t = pending?.input?.type || "unknown";
      this._agentStats.outCount += 1;
      this._agentStats.outBytes += this._agentSafeJsonSize(outMsg);
      this._agentStats.outByType[t] = (this._agentStats.outByType[t] || 0) + 1;
    } catch {}
    // #endregion
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

  private shouldBroadcastInput(pending: PendingInputEntry, serverTimestamp: number): boolean {
    const inputType = pending.input.type;
    const sessionId = pending.client.sessionId;

    if (!CONTINUOUS_TYPES.includes(inputType)) {
      return true;
    }

    const perPlayer = this.lastContinuousBroadcasts.get(sessionId) || new Map<PlayerInputType, ContinuousSnapshot>();
    const lastSnapshot = perPlayer.get(inputType);

    if (!lastSnapshot) {
      perPlayer.set(inputType, this.createSnapshot(pending.input, serverTimestamp));
      this.lastContinuousBroadcasts.set(sessionId, perPlayer);
      return true;
    }

    const heartbeat = this.getHeartbeatForType(inputType);
    const elapsed = serverTimestamp - lastSnapshot.timestamp;
    let hasMeaningfulChange = false;

    switch (inputType) {
      case "position":
        hasMeaningfulChange = this.hasMovementDelta(
          pending.input,
          lastSnapshot,
          POSITION_BROADCAST_DISTANCE_EPSILON,
          POSITION_BROADCAST_VELOCITY_EPSILON
        );
        break;
      case "arrow_position":
        hasMeaningfulChange = this.hasMovementDelta(
          pending.input,
          lastSnapshot,
          PROJECTILE_BROADCAST_DISTANCE_EPSILON,
          PROJECTILE_BROADCAST_VELOCITY_EPSILON,
          ARROW_BROADCAST_ANGLE_EPSILON
        );
        break;
      case "projectile_position":
        hasMeaningfulChange = this.hasMovementDelta(
          pending.input,
          lastSnapshot,
          PROJECTILE_BROADCAST_DISTANCE_EPSILON,
          PROJECTILE_BROADCAST_VELOCITY_EPSILON
        );
        break;
      case "stats":
        hasMeaningfulChange = this.hasStatsDelta(pending.input, lastSnapshot);
        break;
      default:
        hasMeaningfulChange = true;
    }

    if (!hasMeaningfulChange && elapsed < heartbeat) {
      return false;
    }

    perPlayer.set(inputType, this.createSnapshot(pending.input, serverTimestamp));
    this.lastContinuousBroadcasts.set(sessionId, perPlayer);
    return true;
  }

  private getHeartbeatForType(type: PlayerInputType): number {
    switch (type) {
      case "stats":
        return STATS_BROADCAST_HEARTBEAT_MS;
      case "position":
        return POSITION_BROADCAST_HEARTBEAT_MS;
      case "arrow_position":
      case "projectile_position":
        return PROJECTILE_BROADCAST_HEARTBEAT_MS;
      default:
        return 250;
    }
  }

  private hasMovementDelta(
    current: PlayerInputMessage,
    last: ContinuousSnapshot,
    distanceEpsilon: number,
    velocityEpsilon: number,
    angleEpsilon?: number
  ): boolean {
    if (typeof current.x === "number" && typeof current.y === "number" && typeof last.x === "number" && typeof last.y === "number") {
      const dx = current.x - last.x;
      const dy = current.y - last.y;
      if (dx * dx + dy * dy >= distanceEpsilon * distanceEpsilon) {
        return true;
      }
    } else if (typeof current.x === "number" || typeof current.y === "number") {
      return true;
    }

    if (typeof current.vx === "number" && typeof last.vx === "number") {
      if (Math.abs(current.vx - last.vx) > velocityEpsilon) {
        return true;
      }
    } else if (typeof current.vx === "number") {
      return true;
    }

    if (typeof current.vy === "number" && typeof last.vy === "number") {
      if (Math.abs(current.vy - last.vy) > velocityEpsilon) {
        return true;
      }
    } else if (typeof current.vy === "number") {
      return true;
    }

    if (typeof angleEpsilon === "number") {
      if (typeof current.angle === "number" && typeof last.angle === "number") {
        if (Math.abs(current.angle - last.angle) > angleEpsilon) {
          return true;
        }
      } else if (typeof current.angle === "number") {
        return true;
      }
    }

    return false;
  }

  private hasStatsDelta(current: PlayerInputMessage, last: ContinuousSnapshot): boolean {
    if (typeof current.hp === "number" && current.hp !== last.hp) {
      return true;
    }
    if (typeof current.armor === "number" && current.armor !== last.armor) {
      return true;
    }
    if (typeof current.maxHP === "number" && current.maxHP !== last.maxHP) {
      return true;
    }
    if (typeof current.maxArmor === "number" && current.maxArmor !== last.maxArmor) {
      return true;
    }
    if (typeof current.paralyzedUntil === "number") {
      if (current.paralyzedUntil !== last.paralyzedUntil) {
        return true;
      }
    } else if (typeof last.paralyzedUntil === "number") {
      return true;
    }
    return false;
  }

  private createSnapshot(input: PlayerInputMessage, timestamp: number): ContinuousSnapshot {
    return {
      timestamp,
      x: input.x,
      y: input.y,
      vx: input.vx,
      vy: input.vy,
      angle: input.angle,
      hp: input.hp,
      armor: input.armor,
      maxHP: input.maxHP,
      maxArmor: input.maxArmor,
      paralyzedUntil: input.paralyzedUntil
    };
  }

}

