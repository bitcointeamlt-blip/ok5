import { Room, Client } from "@colyseus/core";
import { UnitsState, SyncPlanet, SyncPlayer } from "../schema/UnitsState";
import { UnitsGameLogic, type ServerAttack, type ServerBattle, type GameEvents } from "../game/UnitsGameLogic";
import { generateGalaxy, pickStartingPlanet, SeededRNG } from "../game/UnitsGalaxyGenerator";
import { PLAYER_COLORS, MAX_PLAYERS, STABILITY_MAX, ABILITY_COOLDOWNS, type BuildingType } from "../game/UnitsConstants";
import { saveGalaxy, loadGalaxy, applySaveToLogic } from "../persistence/UnitsPersistence";

const TICK_RATE = 10;           // 10 Hz
const AUTOSAVE_INTERVAL = 15000; // 15 seconds
const RECONNECT_TIMEOUT = 600;   // seconds (10 minutes)
const SAVE_DEBOUNCE_MS = 2000;   // min 2s between saves

export class UnitsRoom extends Room<UnitsState> {
  logic!: UnitsGameLogic;
  galaxyId = "default";
  seed = 0;
  rng!: SeededRNG;
  tickInterval: ReturnType<typeof setInterval> | null = null;
  autosaveInterval: ReturnType<typeof setInterval> | null = null;
  // Track disconnected players for reconnection
  disconnectedPlayers: Map<string, { playerId: number; sessionId: string; leftAt: number }> = new Map();
  lastSaveTime = 0;
  pendingSave = false;
  // Ability cooldowns: playerId → abilityId → lastUsedTime (gameTime ms)
  abilityCooldowns: Map<number, Map<string, number>> = new Map();
  // Dirty planet tracking for optimized sync
  dirtyPlanets: Set<number> = new Set();
  tickCount = 0;

  onCreate(options: any): void {
    console.log("[UnitsRoom] Creating room", this.roomId);

    this.autoDispose = false;
    this.maxClients = MAX_PLAYERS;

    this.galaxyId = options.galaxyId || "default";

    // Deterministic seed from galaxyId so same galaxy = same map always.
    // If a saved galaxy exists, its seed is used via applySaveToLogic.
    // Otherwise, hash the galaxyId string into a stable seed.
    if (options.seed) {
      this.seed = options.seed;
    } else {
      let h = 0x811c9dc5; // FNV-1a
      for (let i = 0; i < this.galaxyId.length; i++) {
        h ^= this.galaxyId.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      this.seed = h >>> 0;
    }

    // Create state
    const state = new UnitsState();
    state.seed = this.seed;
    state.difficulty = options.difficulty || "medium";
    state.phase = "lobby";
    this.setState(state);

    // Create game logic with event callbacks
    const events: GameEvents = {
      onAttackLaunched: (attack) => this.broadcastAttackLaunched(attack),
      onAttackDestroyed: (attackId, playerId, reason) => {
        this.broadcast("attack_destroyed", { attackId, playerId, reason });
      },
      onBattleStarted: (battle) => this.broadcastBattleStarted(battle),
      onBattleResolved: (battle, won, remaining) => {
        this.broadcastBattleResolved(battle, won, remaining);
        this.dirtyPlanets.add(battle.planetId);
        this.debouncedSave();
      },
      onTurretFired: (planetId, targetId) => this.broadcast("turret_fired", { planetId, targetAttackId: targetId }),
      onPlanetCaptured: (planetId, newOwnerId, prevOwnerId) => {
        this.dirtyPlanets.add(planetId);
        this.syncPlanet(planetId);
        this.save();
      },
      onPlayerEliminated: (playerId) => {
        this.broadcast("player_left", { playerId });
        this.syncPlayers();
        // Check win condition
        const winnerId = this.logic.checkGameOver();
        if (winnerId >= 0) {
          this.state.phase = "gameover";
          this.state.winnerId = String(winnerId);
          console.log(`[UnitsRoom] Game over! Winner: player ${winnerId}`);
        }
        this.debouncedSave();
      },
    };

    this.logic = new UnitsGameLogic(events);
    this.logic.difficulty = state.difficulty;
    this.rng = new SeededRNG(this.seed);

    // Generate galaxy
    const galaxy = generateGalaxy(this.seed);
    this.logic.initFromGalaxy(galaxy);

    // Try to load saved state
    const saved = loadGalaxy(this.galaxyId);
    if (saved && saved.seed === this.seed) {
      applySaveToLogic(saved, this.logic);
      console.log("[UnitsRoom] Restored saved galaxy:", this.galaxyId);
    }

    // Initialize synced player schemas from restored players (all offline until they connect)
    for (const player of this.logic.players) {
      const syncPlayer = new SyncPlayer();
      syncPlayer.sessionId = "";
      syncPlayer.address = player.address;
      syncPlayer.playerId = player.id;
      syncPlayer.name = player.name;
      syncPlayer.color = player.color;
      syncPlayer.homeId = player.homeId;
      syncPlayer.alive = player.alive;
      syncPlayer.online = false;
      syncPlayer.planetCount = 0;
      syncPlayer.totalUnits = 0;
      state.players.set(String(player.id), syncPlayer);
    }

    // If we have restored players, start in playing phase immediately
    if (this.logic.players.length > 0) {
      state.phase = "playing";
    }

    // Initialize synced planet schemas
    for (const planet of this.logic.planets) {
      const sp = new SyncPlanet();
      sp.ownerId = planet.ownerId;
      sp.units = planet.units;
      sp.maxUnits = planet.maxUnits;
      sp.stability = planet.stability;
      sp.connected = planet.connected;
      sp.generating = planet.generating;
      sp.hasShield = planet.hasShield;
      sp.defense = planet.defense;
      sp.growthRate = planet.growthRate;
      sp.radius = planet.radius;
      sp.deposits = this.logic.encodeDeposits(planet.deposits);
      sp.buildings = this.logic.encodeBuildings(planet.buildings);
      state.planets.set(String(planet.id), sp);
    }

    // Register message handlers
    this.onMessage("launch_attack", (client, msg) => this.handleLaunchAttack(client, msg));
    this.onMessage("build", (client, msg) => this.handleBuild(client, msg));
    this.onMessage("toggle_gen", (client, msg) => this.handleToggleGen(client, msg));
    this.onMessage("ability", (client, msg) => this.handleAbility(client, msg));
    this.onMessage("player_ready", (client) => this.handlePlayerReady(client));

    // Start game loop
    this.tickInterval = setInterval(() => this.gameTick(), 1000 / TICK_RATE);

    // Start autosave
    this.autosaveInterval = setInterval(() => this.save(), AUTOSAVE_INTERVAL);

    console.log(`[UnitsRoom] Galaxy generated: seed=${this.seed}, planets=${this.logic.planets.length}`);
  }

  // ── Player join ─────────────────────────────────────────
  onJoin(client: Client, options: any): void {
    const address = (options.address || "").toLowerCase().trim();
    const name = options.name || "";
    console.log(`[UnitsRoom] Player joining: ${client.sessionId}, address: ${address}`);

    // Reject empty address
    if (!address) {
      client.send("error", { message: "Address is required" });
      client.leave();
      return;
    }

    // Check for reconnecting player (same wallet address)
    let existingPlayer = this.logic.findPlayerByAddress(address);
    if (existingPlayer) {
      // Reconnect
      existingPlayer.sessionId = client.sessionId;
      existingPlayer.alive = true;
      this.disconnectedPlayers.delete(address);

      // Update sync schema
      const syncPlayer = this.state.players.get(String(existingPlayer.id));
      if (syncPlayer) {
        syncPlayer.sessionId = client.sessionId;
        syncPlayer.alive = true;
        syncPlayer.online = true;
      }

      console.log(`[UnitsRoom] Player reconnected: slot ${existingPlayer.id}, address: ${address}`);
      client.send("reconnected", { playerId: existingPlayer.id });
      this.broadcast("player_joined", {
        playerId: existingPlayer.id,
        name: existingPlayer.name,
        color: existingPlayer.color,
        reconnected: true,
      });
      this.broadcast("player_online", { playerId: existingPlayer.id });
      this.sendActiveAttacks(client);

      // Send reveal zone around home planet
      const reconnectHome = this.logic.planetMap.get(existingPlayer.homeId);
      if (reconnectHome) {
        client.send("reveal_zone", { x: reconnectHome.x, y: reconnectHome.y, radius: 1500, permanent: true });
      }
      return;
    }

    // New player
    if (this.logic.players.length >= MAX_PLAYERS) {
      client.send("error", { message: "Room is full" });
      client.leave();
      return;
    }

    // Pick starting planet
    const existingHomeIds = this.logic.players.map(p => p.homeId);
    const homePlanet = pickStartingPlanet(this.logic.planets, existingHomeIds, this.rng);
    if (!homePlanet) {
      client.send("error", { message: "No suitable starting planet found" });
      client.leave();
      return;
    }

    const player = this.logic.addPlayer(client.sessionId, address, name, homePlanet.id);

    // Create sync schema for player
    const syncPlayer = new SyncPlayer();
    syncPlayer.sessionId = client.sessionId;
    syncPlayer.address = address;
    syncPlayer.playerId = player.id;
    syncPlayer.name = player.name;
    syncPlayer.color = player.color;
    syncPlayer.homeId = player.homeId;
    syncPlayer.alive = true;
    syncPlayer.online = true;
    this.state.players.set(String(player.id), syncPlayer);

    // Sync the home planet state
    this.syncPlanet(homePlanet.id);

    // Start playing once we have at least 1 player
    if (this.state.phase === "lobby") {
      this.state.phase = "playing";
    }

    console.log(`[UnitsRoom] Player joined: slot ${player.id}, home planet ${homePlanet.id}`);
    this.broadcast("player_joined", {
      playerId: player.id,
      name: player.name,
      color: player.color,
      reconnected: false,
    });
    this.broadcast("player_online", { playerId: player.id });
    this.sendActiveAttacks(client);

    // Send reveal zone around home planet
    client.send("reveal_zone", { x: homePlanet.x, y: homePlanet.y, radius: 1500, permanent: true });

    this.save();
  }

  // ── Player leave ────────────────────────────────────────
  async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.logic.findPlayerBySession(client.sessionId);
    if (!player) return;

    console.log(`[UnitsRoom] Player leaving: slot ${player.id}, consented: ${consented}`);

    // Mark as offline
    const syncPlayer = this.state.players.get(String(player.id));
    if (syncPlayer) {
      syncPlayer.online = false;
    }

    // Track for reconnection
    this.disconnectedPlayers.set(player.address, {
      playerId: player.id,
      sessionId: client.sessionId,
      leftAt: Date.now(),
    });

    this.broadcast("player_offline", { playerId: player.id });
    this.broadcast("player_left", { playerId: player.id });

    // Allow reconnection
    try {
      if (!consented) {
        await this.allowReconnection(client, RECONNECT_TIMEOUT);
        // Player reconnected (handled in onJoin with address check)
        console.log(`[UnitsRoom] Player ${player.id} reconnected via allowReconnection`);
        return;
      }
    } catch {
      // Reconnection timed out - player is gone
      console.log(`[UnitsRoom] Player ${player.id} reconnection timed out`);
    }

    // Don't mark as dead - preserve state for address-based reconnection
    this.save();
  }

  onDispose(): void {
    console.log("[UnitsRoom] Disposing room");
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.autosaveInterval) clearInterval(this.autosaveInterval);
    this.save();
  }

  // ── Game tick ───────────────────────────────────────────
  gameTick(): void {
    if (this.state.phase !== "playing") return;

    const dt = 1 / TICK_RATE;
    try {
      this.logic.tick(dt);
    } catch (err) {
      console.error(`[GAMETICK ERROR]`, err);
    }
    this.state.gameTime = this.logic.gameTime;
    this.tickCount++;

    // Sync dirty planets every tick
    for (const planetId of this.dirtyPlanets) {
      this.syncPlanet(planetId);
    }
    this.dirtyPlanets.clear();

    // Full sync every 1s (10 ticks) as fallback for gradual changes (growth, mining, stability)
    if (this.tickCount % 10 === 0) {
      this.syncAllPlanets();
      this.syncPlayers();
    }
  }

  // ── State sync helpers ────────────────────────────────
  syncPlanet(planetId: number): void {
    const planet = this.logic.planetMap.get(planetId);
    if (!planet) return;
    const sp = this.state.planets.get(String(planetId));
    if (!sp) return;

    sp.ownerId = planet.ownerId;
    sp.units = planet.units;
    sp.maxUnits = planet.maxUnits;
    sp.stability = planet.stability;
    sp.connected = planet.connected;
    sp.generating = planet.generating;
    sp.hasShield = planet.hasShield;
    sp.defense = planet.defense;
    sp.growthRate = planet.growthRate;
    sp.radius = planet.radius;
    sp.deposits = this.logic.encodeDeposits(planet.deposits);
    sp.buildings = this.logic.encodeBuildings(planet.buildings);
  }

  syncAllPlanets(): void {
    for (const planet of this.logic.planets) {
      this.syncPlanet(planet.id);
    }
  }

  syncPlayers(): void {
    for (const player of this.logic.players) {
      const sp = this.state.players.get(String(player.id));
      if (sp) {
        sp.alive = player.alive;
        sp.planetCount = player.planetCount;
        sp.totalUnits = player.totalUnits;
      }
    }
  }

  // ── Message handlers ──────────────────────────────────
  handleLaunchAttack(client: Client, msg: any): void {
    const player = this.logic.findPlayerBySession(client.sessionId);
    if (!player) return;

    const { fromId, toId, percent } = msg;
    if (typeof fromId !== "number" || typeof toId !== "number") return;
    const pct = Math.max(10, Math.min(100, percent || 50));

    this.logic.launchAttack(fromId, toId, pct, player.id, msg.blitz === true);
  }

  handleBuild(client: Client, msg: any): void {
    const player = this.logic.findPlayerBySession(client.sessionId);
    if (!player) return;

    const { planetId, slot, buildingType } = msg;
    if (typeof planetId !== "number" || typeof slot !== "number" || typeof buildingType !== "string") return;

    const success = this.logic.build(planetId, slot, buildingType as BuildingType, player.id);
    if (success) {
      this.dirtyPlanets.add(planetId);
      this.syncPlanet(planetId);
      client.send("build_result", { success: true, planetId, slot, buildingType });
    } else {
      client.send("build_result", { success: false, planetId, slot, buildingType });
    }
  }

  handleToggleGen(client: Client, msg: any): void {
    const player = this.logic.findPlayerBySession(client.sessionId);
    if (!player) return;

    const { planetId } = msg;
    if (typeof planetId !== "number") return;

    this.logic.toggleGenerating(planetId, player.id);
    this.dirtyPlanets.add(planetId);
    this.syncPlanet(planetId);
  }

  handleAbility(client: Client, msg: any): void {
    const player = this.logic.findPlayerBySession(client.sessionId);
    if (!player) return;

    const { abilityId, targetPlanetId } = msg;
    if (typeof abilityId !== "string" || typeof targetPlanetId !== "number") return;

    // Cooldown enforcement
    const cooldown = ABILITY_COOLDOWNS[abilityId];
    if (cooldown === undefined) return; // unknown ability
    if (!this.abilityCooldowns.has(player.id)) {
      this.abilityCooldowns.set(player.id, new Map());
    }
    const playerCooldowns = this.abilityCooldowns.get(player.id)!;
    const lastUsed = playerCooldowns.get(abilityId) || 0;
    if (this.logic.gameTime - lastUsed < cooldown) {
      const remaining = Math.ceil((cooldown - (this.logic.gameTime - lastUsed)) / 1000);
      client.send("ability_result", { success: false, abilityId, reason: "cooldown", remaining });
      return;
    }

    if (abilityId === "nuke") {
      const target = this.logic.planetMap.get(targetPlanetId);
      if (target && target.ownerId !== player.id) {
        // Check range
        let inRange = false;
        for (const p of this.logic.planets) {
          if (p.ownerId === player.id) {
            const dist = Math.sqrt((p.x - target.x) ** 2 + (p.y - target.y) ** 2);
            if (dist <= 500) { inRange = true; break; }
          }
        }
        if (inRange) {
          playerCooldowns.set(abilityId, this.logic.gameTime);
          target.units = Math.floor(target.units * 0.5);
          this.dirtyPlanets.add(targetPlanetId);
          this.syncPlanet(targetPlanetId);
          this.broadcast("ability_used", { abilityId, targetPlanetId, playerId: player.id });
        }
      }
    } else if (abilityId === "shield") {
      const target = this.logic.planetMap.get(targetPlanetId);
      if (target && target.ownerId === player.id) {
        playerCooldowns.set(abilityId, this.logic.gameTime);
        target.hasShield = true;
        this.dirtyPlanets.add(targetPlanetId);
        this.syncPlanet(targetPlanetId);
        this.broadcast("ability_used", { abilityId, targetPlanetId, playerId: player.id });
      }
    } else if (abilityId === "blitz") {
      // Blitz is handled via launch_attack with blitz=true flag,
      // but enforce cooldown here if client sends it as an ability
      playerCooldowns.set(abilityId, this.logic.gameTime);
      client.send("ability_result", { success: true, abilityId });
    }
  }

  handlePlayerReady(_client: Client): void {
    // Could implement lobby ready-up logic here
  }

  // ── Broadcast helpers ─────────────────────────────────
  broadcastAttackLaunched(attack: ServerAttack): void {
    this.broadcast("attack_launched", {
      attackId: attack.id,
      fromId: attack.fromId,
      toId: attack.toId,
      units: attack.units,
      playerId: attack.playerId,
      shipType: attack.shipType,
      isBlitz: attack.isBlitz,
    });
  }

  broadcastBattleStarted(battle: ServerBattle): void {
    this.broadcast("battle_started", {
      planetId: battle.planetId,
      attackUnits: battle.attackUnits,
      attackPlayerId: battle.attackPlayerId,
      defendUnits: battle.defendUnits,
      duration: battle.duration,
    });
  }

  broadcastBattleResolved(battle: ServerBattle, won: boolean, remainingUnits: number): void {
    this.broadcast("battle_resolved", {
      planetId: battle.planetId,
      won,
      attackPlayerId: battle.attackPlayerId,
      remainingUnits,
    });
  }

  // ── Active attacks sync ──────────────────────────────
  sendActiveAttacks(client: Client): void {
    const activeAttacks = this.logic.attacks.map(a => ({
      attackId: a.id,
      fromId: a.fromId,
      toId: a.toId,
      units: a.units,
      playerId: a.playerId,
      shipType: a.shipType,
      isBlitz: a.isBlitz,
      progress: a.traveledDist, // how far along
      startX: a.startX,
      startY: a.startY,
      x: a.x,
      y: a.y,
    }));
    const activeBattles = this.logic.battles.filter(b => !b.resolved).map(b => ({
      planetId: b.planetId,
      attackUnits: b.attackUnits,
      attackPlayerId: b.attackPlayerId,
      defendUnits: b.defendUnits,
      duration: b.duration,
      elapsed: (this.logic.gameTime - b.startTime) / 1000,
    }));
    client.send("active_attacks", { attacks: activeAttacks, battles: activeBattles });
  }

  // ── Persistence ───────────────────────────────────────
  debouncedSave(): void {
    const now = Date.now();
    if (now - this.lastSaveTime >= SAVE_DEBOUNCE_MS) {
      this.save();
    } else if (!this.pendingSave) {
      this.pendingSave = true;
      setTimeout(() => {
        this.pendingSave = false;
        this.save();
      }, SAVE_DEBOUNCE_MS - (now - this.lastSaveTime));
    }
  }

  save(): void {
    this.lastSaveTime = Date.now();
    saveGalaxy(this.galaxyId, this.seed, this.logic);
  }
}
