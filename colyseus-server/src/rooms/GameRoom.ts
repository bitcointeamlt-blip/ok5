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
  | "hit"
  | "mine"
  | "healthpack"
  | "healthpack_pickup";

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

// --- Turn-based PvP (micro-turn) ---
type TurnPhase = "lobby" | "planning" | "execute";
type TurnShotType = "arrow" | "bullet" | "projectile";
interface TurnShotPlan {
  tMs: number; // 0..EXECUTE_MS
  type: TurnShotType;
  aimX: number;
  aimY: number;
}
interface TurnPlayerStats {
  dmg?: number;
  critChance?: number; // %
}
interface TurnPlan {
  destX: number;
  destY: number;
  shots: TurnShotPlan[]; // max 3
  stats?: TurnPlayerStats;
}
interface TurnEventBase {
  tMs: number;
  type: string;
}
interface TurnSpawnEvent extends TurnEventBase {
  type: "projectile_spawn";
  projectileId: string;
  shooterId: string;
  projType: TurnShotType;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface TurnHitEvent extends TurnEventBase {
  type: "hit";
  projectileId: string;
  shooterId: string;
  targetId: string;
  projType: TurnShotType;
  damage: number;
  isCrit: boolean;
}
type TurnEvent = TurnSpawnEvent | TurnHitEvent;

const TURN_PLAN_MS = 5000;
const TURN_EXECUTE_MS = 5000;
const TURN_WINDUP_MS = 200;
const TURN_MAX_SHOTS = 3;
const TURN_MIN_SHOT_SPACING_MS = 300;

// Arena (match client canvas coordinates)
const ARENA_LEFT = 240;
const ARENA_RIGHT = 1920;
const ARENA_TOP = 0;
const ARENA_BOTTOM = 1080 - 220;
const MID_WALL_X = (ARENA_LEFT + ARENA_RIGHT) / 2;
const MID_WALL_THICKNESS = 12;

const PLAYER_RADIUS = 25;
const MOVE_SPEED_PX_PER_S = 900;
const BULLET_SPEED_PX_PER_S = 18 * 60;
const ARROW_SPEED_PX_PER_S = 15 * 60;
const HEAVY_SPEED_PX_PER_S = 14.5 * 60;
const HEAVY_GRAVITY_PX_PER_S2 = 0.32 * 60 * 60;
const BULLET_RADIUS = 8;
const ARROW_RADIUS = 10;
const HEAVY_RADIUS = 16;

export class GameRoom extends Room<GameState> {
  maxClients = 2; // 2 players per match
  private latestPositionInputs = new Map<string, PendingInputEntry>();
  private pendingEventInputs = new Map<string, PendingInputEntry[]>();
  private lastContinuousBroadcasts = new Map<string, Map<PlayerInputType, ContinuousSnapshot>>();

  // Turn-based PvP state
  private _turnPlans = new Map<string, TurnPlan>();
  private _turnLocked = new Set<string>();
  private _turnPhaseTimer: any = null;
  private _turnRoundSeed = 0;

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

      // Turn-based PvP messages (micro-turn arena)
      this.onMessage("plan_submit", (client, message) => {
        try {
          this.handlePlanSubmit(client, message);
        } catch (error: any) {
          console.error("Error handling plan_submit:", error);
        }
      });
      this.onMessage("plan_lock", (client, _message) => {
        try {
          this.handlePlanLock(client);
        } catch (error: any) {
          console.error("Error handling plan_lock:", error);
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
    // Spawn players on fixed sides (helps turn-based PvP + avoids mid-wall issues)
    const isFirstPlayer = this.state.players.size === 0;
    player.x = isFirstPlayer ? ARENA_LEFT + (ARENA_RIGHT - ARENA_LEFT) * 0.25 : ARENA_LEFT + (ARENA_RIGHT - ARENA_LEFT) * 0.75;
    player.y = options.y || (ARENA_BOTTOM / 2);
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
    this._turnPlans.clear();
    this._turnLocked.clear();
    if (this._turnPhaseTimer) {
      try { this._turnPhaseTimer.clear(); } catch {}
      this._turnPhaseTimer = null;
    }
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
    
    if (allReady && this.state.players.size === 2 && !this.state.gameStarted) {
      this.broadcast("game_start", {
        message: "Game starting!"
      });
      this.state.gameStarted = true;
      // Start turn-based loop (planning -> execute) once both are ready.
      this.startTurnBasedLoop();
    }
  }

  // --- Turn-based PvP handlers ---
  private handlePlanSubmit(client: Client, message: any): void {
    if (!this.state.gameStarted) return;
    if (this.state.phase !== "planning") return;
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const plan = this.sanitizePlan(client.sessionId, message);
    this._turnPlans.set(client.sessionId, plan);
    // Any new submit unlocks (player changed plan)
    this._turnLocked.delete(client.sessionId);
    client.send("plan_ack", { roundId: this.state.roundId, locked: false });
  }

  private handlePlanLock(client: Client): void {
    if (!this.state.gameStarted) return;
    if (this.state.phase !== "planning") return;
    if (!this.state.players.has(client.sessionId)) return;
    this._turnLocked.add(client.sessionId);
    client.send("plan_ack", { roundId: this.state.roundId, locked: true });

    if (this._turnLocked.size >= 2 && this.state.players.size === 2) {
      // Both locked: start execute early.
      this.beginExecutePhase();
    }
  }

  private startTurnBasedLoop(): void {
    const now = Date.now();
    this.state.phase = "planning";
    this.state.roundId = Math.max(1, this.state.roundId + 1);
    this.state.executeStartAt = 0;
    this.state.phaseEndsAt = now + TURN_PLAN_MS;

    this._turnPlans.clear();
    this._turnLocked.clear();
    this._turnRoundSeed = (this.state.seed ^ (this.state.roundId * 2654435761)) >>> 0;

    // Create default plans from current positions (so even if player doesn't submit, round can run).
    for (const [sid, p] of this.state.players.entries()) {
      this._turnPlans.set(sid, {
        destX: p.x,
        destY: p.y,
        shots: [],
        stats: {}
      });
    }

    this.broadcast("phase", {
      phase: "planning" as TurnPhase,
      roundId: this.state.roundId,
      endsAt: this.state.phaseEndsAt
    });

    if (this._turnPhaseTimer) {
      try { this._turnPhaseTimer.clear(); } catch {}
      this._turnPhaseTimer = null;
    }
    this._turnPhaseTimer = (this.clock as any).setTimeout(() => this.beginExecutePhase(), TURN_PLAN_MS);
  }

  private beginExecutePhase(): void {
    if (!this.state.gameStarted) return;
    if (this.state.phase === "execute") return;
    if (this.state.players.size !== 2) return;

    // Stop any pending timer for planning.
    if (this._turnPhaseTimer) {
      try { this._turnPhaseTimer.clear(); } catch {}
      this._turnPhaseTimer = null;
    }

    const now = Date.now();
    const startAt = now + 300; // small buffer so both clients can start together
    this.state.phase = "execute";
    this.state.executeStartAt = startAt;
    this.state.phaseEndsAt = startAt + TURN_EXECUTE_MS;

    // Simulate the whole execute window right now and send deterministic events.
    const sim = this.simulateExecuteRound(this._turnPlans, this._turnRoundSeed);

    // Broadcast one payload that lets clients play the whole round offline (no jitter).
    this.broadcast("round_execute", {
      phase: "execute" as TurnPhase,
      roundId: this.state.roundId,
      seed: this._turnRoundSeed,
      startAt,
      durationMs: TURN_EXECUTE_MS,
      windupMs: TURN_WINDUP_MS,
      moveSpeed: MOVE_SPEED_PX_PER_S,
      arena: {
        left: ARENA_LEFT,
        right: ARENA_RIGHT,
        top: ARENA_TOP,
        bottom: ARENA_BOTTOM,
        midWallX: MID_WALL_X,
        midWallThickness: MID_WALL_THICKNESS
      },
      plans: sim.plans,
      events: sim.events,
      finalState: sim.finalState
    });

    // Apply final state on the server at the end of the execute window.
    const delayMs = Math.max(0, this.state.phaseEndsAt - Date.now());
    this._turnPhaseTimer = (this.clock as any).setTimeout(() => {
      try {
        for (const sid of Object.keys(sim.finalState.players)) {
          const p = this.state.players.get(sid);
          const fp = sim.finalState.players[sid];
          if (!p || !fp) continue;
          p.x = fp.x;
          p.y = fp.y;
          p.hp = fp.hp;
          p.armor = fp.armor;
        }
      } finally {
        // Next planning phase
        this.startTurnBasedLoop();
      }
    }, delayMs);
  }

  private sanitizePlan(sessionId: string, message: any): TurnPlan {
    const p = this.state.players.get(sessionId);
    const currentX = p?.x ?? (ARENA_LEFT + (ARENA_RIGHT - ARENA_LEFT) * 0.25);
    const currentY = p?.y ?? (ARENA_BOTTOM / 2);

    const destXRaw = typeof message?.destX === "number" ? message.destX : currentX;
    const destYRaw = typeof message?.destY === "number" ? message.destY : currentY;
    const dest = this.clampDestToSide(sessionId, destXRaw, destYRaw);

    const stats: TurnPlayerStats = {
      dmg: typeof message?.stats?.dmg === "number" ? Math.max(0, Math.min(999, message.stats.dmg)) : undefined,
      critChance: typeof message?.stats?.critChance === "number" ? Math.max(0, Math.min(100, message.stats.critChance)) : undefined
    };

    const shotsIn: any[] = Array.isArray(message?.shots) ? message.shots : [];
    const shots: TurnShotPlan[] = [];
    let lastT = -Infinity;
    for (const s of shotsIn) {
      if (shots.length >= TURN_MAX_SHOTS) break;
      const tMs = typeof s?.tMs === "number" ? Math.round(s.tMs) : 0;
      if (tMs < 0 || tMs > TURN_EXECUTE_MS) continue;
      if (tMs - lastT < TURN_MIN_SHOT_SPACING_MS) continue;
      const type: TurnShotType = (s?.type === "arrow" || s?.type === "bullet" || s?.type === "projectile") ? s.type : "bullet";
      const aimX = typeof s?.aimX === "number" ? s.aimX : MID_WALL_X;
      const aimY = typeof s?.aimY === "number" ? s.aimY : (ARENA_BOTTOM / 2);
      shots.push({ tMs, type, aimX, aimY });
      lastT = tMs;
    }

    return { destX: dest.x, destY: dest.y, shots, stats };
  }

  private clampDestToSide(sessionId: string, x: number, y: number): { x: number; y: number } {
    // Determine side by current position in server state.
    const p = this.state.players.get(sessionId);
    const isLeft = (p?.x ?? x) < MID_WALL_X;
    const half = MID_WALL_THICKNESS / 2;
    const minX = isLeft ? ARENA_LEFT + PLAYER_RADIUS : MID_WALL_X + half + PLAYER_RADIUS;
    const maxX = isLeft ? MID_WALL_X - half - PLAYER_RADIUS : ARENA_RIGHT - PLAYER_RADIUS;
    const cx = Math.max(minX, Math.min(maxX, x));
    const cy = Math.max(ARENA_TOP + PLAYER_RADIUS, Math.min(ARENA_BOTTOM - PLAYER_RADIUS, y));
    return { x: cx, y: cy };
  }

  private simulateExecuteRound(plans: Map<string, TurnPlan>, seed: number): {
    plans: Record<string, TurnPlan>;
    events: TurnEvent[];
    finalState: { players: Record<string, { x: number; y: number; hp: number; armor: number }> };
  } {
    const sids = Array.from(this.state.players.keys());
    const sidA = sids[0];
    const sidB = sids[1];
    const pA0 = this.state.players.get(sidA)!;
    const pB0 = this.state.players.get(sidB)!;

    const planA = plans.get(sidA) || { destX: pA0.x, destY: pA0.y, shots: [], stats: {} };
    const planB = plans.get(sidB) || { destX: pB0.x, destY: pB0.y, shots: [], stats: {} };

    const outPlans: Record<string, TurnPlan> = {
      [sidA]: planA,
      [sidB]: planB
    };

    // Deterministic RNG (LCG)
    let rngState = (seed >>> 0) || 1;
    const rand01 = () => {
      rngState = (rngState * 1664525 + 1013904223) >>> 0;
      return (rngState >>> 0) / 4294967296;
    };

    const events: TurnEvent[] = [];
    const players: Record<string, { x: number; y: number; hp: number; armor: number; startX: number; startY: number; destX: number; destY: number; }> = {
      [sidA]: { x: pA0.x, y: pA0.y, hp: pA0.hp, armor: pA0.armor, startX: pA0.x, startY: pA0.y, destX: planA.destX, destY: planA.destY },
      [sidB]: { x: pB0.x, y: pB0.y, hp: pB0.hp, armor: pB0.armor, startX: pB0.x, startY: pB0.y, destX: planB.destX, destY: planB.destY }
    };

    const planBySid: Record<string, TurnPlan> = { [sidA]: planA, [sidB]: planB };

    type SimProjectile = {
      id: string;
      shooterId: string;
      type: TurnShotType;
      x: number;
      y: number;
      vx: number;
      vy: number;
      alive: boolean;
      hit: boolean;
    };
    const projectiles: SimProjectile[] = [];

    const dtMs = SIMULATION_INTERVAL_MS; // 33ms
    const dtSec = dtMs / 1000;

    // Precompute spawn schedules per shooter
    type PendingSpawn = { spawnAtMs: number; shot: TurnShotPlan; shooterId: string };
    const pendingSpawns: PendingSpawn[] = [];
    for (const sid of [sidA, sidB]) {
      for (let i = 0; i < (planBySid[sid].shots || []).length; i++) {
        const shot = planBySid[sid].shots[i];
        const spawnAtMs = Math.max(0, Math.min(TURN_EXECUTE_MS, shot.tMs + TURN_WINDUP_MS));
        pendingSpawns.push({ spawnAtMs, shot, shooterId: sid });
      }
    }
    pendingSpawns.sort((a, b) => a.spawnAtMs - b.spawnAtMs);
    let nextSpawnIdx = 0;
    let projCounter = 0;

    const posAt = (sid: string, tSec: number) => {
      const pl = players[sid];
      const dx = pl.destX - pl.startX;
      const dy = pl.destY - pl.startY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0;
      if (dist <= 0.001) return { x: pl.startX, y: pl.startY };
      const travel = Math.min(dist, MOVE_SPEED_PX_PER_S * tSec);
      const nx = dx / dist;
      const ny = dy / dist;
      return { x: pl.startX + nx * travel, y: pl.startY + ny * travel };
    };

    const projParams = (type: TurnShotType) => {
      switch (type) {
        case "arrow": return { speed: ARROW_SPEED_PX_PER_S, radius: ARROW_RADIUS, gravity: 0 };
        case "projectile": return { speed: HEAVY_SPEED_PX_PER_S, radius: HEAVY_RADIUS, gravity: HEAVY_GRAVITY_PX_PER_S2 };
        case "bullet":
        default:
          return { speed: BULLET_SPEED_PX_PER_S, radius: BULLET_RADIUS, gravity: 0 };
      }
    };

    const computeDamage = (shooterId: string, projType: TurnShotType): { damage: number; isCrit: boolean } => {
      const dmg = (typeof planBySid[shooterId].stats?.dmg === "number" ? planBySid[shooterId].stats!.dmg! : 1);
      const critChance = (typeof planBySid[shooterId].stats?.critChance === "number" ? planBySid[shooterId].stats!.critChance! : 4);
      const isCrit = rand01() < (critChance / 100);

      let base = dmg;
      if (projType === "arrow") base = isCrit ? dmg * 3 : dmg * 2;
      else if (projType === "projectile") base = isCrit ? dmg * 3 : dmg * 2;
      else base = isCrit ? dmg * 2 : dmg * 1;

      const variance = 0.5 + rand01() * 0.5; // 50%..100%
      const finalDamage = Math.max(0, Math.round(base * variance));
      return { damage: finalDamage, isCrit };
    };

    const applyDamage = (targetId: string, damage: number) => {
      const t = players[targetId];
      const absorbed = Math.min(damage, t.armor);
      t.armor -= absorbed;
      const rem = damage - absorbed;
      t.hp = Math.max(0, t.hp - rem);
    };

    for (let tMs = 0; tMs <= TURN_EXECUTE_MS; tMs += dtMs) {
      const tSec = tMs / 1000;

      // Update player positions (deterministic)
      for (const sid of [sidA, sidB]) {
        const p = posAt(sid, tSec);
        players[sid].x = p.x;
        players[sid].y = p.y;
      }

      // Spawn projectiles due at this time slice
      while (nextSpawnIdx < pendingSpawns.length && pendingSpawns[nextSpawnIdx].spawnAtMs <= tMs) {
        const ps = pendingSpawns[nextSpawnIdx++];
        const shooterId = ps.shooterId;
        const shot = ps.shot;
        const shooterPos = posAt(shooterId, ps.spawnAtMs / 1000);
        const params = projParams(shot.type);
        const dx = shot.aimX - shooterPos.x;
        const dy = shot.aimY - shooterPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const vx = ux * params.speed;
        const vy = uy * params.speed;
        const id = `p${this.roomId}_${this.state.roundId}_${projCounter++}`;
        projectiles.push({ id, shooterId, type: shot.type, x: shooterPos.x, y: shooterPos.y, vx, vy, alive: true, hit: false });
        events.push({
          type: "projectile_spawn",
          tMs: ps.spawnAtMs,
          projectileId: id,
          shooterId,
          projType: shot.type,
          x: shooterPos.x,
          y: shooterPos.y,
          vx,
          vy
        });
      }

      // Update projectiles + check hits
      for (const proj of projectiles) {
        if (!proj.alive || proj.hit) continue;
        const params = projParams(proj.type);
        // Integrate (px/s)
        proj.x += proj.vx * dtSec;
        proj.y += proj.vy * dtSec;
        if (params.gravity) {
          proj.vy += params.gravity * dtSec;
        }

        // Bounds kill (a bit generous)
        if (proj.x < ARENA_LEFT - 200 || proj.x > ARENA_RIGHT + 200 || proj.y < ARENA_TOP - 200 || proj.y > ARENA_BOTTOM + 200) {
          proj.alive = false;
          continue;
        }

        const targetId = (proj.shooterId === sidA) ? sidB : sidA;
        const tp = players[targetId];
        if (tp.hp <= 0) continue;
        const dx = tp.x - proj.x;
        const dy = tp.y - proj.y;
        const hitR = PLAYER_RADIUS + params.radius;
        if (dx * dx + dy * dy <= hitR * hitR) {
          const dmgRes = computeDamage(proj.shooterId, proj.type);
          applyDamage(targetId, dmgRes.damage);
          proj.hit = true;
          events.push({
            type: "hit",
            tMs,
            projectileId: proj.id,
            shooterId: proj.shooterId,
            targetId,
            projType: proj.type,
            damage: dmgRes.damage,
            isCrit: dmgRes.isCrit
          });
        }
      }
    }

    const finalState = {
      players: {
        [sidA]: { x: players[sidA].x, y: players[sidA].y, hp: players[sidA].hp, armor: players[sidA].armor },
        [sidB]: { x: players[sidB].x, y: players[sidB].y, hp: players[sidB].hp, armor: players[sidB].armor }
      }
    };

    // Ensure events are time-ordered
    events.sort((a, b) => a.tMs - b.tMs);

    return { plans: outPlans, events, finalState };
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
      "hit",
      "mine",
      "healthpack",
      "healthpack_pickup"
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

