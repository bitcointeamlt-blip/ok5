// ========== UNITS - Space Strategy Game ==========

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
const WORLD_SIZE = 5000; // 5000x5000 world
const BASE_GROWTH_RATE = 1.5; // units per second
const STABILITY_MAX = 100;
const SUPPLY_CHECK_INTERVAL = 2000;
const SUPPLY_RANGE = 400; // max distance for supply connection

// Planet generation
const PLANET_COUNT = 80; // total planets on map
const MIN_PLANET_DISTANCE = 120; // minimum distance between planets

// Empire degradation
const EMPIRE_SLOW_THRESHOLD = 8;
const EMPIRE_DECAY_THRESHOLD = 20;
const EMPIRE_GROWTH_PENALTY = 0.08;

// Attack
const DISTANCE_PENALTY_PER_100PX = 0.05; // 5% loss per 100px distance
const MIN_ATTACK_EFFICIENCY = 0.2;
const ATTACK_BASE_SPEED = 250; // pixels per second

// ========== ENUMS ==========
enum PlanetSize {
  ASTEROID = 'asteroid',     // radius 12-18
  SMALL = 'small',           // radius 22-30
  MEDIUM = 'medium',         // radius 35-50
  LARGE = 'large',           // radius 55-75
  GIANT = 'giant'            // radius 80-100
}

// ========== INTERFACES ==========
interface Planet {
  id: number;
  x: number;
  y: number;
  radius: number;
  size: PlanetSize;
  ownerId: number; // -1 = neutral
  units: number;
  maxUnits: number;
  defense: number;
  growthRate: number;
  stability: number;
  connected: boolean;
  color: string; // planet's natural color (visual)
  craters: { x: number; y: number; r: number }[]; // visual detail
  // Moon orbit properties (only for moons)
  isMoon?: boolean;
  parentId?: number; // parent planet id
  orbitAngle?: number; // current angle
  orbitRadius?: number; // distance from parent
  orbitSpeed?: number; // radians per second
}

interface Player {
  id: number;
  name: string;
  color: string;
  colorDark: string;
  planetCount: number;
  totalUnits: number;
  homeId: number; // starting planet id
  alive: boolean;
  isAI: boolean;
}

interface AttackAnimation {
  fromId: number;
  toId: number;
  units: number;
  playerId: number;
  progress: number; // 0-1
  speed: number; // progress per second
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

interface Star {
  x: number;
  y: number;
  brightness: number;
  size: number;
}

// ========== GAME STATE ==========
let planets: Planet[] = [];
let players: Player[] = [];
let attacks: AttackAnimation[] = [];
let selectedPlanet: number | null = null; // planet id
let hoveredPlanet: number | null = null;
let gameTime = 0;
let lastTime = 0;
let lastSupplyCheck = 0;
let lastAITick = 0;
const AI_TICK_INTERVAL = 2000;

// Background stars
let stars: Star[] = [];

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
let attackMode = false;
let mouseX = 0;
let mouseY = 0;

// Player colors
const PLAYER_COLORS = [
  { color: '#4488ff', dark: '#2255aa' }, // Blue (player)
  { color: '#ff4444', dark: '#aa2222' }, // Red
  { color: '#44cc44', dark: '#228822' }, // Green
  { color: '#ffaa00', dark: '#aa7700' }, // Orange
  { color: '#cc44cc', dark: '#882288' }, // Purple
];

// Planet natural colors (for neutral planets)
const PLANET_COLORS = [
  '#6b5b4a', '#7a6655', '#5c5c6e', '#4a5a4a', '#6e5a5a',
  '#5a5a4a', '#4a4a5a', '#6a5a6a', '#5a6a5a', '#7a5a4a',
  '#8a7a6a', '#5a4a3a', '#6a6a7a', '#7a7a5a', '#4a5a6a'
];

// ========== PLANET SIZE PROPERTIES ==========
function getPlanetProperties(size: PlanetSize): { minR: number; maxR: number; maxUnits: number; defense: number; growth: number } {
  switch (size) {
    case PlanetSize.ASTEROID:
      return { minR: 12, maxR: 18, maxUnits: 100, defense: 0.8, growth: 0.5 };
    case PlanetSize.SMALL:
      return { minR: 22, maxR: 30, maxUnits: 200, defense: 1.0, growth: 1.0 };
    case PlanetSize.MEDIUM:
      return { minR: 35, maxR: 50, maxUnits: 400, defense: 1.5, growth: 1.5 };
    case PlanetSize.LARGE:
      return { minR: 55, maxR: 75, maxUnits: 700, defense: 2.0, growth: 2.0 };
    case PlanetSize.GIANT:
      return { minR: 80, maxR: 100, maxUnits: 1200, defense: 3.0, growth: 2.5 };
  }
}

// ========== INITIALIZATION ==========
function generateStars(): void {
  stars = [];
  for (let i = 0; i < 500; i++) {
    stars.push({
      x: Math.random() * WORLD_SIZE,
      y: Math.random() * WORLD_SIZE,
      brightness: Math.random() * 0.6 + 0.2,
      size: Math.random() < 0.1 ? 2 : 1
    });
  }
}

function generatePlanets(): void {
  planets = [];
  let id = 0;

  // Distribution: many small, fewer large
  const sizeDistribution: { size: PlanetSize; count: number }[] = [
    { size: PlanetSize.ASTEROID, count: 30 },
    { size: PlanetSize.SMALL, count: 25 },
    { size: PlanetSize.MEDIUM, count: 15 },
    { size: PlanetSize.LARGE, count: 7 },
    { size: PlanetSize.GIANT, count: 3 },
  ];

  for (const { size, count } of sizeDistribution) {
    for (let i = 0; i < count; i++) {
      const props = getPlanetProperties(size);
      const radius = props.minR + Math.random() * (props.maxR - props.minR);

      // Find valid position (not too close to other planets)
      let x = 0, y = 0;
      let valid = false;
      let attempts = 0;

      while (!valid && attempts < 100) {
        x = radius + Math.random() * (WORLD_SIZE - radius * 2);
        y = radius + Math.random() * (WORLD_SIZE - radius * 2);

        valid = true;
        for (const p of planets) {
          const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
          if (dist < p.radius + radius + MIN_PLANET_DISTANCE) {
            valid = false;
            break;
          }
        }
        attempts++;
      }

      if (!valid) continue; // skip if can't place

      // Generate craters for visual detail
      const craterCount = Math.floor(radius / 10) + Math.floor(Math.random() * 3);
      const craters: { x: number; y: number; r: number }[] = [];
      for (let c = 0; c < craterCount; c++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * radius * 0.6;
        craters.push({
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          r: 2 + Math.random() * (radius * 0.15)
        });
      }

      // Larger planets have more starting HP (units)
      let startingUnits: number;
      switch (size) {
        case PlanetSize.ASTEROID: startingUnits = Math.floor(Math.random() * 30) + 10; break;
        case PlanetSize.SMALL: startingUnits = Math.floor(Math.random() * 80) + 30; break;
        case PlanetSize.MEDIUM: startingUnits = Math.floor(Math.random() * 150) + 80; break;
        case PlanetSize.LARGE: startingUnits = Math.floor(Math.random() * 300) + 150; break;
        case PlanetSize.GIANT: startingUnits = Math.floor(Math.random() * 500) + 300; break;
      }

      planets.push({
        id: id++,
        x, y,
        radius,
        size,
        ownerId: -1,
        units: startingUnits,
        maxUnits: props.maxUnits,
        defense: props.defense,
        growthRate: props.growth,
        stability: 50,
        connected: false,
        color: PLANET_COLORS[Math.floor(Math.random() * PLANET_COLORS.length)],
        craters
      });
    }
  }

  // Add moons to LARGE and GIANT planets
  const mainPlanets = [...planets]; // copy to avoid modifying during iteration
  for (const parent of mainPlanets) {
    if (parent.size === PlanetSize.LARGE || parent.size === PlanetSize.GIANT) {
      const moonOrbitRadius = parent.radius + 30 + Math.random() * 20;
      const moonAngle = Math.random() * Math.PI * 2;
      const moonX = parent.x + Math.cos(moonAngle) * moonOrbitRadius;
      const moonY = parent.y + Math.sin(moonAngle) * moonOrbitRadius;

      planets.push({
        id: id++,
        x: moonX,
        y: moonY,
        radius: 8 + Math.random() * 4, // small moon radius
        size: PlanetSize.ASTEROID,
        ownerId: -1,
        units: 100,
        maxUnits: 100,
        defense: 0.8,
        growthRate: 0.3,
        stability: 50,
        connected: false,
        color: '#aaa8a0',
        craters: [
          { x: Math.random() * 4 - 2, y: Math.random() * 4 - 2, r: 2 },
          { x: Math.random() * 4 - 2, y: Math.random() * 4 - 2, r: 1.5 }
        ],
        isMoon: true,
        parentId: parent.id,
        orbitAngle: moonAngle,
        orbitRadius: moonOrbitRadius,
        orbitSpeed: 0.3 + Math.random() * 0.3 // radians per second
      });
    }
  }
}

function initPlayers(): void {
  players = [];

  // Find 4 asteroids near the corners for starting positions
  const corners = [
    { x: WORLD_SIZE * 0.2, y: WORLD_SIZE * 0.2 },
    { x: WORLD_SIZE * 0.8, y: WORLD_SIZE * 0.8 },
    { x: WORLD_SIZE * 0.2, y: WORLD_SIZE * 0.8 },
    { x: WORLD_SIZE * 0.8, y: WORLD_SIZE * 0.2 },
  ];

  const usedPlanets = new Set<number>();

  for (let i = 0; i < 4; i++) {
    // Find closest asteroid to corner
    let bestPlanet: Planet | null = null;
    let bestDist = Infinity;

    for (const p of planets) {
      if (usedPlanets.has(p.id)) continue;
      if (p.size !== PlanetSize.ASTEROID) continue;
      if (p.isMoon) continue; // don't start on a moon

      const dist = Math.sqrt((p.x - corners[i].x) ** 2 + (p.y - corners[i].y) ** 2);
      if (dist < bestDist) {
        bestDist = dist;
        bestPlanet = p;
      }
    }

    if (!bestPlanet) {
      // Fallback: use any small planet
      for (const p of planets) {
        if (usedPlanets.has(p.id)) continue;
        if (p.size === PlanetSize.ASTEROID || p.size === PlanetSize.SMALL) {
          bestPlanet = p;
          break;
        }
      }
    }

    if (!bestPlanet) continue;

    usedPlanets.add(bestPlanet.id);

    // Assign to player
    bestPlanet.ownerId = i;
    bestPlanet.units = 100;
    bestPlanet.stability = STABILITY_MAX;
    bestPlanet.connected = true;

    players.push({
      id: i,
      name: i === 0 ? 'You' : `AI ${i}`,
      color: PLAYER_COLORS[i].color,
      colorDark: PLAYER_COLORS[i].dark,
      planetCount: 1,
      totalUnits: 100,
      homeId: bestPlanet.id,
      alive: true,
      isAI: i !== 0
    });
  }

  // Center camera on player's home
  if (players.length > 0) {
    const home = planets[players[0].homeId];
    if (home) {
      camera.x = home.x * camera.zoom - gameWidth / 2;
      camera.y = home.y * camera.zoom - gameHeight / 2;
    }
  }
}

function initGame(): void {
  generateStars();
  generatePlanets();
  initPlayers();
  console.log('⚔️ UNITS Space initialized -', planets.length, 'planets');
}

// ========== SUPPLY / CONNECTIVITY ==========
function getDistance(a: Planet, b: Planet): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function recalculateSupply(): void {
  // Reset
  for (const p of planets) {
    p.connected = false;
  }

  // BFS from each player's home planet
  for (const player of players) {
    if (!player.alive) continue;

    const home = planets.find(p => p.id === player.homeId);
    if (!home || home.ownerId !== player.id) {
      player.alive = false;
      continue;
    }

    // BFS through owned planets within supply range
    const queue: Planet[] = [home];
    const visited = new Set<number>();
    visited.add(home.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      current.connected = true;

      for (const p of planets) {
        if (visited.has(p.id)) continue;
        if (p.ownerId !== player.id) continue;

        const dist = getDistance(current, p);
        if (dist <= SUPPLY_RANGE) {
          visited.add(p.id);
          queue.push(p);
        }
      }
    }
  }
}

// ========== STABILITY ==========
function updateStability(dt: number): void {
  for (const planet of planets) {
    if (planet.ownerId === -1) continue;

    const player = players[planet.ownerId];
    if (!player || !player.alive) continue;

    let targetStability = STABILITY_MAX;

    // Distance from home planet
    const home = planets.find(p => p.id === player.homeId);
    if (home) {
      const dist = getDistance(planet, home);
      targetStability -= (dist / 200) * 3; // lose stability over distance
    }

    // Not connected = bad
    if (!planet.connected) {
      targetStability = Math.min(targetStability, 20);
    }

    // Empire size penalty
    if (player.planetCount > EMPIRE_SLOW_THRESHOLD) {
      const excess = player.planetCount - EMPIRE_SLOW_THRESHOLD;
      targetStability -= excess * 3;
    }

    targetStability = Math.max(0, Math.min(STABILITY_MAX, targetStability));

    // Move toward target
    const rate = planet.stability < targetStability ? 5 : 2;
    if (planet.stability < targetStability) {
      planet.stability = Math.min(targetStability, planet.stability + rate * dt);
    } else {
      planet.stability = Math.max(targetStability, planet.stability - rate * dt);
    }

    // Stability 0 = planet goes neutral
    if (planet.stability <= 0) {
      planet.ownerId = -1;
      planet.units = Math.floor(planet.units * 0.3);
    }
  }
}

// ========== UNITS GROWTH ==========
function updateGrowth(dt: number): void {
  // Reset counts
  for (const player of players) {
    player.planetCount = 0;
    player.totalUnits = 0;
  }

  for (const planet of planets) {
    if (planet.ownerId === -1) continue;

    const player = players[planet.ownerId];
    if (!player || !player.alive) continue;

    player.planetCount++;
    player.totalUnits += planet.units;

    // Calculate growth
    let growth = BASE_GROWTH_RATE * planet.growthRate;

    // Stability affects growth
    if (planet.stability < 30) {
      growth = -1; // decay
    } else if (planet.stability < 70) {
      growth *= 0.3;
    }

    // Empire size penalty
    if (player.planetCount > EMPIRE_SLOW_THRESHOLD) {
      const excess = player.planetCount - EMPIRE_SLOW_THRESHOLD;
      growth *= Math.max(0.1, 1.0 - excess * EMPIRE_GROWTH_PENALTY);
    }

    if (player.planetCount > EMPIRE_DECAY_THRESHOLD) {
      growth -= 0.5;
    }

    // Not connected = no growth
    if (!planet.connected) {
      growth = Math.min(growth, -0.5);
    }

    // Apply
    planet.units = Math.max(0, Math.min(planet.maxUnits, planet.units + growth * dt));

    if (planet.units <= 0) {
      planet.ownerId = -1;
      planet.units = 0;
    }
  }
}

// ========== ATTACK ==========
function launchAttack(fromId: number, toId: number): void {
  const from = planets.find(p => p.id === fromId);
  const to = planets.find(p => p.id === toId);
  if (!from || !to) return;
  if (from.ownerId === -1) return;
  if (from.units < 2) return;

  const unitsToSend = Math.floor(from.units * 0.5);
  from.units -= unitsToSend;

  const dist = getDistance(from, to);
  const travelTime = dist / ATTACK_BASE_SPEED;

  attacks.push({
    fromId,
    toId,
    units: unitsToSend,
    playerId: from.ownerId,
    progress: 0,
    speed: 1.0 / travelTime
  });
}

function resolveAttack(attack: AttackAnimation): void {
  const to = planets.find(p => p.id === attack.toId);
  const from = planets.find(p => p.id === attack.fromId);
  if (!to || !from) return;

  const dist = getDistance(from, to);
  const penalty = (dist / 100) * DISTANCE_PENALTY_PER_100PX;
  const efficiency = Math.max(MIN_ATTACK_EFFICIENCY, 1.0 - penalty);
  const arrivingUnits = Math.floor(attack.units * efficiency);

  if (to.ownerId === attack.playerId) {
    // Reinforce
    to.units = Math.min(to.maxUnits, to.units + arrivingUnits);
  } else {
    // Attack
    const defenseStrength = to.units * to.defense;

    if (arrivingUnits > defenseStrength) {
      // Attacker wins
      const remaining = arrivingUnits - defenseStrength;
      to.ownerId = attack.playerId;
      to.units = Math.max(1, Math.floor(remaining));
      to.stability = 50;
      to.connected = false;
    } else {
      // Defender wins
      to.units = Math.max(0, Math.floor((defenseStrength - arrivingUnits) / to.defense));
      if (to.units <= 0) {
        to.ownerId = -1;
      }
    }
  }
}

function updateAttacks(dt: number): void {
  for (let i = attacks.length - 1; i >= 0; i--) {
    attacks[i].progress += attacks[i].speed * dt;
    if (attacks[i].progress >= 1.0) {
      resolveAttack(attacks[i]);
      attacks.splice(i, 1);
    }
  }
}

// ========== AI ==========
function aiTick(player: Player): void {
  if (!player.alive || !player.isAI) return;

  const myPlanets = planets.filter(p => p.ownerId === player.id);
  if (myPlanets.length === 0) { player.alive = false; return; }

  // Find attack candidates
  interface AiCandidate { from: Planet; to: Planet; priority: number }
  const candidates: AiCandidate[] = [];

  for (const mine of myPlanets) {
    if (mine.units < 40) continue;

    // Find nearby planets to attack
    for (const target of planets) {
      if (target.ownerId === player.id) continue;

      const dist = getDistance(mine, target);
      if (dist > 600) continue; // don't attack too far

      let priority = 0;

      if (target.ownerId === -1) {
        // Neutral
        priority = 10 - (target.units / target.maxUnits) * 5;
        // Prefer closer planets
        priority += (600 - dist) / 100;
        // Prefer larger planets
        if (target.size === PlanetSize.LARGE || target.size === PlanetSize.GIANT) priority += 5;
      } else {
        // Enemy - only if we can win
        const defStr = target.units * target.defense;
        const penalty = (dist / 100) * DISTANCE_PENALTY_PER_100PX;
        const efficiency = Math.max(MIN_ATTACK_EFFICIENCY, 1.0 - penalty);
        const arriving = mine.units * 0.5 * efficiency;

        if (arriving > defStr * 1.2) {
          priority = 8;
          // Prioritize home planets
          const enemyPlayer = players[target.ownerId];
          if (enemyPlayer && target.id === enemyPlayer.homeId) priority += 10;
        }
      }

      if (priority > 0) {
        candidates.push({ from: mine, to: target, priority });
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);

  // Execute top 1-2 actions
  const maxActions = Math.min(2, candidates.length);
  for (let i = 0; i < maxActions; i++) {
    if (candidates[i].from.units > 40) {
      launchAttack(candidates[i].from.id, candidates[i].to.id);
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
    x: (sx + camera.x) / camera.zoom,
    y: (sy + camera.y) / camera.zoom
  };
}

function worldToScreen(wx: number, wy: number): { x: number; y: number } {
  return {
    x: wx * camera.zoom - camera.x,
    y: wy * camera.zoom - camera.y
  };
}

function getPlanetAtScreen(sx: number, sy: number): Planet | null {
  const world = screenToWorld(sx, sy);
  for (const p of planets) {
    const dist = Math.sqrt((world.x - p.x) ** 2 + (world.y - p.y) ** 2);
    if (dist <= p.radius) return p;
  }
  return null;
}

canvas.addEventListener('mousedown', (e) => {
  const pos = getCanvasMousePos(e);

  if (e.button === 2 || e.button === 1) {
    camera.dragging = true;
    camera.dragStartX = pos.x;
    camera.dragStartY = pos.y;
    camera.dragCamStartX = camera.x;
    camera.dragCamStartY = camera.y;
    e.preventDefault();
    return;
  }

  // Left click
  const planet = getPlanetAtScreen(pos.x, pos.y);

  if (attackMode && selectedPlanet !== null) {
    if (planet && planet.id !== selectedPlanet) {
      launchAttack(selectedPlanet, planet.id);
    }
    attackMode = false;
    selectedPlanet = null;
  } else {
    if (planet) {
      selectedPlanet = planet.id;
      attackMode = false;
    } else {
      selectedPlanet = null;
      attackMode = false;
    }
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

  const planet = getPlanetAtScreen(pos.x, pos.y);
  hoveredPlanet = planet ? planet.id : null;
});

canvas.addEventListener('mouseup', () => {
  camera.dragging = false;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const pos = getCanvasMousePos(e);
  const worldBefore = screenToWorld(pos.x, pos.y);

  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  camera.targetZoom = Math.max(0.15, Math.min(3.0, camera.targetZoom * zoomFactor));
  camera.zoom = camera.targetZoom; // instant for precise zooming

  // Zoom toward mouse position
  const worldAfter = screenToWorld(pos.x, pos.y);
  camera.x += (worldBefore.x - worldAfter.x) * camera.zoom;
  camera.y += (worldBefore.y - worldAfter.y) * camera.zoom;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  if (e.key === 'a' || e.key === 'A') {
    if (selectedPlanet !== null) {
      const planet = planets.find(p => p.id === selectedPlanet);
      if (planet && planet.ownerId === 0) {
        attackMode = !attackMode;
      }
    }
  }
  if (e.key === 'Escape') {
    selectedPlanet = null;
    attackMode = false;
  }
  // Space = center on home
  if (e.key === ' ') {
    e.preventDefault();
    const home = planets.find(p => p.id === players[0]?.homeId);
    if (home) {
      camera.x = home.x * camera.zoom - gameWidth / 2;
      camera.y = home.y * camera.zoom - gameHeight / 2;
    }
  }
});

// ========== RENDERING ==========
function renderStars(): void {
  for (const star of stars) {
    const screen = worldToScreen(star.x, star.y);
    if (screen.x < -5 || screen.x > gameWidth + 5 || screen.y < -5 || screen.y > gameHeight + 5) continue;

    ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
    ctx.fillRect(Math.floor(screen.x), Math.floor(screen.y), star.size, star.size);
  }
}

function renderSupplyLines(): void {
  // Draw supply connections between owned planets
  for (const player of players) {
    if (!player.alive) continue;

    const owned = planets.filter(p => p.ownerId === player.id && p.connected);

    for (let i = 0; i < owned.length; i++) {
      for (let j = i + 1; j < owned.length; j++) {
        const dist = getDistance(owned[i], owned[j]);
        if (dist <= SUPPLY_RANGE) {
          const from = worldToScreen(owned[i].x, owned[i].y);
          const to = worldToScreen(owned[j].x, owned[j].y);

          ctx.strokeStyle = player.color + '22';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        }
      }
    }
  }
}

function renderPlanet(planet: Planet): void {
  const screen = worldToScreen(planet.x, planet.y);
  const screenRadius = planet.radius * camera.zoom;

  // Cull off-screen
  if (screen.x + screenRadius < 0 || screen.x - screenRadius > gameWidth) return;
  if (screen.y + screenRadius < 0 || screen.y - screenRadius > gameHeight) return;

  // Planet body
  let bodyColor = planet.color;
  if (planet.ownerId !== -1) {
    const player = players[planet.ownerId];
    if (player) {
      bodyColor = planet.stability < 30 ? player.colorDark : player.color;
    }
  }

  ctx.beginPath();
  ctx.arc(screen.x, screen.y, screenRadius, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();

  // Craters (visual detail) - only if big enough on screen
  if (screenRadius > 10) {
    for (const crater of planet.craters) {
      const cx = screen.x + crater.x * camera.zoom;
      const cy = screen.y + crater.y * camera.zoom;
      const cr = crater.r * camera.zoom;
      if (cr < 1) continue;

      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fill();
    }
  }

  // Planet outline
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, screenRadius, 0, Math.PI * 2);
  ctx.strokeStyle = planet.ownerId !== -1 ? (players[planet.ownerId]?.colorDark || '#444') : '#444';
  ctx.lineWidth = planet.ownerId !== -1 ? 2 : 1;
  ctx.stroke();

  // Disconnected indicator
  if (planet.ownerId !== -1 && !planet.connected) {
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, screenRadius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff000066';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Units number
  if (screenRadius > 8 && planet.units > 0) {
    const fontSize = Math.max(8, Math.min(16, screenRadius * 0.5));
    ctx.font = `bold ${fontSize}px "Press Start 2P"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.fillText(Math.floor(planet.units).toString(), screen.x, screen.y);
    ctx.shadowBlur = 0;
  }

  // Size label for large planets (if zoomed enough)
  if (screenRadius > 30 && (planet.size === PlanetSize.LARGE || planet.size === PlanetSize.GIANT)) {
    ctx.font = '7px "Press Start 2P"';
    ctx.fillStyle = '#ffffff66';
    ctx.fillText(planet.size.toUpperCase(), screen.x, screen.y + screenRadius * 0.5);
  }
}

function renderAttacks(): void {
  for (const attack of attacks) {
    const from = planets.find(p => p.id === attack.fromId);
    const to = planets.find(p => p.id === attack.toId);
    if (!from || !to) continue;

    const fromScreen = worldToScreen(from.x, from.y);
    const toScreen = worldToScreen(to.x, to.y);
    const cx = fromScreen.x + (toScreen.x - fromScreen.x) * attack.progress;
    const cy = fromScreen.y + (toScreen.y - fromScreen.y) * attack.progress;

    const player = players[attack.playerId];
    if (!player) continue;

    // Trail line
    ctx.strokeStyle = player.color + '33';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fromScreen.x, fromScreen.y);
    ctx.lineTo(cx, cy);
    ctx.stroke();

    // Moving dot
    const dotSize = Math.max(3, 5 * camera.zoom);
    ctx.beginPath();
    ctx.arc(cx, cy, dotSize, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();

    // Unit count label
    if (camera.zoom > 0.4) {
      ctx.font = '8px "Press Start 2P"';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(Math.floor(attack.units).toString(), cx, cy - dotSize - 4);
    }
  }
}

function renderUI(): void {
  // Top-left: Player stats
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(10, 10, 260, 100);
  ctx.strokeStyle = '#4488ff44';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, 260, 100);

  ctx.font = '14px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFD700';
  ctx.fillText('UNITS', 22, 38);

  ctx.font = '9px "Press Start 2P"';
  ctx.fillStyle = '#aaa';
  ctx.fillText(`Planets: ${players[0]?.planetCount || 0}`, 22, 60);
  ctx.fillText(`Total Units: ${Math.floor(players[0]?.totalUnits || 0)}`, 22, 78);
  ctx.fillText(`Zoom: ${camera.zoom.toFixed(2)}x`, 22, 96);

  // Top-right: Controls
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(gameWidth - 290, 10, 280, 120);

  ctx.font = '8px "Press Start 2P"';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#666';
  ctx.fillText('Right-click drag: Pan', gameWidth - 20, 30);
  ctx.fillText('Scroll: Zoom', gameWidth - 20, 46);
  ctx.fillText('Click planet: Select', gameWidth - 20, 62);
  ctx.fillText('[A] Attack mode', gameWidth - 20, 78);
  ctx.fillText('[SPACE] Home planet', gameWidth - 20, 94);
  ctx.fillText('[ESC] Deselect', gameWidth - 20, 110);

  // Selected planet info
  if (selectedPlanet !== null) {
    const planet = planets.find(p => p.id === selectedPlanet);
    if (planet) {
      const panelW = 270;
      const panelH = 130;
      const panelX = 10;
      const panelY = gameHeight - panelH - 10;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(panelX, panelY, panelW, panelH);
      ctx.strokeStyle = '#ffffff22';
      ctx.strokeRect(panelX, panelY, panelW, panelH);

      ctx.font = '9px "Press Start 2P"';
      ctx.textAlign = 'left';

      const owner = planet.ownerId === -1 ? 'Neutral' : players[planet.ownerId]?.name || '?';
      ctx.fillStyle = planet.ownerId === -1 ? '#888' : (players[planet.ownerId]?.color || '#888');
      ctx.fillText(`${owner}`, panelX + 12, panelY + 20);

      ctx.fillStyle = '#ccc';
      ctx.fillText(`Size: ${planet.size}`, panelX + 12, panelY + 40);
      ctx.fillText(`Units: ${Math.floor(planet.units)} / ${planet.maxUnits}`, panelX + 12, panelY + 58);
      ctx.fillText(`Defense: ${planet.defense.toFixed(1)}x`, panelX + 12, panelY + 76);
      ctx.fillText(`Stability: ${Math.floor(planet.stability)}%`, panelX + 12, panelY + 94);
      ctx.fillText(`Supply: ${planet.connected ? 'Connected' : 'CUT OFF'}`, panelX + 12, panelY + 112);

      if (attackMode) {
        ctx.fillStyle = '#ff4444';
        ctx.font = '10px "Press Start 2P"';
        ctx.fillText('ATTACK - click target', panelX + 12, panelY + panelH - 5);
      }
    }
  }

  // Attack mode line preview
  if (attackMode && selectedPlanet !== null && hoveredPlanet !== null && hoveredPlanet !== selectedPlanet) {
    const from = planets.find(p => p.id === selectedPlanet);
    const to = planets.find(p => p.id === hoveredPlanet);
    if (from && to) {
      const fromScreen = worldToScreen(from.x, from.y);
      const toScreen = worldToScreen(to.x, to.y);
      const dist = getDistance(from, to);
      const penalty = (dist / 100) * DISTANCE_PENALTY_PER_100PX;
      const efficiency = Math.max(MIN_ATTACK_EFFICIENCY, 1.0 - penalty);

      // Line
      ctx.strokeStyle = `rgba(255, ${Math.floor(efficiency * 200)}, 0, 0.5)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(fromScreen.x, fromScreen.y);
      ctx.lineTo(toScreen.x, toScreen.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Efficiency label
      const midX = (fromScreen.x + toScreen.x) / 2;
      const midY = (fromScreen.y + toScreen.y) / 2;
      ctx.font = '10px "Press Start 2P"';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.floor(efficiency * 100)}% eff`, midX, midY - 12);
      ctx.font = '8px "Press Start 2P"';
      ctx.fillStyle = '#aaa';
      ctx.fillText(`${Math.floor(from.units * 0.5)} units`, midX, midY + 6);
    }
  }

  // Player scoreboard (bottom-right)
  const sbW = 220;
  const sbH = players.length * 22 + 16;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(gameWidth - sbW - 10, gameHeight - sbH - 10, sbW, sbH);

  ctx.font = '8px "Press Start 2P"';
  ctx.textAlign = 'left';
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    ctx.fillStyle = p.alive ? p.color : '#444';
    ctx.fillText(
      `${p.name}: ${p.planetCount}P ${Math.floor(p.totalUnits)}U`,
      gameWidth - sbW,
      gameHeight - sbH + 8 + i * 22
    );
  }
}

function render(): void {
  // Clear
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, gameWidth, gameHeight);

  // Stars
  renderStars();

  // Supply lines (behind planets)
  renderSupplyLines();

  // Moon orbit rings (behind planets)
  for (const moon of planets) {
    if (!moon.isMoon || moon.parentId === undefined) continue;
    const parent = planets.find(p => p.id === moon.parentId);
    if (!parent) continue;

    const parentScreen = worldToScreen(parent.x, parent.y);
    const orbitR = (moon.orbitRadius || 0) * camera.zoom;

    // Skip if off screen
    if (parentScreen.x + orbitR < 0 || parentScreen.x - orbitR > gameWidth) continue;
    if (parentScreen.y + orbitR < 0 || parentScreen.y - orbitR > gameHeight) continue;

    ctx.beginPath();
    ctx.arc(parentScreen.x, parentScreen.y, orbitR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Planets
  for (const planet of planets) {
    renderPlanet(planet);
  }

  // Selection ring
  if (selectedPlanet !== null) {
    const planet = planets.find(p => p.id === selectedPlanet);
    if (planet) {
      const screen = worldToScreen(planet.x, planet.y);
      const r = planet.radius * camera.zoom;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = attackMode ? '#ff4444' : '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Hover ring
  if (hoveredPlanet !== null && hoveredPlanet !== selectedPlanet) {
    const planet = planets.find(p => p.id === hoveredPlanet);
    if (planet) {
      const screen = worldToScreen(planet.x, planet.y);
      const r = planet.radius * camera.zoom;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff44';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Attacks
  renderAttacks();

  // UI overlay
  renderUI();
}

// ========== MOON ORBIT ==========
function updateMoons(dt: number): void {
  for (const moon of planets) {
    if (!moon.isMoon || moon.parentId === undefined) continue;

    const parent = planets.find(p => p.id === moon.parentId);
    if (!parent) continue;

    // Rotate moon around parent
    moon.orbitAngle = (moon.orbitAngle || 0) + (moon.orbitSpeed || 0.4) * dt;
    const orbitR = moon.orbitRadius || (parent.radius + 40);
    moon.x = parent.x + Math.cos(moon.orbitAngle) * orbitR;
    moon.y = parent.y + Math.sin(moon.orbitAngle) * orbitR;
  }
}

// ========== GAME LOOP ==========
function update(dt: number): void {
  gameTime += dt * 1000;

  updateMoons(dt);
  updateGrowth(dt);
  updateStability(dt);
  updateAttacks(dt);

  if (gameTime - lastSupplyCheck > SUPPLY_CHECK_INTERVAL) {
    recalculateSupply();
    lastSupplyCheck = gameTime;
  }

  if (gameTime - lastAITick > AI_TICK_INTERVAL) {
    for (const player of players) {
      if (player.isAI) aiTick(player);
    }
    lastAITick = gameTime;
  }
}

function gameLoop(timestamp: number): void {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
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

console.log('⚔️ UNITS Space - planets:', planets.length, ', players:', players.length);
