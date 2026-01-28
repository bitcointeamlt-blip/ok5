// ========== SERVER-SIDE GAME LOGIC ==========
// All authoritative gameplay simulation.
// No DOM, no rendering, no Colyseus schema imports.

import {
  WORLD_SIZE, STABILITY_MAX, SUPPLY_RANGE,
  EMPIRE_SLOW_THRESHOLD, EMPIRE_DECAY_THRESHOLD,
  EMPIRE_GROWTH_PENALTY, EMPIRE_DEGRADE_UNIT_THRESHOLD,
  DISTANCE_NO_PENALTY, DISTANCE_PENALTY_PER_30PX,
  ATTACK_BASE_SPEED, TURRET_FIRE_DISTANCE, TURRET_DAMAGE_DIVISOR,
  TURRET_MISSILE_SPEED, DRONE_INTERCEPT_RANGE, SHIELD_RADIUS,
  DIFFICULTY_SETTINGS, PlanetSize, getPlanetProperties,
  getDistance, getMiningParams, type DepositType, type BuildingType,
  PLAYER_COLORS, MAX_PLAYERS,
} from "./UnitsConstants";
import type { GeneratedPlanet, ResourceDeposit } from "./UnitsGalaxyGenerator";

// ── Server-side planet (mutable) ────────────────────────────
export interface ServerPlanet {
  id: number;
  x: number; y: number;
  radius: number;
  size: PlanetSize;
  ownerId: number;
  units: number;
  maxUnits: number;
  defense: number;
  growthRate: number;
  stability: number;
  connected: boolean;
  generating: boolean;
  hasShield: boolean;
  deposits: ResourceDeposit[];
  buildings: (null | { type: BuildingType; slot: number })[];
  nextMineTime: number;
  nextTurretFireTime: number;
  isMoon: boolean;
  parentId: number;
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
  isBlackHole: boolean;
}

export interface ServerPlayer {
  id: number;
  sessionId: string;
  address: string;
  name: string;
  color: string;
  colorDark: string;
  homeId: number;
  alive: boolean;
  isAI: boolean;
  planetCount: number;
  totalUnits: number;
}

export interface ServerAttack {
  id: number;
  fromId: number;
  toId: number;
  units: number;
  startUnits: number;
  playerId: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  angle: number;
  traveledDist: number;
  droneCount: number;
  isBlitz: boolean;
  shieldHit: boolean;
  shipType: string;
}

export interface ServerBattle {
  planetId: number;
  attackUnits: number;
  attackPlayerId: number;
  defendUnits: number;
  defendPlayerId: number;
  startTime: number;   // gameTime ms
  duration: number;    // seconds
  isBlitz: boolean;
  resolved: boolean;
}

export interface ServerTurretMissile {
  x: number;
  y: number;
  targetAttackId: number;
  speed: number;
  planetId: number;
  delay: number; // ms
}

// ── Event callbacks ─────────────────────────────────────────
export interface GameEvents {
  onAttackLaunched(attack: ServerAttack): void;
  onBattleStarted(battle: ServerBattle): void;
  onBattleResolved(battle: ServerBattle, won: boolean, remainingUnits: number): void;
  onTurretFired(planetId: number, targetAttackId: number): void;
  onPlanetCaptured(planetId: number, newOwnerId: number, previousOwnerId: number): void;
  onPlayerEliminated(playerId: number): void;
}

// ── Main game state ─────────────────────────────────────────
export class UnitsGameLogic {
  planets: ServerPlanet[] = [];
  planetMap: Map<number, ServerPlanet> = new Map();
  players: ServerPlayer[] = [];
  attacks: ServerAttack[] = [];
  battles: ServerBattle[] = [];
  turretMissiles: ServerTurretMissile[] = [];

  gameTime = 0;       // ms
  difficulty = "medium";
  lastSupplyCheck = 0;
  lastAITick = 0;
  nextAttackId = 1;
  events: GameEvents;

  constructor(events: GameEvents) {
    this.events = events;
  }

  // ── Initialize from generated galaxy ──────────────────────
  initFromGalaxy(generatedPlanets: GeneratedPlanet[]): void {
    this.planets = [];
    this.planetMap.clear();

    for (const gp of generatedPlanets) {
      const sp: ServerPlanet = {
        id: gp.id,
        x: gp.x, y: gp.y,
        radius: gp.radius,
        size: gp.size,
        ownerId: gp.ownerId,
        units: gp.units,
        maxUnits: gp.maxUnits,
        defense: gp.defense,
        growthRate: gp.growthRate,
        stability: gp.stability,
        connected: gp.connected,
        generating: gp.generating,
        hasShield: gp.hasShield,
        deposits: gp.deposits.map(d => ({ ...d })),
        buildings: gp.buildings.map(b => b ? { type: b.type as BuildingType, slot: b.slot } : null),
        nextMineTime: gp.nextMineTime,
        nextTurretFireTime: 0,
        isMoon: gp.isMoon,
        parentId: gp.parentId,
        orbitAngle: gp.orbitAngle,
        orbitRadius: gp.orbitRadius,
        orbitSpeed: gp.orbitSpeed,
        isBlackHole: gp.isBlackHole,
      };
      this.planets.push(sp);
      this.planetMap.set(sp.id, sp);
    }
  }

  // ── Player management ─────────────────────────────────────
  addPlayer(sessionId: string, address: string, name: string, homeId: number): ServerPlayer {
    const slot = this.players.length;
    const colorEntry = PLAYER_COLORS[slot % PLAYER_COLORS.length];
    const player: ServerPlayer = {
      id: slot,
      sessionId,
      address,
      name: name || `Player ${slot + 1}`,
      color: colorEntry.color,
      colorDark: colorEntry.dark,
      homeId,
      alive: true,
      isAI: false,
      planetCount: 0,
      totalUnits: 0,
    };
    this.players.push(player);

    // Set up home planet
    const home = this.planetMap.get(homeId);
    if (home) {
      const settings = DIFFICULTY_SETTINGS[this.difficulty] || DIFFICULTY_SETTINGS.medium;
      home.ownerId = slot;
      home.units = settings.startUnits;
      home.stability = STABILITY_MAX;
      home.connected = true;
      home.generating = true;
      // Give starting resources
      home.deposits = [
        { type: 'carbon', amount: 100 },
        { type: 'water', amount: 100 },
        { type: 'gas', amount: 100 },
        { type: 'metal', amount: 100 },
        { type: 'crystal', amount: 100 },
      ];
    }

    return player;
  }

  findPlayerBySession(sessionId: string): ServerPlayer | undefined {
    return this.players.find(p => p.sessionId === sessionId);
  }

  findPlayerByAddress(address: string): ServerPlayer | undefined {
    return this.players.find(p => p.address.toLowerCase() === address.toLowerCase());
  }

  // ── Main tick (called at 10 Hz) ───────────────────────────
  tick(dtSeconds: number): void {
    this.gameTime += dtSeconds * 1000;

    this.updateMoons(dtSeconds);
    this.updateMining();
    this.updateGrowth(dtSeconds);
    this.updateStability(dtSeconds);
    this.updateAttacks(dtSeconds);
    this.updateTurrets();
    this.updateTurretMissiles(dtSeconds);
    this.updateBattles();

    if (this.gameTime - this.lastSupplyCheck > 2000) {
      this.recalculateSupply();
      this.lastSupplyCheck = this.gameTime;
    }

    const aiInterval = (DIFFICULTY_SETTINGS[this.difficulty] || DIFFICULTY_SETTINGS.medium).aiInterval;
    if (this.gameTime - this.lastAITick > aiInterval) {
      for (const player of this.players) {
        if (player.isAI) this.aiTick(player);
      }
      this.lastAITick = this.gameTime;
    }
  }

  // ── Moon orbits ───────────────────────────────────────────
  updateMoons(dt: number): void {
    for (const moon of this.planets) {
      if (!moon.isMoon || moon.parentId < 0) continue;
      const parent = this.planetMap.get(moon.parentId);
      if (!parent) continue;
      moon.orbitAngle += moon.orbitSpeed * dt;
      const orbitR = moon.orbitRadius || (parent.radius + 90);
      moon.x = parent.x + Math.cos(moon.orbitAngle) * orbitR;
      moon.y = parent.y + Math.sin(moon.orbitAngle) * orbitR;
    }
  }

  // ── Mining ────────────────────────────────────────────────
  updateMining(): void {
    for (const planet of this.planets) {
      if (planet.ownerId < 0) continue;
      if (planet.deposits.length === 0) continue;
      if (this.gameTime < planet.nextMineTime) continue;

      const params = getMiningParams(planet.size);
      const deposit = planet.deposits[Math.floor(Math.random() * planet.deposits.length)];
      deposit.amount += params.amount;

      planet.nextMineTime = this.gameTime + params.minTime + Math.random() * (params.maxTime - params.minTime);
    }
  }

  // ── Growth ────────────────────────────────────────────────
  updateGrowth(dt: number): void {
    const settings = DIFFICULTY_SETTINGS[this.difficulty] || DIFFICULTY_SETTINGS.medium;

    // Recount
    for (const player of this.players) {
      player.planetCount = 0;
      player.totalUnits = 0;
    }
    for (const planet of this.planets) {
      if (planet.ownerId < 0) continue;
      const player = this.players[planet.ownerId];
      if (!player || !player.alive) continue;
      player.planetCount++;
      player.totalUnits += Math.floor(planet.units);
    }

    for (const planet of this.planets) {
      if (planet.ownerId < 0) continue;
      const player = this.players[planet.ownerId];
      if (!player || !player.alive) continue;
      if (!planet.generating) continue;
      if (this.isPlanetInBattle(planet.id)) continue;

      let growth = settings.growthRate * planet.growthRate;

      // Mine building bonus
      const mineCount = planet.buildings.filter(b => b && b.type === 'mine').length;
      if (mineCount > 0) growth *= (1 + mineCount * 0.25);

      if (player.totalUnits >= EMPIRE_DEGRADE_UNIT_THRESHOLD) {
        if (planet.stability < 30) growth = -1;
        else if (planet.stability < 70) growth *= 0.3;
        if (player.planetCount > EMPIRE_SLOW_THRESHOLD) {
          const excess = player.planetCount - EMPIRE_SLOW_THRESHOLD;
          growth *= Math.max(0.1, 1.0 - excess * EMPIRE_GROWTH_PENALTY);
        }
        if (player.planetCount > EMPIRE_DECAY_THRESHOLD) growth -= 0.5;
        if (!planet.connected) growth = Math.min(growth, -0.5);
      }

      // Factory bonus: increased max units
      const factoryCount = planet.buildings.filter(b => b && b.type === 'factory').length;
      const effectiveMax = planet.maxUnits + factoryCount * 200;

      planet.units = Math.max(0, Math.min(effectiveMax, planet.units + growth * dt));
      if (planet.units <= 0) {
        planet.ownerId = -1;
        planet.units = 0;
        planet.generating = false;
      }
    }
  }

  // ── Stability ─────────────────────────────────────────────
  updateStability(dt: number): void {
    for (const planet of this.planets) {
      if (planet.ownerId < 0) continue;
      const player = this.players[planet.ownerId];
      if (!player || !player.alive) continue;

      let targetStability = STABILITY_MAX;

      if (player.totalUnits >= EMPIRE_DEGRADE_UNIT_THRESHOLD) {
        const home = this.planetMap.get(player.homeId);
        if (home) {
          const dist = getDistance(planet, home);
          targetStability -= (dist / 200) * 3;
        }
        if (!planet.connected) targetStability = Math.min(targetStability, 20);
        if (player.planetCount > EMPIRE_SLOW_THRESHOLD) {
          const excess = player.planetCount - EMPIRE_SLOW_THRESHOLD;
          targetStability -= excess * 3;
        }
      }

      targetStability = Math.max(0, Math.min(STABILITY_MAX, targetStability));
      const rate = planet.stability < targetStability ? 5 : 2;
      if (planet.stability < targetStability) {
        planet.stability = Math.min(targetStability, planet.stability + rate * dt);
      } else {
        planet.stability = Math.max(targetStability, planet.stability - rate * dt);
      }

      if (planet.stability <= 0) {
        const prevOwner = planet.ownerId;
        planet.ownerId = -1;
        planet.units = Math.floor(planet.units * 0.3);
        planet.generating = false;
        if (prevOwner >= 0) this.enforceGeneratorSlots(prevOwner);
      }
    }
  }

  // ── Supply / connectivity ─────────────────────────────────
  recalculateSupply(): void {
    for (const p of this.planets) p.connected = false;

    for (const player of this.players) {
      if (!player.alive) continue;
      const home = this.planetMap.get(player.homeId);
      if (!home || home.ownerId !== player.id) {
        player.alive = false;
        this.events.onPlayerEliminated(player.id);
        continue;
      }

      const queue: ServerPlanet[] = [home];
      const visited = new Set<number>([home.id]);
      while (queue.length > 0) {
        const current = queue.shift()!;
        current.connected = true;
        for (const p of this.planets) {
          if (visited.has(p.id)) continue;
          if (p.ownerId !== player.id) continue;
          if (getDistance(current, p) <= SUPPLY_RANGE) {
            visited.add(p.id);
            queue.push(p);
          }
        }
      }
    }
  }

  // ── Generator slots ───────────────────────────────────────
  getMaxGenerators(planetCount: number): number {
    if (planetCount <= 5) return planetCount;
    return 5 + Math.floor((planetCount - 5) / 5);
  }

  enforceGeneratorSlots(playerId: number): void {
    const owned = this.planets.filter(p => p.ownerId === playerId);
    const maxGen = this.getMaxGenerators(owned.length);
    let activeCount = owned.filter(p => p.generating).length;

    if (activeCount > maxGen) {
      const generators = owned.filter(p => p.generating).sort((a, b) => a.radius - b.radius);
      for (let i = 0; i < generators.length && activeCount > maxGen; i++) {
        generators[i].generating = false;
        activeCount--;
      }
    }
  }

  isPlanetInBattle(planetId: number): boolean {
    return this.battles.some(b => b.planetId === planetId && !b.resolved);
  }

  // ── Attack launch ─────────────────────────────────────────
  launchAttack(fromId: number, toId: number, percent: number, playerId: number, blitz = false): ServerAttack | null {
    const from = this.planetMap.get(fromId);
    const to = this.planetMap.get(toId);
    if (!from || !to) return null;
    if (from.ownerId !== playerId) return null;
    if (from.units < 2) return null;

    const unitsToSend = Math.max(1, Math.floor(from.units * (percent / 100)));
    if (unitsToSend < 1) return null;
    from.units -= unitsToSend;

    const initialAngle = Math.atan2(to.y - from.y, to.x - from.x);
    const droneCount = from.buildings.filter(b => b && b.type === 'drone').length;

    const shipType = unitsToSend >= 401 ? 'mothership' :
      unitsToSend >= 301 ? 'startrek' :
      unitsToSend >= 201 ? 'fighter' :
      unitsToSend >= 101 ? 'cargo' : 'pod';

    const attack: ServerAttack = {
      id: this.nextAttackId++,
      fromId, toId,
      units: unitsToSend,
      startUnits: unitsToSend,
      playerId,
      x: from.x, y: from.y,
      startX: from.x, startY: from.y,
      angle: initialAngle,
      traveledDist: 0,
      droneCount,
      isBlitz: blitz,
      shieldHit: false,
      shipType,
    };
    this.attacks.push(attack);
    this.events.onAttackLaunched(attack);
    return attack;
  }

  // ── Attack movement & resolution ──────────────────────────
  calculateArrivingUnits(sentUnits: number, distance: number): number {
    if (distance <= DISTANCE_NO_PENALTY) return sentUnits;
    const extra = distance - DISTANCE_NO_PENALTY;
    const lost = Math.floor(extra / 30) * DISTANCE_PENALTY_PER_30PX;
    return Math.max(0, sentUnits - lost);
  }

  updateAttacks(dt: number): void {
    const TURN_SPEED = 5.0;

    for (let i = this.attacks.length - 1; i >= 0; i--) {
      const attack = this.attacks[i];
      const to = this.planetMap.get(attack.toId);
      if (!to) { this.removeAttack(i); continue; }

      const dx = to.x - attack.x;
      const dy = to.y - attack.y;
      const targetAngle = Math.atan2(dy, dx);
      const distToTarget = Math.sqrt(dx * dx + dy * dy);

      // Homing
      let angleDiff = targetAngle - attack.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      const maxTurn = TURN_SPEED * dt;
      if (Math.abs(angleDiff) < maxTurn) attack.angle = targetAngle;
      else attack.angle += Math.sign(angleDiff) * maxTurn;

      const moveSpeed = ATTACK_BASE_SPEED * dt;
      const oldX = attack.x, oldY = attack.y;
      attack.x += Math.cos(attack.angle) * moveSpeed;
      attack.y += Math.sin(attack.angle) * moveSpeed;
      attack.traveledDist += Math.sqrt((attack.x - oldX) ** 2 + (attack.y - oldY) ** 2);

      // Distance degradation
      attack.units = this.calculateArrivingUnits(attack.startUnits, attack.traveledDist);
      if (attack.units <= 0) { this.removeAttack(i); continue; }

      // Shield collision
      if (!attack.shieldHit && to.hasShield && to.ownerId !== attack.playerId && distToTarget <= SHIELD_RADIUS) {
        attack.shieldHit = true;
        const blocked = Math.min(attack.units, to.units);
        attack.units -= blocked;
        to.hasShield = false;
        for (let b = 0; b < to.buildings.length; b++) {
          if (to.buildings[b]?.type === 'shield_gen') { to.buildings[b] = null; break; }
        }
        if (attack.units <= 0) { this.removeAttack(i); continue; }
      }

      // Arrival
      if (distToTarget <= to.radius + 5) {
        this.resolveAttack(attack);
        this.removeAttack(i);
      }
    }
  }

  private removeAttack(index: number): void {
    this.attacks[index] = this.attacks[this.attacks.length - 1];
    this.attacks.pop();
  }

  resolveAttack(attack: ServerAttack): void {
    const to = this.planetMap.get(attack.toId);
    if (!to) return;

    let arrivingUnits = attack.units;
    if (attack.droneCount > 0) arrivingUnits = Math.floor(arrivingUnits * 1.2);

    if (to.ownerId === attack.playerId) {
      // Reinforce
      to.units = Math.min(to.maxUnits, to.units + arrivingUnits);
    } else {
      // Check existing battle
      const existing = this.battles.find(b => b.planetId === to.id && b.attackPlayerId === attack.playerId && !b.resolved);
      if (existing) {
        existing.attackUnits += arrivingUnits;
        existing.duration = Math.min(4.0, existing.duration + 0.5);
      } else {
        const totalUnits = arrivingUnits + to.units;
        const duration = Math.min(3.0, Math.max(1.0, totalUnits / 80));
        const battle: ServerBattle = {
          planetId: to.id,
          attackUnits: arrivingUnits,
          attackPlayerId: attack.playerId,
          defendUnits: to.units,
          defendPlayerId: to.ownerId,
          startTime: this.gameTime,
          duration,
          isBlitz: attack.isBlitz,
          resolved: false,
        };
        this.battles.push(battle);
        this.events.onBattleStarted(battle);
      }
    }
  }

  updateBattles(): void {
    for (let i = this.battles.length - 1; i >= 0; i--) {
      const b = this.battles[i];
      const elapsed = (this.gameTime - b.startTime) / 1000;
      if (elapsed >= b.duration && !b.resolved) {
        b.resolved = true;
        this.resolveBattle(b);
        this.battles.splice(i, 1);
      }
    }
  }

  resolveBattle(battle: ServerBattle): void {
    const to = this.planetMap.get(battle.planetId);
    if (!to) return;

    const defenseMultiplier = to.defense;
    const defenseStrength = battle.defendUnits * defenseMultiplier;

    if (battle.attackUnits > defenseStrength) {
      const previousOwner = battle.defendPlayerId;
      const remaining = battle.attackUnits - defenseStrength;
      to.ownerId = battle.attackPlayerId;
      to.units = Math.max(1, Math.floor(remaining));
      to.stability = 50;
      to.connected = false;
      to.hasShield = false;

      // Auto-activate generator if slot available
      const newOwnerPlanets = this.planets.filter(p => p.ownerId === battle.attackPlayerId);
      const maxGen = this.getMaxGenerators(newOwnerPlanets.length);
      const activeGen = newOwnerPlanets.filter(p => p.generating).length;
      to.generating = activeGen < maxGen;

      if (previousOwner >= 0) this.enforceGeneratorSlots(previousOwner);

      this.events.onBattleResolved(battle, true, to.units);
      this.events.onPlanetCaptured(battle.planetId, battle.attackPlayerId, previousOwner);
    } else {
      const prevOwner = to.ownerId;
      to.units = Math.max(0, Math.floor((defenseStrength - battle.attackUnits) / defenseMultiplier));
      if (to.units <= 0) {
        to.ownerId = -1;
        to.generating = false;
        if (prevOwner >= 0) this.enforceGeneratorSlots(prevOwner);
      }
      this.events.onBattleResolved(battle, false, to.units);
    }
  }

  // ── Turrets ───────────────────────────────────────────────
  updateTurrets(): void {
    for (const planet of this.planets) {
      if (planet.ownerId < 0) continue;
      const turretCount = planet.buildings.filter(b => b && b.type === 'turret').length;
      if (turretCount === 0) continue;
      if (planet.nextTurretFireTime && this.gameTime < planet.nextTurretFireTime) continue;

      let closestAttack: { attack: ServerAttack; dist: number } | null = null;
      for (const attack of this.attacks) {
        if (attack.playerId === planet.ownerId) continue;
        const targetPlanet = this.planetMap.get(attack.toId);
        if (!targetPlanet) continue;
        if (attack.toId !== planet.id && targetPlanet.ownerId !== planet.ownerId) continue;
        const dist = Math.sqrt((attack.x - planet.x) ** 2 + (attack.y - planet.y) ** 2);
        if (dist <= TURRET_FIRE_DISTANCE) {
          if (!closestAttack || dist < closestAttack.dist) {
            closestAttack = { attack, dist };
          }
        }
      }

      if (closestAttack) {
        planet.nextTurretFireTime = this.gameTime + 2000 + Math.random() * 3000;
        for (let m = 0; m < turretCount; m++) {
          const delay = m === 0 ? Math.random() * 500 : 300 + Math.random() * 900;
          const speed = TURRET_MISSILE_SPEED * (0.6 + Math.random() * 0.5);
          this.turretMissiles.push({
            x: planet.x, y: planet.y,
            targetAttackId: closestAttack.attack.id,
            speed,
            planetId: planet.id,
            delay,
          });
        }
        this.events.onTurretFired(planet.id, closestAttack.attack.id);
      }
    }
  }

  updateTurretMissiles(dt: number): void {
    for (let i = this.turretMissiles.length - 1; i >= 0; i--) {
      const missile = this.turretMissiles[i];
      const attack = this.attacks.find(a => a.id === missile.targetAttackId);

      if (!attack) { this.removeTurretMissile(i); continue; }

      if (missile.delay > 0) { missile.delay -= dt * 1000; continue; }

      const dx = attack.x - missile.x;
      const dy = attack.y - missile.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 15) {
        const planet = this.planetMap.get(missile.planetId);
        const damage = planet ? Math.floor(planet.units / TURRET_DAMAGE_DIVISOR) : 10;

        if (damage >= attack.units) {
          // Destroy attack
          const idx = this.attacks.indexOf(attack);
          if (idx >= 0) this.removeAttack(idx);
        } else {
          attack.units -= damage;
          attack.startUnits -= damage;
          if (attack.startUnits < attack.units) attack.startUnits = attack.units;
        }
        this.removeTurretMissile(i);
      } else {
        const moveSpeed = missile.speed * dt;
        missile.x += (dx / dist) * moveSpeed;
        missile.y += (dy / dist) * moveSpeed;
      }
    }
  }

  private removeTurretMissile(index: number): void {
    this.turretMissiles[index] = this.turretMissiles[this.turretMissiles.length - 1];
    this.turretMissiles.pop();
  }

  // ── AI ────────────────────────────────────────────────────
  aiTick(player: ServerPlayer): void {
    if (!player.alive || !player.isAI) return;

    const myPlanets = this.planets.filter(p => p.ownerId === player.id);
    if (myPlanets.length === 0) { player.alive = false; return; }

    // Generator management
    const maxGen = this.getMaxGenerators(myPlanets.length);
    for (const p of myPlanets) p.generating = false;
    const sorted = [...myPlanets].sort((a, b) => b.radius - a.radius);
    for (let i = 0; i < Math.min(maxGen, sorted.length); i++) sorted[i].generating = true;

    interface AiCandidate { from: ServerPlanet; to: ServerPlanet; priority: number }
    const candidates: AiCandidate[] = [];

    for (const mine of myPlanets) {
      if (mine.units < 40) continue;
      for (const target of this.planets) {
        if (target.ownerId === player.id) continue;
        const dist = getDistance(mine, target);
        if (dist > 600) continue;
        let priority = 0;
        if (target.ownerId === -1) {
          priority = 10 - (target.units / target.maxUnits) * 5;
          priority += (600 - dist) / 100;
          if (target.size === PlanetSize.LARGE || target.size === PlanetSize.GIANT) priority += 5;
        } else {
          const defStr = target.units * target.defense;
          const arriving = this.calculateArrivingUnits(Math.floor(mine.units * 0.5), dist);
          if (arriving > defStr * 1.2) {
            priority = 8;
            const enemyPlayer = this.players[target.ownerId];
            if (enemyPlayer && target.id === enemyPlayer.homeId) priority += 10;
          }
        }
        if (priority > 0) candidates.push({ from: mine, to: target, priority });
      }
    }

    candidates.sort((a, b) => b.priority - a.priority);
    const maxActions = Math.min(2, candidates.length);
    for (let i = 0; i < maxActions; i++) {
      if (candidates[i].from.units > 40) {
        this.launchAttack(candidates[i].from.id, candidates[i].to.id, 50, player.id);
      }
    }
  }

  // ── Building ──────────────────────────────────────────────
  build(planetId: number, slot: number, buildingType: BuildingType, playerId: number): boolean {
    const planet = this.planetMap.get(planetId);
    if (!planet) return false;
    if (planet.ownerId !== playerId) return false;
    if (slot < 0 || slot >= 3) return false;
    if (planet.buildings[slot] !== null) return false;
    if (planet.size === PlanetSize.ASTEROID) return false;

    // Cost check
    const costs = this.getBuildingCost(buildingType);
    if (!costs) return false;

    // Check affordability across all player's planets
    const totalResources = this.getPlayerTotalResources(playerId);
    for (const [type, amount] of Object.entries(costs)) {
      if ((totalResources[type as DepositType] || 0) < amount) return false;
    }

    // Deduct costs
    this.deductResources(playerId, costs);

    planet.buildings[slot] = { type: buildingType, slot };

    // Shield gen: activate shield immediately
    if (buildingType === 'shield_gen') planet.hasShield = true;

    return true;
  }

  getBuildingCost(type: BuildingType): Partial<Record<DepositType, number>> | null {
    switch (type) {
      case 'turret':     return { metal: 30, carbon: 20 };
      case 'mine':       return { metal: 20, crystal: 25 };
      case 'factory':    return { carbon: 30, gas: 20 };
      case 'shield_gen': return { crystal: 30, gas: 25 };
      case 'drone':      return { water: 25, crystal: 20 };
      default: return null;
    }
  }

  getPlayerTotalResources(playerId: number): Record<DepositType, number> {
    const totals: Record<DepositType, number> = { carbon: 0, water: 0, gas: 0, metal: 0, crystal: 0 };
    for (const planet of this.planets) {
      if (planet.ownerId !== playerId) continue;
      for (const dep of planet.deposits) {
        totals[dep.type] += dep.amount;
      }
    }
    return totals;
  }

  deductResources(playerId: number, costs: Partial<Record<DepositType, number>>): void {
    for (const [type, amount] of Object.entries(costs)) {
      let remaining = amount as number;
      for (const planet of this.planets) {
        if (planet.ownerId !== playerId) continue;
        for (const dep of planet.deposits) {
          if (dep.type === type && dep.amount > 0) {
            const take = Math.min(dep.amount, remaining);
            dep.amount -= take;
            remaining -= take;
            if (remaining <= 0) break;
          }
        }
        if (remaining <= 0) break;
      }
    }
  }

  // ── Toggle generating ─────────────────────────────────────
  toggleGenerating(planetId: number, playerId: number): boolean {
    const planet = this.planetMap.get(planetId);
    if (!planet || planet.ownerId !== playerId) return false;

    if (planet.generating) {
      planet.generating = false;
    } else {
      const owned = this.planets.filter(p => p.ownerId === playerId);
      const maxGen = this.getMaxGenerators(owned.length);
      const activeGen = owned.filter(p => p.generating).length;
      if (activeGen < maxGen) planet.generating = true;
      else return false;
    }
    return true;
  }

  // ── Encoding helpers ──────────────────────────────────────
  encodeDeposits(deposits: ResourceDeposit[]): string {
    return deposits.map(d => `${d.type}:${d.amount}`).join(",");
  }

  encodeBuildings(buildings: (null | { type: string; slot: number })[]): string {
    return buildings.map((b, i) => b ? `${b.type}:${i}` : "").join(",");
  }
}
