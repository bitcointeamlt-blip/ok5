// ========== UNITS - Real-Time Strategy Grid Game ==========

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// Fixed internal resolution
const INTERNAL_HEIGHT = 1080;
let gameWidth = Math.round(INTERNAL_HEIGHT * (window.innerWidth / window.innerHeight));
let gameHeight = INTERNAL_HEIGHT;

function updateCanvasSize(): void {
  const aspect = window.innerWidth / window.innerHeight;
  gameWidth = Math.round(INTERNAL_HEIGHT * aspect);
  gameHeight = INTERNAL_HEIGHT;
  canvas.width = gameWidth;
  canvas.height = gameHeight;
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
}

updateCanvasSize();
window.addEventListener('resize', updateCanvasSize);

// ========== CONSTANTS ==========
const MAP_SIZE = 128; // 128x128 grid
const TILE_SIZE = 32; // pixels per tile at zoom 1.0
const MAX_UNITS_PER_TILE = 999;
const BASE_GROWTH_RATE = 2; // units per second for a normal tile
const STABILITY_MAX = 100;
const SUPPLY_CHECK_INTERVAL = 2000; // ms between supply recalculations
const ATTACK_SPEED = 200; // pixels per second for attack animations

// Empire degradation thresholds
const EMPIRE_SLOW_THRESHOLD = 15; // tiles before growth slows
const EMPIRE_DECAY_THRESHOLD = 40; // tiles before units start decaying
const EMPIRE_GROWTH_PENALTY = 0.06; // growth multiplier reduction per tile over threshold

// Stability constants
const STABILITY_DECAY_RATE = 2; // per second when conditions bad
const STABILITY_RECOVER_RATE = 5; // per second when conditions good
const STABILITY_DISTANCE_FACTOR = 3; // stability loss per tile distance from core

// Attack constants
const DISTANCE_PENALTY_PER_TILE = 0.08; // 8% loss per tile distance
const MIN_ATTACK_EFFICIENCY = 0.2; // minimum 20% of units arrive

// ========== ENUMS ==========
enum TileType {
  NEUTRAL = 'neutral',
  NORMAL = 'normal',
  CAPITAL = 'capital',
  BUFF = 'buff',
  WALL = 'wall',
  INTERCEPTOR = 'interceptor',
  RADAR = 'radar'
}

// ========== INTERFACES ==========
interface Tile {
  x: number;
  y: number;
  ownerId: number; // -1 = neutral, 0+ = player index
  units: number;
  tileType: TileType;
  stability: number;
  connected: boolean; // supply chain connected to capital
  lastAction: number; // timestamp
}

interface Player {
  id: number;
  name: string;
  color: string;
  colorDark: string;
  tileCount: number;
  totalUnits: number;
  capitalX: number;
  capitalY: number;
  alive: boolean;
  isAI: boolean;
}

interface AttackAnimation {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  units: number;
  playerId: number;
  progress: number; // 0-1
  speed: number;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
  targetZoom: number;
  dragging: boolean;
  dragStartX: number;
  dragStartY: number;
  dragCamStartX: number;
  dragCamStartY: number;
}

// ========== GAME STATE ==========
let tiles: Tile[][] = [];
let players: Player[] = [];
let attacks: AttackAnimation[] = [];
let selectedTile: { x: number; y: number } | null = null;
let hoveredTile: { x: number; y: number } | null = null;
let gameTime = 0;
let lastTime = 0;
let lastSupplyCheck = 0;
let lastAITick = 0;
const AI_TICK_INTERVAL = 1500; // ms between AI decisions

// Camera
const camera: Camera = {
  x: 0,
  y: 0,
  zoom: 1.0,
  targetZoom: 1.0,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragCamStartX: 0,
  dragCamStartY: 0
};

// UI State
let showTileInfo = false;
let attackMode = false;
let tileTypeMenu = false;
let mouseX = 0;
let mouseY = 0;

// Player colors
const PLAYER_COLORS = [
  { color: '#4488ff', dark: '#2255aa' }, // Blue (player)
  { color: '#ff4444', dark: '#aa2222' }, // Red
  { color: '#44cc44', dark: '#228822' }, // Green
  { color: '#ffaa00', dark: '#aa7700' }, // Orange
  { color: '#cc44cc', dark: '#882288' }, // Purple
  { color: '#44cccc', dark: '#228888' }, // Cyan
];

const NEUTRAL_COLOR = '#333344';
const NEUTRAL_COLOR_DARK = '#222233';

// ========== TILE TYPE PROPERTIES ==========
function getTileDefense(type: TileType): number {
  switch (type) {
    case TileType.WALL: return 3.0;
    case TileType.CAPITAL: return 1.5;
    case TileType.NORMAL: return 1.0;
    case TileType.BUFF: return 0.5;
    case TileType.INTERCEPTOR: return 0.7;
    case TileType.RADAR: return 0.6;
    default: return 0.8;
  }
}

function getTileGrowthMultiplier(type: TileType): number {
  switch (type) {
    case TileType.CAPITAL: return 2.0;
    case TileType.NORMAL: return 1.0;
    case TileType.BUFF: return 0.5;
    case TileType.WALL: return 0.1;
    case TileType.INTERCEPTOR: return 0.3;
    case TileType.RADAR: return 0.3;
    default: return 0.5;
  }
}

function getTileMaxUnits(type: TileType): number {
  switch (type) {
    case TileType.CAPITAL: return 500;
    case TileType.NORMAL: return 200;
    case TileType.BUFF: return 80;
    case TileType.WALL: return 400;
    case TileType.INTERCEPTOR: return 150;
    case TileType.RADAR: return 60;
    default: return 100;
  }
}

function getTileStabilityRadius(type: TileType): number {
  switch (type) {
    case TileType.CAPITAL: return 8;
    case TileType.BUFF: return 3;
    default: return 0;
  }
}

// ========== INITIALIZATION ==========
function initMap(): void {
  tiles = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < MAP_SIZE; x++) {
      tiles[y][x] = {
        x, y,
        ownerId: -1,
        units: Math.floor(Math.random() * 30) + 10, // neutral tiles have 10-40 units
        tileType: TileType.NEUTRAL,
        stability: 50,
        connected: false,
        lastAction: 0
      };
    }
  }
}

function initPlayers(): void {
  players = [];

  // Player (human)
  const startPositions = [
    { x: 32, y: 32 },
    { x: 96, y: 96 },
    { x: 32, y: 96 },
    { x: 96, y: 32 },
  ];

  // Create human player
  players.push({
    id: 0,
    name: 'You',
    color: PLAYER_COLORS[0].color,
    colorDark: PLAYER_COLORS[0].dark,
    tileCount: 0,
    totalUnits: 0,
    capitalX: startPositions[0].x,
    capitalY: startPositions[0].y,
    alive: true,
    isAI: false
  });

  // Create 3 AI players
  for (let i = 1; i <= 3; i++) {
    players.push({
      id: i,
      name: `AI ${i}`,
      color: PLAYER_COLORS[i].color,
      colorDark: PLAYER_COLORS[i].dark,
      tileCount: 0,
      totalUnits: 0,
      capitalX: startPositions[i].x,
      capitalY: startPositions[i].y,
      alive: true,
      isAI: true
    });
  }

  // Place starting tiles
  for (const player of players) {
    const tile = tiles[player.capitalY][player.capitalX];
    tile.ownerId = player.id;
    tile.units = 100;
    tile.tileType = TileType.CAPITAL;
    tile.stability = STABILITY_MAX;
    tile.connected = true;
    tile.lastAction = 0;
    player.tileCount = 1;
    player.totalUnits = 100;
  }

  // Center camera on player
  camera.x = players[0].capitalX * TILE_SIZE - gameWidth / 2;
  camera.y = players[0].capitalY * TILE_SIZE - gameHeight / 2;
}

function initGame(): void {
  initMap();
  initPlayers();
  console.log('⚔️ UNITS initialized - map:', MAP_SIZE, 'x', MAP_SIZE);
}

// ========== SUPPLY / CONNECTIVITY ==========
function recalculateSupply(): void {
  // Reset all connectivity
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      tiles[y][x].connected = false;
    }
  }

  // BFS from each player's capital
  for (const player of players) {
    if (!player.alive) continue;

    const capital = tiles[player.capitalY]?.[player.capitalX];
    if (!capital || capital.ownerId !== player.id) {
      // Capital lost!
      player.alive = false;
      continue;
    }

    // BFS flood fill from capital
    const queue: { x: number; y: number }[] = [{ x: player.capitalX, y: player.capitalY }];
    const visited = new Set<string>();
    visited.add(`${player.capitalX},${player.capitalY}`);

    while (queue.length > 0) {
      const pos = queue.shift()!;
      const tile = tiles[pos.y][pos.x];
      tile.connected = true;

      // Check 4 neighbors
      const neighbors = [
        { x: pos.x - 1, y: pos.y },
        { x: pos.x + 1, y: pos.y },
        { x: pos.x, y: pos.y - 1 },
        { x: pos.x, y: pos.y + 1 },
      ];

      for (const n of neighbors) {
        if (n.x < 0 || n.x >= MAP_SIZE || n.y < 0 || n.y >= MAP_SIZE) continue;
        const key = `${n.x},${n.y}`;
        if (visited.has(key)) continue;

        const nTile = tiles[n.y][n.x];
        if (nTile.ownerId === player.id) {
          visited.add(key);
          queue.push(n);
        }
      }
    }
  }
}

// ========== STABILITY ==========
function getDistanceToNearestCapital(x: number, y: number, playerId: number): number {
  const player = players[playerId];
  if (!player) return 999;
  return Math.abs(x - player.capitalX) + Math.abs(y - player.capitalY);
}

function getBuffBonus(x: number, y: number, playerId: number): number {
  let bonus = 0;
  // Check nearby tiles for buff type
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) continue;
      const t = tiles[ny][nx];
      if (t.ownerId === playerId && t.tileType === TileType.BUFF) {
        const dist = Math.abs(dx) + Math.abs(dy);
        bonus += Math.max(0, (4 - dist) * 0.1); // closer = more bonus
      }
    }
  }
  return Math.min(bonus, 0.5); // cap at 50% bonus
}

function updateStability(dt: number): void {
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = tiles[y][x];
      if (tile.ownerId === -1) continue;

      const player = players[tile.ownerId];
      if (!player || !player.alive) continue;

      // Calculate target stability
      let targetStability = STABILITY_MAX;

      // Distance from capital reduces stability
      const dist = getDistanceToNearestCapital(x, y, tile.ownerId);
      targetStability -= dist * STABILITY_DISTANCE_FACTOR;

      // Capital tile stabilizes
      const capitalRadius = getTileStabilityRadius(TileType.CAPITAL);
      if (dist <= capitalRadius) {
        targetStability = Math.max(targetStability, 80);
      }

      // Not connected = bad
      if (!tile.connected) {
        targetStability = Math.min(targetStability, 20);
      }

      // Empire size penalty
      if (player.tileCount > EMPIRE_SLOW_THRESHOLD) {
        const excess = player.tileCount - EMPIRE_SLOW_THRESHOLD;
        targetStability -= excess * 1.5;
      }

      // Buff bonus
      const buff = getBuffBonus(x, y, tile.ownerId);
      targetStability += buff * 30;

      // Clamp
      targetStability = Math.max(0, Math.min(STABILITY_MAX, targetStability));

      // Move stability toward target
      if (tile.stability < targetStability) {
        tile.stability = Math.min(targetStability, tile.stability + STABILITY_RECOVER_RATE * dt);
      } else if (tile.stability > targetStability) {
        tile.stability = Math.max(targetStability, tile.stability - STABILITY_DECAY_RATE * dt);
      }

      // If stability hits 0, tile goes neutral
      if (tile.stability <= 0) {
        tile.ownerId = -1;
        tile.tileType = TileType.NEUTRAL;
        tile.units = Math.floor(tile.units * 0.3);
      }
    }
  }
}

// ========== UNITS GROWTH ==========
function updateUnitsGrowth(dt: number): void {
  for (const player of players) {
    player.tileCount = 0;
    player.totalUnits = 0;
  }

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = tiles[y][x];
      if (tile.ownerId === -1) continue;

      const player = players[tile.ownerId];
      if (!player || !player.alive) continue;

      player.tileCount++;
      player.totalUnits += tile.units;

      // Growth calculation
      let growth = BASE_GROWTH_RATE * getTileGrowthMultiplier(tile.tileType);

      // Stability affects growth
      if (tile.stability < 30) {
        growth = -1; // Decay
      } else if (tile.stability < 70) {
        growth *= 0.3; // Slow
      }

      // Empire size penalty
      if (player.tileCount > EMPIRE_SLOW_THRESHOLD) {
        const excess = player.tileCount - EMPIRE_SLOW_THRESHOLD;
        growth *= Math.max(0.1, 1.0 - excess * EMPIRE_GROWTH_PENALTY);
      }

      // Decay if empire too large
      if (player.tileCount > EMPIRE_DECAY_THRESHOLD) {
        growth -= 0.5;
      }

      // Not connected = no growth
      if (!tile.connected) {
        growth = Math.min(growth, -0.5);
      }

      // Buff bonus
      growth += growth * getBuffBonus(x, y, tile.ownerId);

      // Apply growth
      const maxUnits = getTileMaxUnits(tile.tileType);
      tile.units = Math.max(0, Math.min(maxUnits, tile.units + growth * dt));

      // If units hit 0, tile goes neutral
      if (tile.units <= 0) {
        tile.ownerId = -1;
        tile.tileType = TileType.NEUTRAL;
        tile.units = 0;
      }
    }
  }
}

// ========== ATTACK SYSTEM ==========
function calculateAttackEfficiency(distance: number): number {
  const penalty = distance * DISTANCE_PENALTY_PER_TILE;
  return Math.max(MIN_ATTACK_EFFICIENCY, 1.0 - penalty);
}

function launchAttack(fromX: number, fromY: number, toX: number, toY: number): void {
  const fromTile = tiles[fromY][fromX];
  if (fromTile.ownerId === -1) return;
  if (fromTile.units < 2) return;

  // Send half the units (keep at least 1)
  const unitsToSend = Math.floor(fromTile.units * 0.5);
  fromTile.units -= unitsToSend;

  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.abs(dx) + Math.abs(dy);

  attacks.push({
    fromX, fromY,
    toX, toY,
    units: unitsToSend,
    playerId: fromTile.ownerId,
    progress: 0,
    speed: 1.0 / (distance * 0.15 + 0.3) // slower over distance
  });
}

function resolveAttack(attack: AttackAnimation): void {
  const toTile = tiles[attack.toY][attack.toX];
  const distance = Math.abs(attack.toX - attack.fromX) + Math.abs(attack.toY - attack.fromY);
  const efficiency = calculateAttackEfficiency(distance);
  const arrivingUnits = Math.floor(attack.units * efficiency);

  if (toTile.ownerId === attack.playerId) {
    // Reinforcement
    const max = getTileMaxUnits(toTile.tileType);
    toTile.units = Math.min(max, toTile.units + arrivingUnits);
  } else {
    // Attack
    const defense = getTileDefense(toTile.tileType);
    const defenseStrength = toTile.units * defense;

    if (arrivingUnits > defenseStrength) {
      // Attacker wins
      const remaining = arrivingUnits - defenseStrength;
      toTile.ownerId = attack.playerId;
      toTile.units = Math.max(1, Math.floor(remaining));
      toTile.tileType = TileType.NORMAL;
      toTile.stability = 50;
      toTile.connected = false;
      toTile.lastAction = gameTime;
    } else {
      // Defender wins
      toTile.units = Math.max(0, Math.floor((defenseStrength - arrivingUnits) / defense));
      if (toTile.units <= 0) {
        toTile.ownerId = -1;
        toTile.tileType = TileType.NEUTRAL;
      }
    }
  }
}

function updateAttacks(dt: number): void {
  for (let i = attacks.length - 1; i >= 0; i--) {
    const attack = attacks[i];
    attack.progress += attack.speed * dt;

    if (attack.progress >= 1.0) {
      resolveAttack(attack);
      attacks.splice(i, 1);
    }
  }
}

// ========== INTERCEPTOR LOGIC ==========
function checkInterceptors(attack: AttackAnimation): number {
  const dx = attack.toX - attack.fromX;
  const dy = attack.toY - attack.fromY;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  let intercepted = 0;

  for (let s = 1; s < steps; s++) {
    const px = Math.round(attack.fromX + (dx / steps) * s);
    const py = Math.round(attack.fromY + (dy / steps) * s);

    // Check 1-tile radius for interceptors
    for (let iy = -1; iy <= 1; iy++) {
      for (let ix = -1; ix <= 1; ix++) {
        const nx = px + ix;
        const ny = py + iy;
        if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) continue;
        const t = tiles[ny][nx];
        if (t.tileType === TileType.INTERCEPTOR && t.ownerId !== attack.playerId && t.units > 5) {
          // Intercept: remove some units from attack
          const interceptPower = Math.min(t.units * 0.3, attack.units * 0.2);
          intercepted += interceptPower;
          t.units -= Math.floor(interceptPower * 0.5);
        }
      }
    }
  }
  return intercepted;
}

// ========== AI SYSTEM ==========
function aiTick(player: Player): void {
  if (!player.alive || !player.isAI) return;

  // Find all player tiles
  const myTiles: Tile[] = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (tiles[y][x].ownerId === player.id) {
        myTiles.push(tiles[y][x]);
      }
    }
  }

  if (myTiles.length === 0) {
    player.alive = false;
    return;
  }

  // AI strategy: expand to adjacent neutral tiles, attack weak enemies
  const candidates: { from: Tile; to: Tile; priority: number }[] = [];

  for (const tile of myTiles) {
    if (tile.units < 30) continue; // not enough units to attack

    // Check 4 neighbors
    const neighbors = [
      { x: tile.x - 1, y: tile.y },
      { x: tile.x + 1, y: tile.y },
      { x: tile.x, y: tile.y - 1 },
      { x: tile.x, y: tile.y + 1 },
    ];

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= MAP_SIZE || n.y < 0 || n.y >= MAP_SIZE) continue;
      const target = tiles[n.y][n.x];
      if (target.ownerId === player.id) continue;

      let priority = 0;

      if (target.ownerId === -1) {
        // Neutral - easy target
        priority = 10 - target.units * 0.1;
      } else {
        // Enemy - attack if we're stronger
        const defense = target.units * getTileDefense(target.tileType);
        if (tile.units * 0.5 > defense) {
          priority = 5;
          if (target.tileType === TileType.CAPITAL) priority = 20; // prioritize capitals
          if (target.tileType === TileType.BUFF) priority = 15;
        }
      }

      if (priority > 0) {
        candidates.push({ from: tile, to: target, priority });
      }
    }
  }

  // Sort by priority and execute top action
  candidates.sort((a, b) => b.priority - a.priority);

  const maxActions = Math.min(2, candidates.length); // AI does max 2 actions per tick
  for (let i = 0; i < maxActions; i++) {
    const action = candidates[i];
    if (action.from.units > 30) {
      launchAttack(action.from.x, action.from.y, action.to.x, action.to.y);
    }
  }
}

// ========== INPUT ==========
function getCanvasMousePos(e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  return {
    x: (sx + camera.x) / (TILE_SIZE * camera.zoom),
    y: (sy + camera.y) / (TILE_SIZE * camera.zoom)
  };
}

function worldToScreen(wx: number, wy: number): { x: number; y: number } {
  return {
    x: wx * TILE_SIZE * camera.zoom - camera.x,
    y: wy * TILE_SIZE * camera.zoom - camera.y
  };
}

canvas.addEventListener('mousedown', (e) => {
  const pos = getCanvasMousePos(e);

  if (e.button === 2 || e.button === 1) {
    // Right/middle click = pan
    camera.dragging = true;
    camera.dragStartX = pos.x;
    camera.dragStartY = pos.y;
    camera.dragCamStartX = camera.x;
    camera.dragCamStartY = camera.y;
    e.preventDefault();
    return;
  }

  // Left click
  const world = screenToWorld(pos.x, pos.y);
  const tileX = Math.floor(world.x);
  const tileY = Math.floor(world.y);

  if (tileX < 0 || tileX >= MAP_SIZE || tileY < 0 || tileY >= MAP_SIZE) return;

  if (attackMode && selectedTile) {
    // Launch attack
    launchAttack(selectedTile.x, selectedTile.y, tileX, tileY);
    attackMode = false;
    selectedTile = null;
  } else if (tileTypeMenu && selectedTile) {
    // Tile type menu handled in UI
  } else {
    // Select tile
    selectedTile = { x: tileX, y: tileY };
    attackMode = false;
    tileTypeMenu = false;
  }
});

canvas.addEventListener('mousemove', (e) => {
  const pos = getCanvasMousePos(e);
  mouseX = pos.x;
  mouseY = pos.y;

  if (camera.dragging) {
    camera.x = camera.dragCamStartX - (pos.x - camera.dragStartX);
    camera.y = camera.dragCamStartY - (pos.y - camera.dragStartY);
    return;
  }

  const world = screenToWorld(pos.x, pos.y);
  const tileX = Math.floor(world.x);
  const tileY = Math.floor(world.y);

  if (tileX >= 0 && tileX < MAP_SIZE && tileY >= 0 && tileY < MAP_SIZE) {
    hoveredTile = { x: tileX, y: tileY };
  } else {
    hoveredTile = null;
  }
});

canvas.addEventListener('mouseup', () => {
  camera.dragging = false;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  camera.targetZoom = Math.max(0.3, Math.min(4.0, camera.targetZoom * zoomFactor));
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === 'a' || e.key === 'A') {
    if (selectedTile) {
      const tile = tiles[selectedTile.y][selectedTile.x];
      if (tile.ownerId === 0) { // player's tile
        attackMode = !attackMode;
        tileTypeMenu = false;
      }
    }
  }
  if (e.key === 't' || e.key === 'T') {
    if (selectedTile) {
      const tile = tiles[selectedTile.y][selectedTile.x];
      if (tile.ownerId === 0) {
        tileTypeMenu = !tileTypeMenu;
        attackMode = false;
      }
    }
  }
  if (e.key === 'Escape') {
    selectedTile = null;
    attackMode = false;
    tileTypeMenu = false;
  }
  // Tile type shortcuts (when menu is open)
  if (tileTypeMenu && selectedTile) {
    const tile = tiles[selectedTile.y][selectedTile.x];
    if (tile.ownerId === 0) {
      if (e.key === '1') { tile.tileType = TileType.NORMAL; tileTypeMenu = false; }
      if (e.key === '2') { tile.tileType = TileType.BUFF; tileTypeMenu = false; }
      if (e.key === '3') { tile.tileType = TileType.WALL; tileTypeMenu = false; }
      if (e.key === '4') { tile.tileType = TileType.INTERCEPTOR; tileTypeMenu = false; }
      if (e.key === '5') { tile.tileType = TileType.RADAR; tileTypeMenu = false; }
    }
  }
});

// ========== RENDERING ==========
function getTileColor(tile: Tile): string {
  if (tile.ownerId === -1) return NEUTRAL_COLOR;
  const player = players[tile.ownerId];
  if (!player) return NEUTRAL_COLOR;

  // Darken based on stability
  if (tile.stability < 30) return player.colorDark;
  return player.color;
}

function getTileBorderColor(tile: Tile): string {
  if (tile.ownerId === -1) return NEUTRAL_COLOR_DARK;
  const player = players[tile.ownerId];
  if (!player) return NEUTRAL_COLOR_DARK;
  return player.colorDark;
}

function getTileTypeSymbol(type: TileType): string {
  switch (type) {
    case TileType.CAPITAL: return '★';
    case TileType.BUFF: return '+';
    case TileType.WALL: return '▓';
    case TileType.INTERCEPTOR: return '×';
    case TileType.RADAR: return '◎';
    default: return '';
  }
}

function render(): void {
  // Clear
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, gameWidth, gameHeight);

  // Smooth zoom
  camera.zoom += (camera.targetZoom - camera.zoom) * 0.1;

  const tileScreenSize = TILE_SIZE * camera.zoom;

  // Calculate visible range
  const startX = Math.max(0, Math.floor(camera.x / tileScreenSize));
  const startY = Math.max(0, Math.floor(camera.y / tileScreenSize));
  const endX = Math.min(MAP_SIZE, Math.ceil((camera.x + gameWidth) / tileScreenSize));
  const endY = Math.min(MAP_SIZE, Math.ceil((camera.y + gameHeight) / tileScreenSize));

  // Draw tiles
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tile = tiles[y][x];
      const screenX = x * tileScreenSize - camera.x;
      const screenY = y * tileScreenSize - camera.y;

      // Tile background
      ctx.fillStyle = getTileColor(tile);
      ctx.fillRect(
        Math.floor(screenX + 1),
        Math.floor(screenY + 1),
        Math.ceil(tileScreenSize - 2),
        Math.ceil(tileScreenSize - 2)
      );

      // Stability indicator (dark overlay for low stability)
      if (tile.ownerId !== -1 && tile.stability < 70) {
        const alpha = (70 - tile.stability) / 70 * 0.4;
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.fillRect(
          Math.floor(screenX + 1),
          Math.floor(screenY + 1),
          Math.ceil(tileScreenSize - 2),
          Math.ceil(tileScreenSize - 2)
        );
      }

      // Not connected indicator
      if (tile.ownerId !== -1 && !tile.connected) {
        ctx.strokeStyle = '#ff000066';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(
          Math.floor(screenX + 2),
          Math.floor(screenY + 2),
          Math.ceil(tileScreenSize - 4),
          Math.ceil(tileScreenSize - 4)
        );
        ctx.setLineDash([]);
      }

      // Units number (only if zoomed in enough)
      if (tileScreenSize > 20 && tile.units > 0) {
        const fontSize = Math.max(8, Math.min(14, tileScreenSize * 0.35));
        ctx.font = `${fontSize}px "Press Start 2P"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(
          Math.floor(tile.units).toString(),
          Math.floor(screenX + tileScreenSize / 2),
          Math.floor(screenY + tileScreenSize / 2 + (tile.tileType !== TileType.NEUTRAL && tile.tileType !== TileType.NORMAL ? -fontSize * 0.4 : 0))
        );
      }

      // Tile type symbol
      if (tileScreenSize > 24 && tile.tileType !== TileType.NEUTRAL && tile.tileType !== TileType.NORMAL) {
        const symbolSize = Math.max(6, Math.min(10, tileScreenSize * 0.25));
        ctx.font = `${symbolSize}px "Press Start 2P"`;
        ctx.fillStyle = '#ffffff88';
        ctx.fillText(
          getTileTypeSymbol(tile.tileType),
          Math.floor(screenX + tileScreenSize / 2),
          Math.floor(screenY + tileScreenSize * 0.75)
        );
      }
    }
  }

  // Draw attack animations
  for (const attack of attacks) {
    const from = worldToScreen(attack.fromX + 0.5, attack.fromY + 0.5);
    const to = worldToScreen(attack.toX + 0.5, attack.toY + 0.5);
    const cx = from.x + (to.x - from.x) * attack.progress;
    const cy = from.y + (to.y - from.y) * attack.progress;

    const player = players[attack.playerId];
    if (!player) continue;

    // Trail
    ctx.strokeStyle = player.color + '44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(cx, cy);
    ctx.stroke();

    // Unit dot
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(3, tileScreenSize * 0.15), 0, Math.PI * 2);
    ctx.fill();

    // Unit count
    if (tileScreenSize > 15) {
      ctx.font = '8px "Press Start 2P"';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(Math.floor(attack.units).toString(), cx, cy - 8);
    }
  }

  // Selection highlight
  if (selectedTile) {
    const screenPos = worldToScreen(selectedTile.x, selectedTile.y);
    ctx.strokeStyle = attackMode ? '#ff4444' : '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(
      Math.floor(screenPos.x),
      Math.floor(screenPos.y),
      Math.ceil(tileScreenSize),
      Math.ceil(tileScreenSize)
    );
  }

  // Hover highlight
  if (hoveredTile && (!selectedTile || hoveredTile.x !== selectedTile.x || hoveredTile.y !== selectedTile.y)) {
    const screenPos = worldToScreen(hoveredTile.x, hoveredTile.y);
    ctx.strokeStyle = '#ffffff44';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.floor(screenPos.x),
      Math.floor(screenPos.y),
      Math.ceil(tileScreenSize),
      Math.ceil(tileScreenSize)
    );
  }

  // Attack mode line
  if (attackMode && selectedTile && hoveredTile) {
    const from = worldToScreen(selectedTile.x + 0.5, selectedTile.y + 0.5);
    const to = worldToScreen(hoveredTile.x + 0.5, hoveredTile.y + 0.5);
    const distance = Math.abs(hoveredTile.x - selectedTile.x) + Math.abs(hoveredTile.y - selectedTile.y);
    const efficiency = calculateAttackEfficiency(distance);

    ctx.strokeStyle = `rgba(255, ${Math.floor(efficiency * 255)}, 0, 0.6)`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Show efficiency
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    ctx.font = '10px "Press Start 2P"';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(efficiency * 100)}%`, midX, midY - 10);
  }

  // ========== UI ==========
  renderUI();
}

function renderUI(): void {
  // Top-left: Player stats
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(10, 10, 250, 90);

  ctx.font = '12px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.fillStyle = players[0].color;
  ctx.fillText('UNITS', 20, 35);

  ctx.font = '9px "Press Start 2P"';
  ctx.fillStyle = '#aaa';
  ctx.fillText(`Tiles: ${players[0].tileCount}`, 20, 55);
  ctx.fillText(`Units: ${Math.floor(players[0].totalUnits)}`, 20, 72);
  ctx.fillText(`Zoom: ${camera.zoom.toFixed(1)}x`, 20, 89);

  // Top-right: Controls help
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(gameWidth - 280, 10, 270, 110);

  ctx.font = '8px "Press Start 2P"';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#888';
  ctx.fillText('Right-click: Pan', gameWidth - 20, 30);
  ctx.fillText('Scroll: Zoom', gameWidth - 20, 46);
  ctx.fillText('Click: Select tile', gameWidth - 20, 62);
  ctx.fillText('[A] Attack mode', gameWidth - 20, 78);
  ctx.fillText('[T] Tile type menu', gameWidth - 20, 94);
  ctx.fillText('[ESC] Deselect', gameWidth - 20, 110);

  // Selected tile info
  if (selectedTile) {
    const tile = tiles[selectedTile.y][selectedTile.x];
    const panelW = 260;
    const panelH = tileTypeMenu ? 180 : 120;
    const panelX = 10;
    const panelY = gameHeight - panelH - 10;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(panelX, panelY, panelW, panelH);

    ctx.font = '9px "Press Start 2P"';
    ctx.textAlign = 'left';

    const owner = tile.ownerId === -1 ? 'Neutral' : players[tile.ownerId]?.name || '?';
    ctx.fillStyle = tile.ownerId === -1 ? '#888' : (players[tile.ownerId]?.color || '#888');
    ctx.fillText(`Owner: ${owner}`, panelX + 10, panelY + 20);

    ctx.fillStyle = '#ccc';
    ctx.fillText(`Type: ${tile.tileType}`, panelX + 10, panelY + 38);
    ctx.fillText(`Units: ${Math.floor(tile.units)}`, panelX + 10, panelY + 56);
    ctx.fillText(`Stability: ${Math.floor(tile.stability)}%`, panelX + 10, panelY + 74);
    ctx.fillText(`Connected: ${tile.connected ? 'YES' : 'NO'}`, panelX + 10, panelY + 92);

    if (attackMode) {
      ctx.fillStyle = '#ff4444';
      ctx.fillText('ATTACK MODE - click target', panelX + 10, panelY + 112);
    }

    // Tile type menu
    if (tileTypeMenu && tile.ownerId === 0) {
      ctx.fillStyle = '#FFD700';
      ctx.fillText('Set type:', panelX + 10, panelY + 125);
      ctx.fillStyle = '#aaa';
      ctx.font = '8px "Press Start 2P"';
      ctx.fillText('[1] Normal  [2] Buff', panelX + 10, panelY + 143);
      ctx.fillText('[3] Wall  [4] Intercept', panelX + 10, panelY + 158);
      ctx.fillText('[5] Radar', panelX + 10, panelY + 173);
    }
  }

  // Player list (bottom-right)
  const listW = 200;
  const listH = players.length * 20 + 10;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(gameWidth - listW - 10, gameHeight - listH - 10, listW, listH);

  ctx.font = '8px "Press Start 2P"';
  ctx.textAlign = 'left';
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    ctx.fillStyle = p.alive ? p.color : '#555';
    const text = `${p.name}: ${p.tileCount}t`;
    ctx.fillText(text, gameWidth - listW, gameHeight - listH + 10 + i * 20);
  }
}

// ========== GAME LOOP ==========
function update(dt: number): void {
  gameTime += dt * 1000;

  // Update units growth
  updateUnitsGrowth(dt);

  // Update stability
  updateStability(dt);

  // Update attacks
  updateAttacks(dt);

  // Recalculate supply periodically
  if (gameTime - lastSupplyCheck > SUPPLY_CHECK_INTERVAL) {
    recalculateSupply();
    lastSupplyCheck = gameTime;
  }

  // AI ticks
  if (gameTime - lastAITick > AI_TICK_INTERVAL) {
    for (const player of players) {
      if (player.isAI) aiTick(player);
    }
    lastAITick = gameTime;
  }
}

function gameLoop(timestamp: number): void {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1); // cap at 100ms
  lastTime = timestamp;

  update(dt);
  render();

  requestAnimationFrame(gameLoop);
}

// ========== START ==========
initGame();
requestAnimationFrame((t) => {
  lastTime = t;
  gameLoop(t);
});

console.log('⚔️ UNITS game started');
