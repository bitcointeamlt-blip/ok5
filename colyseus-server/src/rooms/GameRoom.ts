import { Room, Client } from "@colyseus/core";
import { GameState, Player } from "../schema/GameState";
import { registerRoom, unregisterRoom, updateRoomPlayerCount } from "../metrics/RoomMetrics";
import { fetchSoloStatsForAddress } from "../services/SupabaseStats";
import { ufoTicketService } from "../services/UfoTicketService";
import { nftBonusService } from "../services/NftBonusService";
import { MatchRecorder } from "../replay/MatchRecorder";
import type { ReplayEndReason } from "../replay/ReplayTypes";
import { randomBytes } from "crypto";

// Helper function for secure random integer (works on all Node.js versions)
function secureRandomInt(max: number): number {
  const bytes = randomBytes(4);
  const value = bytes.readUInt32BE(0);
  return value % max;
}

type PlayerInputType =
  | "click"
  | "dash"
  | "arrow"
  | "projectile"
  | "position"
  | "arrow_position"
  | "projectile_position"
  | "line"
  | "projectile_explode"
  | "stats"
  | "bullet"
  | "stone_bounce"
  | "stone_hit"
  | "hit"
  | "mine"
  | "healthpack"
  | "healthpack_pickup"
  | "tnt"
  | "tnt_stick"
  | "tnt_explode";

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
  critChance?: number;
  damage?: number;
  targetPlayerId?: string;
  isBullet?: boolean;
  paralysisDuration?: number;
  paralyzedUntil?: number;
  // Stone collision event (server -> clients)
  impactX?: number;
  impactY?: number;
  projType?: "arrow" | "bullet" | "projectile";
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

// --- Match lifecycle ---
// Goal: prevent "stuck rooms" and prevent 3rd/4th players from joining an in-progress match.
// 90s match duration + 5s grace to show result, then disconnect room to auto-dispose.
const MATCH_DURATION_MS = 90_000;
const MATCH_GRACE_MS = 5_000;
// If a room sits with only 1 player for too long, kick/dispose it so matchmaking doesn't look "stuck".
const LOBBY_WAIT_TIMEOUT_MS = 90_000;
// If 2 players joined but nobody starts (READY not pressed), auto-cancel to prevent stuck matches.
const READY_WAIT_TIMEOUT_MS = 35_000;

// Global action rate limit: prevent spam (reduces server load + bandwidth).
// We only rate-limit "event" inputs (not continuous position streams).
const ACTION_COOLDOWN_MS = 1000;
const ACTION_PENALTY_MS = 2000;

// --- Anti-cheat / stat hardening ---
// We intentionally keep these conservative to preserve gameplay feel while blocking obvious client tampering.
const STATS_MIN_INTERVAL_MS = 180; // ignore stats spam faster than this
const MAX_HP_INCREASE_PER_STATS = 30; // healthpack-like increases only
const MAX_ARMOR_INCREASE_PER_STATS = 3; // regen-like increases only
const MAX_DAMAGE_PER_HIT = 300; // clamp client-driven hit packets
const HIT_MIN_INTERVAL_MS = 140; // prevent hit spam (client-driven hits)
// PvP armor regeneration (client-driven) uses a 5s tick in frontend.
// When UFO_TICKET_USE_ONCHAIN_STATS=true we still allow ONLY this small regen-like increase,
// otherwise armor never regenerates and gameplay feels wrong.
const ARMOR_REGEN_TICK_MS = 5000;
// Max regen per tick is derived per-player from Ronkeverse NFT count (server-side verified).

// Bullet/projectile hit validity windows (must be within these windows after a fire event).
const BULLET_HIT_WINDOW_MS = 3500;
const PROJECTILE_HIT_WINDOW_MS = 5200;
const MINE_HIT_WINDOW_MS = 12000;
const SPIKE_HIT_WINDOW_MS = 1500;
const TNT_HIT_WINDOW_MS = 8000; // TNT can hit within 8 seconds of firing

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
  fuel?: number; // 0..maxFuel
  maxFuel?: number; // usually 100
}
interface TurnPlan {
  track: Array<{ tMs: number; x: number; y: number }>; // sampled shadow trajectory (0..EXECUTE_MS)
  spawns: Array<{ tMs: number; projType: TurnShotType; x: number; y: number; vx: number; vy: number }>; // projectile spawns (vx/vy in px/s)
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

// Turn timing:
// - Planning: player inputs/recording window
// - Sync buffer: short gap for submit/lock/clock sync before execute starts
// - Execute: deterministic replay window
const TURN_PLAN_MS = 9000;
const TURN_SYNC_BUFFER_MS = 1000;
const TURN_EXECUTE_MS = 10000;
const TURN_WINDUP_MS = 0;
const TURN_MAX_TRACK_POINTS = 90;
const TURN_MAX_SPAWNS = 60;

// Arena (match client canvas coordinates)
const ARENA_LEFT = 240;
const ARENA_RIGHT = 1920;
const ARENA_TOP = 0;
// Match client:
// - groundY = 1080 - 220
// - PVP_BOTTOM_FLOOR_Y = groundY + 98
// Keeping server in sync prevents "ghost" stone hits where the server hitbox is offset vs client debug overlay.
const ARENA_BOTTOM = (1080 - 220) + 98;
const MID_WALL_X = (ARENA_LEFT + ARENA_RIGHT) / 2;
const MID_WALL_THICKNESS = 12;

// Center obstacle (stone): blocks projectiles (bounce) and helps gameplay feel less "flat".
// NOTE: Client draws sprite; server only needs circle collider for authoritative projectile simulation.
const CENTER_OBSTACLE_ENABLED = true;
// Match client: sprite is 1536x1024 => aspect (h/w) = 0.6667
const STONE_RENDER_R = 132;
const STONE_ASPECT = 0.6667;
const STONE_HALF_W = STONE_RENDER_R * 1.025;
const STONE_HALF_H = STONE_HALF_W * STONE_ASPECT;
const STONE_BASE_R = STONE_HALF_H; // radii scale
const STONE_HITBOX: Array<{ u: number; v: number; r: number }> = [
  { u: 0.02, v: 0.06, r: 0.92 },
  { u: -0.44, v: 0.10, r: 0.62 },
  { u: 0.46, v: -0.02, r: 0.62 },
  { u: -0.06, v: 0.58, r: 0.56 },
  // Top was sticking out too much; keep it tighter so arrows don't "hit air" above the sprite.
  { u: -0.10, v: -0.36, r: 0.32 },
  { u: 0.18, v: -0.26, r: 0.28 }
];
const CENTER_OBSTACLE_X = (ARENA_LEFT + ARENA_RIGHT) / 2;
const CENTER_OBSTACLE_Y = (ARENA_TOP + ARENA_BOTTOM) / 2;

function collideCircleWithStone(x: number, y: number, r: number): null | { nx: number; ny: number; depth: number } {
  if (!CENTER_OBSTACLE_ENABLED) return null;
  // quick reject
  const br = Math.max(STONE_HALF_W, STONE_HALF_H) + r + 4;
  const qx = x - CENTER_OBSTACLE_X;
  const qy = y - CENTER_OBSTACLE_Y;
  if (qx * qx + qy * qy > br * br) return null;

  let best: null | { nx: number; ny: number; depth: number } = null;
  for (const c of STONE_HITBOX) {
    const sx = CENTER_OBSTACLE_X + c.u * STONE_HALF_W;
    const sy = CENTER_OBSTACLE_Y + c.v * STONE_HALF_H;
    const rr = c.r * STONE_BASE_R;
    const dx = x - sx;
    const dy = y - sy;
    const minDist = r + rr;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minDist * minDist) continue;
    const d = Math.max(0.0001, Math.sqrt(d2));
    const nx = dx / d;
    const ny = dy / d;
    const depth = (minDist - d);
    if (!best || depth > best.depth) best = { nx, ny, depth };
  }
  return best;
}

function resolveStonePushOut(x: number, y: number, r: number): { x: number; y: number } {
  let nx = x, ny = y;
  for (let i = 0; i < 4; i++) {
    const hit = collideCircleWithStone(nx, ny, r);
    if (!hit) break;
    nx += hit.nx * (hit.depth + 0.35);
    ny += hit.ny * (hit.depth + 0.35);
  }
  return { x: nx, y: ny };
}

function dashStopBeforeStone(fromX: number, fromY: number, toX: number, toY: number, r: number): { x: number; y: number } {
  if (!CENTER_OBSTACLE_ENABLED) return { x: toX, y: toY };

  const start = resolveStonePushOut(fromX, fromY, r);
  fromX = start.x; fromY = start.y;

  const steps = 18;
  let firstHitT: number | null = null;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = fromX + (toX - fromX) * t;
    const py = fromY + (toY - fromY) * t;
    if (collideCircleWithStone(px, py, r)) {
      firstHitT = t;
      break;
    }
  }
  if (firstHitT === null) {
    return resolveStonePushOut(toX, toY, r);
  }

  let lo = Math.max(0, firstHitT - 1 / steps);
  let hi = firstHitT;
  for (let it = 0; it < 11; it++) {
    const mid = (lo + hi) / 2;
    const px = fromX + (toX - fromX) * mid;
    const py = fromY + (toY - fromY) * mid;
    if (collideCircleWithStone(px, py, r)) hi = mid;
    else lo = mid;
  }

  const back = 0.005;
  const tFinal = Math.max(0, lo - back);
  const fx = fromX + (toX - fromX) * tFinal;
  const fy = fromY + (toY - fromY) * tFinal;
  return resolveStonePushOut(fx, fy, r);
}

const PLAYER_RADIUS = 25;
const MOVE_SPEED_PX_PER_S = 900;
const BULLET_SPEED_PX_PER_S = 18 * 60;
const ARROW_SPEED_PX_PER_S = 15 * 60;
const HEAVY_SPEED_PX_PER_S = 14.5 * 60;
const HEAVY_GRAVITY_PX_PER_S2 = 0.32 * 60 * 60;
const BULLET_RADIUS = 8;
const ARROW_RADIUS = 10;
const HEAVY_RADIUS = 16;
// TNT weapon constants
const TNT_FALL_SPEED_PX_PER_S = 600; // Falls straight down
const TNT_RADIUS = 20; // Collision radius
const TNT_FUSE_MS = 3000; // 3 seconds fuse after sticking
const TNT_EXPLOSION_RADIUS = 80; // AOE explosion radius
const TNT_DAMAGE_MULTIPLIER = 2.5; // Damage multiplier

// --- Compound player hitbox (matches UFO sprite shape better than a single circle) ---
// Two circles, centered vertically (top "dome" + bottom "body"), all in world px relative to Player.x/y.
// Used for server-authoritative projectile hits (currently: arrows).
const PLAYER_HITBOX_CIRCLES: Array<{ ox: number; oy: number; r: number }> = [
  { ox: 0, oy: -14, r: 18 }, // top dome
  { ox: 0, oy: 10, r: 24 }   // lower body
];

function clampNum(v: any, min: number, max: number, fallback: number): number {
  const n = (typeof v === "number" && Number.isFinite(v)) ? v : fallback;
  return Math.max(min, Math.min(max, n));
}

function envBool(name: string, fallback = false): boolean {
  const v = (process.env[name] || "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function hash32(x: number): number {
  // xorshift-ish avalanche for deterministic pseudo-rng
  x |= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

export class GameRoom extends Room<GameState> {
  maxClients = 2; // 2 players per match
  private latestPositionInputs = new Map<string, PendingInputEntry>();
  private pendingEventInputs = new Map<string, PendingInputEntry[]>();
  private lastContinuousBroadcasts = new Map<string, Map<PlayerInputType, ContinuousSnapshot>>();
  private nextActionAtBySid = new Map<string, number>();
  private nextHitAtBySid = new Map<string, number>();
  private lastStatsAtBySid = new Map<string, number>();
  // Track last damage + last allowed regen per player (server-side hardening).
  private lastDamageAtBySid = new Map<string, number>();
  private lastArmorRegenAtBySid = new Map<string, number>();
  private nftCountBySid = new Map<string, number>();

  private maxArmorRegenPerTickForSid(sid: string): number {
    const n = this.nftCountBySid.get(sid) || 0;
    return n >= 1 ? 2 : 1;
  }

  // PvP offense stats (authoritative on server). In competitive mode, these should come from server DB.
  private dmgBySid = new Map<string, number>();
  private critChanceBySid = new Map<string, number>(); // %
  private accuracyBySid = new Map<string, number>(); // %

  // Track recent weapon fires so client can't send naked "hit" packets without firing.
  private lastFireAtBySid = new Map<string, { bullet: number; projectile: number; mine: number; spike: number; tnt: number }>();
  // UFO ticket (SBT) enforcement: tokenId per session (server-side only; not synced to clients).
  private ticketTokenIdBySid = new Map<string, bigint>();

  // Replay recorder (server-side logging + replay support)
  private _recorder: MatchRecorder | null = null;

  private isFunRoom(): boolean {
    return (this.roomName || "") === "pvp_fun_room";
  }
  private _hitSeq = 0;

  // Server-authoritative arrow simulation (for consistent hit/miss across clients)
  private _liveArrows: Array<{
    id: string;
    shooterId: string;
    targetId: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    lastAt: number;
    dmg: number;
    critChance: number;
    travelPx: number;
    bounceCount: number;
    canDamage: boolean;
    maxTravelPx: number;
    expireAt: number; // ms timestamp; 0 = no forced expiry
  }> = [];
  private _liveArrowSeq = 0;

  // Server-authoritative TNT simulation (falls from UFO, sticks to target, explodes after 3s)
  private _liveTnt: Array<{
    id: string;
    shooterId: string;
    x: number;
    y: number;
    vy: number; // Only vertical velocity (falls straight down)
    spawnedAt: number; // ms timestamp when fired
    stuckToPlayerId: string | null; // If stuck to a player
    stuckAt: number; // ms timestamp when stuck (0 = not stuck yet)
    exploded: boolean;
    dmg: number;
    critChance: number;
  }> = [];
  private _liveTntSeq = 0;

  // Turn-based PvP state
  private _turnEnabled = false;
  private _turnPlans = new Map<string, TurnPlan>();
  private _turnLocked = new Set<string>();
  private _turnPhaseTimer: any = null;
  private _turnRoundSeed = 0;

  // Match lifecycle state
  private _matchStartAt = 0;
  private _matchEndAt = 0;
  private _matchEnded = false;
  private _endTimer: any = null;
  private _lobbyWaitTimer: any = null;
  private _readyWaitTimer: any = null;

  private endMatch(reason: "timeout" | "player_left" | "death", winnerSid: string | null): void {
    if (this._matchEnded) return;
    this._matchEnded = true;

    const now = Date.now();
    const replayId = this._recorder?.getId() || null;
    try {
      const players = Array.from(this.state.players.values());
      this.broadcast("match_end", {
        reason,
        winnerSid, // sessionId (null => draw)
        serverTs: now,
        players: players.map((p) => ({ sid: p.sessionId, hp: p.hp, armor: p.armor })),
        replayId
      } as any);
    } catch {}

    // Record match end + final snapshot
    try {
      const endReason: ReplayEndReason =
        reason === "timeout" ? "timeout" :
        reason === "death" ? "death" :
        "player_left";
      this._recorder?.endMatch({ endedAt: now, reason: endReason, winnerSid });
      this._recorder?.maybeSnapshot(this.state, this.state.players as any, true);
    } catch {}

    // UFO ticket: if we have a clear winner/loser, burn loser ticket and payout winner (100 RONKE) via contract.
    // FUN PvP: never burn/payout.
    try {
      if (!this.isFunRoom() && winnerSid) {
        // In "player_left" flow, state.players might already be size=1 (loser removed),
        // so we derive loserSid from the server-side ticket map (still present until cleanup finishes).
        const allTicketSids = Array.from(this.ticketTokenIdBySid.keys());
        const loserSid = allTicketSids.find((sid) => sid !== winnerSid) || null;
        const winner = this.state.players.get(winnerSid) || null;
        const loserTokenId = loserSid ? (this.ticketTokenIdBySid.get(loserSid) || 0n) : 0n;
        const winnerAddr = (winner?.address || "").trim();
        if (loserTokenId && winnerAddr) {
          // Capture settlement details for replay/audit (txHash filled async)
          try {
            this._recorder?.setSettlement({
              loserTokenId: loserTokenId.toString(),
              winnerAddress: winnerAddr
            });
          } catch {}

          ufoTicketService
            .resolveMatchBurnAndPayout(loserTokenId, winnerAddr)
            .then((hash) => {
              try {
                if (hash) this._recorder?.setSettlement({ txHash: hash });
              } catch {}
            })
            .catch(() => {});
        }
      }
    } catch {}

    // After grace, disconnect everyone so the room auto-disposes and can never be reused.
    if (this._endTimer) {
      try { this._endTimer.clear(); } catch {}
      this._endTimer = null;
    }
    this._endTimer = (this.clock as any).setTimeout(() => {
      try {
        // Colyseus Room has disconnect() in recent versions
        (this as any).disconnect?.();
      } catch {}
    }, MATCH_GRACE_MS);
  }

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
      // Start replay recorder early (captures joins and pre-start state).
      try {
        this._recorder = new MatchRecorder({ roomId: this.roomId, roomName: this.roomName, snapshotIntervalMs: 100 });
      } catch {}
      // Ensure empty rooms are disposed automatically.
      (this as any).autoDispose = true;
      registerRoom(this.roomId, "pvp");
      // Replay/turn-based mode disabled: all rooms (including pvp_5sec_room) run as live realtime gameplay.
      // (We keep the code around for potential future experiments, but it's not active.)
      this._turnEnabled = false;
      // #region agent log
      try {
        fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'colyseus-server/src/rooms/GameRoom.ts:onCreate',message:'turn mode enabled?',data:{roomId:this.roomId,roomName:this.roomName,turnEnabled:this._turnEnabled},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1'})}).catch(()=>{});
      } catch {}
      // #endregion

      // #region agent log
      try {
        const f: any = (globalThis as any).fetch;
        if (typeof f === "function") {
          f('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'colyseus-server/src/rooms/GameRoom.ts:onCreate',message:'server started room (agent probe)',data:{roomId:this.roomId},timestamp:Date.now(),sessionId:'debug-session',runId:'baseline',hypothesisId:'H3'})}).catch(()=>{});
        }
      } catch {}
      // #endregion
      
      // Initialize game state with cryptographically secure seed
      const state = new GameState();
      state.seed = secureRandomInt(1000000);
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

  async onJoin(client: Client, options: any) {
    console.log(`Player ${client.sessionId} joined room ${this.roomId}`);
    
    const player = new Player();
    player.sessionId = client.sessionId;
    player.address = options.address || ""; // Ronin wallet address
    // Optional: NFT profile picture URL (shown inside UFO for opponent)
    if (typeof options?.profilePicture === "string") {
      // Keep it bounded to avoid abusive payload sizes
      player.profilePicture = options.profilePicture.slice(0, 512);
    }
    // Spawn players on fixed sides (helps turn-based PvP + avoids mid-wall issues)
    const isFirstPlayer = this.state.players.size === 0;
    player.x = isFirstPlayer ? ARENA_LEFT + (ARENA_RIGHT - ARENA_LEFT) * 0.25 : ARENA_LEFT + (ARENA_RIGHT - ARENA_LEFT) * 0.75;
    player.y = options.y || (ARENA_BOTTOM / 2);
    // Initialize stats (server-authoritative defaults). In competitive mode we still clamp hard here.
    // Later we can overwrite from DB (Supabase) once fetched.
    const maxHP = clampNum(options?.maxHP, 1, 250, 100);
    const hp = clampNum(options?.hp, 0, maxHP, maxHP);
    const maxArmor = clampNum(options?.maxArmor, 0, 200, 50);
    const armor = clampNum(options?.armor, 0, maxArmor, maxArmor);
    player.maxHP = Math.round(maxHP);
    player.hp = Math.round(hp);
    player.maxArmor = Math.round(maxArmor);
    player.armor = Math.round(armor);

    // Offensive stats: baseline. In competitive mode we override from Supabase if address is present.
    const dmg0 = clampNum(options?.dmg, 1, 999, 1);
    const crit0 = clampNum(options?.critChance, 0, 95, 4);
    const acc0 = clampNum(options?.accuracy, 0, 100, 60);
    this.dmgBySid.set(client.sessionId, dmg0);
    this.critChanceBySid.set(client.sessionId, crit0);
    this.accuracyBySid.set(client.sessionId, acc0);
    // Sync authoritative stats to room state so clients match server balance.
    player.dmg = dmg0;
    player.critChance = crit0;
    player.accuracy = acc0;
    this.lastFireAtBySid.set(client.sessionId, { bullet: 0, projectile: 0, mine: 0, spike: 0, tnt: 0 });
    player.ready = false;

    // UFO ticket gating (optional, env-driven). If required and invalid/missing => deny join.
    // FUN PvP: skip gating entirely.
    try {
      if (this.isFunRoom()) {
        // no-op
      } else {
      const addr = (player.address || "").trim();
      const tokenIdOptRaw = options?.ufoTicketTokenId;
      let tokenIdOpt: bigint | null = null;
      if (typeof tokenIdOptRaw === "string" && tokenIdOptRaw.trim()) {
        try { tokenIdOpt = BigInt(tokenIdOptRaw.trim()); } catch {}
      } else if (typeof tokenIdOptRaw === "number" && Number.isFinite(tokenIdOptRaw)) {
        try { tokenIdOpt = BigInt(Math.floor(tokenIdOptRaw)); } catch {}
      }

      const check = await ufoTicketService.checkJoin(addr, tokenIdOpt);
      if (!check.ok) {
        try { client.send("join_denied", { reason: check.reason }); } catch {}
        try { client.leave(); } catch {}
        return;
      }
      if (check.tokenId) {
        this.ticketTokenIdBySid.set(client.sessionId, check.tokenId);
      }
      }
    } catch {}

    // Record join metadata (include ticket tokenId if present).
    try {
      const tokenId = this.ticketTokenIdBySid.get(client.sessionId) || 0n;
      this._recorder?.recordJoin({
        sid: client.sessionId,
        address: (player.address || "").trim(),
        profilePicture: (player as any)?.profilePicture,
        ufoTicketTokenId: tokenId ? tokenId.toString() : undefined
      });
    } catch {}

    // If configured, enforce on-chain ticket stats as the ONLY source of truth for PvP Online.
    // This prevents client spoofing and removes Supabase dependence for competitive stats.
    let usedOnchainStats = false;
    try {
      const enforce = envBool("UFO_TICKET_USE_ONCHAIN_STATS", true);
      const tokenId = this.ticketTokenIdBySid.get(client.sessionId) || 0n;
      if (!this.isFunRoom() && enforce && tokenId) {
        const s = await ufoTicketService.getStats(tokenId);
        if (s) {
          usedOnchainStats = true;
          // Apply authoritative stats (clamped to sane bounds).
          const maxHP2 = clampNum(s.maxHP, 1, 250, 100);
          const maxArmor2 = clampNum(s.maxArmor, 0, 200, 50);
          const dmg2 = clampNum(s.dmg, 1, 999, 1);
          const crit2 = clampNum(s.critChance, 0, 95, 4);
          const acc2 = clampNum(s.accuracy, 0, 100, 60);
          const maxFuel2 = clampNum(s.maxFuel, 0, 1000, 150);

          player.maxHP = Math.round(maxHP2);
          player.hp = Math.round(maxHP2);
          player.maxArmor = Math.round(maxArmor2);
          player.armor = Math.round(maxArmor2);
          player.maxFuel = Math.round(maxFuel2);
          player.fuel = Math.round(maxFuel2);

          this.dmgBySid.set(client.sessionId, dmg2);
          this.critChanceBySid.set(client.sessionId, crit2);
          this.accuracyBySid.set(client.sessionId, acc2);
          player.dmg = dmg2;
          player.critChance = crit2;
          player.accuracy = acc2;
        }
      }
    } catch {}
    
    // Add player to state
    if (!this.state.players.has(client.sessionId)) {
      this.state.players.set(client.sessionId, player);
    }

    // Competitive: authoritative stat fetch from Supabase (one-time on join; cached).
    try {
      if (usedOnchainStats) {
        // Skip Supabase overrides if on-chain stats are enforced.
      } else {
      const addr = (player.address || "").trim();
      if (addr) {
        const timeoutMs = 1200;
        const stats = await Promise.race([
          fetchSoloStatsForAddress(addr),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
        ]);
        if (stats) {
          const dmg = clampNum(stats.dmg, 1, 999, 1);
          const critChance = clampNum(stats.critChance, 0, 95, 4);
          const accuracy = clampNum(stats.accuracy, 0, 100, 60);
          const maxHP2 = clampNum(stats.maxHP, 1, 250, 100);
          const maxArmor2 = clampNum(stats.maxArmor, 0, 200, 50);

          this.dmgBySid.set(client.sessionId, dmg);
          this.critChanceBySid.set(client.sessionId, critChance);
          this.accuracyBySid.set(client.sessionId, accuracy);
          player.dmg = dmg;
          player.critChance = critChance;
          player.accuracy = accuracy;

          // Apply HP/armor to state BEFORE ready/start; keep within caps
          player.maxHP = Math.round(maxHP2);
          player.hp = Math.round(maxHP2);
          player.maxArmor = Math.round(maxArmor2);
          player.armor = Math.round(maxArmor2);
        }
      }
      }
    } catch {}

    // --- Ronkeverse NFT bonuses (server-side, once per join) ---
    // This avoids exploits: client cannot spoof NFT count, and selling/transferring NFTs immediately changes bonuses.
    try {
      const addr = (player.address || "").trim();
      if (addr && nftBonusService.isEnabled()) {
        const snap = await nftBonusService.getRonkeverseBonuses(addr);
        this.nftCountBySid.set(client.sessionId, snap.nftCount);
        player.nftCount = snap.nftCount;

        // Apply tiered bonuses (same rule set as frontend).
        if (snap.bonusHp) {
          const nextMaxHP = clampNum((player.maxHP || 0) + snap.bonusHp, 1, 250, 100);
          player.maxHP = Math.round(nextMaxHP);
          player.hp = Math.round(nextMaxHP);
        }
        if (snap.bonusDmg) {
          const nextDmg = clampNum((player.dmg || 1) + snap.bonusDmg, 1, 999, 1);
          player.dmg = nextDmg;
          this.dmgBySid.set(client.sessionId, nextDmg);
        }
        if (snap.bonusCritChance) {
          const nextCrit = clampNum((player.critChance || 0) + snap.bonusCritChance, 0, 95, 4);
          player.critChance = nextCrit;
          this.critChanceBySid.set(client.sessionId, nextCrit);
        }
      } else {
        this.nftCountBySid.set(client.sessionId, 0);
        player.nftCount = 0;
      }
    } catch {
      this.nftCountBySid.set(client.sessionId, 0);
      player.nftCount = 0;
    }
    
    // Metrics should reflect connected clients count (matchmaker shows "waiting players" based on this).
    updateRoomPlayerCount(this.roomId, this.clients.length);

    // Lobby wait timeout: if only one player sits here too long, clear the room.
    try {
      if (this._lobbyWaitTimer) {
        try { this._lobbyWaitTimer.clear(); } catch {}
        this._lobbyWaitTimer = null;
      }
      if (!this.state.gameStarted && this.clients.length === 1) {
        this._lobbyWaitTimer = (this.clock as any).setTimeout(() => {
          try {
            if (!this.state.gameStarted && this.clients.length < 2) {
              try {
                this.broadcast("lobby_timeout", { reason: "no_opponent", timeoutMs: LOBBY_WAIT_TIMEOUT_MS });
              } catch {}
              try { (this as any).disconnect?.(); } catch {}
            }
          } catch {}
        }, LOBBY_WAIT_TIMEOUT_MS);
      }
    } catch {}
    
    // Broadcast player joined
    this.broadcast("player_joined", {
      sessionId: client.sessionId,
      playerCount: this.state.players.size
    });
    
    // If 2 players joined, notify both
    if (this.state.players.size === 2) {
      // Cancel lobby wait timer once both players are present.
      if (this._lobbyWaitTimer) {
        try { this._lobbyWaitTimer.clear(); } catch {}
        this._lobbyWaitTimer = null;
      }

      // Start "ready wait" timeout: if game doesn't start soon, disconnect room so players can requeue.
      try {
        if (this._readyWaitTimer) {
          try { this._readyWaitTimer.clear(); } catch {}
          this._readyWaitTimer = null;
        }
        if (!this.state.gameStarted) {
          this._readyWaitTimer = (this.clock as any).setTimeout(() => {
            try {
              if (!this.state.gameStarted) {
                try {
                  this.broadcast("match_cancelled", { reason: "ready_timeout", timeoutMs: READY_WAIT_TIMEOUT_MS });
                } catch {}
                try { (this as any).disconnect?.(); } catch {}
              }
            } catch {}
          }, READY_WAIT_TIMEOUT_MS);
        }
      } catch {}

      this.broadcast("match_ready", {
        message: "Both players joined! Get ready!"
      });
    }
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`Player ${client.sessionId} left room ${this.roomId}`);
    try { this._recorder?.recordLeave(client.sessionId); } catch {}
    
    // IMPORTANT (UFO Ticket economy):
    // If a match is running, we must be able to burn the leaver's ticket and pay the winner.
    // Therefore, do NOT delete `ticketTokenIdBySid` until AFTER endMatch() runs.
    const shouldEndMatchOnLeave = this.state.gameStarted && !this._matchEnded;

    // Remove player from state
    this.state.players.delete(client.sessionId);
    this.latestPositionInputs.delete(client.sessionId);
    this.pendingEventInputs.delete(client.sessionId);
    this.lastContinuousBroadcasts.delete(client.sessionId);
    this.nextActionAtBySid.delete(client.sessionId);
    this.nextHitAtBySid.delete(client.sessionId);
    this.lastStatsAtBySid.delete(client.sessionId);
    this.lastDamageAtBySid.delete(client.sessionId);
    this.lastArmorRegenAtBySid.delete(client.sessionId);
    this.nftCountBySid.delete(client.sessionId);
    this.dmgBySid.delete(client.sessionId);
    this.critChanceBySid.delete(client.sessionId);
    this.accuracyBySid.delete(client.sessionId);
    this.lastFireAtBySid.delete(client.sessionId);
    
    updateRoomPlayerCount(this.roomId, this.clients.length);
    
    // Broadcast player left
    this.broadcast("player_left", {
      sessionId: client.sessionId,
      playerCount: this.state.players.size
    });

    // If match was running and someone left, end the match and dispose room shortly after.
    if (shouldEndMatchOnLeave) {
      const remainingSid = Array.from(this.state.players.keys())[0] || null;
      this.endMatch("player_left", remainingSid);
    }

    // Now safe to remove leaver ticket id from memory.
    this.ticketTokenIdBySid.delete(client.sessionId);

    // If we drop below 2 players, cancel ready-wait timer (we're back to lobby waiting).
    try {
      if (this._readyWaitTimer && this.clients.length < 2) {
        try { this._readyWaitTimer.clear(); } catch {}
        this._readyWaitTimer = null;
      }
    } catch {}

    // If we dropped back to 1 (or 0) players in lobby, restart/cancel lobby wait timer accordingly.
    try {
      if (this._lobbyWaitTimer) {
        try { this._lobbyWaitTimer.clear(); } catch {}
        this._lobbyWaitTimer = null;
      }
      if (!this.state.gameStarted && this.clients.length === 1) {
        this._lobbyWaitTimer = (this.clock as any).setTimeout(() => {
          try {
            if (!this.state.gameStarted && this.clients.length < 2) {
              try {
                this.broadcast("lobby_timeout", { reason: "no_opponent", timeoutMs: LOBBY_WAIT_TIMEOUT_MS });
              } catch {}
              try { (this as any).disconnect?.(); } catch {}
            }
          } catch {}
        }, LOBBY_WAIT_TIMEOUT_MS);
      }
      // If no clients remain, disconnect immediately (helps metrics clear fast).
      if (this.clients.length === 0) {
        try { (this as any).disconnect?.(); } catch {}
      }
    } catch {}
  }

  onDispose() {
    console.log("GameRoom disposed:", this.roomId);
    // Persist replay file on dispose (best-effort).
    try { void this._recorder?.finalize(); } catch {}
    this.latestPositionInputs.clear();
    this.pendingEventInputs.clear();
    this.lastContinuousBroadcasts.clear();
    this._turnPlans.clear();
    this._turnLocked.clear();
    if (this._turnPhaseTimer) {
      try { this._turnPhaseTimer.clear(); } catch {}
      this._turnPhaseTimer = null;
    }
    if (this._endTimer) {
      try { this._endTimer.clear(); } catch {}
      this._endTimer = null;
    }
    if (this._lobbyWaitTimer) {
      try { this._lobbyWaitTimer.clear(); } catch {}
      this._lobbyWaitTimer = null;
    }
    if (this._readyWaitTimer) {
      try { this._readyWaitTimer.clear(); } catch {}
      this._readyWaitTimer = null;
    }
    unregisterRoom(this.roomId);
  }

  handlePlayerInput(client: Client, message: any) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const sanitizedInput = this.sanitizeInput(message);
    // Hardening: validate stats/hit before we queue/broadcast.
    try {
      const t = sanitizedInput.type;
      const now = Date.now();

      if (t === "stats") {
        // Rate limit stats spam
        const lastAt = this.lastStatsAtBySid.get(client.sessionId) || 0;
        if (now - lastAt < STATS_MIN_INTERVAL_MS) {
          return;
        }
        this.lastStatsAtBySid.set(client.sessionId, now);

        // Never allow client to change maxHP/maxArmor after join (prevents "upgrade mid-match" hacks).
        (sanitizedInput as any).maxHP = undefined;
        (sanitizedInput as any).maxArmor = undefined;

        // Competitive hardening:
        // If we enforce on-chain ticket stats, DO NOT let clients raise hp/armor via stats packets.
        // (Allow only decreases; server is authoritative via applyHit.)
        const curHP = typeof player.hp === "number" ? player.hp : 0;
        const curArmor = typeof player.armor === "number" ? player.armor : 0;
        const maxHP = typeof player.maxHP === "number" ? player.maxHP : 100;
        const maxArmor = typeof player.maxArmor === "number" ? player.maxArmor : 50;

        if (typeof sanitizedInput.hp === "number") {
          let nextHP = Math.max(0, Math.min(maxHP, Math.round(sanitizedInput.hp)));
          const enforce = !this.isFunRoom() && envBool("UFO_TICKET_USE_ONCHAIN_STATS", true);
          if (enforce) {
            nextHP = Math.min(curHP, nextHP);
          } else {
            const dhp = nextHP - curHP;
            if (dhp > MAX_HP_INCREASE_PER_STATS) {
              nextHP = curHP + MAX_HP_INCREASE_PER_STATS;
            }
          }
          (sanitizedInput as any).hp = nextHP;
        }
        if (typeof sanitizedInput.armor === "number") {
          let nextArmor = Math.max(0, Math.min(maxArmor, Math.round(sanitizedInput.armor)));
          const enforce = !this.isFunRoom() && envBool("UFO_TICKET_USE_ONCHAIN_STATS", true);
          if (enforce) {
            // Allow decreases always; allow ONLY small "regen tick" increases.
            if (nextArmor > curArmor) {
              const dArmor = nextArmor - curArmor;
              const sid = client.sessionId;
              const lastDmgAt = this.lastDamageAtBySid.get(sid) || 0;
              const lastRegenAt = this.lastArmorRegenAtBySid.get(sid) || 0;
              const maxRegen = this.maxArmorRegenPerTickForSid(sid);
              const canRegen =
                dArmor > 0 &&
                dArmor <= maxRegen &&
                (now - lastDmgAt) >= ARMOR_REGEN_TICK_MS &&
                (now - lastRegenAt) >= ARMOR_REGEN_TICK_MS;
              if (canRegen) {
                this.lastArmorRegenAtBySid.set(sid, now);
              } else {
                nextArmor = curArmor; // deny increase
              }
            } else {
              nextArmor = Math.min(curArmor, nextArmor);
            }
          } else {
            const dArmor = nextArmor - curArmor;
            if (dArmor > MAX_ARMOR_INCREASE_PER_STATS) {
              nextArmor = curArmor + MAX_ARMOR_INCREASE_PER_STATS;
            }
          }
          (sanitizedInput as any).armor = nextArmor;
        }
      }

      if (t === "hit") {
        // Only accept hit packets during an active match.
        if (!this.state.gameStarted) return;
        // Rate limit hit spam from client-driven weapons.
        const nextHitAt = this.nextHitAtBySid.get(client.sessionId) || 0;
        if (now < nextHitAt) return;
        this.nextHitAtBySid.set(client.sessionId, now + HIT_MIN_INTERVAL_MS);

        // Must target the other player (2p room).
        const ids = Array.from(this.state.players.keys());
        const otherId = ids.find((id) => id !== client.sessionId) || null;
        const target = (sanitizedInput as any).targetPlayerId;
        if (!otherId || typeof target !== "string" || target !== otherId) {
          return;
        }
        // Competitive hardening:
        // - require a recent fire event for the claimed projectile type
        // - compute damage on server (ignore client-provided damage/isCrit)
        const now2 = now;
        const projTypeRaw = (sanitizedInput as any).projType;
        const isBullet = !!(sanitizedInput as any).isBullet;
        const isMine = !!(sanitizedInput as any).isMine;
        const isSpike = !!(sanitizedInput as any).isSpike;
        const isTnt = !!(sanitizedInput as any).isTnt;
        let projType: "bullet" | "projectile" | "mine" | "spike" | "tnt" = "projectile";
        if (projTypeRaw === "bullet" || isBullet) projType = "bullet";
        else if (projTypeRaw === "mine" || isMine) projType = "mine";
        else if (projTypeRaw === "spike" || isSpike) projType = "spike";
        else if (projTypeRaw === "tnt" || isTnt) projType = "tnt";
        else projType = "projectile";

        const fires = this.lastFireAtBySid.get(client.sessionId) || { bullet: 0, projectile: 0, mine: 0, spike: 0, tnt: 0 };
        const lastFireAt = (fires as any)[projType] || 0;
        const win =
          projType === "bullet" ? BULLET_HIT_WINDOW_MS :
          projType === "projectile" ? PROJECTILE_HIT_WINDOW_MS :
          projType === "mine" ? MINE_HIT_WINDOW_MS :
          projType === "tnt" ? TNT_HIT_WINDOW_MS :
          SPIKE_HIT_WINDOW_MS;
        if (!lastFireAt || (now2 - lastFireAt) > win) {
          return;
        }

        const dmg = clampNum(this.dmgBySid.get(client.sessionId), 1, 999, 1);
        const critChance = clampNum(this.critChanceBySid.get(client.sessionId), 0, 95, 4);
        const seed = (this.state.seed >>> 0) || 1;
        const roll = hash32(seed ^ hash32((++this._hitSeq) ^ hash32(client.sessionId.length * 1315423911)));
        const r01 = (roll >>> 0) / 4294967296;
        let isCrit = r01 < (critChance / 100);
        // Mines/spikes/TNT should never crit (matches legacy client feel; avoids confusing double-crit visuals).
        if (projType === "mine" || projType === "spike" || projType === "tnt") {
          isCrit = false;
        }

        // Base damage model (match client intent)
        let base = dmg;
        if (projType === "bullet") base = (dmg * 0.5) * (isCrit ? 2 : 1);
        else if (projType === "projectile") base = isCrit ? (dmg * 3) : (dmg * 2);
        else if (projType === "mine") base = dmg * 2.0;
        else if (projType === "tnt") base = dmg * TNT_DAMAGE_MULTIPLIER; // TNT explosion damage
        else base = dmg * 0.5;

        const roll2 = hash32(roll ^ 0x9e3779b9);
        const v01 = (roll2 >>> 0) / 4294967296;
        const variance = 0.5 + v01 * 0.5;
        const damage = Math.max(0, Math.min(MAX_DAMAGE_PER_HIT, Math.round(base * variance)));

        (sanitizedInput as any).damage = damage;
        (sanitizedInput as any).isCrit = isCrit;
        // Ensure clients can attribute the hit correctly.
        (sanitizedInput as any).shooterId = client.sessionId;
        (sanitizedInput as any).targetPlayerId = otherId;
        // Ensure projType is normalized (helps client debug)
        (sanitizedInput as any).projType = projType;
      }
    } catch {}
    // #region agent log
    try {
      const t = sanitizedInput?.type || "unknown";
      this._agentStats.inCount += 1;
      this._agentStats.inBytes += this._agentSafeJsonSize(sanitizedInput);
      // Validate key to prevent prototype pollution (cast to string for security check)
      const tStr = t as string;
      if (tStr !== "__proto__" && tStr !== "constructor" && tStr !== "prototype") {
        this._agentStats.inByType[t] = (this._agentStats.inByType[t] || 0) + 1;
      }
    } catch {}
    // #endregion
    // Record sanitized input (for replay + dispute analysis).
    try {
      this._recorder?.recordInput({ t: Date.now(), sid: client.sessionId, input: sanitizedInput });
    } catch {}
    const pending: PendingInputEntry = {
      client,
      input: sanitizedInput,
      timestamp: Date.now()
    };

    if (sanitizedInput.type === "position" || sanitizedInput.type === "arrow_position" || sanitizedInput.type === "projectile_position") {
      this.latestPositionInputs.set(client.sessionId, pending);
    } else {
      // Rate-limit high-impact actions (1 per second). Drop excess to keep queues small.
      // NOTE: We intentionally do NOT rate-limit 'hit' to avoid breaking damage pipelines.
      const t = sanitizedInput.type;
      const isRateLimitedAction =
        t === "dash" || t === "click" || t === "bullet" || t === "arrow" || t === "projectile" || t === "mine" || t === "line" || t === "tnt";
      if (isRateLimitedAction) {
        const now = pending.timestamp;
        const sid = client.sessionId;
        const nextAt = this.nextActionAtBySid.get(sid) || 0;
        if (now < nextAt) {
          // Attempted action during cooldown => penalty lockout.
          this.nextActionAtBySid.set(sid, now + ACTION_PENALTY_MS);
          return;
        }
        // Action accepted -> start normal 1s cooldown.
        this.nextActionAtBySid.set(sid, now + ACTION_COOLDOWN_MS);
      }
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

      // Cancel ready-wait timer now that match started.
      if (this._readyWaitTimer) {
        try { this._readyWaitTimer.clear(); } catch {}
        this._readyWaitTimer = null;
      }

      // Lock room so matchmaker never places new players here even if someone leaves mid-game.
      try { (this as any).lock?.(); } catch {}

      // Start match timer and tell clients so they can show countdown UI.
      this._matchStartAt = Date.now();
      this._matchEndAt = this._matchStartAt + MATCH_DURATION_MS;
      this._matchEnded = false;
      try { this._recorder?.startMatch({ startedAt: this._matchStartAt, plannedEndAt: this._matchEndAt }); } catch {}
      this.broadcast("match_timer", {
        startAt: this._matchStartAt,
        endAt: this._matchEndAt,
        durationMs: MATCH_DURATION_MS
      } as any);

      // Start turn-based loop only if explicitly enabled.
      if (this._turnEnabled) {
        this.startTurnBasedLoop();
      }
    }
  }

  // --- Turn-based PvP handlers ---
  private handlePlanSubmit(client: Client, message: any): void {
    if (!this._turnEnabled) return;
    if (!this.state.gameStarted) return;
    if (this.state.phase !== "planning") return;
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const plan = this.sanitizePlan(client.sessionId, message);
    this._turnPlans.set(client.sessionId, plan);
    // Share limited "planning intel": fuel usage is visible live to both players.
    try {
      const p = this.state.players.get(client.sessionId);
      const f = plan?.stats?.fuel;
      const mf = plan?.stats?.maxFuel;
      if (p && typeof f === "number" && Number.isFinite(f)) {
        const maxFuel = (typeof mf === "number" && Number.isFinite(mf) && mf > 0) ? mf : (p.maxFuel || 150);
        p.maxFuel = Math.max(1, Math.min(1000, Math.round(maxFuel)));
        p.fuel = Math.max(0, Math.min(p.maxFuel, Math.round(f)));
      }
    } catch {}
    // Any new submit unlocks (player changed plan)
    this._turnLocked.delete(client.sessionId);
    client.send("plan_ack", { roundId: this.state.roundId, locked: false });
    // #region agent log
    try {
      const tn = Array.isArray((plan as any).track) ? (plan as any).track.length : 0;
      const sn = Array.isArray((plan as any).spawns) ? (plan as any).spawns.length : 0;
      fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'colyseus-server/src/rooms/GameRoom.ts:handlePlanSubmit',message:'server received plan_submit',data:{roomId:this.roomId,sid:client.sessionId,phase:this.state.phase,roundId:this.state.roundId,trackN:tn,spawnsN:sn},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3'})}).catch(()=>{});
    } catch {}
    // #endregion
    try {
      const tn = Array.isArray((plan as any).track) ? (plan as any).track.length : 0;
      const sn = Array.isArray((plan as any).spawns) ? (plan as any).spawns.length : 0;
      if ((globalThis as any).__turnLogLastAt == null) (globalThis as any).__turnLogLastAt = 0;
      const now = Date.now();
      if (now - (globalThis as any).__turnLogLastAt > 500) {
        (globalThis as any).__turnLogLastAt = now;
        console.log(`[TURN] plan_submit room=${this.roomId} sid=${client.sessionId} track=${tn} spawns=${sn} phaseEndsAt=${this.state.phaseEndsAt}`);
      }
    } catch {}
  }

  private handlePlanLock(client: Client): void {
    if (!this._turnEnabled) return;
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
    if (!this._turnEnabled) return;
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
        track: [
          { tMs: 0, x: p.x, y: p.y },
          { tMs: TURN_EXECUTE_MS, x: p.x, y: p.y }
        ],
        spawns: [],
        stats: {}
      });
    }

    this.broadcast("phase", {
      phase: "planning" as TurnPhase,
      roundId: this.state.roundId,
      endsAt: this.state.phaseEndsAt,
      serverNow: now,
      planMs: TURN_PLAN_MS,
      executeMs: TURN_EXECUTE_MS
    });

    if (this._turnPhaseTimer) {
      try { this._turnPhaseTimer.clear(); } catch {}
      this._turnPhaseTimer = null;
    }
    this._turnPhaseTimer = (this.clock as any).setTimeout(() => this.beginExecutePhase(), TURN_PLAN_MS);
  }

  private beginExecutePhase(): void {
    if (!this._turnEnabled) return;
    if (!this.state.gameStarted) return;
    if (this.state.phase === "execute") return;
    if (this.state.players.size !== 2) return;

    // Stop any pending timer for planning.
    if (this._turnPhaseTimer) {
      try { this._turnPhaseTimer.clear(); } catch {}
      this._turnPhaseTimer = null;
    }

    const now = Date.now();
    const startAt = now + TURN_SYNC_BUFFER_MS; // buffer so both clients can start together & sync
    this.state.phase = "execute";
    this.state.executeStartAt = startAt;
    this.state.phaseEndsAt = startAt + TURN_EXECUTE_MS;

    // Simulate the whole execute window right now and send deterministic events.
    const sim = this.simulateExecuteRound(this._turnPlans, this._turnRoundSeed);
    // #region agent log
    try {
      const ids = Object.keys(sim.plans || {});
      const p0: any = (ids[0] ? (sim.plans as any)[ids[0]] : null);
      const p1: any = (ids[1] ? (sim.plans as any)[ids[1]] : null);
      const t0 = Array.isArray(p0?.track) ? p0.track.length : 0;
      const t1 = Array.isArray(p1?.track) ? p1.track.length : 0;
      const s0 = Array.isArray(p0?.spawns) ? p0.spawns.length : 0;
      const s1 = Array.isArray(p1?.spawns) ? p1.spawns.length : 0;
      const summarizeTrack = (track: any[]) => {
        if (!Array.isArray(track) || track.length === 0) return null;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const first = track[0];
        const last = track[track.length - 1];
        for (const pt of track) {
          const x = typeof pt?.x === 'number' ? pt.x : 0;
          const y = typeof pt?.y === 'number' ? pt.y : 0;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        return { first, last, minX, maxX, minY, maxY, dx: (last?.x ?? 0) - (first?.x ?? 0), dy: (last?.y ?? 0) - (first?.y ?? 0) };
      };
      const a = summarizeTrack(p0?.track || []);
      const b = summarizeTrack(p1?.track || []);
      fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'colyseus-server/src/rooms/GameRoom.ts:beginExecutePhase',message:'server broadcasting round_execute',data:{roomId:this.roomId,roundId:this.state.roundId,startAt,plansKeys:ids,trackN:[t0,t1],spawnsN:[s0,s1],eventsN:sim.events.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H5'})}).catch(()=>{});
      fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'colyseus-server/src/rooms/GameRoom.ts:beginExecutePhase',message:'server track summary',data:{roomId:this.roomId,roundId:this.state.roundId,keys:ids,track0:a,track1:b},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H6'})}).catch(()=>{});
    } catch {}
    // #endregion

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
    try {
      const ids = Object.keys(sim.plans || {});
      const p0: any = (ids[0] ? (sim.plans as any)[ids[0]] : null);
      const p1: any = (ids[1] ? (sim.plans as any)[ids[1]] : null);
      const t0 = Array.isArray(p0?.track) ? p0.track.length : 0;
      const t1 = Array.isArray(p1?.track) ? p1.track.length : 0;
      const s0 = Array.isArray(p0?.spawns) ? p0.spawns.length : 0;
      const s1 = Array.isArray(p1?.spawns) ? p1.spawns.length : 0;
      console.log(`[TURN] round_execute room=${this.roomId} round=${this.state.roundId} startAt=${startAt} plans(track=${t0}/${t1},spawns=${s0}/${s1}) events=${sim.events.length}`);
    } catch {}

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

    const stats: TurnPlayerStats = {
      dmg: typeof message?.stats?.dmg === "number" ? Math.max(0, Math.min(999, message.stats.dmg)) : undefined,
      critChance: typeof message?.stats?.critChance === "number" ? Math.max(0, Math.min(100, message.stats.critChance)) : undefined,
      maxFuel: typeof message?.stats?.maxFuel === "number" ? Math.max(1, Math.min(1000, message.stats.maxFuel)) : undefined,
      fuel: typeof message?.stats?.fuel === "number" ? Math.max(0, Math.min(1000, message.stats.fuel)) : undefined
    };

    const trackIn: any[] = Array.isArray(message?.track) ? message.track : [];
    const track: Array<{ tMs: number; x: number; y: number }> = [];
    let lastT = -1;
    for (const pt of trackIn) {
      if (track.length >= TURN_MAX_TRACK_POINTS) break;
      const tMs = typeof pt?.tMs === "number" ? Math.round(pt.tMs) : 0;
      if (tMs < 0 || tMs > TURN_EXECUTE_MS) continue;
      if (tMs < lastT) continue;
      const xRaw = typeof pt?.x === "number" ? pt.x : currentX;
      const yRaw = typeof pt?.y === "number" ? pt.y : currentY;
      const clamped = this.clampDestToSide(sessionId, xRaw, yRaw);
      track.push({ tMs, x: clamped.x, y: clamped.y });
      lastT = tMs;
    }
    if (track.length === 0) {
      const clamped = this.clampDestToSide(sessionId, currentX, currentY);
      track.push({ tMs: 0, x: clamped.x, y: clamped.y });
      track.push({ tMs: TURN_EXECUTE_MS, x: clamped.x, y: clamped.y });
    }

    const spawnsIn: any[] = Array.isArray(message?.spawns) ? message.spawns : [];
    const spawns: Array<{ tMs: number; projType: TurnShotType; x: number; y: number; vx: number; vy: number }> = [];
    for (const s of spawnsIn) {
      if (spawns.length >= TURN_MAX_SPAWNS) break;
      const tMs = typeof s?.tMs === "number" ? Math.round(s.tMs) : 0;
      if (tMs < 0 || tMs > TURN_EXECUTE_MS) continue;
      const projType: TurnShotType = (s?.projType === "arrow" || s?.projType === "bullet" || s?.projType === "projectile") ? s.projType : "bullet";
      const x = typeof s?.x === "number" ? s.x : currentX;
      const y = typeof s?.y === "number" ? s.y : currentY;
      const vx = typeof s?.vx === "number" ? s.vx : 0;
      const vy = typeof s?.vy === "number" ? s.vy : 0;
      // Clamp spawn position to arena bounds (projectiles can be anywhere in arena, mid-wall doesn't block)
      const cx = Math.max(ARENA_LEFT, Math.min(ARENA_RIGHT, x));
      const cy = Math.max(ARENA_TOP, Math.min(ARENA_BOTTOM, y));
      spawns.push({ tMs, projType, x: cx, y: cy, vx: Math.max(-5000, Math.min(5000, vx)), vy: Math.max(-5000, Math.min(5000, vy)) });
    }

    return { track, spawns, stats };
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

    const planA = plans.get(sidA) || { track: [{ tMs: 0, x: pA0.x, y: pA0.y }, { tMs: TURN_EXECUTE_MS, x: pA0.x, y: pA0.y }], spawns: [], stats: {} };
    const planB = plans.get(sidB) || { track: [{ tMs: 0, x: pB0.x, y: pB0.y }, { tMs: TURN_EXECUTE_MS, x: pB0.x, y: pB0.y }], spawns: [], stats: {} };

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
    const players: Record<string, { x: number; y: number; hp: number; armor: number; }> = {
      [sidA]: { x: pA0.x, y: pA0.y, hp: pA0.hp, armor: pA0.armor },
      [sidB]: { x: pB0.x, y: pB0.y, hp: pB0.hp, armor: pB0.armor }
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
      bounceCount: number;
    };
    const projectiles: SimProjectile[] = [];

    const dtMs = SIMULATION_INTERVAL_MS; // 33ms
    const dtSec = dtMs / 1000;

    // Precompute spawn schedules per shooter (recorded spawns)
    type PendingSpawn = { spawnAtMs: number; shooterId: string; projType: TurnShotType; x: number; y: number; vx: number; vy: number };
    const pendingSpawns: PendingSpawn[] = [];
    for (const sid of [sidA, sidB]) {
      for (const sp of planBySid[sid].spawns || []) {
        const spawnAtMs = Math.max(0, Math.min(TURN_EXECUTE_MS, sp.tMs + TURN_WINDUP_MS));
        pendingSpawns.push({ spawnAtMs, shooterId: sid, projType: sp.projType, x: sp.x, y: sp.y, vx: sp.vx, vy: sp.vy });
      }
    }
    pendingSpawns.sort((a, b) => a.spawnAtMs - b.spawnAtMs);
    let nextSpawnIdx = 0;
    let projCounter = 0;

    const trackAt = (track: Array<{ tMs: number; x: number; y: number }>, tMs: number) => {
      if (!track || track.length === 0) return null;
      if (tMs <= track[0].tMs) return { x: track[0].x, y: track[0].y };
      for (let i = 0; i < track.length - 1; i++) {
        const a = track[i];
        const b = track[i + 1];
        if (tMs >= a.tMs && tMs <= b.tMs) {
          const span = Math.max(1, b.tMs - a.tMs);
          const t = (tMs - a.tMs) / span;
          return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
      }
      const last = track[track.length - 1];
      return { x: last.x, y: last.y };
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
      // Update player positions from recorded tracks (deterministic)
      for (const sid of [sidA, sidB]) {
        const p = trackAt(planBySid[sid].track, tMs) || { x: players[sid].x, y: players[sid].y };
        players[sid].x = p.x;
        players[sid].y = p.y;
      }

      // Spawn projectiles due at this time slice
      while (nextSpawnIdx < pendingSpawns.length && pendingSpawns[nextSpawnIdx].spawnAtMs <= tMs) {
        const ps = pendingSpawns[nextSpawnIdx++];
        const shooterId = ps.shooterId;
        const projType = ps.projType;
        const vx = ps.vx;
        const vy = ps.vy;
        const id = `p${this.roomId}_${this.state.roundId}_${projCounter++}`;
        projectiles.push({ id, shooterId, type: projType, x: ps.x, y: ps.y, vx, vy, alive: true, hit: false, bounceCount: 0 });
        events.push({
          type: "projectile_spawn",
          tMs: ps.spawnAtMs,
          projectileId: id,
          shooterId,
          projType,
          x: ps.x,
          y: ps.y,
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

        // Bounce off center obstacle (stone compound hitbox)
        if (CENTER_OBSTACLE_ENABLED) {
          const hit = collideCircleWithStone(proj.x, proj.y, params.radius);
          if (hit) {
            proj.x += hit.nx * (hit.depth + 0.5);
            proj.y += hit.ny * (hit.depth + 0.5);
            const vn = proj.vx * hit.nx + proj.vy * hit.ny;
            if (vn < 0) {
              // Type-specific damping (bullets bounce more, heavy less)
              const damp = proj.type === "bullet" ? 0.78 : (proj.type === "projectile" ? 0.65 : 0.80);
              proj.vx = (proj.vx - 2 * vn * hit.nx) * damp;
              proj.vy = (proj.vy - 2 * vn * hit.ny) * damp;
              proj.bounceCount++;
              if (proj.bounceCount > 3) {
                proj.alive = false;
                continue;
              }
            }
          }
        }

        // Bounds kill (a bit generous)
        if (proj.x < ARENA_LEFT - 200 || proj.x > ARENA_RIGHT + 200 || proj.y < ARENA_TOP - 200 || proj.y > ARENA_BOTTOM + 200) {
          proj.alive = false;
          continue;
        }

        const targetId = (proj.shooterId === sidA) ? sidB : sidA;
        const tpPos = trackAt(planBySid[targetId].track, tMs) || players[targetId];
        const tp = players[targetId];
        if (tp.hp <= 0) continue;
        const dx = tpPos.x - proj.x;
        const dy = tpPos.y - proj.y;
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
        [sidA]: { x: (trackAt(planBySid[sidA].track, TURN_EXECUTE_MS) || players[sidA]).x, y: (trackAt(planBySid[sidA].track, TURN_EXECUTE_MS) || players[sidA]).y, hp: players[sidA].hp, armor: players[sidA].armor },
        [sidB]: { x: (trackAt(planBySid[sidB].track, TURN_EXECUTE_MS) || players[sidB]).x, y: (trackAt(planBySid[sidB].track, TURN_EXECUTE_MS) || players[sidB]).y, hp: players[sidB].hp, armor: players[sidB].armor }
      }
    };

    // Ensure events are time-ordered
    events.sort((a, b) => a.tMs - b.tMs);

    return { plans: outPlans, events, finalState };
  }

  private processPendingInputs(): void {
    const serverTimestamp = Date.now();
    // Match timeout: decide winner by higher HP (ties => draw) and end match.
    if (this.state.gameStarted && !this._matchEnded && this._matchEndAt > 0 && serverTimestamp >= this._matchEndAt) {
      const ids = Array.from(this.state.players.keys());
      const a = ids[0] ? this.state.players.get(ids[0]) : null;
      const b = ids[1] ? this.state.players.get(ids[1]) : null;
      let winnerSid: string | null = null;
      if (a && b) {
        if (a.hp > b.hp) winnerSid = a.sessionId;
        else if (b.hp > a.hp) winnerSid = b.sessionId;
        else winnerSid = null; // draw
      }
      this.endMatch("timeout", winnerSid);
    }

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

    // Tick server-authoritative arrows even if there were no inputs this frame.
    this.tickLiveArrows(serverTimestamp);

    // Tick server-authoritative TNT projectiles (fall, stick, explode).
    this.tickLiveTnt(serverTimestamp);

    // Snapshot after applying inputs & server arrows (throttled).
    try {
      this._recorder?.maybeSnapshot(this.state, this.state.players as any, false);
    } catch {}

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

  private tickLiveArrows(now: number): void {
    if (!this._liveArrows.length || this.state.players.size < 2) {
      if (this._liveArrows.length) this._liveArrows = [];
      return;
    }
    const ids = Array.from(this.state.players.keys());
    if (ids.length < 2) return;
    const clampNum = (v: any, min: number, max: number, fallback: number) => {
      const n = (typeof v === "number" && Number.isFinite(v)) ? v : fallback;
      return Math.max(min, Math.min(max, n));
    };

    const remaining: typeof this._liveArrows = [];
    for (const a of this._liveArrows) {
      const target = this.state.players.get(a.targetId);
      const shooter = this.state.players.get(a.shooterId);
      if (!target || !shooter) {
        continue;
      }
      const dtSec = Math.max(0, (now - a.lastAt) / 1000);
      a.lastAt = now;
      const stepX = a.vx * dtSec;
      const stepY = a.vy * dtSec;
      a.x += stepX;
      a.y += stepY;
      a.travelPx += Math.sqrt(stepX * stepX + stepY * stepY);

      // Forced expiry (used after stone bounce)
      if (a.expireAt && now >= a.expireAt) {
        continue;
      }

      // Range limit: 700px + 50px fade window (server just removes at end)
      const maxTravel = (typeof a.maxTravelPx === "number" && Number.isFinite(a.maxTravelPx) && a.maxTravelPx > 0) ? a.maxTravelPx : 750;
      if (a.travelPx >= maxTravel) {
        continue;
      }

      // Bounds kill (slightly generous)
      if (a.x < ARENA_LEFT - 200 || a.x > ARENA_RIGHT + 200 || a.y < ARENA_TOP - 200 || a.y > ARENA_BOTTOM + 200) {
        continue;
      }

      // Center obstacle (stone): arrows bounce ONCE, then get destroyed on the next impact.
      if (CENTER_OBSTACLE_ENABLED) {
        const hit = collideCircleWithStone(a.x, a.y, ARROW_RADIUS);
        if (hit) {
          if ((a.bounceCount || 0) <= 0) {
            // First impact -> bounce + shake
            a.x += hit.nx * (hit.depth + 0.5);
            a.y += hit.ny * (hit.depth + 0.5);
            const vn = a.vx * hit.nx + a.vy * hit.ny;
            if (vn < 0) {
              a.vx = (a.vx - 2 * vn * hit.nx) * 0.55; // slower after bounce
              a.vy = (a.vy - 2 * vn * hit.ny) * 0.55;
            }
            a.bounceCount = 1;
            // After bouncing off stone, arrow becomes "visual only": no damage + short remaining range.
            a.canDamage = false;
            a.maxTravelPx = Math.min(maxTravel, a.travelPx + 140);
            a.expireAt = now + 100; // disappear quickly after bounce
            this.broadcast("player_input", {
              type: "stone_bounce",
              timestamp: now,
              serverTimestamp: now,
              shooterId: a.shooterId,
              projType: "arrow",
              impactX: a.x,
              impactY: a.y
            } as any);
            // Keep arrow alive this tick
          } else {
            // Second impact -> destroy + shake
            this.broadcast("player_input", {
              type: "stone_hit",
              timestamp: now,
              serverTimestamp: now,
              shooterId: a.shooterId,
              projType: "arrow",
              impactX: a.x,
              impactY: a.y
            } as any);
            continue; // arrow consumed
          }
        }
      }

      // Collision with target (skip if arrow already bounced off stone)
      // Compound hitbox: check arrow point against 2 circles around the player center.
      // This matches UFO sprite shape better than a single center circle.
      if (a.canDamage === false) {
        remaining.push(a);
        continue;
      }
      let didHit = false;
      for (const c of PLAYER_HITBOX_CIRCLES) {
        const cx = target.x + c.ox;
        const cy = target.y + c.oy;
        const dx = cx - a.x;
        const dy = cy - a.y;
        const hitR = c.r + ARROW_RADIUS;
        if (dx * dx + dy * dy <= hitR * hitR) {
          didHit = true;
          break;
        }
      }
      if (didHit) {
        const dmg = clampNum(a.dmg, 1, 100000, 1);
        const critChance = clampNum(a.critChance, 0, 100, 4);
        // Use cryptographically secure random for game mechanics
        const isCrit = secureRandomInt(100) < critChance;
        const base = isCrit ? dmg * 3 : dmg * 2;
        const variance = 0.5 + (secureRandomInt(1000) / 2000); // 0.5 to 1.0 range
        const damage = Math.max(0, Math.round(base * variance));

        // Broadcast hit to BOTH players as a regular player_input payload (so clients reuse same handler).
        this.broadcast("player_input", {
          type: "hit",
          timestamp: now,
          serverTimestamp: now,
          shooterId: a.shooterId,
          targetPlayerId: a.targetId,
          damage,
          isCrit
        });
        continue; // arrow consumed
      }

      remaining.push(a);
    }
    this._liveArrows = remaining;
  }

  // TNT simulation: falls straight down from UFO, sticks to target on contact, explodes after 3s fuse
  private tickLiveTnt(now: number): void {
    if (!this._liveTnt.length || this.state.players.size < 2) {
      if (this._liveTnt.length) this._liveTnt = [];
      return;
    }
    const ids = Array.from(this.state.players.keys());
    if (ids.length < 2) return;

    const remaining: typeof this._liveTnt = [];
    for (const tnt of this._liveTnt) {
      // Already exploded? Remove it
      if (tnt.exploded) {
        continue;
      }

      const shooter = this.state.players.get(tnt.shooterId);
      if (!shooter) {
        continue;
      }

      // Find target (the other player)
      const targetId = ids.find((id) => id !== tnt.shooterId) || null;
      const target = targetId ? this.state.players.get(targetId) : null;

      // If TNT is stuck to a player, follow their position
      if (tnt.stuckToPlayerId && tnt.stuckAt > 0) {
        const stuckTarget = this.state.players.get(tnt.stuckToPlayerId);
        if (stuckTarget) {
          tnt.x = stuckTarget.x;
          tnt.y = stuckTarget.y;
        }

        // Check if fuse time has elapsed (3 seconds after sticking)
        if (now - tnt.stuckAt >= TNT_FUSE_MS) {
          // EXPLODE!
          tnt.exploded = true;

          // Calculate damage
          const dmg = clampNum(tnt.dmg, 1, 100000, 1);
          const base = dmg * TNT_DAMAGE_MULTIPLIER;
          const variance = 0.5 + (secureRandomInt(1000) / 2000); // 0.5 to 1.0 range
          const damage = Math.max(0, Math.round(base * variance));

          // Broadcast explosion to all players
          this.broadcast("player_input", {
            type: "tnt_explode",
            timestamp: now,
            serverTimestamp: now,
            shooterId: tnt.shooterId,
            targetPlayerId: tnt.stuckToPlayerId,
            x: tnt.x,
            y: tnt.y,
            damage,
            isCrit: false
          } as any);

          // Also send a hit event for damage processing
          this.broadcast("player_input", {
            type: "hit",
            timestamp: now,
            serverTimestamp: now,
            shooterId: tnt.shooterId,
            targetPlayerId: tnt.stuckToPlayerId,
            damage,
            isCrit: false,
            projType: "tnt",
            isTnt: true
          } as any);

          continue; // TNT consumed
        }

        // Still waiting for explosion, keep it alive
        remaining.push(tnt);
        continue;
      }

      // TNT is falling - update position
      const dtSec = Math.max(0, (now - tnt.spawnedAt) / 1000);
      tnt.y += tnt.vy * (1 / SIMULATION_RATE); // Move down each tick

      // Check if TNT hit the ground (out of bounds)
      if (tnt.y >= ARENA_BOTTOM + 50) {
        // TNT missed and hit the ground - broadcast miss and remove
        this.broadcast("player_input", {
          type: "tnt_explode",
          timestamp: now,
          serverTimestamp: now,
          shooterId: tnt.shooterId,
          x: tnt.x,
          y: ARENA_BOTTOM,
          damage: 0,
          isCrit: false
        } as any);
        continue; // TNT consumed
      }

      // Check collision with target player (compound hitbox)
      if (target) {
        let didHit = false;
        for (const c of PLAYER_HITBOX_CIRCLES) {
          const cx = target.x + c.ox;
          const cy = target.y + c.oy;
          const dx = cx - tnt.x;
          const dy = cy - tnt.y;
          const hitR = c.r + TNT_RADIUS;
          if (dx * dx + dy * dy <= hitR * hitR) {
            didHit = true;
            break;
          }
        }

        if (didHit) {
          // TNT sticks to the target!
          tnt.stuckToPlayerId = targetId;
          tnt.stuckAt = now;
          tnt.x = target.x;
          tnt.y = target.y;

          // Broadcast stick event
          this.broadcast("player_input", {
            type: "tnt_stick",
            timestamp: now,
            serverTimestamp: now,
            shooterId: tnt.shooterId,
            targetPlayerId: targetId,
            x: tnt.x,
            y: tnt.y,
            fuseMs: TNT_FUSE_MS
          } as any);

          remaining.push(tnt);
          continue;
        }
      }

      // Check timeout (max fall time before it disappears)
      if (now - tnt.spawnedAt > TNT_HIT_WINDOW_MS) {
        continue; // TNT expired
      }

      remaining.push(tnt);
    }
    this._liveTnt = remaining;
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
    const t = (pending?.input as any)?.type;
    const msg = { ...pending.input, serverTimestamp } as any;
    // For hit events, broadcast to BOTH players (attacker + target) so they stay in sync.
    // (For other inputs, exclude the sender to reduce echo.)
    if (t === "hit") {
      this.broadcast("player_input", msg);
    } else {
      this.broadcast("player_input", msg, { except: pending.client });
    }
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
      case "dash":
        this.applyDash(player, input);
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
        this.applyHit(sessionId, input);
        break;
      case "tnt":
        this.applyTnt(player, input);
        break;
      default:
        break;
    }

    // Server-authoritative win condition: if a player reaches 0 HP during an active match,
    // end immediately and pay out to the other player (prevents client-side "victory" races).
    try {
      if (this.state.gameStarted && !this._matchEnded && typeof player.hp === "number" && player.hp <= 0) {
        const ids = Array.from(this.state.players.keys());
        const winnerSid = ids.find((id) => id !== sessionId) || null;
        if (winnerSid) {
          this.endMatch("death", winnerSid);
        }
      }
    } catch {}

    // Track last fire timestamps for validating subsequent hit claims.
    // (This runs after sanitizeInput and after rate-limiting, so it's safe.)
    try {
      const now = Date.now();
      const fires = this.lastFireAtBySid.get(sessionId) || { bullet: 0, projectile: 0, mine: 0, spike: 0, tnt: 0 };
      if (input.type === "bullet") {
        fires.bullet = now;
      } else if (input.type === "projectile") {
        fires.projectile = now;
      } else if (input.type === "mine") {
        fires.mine = now;
      } else if (input.type === "tnt") {
        fires.tnt = now;
      } else if ((input as any).isSpike) {
        fires.spike = now;
      }
      this.lastFireAtBySid.set(sessionId, fires);
    } catch {}
  }

  private applyDash(player: Player, input: PlayerInputMessage): void {
    // Dash is a discrete "blink" movement: set position directly (server-authoritative),
    // and optionally accept velocity for client prediction smoothness.
    const fromX = player.x;
    const fromY = player.y;
    if (typeof input.x === "number") {
      player.x = input.x;
    }
    if (typeof input.y === "number") {
      player.y = input.y;
    }
    if (typeof input.vx === "number") {
      player.vx = input.vx;
    }
    if (typeof input.vy === "number") {
      player.vy = input.vy;
    }

    // Clamp dash destination to arena bounds and stop before stone to prevent "tunneling" through the center obstacle.
    // (Client also does this, but server must enforce for fairness + anti-cheat.)
    const cx = Math.max(ARENA_LEFT + PLAYER_RADIUS, Math.min(ARENA_RIGHT - PLAYER_RADIUS, player.x));
    const cy = Math.max(ARENA_TOP + PLAYER_RADIUS, Math.min(ARENA_BOTTOM - PLAYER_RADIUS, player.y));
    const stopped = dashStopBeforeStone(fromX, fromY, cx, cy, PLAYER_RADIUS);
    player.x = stopped.x;
    player.y = stopped.y;
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

    // When receiving an ARROW LAUNCH, create a server-authoritative projectile for hit detection.
    if (input.type === "arrow" && typeof input.x === "number" && typeof input.y === "number" && typeof input.targetX === "number" && typeof input.targetY === "number") {
      const ids = Array.from(this.state.players.keys());
      const targetId = ids.find((id) => id !== player.sessionId);
      if (targetId) {
        const dx = input.targetX - input.x;
        const dy = input.targetY - input.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.0001) {
          const vx = (dx / dist) * ARROW_SPEED_PX_PER_S;
          const vy = (dy / dist) * ARROW_SPEED_PX_PER_S;
          // Competitive: ignore client-provided dmg/critChance, use server-side stored values.
          const dmg = Math.max(1, Math.min(999, Math.round(this.dmgBySid.get(player.sessionId) ?? 1)));
          const critChance = Math.max(0, Math.min(95, Math.round(this.critChanceBySid.get(player.sessionId) ?? 4)));
          this._liveArrows.push({
            id: `a_${this.roomId}_${++this._liveArrowSeq}`,
            shooterId: player.sessionId,
            targetId,
            x: input.x,
            y: input.y,
            vx,
            vy,
            lastAt: Date.now(),
            dmg,
            critChance,
            travelPx: 0,
            bounceCount: 0,
            canDamage: true,
            maxTravelPx: 750,
            expireAt: 0
          });
        }
      }
    }
  }

  // TNT: spawns from player's position and falls straight down
  private applyTnt(player: Player, input: PlayerInputMessage): void {
    // TNT spawns from UFO position (player.x, player.y) and falls straight down
    const now = Date.now();
    const ids = Array.from(this.state.players.keys());
    const targetId = ids.find((id) => id !== player.sessionId);

    if (targetId) {
      // Use player's current X position, TNT falls straight down
      const spawnX = player.x;
      const spawnY = player.y;

      // Get server-authoritative damage stats
      const dmg = Math.max(1, Math.min(999, Math.round(this.dmgBySid.get(player.sessionId) ?? 1)));
      const critChance = Math.max(0, Math.min(95, Math.round(this.critChanceBySid.get(player.sessionId) ?? 4)));

      this._liveTnt.push({
        id: `tnt_${this.roomId}_${++this._liveTntSeq}`,
        shooterId: player.sessionId,
        x: spawnX,
        y: spawnY,
        vy: TNT_FALL_SPEED_PX_PER_S, // Falls straight down
        spawnedAt: now,
        stuckToPlayerId: null,
        stuckAt: 0,
        exploded: false,
        dmg,
        critChance
      });

      // Broadcast TNT spawn to all clients
      this.broadcast("player_input", {
        type: "tnt",
        timestamp: now,
        serverTimestamp: now,
        shooterId: player.sessionId,
        x: spawnX,
        y: spawnY,
        vy: TNT_FALL_SPEED_PX_PER_S
      } as any);
    }
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
    // stats are client-driven snapshots used primarily for opponent UI sync.
    // We already validated/clamped in handlePlayerInput. Apply only hp/armor and keep within server-known bounds.
    const maxHP = typeof player.maxHP === "number" ? player.maxHP : 100;
    const maxArmor = typeof player.maxArmor === "number" ? player.maxArmor : 50;
    if (typeof input.hp === "number") {
      player.hp = Math.max(0, Math.min(maxHP, Math.round(input.hp)));
    }
    if (typeof input.armor === "number") {
      player.armor = Math.max(0, Math.min(maxArmor, Math.round(input.armor)));
    }
  }

  private applyHit(shooterSid: string, input: PlayerInputMessage): void {
    // Apply damage to TARGET (not shooter): keeps server state consistent and fixes regen gating.
    const targetSid = (input as any)?.targetPlayerId;
    if (typeof targetSid !== "string" || !targetSid) return;
    const target = this.state.players.get(targetSid);
    if (!target) return;

    // SECURITY: clamp damage to prevent absurd client spoofing.
    const dmg = (typeof input.damage === "number" && Number.isFinite(input.damage))
      ? Math.max(0, Math.min(250, Math.round(input.damage)))
      : 0;
    if (!dmg) return;

    // Track last time TARGET took damage (used to harden regen in enforce mode).
    this.lastDamageAtBySid.set(targetSid, Date.now());

    // Apply damage to armor first, then HP (matches client feel).
    const absorbed = Math.min(dmg, target.armor);
    target.armor = Math.max(0, target.armor - absorbed);
    const remaining = dmg - absorbed;
    if (remaining > 0) {
      target.hp = Math.max(0, target.hp - remaining);
    }

    // NOTE: `shooterSid` is intentionally unused for now; kept for future auditing/logging.
    void shooterSid;
  }

  private sanitizeInput(message: any): PlayerInputMessage {
    const normalizedType = this.normalizeInputType(message?.type);
    const sanitized: PlayerInputMessage = {
      ...message,
      type: normalizedType,
      timestamp: typeof message?.timestamp === "number" ? message.timestamp : Date.now()
    };
    // Extra clamp for hit payloads (defense in depth)
    if (sanitized.type === "hit") {
      const d = (sanitized as any).damage;
      if (typeof d === "number" && Number.isFinite(d)) {
        (sanitized as any).damage = Math.max(0, Math.min(MAX_DAMAGE_PER_HIT, Math.round(d)));
      } else {
        (sanitized as any).damage = 0;
      }
    }
    return sanitized;
  }

  private normalizeInputType(type: any): PlayerInputType {
    const allowedTypes: PlayerInputType[] = [
      "click",
      "dash",
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

