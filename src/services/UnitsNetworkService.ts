// ========== UNITS NETWORK SERVICE ==========
// Client-side Colyseus connection for the Units multiplayer game.
// Manages room connection, state sync, and command sending.

import { Client, Room } from "colyseus.js";

// ── Types matching server schema ────────────────────────────
export interface SyncPlanetData {
  ownerId: number;
  units: number;
  maxUnits: number;
  stability: number;
  connected: boolean;
  generating: boolean;
  hasShield: boolean;
  deposits: string;
  buildings: string;
  defense: number;
  growthRate: number;
}

export interface SyncPlayerData {
  sessionId: string;
  address: string;
  playerId: number;
  name: string;
  color: string;
  homeId: number;
  alive: boolean;
  planetCount: number;
  totalUnits: number;
}

export interface AttackLaunchedEvent {
  attackId: number;
  fromId: number;
  toId: number;
  units: number;
  playerId: number;
  shipType: string;
  isBlitz: boolean;
}

export interface BattleStartedEvent {
  planetId: number;
  attackUnits: number;
  attackPlayerId: number;
  defendUnits: number;
  duration: number;
}

export interface BattleResolvedEvent {
  planetId: number;
  won: boolean;
  attackPlayerId: number;
  remainingUnits: number;
}

export interface PlayerJoinedEvent {
  playerId: number;
  name: string;
  color: string;
  reconnected: boolean;
}

export interface UnitsNetworkCallbacks {
  onConnected: (seed: number, myPlayerId: number) => void;
  onDisconnected: (code: number, reason: string) => void;
  onError: (message: string) => void;
  onPlanetChanged: (planetId: number, data: SyncPlanetData) => void;
  onPlayerChanged: (playerId: number, data: SyncPlayerData) => void;
  onAttackLaunched: (event: AttackLaunchedEvent) => void;
  onBattleStarted: (event: BattleStartedEvent) => void;
  onBattleResolved: (event: BattleResolvedEvent) => void;
  onTurretFired: (planetId: number, targetAttackId: number) => void;
  onAbilityUsed: (abilityId: string, targetPlanetId: number, playerId: number) => void;
  onPlayerJoined: (event: PlayerJoinedEvent) => void;
  onPlayerLeft: (playerId: number) => void;
  onReconnected: (playerId: number) => void;
  onPhaseChanged: (phase: string) => void;
  onGameTimeUpdated: (gameTime: number) => void;
}

// ── Service ─────────────────────────────────────────────────
export class UnitsNetworkService {
  private client: Client | null = null;
  private room: Room | null = null;
  private callbacks: UnitsNetworkCallbacks;
  private myPlayerId = -1;
  private _connected = false;
  private _seed = 0;

  constructor(callbacks: UnitsNetworkCallbacks) {
    this.callbacks = callbacks;
  }

  get connected(): boolean { return this._connected; }
  get seed(): number { return this._seed; }
  get playerId(): number { return this.myPlayerId; }

  // ── Connect ───────────────────────────────────────────
  async connect(serverUrl: string, address: string, name: string, galaxyId?: string): Promise<boolean> {
    try {
      this.client = new Client(serverUrl);
      this.room = await this.client.joinOrCreate("units_room", {
        address,
        name,
        galaxyId: galaxyId || "default",
      });

      this._connected = true;
      this._seed = (this.room.state as any).seed;

      // Listen for state changes
      this.setupStateListeners();
      this.setupMessageListeners();

      // Room leave
      this.room.onLeave((code) => {
        this._connected = false;
        this.callbacks.onDisconnected(code, `Left room with code ${code}`);
      });

      this.room.onError((code, message) => {
        this.callbacks.onError(`Room error ${code}: ${message}`);
      });

      return true;
    } catch (e: any) {
      this.callbacks.onError(e.message || "Connection failed");
      return false;
    }
  }

  // ── State listeners ───────────────────────────────────
  private setupStateListeners(): void {
    if (!this.room) return;
    const state = this.room.state as any;

    // Listen for phase changes
    state.listen("phase", (value: string) => {
      this.callbacks.onPhaseChanged(value);
    });

    // Listen for gameTime changes
    state.listen("gameTime", (value: number) => {
      this.callbacks.onGameTimeUpdated(value);
    });

    // Listen for planet map changes
    state.planets.onAdd((planet: any, key: string) => {
      const planetId = parseInt(key);
      // Listen for changes on this planet
      planet.onChange(() => {
        this.callbacks.onPlanetChanged(planetId, {
          ownerId: planet.ownerId,
          units: planet.units,
          maxUnits: planet.maxUnits,
          stability: planet.stability,
          connected: planet.connected,
          generating: planet.generating,
          hasShield: planet.hasShield,
          deposits: planet.deposits,
          buildings: planet.buildings,
          defense: planet.defense,
          growthRate: planet.growthRate,
        });
      });
    });

    // Listen for player map changes
    state.players.onAdd((player: any, key: string) => {
      const playerId = parseInt(key);
      player.onChange(() => {
        this.callbacks.onPlayerChanged(playerId, {
          sessionId: player.sessionId,
          address: player.address,
          playerId: player.playerId,
          name: player.name,
          color: player.color,
          homeId: player.homeId,
          alive: player.alive,
          planetCount: player.planetCount,
          totalUnits: player.totalUnits,
        });
      });
    });
  }

  // ── Message listeners ─────────────────────────────────
  private setupMessageListeners(): void {
    if (!this.room) return;

    this.room.onMessage("reconnected", (msg: any) => {
      this.myPlayerId = msg.playerId;
      this.callbacks.onReconnected(msg.playerId);
      this.callbacks.onConnected(this._seed, this.myPlayerId);
    });

    this.room.onMessage("error", (msg: any) => {
      this.callbacks.onError(msg.message || "Server error");
    });

    this.room.onMessage("attack_launched", (msg: AttackLaunchedEvent) => {
      this.callbacks.onAttackLaunched(msg);
    });

    this.room.onMessage("battle_started", (msg: BattleStartedEvent) => {
      this.callbacks.onBattleStarted(msg);
    });

    this.room.onMessage("battle_resolved", (msg: BattleResolvedEvent) => {
      this.callbacks.onBattleResolved(msg);
    });

    this.room.onMessage("turret_fired", (msg: any) => {
      this.callbacks.onTurretFired(msg.planetId, msg.targetAttackId);
    });

    this.room.onMessage("ability_used", (msg: any) => {
      this.callbacks.onAbilityUsed(msg.abilityId, msg.targetPlanetId, msg.playerId);
    });

    this.room.onMessage("player_joined", (msg: PlayerJoinedEvent) => {
      // Detect our own playerId from the join message
      // Server sends this for every player including ourselves
      if (this.myPlayerId < 0) {
        // First player_joined after our connect = us
        this.myPlayerId = msg.playerId;
        this.callbacks.onConnected(this._seed, this.myPlayerId);
      }
      this.callbacks.onPlayerJoined(msg);
    });

    this.room.onMessage("player_left", (msg: any) => {
      this.callbacks.onPlayerLeft(msg.playerId);
    });

    this.room.onMessage("build_result", (_msg: any) => {
      // Client can use this for UI feedback
    });
  }

  // ── Commands (client → server) ────────────────────────
  sendLaunchAttack(fromId: number, toId: number, percent: number, blitz = false): void {
    if (!this.room) return;
    this.room.send("launch_attack", { fromId, toId, percent, blitz });
  }

  sendBuild(planetId: number, slot: number, buildingType: string): void {
    if (!this.room) return;
    this.room.send("build", { planetId, slot, buildingType });
  }

  sendToggleGen(planetId: number): void {
    if (!this.room) return;
    this.room.send("toggle_gen", { planetId });
  }

  sendAbility(abilityId: string, targetPlanetId: number): void {
    if (!this.room) return;
    this.room.send("ability", { abilityId, targetPlanetId });
  }

  sendPlayerReady(): void {
    if (!this.room) return;
    this.room.send("player_ready", {});
  }

  // ── Disconnect ────────────────────────────────────────
  disconnect(): void {
    if (this.room) {
      this.room.leave();
      this.room = null;
    }
    this._connected = false;
    this.myPlayerId = -1;
  }

  // ── Utility ───────────────────────────────────────────
  /** Parse "carbon:50,water:30" → [{type,amount}] */
  static parseDeposits(str: string): { type: string; amount: number }[] {
    if (!str) return [];
    return str.split(",").filter(Boolean).map(part => {
      const [type, amt] = part.split(":");
      return { type, amount: parseInt(amt) || 0 };
    });
  }

  /** Parse "turret:0,mine:1," → [(building|null)] */
  static parseBuildings(str: string): ({ type: string; slot: number } | null)[] {
    const result: ({ type: string; slot: number } | null)[] = [null, null, null];
    if (!str) return result;
    for (const part of str.split(",").filter(Boolean)) {
      const [type, slotStr] = part.split(":");
      const slot = parseInt(slotStr);
      if (type && !isNaN(slot) && slot >= 0 && slot < 3) {
        result[slot] = { type, slot };
      }
    }
    return result;
  }

  /** Get all current planet data from the room state snapshot */
  getAllPlanets(): Map<number, SyncPlanetData> {
    const result = new Map<number, SyncPlanetData>();
    if (!this.room) return result;
    const state = this.room.state as any;
    state.planets.forEach((planet: any, key: string) => {
      result.set(parseInt(key), {
        ownerId: planet.ownerId,
        units: planet.units,
        maxUnits: planet.maxUnits,
        stability: planet.stability,
        connected: planet.connected,
        generating: planet.generating,
        hasShield: planet.hasShield,
        deposits: planet.deposits,
        buildings: planet.buildings,
        defense: planet.defense,
        growthRate: planet.growthRate,
      });
    });
    return result;
  }

  /** Get all current player data */
  getAllPlayers(): Map<number, SyncPlayerData> {
    const result = new Map<number, SyncPlayerData>();
    if (!this.room) return result;
    const state = this.room.state as any;
    state.players.forEach((player: any, key: string) => {
      result.set(parseInt(key), {
        sessionId: player.sessionId,
        address: player.address,
        playerId: player.playerId,
        name: player.name,
        color: player.color,
        homeId: player.homeId,
        alive: player.alive,
        planetCount: player.planetCount,
        totalUnits: player.totalUnits,
      });
    });
    return result;
  }
}
