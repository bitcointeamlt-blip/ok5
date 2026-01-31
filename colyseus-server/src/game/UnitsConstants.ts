// ========== UNITS GAME - SHARED CONSTANTS ==========
// Used by both server game logic and galaxy generator.
// Client has its own copy of rendering constants; this file only
// contains gameplay-relevant values that the server needs.

export const WORLD_SIZE = 40000;
export const STABILITY_MAX = 100;
export const SUPPLY_CHECK_INTERVAL = 2000;  // ms
export const SUPPLY_RANGE = 800;

// Planet generation
export const PLANET_COUNT = 800;
export const MIN_PLANET_DISTANCE = 100;
export const FORTRESS_COUNT = 30;

// Sun
export const SUN_X = WORLD_SIZE / 2;
export const SUN_Y = WORLD_SIZE / 2;
export const SUN_RADIUS = 800;
export const SUN_NO_SPAWN_RADIUS = 1200;

// Empire degradation
export const EMPIRE_SLOW_THRESHOLD = 8;
export const EMPIRE_DECAY_THRESHOLD = 20;
export const EMPIRE_GROWTH_PENALTY = 0.08;
export const EMPIRE_DEGRADE_UNIT_THRESHOLD = 2000;

// Attack
export const DISTANCE_NO_PENALTY = 2000;
export const DISTANCE_LOSS_INTERVAL = 80;   // lose 1 unit per this many px beyond DISTANCE_NO_PENALTY
export const ATTACK_BASE_SPEED = 90;

// Turrets
export const TURRET_FIRE_DISTANCE = 800;
export const TURRET_DAMAGE_DIVISOR = 10;
export const TURRET_MISSILE_SPEED = 280;

// Drones
export const DRONE_INTERCEPT_RANGE = 400;

// Shield
export const SHIELD_RADIUS = 100;

// Growth rates per difficulty
export const DIFFICULTY_SETTINGS: Record<string, { growthRate: number; aiInterval: number; startUnits: number }> = {
  easy:   { growthRate: 0.8, aiInterval: 3000, startUnits: 200 },
  medium: { growthRate: 0.6, aiInterval: 2000, startUnits: 200 },
  hard:   { growthRate: 0.4, aiInterval: 1200, startUnits: 200 },
};

// Ability cooldowns (ms)
export const ABILITY_COOLDOWNS: Record<string, number> = {
  blitz: 30000,
  shield: 45000,
  nuke: 60000,
};

// Planet sizes enum (matches client)
export enum PlanetSize {
  ASTEROID = 'asteroid',
  TINY     = 'tiny',
  SMALL    = 'small',
  MEDIUM   = 'medium',
  LARGE    = 'large',
  GIANT    = 'giant',
  MEGA     = 'mega',
  TITAN    = 'titan',
  COLOSSUS = 'colossus',
}

// Planet properties by size
export function getPlanetProperties(size: PlanetSize): { minR: number; maxR: number; maxUnits: number; defense: number; growth: number } {
  switch (size) {
    case PlanetSize.ASTEROID:  return { minR: 12,  maxR: 18,  maxUnits: 100,  defense: 0.8, growth: 0.5 };
    case PlanetSize.TINY:      return { minR: 16,  maxR: 20,  maxUnits: 120,  defense: 0.9, growth: 0.6 };
    case PlanetSize.SMALL:     return { minR: 22,  maxR: 30,  maxUnits: 200,  defense: 1.0, growth: 1.0 };
    case PlanetSize.MEDIUM:    return { minR: 35,  maxR: 50,  maxUnits: 400,  defense: 1.5, growth: 1.5 };
    case PlanetSize.LARGE:     return { minR: 55,  maxR: 75,  maxUnits: 700,  defense: 2.0, growth: 2.0 };
    case PlanetSize.GIANT:     return { minR: 80,  maxR: 100, maxUnits: 1200, defense: 3.0, growth: 2.5 };
    case PlanetSize.MEGA:      return { minR: 110, maxR: 140, maxUnits: 2000, defense: 4.0, growth: 3.0 };
    case PlanetSize.TITAN:     return { minR: 150, maxR: 190, maxUnits: 3500, defense: 5.0, growth: 4.0 };
    case PlanetSize.COLOSSUS:  return { minR: 200, maxR: 250, maxUnits: 5000, defense: 6.0, growth: 5.0 };
  }
}

// Size distribution for generation
export const SIZE_DISTRIBUTION: { size: PlanetSize; count: number }[] = [
  { size: PlanetSize.ASTEROID, count: 250 },
  { size: PlanetSize.TINY,     count: 150 },
  { size: PlanetSize.SMALL,    count: 200 },
  { size: PlanetSize.MEDIUM,   count: 150 },
  { size: PlanetSize.LARGE,    count: 70  },
  { size: PlanetSize.GIANT,    count: 30  },
  { size: PlanetSize.MEGA,     count: 30  },
  { size: PlanetSize.TITAN,    count: 15  },
  { size: PlanetSize.COLOSSUS, count: 5   },
];

// Deposit types
export type DepositType = 'carbon' | 'water' | 'gas' | 'metal' | 'crystal';
export const ALL_DEPOSIT_TYPES: DepositType[] = ['carbon', 'water', 'gas', 'metal', 'crystal'];

// Building types
export type BuildingType = 'turret' | 'mine' | 'factory' | 'shield_gen' | 'drone';

// Player colors
export const PLAYER_COLORS = [
  { color: '#4488ff', dark: '#2255aa' },  // 1  Blue
  { color: '#ff4444', dark: '#aa2222' },  // 2  Red
  { color: '#44cc44', dark: '#228822' },  // 3  Green
  { color: '#ffaa00', dark: '#aa7700' },  // 4  Gold
  { color: '#cc44cc', dark: '#882288' },  // 5  Purple
  { color: '#44cccc', dark: '#228888' },  // 6  Cyan
  { color: '#ff8844', dark: '#aa5522' },  // 7  Orange
  { color: '#88ff44', dark: '#55aa22' },  // 8  Lime
  { color: '#ff44aa', dark: '#aa2277' },  // 9  Pink
  { color: '#aaaaff', dark: '#6666aa' },  // 10 Lavender
  { color: '#ffff44', dark: '#aaaa22' },  // 11 Yellow
  { color: '#44ff88', dark: '#22aa55' },  // 12 Mint
  { color: '#ff6688', dark: '#aa3355' },  // 13 Rose
  { color: '#88ccff', dark: '#5588aa' },  // 14 Sky
  { color: '#cc8844', dark: '#885522' },  // 15 Brown
  { color: '#aa44ff', dark: '#7722aa' },  // 16 Violet
  { color: '#44ffcc', dark: '#22aa88' },  // 17 Aqua
  { color: '#ff4488', dark: '#aa2255' },  // 18 Magenta
  { color: '#ccff44', dark: '#88aa22' },  // 19 Chartreuse
  { color: '#4466ff', dark: '#2233aa' },  // 20 Royal Blue
  { color: '#ff8888', dark: '#aa5555' },  // 21 Salmon
  { color: '#88ff88', dark: '#55aa55' },  // 22 Light Green
  { color: '#ffcc44', dark: '#aa8822' },  // 23 Amber
  { color: '#cc88ff', dark: '#8855aa' },  // 24 Orchid
  { color: '#44ffff', dark: '#22aaaa' },  // 25 Turquoise
  { color: '#ff4466', dark: '#aa2233' },  // 26 Crimson
  { color: '#66ff44', dark: '#33aa22' },  // 27 Neon Green
  { color: '#ff88cc', dark: '#aa5588' },  // 28 Bubblegum
  { color: '#8888ff', dark: '#5555aa' },  // 29 Periwinkle
  { color: '#ffaa44', dark: '#aa7722' },  // 30 Tangerine
  { color: '#44ccaa', dark: '#228877' },  // 31 Teal
  { color: '#dd6644', dark: '#993322' },  // 32 Rust
  { color: '#66aaff', dark: '#3377aa' },  // 33 Cornflower
  { color: '#aaff44', dark: '#77aa22' },  // 34 Yellow Green
  { color: '#ff66cc', dark: '#aa3388' },  // 35 Hot Pink
  { color: '#44aa88', dark: '#227755' },  // 36 Jade
  { color: '#ddaa66', dark: '#997733' },  // 37 Sand
  { color: '#aa66ff', dark: '#7733aa' },  // 38 Amethyst
  { color: '#66ffaa', dark: '#33aa77' },  // 39 Sea Green
  { color: '#ff6644', dark: '#aa3322' },  // 40 Vermilion
  { color: '#aaccff', dark: '#7788aa' },  // 41 Ice Blue
  { color: '#ccaa44', dark: '#887722' },  // 42 Olive
  { color: '#ff44cc', dark: '#aa2288' },  // 43 Fuchsia
  { color: '#88ffcc', dark: '#55aa88' },  // 44 Seafoam
  { color: '#cc6644', dark: '#883322' },  // 45 Terra Cotta
  { color: '#6688cc', dark: '#335588' },  // 46 Steel Blue
  { color: '#ccff88', dark: '#88aa55' },  // 47 Honeydew
  { color: '#cc44aa', dark: '#882277' },  // 48 Plum
  { color: '#88ddaa', dark: '#559977' },  // 49 Sage
  { color: '#ffcc88', dark: '#aa8855' },  // 50 Peach
];

export const MAX_PLAYERS = 50;

// Planet palette (for static visual data)
export const PLANET_PALETTE = ['#6b5b4a', '#7a8a9a', '#c8a050', '#a0c8e0', '#a050c8', '#a03020', '#408040', '#8a7a6a', '#9aacbc', '#b89040'];

// Mining rates by planet size
export function getMiningParams(size: PlanetSize): { amount: number; minTime: number; maxTime: number } {
  switch (size) {
    case PlanetSize.ASTEROID:  return { amount: 1,  minTime: 60000, maxTime: 60000 };
    case PlanetSize.TINY:      return { amount: 1,  minTime: 60000, maxTime: 60000 };
    case PlanetSize.SMALL:     return { amount: 1,  minTime: 20000, maxTime: 30000 };
    case PlanetSize.MEDIUM:    return { amount: 2,  minTime: 15000, maxTime: 25000 };
    case PlanetSize.LARGE:     return { amount: 3,  minTime: 10000, maxTime: 20000 };
    case PlanetSize.GIANT:     return { amount: 5,  minTime: 10000, maxTime: 15000 };
    case PlanetSize.MEGA:      return { amount: 8,  minTime: 5000,  maxTime: 10000 };
    case PlanetSize.TITAN:     return { amount: 12, minTime: 4000,  maxTime: 8000  };
    case PlanetSize.COLOSSUS:  return { amount: 16, minTime: 3000,  maxTime: 6000  };
  }
}

// Helper
export function getDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
