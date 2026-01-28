// ========== SEEDED GALAXY GENERATOR ==========
// Deterministic planet generation from a seed.
// Produces identical galaxy layout on both server and client.
// No DOM or Colyseus dependencies.

import {
  WORLD_SIZE, SUN_X, SUN_Y, SUN_RADIUS, SUN_NO_SPAWN_RADIUS,
  MIN_PLANET_DISTANCE, PlanetSize, getPlanetProperties,
  SIZE_DISTRIBUTION, ALL_DEPOSIT_TYPES, PLANET_PALETTE,
  STABILITY_MAX, type DepositType,
} from "./UnitsConstants";

// ── Seeded RNG (mulberry32) ─────────────────────────────────
export class SeededRNG {
  private state: number;
  constructor(seed: number) {
    this.state = seed;
  }
  /** Returns [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  /** Float in [min, max) */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  /** Shuffle array in-place */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// ── Planet data (no rendering, no Colyseus) ─────────────────
export interface ResourceDeposit {
  type: DepositType;
  amount: number;
}

export interface GeneratedPlanet {
  id: number;
  x: number;
  y: number;
  radius: number;
  size: PlanetSize;
  ownerId: number;          // -1 = neutral
  units: number;
  maxUnits: number;
  defense: number;
  growthRate: number;
  stability: number;
  connected: boolean;
  generating: boolean;
  deposits: ResourceDeposit[];
  color: string;
  craters: { x: number; y: number; r: number }[];
  isMoon: boolean;
  parentId: number;         // -1 if not a moon
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
  isBlackHole: boolean;
  hasShield: boolean;
  buildings: (null | { type: string; slot: number })[];
  nextMineTime: number;
  pulsePhase: number;
}

// ── Generator ───────────────────────────────────────────────
export function generateGalaxy(seed: number): GeneratedPlanet[] {
  const rng = new SeededRNG(seed);
  const planets: GeneratedPlanet[] = [];
  let id = 0;

  // Helper: make empty planet
  function makePlanet(overrides: Partial<GeneratedPlanet>): GeneratedPlanet {
    return {
      id: id++,
      x: 0, y: 0, radius: 10,
      size: PlanetSize.ASTEROID,
      ownerId: -1,
      units: 0, maxUnits: 100,
      defense: 1, growthRate: 1,
      stability: 50,
      connected: false,
      generating: false,
      deposits: [],
      color: '#888',
      craters: [],
      isMoon: false,
      parentId: -1,
      orbitAngle: 0,
      orbitRadius: 0,
      orbitSpeed: 0,
      isBlackHole: false,
      hasShield: false,
      buildings: [null, null, null],
      nextMineTime: 5000 + rng.float(0, 5000),
      pulsePhase: rng.float(0, Math.PI * 2),
      ...overrides,
    };
  }

  // ── Main planet placement ──
  for (const { size, count } of SIZE_DISTRIBUTION) {
    for (let i = 0; i < count; i++) {
      const props = getPlanetProperties(size);
      const radius = rng.float(props.minR, props.maxR);

      let x = 0, y = 0, valid = false, attempts = 0;
      while (!valid && attempts < 100) {
        x = radius + rng.float(0, WORLD_SIZE - radius * 2);
        y = radius + rng.float(0, WORLD_SIZE - radius * 2);
        valid = true;
        const sunDist = Math.sqrt((x - SUN_X) ** 2 + (y - SUN_Y) ** 2);
        if (sunDist < SUN_NO_SPAWN_RADIUS + radius) { valid = false; attempts++; continue; }
        for (const p of planets) {
          const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
          if (dist < p.radius + radius + MIN_PLANET_DISTANCE) { valid = false; break; }
        }
        attempts++;
      }
      if (!valid) continue;

      // Craters
      const craterCount = Math.floor(radius / 10) + rng.int(0, 2);
      const craters: { x: number; y: number; r: number }[] = [];
      for (let c = 0; c < craterCount; c++) {
        const angle = rng.float(0, Math.PI * 2);
        const dist = rng.next() * radius * 0.6;
        craters.push({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, r: 2 + rng.next() * (radius * 0.15) });
      }

      // Starting units
      let startingUnits: number;
      switch (size) {
        case PlanetSize.ASTEROID:  startingUnits = rng.int(10, 39);   break;
        case PlanetSize.TINY:      startingUnits = rng.int(15, 54);   break;
        case PlanetSize.SMALL:     startingUnits = rng.int(30, 109);  break;
        case PlanetSize.MEDIUM:    startingUnits = rng.int(80, 229);  break;
        case PlanetSize.LARGE:     startingUnits = rng.int(150, 449); break;
        case PlanetSize.GIANT:     startingUnits = rng.int(300, 799); break;
        case PlanetSize.MEGA:      startingUnits = rng.int(500, 1299); break;
        case PlanetSize.TITAN:     startingUnits = rng.int(800, 1999); break;
        case PlanetSize.COLOSSUS:  startingUnits = rng.int(1200, 2699); break;
      }

      const planetColor = PLANET_PALETTE[rng.int(0, PLANET_PALETTE.length - 1)];

      // Deposits
      const maxDeposits = size === PlanetSize.COLOSSUS ? 5 : size === PlanetSize.TITAN ? 5 : size === PlanetSize.MEGA ? 5 :
        size === PlanetSize.GIANT ? 4 : size === PlanetSize.LARGE ? 3 : size === PlanetSize.MEDIUM ? 2 : 1;
      const numDeposits = Math.max(1, rng.int(1, maxDeposits));
      const shuffled = rng.shuffle([...ALL_DEPOSIT_TYPES]);
      const deposits: ResourceDeposit[] = shuffled.slice(0, numDeposits).map(type => ({ type, amount: 0 }));

      planets.push(makePlanet({
        x, y, radius, size,
        units: startingUnits,
        maxUnits: props.maxUnits,
        defense: props.defense,
        growthRate: props.growth,
        deposits,
        color: planetColor,
        craters,
      }));
    }
  }

  // ── Sun ──
  planets.push(makePlanet({
    x: SUN_X, y: SUN_Y,
    radius: SUN_RADIUS,
    size: PlanetSize.GIANT,
    units: 1000000,
    maxUnits: 1000000,
    defense: 100,
    growthRate: 0,
    stability: STABILITY_MAX,
    connected: true,
    deposits: [],
    color: '#ffd040',
    craters: [],
  }));

  // ── Moons ──
  const mainPlanets = [...planets];
  for (const parent of mainPlanets) {
    if (parent.radius === SUN_RADIUS) continue;

    let moonCount = 0;
    let moonSize: PlanetSize = PlanetSize.ASTEROID;
    if (parent.size === PlanetSize.LARGE)    { moonCount = 1; moonSize = PlanetSize.ASTEROID; }
    else if (parent.size === PlanetSize.GIANT)    { moonCount = 1; moonSize = PlanetSize.SMALL; }
    else if (parent.size === PlanetSize.MEGA)     { moonCount = 1; moonSize = PlanetSize.SMALL; }
    else if (parent.size === PlanetSize.TITAN)    { moonCount = 1; moonSize = PlanetSize.MEDIUM; }
    else if (parent.size === PlanetSize.COLOSSUS) { moonCount = 2; moonSize = PlanetSize.MEDIUM; }

    for (let m = 0; m < moonCount; m++) {
      const moonProps = getPlanetProperties(moonSize);
      const moonRadius = rng.float(moonProps.minR, moonProps.maxR);
      const moonOrbitRadius = parent.radius + moonRadius + 70 + rng.float(0, 30) + m * 50;
      const moonAngle = rng.float(0, Math.PI * 2) + m * Math.PI;
      const moonX = parent.x + Math.cos(moonAngle) * moonOrbitRadius;
      const moonY = parent.y + Math.sin(moonAngle) * moonOrbitRadius;

      const numDeposits = moonSize === PlanetSize.MEDIUM ? 2 : 1;
      const shuffled2 = rng.shuffle([...ALL_DEPOSIT_TYPES]);
      const moonDeposits: ResourceDeposit[] = shuffled2.slice(0, numDeposits).map(type => ({ type, amount: 0 }));

      let moonUnits = 50;
      if (moonSize === PlanetSize.SMALL) moonUnits = rng.int(30, 109);
      else if (moonSize === PlanetSize.MEDIUM) moonUnits = rng.int(80, 229);

      const moonColor = PLANET_PALETTE[rng.int(0, PLANET_PALETTE.length - 1)];

      planets.push(makePlanet({
        x: moonX, y: moonY,
        radius: moonRadius,
        size: moonSize,
        units: moonUnits,
        maxUnits: moonProps.maxUnits,
        defense: moonProps.defense,
        growthRate: moonProps.growth,
        deposits: moonDeposits,
        color: moonColor,
        craters: [
          { x: rng.float(-2, 2), y: rng.float(-2, 2), r: 2 + moonRadius * 0.05 },
          { x: rng.float(-2, 2), y: rng.float(-2, 2), r: 1.5 + moonRadius * 0.03 },
        ],
        isMoon: true,
        parentId: parent.id,
        orbitAngle: moonAngle,
        orbitRadius: moonOrbitRadius,
        orbitSpeed: rng.float(0.05, 0.1),
      }));
    }
  }

  // ── Black hole (placed later, after player homes are assigned) ──
  // We generate it as part of the galaxy so the seed is deterministic
  const bhRadius = 80;
  // Place black hole in a random quadrant, well away from sun
  const bhAngle = rng.float(0, Math.PI * 2);
  const bhDist = rng.float(3000, 8000);
  let bhX = SUN_X + Math.cos(bhAngle) * bhDist;
  let bhY = SUN_Y + Math.sin(bhAngle) * bhDist;
  // Clamp to world bounds
  bhX = Math.max(bhRadius + 100, Math.min(WORLD_SIZE - bhRadius - 100, bhX));
  bhY = Math.max(bhRadius + 100, Math.min(WORLD_SIZE - bhRadius - 100, bhY));

  planets.push(makePlanet({
    x: bhX, y: bhY,
    radius: bhRadius,
    size: PlanetSize.GIANT,
    units: 10000,
    maxUnits: 15000,
    defense: 5.0,
    growthRate: 0,
    stability: STABILITY_MAX,
    deposits: [
      { type: 'crystal', amount: 0 },
      { type: 'gas', amount: 0 },
      { type: 'metal', amount: 0 },
    ],
    color: '#1a0a2e',
    craters: [],
    isBlackHole: true,
  }));

  return planets;
}

/**
 * Pick a starting planet for a new player.
 * Prefers SMALL/MEDIUM, unowned, far from other players' homes.
 */
/** Minimal planet shape needed for pickStartingPlanet */
interface PickablePlanet {
  id: number; x: number; y: number; radius: number;
  size: PlanetSize; ownerId: number; isMoon: boolean; isBlackHole: boolean;
}

export function pickStartingPlanet<T extends PickablePlanet>(
  planets: T[],
  existingHomeIds: number[],
  rng: SeededRNG,
): T | null {
  // Players start in the OUTER RING (far from sun) so the goal is to conquer toward center.
  // Players are placed as NEIGHBORS (~1500-2500px apart) so they can discover each other
  // through fog of war during gameplay. SMALL vision=900px, MEDIUM vision=1200px,
  // so at ~1500px apart they won't see each other immediately.
  const MIN_SUN_DISTANCE = 12000;       // Must be far from sun (sun at 20000,20000)
  const NEIGHBOR_MIN_DIST = 1500;       // Too close = instant visibility
  const NEIGHBOR_MAX_DIST = 3000;       // Too far = never find each other
  const MIN_DISTANCE_FROM_OTHERS = 1200; // Absolute minimum between homes

  // Collect positions of existing homes
  const homePositions = existingHomeIds
    .map(hid => planets.find(p => p.id === hid))
    .filter((p): p is T => !!p);

  // Base filter: SMALL or MEDIUM, unowned, not moon/sun/blackhole
  const baseCandidates = planets.filter(p => {
    if (p.ownerId !== -1) return false;
    if (p.isMoon) return false;
    if (p.isBlackHole) return false;
    if (p.radius === SUN_RADIUS) return false;
    if (p.size !== PlanetSize.SMALL && p.size !== PlanetSize.MEDIUM) return false;
    // Not too close to any existing home
    for (const home of homePositions) {
      const dist = Math.sqrt((p.x - home.x) ** 2 + (p.y - home.y) ** 2);
      if (dist < MIN_DISTANCE_FROM_OTHERS) return false;
    }
    return true;
  });

  if (baseCandidates.length === 0) {
    // Fallback: any unowned non-moon
    const fallback = planets.filter(p => p.ownerId === -1 && !p.isMoon && !p.isBlackHole && p.radius !== SUN_RADIUS);
    if (fallback.length === 0) return null;
    return fallback[rng.int(0, fallback.length - 1)];
  }

  // First player: pick from outer ring (far from sun), prefer farthest
  if (homePositions.length === 0) {
    const outerCandidates = baseCandidates.filter(p => {
      const sunDist = Math.sqrt((p.x - SUN_X) ** 2 + (p.y - SUN_Y) ** 2);
      return sunDist >= MIN_SUN_DISTANCE;
    });

    if (outerCandidates.length > 0) {
      // Sort by distance from sun (farthest first) and pick from top candidates
      outerCandidates.sort((a, b) => {
        const distA = Math.sqrt((a.x - SUN_X) ** 2 + (a.y - SUN_Y) ** 2);
        const distB = Math.sqrt((b.x - SUN_X) ** 2 + (b.y - SUN_Y) ** 2);
        return distB - distA;
      });
      // Pick randomly from the top 20% farthest candidates
      const topCount = Math.max(1, Math.floor(outerCandidates.length * 0.2));
      return outerCandidates[rng.int(0, topCount - 1)];
    }

    // No outer ring planets, just pick farthest from sun
    baseCandidates.sort((a, b) => {
      const distA = Math.sqrt((a.x - SUN_X) ** 2 + (a.y - SUN_Y) ** 2);
      const distB = Math.sqrt((b.x - SUN_X) ** 2 + (b.y - SUN_Y) ** 2);
      return distB - distA;
    });
    return baseCandidates[0];
  }

  // Subsequent players: place as NEIGHBORS - near existing homes but hidden by fog
  // Score candidates by: close to an existing home (neighbor distance) + far from sun
  const scored = baseCandidates.map(p => {
    const sunDist = Math.sqrt((p.x - SUN_X) ** 2 + (p.y - SUN_Y) ** 2);

    // Find closest existing home
    let closestHomeDist = Infinity;
    for (const home of homePositions) {
      const dist = Math.sqrt((p.x - home.x) ** 2 + (p.y - home.y) ** 2);
      if (dist < closestHomeDist) closestHomeDist = dist;
    }

    // Neighbor score: best when closestHomeDist is in [NEIGHBOR_MIN_DIST, NEIGHBOR_MAX_DIST]
    let neighborScore = 0;
    if (closestHomeDist >= NEIGHBOR_MIN_DIST && closestHomeDist <= NEIGHBOR_MAX_DIST) {
      // Perfect range - higher score for being in the sweet spot
      neighborScore = 100;
    } else if (closestHomeDist < NEIGHBOR_MIN_DIST) {
      // Too close (would be visible immediately)
      neighborScore = (closestHomeDist / NEIGHBOR_MIN_DIST) * 50;
    } else {
      // Too far (would never find each other)
      neighborScore = Math.max(0, 80 - (closestHomeDist - NEIGHBOR_MAX_DIST) / 100);
    }

    // Sun distance score: prefer outer ring
    const sunScore = sunDist >= MIN_SUN_DISTANCE ? 50 : (sunDist / MIN_SUN_DISTANCE) * 30;

    return { planet: p, score: neighborScore + sunScore };
  });

  // Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score);

  // Pick randomly from top candidates
  const topCount = Math.max(1, Math.min(10, Math.floor(scored.length * 0.1)));
  return scored[rng.int(0, topCount - 1)].planet;
}
