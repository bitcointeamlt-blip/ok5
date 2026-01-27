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

// ========== MOBILE DETECTION ==========
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
const UI_SCALE = isMobile ? 1.5 : 1.0; // Scale up UI for mobile

// Touch state
let touchStartTime = 0;
let touchStartX = 0;
let touchStartY = 0;
let lastTouchX = 0;
let lastTouchY = 0;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let pinchStartDist = 0;
let pinchStartZoom = 1;
let isTouchDragging = false;
let isPinching = false;
const LONG_PRESS_DURATION = 500; // ms for context menu

// Prevent default touch behaviors on canvas
if (isMobile) {
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
  canvas.style.touchAction = 'none';
}

// Virtual joystick state (mobile only)
const JOYSTICK_SIZE = 120; // outer circle size
const JOYSTICK_INNER = 50; // inner thumb size
const JOYSTICK_X = 80; // center X position from left
const JOYSTICK_Y_OFFSET = 150; // offset from bottom
let joystickActive = false;
let joystickTouchId: number | null = null;
let joystickX = 0; // thumb position relative to center (-1 to 1)
let joystickY = 0;

// ========== ENUMS ==========
enum PlanetSize {
  ASTEROID = 'asteroid',
  TINY = 'tiny',
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  GIANT = 'giant',
  MEGA = 'mega',
  TITAN = 'titan',
  COLOSSUS = 'colossus'
}

enum GameState {
  PLAYING = 'playing',
  PAUSED = 'paused',
  GAMEOVER = 'gameover'
}

enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard'
}


// ========== CONSTANTS ==========
const WORLD_SIZE = 40000;
const STABILITY_MAX = 100;
const SUPPLY_CHECK_INTERVAL = 2000;
const SUPPLY_RANGE = 400;

// Planet generation
const PLANET_COUNT = 800;
const MIN_PLANET_DISTANCE = 100;

// Sun (center of map)
const SUN_X = WORLD_SIZE / 2;
const SUN_Y = WORLD_SIZE / 2;
const SUN_RADIUS = 800;
const SUN_NO_SPAWN_RADIUS = 1200; // planets can't spawn within this distance

// Empire degradation
const EMPIRE_SLOW_THRESHOLD = 8;
const EMPIRE_DECAY_THRESHOLD = 20;
const EMPIRE_GROWTH_PENALTY = 0.08;
const EMPIRE_DEGRADE_UNIT_THRESHOLD = 2000;

// Attack
const DISTANCE_NO_PENALTY = 700;      // no penalty for first 700px
const DISTANCE_PENALTY_PER_30PX = 1;  // lose 1 unit per 30px after 700px
const ATTACK_BASE_SPEED = 70;

// Fog of War
const FOG_REVEAL_DURATION = 5000;  // full vision for first 5 seconds
const FOG_FADE_IN_DURATION = 3000; // fog fades in over 3 seconds after reveal
const FOG_VISION_BY_SIZE: Record<string, number> = {
  [PlanetSize.ASTEROID]: 600,
  [PlanetSize.TINY]: 750,
  [PlanetSize.SMALL]: 900,
  [PlanetSize.MEDIUM]: 1200,
  [PlanetSize.LARGE]: 1700,
  [PlanetSize.GIANT]: 2200,
  [PlanetSize.MEGA]: 3000,
  [PlanetSize.TITAN]: 4000,
  [PlanetSize.COLOSSUS]: 5000
};

// Difficulty settings
const DIFFICULTY_SETTINGS = {
  [Difficulty.EASY]: { growthRate: 0.8, aiInterval: 3000, startUnits: 200 },
  [Difficulty.MEDIUM]: { growthRate: 0.6, aiInterval: 2000, startUnits: 200 },
  [Difficulty.HARD]: { growthRate: 0.4, aiInterval: 1200, startUnits: 200 }
};

// Special abilities
const ABILITY_COOLDOWNS = {
  blitz: 30000,   // 30s
  shield: 45000,  // 45s
  nuke: 60000     // 60s
};

// ========== PRECISE TEXT RENDERING ==========
// Use actualBoundingBox metrics for accurate text positioning

function drawTextCentered(text: string, fontSize: number, color: string, centerX: number, centerY: number): void {
  ctx.font = `${fontSize}px "Press Start 2P"`;
  ctx.fillStyle = color;

  // Get precise text metrics
  const metrics = ctx.measureText(text);

  // Calculate actual text dimensions using bounding box
  const actualWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
  const actualHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

  // Calculate position to center text precisely
  const drawX = centerX - metrics.actualBoundingBoxLeft - actualWidth / 2;
  const drawY = centerY + metrics.actualBoundingBoxAscent - actualHeight / 2;

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(text, Math.round(drawX), Math.round(drawY));
}

function drawTextLeft(text: string, fontSize: number, color: string, x: number, centerY: number): void {
  ctx.font = `${fontSize}px "Press Start 2P"`;
  ctx.fillStyle = color;

  const metrics = ctx.measureText(text);
  const actualHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

  // Center vertically only
  const drawY = centerY + metrics.actualBoundingBoxAscent - actualHeight / 2;

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(text, Math.round(x), Math.round(drawY));
}

// ========== INTERFACES ==========
type DepositType = 'carbon' | 'water' | 'gas' | 'metal' | 'crystal';

interface ResourceDeposit {
  type: DepositType;
  amount: number; // total mineable amount
}

const DEPOSIT_INFO: Record<DepositType, { name: string; color: string; icon: string }> = {
  carbon: { name: 'Carbon', color: '#8a7a6a', icon: 'C' },
  water: { name: 'Water', color: '#64c8ff', icon: 'W' },
  gas: { name: 'Gas', color: '#c8a050', icon: 'G' },
  metal: { name: 'Metal', color: '#9aacbc', icon: 'M' },
  crystal: { name: 'Crystal', color: '#b868d8', icon: 'X' }
};

// ========== BUILDINGS ==========
type BuildingType = 'turret' | 'mine' | 'factory' | 'shield_gen' | 'drone';

interface BuildingDef {
  name: string;
  type: BuildingType;
  cost: Partial<Record<DepositType, number>>;
  description: string;
  color: string;
  icon: string;
}

interface Building {
  type: BuildingType;
  slot: number;
}

const BUILDINGS: BuildingDef[] = [
  { type: 'turret', name: 'TURRET', cost: { metal: 30, carbon: 20 }, description: 'RADAR', color: '#ff6644', icon: 'T' },
  { type: 'mine', name: 'MINE', cost: { metal: 20, crystal: 25 }, description: '+GROW', color: '#88cc44', icon: 'M' },
  { type: 'factory', name: 'FACTORY', cost: { carbon: 30, gas: 20 }, description: '+MAX', color: '#cc8844', icon: 'F' },
  { type: 'shield_gen', name: 'SHIELD', cost: { crystal: 30, gas: 25 }, description: '1x BLOCK', color: '#44aaff', icon: 'S' },
  { type: 'drone', name: 'DRONE', cost: { water: 25, crystal: 20 }, description: '+20%DMG DEF', color: '#b868d8', icon: 'D' }
];

const DRONE_INTERCEPT_RANGE = 400; // drones intercept missiles within 400px
const DRONE_HIT_CHANCE = 0.5; // 50% chance to hit incoming missile

interface Planet {
  id: number;
  x: number;
  y: number;
  radius: number;
  size: PlanetSize;
  ownerId: number;
  units: number;
  maxUnits: number;
  defense: number;
  growthRate: number;
  stability: number;
  connected: boolean;
  generating: boolean; // whether this planet actively generates units
  deposits: ResourceDeposit[]; // resource deposits available
  color: string;
  craters: { x: number; y: number; r: number }[];
  isMoon?: boolean;
  parentId?: number;
  orbitAngle?: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  // Visual
  pulsePhase: number;
  shieldTimer: number; // remaining shield time (legacy)
  hasShield: boolean;  // one-time shield from shield_gen building
  spriteType: 'mars' | 'ice' | null; // assigned on capture
  buildings: (Building | null)[]; // 3 building slots
  // Mining
  nextMineTime: number; // game time when next resource will be mined
  // Turret cooldown (per-planet, not per-attack)
  nextTurretFireTime?: number;
  // Black hole - special planet type
  isBlackHole?: boolean;
}

interface Player {
  id: number;
  name: string;
  color: string;
  colorDark: string;
  planetCount: number;
  totalUnits: number;
  homeId: number;
  alive: boolean;
  isAI: boolean;
}

interface AttackAnimation {
  fromId: number;
  toId: number;
  units: number;
  startUnits: number; // original units sent (for distance degradation)
  playerId: number;
  progress: number;
  speed: number;
  isBlitz: boolean;
  shieldHit?: boolean; // true if this attack already hit a shield
  lastDegradeUnits?: number; // last unit count for showing degradation
  // Homing missile fields
  x: number; // current world position
  y: number;
  startX: number; // starting position (for trail)
  startY: number;
  angle: number; // current direction angle (radians)
  traveledDist: number; // total distance traveled (for degradation)
  droneCount: number; // number of drones (0-3) for intercept hit chance
  lastDroneFireTime?: number; // cooldown for drone shots
}

interface TurretMissile {
  x: number;
  y: number;
  targetAttackIndex: number;
  speed: number; // pixels per second
  planetId: number; // planet that fired this missile
  delay: number; // delay before missile starts moving (ms)
}

interface DroneProjectile {
  x: number;
  y: number;
  targetMissileIndex: number; // index in turretMissiles array
  speed: number;
  willHit: boolean; // determined at launch (50% chance)
}

let droneProjectiles: DroneProjectile[] = [];

const TURRET_FIRE_DISTANCE = 800;    // fire when enemy is 800px from planet
const TURRET_DAMAGE_DIVISOR = 10;    // damage = planet.units / 10
const TURRET_MISSILE_SPEED = 140;    // pixels per second (slower, less OP)
// Turret fire interval: random 1-3 seconds (set in updateTurrets)

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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface ClickAnim {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  text?: string;  // custom text (default "+1")
  color?: string; // custom color (default green)
}

interface ActionPopup {
  targetId: number;
  screenX: number;
  screenY: number;
  buttons: { label: string; action: string }[];
  openTime: number; // performance.now() when opened, for animation
  attackPercent?: number; // optional attack percentage for slider
}

interface SupplyConnection {
  fromId: number;
  toId: number;
  playerId: number;
}

interface Ability {
  id: string;
  name: string;
  lastUsed: number; // timestamp
  cooldown: number;
}

interface Probe {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  playerId: number;
  done: boolean;
  // If set, convert to orbit probe on arrival
  orbitTargetPlanetId?: number;
  orbitCount?: number;
}

interface OrbitProbe {
  targetPlanetId: number;
  orbitAngle: number;
  orbitsRemaining: number;
  orbitRadius: number;
  orbitSpeed: number;
  playerId: number;
}

interface RevealZone {
  x: number;
  y: number;
  radius: number;
  timeLeft: number;
  permanent: boolean;
}

interface Battle {
  planetId: number;
  attackUnits: number;
  attackPlayerId: number;
  defendUnits: number;
  defendPlayerId: number;
  startTime: number;
  duration: number; // in seconds
  isBlitz: boolean;
  resolved: boolean;
}

interface ShieldFlicker {
  x: number;       // world x
  y: number;       // world y
  radius: number;  // shield radius (50px from planet)
  life: number;    // frames remaining
  maxLife: number;
}

// Simple planet color palette
const PLANET_PALETTE = ['#6b5b4a', '#7a8a9a', '#c8a050', '#a0c8e0', '#a050c8', '#a03020', '#408040', '#8a7a6a', '#9aacbc', '#b89040'];

// ========== GAME STATE ==========
let planets: Planet[] = [];
let planetMap: Map<number, Planet> = new Map(); // O(1) lookup
let players: Player[] = [];
let attacks: AttackAnimation[] = [];
let turretMissiles: TurretMissile[] = [];
let battles: Battle[] = [];
let shieldFlickers: ShieldFlicker[] = [];
let selectedPlanets: Set<number> = new Set(); // multi-select
let planetSelectTime: Map<number, number> = new Map(); // track when planet was selected for flash effect
let discoveredPlanets: Set<number> = new Set(); // planets whose type/color has been revealed
let hoveredPlanet: number | null = null;
let hoverStartTime: number = 0; // When hover started (for popup animation)
let gameTime = 0;
let lastTime = 0;
let lastSupplyCheck = 0;
let lastAITick = 0;
const AI_TICK_INTERVAL = 2000;

// Game state
let gameState: GameState = GameState.PLAYING;
let gameResult: 'win' | 'lose' | null = null;
let difficulty: Difficulty = Difficulty.MEDIUM;

// Test mode - control multiple players with TAB
let controlledPlayerId = 0;

// Background stars
let stars: Star[] = [];

// Particles
let particles: Particle[] = [];
let clickAnims: ClickAnim[] = [];

// Cached supply connections
let supplyConnections: SupplyConnection[] = [];

// Camera
const camera: Camera = {
  x: 0, y: 0,
  zoom: 1.0, targetZoom: 1.0,
  dragging: false,
  dragStartX: 0, dragStartY: 0,
  dragCamStartX: 0, dragCamStartY: 0
};

// Parallax background offset (only updates on pan, not zoom)
let parallaxOffsetX = 0;
let parallaxOffsetY = 0;

// UI State
let mouseX = 0;
let mouseY = 0;
let sendPercent = 50;
let popupSliderDragging = false;
let actionPopup: ActionPopup | null = null;
let planetMode: 'none' | 'scout' | 'boost' = 'none';
let modePlanetId: number | null = null;
let infoPlanetId: number | null = null; // planet showing info panel
let buildPanelPlanetId: number | null = null; // planet showing build panel
let buildPanelSlot: number | null = null; // slot being chosen (0-2)
let transportPanelOpen: boolean = false; // transport panel state
let transportSourceId: number | null = null; // source planet for transport
let transportTargetId: number | null = null; // target planet for transport

// Rocky planet sprite animation (16 frames)
const ROCKY_FRAME_COUNT = 16;
const ROCKY_FRAME_DURATION = 50; // ms per frame (fast spin to hide frame gaps)
const rockyFrames: HTMLImageElement[] = [];
let rockyFramesLoaded = 0;
for (let i = 1; i <= ROCKY_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `../rockyplanet/ezgif-frame-${String(i).padStart(3, '0')}-removebg-preview.png`;
  img.onload = () => { rockyFramesLoaded++; };
  rockyFrames.push(img);
}

// Mars planet sprite animation (21 frames) - for captured planets
const MARS_FRAME_COUNT = 21;
const MARS_FRAME_DURATION = 50;
const marsFrames: HTMLImageElement[] = [];
let marsFramesLoaded = 0;
for (let i = 1; i <= MARS_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/mars.unit/ezgif-frame-${String(i).padStart(3, '0')}-removebg-preview.png`;
  img.onload = () => { marsFramesLoaded++; };
  marsFrames.push(img);
}

// Ice planet sprite animation (21 frames) - for captured planets
const ICE_FRAME_COUNT = 21;
const ICE_FRAME_DURATION = 50;
const iceFrames: HTMLImageElement[] = [];
let iceFramesLoaded = 0;
for (let i = 1; i <= ICE_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/ice.unit/ezgif-frame-${String(i).padStart(3, '0')}-removebg-preview.png`;
  img.onload = () => { iceFramesLoaded++; };
  iceFrames.push(img);
}

// Mass planet sprite animation (16 frames) - for HOME/starting planet
const MASS_FRAME_COUNT = 16;
const MASS_FRAME_DURATION = 150; // smooth rotation
const massFrames: HTMLImageElement[] = [];
let massFramesLoaded = 0;
for (let i = 1; i <= MASS_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/massplanet/mass-frame-${String(i).padStart(3, '0')}.png`;
  img.onload = () => { massFramesLoaded++; };
  massFrames.push(img);
}

// Spaceship sprites (pod for 1-100 units, fighter for 101-250 units)
const podSprite = new Image();
podSprite.src = '/spaceship/pod.png';
let podSpriteLoaded = false;
podSprite.onload = () => { podSpriteLoaded = true; };

const fighterSprite = new Image();
fighterSprite.src = '/spaceship/fighter.png';
let fighterSpriteLoaded = false;
fighterSprite.onload = () => { fighterSpriteLoaded = true; };

// Space background image
const spaceBackground = new Image();
spaceBackground.src = '/space-bg.png';
let spaceBackgroundLoaded = false;
spaceBackground.onload = () => { spaceBackgroundLoaded = true; };

// Home planet animation frames (120 frames rotation)
const HOME_PLANET_FRAME_COUNT = 120;
const HOME_PLANET_FRAME_DURATION = 100; // ms per frame (fast rotation like moon)
const homePlanetFrames: HTMLImageElement[] = [];
let homePlanetFramesLoaded = 0;
for (let i = 1; i <= HOME_PLANET_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/planet-frames/planet-frame-${String(i).padStart(3, '0')}.png`;
  img.onload = () => { homePlanetFramesLoaded++; };
  homePlanetFrames.push(img);
}

// Medium planet variant 2 (desert02) - 60 frames
const MEDIUM_DESERT_FRAME_COUNT = 60;
const MEDIUM_DESERT_FRAME_DURATION = 100;
const mediumDesertFrames: HTMLImageElement[] = [];
let mediumDesertFramesLoaded = 0;
for (let i = 1; i <= MEDIUM_DESERT_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/desert02/${i}.png`;
  img.onload = () => { mediumDesertFramesLoaded++; };
  mediumDesertFrames.push(img);
}

// Medium planet variant 3 (lava01) - 60 frames
const MEDIUM_LAVA_FRAME_COUNT = 60;
const MEDIUM_LAVA_FRAME_DURATION = 100;
const mediumLavaFrames: HTMLImageElement[] = [];
let mediumLavaFramesLoaded = 0;
for (let i = 1; i <= MEDIUM_LAVA_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/lava01/${i}.png`;
  img.onload = () => { mediumLavaFramesLoaded++; };
  mediumLavaFrames.push(img);
}

// Medium planet variant 4 (lava3) - 60 frames
const MEDIUM_LAVA3_FRAME_COUNT = 60;
const MEDIUM_LAVA3_FRAME_DURATION = 100;
const mediumLava3Frames: HTMLImageElement[] = [];
let mediumLava3FramesLoaded = 0;
for (let i = 1; i <= MEDIUM_LAVA3_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/lava3/${i}.png`;
  img.onload = () => { mediumLava3FramesLoaded++; };
  mediumLava3Frames.push(img);
}

// Medium planet variant 5 (tran02) - 60 frames
const MEDIUM_TRAN02_FRAME_COUNT = 60;
const MEDIUM_TRAN02_FRAME_DURATION = 100;
const mediumTran02Frames: HTMLImageElement[] = [];
let mediumTran02FramesLoaded = 0;
for (let i = 1; i <= MEDIUM_TRAN02_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/tran02/${i}.png`;
  img.onload = () => { mediumTran02FramesLoaded++; };
  mediumTran02Frames.push(img);
}

// Black hole animation frames (40 frames from GIF)
const BLACK_HOLE_FRAME_COUNT = 40;
const BLACK_HOLE_FRAME_DURATION = 80; // ms per frame
const blackHoleFrames: HTMLImageElement[] = [];
let blackHoleFramesLoaded = 0;
for (let i = 1; i <= BLACK_HOLE_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/blackhole-frames/${i}.png`;
  img.onload = () => { blackHoleFramesLoaded++; };
  blackHoleFrames.push(img);
}

// Moon animation frames (60 frames rotation)
const MOON_FRAME_COUNT = 60;
const MOON_FRAME_DURATION = 100; // ms per frame (normal rotation speed)
const moonFrames: HTMLImageElement[] = [];
let moonFramesLoaded = 0;
for (let i = 1; i <= MOON_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/moon-frames/moon-frame-${String(i).padStart(3, '0')}.png`;
  img.onload = () => { moonFramesLoaded++; };
  moonFrames.push(img);
}

// Ice planet animation frames (60 frames) - variant for small planets
const ICE_PLANET_FRAME_COUNT = 60;
const ICE_PLANET_FRAME_DURATION = 100; // ms per frame
const icePlanetFrames: HTMLImageElement[] = [];
let icePlanetFramesLoaded = 0;
for (let i = 1; i <= ICE_PLANET_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/ice/${i}.png`;
  img.onload = () => { icePlanetFramesLoaded++; };
  icePlanetFrames.push(img);
}

// Moon variant 2 (moon04) - 60 frames for small planets
const MOON2_FRAME_COUNT = 60;
const MOON2_FRAME_DURATION = 100; // ms per frame
const moon2Frames: HTMLImageElement[] = [];
let moon2FramesLoaded = 0;
for (let i = 1; i <= MOON2_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/moon04/${i}.png`;
  img.onload = () => { moon2FramesLoaded++; };
  moon2Frames.push(img);
}

// Moon variant 3 (moon03) - 60 frames for small planets
const MOON3_FRAME_COUNT = 60;
const MOON3_FRAME_DURATION = 100; // ms per frame
const moon3Frames: HTMLImageElement[] = [];
let moon3FramesLoaded = 0;
for (let i = 1; i <= MOON3_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/moon03/${i}.png`;
  img.onload = () => { moon3FramesLoaded++; };
  moon3Frames.push(img);
}

// Large planet animation frames (120 frames rotation) - 2 variants for variety
const LARGE_PLANET_FRAME_COUNT = 120;
const LARGE_PLANET_FRAME_DURATION = 100; // ms per frame (fast rotation like moon)
const largePlanetFrames: HTMLImageElement[] = [];
let largePlanetFramesLoaded = 0;
for (let i = 1; i <= LARGE_PLANET_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/large-frames/large-frame-${String(i).padStart(3, '0')}.png`;
  img.onload = () => { largePlanetFramesLoaded++; };
  largePlanetFrames.push(img);
}

// Large planet variant 2 (no clouds)
const largePlanetFrames2: HTMLImageElement[] = [];
let largePlanetFrames2Loaded = 0;
for (let i = 1; i <= LARGE_PLANET_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/large-frames-2/large-frame-${String(i).padStart(3, '0')}.png`;
  img.onload = () => { largePlanetFrames2Loaded++; };
  largePlanetFrames2.push(img);
}

// Large planet variant 3 (with clouds - new)
const largePlanetFrames3: HTMLImageElement[] = [];
let largePlanetFrames3Loaded = 0;
for (let i = 1; i <= LARGE_PLANET_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/large-frames-3/${i}.png`;
  img.onload = () => { largePlanetFrames3Loaded++; };
  largePlanetFrames3.push(img);
}

// Large planet variant 4 (without clouds - new)
const largePlanetFrames4: HTMLImageElement[] = [];
let largePlanetFrames4Loaded = 0;
for (let i = 1; i <= LARGE_PLANET_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/large-frames-4/${i}.png`;
  img.onload = () => { largePlanetFrames4Loaded++; };
  largePlanetFrames4.push(img);
}

// Large planet variant 5 (desert01) - 60 frames
const DESERT_PLANET_FRAME_COUNT = 60;
const largePlanetFrames5: HTMLImageElement[] = [];
let largePlanetFrames5Loaded = 0;
for (let i = 1; i <= DESERT_PLANET_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/desert01/${i}.png`;
  img.onload = () => { largePlanetFrames5Loaded++; };
  largePlanetFrames5.push(img);
}

// Giant planet animation frames (60 frames) - 2 variants
const GIANT_PLANET_FRAME_COUNT = 60;
const GIANT_PLANET_FRAME_DURATION = 100; // ms per frame
const giantPlanetFrames: HTMLImageElement[] = [];
let giantPlanetFramesLoaded = 0;
for (let i = 1; i <= GIANT_PLANET_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/gigant1/${i}.png`;
  img.onload = () => { giantPlanetFramesLoaded++; };
  giantPlanetFrames.push(img);
}

// Giant planet variant 2
const giantPlanetFrames2: HTMLImageElement[] = [];
let giantPlanetFrames2Loaded = 0;
for (let i = 1; i <= GIANT_PLANET_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/giga02/${i}.png`;
  img.onload = () => { giantPlanetFrames2Loaded++; };
  giantPlanetFrames2.push(img);
}

// Giant planet variant 3
const giantPlanetFrames3: HTMLImageElement[] = [];
let giantPlanetFrames3Loaded = 0;
for (let i = 1; i <= GIANT_PLANET_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/giga03/${i}.png`;
  img.onload = () => { giantPlanetFrames3Loaded++; };
  giantPlanetFrames3.push(img);
}

// Giant planet variant 4
const giantPlanetFrames4: HTMLImageElement[] = [];
let giantPlanetFrames4Loaded = 0;
for (let i = 1; i <= GIANT_PLANET_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/giga04/${i}.png`;
  img.onload = () => { giantPlanetFrames4Loaded++; };
  giantPlanetFrames4.push(img);
}

// Sun animation frames (30 frames)
const SUN_FRAME_COUNT = 30;
const SUN_FRAME_DURATION = 100; // ms per frame (normal speed animation)
const sunFrames: HTMLImageElement[] = [];
let sunFramesLoaded = 0;
for (let i = 1; i <= SUN_FRAME_COUNT; i++) {
  const img = new Image();
  img.src = `/sun-frames/sun-frame-${String(i).padStart(3, '0')}.png`;
  img.onload = () => { sunFramesLoaded++; };
  sunFrames.push(img);
}

// Parallax background layers (3 layers for depth effect)
const bgLayer1 = new Image(); // Farthest (slowest)
const bgLayer2 = new Image(); // Middle
const bgLayer3 = new Image(); // Closest (fastest)
bgLayer1.src = '/bg-layer1.png';
bgLayer2.src = '/bg-layer2.png';
bgLayer3.src = '/bg-layer3.png';
let bgLayersLoaded = 0;
bgLayer1.onload = () => { bgLayersLoaded++; };
bgLayer2.onload = () => { bgLayersLoaded++; };
bgLayer3.onload = () => { bgLayersLoaded++; };

// Animated background stars (blue and yellow)
const ANIM_STAR_FRAME_COUNT = 8;
const ANIM_STAR_FRAME_DURATION = 150; // ms per frame
const blueStarFrames: HTMLImageElement[] = [];
const yellowStarFrames: HTMLImageElement[] = [];
let blueStarFramesLoaded = 0;
let yellowStarFramesLoaded = 0;
for (let i = 1; i <= ANIM_STAR_FRAME_COUNT; i++) {
  const blueImg = new Image();
  blueImg.src = `/blue-star/star${i}.png`;
  blueImg.onload = () => { blueStarFramesLoaded++; };
  blueStarFrames.push(blueImg);

  const yellowImg = new Image();
  yellowImg.src = `/yellow-star/star${i}.png`;
  yellowImg.onload = () => { yellowStarFramesLoaded++; };
  yellowStarFrames.push(yellowImg);
}

// Animated star positions (generated once)
interface AnimStar {
  x: number;
  y: number;
  type: 'blue' | 'yellow';
  offset: number; // animation offset for variety
  scale: number;
}
let animStars: AnimStar[] = [];

// Animated comets (blue and yellow) - change position every 2 min
const COMET_FRAME_COUNT = 8;
const COMET_FRAME_DURATION = 100; // ms per frame
const COMET_REPOSITION_INTERVAL = 10000; // 10 seconds
const blueCometFrames: HTMLImageElement[] = [];
const yellowCometFrames: HTMLImageElement[] = [];
let blueCometFramesLoaded = 0;
let yellowCometFramesLoaded = 0;
for (let i = 1; i <= COMET_FRAME_COUNT; i++) {
  const blueImg = new Image();
  blueImg.src = `/blue-comet/star${i}.png`;
  blueImg.onload = () => { blueCometFramesLoaded++; };
  blueCometFrames.push(blueImg);

  const yellowImg = new Image();
  yellowImg.src = `/yellow-comet/star${i}.png`;
  yellowImg.onload = () => { yellowCometFramesLoaded++; };
  yellowCometFrames.push(yellowImg);
}

// Comet positions (change every 2 min)
interface Comet {
  x: number;
  y: number;
  type: 'blue' | 'yellow';
  lastReposition: number; // timestamp of last position change
  offset: number; // animation offset
  scale: number;
}
let comets: Comet[] = [];

// Fog of war offscreen canvas
let fogCanvas: HTMLCanvasElement | null = null;
let fogCtx: CanvasRenderingContext2D | null = null;

// Probes & reveal zones
let probes: Probe[] = [];
let orbitProbes: OrbitProbe[] = [];
let revealZones: RevealZone[] = [];
const PROBE_SPEED = 350;       // px/sec
const PROBE_REVEAL_RADIUS = 200; // radius of each reveal circle
const ORBIT_PROBE_SPEED = 1.5; // radians per second
const PROBE_REVEAL_DURATION = 60000; // 1 min
const PROBE_DROP_INTERVAL = 80; // drop reveal zone every 80px
const PROBE_UNIT_COST_PER_100PX = 5; // 5 units per 100px distance

// Abilities
let abilities: Ability[] = [
  { id: 'blitz', name: 'BLITZ', lastUsed: -99999, cooldown: ABILITY_COOLDOWNS.blitz },
  { id: 'shield', name: 'SHIELD', lastUsed: -99999, cooldown: ABILITY_COOLDOWNS.shield },
  { id: 'nuke', name: 'NUKE', lastUsed: -99999, cooldown: ABILITY_COOLDOWNS.nuke }
];

// Explore drag state
let exploreDragging = false;
let explorePlanetId: number | null = null;
let exploreStartX = 0;
let exploreStartY = 0;
let activeAbility: string | null = null; // currently activated ability waiting for target

// Player colors
const PLAYER_COLORS = [
  { color: '#4488ff', dark: '#2255aa' },
  { color: '#ff4444', dark: '#aa2222' },
  { color: '#44cc44', dark: '#228822' },
  { color: '#ffaa00', dark: '#aa7700' },
  { color: '#cc44cc', dark: '#882288' },
];

// ========== HELPERS ==========
function getPlanetProperties(size: PlanetSize): { minR: number; maxR: number; maxUnits: number; defense: number; growth: number } {
  switch (size) {
    case PlanetSize.ASTEROID:
      return { minR: 12, maxR: 18, maxUnits: 100, defense: 0.8, growth: 0.5 };
    case PlanetSize.TINY:
      return { minR: 16, maxR: 20, maxUnits: 120, defense: 0.9, growth: 0.6 };
    case PlanetSize.SMALL:
      return { minR: 22, maxR: 30, maxUnits: 200, defense: 1.0, growth: 1.0 };
    case PlanetSize.MEDIUM:
      return { minR: 35, maxR: 50, maxUnits: 400, defense: 1.5, growth: 1.5 };
    case PlanetSize.LARGE:
      return { minR: 55, maxR: 75, maxUnits: 700, defense: 2.0, growth: 2.0 };
    case PlanetSize.GIANT:
      return { minR: 80, maxR: 100, maxUnits: 1200, defense: 3.0, growth: 2.5 };
    case PlanetSize.MEGA:
      return { minR: 110, maxR: 140, maxUnits: 2000, defense: 4.0, growth: 3.0 };
    case PlanetSize.TITAN:
      return { minR: 150, maxR: 190, maxUnits: 3500, defense: 5.0, growth: 4.0 };
    case PlanetSize.COLOSSUS:
      return { minR: 200, maxR: 250, maxUnits: 5000, defense: 6.0, growth: 5.0 };
  }
}

function getDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function getVisionRange(planet: Planet): number {
  return FOG_VISION_BY_SIZE[planet.size] || 450;
}

function isVisibleToPlayer(planet: Planet): boolean {
  // Both players' planets are always visible (both are user-controlled)
  if (planet.ownerId === 0 || planet.ownerId === 1) return true;
  // Check if any player planet is within its vision range
  for (const p of planets) {
    if (p.ownerId === 0 || p.ownerId === 1) {
      if (getDistance(p, planet) <= getVisionRange(p)) return true;
    }
  }
  // Check reveal zones
  for (const zone of revealZones) {
    if (getDistance(zone, planet) <= zone.radius) return true;
  }
  return false;
}

function spawnParticles(x: number, y: number, color: string, count: number, speed: number): void {
  // Reduce particle count on mobile for better performance
  const actualCount = isMobile ? Math.ceil(count * 0.5) : count;
  for (let i = 0; i < actualCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = speed * (0.5 + Math.random() * 0.5);
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: 1.0,
      maxLife: 0.6 + Math.random() * 0.4,
      color,
      size: 2 + Math.random() * 3
    });
  }
}

function getLabCount(): number {
  // LAB building was replaced with DRONE (different bonuses)
  // DRONE provides +20% damage and anti-missile defense, not cooldown reduction
  // Returning 0 to disable the old lab cooldown bonus
  return 0;
}

function getAbilityCooldownRemaining(ability: Ability): number {
  const labBonus = 1 - getLabCount() * 0.15; // 15% reduction per lab
  const effectiveCooldown = ability.cooldown * Math.max(0.4, labBonus);
  const elapsed = gameTime - ability.lastUsed;
  return Math.max(0, effectiveCooldown - elapsed);
}

function isAbilityReady(ability: Ability): boolean {
  return getAbilityCooldownRemaining(ability) <= 0;
}

// ========== INITIALIZATION ==========
function generateStars(): void {
  stars = [];
  // Reduce star count on mobile for better performance
  const starCount = isMobile ? 200 : 500;
  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: Math.random() * WORLD_SIZE,
      y: Math.random() * WORLD_SIZE,
      brightness: Math.random() * 0.6 + 0.2,
      size: Math.random() < 0.1 ? 2 : 1
    });
  }

  // Generate animated stars (100 total - 50 blue, 50 yellow)
  animStars = [];
  for (let i = 0; i < 100; i++) {
    animStars.push({
      x: Math.random() * WORLD_SIZE,
      y: Math.random() * WORLD_SIZE,
      type: i < 50 ? 'blue' : 'yellow',
      offset: Math.random() * 1000, // random animation offset
      scale: 0.8 + Math.random() * 0.6 // random size 0.8-1.4
    });
  }

  // Generate comets (50 total - 25 blue, 25 yellow)
  // Each comet repositions every 2 minutes
  comets = [];
  const now = performance.now();
  for (let i = 0; i < 50; i++) {
    comets.push({
      x: Math.random() * WORLD_SIZE,
      y: Math.random() * WORLD_SIZE,
      type: i < 25 ? 'blue' : 'yellow',
      lastReposition: now - Math.random() * COMET_REPOSITION_INTERVAL, // stagger repositions
      offset: Math.random() * 1000,
      scale: 1.0 + Math.random() * 0.5
    });
  }
}

function generatePlanets(): void {
  planets = [];
  planetMap.clear();
  let id = 0;

  const sizeDistribution: { size: PlanetSize; count: number }[] = [
    { size: PlanetSize.ASTEROID, count: 250 },
    { size: PlanetSize.TINY, count: 150 },
    { size: PlanetSize.SMALL, count: 200 },
    { size: PlanetSize.MEDIUM, count: 150 },
    { size: PlanetSize.LARGE, count: 70 },
    { size: PlanetSize.GIANT, count: 30 },
    { size: PlanetSize.MEGA, count: 30 },
    { size: PlanetSize.TITAN, count: 15 },
    { size: PlanetSize.COLOSSUS, count: 5 },
  ];

  for (const { size, count } of sizeDistribution) {
    for (let i = 0; i < count; i++) {
      const props = getPlanetProperties(size);
      const radius = props.minR + Math.random() * (props.maxR - props.minR);

      let x = 0, y = 0;
      let valid = false;
      let attempts = 0;

      while (!valid && attempts < 100) {
        x = radius + Math.random() * (WORLD_SIZE - radius * 2);
        y = radius + Math.random() * (WORLD_SIZE - radius * 2);

        valid = true;
        // Check sun distance
        const sunDist = Math.sqrt((x - SUN_X) ** 2 + (y - SUN_Y) ** 2);
        if (sunDist < SUN_NO_SPAWN_RADIUS + radius) {
          valid = false;
          attempts++;
          continue;
        }
        for (const p of planets) {
          const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
          if (dist < p.radius + radius + MIN_PLANET_DISTANCE) {
            valid = false;
            break;
          }
        }
        attempts++;
      }

      if (!valid) continue;

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

      let startingUnits: number;
      switch (size) {
        case PlanetSize.ASTEROID: startingUnits = Math.floor(Math.random() * 30) + 10; break;
        case PlanetSize.TINY: startingUnits = Math.floor(Math.random() * 40) + 15; break;
        case PlanetSize.SMALL: startingUnits = Math.floor(Math.random() * 80) + 30; break;
        case PlanetSize.MEDIUM: startingUnits = Math.floor(Math.random() * 150) + 80; break;
        case PlanetSize.LARGE: startingUnits = Math.floor(Math.random() * 300) + 150; break;
        case PlanetSize.GIANT: startingUnits = Math.floor(Math.random() * 500) + 300; break;
        case PlanetSize.MEGA: startingUnits = Math.floor(Math.random() * 800) + 500; break;
        case PlanetSize.TITAN: startingUnits = Math.floor(Math.random() * 1200) + 800; break;
        case PlanetSize.COLOSSUS: startingUnits = Math.floor(Math.random() * 1500) + 1200; break;
      }

      // Random color from palette
      const planetColor = PLANET_PALETTE[Math.floor(Math.random() * PLANET_PALETTE.length)];

      // Generate random deposit types (1-5 per planet, bigger planets get more) - start with 0, must mine
      const allDepositTypes: DepositType[] = ['carbon', 'water', 'gas', 'metal', 'crystal'];
      const maxDeposits = size === PlanetSize.COLOSSUS ? 5 : size === PlanetSize.TITAN ? 5 : size === PlanetSize.MEGA ? 5 : size === PlanetSize.GIANT ? 4 : size === PlanetSize.LARGE ? 3 : size === PlanetSize.MEDIUM ? 2 : 1;
      const numDeposits = Math.max(1, Math.floor(Math.random() * maxDeposits) + 1);
      const shuffled = [...allDepositTypes].sort(() => Math.random() - 0.5);
      const deposits: ResourceDeposit[] = shuffled.slice(0, numDeposits).map(type => ({
        type,
        amount: 0 // start with 0, resources are gained by mining
      }));

      const planet: Planet = {
        id: id++,
        x, y, radius, size,
        ownerId: -1,
        units: startingUnits,
        maxUnits: props.maxUnits,
        defense: props.defense,
        growthRate: props.growth,
        stability: 50,
        connected: false,
        generating: false,
        deposits,
        color: planetColor,
        craters,
        pulsePhase: Math.random() * Math.PI * 2,
        shieldTimer: 0,
        hasShield: false,
        spriteType: null,
        buildings: [null, null, null],
        nextMineTime: 5000 + Math.random() * 5000 // first mine in 5-10 sec
      };
      planets.push(planet);
      planetMap.set(planet.id, planet);
    }
  }

  // Add Sun as a planet (1M units, center of map)
  const sunPlanet: Planet = {
    id: id++,
    x: SUN_X, y: SUN_Y,
    radius: SUN_RADIUS,
    size: PlanetSize.GIANT,
    ownerId: -1,
    units: 1000000,
    maxUnits: 1000000,
    defense: 100,
    growthRate: 0,
    stability: 100,
    connected: true,
    generating: false,
    deposits: [],
    color: '#ffd040',
    craters: [],
    pulsePhase: 0,
    shieldTimer: 0,
    hasShield: false,
    spriteType: null,
    buildings: [null, null, null],
    nextMineTime: 0
  };
  planets.push(sunPlanet);
  planetMap.set(sunPlanet.id, sunPlanet);

  // Add moons to LARGE, GIANT, MEGA, TITAN, and COLOSSUS planets (not the sun)
  // LARGE: asteroid, GIANT: small, MEGA: small, TITAN: medium, COLOSSUS: 2x medium
  const mainPlanets = [...planets];
  for (const parent of mainPlanets) {
    if (parent.radius === SUN_RADIUS) continue;

    let moonCount = 0;
    let moonSize: PlanetSize = PlanetSize.ASTEROID;

    if (parent.size === PlanetSize.LARGE) {
      moonCount = 1;
      moonSize = PlanetSize.ASTEROID;
    } else if (parent.size === PlanetSize.GIANT) {
      moonCount = 1;
      moonSize = PlanetSize.SMALL;
    } else if (parent.size === PlanetSize.MEGA) {
      moonCount = 1;
      moonSize = PlanetSize.SMALL;
    } else if (parent.size === PlanetSize.TITAN) {
      moonCount = 1;
      moonSize = PlanetSize.MEDIUM;
    } else if (parent.size === PlanetSize.COLOSSUS) {
      moonCount = 2;
      moonSize = PlanetSize.MEDIUM;
    }

    for (let m = 0; m < moonCount; m++) {
      const moonProps = getPlanetProperties(moonSize);
      const moonRadius = moonProps.minR + Math.random() * (moonProps.maxR - moonProps.minR);
      const moonOrbitRadius = parent.radius + moonRadius + 70 + Math.random() * 30 + m * 50;
      const moonAngle = Math.random() * Math.PI * 2 + m * Math.PI; // spread moons apart
      const moonX = parent.x + Math.cos(moonAngle) * moonOrbitRadius;
      const moonY = parent.y + Math.sin(moonAngle) * moonOrbitRadius;

      // Moon deposits based on size
      const allDepositTypes: DepositType[] = ['carbon', 'water', 'gas', 'metal', 'crystal'];
      const numDeposits = moonSize === PlanetSize.MEDIUM ? 2 : moonSize === PlanetSize.SMALL ? 1 : 1;
      const shuffled = [...allDepositTypes].sort(() => Math.random() - 0.5);
      const moonDeposits: ResourceDeposit[] = shuffled.slice(0, numDeposits).map(type => ({ type, amount: 0 }));

      // Starting units based on moon size
      let moonUnits = 50;
      if (moonSize === PlanetSize.SMALL) moonUnits = Math.floor(Math.random() * 80) + 30;
      else if (moonSize === PlanetSize.MEDIUM) moonUnits = Math.floor(Math.random() * 150) + 80;

      const moonColor = PLANET_PALETTE[Math.floor(Math.random() * PLANET_PALETTE.length)];

      const moon: Planet = {
        id: id++,
        x: moonX, y: moonY,
        radius: moonRadius,
        size: moonSize,
        ownerId: -1,
        units: moonUnits,
        maxUnits: moonProps.maxUnits,
        defense: moonProps.defense,
        growthRate: moonProps.growth,
        stability: 50,
        connected: false,
        generating: false,
        deposits: moonDeposits,
        color: moonColor,
        craters: [
          { x: Math.random() * 4 - 2, y: Math.random() * 4 - 2, r: 2 + moonRadius * 0.05 },
          { x: Math.random() * 4 - 2, y: Math.random() * 4 - 2, r: 1.5 + moonRadius * 0.03 }
        ],
        isMoon: true,
        parentId: parent.id,
        orbitAngle: moonAngle,
        orbitRadius: moonOrbitRadius,
        orbitSpeed: 0.05 + Math.random() * 0.05,
        pulsePhase: Math.random() * Math.PI * 2,
        shieldTimer: 0,
        hasShield: false,
        spriteType: null,
        buildings: [null, null, null],
        nextMineTime: 5000 + Math.random() * 5000
      };
      planets.push(moon);
      planetMap.set(moon.id, moon);
    }
  }
}

function initPlayers(): void {
  players = [];
  const settings = DIFFICULTY_SETTINGS[difficulty];

  // Two players starting close to each other in the center
  const centerX = WORLD_SIZE * 0.5;
  const centerY = WORLD_SIZE * 0.5;
  const startPositions = [
    { x: centerX - 200, y: centerY },  // Player 0 (blue) - left
    { x: centerX + 200, y: centerY },  // Player 1 (red) - right
  ];

  const usedPlanets = new Set<number>();

  for (let i = 0; i < 2; i++) {  // Only 2 players
    let bestPlanet: Planet | null = null;
    let bestDist = Infinity;

    // Start on SMALL planets instead of asteroids
    for (const p of planets) {
      if (usedPlanets.has(p.id)) continue;
      if (p.size !== PlanetSize.SMALL) continue;
      if (p.isMoon) continue;

      const dist = Math.sqrt((p.x - startPositions[i].x) ** 2 + (p.y - startPositions[i].y) ** 2);
      if (dist < bestDist) {
        bestDist = dist;
        bestPlanet = p;
      }
    }

    if (!bestPlanet) {
      // Fallback: any small/medium
      for (const p of planets) {
        if (usedPlanets.has(p.id)) continue;
        if (p.size === PlanetSize.SMALL || p.size === PlanetSize.MEDIUM) {
          bestPlanet = p;
          break;
        }
      }
    }

    if (!bestPlanet) continue;

    usedPlanets.add(bestPlanet.id);
    bestPlanet.ownerId = i;
    bestPlanet.units = settings.startUnits;
    bestPlanet.stability = STABILITY_MAX;
    bestPlanet.connected = true;
    bestPlanet.generating = true;

    // Both players get full starting setup
    bestPlanet.color = i === 0 ? '#6b5b4a' : '#5a4a3a'; // rocky colors
    bestPlanet.radius += 10; // bigger starting planet
    bestPlanet.deposits = [
      { type: 'carbon', amount: 100 },
      { type: 'water', amount: 100 },
      { type: 'gas', amount: 100 },
      { type: 'metal', amount: 100 },
      { type: 'crystal', amount: 100 }
    ];

    // Spawn a LARGE planet nearby with an orbiting asteroid
    const largeProps = getPlanetProperties(PlanetSize.LARGE);
    const largeRadius = largeProps.minR + Math.random() * (largeProps.maxR - largeProps.minR);

    // Find valid position for large planet (no overlap with existing planets)
    let largeX = 0, largeY = 0;
    let validLarge = false;
    for (let attempt = 0; attempt < 50 && !validLarge; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 250 + Math.random() * 100; // 250-350 px away
      largeX = bestPlanet.x + Math.cos(angle) * distance;
      largeY = bestPlanet.y + Math.sin(angle) * distance;

      validLarge = true;
      for (const p of planets) {
        const dist = Math.sqrt((largeX - p.x) ** 2 + (largeY - p.y) ** 2);
        if (dist < p.radius + largeRadius + 50) {
          validLarge = false;
          break;
        }
      }
    }
    if (!validLarge) continue; // skip if can't find valid position
    const largeDeposits: ResourceDeposit[] = ['metal', 'crystal', 'gas'].map(type => ({
      type: type as DepositType,
      amount: 0
    }));
    const largePlanet: Planet = {
      id: planets.length + 1000 + i * 10,
      x: largeX, y: largeY,
      radius: largeRadius,
      size: PlanetSize.LARGE,
      ownerId: -1,
      units: Math.floor(Math.random() * 300) + 150,
      maxUnits: largeProps.maxUnits,
      defense: largeProps.defense,
      growthRate: largeProps.growth,
      stability: 50,
      connected: false,
      generating: false,
      deposits: largeDeposits,
      color: PLANET_PALETTE[Math.floor(Math.random() * PLANET_PALETTE.length)],
      craters: [],
      pulsePhase: Math.random() * Math.PI * 2,
      shieldTimer: 0,
      hasShield: false,
      spriteType: null,
      buildings: [null, null, null],
      nextMineTime: 10000 + Math.random() * 10000
    };
    planets.push(largePlanet);
    planetMap.set(largePlanet.id, largePlanet);

    // Add orbiting asteroid to the LARGE planet
    const moonRadius = 10 + Math.random() * 4;
    const moonOrbitRadius = largeRadius + 80 + Math.random() * 20;

    // Find valid position for moon (no overlap)
    let moonX = 0, moonY = 0, moonAngle = 0;
    let validMoon = false;
    for (let attempt = 0; attempt < 20 && !validMoon; attempt++) {
      moonAngle = Math.random() * Math.PI * 2;
      moonX = largeX + Math.cos(moonAngle) * moonOrbitRadius;
      moonY = largeY + Math.sin(moonAngle) * moonOrbitRadius;

      validMoon = true;
      for (const p of planets) {
        if (p.id === largePlanet.id) continue; // skip parent
        const dist = Math.sqrt((moonX - p.x) ** 2 + (moonY - p.y) ** 2);
        if (dist < p.radius + moonRadius + 50) {
          validMoon = false;
          break;
        }
      }
    }

    const moonDepositType: DepositType = (['carbon', 'water', 'gas', 'metal', 'crystal'] as DepositType[])[Math.floor(Math.random() * 5)];
    const asteroidMoon: Planet = {
      id: planets.length + 1001 + i * 10,
      x: moonX, y: moonY,
      radius: moonRadius,
      size: PlanetSize.ASTEROID,
      ownerId: -1,
      units: Math.floor(Math.random() * 30) + 10,
      maxUnits: 100,
      defense: 0.8,
      growthRate: 0.5,
      stability: 50,
      connected: false,
      generating: false,
      deposits: [{ type: moonDepositType, amount: 0 }],
      color: '#aaa8a0',
      craters: [
        { x: Math.random() * 4 - 2, y: Math.random() * 4 - 2, r: 2 },
        { x: Math.random() * 4 - 2, y: Math.random() * 4 - 2, r: 1.5 }
      ],
      isMoon: true,
      parentId: largePlanet.id,
      orbitAngle: moonAngle,
      orbitRadius: moonOrbitRadius,
      orbitSpeed: 0.08 + Math.random() * 0.07,
      pulsePhase: Math.random() * Math.PI * 2,
      shieldTimer: 0,
      hasShield: false,
      spriteType: null,
      buildings: [null, null, null],
      nextMineTime: 60000
    };
    planets.push(asteroidMoon);
    planetMap.set(asteroidMoon.id, asteroidMoon);

    // Both players controlled by user (not AI)
    const playerNames = ['Blue', 'Red'];
    players.push({
      id: i,
      name: playerNames[i],
      color: PLAYER_COLORS[i].color,
      colorDark: PLAYER_COLORS[i].dark,
      planetCount: 1,
      totalUnits: settings.startUnits,
      homeId: bestPlanet.id,
      alive: true,
      isAI: false  // Both players are user-controlled
    });
  }

  // Add black hole near player 0's starting planet
  if (players.length > 0) {
    const home = planetMap.get(players[0].homeId);
    if (home) {
      // Place black hole at a random direction from home planet
      const bhAngle = Math.random() * Math.PI * 2;
      const bhDistance = 400 + Math.random() * 200; // 400-600 units away
      const bhX = home.x + Math.cos(bhAngle) * bhDistance;
      const bhY = home.y + Math.sin(bhAngle) * bhDistance;
      const bhRadius = 80; // Black hole radius

      const blackHole: Planet = {
        id: planets.length + 9000, // unique id for black hole
        x: bhX,
        y: bhY,
        radius: bhRadius,
        size: PlanetSize.GIANT, // Treat as giant for gameplay
        ownerId: -1, // Neutral
        units: 10000,
        maxUnits: 15000,
        defense: 5.0,
        growthRate: 0, // Black holes don't grow
        stability: STABILITY_MAX,
        connected: false,
        generating: false,
        deposits: [
          { type: 'crystal', amount: 0 },
          { type: 'gas', amount: 0 },
          { type: 'metal', amount: 0 }
        ],
        color: '#1a0a2e',
        craters: [],
        pulsePhase: Math.random() * Math.PI * 2,
        shieldTimer: 0,
        hasShield: false,
        spriteType: null,
        buildings: [null, null, null],
        nextMineTime: 60000,
        isBlackHole: true
      };
      planets.push(blackHole);
      planetMap.set(blackHole.id, blackHole);
      discoveredPlanets.add(blackHole.id); // Make it visible from start
    }
  }

  // Center camera on player's home
  if (players.length > 0) {
    const home = planetMap.get(players[0].homeId);
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
  particles = [];
  attacks = [];
  turretMissiles = [];
  battles = [];
  shieldFlickers = [];
  probes = [];
  orbitProbes = [];
  revealZones = [];
  selectedPlanets.clear();
  discoveredPlanets.clear();
  actionPopup = null;
  infoPlanetId = null;
  buildPanelPlanetId = null;
  buildPanelSlot = null;
  transportPanelOpen = false;
  transportSourceId = null;
  transportTargetId = null;
  activeAbility = null;
  gameState = GameState.PLAYING;
  gameResult = null;
  gameTime = 0;
  lastSupplyCheck = 0;
  lastAITick = 0;
  abilities.forEach(a => a.lastUsed = -99999);

  // Add permanent reveal zone around both players' starting positions
  for (const player of players) {
    const home = planetMap.get(player.homeId);
    if (home) {
      revealZones.push({
        x: home.x,
        y: home.y,
        radius: 1500,
        timeLeft: 0,
        permanent: true
      });
    }
  }

  // Auto-discover both players' planets and sun (all are user-controlled)
  for (const p of planets) {
    if (p.ownerId === 0 || p.ownerId === 1) discoveredPlanets.add(p.id);
    if (p.x === SUN_X && p.y === SUN_Y && p.radius === SUN_RADIUS) discoveredPlanets.add(p.id);
  }

  console.log('⚔️ UNITS Space initialized -', planets.length, 'planets');
}

// ========== SUPPLY / CONNECTIVITY ==========
function recalculateSupply(): void {
  for (const p of planets) {
    p.connected = false;
  }
  supplyConnections = [];

  for (const player of players) {
    if (!player.alive) continue;

    const home = planetMap.get(player.homeId);
    if (!home || home.ownerId !== player.id) {
      player.alive = false;
      continue;
    }

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
          // Cache this connection for rendering
          supplyConnections.push({ fromId: current.id, toId: p.id, playerId: player.id });
        }
      }
    }
  }
}

// Get all connected planets in a player's network (for ALL IN attack)
function getConnectedPlanets(playerId: number): Planet[] {
  const connected: Planet[] = [];
  for (const planet of planets) {
    if (planet.ownerId === playerId && planet.connected) {
      connected.push(planet);
    }
  }
  return connected;
}

// ========== STABILITY ==========
function updateStability(dt: number): void {
  for (const planet of planets) {
    if (planet.ownerId === -1) continue;

    const player = players[planet.ownerId];
    if (!player || !player.alive) continue;

    let targetStability = STABILITY_MAX;

    if (player.totalUnits >= EMPIRE_DEGRADE_UNIT_THRESHOLD) {
      const home = planetMap.get(player.homeId);
      if (home) {
        const dist = getDistance(planet, home);
        targetStability -= (dist / 200) * 3;
      }

      if (!planet.connected) {
        targetStability = Math.min(targetStability, 20);
      }

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
      if (prevOwner !== -1) enforceGeneratorSlots(prevOwner);
    }
  }
}

// ========== GENERATOR SLOTS ==========
function getMaxGenerators(planetCount: number): number {
  if (planetCount <= 5) return planetCount;
  return 5 + Math.floor((planetCount - 5) / 5);
}

function getActiveGeneratorCount(playerId: number): number {
  let count = 0;
  for (const p of planets) {
    if (p.ownerId === playerId && p.generating) count++;
  }
  return count;
}

function enforceGeneratorSlots(playerId: number): void {
  const owned = planets.filter(p => p.ownerId === playerId);
  const maxGen = getMaxGenerators(owned.length);
  let activeCount = owned.filter(p => p.generating).length;

  // If too many generators active, deactivate excess (smallest first)
  if (activeCount > maxGen) {
    const generators = owned.filter(p => p.generating).sort((a, b) => a.radius - b.radius);
    for (let i = 0; i < generators.length && activeCount > maxGen; i++) {
      generators[i].generating = false;
      activeCount--;
    }
  }
}

function isPlanetInBattle(planetId: number): boolean {
  return battles.some(b => b.planetId === planetId);
}

// ========== UNITS GROWTH ==========
function updateGrowth(dt: number): void {
  const settings = DIFFICULTY_SETTINGS[difficulty];

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
  }

  for (const planet of planets) {
    if (planet.ownerId === -1) continue;

    const player = players[planet.ownerId];
    if (!player || !player.alive) continue;

    // Only generating planets grow units
    if (!planet.generating) continue;
    // No growth during active battle
    if (isPlanetInBattle(planet.id)) continue;

    let growth = settings.growthRate * planet.growthRate;

    if (player.totalUnits >= EMPIRE_DEGRADE_UNIT_THRESHOLD) {
      if (planet.stability < 30) {
        growth = -1;
      } else if (planet.stability < 70) {
        growth *= 0.3;
      }

      if (player.planetCount > EMPIRE_SLOW_THRESHOLD) {
        const excess = player.planetCount - EMPIRE_SLOW_THRESHOLD;
        growth *= Math.max(0.1, 1.0 - excess * EMPIRE_GROWTH_PENALTY);
      }

      if (player.planetCount > EMPIRE_DECAY_THRESHOLD) {
        growth -= 0.5;
      }

      if (!planet.connected) {
        growth = Math.min(growth, -0.5);
      }
    }

    planet.units = Math.max(0, Math.min(planet.maxUnits, planet.units + growth * dt));

    if (planet.units <= 0) {
      planet.ownerId = -1;
      planet.units = 0;
      planet.generating = false;
    }
  }
}

// ========== ATTACK ==========
function launchAttack(fromId: number, toId: number, blitz: boolean = false): void {
  const from = planetMap.get(fromId);
  const to = planetMap.get(toId);
  if (!from || !to) return;
  if (from.ownerId === -1) return;
  if (from.units < 2) return;

  const percent = from.ownerId === controlledPlayerId ? sendPercent : 50;
  const unitsToSend = Math.floor(from.units * (percent / 100));
  if (unitsToSend < 1) return;
  from.units -= unitsToSend;

  const dist = getDistance(from, to);
  const speed = ATTACK_BASE_SPEED;
  const travelTime = dist / speed;

  // Calculate initial angle towards target
  const initialAngle = Math.atan2(to.y - from.y, to.x - from.x);

  // Count drone buildings on the planet (for stacking hit chance)
  const droneCount = from.buildings.filter(b => b && b.type === 'drone').length;

  attacks.push({
    fromId, toId,
    units: unitsToSend,
    startUnits: unitsToSend,
    playerId: from.ownerId,
    progress: 0,
    speed: 1.0 / travelTime,
    isBlitz: blitz,
    lastDegradeUnits: unitsToSend,
    // Homing missile fields
    x: from.x,
    y: from.y,
    startX: from.x,
    startY: from.y,
    angle: initialAngle,
    traveledDist: 0,
    droneCount: droneCount
  });

  // Discover target planet when player attacks it
  if (from.ownerId === controlledPlayerId) {
    discoveredPlanets.add(toId);
  }
}

// Calculate units arriving after distance penalty
function calculateArrivingUnits(sentUnits: number, distance: number): number {
  if (distance <= DISTANCE_NO_PENALTY) {
    return sentUnits; // no penalty
  }
  const extraDistance = distance - DISTANCE_NO_PENALTY;
  const unitsLost = Math.floor(extraDistance / 30) * DISTANCE_PENALTY_PER_30PX;
  return Math.max(0, sentUnits - unitsLost);
}

function resolveAttack(attack: AttackAnimation): void {
  const to = planetMap.get(attack.toId);
  const from = planetMap.get(attack.fromId);
  if (!to || !from) return;

  // Units already degraded during travel - use current count
  let arrivingUnits = attack.units;

  // Drone bonus: +20% damage (if has at least 1 drone)
  if (attack.droneCount > 0) {
    arrivingUnits = Math.floor(arrivingUnits * 1.2);
  }

  const toScreen = worldToScreen(to.x, to.y);

  if (to.ownerId === attack.playerId) {
    // Reinforce - instant, no battle
    to.units = Math.min(to.maxUnits, to.units + arrivingUnits);
    spawnParticles(toScreen.x, toScreen.y, players[attack.playerId]?.color || '#fff', 6, 80);
  } else {
    // Shield collision is handled in updateAttacks() at 50px from planet

    // Check if there's already an ongoing battle at this planet from same attacker
    const existingBattle = battles.find(b =>
      b.planetId === to.id &&
      b.attackPlayerId === attack.playerId &&
      !b.resolved
    );

    if (existingBattle) {
      // JOIN existing battle - add units to the attack
      existingBattle.attackUnits += arrivingUnits;
      // Extend duration slightly for the reinforcements
      existingBattle.duration = Math.min(4.0, existingBattle.duration + 0.5);
      // Show reinforcement particles
      spawnParticles(toScreen.x, toScreen.y, players[attack.playerId]?.color || '#fff', 8, 60);
    } else {
      // Start a NEW battle animation
      const totalUnits = arrivingUnits + to.units;
      const duration = Math.min(3.0, Math.max(1.0, totalUnits / 80)); // 1-3 seconds based on units
      battles.push({
        planetId: to.id,
        attackUnits: arrivingUnits,
        attackPlayerId: attack.playerId,
        defendUnits: to.units,
        defendPlayerId: to.ownerId,
        startTime: performance.now(),
        duration,
        isBlitz: attack.isBlitz,
        resolved: false
      });
    }
  }
}

function resolveBattle(battle: Battle): void {
  const to = planetMap.get(battle.planetId);
  if (!to) return;

  const toScreen = worldToScreen(to.x, to.y);
  const defenseMultiplier = to.shieldTimer > 0 ? to.defense * 2 : to.defense;
  const defenseStrength = battle.defendUnits * defenseMultiplier;

  if (battle.attackUnits > defenseStrength) {
    const previousOwner = battle.defendPlayerId;
    const remaining = battle.attackUnits - defenseStrength;
    to.ownerId = battle.attackPlayerId;
    to.units = Math.max(1, Math.floor(remaining));
    to.stability = 50;
    to.connected = false;
    to.shieldTimer = 0;
    to.hasShield = false;
    // Assign random sprite type on capture by player
    if (battle.attackPlayerId === 0) {
      discoveredPlanets.add(battle.planetId);
      if (!to.spriteType) {
        to.spriteType = Math.random() < 0.5 ? 'mars' : 'ice';
      }
    }
    // Generator: auto-activate if slot available
    const newOwnerPlanets = planets.filter(p => p.ownerId === battle.attackPlayerId);
    const maxGen = getMaxGenerators(newOwnerPlanets.length);
    const activeGen = newOwnerPlanets.filter(p => p.generating).length;
    to.generating = activeGen < maxGen;
    // Enforce slots for previous owner who lost a planet
    if (previousOwner !== -1) {
      enforceGeneratorSlots(previousOwner);
    }
    // Capture particles
    spawnParticles(toScreen.x, toScreen.y, players[battle.attackPlayerId]?.color || '#fff', 20, 150);
  } else {
    const prevOwner = to.ownerId;
    to.units = Math.max(0, Math.floor((defenseStrength - battle.attackUnits) / defenseMultiplier));
    spawnParticles(toScreen.x, toScreen.y, '#ff6644', 10, 100);
    if (to.units <= 0) {
      to.ownerId = -1;
      to.generating = false;
      if (prevOwner !== -1) enforceGeneratorSlots(prevOwner);
    }
  }
}

function updateBattles(): void {
  const now = performance.now();
  for (let i = battles.length - 1; i >= 0; i--) {
    const b = battles[i];
    const elapsed = (now - b.startTime) / 1000;

    if (elapsed >= b.duration && !b.resolved) {
      b.resolved = true;
      resolveBattle(b);
      battles.splice(i, 1);
    } else {
      // Spawn clash particles during battle
      const planet = planetMap.get(b.planetId);
      if (planet && Math.random() < 0.3) {
        const screen = worldToScreen(planet.x, planet.y);
        const angle = Math.random() * Math.PI * 2;
        const r = planet.radius * camera.zoom * 0.8;
        const px = screen.x + Math.cos(angle) * r;
        const py = screen.y + Math.sin(angle) * r;
        const attackerColor = players[b.attackPlayerId]?.color || '#ff4444';
        const defenderColor = players[b.defendPlayerId]?.color || '#4444ff';
        const color = Math.random() > 0.5 ? attackerColor : defenderColor;
        spawnParticles(px, py, color, 1, 40);
      }
    }
  }
}

const SHIELD_RADIUS = 100; // shield is 100px from planet center

function updateAttacks(dt: number): void {
  const TURN_SPEED = 5.0; // radians per second - how fast missile can turn

  for (let i = attacks.length - 1; i >= 0; i--) {
    const attack = attacks[i];
    const to = planetMap.get(attack.toId);
    if (!to) {
      attacks[i] = attacks[attacks.length - 1];
      attacks.pop();
      continue;
    }

    // Calculate desired angle to target's CURRENT position (homing)
    const dx = to.x - attack.x;
    const dy = to.y - attack.y;
    const targetAngle = Math.atan2(dy, dx);
    const distToTarget = Math.sqrt(dx * dx + dy * dy);

    // Smooth rotation towards target (homing behavior)
    let angleDiff = targetAngle - attack.angle;
    // Normalize angle difference to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Turn towards target (limited by turn speed)
    const maxTurn = TURN_SPEED * dt;
    if (Math.abs(angleDiff) < maxTurn) {
      attack.angle = targetAngle;
    } else {
      attack.angle += Math.sign(angleDiff) * maxTurn;
    }

    // Move in current facing direction
    const moveSpeed = ATTACK_BASE_SPEED * dt;
    const oldX = attack.x;
    const oldY = attack.y;
    attack.x += Math.cos(attack.angle) * moveSpeed;
    attack.y += Math.sin(attack.angle) * moveSpeed;

    // Track total distance traveled (for degradation)
    const stepDist = Math.sqrt((attack.x - oldX) ** 2 + (attack.y - oldY) ** 2);
    attack.traveledDist += stepDist;

    // Update progress (approximate, for compatibility)
    const initialDist = Math.sqrt((to.x - attack.startX) ** 2 + (to.y - attack.startY) ** 2);
    attack.progress = Math.min(0.99, attack.traveledDist / initialDist);

    // Distance degradation - units lost during travel
    const currentUnits = calculateArrivingUnits(attack.startUnits, attack.traveledDist);
    attack.units = currentUnits;

    // Track degradation (flame rendered in renderAttacks)
    if (attack.lastDegradeUnits && currentUnits < attack.lastDegradeUnits) {
      attack.lastDegradeUnits = currentUnits;
    }

    // If all units lost during travel, destroy attack
    if (currentUnits <= 0) {
      const screen = worldToScreen(attack.x, attack.y);
      spawnParticles(screen.x, screen.y, '#ff4400', 20, 80);
      spawnParticles(screen.x, screen.y, '#ffaa00', 10, 50);
      clickAnims.push({
        x: screen.x, y: screen.y - 30,
        vx: 0, vy: -2,
        life: 90, maxLife: 90,
        text: 'LOST!', color: '#ff4400'
      });
      attacks[i] = attacks[attacks.length - 1];
      attacks.pop();
      continue;
    }

    // Check for shield collision
    if (!attack.shieldHit && to.hasShield && to.ownerId !== attack.playerId) {
      if (distToTarget <= SHIELD_RADIUS) {
        // Attack hit the shield!
        attack.shieldHit = true;

        // Shield strength = planet's units
        const shieldStrength = to.units;

        // Create flicker effect
        shieldFlickers.push({
          x: to.x,
          y: to.y,
          radius: SHIELD_RADIUS,
          life: 45,
          maxLife: 45
        });

        // Explosion at shield location
        const shieldScreen = worldToScreen(attack.x, attack.y);
        spawnParticles(shieldScreen.x, shieldScreen.y, '#44aaff', 25, 100);
        spawnParticles(shieldScreen.x, shieldScreen.y, '#88ddff', 15, 70);

        // Shield blocks up to planet's units
        const blocked = Math.min(attack.units, shieldStrength);
        attack.units -= blocked;

        // Show blocked amount
        clickAnims.push({
          x: shieldScreen.x, y: shieldScreen.y - 20,
          vx: 0, vy: -1.5,
          life: 60, maxLife: 60,
          text: `-${blocked}`, color: '#44aaff'
        });

        // Remove shield and building
        to.hasShield = false;
        for (let b = 0; b < to.buildings.length; b++) {
          if (to.buildings[b]?.type === 'shield_gen') {
            to.buildings[b] = null;
            break;
          }
        }

        // If attack has no units left, destroy it completely
        if (attack.units <= 0) {
          clickAnims.push({
            x: shieldScreen.x, y: shieldScreen.y - 40,
            vx: 0, vy: -2,
            life: 90, maxLife: 90,
            text: 'BLOCKED!', color: '#44aaff'
          });
          attacks[i] = attacks[attacks.length - 1];
          attacks.pop();
          continue;
        }
        // Otherwise attack continues with remaining units
      }
    }

    // Check if reached target (within planet radius)
    if (distToTarget <= to.radius + 5) {
      resolveAttack(attack);
      attacks[i] = attacks[attacks.length - 1];
      attacks.pop();
    }
  }
}

// ========== TURRET RADAR & MISSILES ==========
function getAttackCurrentPosition(attack: AttackAnimation): { x: number; y: number } | null {
  return { x: attack.x, y: attack.y };
}

function updateTurrets(): void {
  // Find all planets with turrets
  for (const planet of planets) {
    if (planet.ownerId === -1) continue;

    // Count turrets on this planet
    const turretCount = planet.buildings.filter(b => b && b.type === 'turret').length;
    if (turretCount === 0) continue;

    // Check planet's turret cooldown (per-planet, not per-attack)
    if (planet.nextTurretFireTime && gameTime < planet.nextTurretFireTime) continue;

    // Find all enemy attacks in radar range, prioritize closest threat
    let closestAttack: { attack: AttackAnimation; index: number; dist: number; pos: { x: number; y: number } } | null = null;

    for (let i = 0; i < attacks.length; i++) {
      const attack = attacks[i];

      // Skip friendly attacks (same owner)
      if (attack.playerId === planet.ownerId) continue;

      // Check if attack targets this planet or a friendly planet
      const targetPlanet = planetMap.get(attack.toId);
      if (!targetPlanet) continue;

      // Must target this planet OR a friendly planet (same owner)
      const targetsThisPlanet = attack.toId === planet.id;
      const targetsFriendly = targetPlanet.ownerId === planet.ownerId;
      if (!targetsThisPlanet && !targetsFriendly) continue;

      // Get current attack position
      const pos = getAttackCurrentPosition(attack);
      if (!pos) continue;

      // Check if attack is within radar range of this planet
      const dist = Math.sqrt((pos.x - planet.x) ** 2 + (pos.y - planet.y) ** 2);
      if (dist <= TURRET_FIRE_DISTANCE) {
        // Track closest threat
        if (!closestAttack || dist < closestAttack.dist) {
          closestAttack = { attack, index: i, dist, pos };
        }
      }
    }

    // If we found a target, fire at it
    if (closestAttack) {
      // Set planet's turret cooldown (2-5 seconds - slower firing)
      planet.nextTurretFireTime = gameTime + 2000 + Math.random() * 3000;

      // Calculate angle to attack for positioning turrets
      const angleToAttack = Math.atan2(closestAttack.pos.y - planet.y, closestAttack.pos.x - planet.x);
      const perpAngle = angleToAttack + Math.PI / 2; // perpendicular to attack direction

      // Fire missiles from different positions based on turret count
      // 1 turret: center, 2 turrets: left+right, 3 turrets: left+center+right
      const firePositions: { x: number; y: number }[] = [];
      const offset = planet.radius * 0.7; // how far from center

      if (turretCount === 1) {
        firePositions.push({ x: planet.x, y: planet.y });
      } else if (turretCount === 2) {
        firePositions.push({
          x: planet.x + Math.cos(perpAngle) * offset,
          y: planet.y + Math.sin(perpAngle) * offset
        });
        firePositions.push({
          x: planet.x - Math.cos(perpAngle) * offset,
          y: planet.y - Math.sin(perpAngle) * offset
        });
      } else { // 3 turrets
        firePositions.push({ x: planet.x, y: planet.y }); // center
        firePositions.push({
          x: planet.x + Math.cos(perpAngle) * offset,
          y: planet.y + Math.sin(perpAngle) * offset
        }); // right
        firePositions.push({
          x: planet.x - Math.cos(perpAngle) * offset,
          y: planet.y - Math.sin(perpAngle) * offset
        }); // left
      }

      // Fire with STAGGERED delays - missiles never fire all at once
      // Each missile has a random base delay + cumulative offset
      // This creates patterns like: 1-2-3, 1--2--3, 1-23, etc.
      let cumulativeDelay = 0;
      const shuffledPositions = [...firePositions].sort(() => Math.random() - 0.5); // randomize order

      for (let m = 0; m < shuffledPositions.length; m++) {
        const firePos = shuffledPositions[m];

        // Add random gap between each missile (300-1200ms)
        // First missile: 0-500ms delay
        // Subsequent missiles: previous delay + 300-1200ms
        if (m === 0) {
          cumulativeDelay = Math.random() * 500;
        } else {
          cumulativeDelay += 300 + Math.random() * 900; // 300-1200ms between shots
        }

        const randomSpeed = TURRET_MISSILE_SPEED * (0.6 + Math.random() * 0.5); // 60%-110% of base speed (slower)

        turretMissiles.push({
          x: firePos.x,
          y: firePos.y,
          targetAttackIndex: closestAttack.index,
          speed: randomSpeed,
          planetId: planet.id,
          delay: cumulativeDelay
        });
      }
    }
  }
}

function updateTurretMissiles(dt: number): void {
  for (let i = turretMissiles.length - 1; i >= 0; i--) {
    const missile = turretMissiles[i];
    const attack = attacks[missile.targetAttackIndex];

    // If attack no longer exists, remove missile
    if (!attack) {
      // Only show explosion if missile was already launched
      if (missile.delay <= 0) {
        const screen = worldToScreen(missile.x, missile.y);
        spawnParticles(screen.x, screen.y, '#ff4400', 5, 50);
      }
      turretMissiles[i] = turretMissiles[turretMissiles.length - 1];
      turretMissiles.pop();
      continue;
    }

    // Handle delay - missile waits before launching
    if (missile.delay > 0) {
      const wasDelayed = missile.delay > 0;
      missile.delay -= dt * 1000; // dt is in seconds, delay in ms

      // Spawn particles when missile actually fires
      if (wasDelayed && missile.delay <= 0) {
        const screen = worldToScreen(missile.x, missile.y);
        spawnParticles(screen.x, screen.y, '#ff6644', 5, 60);
      }
      continue; // Don't move yet
    }

    // Get current attack position
    const attackPos = getAttackCurrentPosition(attack);
    if (!attackPos) {
      turretMissiles[i] = turretMissiles[turretMissiles.length - 1];
      turretMissiles.pop();
      continue;
    }

    // Move missile toward attack position
    const dx = attackPos.x - missile.x;
    const dy = attackPos.y - missile.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 15) {
      // Missile hit - damage based on planet units
      const planet = planetMap.get(missile.planetId);
      const damage = planet ? Math.floor(planet.units / TURRET_DAMAGE_DIVISOR) : 10;
      const screen = worldToScreen(attackPos.x, attackPos.y);

      if (damage >= attack.units) {
        // Attack destroyed!
        const destroyed = attack.units;

        // Big explosion effect
        spawnParticles(screen.x, screen.y, '#ff4400', 25, 150);
        spawnParticles(screen.x, screen.y, '#ffaa00', 15, 100);

        // Show damage number
        clickAnims.push({
          x: screen.x,
          y: screen.y - 20,
          vx: (Math.random() - 0.5) * 2,
          vy: -2,
          life: 60,
          maxLife: 60,
          text: `-${destroyed}`,
          color: '#ff4400'
        });

        // Remove the attack
        attacks[missile.targetAttackIndex] = attacks[attacks.length - 1];
        attacks.pop();
      } else {
        // Partial damage - reduce both units and startUnits so degradation doesn't overwrite
        attack.units -= damage;
        attack.startUnits -= damage;
        if (attack.startUnits < attack.units) attack.startUnits = attack.units;

        // Small explosion particles
        spawnParticles(screen.x, screen.y, '#ff4400', 15, 120);

        // Show damage number
        clickAnims.push({
          x: screen.x,
          y: screen.y - 20,
          vx: (Math.random() - 0.5) * 2,
          vy: -2,
          life: 60,
          maxLife: 60,
          text: `-${damage}`,
          color: '#ff4400'
        });
      }

      // Remove missile
      turretMissiles[i] = turretMissiles[turretMissiles.length - 1];
      turretMissiles.pop();
    } else {
      // Move toward target
      const moveSpeed = missile.speed * dt;
      missile.x += (dx / dist) * moveSpeed;
      missile.y += (dy / dist) * moveSpeed;
    }
  }
}

// ========== DRONE INTERCEPT ==========
// Hit chance based on drone count: 1=50%, 2=70%, 3=85%
function getDroneHitChance(droneCount: number): number {
  if (droneCount <= 0) return 0;
  if (droneCount === 1) return 0.50;
  if (droneCount === 2) return 0.70;
  return 0.85; // 3+ drones
}

function updateDroneIntercept(): void {
  // Attacks with drones can shoot at incoming turret missiles
  for (const attack of attacks) {
    if (attack.droneCount <= 0) continue;

    // Cooldown between drone shots (1 second)
    if (attack.lastDroneFireTime && gameTime < attack.lastDroneFireTime) continue;

    // Find nearby turret missiles targeting this attack
    for (let i = 0; i < turretMissiles.length; i++) {
      const missile = turretMissiles[i];

      // Skip missiles still in delay
      if (missile.delay > 0) continue;

      // Check if this missile is targeting our attack
      if (attacks[missile.targetAttackIndex] !== attack) continue;

      // Check distance
      const dx = missile.x - attack.x;
      const dy = missile.y - attack.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= DRONE_INTERCEPT_RANGE) {
        // Set cooldown (1 second)
        attack.lastDroneFireTime = gameTime + 1000;

        // Launch drone projectile! Hit chance based on drone count: 1=50%, 2=70%, 3=85%
        const hitChance = getDroneHitChance(attack.droneCount);
        droneProjectiles.push({
          x: attack.x,
          y: attack.y,
          targetMissileIndex: i,
          speed: 400, // faster than turret missiles
          willHit: Math.random() < hitChance
        });

        // Visual feedback - drone fires
        const attackScreen = worldToScreen(attack.x, attack.y);
        spawnParticles(attackScreen.x, attackScreen.y, '#b868d8', 5, 40);

        break; // One shot per update
      }
    }
  }
}

function updateDroneProjectiles(dt: number): void {
  for (let i = droneProjectiles.length - 1; i >= 0; i--) {
    const proj = droneProjectiles[i];
    const missile = turretMissiles[proj.targetMissileIndex];

    // If target missile no longer exists, remove projectile
    if (!missile) {
      droneProjectiles[i] = droneProjectiles[droneProjectiles.length - 1];
      droneProjectiles.pop();
      continue;
    }

    // Move toward missile
    const dx = missile.x - proj.x;
    const dy = missile.y - proj.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 20) {
      // Reached target
      const missileScreen = worldToScreen(missile.x, missile.y);

      if (proj.willHit) {
        // Hit! Destroy the missile
        spawnParticles(missileScreen.x, missileScreen.y, '#b868d8', 12, 70);
        spawnParticles(missileScreen.x, missileScreen.y, '#ff4400', 8, 50);

        // Remove turret missile
        turretMissiles[proj.targetMissileIndex] = turretMissiles[turretMissiles.length - 1];
        turretMissiles.pop();
      } else {
        // Miss - projectile flies past
        spawnParticles(missileScreen.x, missileScreen.y, '#b868d8', 4, 30);
      }

      // Remove drone projectile
      droneProjectiles[i] = droneProjectiles[droneProjectiles.length - 1];
      droneProjectiles.pop();
    } else {
      // Move toward target
      const moveSpeed = proj.speed * dt;
      proj.x += (dx / dist) * moveSpeed;
      proj.y += (dy / dist) * moveSpeed;
    }
  }
}

// ========== PARTICLES ==========
function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt / p.maxLife;
    p.vx *= 0.95;
    p.vy *= 0.95;
    if (p.life <= 0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
    }
  }
}

// ========== SHIELD TIMER (legacy) ==========
function updateShields(dt: number): void {
  // Legacy timer-based shield (for abilities if any)
  for (const planet of planets) {
    if (planet.shieldTimer > 0) {
      planet.shieldTimer -= dt * 1000;
      if (planet.shieldTimer < 0) planet.shieldTimer = 0;
    }
  }
  // Note: hasShield from shield_gen building is one-time use (no auto-recharge)
}

// ========== CLICK ANIMATIONS ==========
function updateClickAnims(_dt: number): void {
  for (let i = clickAnims.length - 1; i >= 0; i--) {
    const anim = clickAnims[i];
    anim.x += anim.vx;
    anim.y += anim.vy;
    anim.vy += 0.1; // gravity
    anim.life--;
    if (anim.life <= 0) {
      clickAnims.splice(i, 1);
    }
  }
}

function renderClickAnims(): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const anim of clickAnims) {
    const alpha = anim.life / anim.maxLife;
    const t = 1 - alpha;
    const pop = t < 0.18 ? (1 - (t / 0.18)) : 0;
    const fontSize = 12 + pop * 6;
    const text = anim.text || '+1';
    const color = anim.color || '0, 255, 0'; // RGB format

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.floor(fontSize)}px "Press Start 2P"`;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(0, 0, 0, ${Math.min(0.9, alpha * 0.9)})`;
    ctx.strokeText(text, anim.x, anim.y);
    ctx.fillStyle = `rgba(${color}, ${alpha})`;
    ctx.fillText(text, anim.x, anim.y);
    ctx.restore();
  }
}

// ========== SHIELD FLICKER EFFECT ==========
function updateShieldFlickers(): void {
  for (let i = shieldFlickers.length - 1; i >= 0; i--) {
    shieldFlickers[i].life--;
    if (shieldFlickers[i].life <= 0) {
      shieldFlickers[i] = shieldFlickers[shieldFlickers.length - 1];
      shieldFlickers.pop();
    }
  }
}

function renderShieldFlickers(): void {
  for (const flicker of shieldFlickers) {
    const screen = worldToScreen(flicker.x, flicker.y);
    const screenRadius = flicker.radius * camera.zoom;
    const alpha = flicker.life / flicker.maxLife;

    // Flickering effect - rapid on/off
    const flickerOn = Math.sin(flicker.life * 0.8) > 0;
    if (!flickerOn && flicker.life > 10) continue; // skip some frames for flicker

    // Main shield circle
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, screenRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(68, 170, 255, ${alpha * 0.8})`;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Inner glow
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, screenRadius - 5, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(136, 221, 255, ${alpha * 0.5})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Outer glow
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, screenRadius + 8, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(68, 170, 255, ${alpha * 0.3})`;
    ctx.lineWidth = 6;
    ctx.stroke();
  }
}

// ========== PROBES & REVEAL ZONES ==========
function updateProbes(dt: number): void {
  // Update reveal zone timers
  for (let i = revealZones.length - 1; i >= 0; i--) {
    const zone = revealZones[i];
    if (zone.permanent) continue;
    zone.timeLeft -= dt * 1000;
    if (zone.timeLeft <= 0) {
      revealZones[i] = revealZones[revealZones.length - 1];
      revealZones.pop();
    }
  }

  // Move probes and drop reveal zones along path
  for (let i = probes.length - 1; i >= 0; i--) {
    const probe = probes[i];
    if (probe.done) {
      probes[i] = probes[probes.length - 1];
      probes.pop();
      continue;
    }

    const dx = probe.targetX - probe.x;
    const dy = probe.targetY - probe.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10) {
      // Reached destination
      probe.done = true;

      // Check if this probe should convert to orbit probe
      if (probe.orbitTargetPlanetId !== undefined && probe.orbitCount !== undefined) {
        const targetPlanet = planetMap.get(probe.orbitTargetPlanetId);
        if (targetPlanet) {
          orbitProbes.push({
            targetPlanetId: probe.orbitTargetPlanetId,
            orbitAngle: 0,
            orbitsRemaining: probe.orbitCount,
            orbitRadius: targetPlanet.radius + 30,
            orbitSpeed: ORBIT_PROBE_SPEED,
            playerId: probe.playerId
          });
          const screen = worldToScreen(targetPlanet.x, targetPlanet.y);
          spawnParticles(screen.x, screen.y, '#44ffaa', 10, 100);
          discoveredPlanets.add(probe.orbitTargetPlanetId);
        }
      } else {
        // Regular probe - create reveal zone
        revealZones.push({
          x: probe.x, y: probe.y,
          radius: PROBE_REVEAL_RADIUS,
          timeLeft: PROBE_REVEAL_DURATION,
          permanent: false
        });
      }
      continue;
    }

    const moveAmount = PROBE_SPEED * dt;
    const nx = dx / dist;
    const ny = dy / dist;

    probe.x += nx * moveAmount;
    probe.y += ny * moveAmount;

    // Discover nearby planets (probe reveals planet type)
    if (probe.playerId === 0) {
      for (const p of planets) {
        if (discoveredPlanets.has(p.id)) continue;
        const pd = Math.sqrt((p.x - probe.x) ** 2 + (p.y - probe.y) ** 2);
        if (pd < p.radius + 300) {
          discoveredPlanets.add(p.id);
        }
      }
    }

    // Drop reveal zone every PROBE_DROP_INTERVAL px
    // Check how far from last reveal zone
    const nearestRevealDist = revealZones.reduce((min, z) => {
      if (z.permanent) return min;
      const d = Math.sqrt((z.x - probe.x) ** 2 + (z.y - probe.y) ** 2);
      return Math.min(min, d);
    }, Infinity);

    if (nearestRevealDist > PROBE_DROP_INTERVAL) {
      revealZones.push({
        x: probe.x, y: probe.y,
        radius: PROBE_REVEAL_RADIUS,
        timeLeft: PROBE_REVEAL_DURATION,
        permanent: false
      });
    }
  }
}

function updateOrbitProbes(dt: number): void {
  for (let i = orbitProbes.length - 1; i >= 0; i--) {
    const probe = orbitProbes[i];
    const planet = planetMap.get(probe.targetPlanetId);
    if (!planet) {
      // Planet no longer exists, remove probe
      orbitProbes[i] = orbitProbes[orbitProbes.length - 1];
      orbitProbes.pop();
      continue;
    }

    const prevAngle = probe.orbitAngle;
    probe.orbitAngle += probe.orbitSpeed * dt;

    // Check if completed an orbit (crossed 2*PI)
    if (Math.floor(probe.orbitAngle / (Math.PI * 2)) > Math.floor(prevAngle / (Math.PI * 2))) {
      probe.orbitsRemaining--;
      if (probe.orbitsRemaining <= 0) {
        // Probe is done
        const screen = worldToScreen(planet.x, planet.y);
        spawnParticles(screen.x, screen.y, '#888', 6, 50);
        orbitProbes[i] = orbitProbes[orbitProbes.length - 1];
        orbitProbes.pop();
        continue;
      }
    }

    // Keep the planet discovered while probe is orbiting
    if (probe.playerId === 0) {
      discoveredPlanets.add(probe.targetPlanetId);

      // Calculate probe world position
      const probeX = planet.x + Math.cos(probe.orbitAngle) * probe.orbitRadius;
      const probeY = planet.y + Math.sin(probe.orbitAngle) * probe.orbitRadius;

      // Add reveal zone at probe position (refreshes fog around orbit)
      // Check if there's already a recent reveal zone nearby
      const nearestDist = revealZones.reduce((min, z) => {
        const d = Math.sqrt((z.x - probeX) ** 2 + (z.y - probeY) ** 2);
        return Math.min(min, d);
      }, Infinity);

      if (nearestDist > 60) {
        revealZones.push({
          x: probeX,
          y: probeY,
          radius: PROBE_REVEAL_RADIUS * 1.5,
          timeLeft: 10000, // 10 seconds
          permanent: false
        });
      }

      // Also discover nearby planets
      for (const p of planets) {
        if (discoveredPlanets.has(p.id)) continue;
        const pd = Math.sqrt((p.x - probeX) ** 2 + (p.y - probeY) ** 2);
        if (pd < p.radius + 400) {
          discoveredPlanets.add(p.id);
        }
      }
    }
  }
}

// ========== WIN/LOSE CHECK ==========
function checkGameOver(): void {
  // Disabled - game runs indefinitely without victory condition
  return;
}

// ========== AI ==========
function aiTick(player: Player): void {
  if (!player.alive || !player.isAI) return;

  const myPlanets = planets.filter(p => p.ownerId === player.id);
  if (myPlanets.length === 0) { player.alive = false; return; }

  // AI generator management: assign best planets as generators
  const maxGen = getMaxGenerators(myPlanets.length);
  // Reset all, then assign biggest planets
  for (const p of myPlanets) p.generating = false;
  const sorted = [...myPlanets].sort((a, b) => b.radius - a.radius);
  for (let i = 0; i < Math.min(maxGen, sorted.length); i++) {
    sorted[i].generating = true;
  }

  interface AiCandidate { from: Planet; to: Planet; priority: number }
  const candidates: AiCandidate[] = [];

  for (const mine of myPlanets) {
    if (mine.units < 40) continue;

    for (const target of planets) {
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
        const arriving = calculateArrivingUnits(Math.floor(mine.units * 0.5), dist);

        if (arriving > defStr * 1.2) {
          priority = 8;
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
  // On mobile, increase touch target (minimum 30px for finger tap)
  const minTouchRadius = isMobile ? 30 / camera.zoom : 0;
  for (const p of planets) {
    const dist = Math.sqrt((world.x - p.x) ** 2 + (world.y - p.y) ** 2);
    const hitRadius = Math.max(p.radius, minTouchRadius);
    if (dist <= hitRadius) return p;
  }
  return null;
}

// Check if click is on popup button
function getPopupButtonAt(px: number, py: number): string | null {
  if (!actionPopup) return null;

  const { btnW, btnH, hasSlider, percentRowH, percentGap, startX, startY } = getPopupLayout(actionPopup);

  // Check slider row (only for attack popups)
  if (hasSlider && px >= startX && px <= startX + btnW && py >= startY && py <= startY + percentRowH) {
    return 'popup_slider';
  }

  // Check action buttons
  let by = startY + percentRowH + percentGap;
  for (const btn of actionPopup.buttons) {
    if (px >= startX && px <= startX + btnW && py >= by && py <= by + btnH) {
      return btn.action;
    }
    by += btnH + 4;
  }
  return null;
}

function updatePopupSlider(px: number): void {
  if (!actionPopup) return;
  const { btnW, startX } = getPopupLayout(actionPopup);
  const sliderPad = 4;
  const sliderStartX = startX + sliderPad;
  const sliderW = btnW - sliderPad * 2;
  const ratio = Math.max(0, Math.min(1, (px - sliderStartX) / sliderW));
  sendPercent = Math.max(10, Math.min(100, Math.round(ratio * 100 / 5) * 5));
}

// Check if click is on ability button
function getAbilityButtonAt(px: number, py: number): string | null {
  const btnW = Math.round(92 * UI_SCALE);
  const btnH = Math.round(40 * UI_SCALE);
  const gap = Math.round(6 * UI_SCALE);
  const totalW = abilities.length * btnW + (abilities.length - 1) * gap;
  const abX = gameWidth - totalW - 15;
  const abY = gameHeight - Math.round(52 * UI_SCALE);

  for (let i = 0; i < abilities.length; i++) {
    const bx = abX + i * (btnW + gap);
    if (px >= bx && px <= bx + btnW && py >= abY && py <= abY + btnH) {
      return abilities[i].id;
    }
  }
  return null;
}

canvas.addEventListener('mousedown', (e) => {
  if (gameState === GameState.GAMEOVER) {
    // Check restart button click
    const pos = getCanvasMousePos(e);
    const btnX = gameWidth / 2 - 80;
    const btnY = gameHeight / 2 + 40;
    if (pos.x >= btnX && pos.x <= btnX + 160 && pos.y >= btnY && pos.y <= btnY + 40) {
      initGame();
      return;
    }
    return;
  }

  if (gameState === GameState.PAUSED) return;

  const pos = getCanvasMousePos(e);

  // Close info panel on any click
  if (infoPlanetId !== null) {
    infoPlanetId = null;
  }

  // Check build panel clicks first
  if (buildPanelPlanetId !== null) {
    const buildAction = getBuildPanelClickAt(pos.x, pos.y);
    if (buildAction) {
      handleBuildPanelClick(buildAction);
      return;
    }
    // Click outside build panel = close it
    buildPanelPlanetId = null;
    buildPanelSlot = null;
  }

  // Check transport panel clicks
  if (transportPanelOpen && transportSourceId !== null && transportTargetId !== null) {
    const transportAction = getTransportPanelClickAt(pos.x, pos.y);
    if (transportAction) {
      handleTransportPanelClick(transportAction);
      return;
    }
    // Click outside transport panel = close it
    transportPanelOpen = false;
    transportSourceId = null;
    transportTargetId = null;
  }

  if (e.button === 2 || e.button === 1) {
    // Right-click on own planet → context menu
    if (e.button === 2) {
      const rPlanet = getPlanetAtScreen(pos.x, pos.y);
      if (rPlanet && rPlanet.ownerId === controlledPlayerId) {
        const screen = worldToScreen(rPlanet.x, rPlanet.y);
        const genLabel = rPlanet.generating ? 'GEN OFF' : 'GEN ON';
        const isHomePlanet = rPlanet.id === players[controlledPlayerId]?.homeId;
        const buttons: { label: string; action: string }[] = [
          { label: genLabel, action: 'toggle_gen' }
        ];
        if (isHomePlanet) {
          buttons.push({ label: 'BOOST', action: 'boost' });
        }
        buttons.push(
          { label: 'SCOUT', action: 'scout' },
          { label: 'INFO', action: 'info' }
        );
        // No building on asteroids
        if (rPlanet.size !== PlanetSize.ASTEROID) {
          buttons.push({ label: 'BUILD', action: 'build' });
        }
        actionPopup = {
          targetId: rPlanet.id,
          screenX: screen.x + rPlanet.radius * camera.zoom + 14,
          screenY: screen.y,
          openTime: performance.now(),
          buttons
        };
        e.preventDefault();
        return;
      }
    }
    camera.dragging = true;
    camera.dragStartX = pos.x;
    camera.dragStartY = pos.y;
    camera.dragCamStartX = camera.x;
    camera.dragCamStartY = camera.y;
    e.preventDefault();
    return;
  }

  // Check popup button click first
  if (actionPopup) {
    const action = getPopupButtonAt(pos.x, pos.y);
    if (action) {
      if (action === 'popup_slider') {
        popupSliderDragging = true;
        updatePopupSlider(pos.x);
        return;
      }
      if (action === 'toggle_gen') {
        const targetPlanet = planetMap.get(actionPopup.targetId);
        if (targetPlanet) {
          if (targetPlanet.generating) {
            // Turn off generating
            targetPlanet.generating = false;
          } else {
            // Turn on generating if slot available
            const owned = planets.filter(p => p.ownerId === controlledPlayerId);
            const maxGen = getMaxGenerators(owned.length);
            const activeGen = owned.filter(p => p.generating).length;
            if (activeGen < maxGen) {
              targetPlanet.generating = true;
            }
          }
        }
      } else if (action === 'boost') {
        planetMode = 'boost';
        modePlanetId = actionPopup.targetId;
        selectedPlanets.clear();
        selectedPlanets.add(actionPopup.targetId);
        planetSelectTime.set(actionPopup.targetId, performance.now());
      } else if (action === 'scout') {
        planetMode = 'scout';
        modePlanetId = actionPopup.targetId;
        selectedPlanets.clear();
        selectedPlanets.add(actionPopup.targetId);
        planetSelectTime.set(actionPopup.targetId, performance.now());
      } else if (action === 'info') {
        infoPlanetId = actionPopup.targetId;
      } else if (action === 'build') {
        const buildPlanet = planetMap.get(actionPopup.targetId);
        if (buildPlanet && buildPlanet.size !== PlanetSize.ASTEROID) {
          buildPanelPlanetId = actionPopup.targetId;
          buildPanelSlot = null;
        }
      } else if (action === 'attack') {
        // Launch attack from all selected planets to popup target
        const useBlitz = activeAbility === 'blitz';
        for (const fromId of selectedPlanets) {
          const from = planetMap.get(fromId);
          if (from && from.ownerId === controlledPlayerId) {
            launchAttack(fromId, actionPopup.targetId, useBlitz);
          }
        }
        if (useBlitz) {
          const blitzAbility = abilities.find(a => a.id === 'blitz');
          if (blitzAbility) blitzAbility.lastUsed = gameTime;
          activeAbility = null;
        }
      } else if (action === 'all_in') {
        // ALL IN: Launch attack from ALL connected planets to target
        const useBlitz = activeAbility === 'blitz';
        const connectedPlanets = getConnectedPlanets(controlledPlayerId);
        let attackCount = 0;
        for (const planet of connectedPlanets) {
          // Only attack from planets with enough units (at least 5)
          if (planet.units >= 5) {
            launchAttack(planet.id, actionPopup.targetId, useBlitz);
            attackCount++;
            // Spawn particles to show ALL IN effect
            const screen = worldToScreen(planet.x, planet.y);
            spawnParticles(screen.x, screen.y, '#ff4444', 8, 80);
          }
        }
        if (useBlitz && attackCount > 0) {
          const blitzAbility = abilities.find(a => a.id === 'blitz');
          if (blitzAbility) blitzAbility.lastUsed = gameTime;
          activeAbility = null;
        }
      } else if (action === 'scout_probe') {
        // Send orbit probe from first selected planet to target
        const targetPlanet = planetMap.get(actionPopup.targetId);
        if (targetPlanet) {
          // Find first own planet with enough units
          for (const fromId of selectedPlanets) {
            const from = planetMap.get(fromId);
            if (from && from.ownerId === controlledPlayerId) {
              const orbits = Math.min(Math.floor(from.units * 0.5), 20);
              if (orbits >= 5) {
                from.units -= orbits;
                probes.push({
                  x: from.x,
                  y: from.y,
                  targetX: targetPlanet.x,
                  targetY: targetPlanet.y,
                  speed: PROBE_SPEED,
                  playerId: controlledPlayerId,
                  done: false,
                  orbitTargetPlanetId: targetPlanet.id,
                  orbitCount: orbits
                });
                const screen = worldToScreen(from.x, from.y);
                spawnParticles(screen.x, screen.y, '#44ffaa', 10, 100);
                break; // Only send from first planet
              }
            }
          }
        }
      } else if (action === 'transport') {
        // Open transport panel - use first selected planet as source
        for (const fromId of selectedPlanets) {
          const from = planetMap.get(fromId);
          if (from && from.ownerId === controlledPlayerId && from.deposits.length > 0) {
            transportPanelOpen = true;
            transportSourceId = fromId;
            transportTargetId = actionPopup.targetId;
            break;
          }
        }
      }
      actionPopup = null;
      return;
    }
    // Click outside popup = close it
    actionPopup = null;
  }

  // Check ability buttons
  const abilityId = getAbilityButtonAt(pos.x, pos.y);
  if (abilityId) {
    const ability = abilities.find(a => a.id === abilityId);
    if (ability && isAbilityReady(ability)) {
      if (abilityId === 'shield') {
        // Shield: apply to first selected own planet
        for (const pid of selectedPlanets) {
          const p = planetMap.get(pid);
          if (p && p.ownerId === controlledPlayerId) {
            p.shieldTimer = 10000; // 10 seconds
            ability.lastUsed = gameTime;
            spawnParticles(worldToScreen(p.x, p.y).x, worldToScreen(p.x, p.y).y, '#44aaff', 15, 100);
            break;
          }
        }
      } else if (abilityId === 'nuke') {
        activeAbility = 'nuke';
      } else if (abilityId === 'blitz') {
        activeAbility = 'blitz';
      }
    }
    return;
  }

  // Left click on game
  const planet = getPlanetAtScreen(pos.x, pos.y);

  // Nuke ability targeting
  if (activeAbility === 'nuke' && planet) {
    if (planet.ownerId !== controlledPlayerId) {
      const nukeAbility = abilities.find(a => a.id === 'nuke');
      // Check range - must have own planet within 500px
      let inRange = false;
      for (const p of planets) {
        if (p.ownerId === controlledPlayerId && getDistance(p, planet) <= 500) {
          inRange = true;
          break;
        }
      }
      if (inRange && nukeAbility) {
        planet.units = Math.floor(planet.units * 0.5);
        nukeAbility.lastUsed = gameTime;
        const screen = worldToScreen(planet.x, planet.y);
        spawnParticles(screen.x, screen.y, '#ff4400', 30, 200);
      }
    }
    activeAbility = null;
    return;
  }

  if (planet) {
    if (selectedPlanets.size > 0 && planet.ownerId !== controlledPlayerId) {
      // Can only attack visible planets (not in fog)
      if (!isVisibleToPlayer(planet)) return;

      // Has selection + clicking non-own planet = show popup
      const hasOwnSelected = [...selectedPlanets].some(id => {
        const p = planetMap.get(id);
        return p && p.ownerId === controlledPlayerId;
      });

      if (hasOwnSelected) {
        const screen = worldToScreen(planet.x, planet.y);
        const hasOrbitProbe = orbitProbes.some(p => p.targetPlanetId === planet.id && p.playerId === controlledPlayerId);
        // Check if player has connected network (more than 1 connected planet)
        const connectedPlanets = getConnectedPlanets(controlledPlayerId);
        const hasNetwork = connectedPlanets.length > 1;
        const buttons = [
          { label: 'ATTACK', action: 'attack' },
        ];
        // Add ALL IN button if player has connected network
        if (hasNetwork) {
          buttons.push({ label: 'ALL IN', action: 'all_in' });
        }
        buttons.push({ label: 'SCOUT', action: 'scout_probe' });
        if (hasOrbitProbe) {
          buttons.push({ label: 'INFO', action: 'info' });
        }
        actionPopup = {
          targetId: planet.id,
          screenX: screen.x + planet.radius * camera.zoom + 14,
          screenY: screen.y,
          openTime: performance.now(),
          buttons
        };
        return;
      }
    }

    if (planet.ownerId === controlledPlayerId && selectedPlanets.size > 0) {
      // Clicking own planet while having selection
      const hasOwnSelected = [...selectedPlanets].some(id => {
        const p = planetMap.get(id);
        return p && p.ownerId === controlledPlayerId;
      });

      if (hasOwnSelected && !selectedPlanets.has(planet.id)) {
        // Show popup for sending units or resources
        const screen = worldToScreen(planet.x, planet.y);
        actionPopup = {
          targetId: planet.id,
          screenX: screen.x + planet.radius * camera.zoom + 14,
          screenY: screen.y,
          openTime: performance.now(),
          buttons: [
            { label: 'SEND', action: 'attack' },
            { label: 'TRANSPORT', action: 'transport' }
          ]
        };
        return;
      }
    }

    // Select/multi-select
    if (planet.ownerId === controlledPlayerId) {
      // Boost mode: +1 unit per click
      if (planetMode === 'boost' && modePlanetId === planet.id) {
        if (planet.units < planet.maxUnits) {
          planet.units += 1;
          const screen = worldToScreen(planet.x, planet.y);
          clickAnims.push({
            x: screen.x + (Math.random() - 0.5) * 20,
            y: screen.y - planet.radius * camera.zoom - 10,
            vx: (Math.random() - 0.5) * 2,
            vy: -2 - Math.random(),
            life: 60,
            maxLife: 60
          });
        }
        return;
      }

      // Scout mode: start explore drag
      if (planetMode === 'scout' && modePlanetId === planet.id) {
        exploreDragging = true;
        explorePlanetId = planet.id;
        exploreStartX = pos.x;
        exploreStartY = pos.y;
        return;
      }

      // Normal: just select
      if (!selectedPlanets.has(planet.id)) {
        selectedPlanets.add(planet.id);
        planetSelectTime.set(planet.id, performance.now());
      }
      // Clear mode if clicking different planet
      if (modePlanetId !== planet.id) {
        planetMode = 'none';
        modePlanetId = null;
      }
    } else {
      // Non-own planet: just select it
      selectedPlanets.clear();
      selectedPlanets.add(planet.id);
      planetSelectTime.set(planet.id, performance.now());
      planetMode = 'none';
      modePlanetId = null;
    }
  } else {
    // Click empty space = deselect
    selectedPlanets.clear();
    actionPopup = null;
    activeAbility = null;
    planetMode = 'none';
    modePlanetId = null;
  }
});

canvas.addEventListener('mousemove', (e) => {
  const pos = getCanvasMousePos(e);
  mouseX = pos.x;
  mouseY = pos.y;

  if (popupSliderDragging) {
    updatePopupSlider(pos.x);
    return;
  }

  if (camera.dragging) {
    const deltaX = pos.x - camera.dragStartX;
    const deltaY = pos.y - camera.dragStartY;
    camera.x = camera.dragCamStartX - deltaX;
    camera.y = camera.dragCamStartY - deltaY;
    // Update parallax offset (only on drag, not zoom)
    parallaxOffsetX -= deltaX * 0.01;
    parallaxOffsetY -= deltaY * 0.01;
    camera.dragStartX = pos.x;
    camera.dragStartY = pos.y;
    camera.dragCamStartX = camera.x;
    camera.dragCamStartY = camera.y;
    return;
  }

  const planet = getPlanetAtScreen(pos.x, pos.y);
  const newHoveredPlanet = planet ? planet.id : null;
  if (newHoveredPlanet !== hoveredPlanet) {
    hoveredPlanet = newHoveredPlanet;
    if (hoveredPlanet !== null) {
      hoverStartTime = performance.now();
    }
  }
});

canvas.addEventListener('mouseup', () => {
  camera.dragging = false;
  popupSliderDragging = false;

  // Handle explore drag release
  if (exploreDragging && explorePlanetId !== null) {
    const dragDist = Math.sqrt((mouseX - exploreStartX) ** 2 + (mouseY - exploreStartY) ** 2);

    if (dragDist > 15) {
      // Dragged far enough → send exploration probe
      const planet = planetMap.get(explorePlanetId);
      if (planet && planet.ownerId === controlledPlayerId) {
        const worldTarget = screenToWorld(mouseX, mouseY);
        const worldDist = getDistance(planet, worldTarget);
        const unitCost = Math.max(5, Math.ceil(worldDist / 100 * PROBE_UNIT_COST_PER_100PX));
        const actualCost = Math.min(unitCost, Math.floor(planet.units - 5));

        if (actualCost > 0) {
          planet.units -= actualCost;
          const maxDist = (actualCost / PROBE_UNIT_COST_PER_100PX) * 100;
          const dx = worldTarget.x - planet.x;
          const dy = worldTarget.y - planet.y;
          const clickDist = Math.sqrt(dx * dx + dy * dy);
          const travelDist = Math.min(maxDist, clickDist);
          const nx = dx / (clickDist || 1);
          const ny = dy / (clickDist || 1);

          probes.push({
            x: planet.x,
            y: planet.y,
            targetX: planet.x + nx * travelDist,
            targetY: planet.y + ny * travelDist,
            speed: PROBE_SPEED,
            playerId: 0,
            done: false
          });

          const screen = worldToScreen(planet.x, planet.y);
          spawnParticles(screen.x, screen.y, '#44ff88', 8, 80);
        }
      }
    } else {
      // Just a click (no drag) → deselect the planet
      selectedPlanets.delete(explorePlanetId);
    }

    exploreDragging = false;
    explorePlanetId = null;
  }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  actionPopup = null;
  const pos = getCanvasMousePos(e);
  const worldBefore = screenToWorld(pos.x, pos.y);

  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  camera.targetZoom = Math.max(0.04, Math.min(3.0, camera.targetZoom * zoomFactor));
  camera.zoom = camera.targetZoom;

  const worldAfter = screenToWorld(pos.x, pos.y);
  camera.x += (worldBefore.x - worldAfter.x) * camera.zoom;
  camera.y += (worldBefore.y - worldAfter.y) * camera.zoom;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ========== MOBILE TOUCH CONTROLS ==========
function getTouchPos(touch: Touch): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (touch.clientX - rect.left) * (canvas.width / rect.width),
    y: (touch.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function getTouchDistance(t1: Touch, t2: Touch): number {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function showContextMenu(pos: { x: number; y: number }): void {
  const planet = getPlanetAtScreen(pos.x, pos.y);
  if (planet && planet.ownerId === controlledPlayerId) {
    const screen = worldToScreen(planet.x, planet.y);
    const genLabel = planet.generating ? 'GEN OFF' : 'GEN ON';
    const isHomePlanet = planet.id === players[controlledPlayerId]?.homeId;
    const buttons: { label: string; action: string }[] = [
      { label: genLabel, action: 'toggle_gen' }
    ];
    if (isHomePlanet) {
      buttons.push({ label: 'BOOST', action: 'boost' });
    }
    buttons.push(
      { label: 'SCOUT', action: 'scout' },
      { label: 'INFO', action: 'info' }
    );
    if (planet.size !== PlanetSize.ASTEROID) {
      buttons.push({ label: 'BUILD', action: 'build' });
    }
    actionPopup = {
      targetId: planet.id,
      screenX: screen.x + planet.radius * camera.zoom + 14,
      screenY: screen.y,
      openTime: performance.now(),
      buttons
    };
  }
}

// Check if touch is on joystick area
function isOnJoystick(x: number, y: number): boolean {
  if (!isMobile) return false;
  const centerX = JOYSTICK_X;
  const centerY = gameHeight - JOYSTICK_Y_OFFSET;
  const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
  return dist <= JOYSTICK_SIZE / 2 + 20; // +20 for easier touch
}

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();

  if (gameState === GameState.GAMEOVER) {
    const pos = getTouchPos(e.touches[0]);
    const btnX = gameWidth / 2 - 80;
    const btnY = gameHeight / 2 + 40;
    if (pos.x >= btnX && pos.x <= btnX + 160 && pos.y >= btnY && pos.y <= btnY + 40) {
      initGame();
    }
    return;
  }

  if (gameState === GameState.PAUSED) return;

  const touch = e.touches[0];
  const pos = getTouchPos(touch);

  // Check joystick touch (mobile only)
  if (isMobile && isOnJoystick(pos.x, pos.y)) {
    joystickActive = true;
    joystickTouchId = touch.identifier;
    // Calculate joystick position
    const centerX = JOYSTICK_X;
    const centerY = gameHeight - JOYSTICK_Y_OFFSET;
    const maxDist = JOYSTICK_SIZE / 2 - JOYSTICK_INNER / 2;
    const dx = pos.x - centerX;
    const dy = pos.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      const clampedDist = Math.min(dist, maxDist);
      joystickX = (dx / dist) * (clampedDist / maxDist);
      joystickY = (dy / dist) * (clampedDist / maxDist);
    }
    return; // Don't process other touch events when using joystick
  }

  touchStartTime = performance.now();
  touchStartX = pos.x;
  touchStartY = pos.y;
  lastTouchX = pos.x;
  lastTouchY = pos.y;
  mouseX = pos.x;
  mouseY = pos.y;

  // Two-finger pinch/pan
  if (e.touches.length === 2) {
    isPinching = true;
    isTouchDragging = false;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    pinchStartDist = getTouchDistance(e.touches[0], e.touches[1]);
    pinchStartZoom = camera.zoom;
    // Pan start (center of two fingers)
    const p1 = getTouchPos(e.touches[0]);
    const p2 = getTouchPos(e.touches[1]);
    camera.dragging = true;
    camera.dragStartX = (p1.x + p2.x) / 2;
    camera.dragStartY = (p1.y + p2.y) / 2;
    camera.dragCamStartX = camera.x;
    camera.dragCamStartY = camera.y;
    return;
  }

  // Close info panel on any touch
  if (infoPlanetId !== null) {
    infoPlanetId = null;
  }

  // Check build panel
  if (buildPanelPlanetId !== null) {
    const buildAction = getBuildPanelClickAt(pos.x, pos.y);
    if (buildAction) {
      handleBuildPanelClick(buildAction);
      return;
    }
    buildPanelPlanetId = null;
    buildPanelSlot = null;
  }

  // Check transport panel
  if (transportPanelOpen && transportSourceId !== null && transportTargetId !== null) {
    const transportAction = getTransportPanelClickAt(pos.x, pos.y);
    if (transportAction) {
      handleTransportPanelClick(transportAction);
      return;
    }
    transportPanelOpen = false;
    transportSourceId = null;
    transportTargetId = null;
  }

  // Check popup button
  if (actionPopup) {
    const action = getPopupButtonAt(pos.x, pos.y);
    if (action) {
      // Simulate mouse click handler for popup actions
      const fakeEvent = { button: 0, preventDefault: () => {} } as MouseEvent;
      canvas.dispatchEvent(new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        button: 0
      }));
      return;
    }
  }

  // Long press timer for context menu
  longPressTimer = setTimeout(() => {
    const moveDist = Math.sqrt((lastTouchX - touchStartX) ** 2 + (lastTouchY - touchStartY) ** 2);
    if (moveDist < 20) {
      showContextMenu(pos);
      // Vibrate feedback if available
      if (navigator.vibrate) navigator.vibrate(50);
    }
    longPressTimer = null;
  }, LONG_PRESS_DURATION);

}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();

  if (gameState !== GameState.PLAYING) return;

  // Handle joystick movement
  if (joystickActive && joystickTouchId !== null) {
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === joystickTouchId) {
        const pos = getTouchPos(e.touches[i]);
        const centerX = JOYSTICK_X;
        const centerY = gameHeight - JOYSTICK_Y_OFFSET;
        const maxDist = JOYSTICK_SIZE / 2 - JOYSTICK_INNER / 2;
        const dx = pos.x - centerX;
        const dy = pos.y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          const clampedDist = Math.min(dist, maxDist);
          joystickX = (dx / dist) * (clampedDist / maxDist);
          joystickY = (dy / dist) * (clampedDist / maxDist);
        } else {
          joystickX = 0;
          joystickY = 0;
        }
        return;
      }
    }
  }

  // Two-finger pinch zoom + pan
  if (e.touches.length === 2) {
    isPinching = true;
    const newDist = getTouchDistance(e.touches[0], e.touches[1]);
    const scale = newDist / pinchStartDist;
    camera.targetZoom = Math.max(0.04, Math.min(3.0, pinchStartZoom * scale));
    camera.zoom = camera.targetZoom;

    // Pan with two fingers
    const p1 = getTouchPos(e.touches[0]);
    const p2 = getTouchPos(e.touches[1]);
    const centerX = (p1.x + p2.x) / 2;
    const centerY = (p1.y + p2.y) / 2;
    camera.x = camera.dragCamStartX - (centerX - camera.dragStartX);
    camera.y = camera.dragCamStartY - (centerY - camera.dragStartY);
    return;
  }

  const pos = getTouchPos(e.touches[0]);
  lastTouchX = pos.x;
  lastTouchY = pos.y;
  mouseX = pos.x;
  mouseY = pos.y;

  const moveDist = Math.sqrt((pos.x - touchStartX) ** 2 + (pos.y - touchStartY) ** 2);

  // Cancel long press if moved too much
  if (moveDist > 15 && longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  // Start drag for camera pan (single finger)
  if (moveDist > 10 && !isTouchDragging && !actionPopup) {
    isTouchDragging = true;
    camera.dragging = true;
    camera.dragStartX = touchStartX;
    camera.dragStartY = touchStartY;
    camera.dragCamStartX = camera.x;
    camera.dragCamStartY = camera.y;
  }

  // Camera panning
  if (isTouchDragging && camera.dragging) {
    const deltaX = pos.x - camera.dragStartX;
    const deltaY = pos.y - camera.dragStartY;
    camera.x = camera.dragCamStartX - deltaX;
    camera.y = camera.dragCamStartY - deltaY;
    // Update parallax offset (only on drag, not zoom)
    parallaxOffsetX -= deltaX * 0.01;
    parallaxOffsetY -= deltaY * 0.01;
    camera.dragStartX = pos.x;
    camera.dragStartY = pos.y;
    camera.dragCamStartX = camera.x;
    camera.dragCamStartY = camera.y;
  }

  // Popup slider dragging
  if (popupSliderDragging) {
    updatePopupSlider(pos.x);
  }

  // Update hovered planet
  const planet = getPlanetAtScreen(pos.x, pos.y);
  const newHoveredPlanet = planet ? planet.id : null;
  if (newHoveredPlanet !== hoveredPlanet) {
    hoveredPlanet = newHoveredPlanet;
    if (hoveredPlanet !== null) {
      hoverStartTime = performance.now();
    }
  }

}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();

  // Check if joystick touch ended
  if (joystickActive && joystickTouchId !== null) {
    let stillActive = false;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === joystickTouchId) {
        stillActive = true;
        break;
      }
    }
    if (!stillActive) {
      joystickActive = false;
      joystickTouchId = null;
      joystickX = 0;
      joystickY = 0;
    }
  }

  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  if (gameState !== GameState.PLAYING) return;

  // If was pinching and now only one finger, reset
  if (isPinching && e.touches.length < 2) {
    isPinching = false;
    camera.dragging = false;
    return;
  }

  // Check if it was a tap (short press, no drag)
  const tapDuration = performance.now() - touchStartTime;
  const moveDist = Math.sqrt((lastTouchX - touchStartX) ** 2 + (lastTouchY - touchStartY) ** 2);

  camera.dragging = false;
  popupSliderDragging = false;

  // Handle explore drag release (like mouse)
  if (exploreDragging && explorePlanetId !== null) {
    if (moveDist > 15) {
      const planet = planetMap.get(explorePlanetId);
      if (planet && planet.ownerId === controlledPlayerId) {
        const worldTarget = screenToWorld(lastTouchX, lastTouchY);
        const worldDist = getDistance(planet, worldTarget);
        const unitCost = Math.max(5, Math.ceil(worldDist / 100 * PROBE_UNIT_COST_PER_100PX));
        const actualCost = Math.min(unitCost, Math.floor(planet.units - 5));
        if (actualCost > 0) {
          planet.units -= actualCost;
          const maxDist = (actualCost / PROBE_UNIT_COST_PER_100PX) * 100;
          const dx = worldTarget.x - planet.x;
          const dy = worldTarget.y - planet.y;
          const clickDist = Math.sqrt(dx * dx + dy * dy);
          const travelDist = Math.min(maxDist, clickDist);
          const nx = dx / (clickDist || 1);
          const ny = dy / (clickDist || 1);
          probes.push({
            x: planet.x, y: planet.y,
            targetX: planet.x + nx * travelDist,
            targetY: planet.y + ny * travelDist,
            speed: PROBE_SPEED, playerId: 0, done: false
          });
          const screen = worldToScreen(planet.x, planet.y);
          spawnParticles(screen.x, screen.y, '#44ff88', 8, 80);
        }
      }
    } else {
      selectedPlanets.delete(explorePlanetId);
    }
    exploreDragging = false;
    explorePlanetId = null;
    isTouchDragging = false;
    return;
  }

  isTouchDragging = false;

  // Tap detection (short tap, minimal movement)
  if (tapDuration < 300 && moveDist < 20) {
    const pos = { x: lastTouchX, y: lastTouchY };

    // Check popup buttons first
    if (actionPopup) {
      const action = getPopupButtonAt(pos.x, pos.y);
      if (action) {
        // Dispatch a fake mousedown to reuse existing logic
        canvas.dispatchEvent(new MouseEvent('mousedown', {
          clientX: pos.x,
          clientY: pos.y,
          button: 0
        }));
        return;
      }
      // Tap outside popup closes it
      actionPopup = null;
      activeAbility = null;
      return;
    }

    // Check ability bar tap
    const ability = getAbilityButtonAt(pos.x, pos.y);
    if (ability) {
      const ab = abilities.find(a => a.id === ability);
      if (ab) {
        const cd = ab.cooldown - (gameTime - ab.lastUsed);
        if (cd <= 0) {
          activeAbility = activeAbility === ability ? null : ability;
        }
      }
      return;
    }

    // Check planet tap
    const planet = getPlanetAtScreen(pos.x, pos.y);
    if (planet) {
      if (planet.ownerId === controlledPlayerId) {
        // BOOST mode: +1 unit per tap
        if (planetMode === 'boost' && modePlanetId === planet.id) {
          if (planet.units < planet.maxUnits) {
            planet.units += 1;
            const screen = worldToScreen(planet.x, planet.y);
            clickAnims.push({
              x: screen.x + (Math.random() - 0.5) * 20,
              y: screen.y - planet.radius * camera.zoom - 10,
              vx: (Math.random() - 0.5) * 2,
              vy: -2 - Math.random(),
              life: 60,
              maxLife: 60
            });
          }
          return;
        }

        // SCOUT mode: start explore drag (on touch, just toggle select for now)
        if (planetMode === 'scout' && modePlanetId === planet.id) {
          exploreDragging = true;
          explorePlanetId = planet.id;
          exploreStartX = pos.x;
          exploreStartY = pos.y;
          return;
        }

        // Normal: select/deselect
        if (selectedPlanets.has(planet.id)) {
          selectedPlanets.delete(planet.id);
        } else {
          selectedPlanets.add(planet.id);
          planetSelectTime.set(planet.id, performance.now());
        }
        // Clear mode if tapping different planet
        if (modePlanetId !== planet.id) {
          planetMode = 'none';
          modePlanetId = null;
        }
      } else {
        // Enemy/neutral planet with selection - show attack popup
        if (selectedPlanets.size > 0) {
          const screen = worldToScreen(planet.x, planet.y);
          const attackBtns: { label: string; action: string }[] = [
            { label: 'ATTACK', action: 'attack' }
          ];
          // Check if we have multiple connected planets for ALL IN
          const connectedPlanets = getConnectedPlanets(controlledPlayerId);
          const planetsWithUnits = connectedPlanets.filter(p => p.units >= 5);
          if (planetsWithUnits.length > 1) {
            attackBtns.push({ label: 'ALL IN', action: 'all_in' });
          }
          if (planetMode === 'scout') {
            attackBtns.push({ label: 'PROBE', action: 'scout_probe' });
          }
          actionPopup = {
            targetId: planet.id,
            screenX: screen.x + planet.radius * camera.zoom + 14,
            screenY: screen.y,
            openTime: performance.now(),
            buttons: attackBtns,
            attackPercent: 100
          };
        }
      }
    } else {
      // Tap on empty space - deselect
      selectedPlanets.clear();
      actionPopup = null;
      activeAbility = null;
      planetMode = 'none';
      modePlanetId = null;
    }
  }

}, { passive: false });

// Prevent page zoom on double tap
document.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

let lastTap = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTap < 300) {
    e.preventDefault();
  }
  lastTap = now;
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (actionPopup) {
      actionPopup = null;
      activeAbility = null;
    } else if (gameState === GameState.PAUSED) {
      gameState = GameState.PLAYING;
    } else {
      selectedPlanets.clear();
      activeAbility = null;
    }
  }
  if (e.key === ' ') {
    e.preventDefault();
    const home = planetMap.get(players[controlledPlayerId]?.homeId);
    if (home) {
      camera.x = home.x * camera.zoom - gameWidth / 2;
      camera.y = home.y * camera.zoom - gameHeight / 2;
    }
  }
  if (e.key === 'p' || e.key === 'P') {
    if (gameState === GameState.PLAYING) {
      gameState = GameState.PAUSED;
    } else if (gameState === GameState.PAUSED) {
      gameState = GameState.PLAYING;
    }
  }
  // TAB - switch controlled player for testing
  if (e.key === 'Tab') {
    e.preventDefault();
    const alivePlayers = players.filter(p => p.alive);
    if (alivePlayers.length > 1) {
      const currentIndex = alivePlayers.findIndex(p => p.id === controlledPlayerId);
      const nextIndex = (currentIndex + 1) % alivePlayers.length;
      controlledPlayerId = alivePlayers[nextIndex].id;
      selectedPlanets.clear();
      actionPopup = null;
      console.log(`🎮 Now controlling: ${players[controlledPlayerId].name} (Player ${controlledPlayerId})`);
    }
  }
});

// ========== RENDERING ==========

// Parallax background with world-space - 3D depth effect
function renderParallaxBackground(): void {
  if (bgLayersLoaded < 3) return;

  const layers = [bgLayer1, bgLayer2, bgLayer3];
  const alphas = [0.3, 0.4, 0.5];
  const depths = [0.3, 0.6, 0.9]; // How much each layer moves (0=fixed, 1=full)

  // Background tile size in world coordinates
  const tileSize = 2000;

  for (let i = 0; i < 3; i++) {
    const layer = layers[i];
    if (!layer.complete || !layer.naturalWidth) continue;

    ctx.globalAlpha = alphas[i];
    const depth = depths[i];

    // Apply parallax - deeper layers move less with camera
    const parallaxCamX = camera.x * depth;
    const parallaxCamY = camera.y * depth;

    // Calculate visible area with parallax offset
    const worldLeft = parallaxCamX / camera.zoom;
    const worldTop = parallaxCamY / camera.zoom;
    const worldRight = worldLeft + gameWidth / camera.zoom;
    const worldBottom = worldTop + gameHeight / camera.zoom;

    // Calculate tile range needed
    const startTileX = Math.floor(worldLeft / tileSize);
    const startTileY = Math.floor(worldTop / tileSize);
    const endTileX = Math.ceil(worldRight / tileSize);
    const endTileY = Math.ceil(worldBottom / tileSize);

    // Draw tiles with parallax
    for (let tx = startTileX; tx <= endTileX; tx++) {
      for (let ty = startTileY; ty <= endTileY; ty++) {
        const worldX = tx * tileSize;
        const worldY = ty * tileSize;
        // Custom worldToScreen with parallax camera
        const screenX = worldX * camera.zoom - parallaxCamX;
        const screenY = worldY * camera.zoom - parallaxCamY;
        const screenSize = tileSize * camera.zoom;
        ctx.drawImage(layer, screenX, screenY, screenSize, screenSize);
      }
    }
  }

  ctx.globalAlpha = 1;
}

function renderStars(): void {
  for (const star of stars) {
    const screen = worldToScreen(star.x, star.y);
    if (screen.x < -5 || screen.x > gameWidth + 5 || screen.y < -5 || screen.y > gameHeight + 5) continue;

    ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
    ctx.fillRect(Math.floor(screen.x), Math.floor(screen.y), star.size, star.size);
  }
}

function renderAnimStars(): void {
  // Check if frames are loaded
  if (blueStarFramesLoaded < ANIM_STAR_FRAME_COUNT || yellowStarFramesLoaded < ANIM_STAR_FRAME_COUNT) return;

  const now = performance.now();

  for (const star of animStars) {
    const screen = worldToScreen(star.x, star.y);
    // Skip if off screen
    if (screen.x < -20 || screen.x > gameWidth + 20 || screen.y < -20 || screen.y > gameHeight + 20) continue;

    // Calculate frame with offset for variety
    const frameIndex = Math.floor(((now + star.offset) / ANIM_STAR_FRAME_DURATION) % ANIM_STAR_FRAME_COUNT);
    const frames = star.type === 'blue' ? blueStarFrames : yellowStarFrames;
    const frame = frames[frameIndex];

    if (!frame || !frame.complete) continue;

    // Draw animated star
    const size = 16 * star.scale * camera.zoom;
    ctx.drawImage(frame, screen.x - size / 2, screen.y - size / 2, size, size);
  }
}

function renderComets(): void {
  // Check if frames are loaded
  if (blueCometFramesLoaded < COMET_FRAME_COUNT || yellowCometFramesLoaded < COMET_FRAME_COUNT) return;

  const now = performance.now();

  for (const comet of comets) {
    // Check if comet needs to reposition (every 2 min)
    if (now - comet.lastReposition > COMET_REPOSITION_INTERVAL) {
      comet.x = Math.random() * WORLD_SIZE;
      comet.y = Math.random() * WORLD_SIZE;
      comet.lastReposition = now;
    }

    const screen = worldToScreen(comet.x, comet.y);
    // Skip if off screen
    if (screen.x < -30 || screen.x > gameWidth + 30 || screen.y < -30 || screen.y > gameHeight + 30) continue;

    // Calculate frame with offset for variety
    const frameIndex = Math.floor(((now + comet.offset) / COMET_FRAME_DURATION) % COMET_FRAME_COUNT);
    const frames = comet.type === 'blue' ? blueCometFrames : yellowCometFrames;
    const frame = frames[frameIndex];

    if (!frame || !frame.complete) continue;

    // Draw animated comet (slightly larger than stars)
    const size = 24 * comet.scale * camera.zoom;
    ctx.drawImage(frame, screen.x - size / 2, screen.y - size / 2, size, size);
  }
}

function renderSupplyLines(): void {
  for (const conn of supplyConnections) {
    const fromP = planetMap.get(conn.fromId);
    const toP = planetMap.get(conn.toId);
    if (!fromP || !toP) continue;

    const player = players[conn.playerId];
    if (!player) continue;

    const from = worldToScreen(fromP.x, fromP.y);
    const to = worldToScreen(toP.x, toP.y);

    ctx.strokeStyle = player.color + '22';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}

function renderSun(): void {
  const screen = worldToScreen(SUN_X, SUN_Y);
  const screenRadius = SUN_RADIUS * camera.zoom;

  // Skip if off-screen
  if (screen.x + screenRadius * 3 < 0 || screen.x - screenRadius * 3 > gameWidth) return;
  if (screen.y + screenRadius * 3 < 0 || screen.y - screenRadius * 3 > gameHeight) return;

  const time = performance.now() / 1000;

  // Outer corona glow (largest, faintest)
  const coronaRadius = screenRadius * 2.5 + Math.sin(time * 0.5) * screenRadius * 0.2;
  const coronaGrad = ctx.createRadialGradient(screen.x, screen.y, screenRadius * 0.8, screen.x, screen.y, coronaRadius);
  coronaGrad.addColorStop(0, 'rgba(255, 200, 50, 0.15)');
  coronaGrad.addColorStop(0.5, 'rgba(255, 150, 30, 0.06)');
  coronaGrad.addColorStop(1, 'rgba(255, 100, 0, 0)');
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, coronaRadius, 0, Math.PI * 2);
  ctx.fillStyle = coronaGrad;
  ctx.fill();

  // Mid glow layer (pulsing)
  const midPulse = 1.0 + Math.sin(time * 1.5) * 0.1;
  const midRadius = screenRadius * 1.6 * midPulse;
  const midGrad = ctx.createRadialGradient(screen.x, screen.y, screenRadius * 0.5, screen.x, screen.y, midRadius);
  midGrad.addColorStop(0, 'rgba(255, 220, 80, 0.3)');
  midGrad.addColorStop(0.6, 'rgba(255, 180, 40, 0.12)');
  midGrad.addColorStop(1, 'rgba(255, 120, 0, 0)');
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, midRadius, 0, Math.PI * 2);
  ctx.fillStyle = midGrad;
  ctx.fill();

  // Inner glow
  const innerGrad = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, screenRadius * 1.2);
  innerGrad.addColorStop(0, 'rgba(255, 255, 200, 0.5)');
  innerGrad.addColorStop(0.7, 'rgba(255, 200, 60, 0.25)');
  innerGrad.addColorStop(1, 'rgba(255, 150, 20, 0)');
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, screenRadius * 1.2, 0, Math.PI * 2);
  ctx.fillStyle = innerGrad;
  ctx.fill();

  // Use sun sprite animation if loaded
  if (sunFramesLoaded === SUN_FRAME_COUNT) {
    const frameIndex = Math.floor((performance.now() / SUN_FRAME_DURATION) % SUN_FRAME_COUNT);
    const frame = sunFrames[frameIndex];

    if (frame && frame.complete) {
      const spriteSize = screenRadius * 2.2;
      const drawX = screen.x - spriteSize / 2;
      const drawY = screen.y - spriteSize / 2;

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(frame, drawX, drawY, spriteSize, spriteSize);
      ctx.restore();
    }
  } else {
    // Fallback: simple orange circle while loading
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, screenRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ff9020';
    ctx.fill();
  }

  // Solar flares (animated rays) - shorter
  if (screenRadius > 10) {
    const flareCount = 8;
    for (let i = 0; i < flareCount; i++) {
      const angle = (i / flareCount) * Math.PI * 2 + time * 0.2;
      const flareLen = screenRadius * (0.1 + Math.sin(time * 2 + i * 1.5) * 0.05); // Shorter flares
      const startR = screenRadius * 0.95;
      const sx = screen.x + Math.cos(angle) * startR;
      const sy = screen.y + Math.sin(angle) * startR;
      const ex = screen.x + Math.cos(angle) * (startR + flareLen);
      const ey = screen.y + Math.sin(angle) * (startR + flareLen);

      const flareAlpha = 0.3 + Math.sin(time * 3 + i) * 0.2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = `rgba(255, 200, 50, ${flareAlpha})`;
      ctx.lineWidth = Math.max(1, 3 * camera.zoom);
      ctx.stroke();
    }
  }

  // Unit count on sun
  if (screenRadius > 15) {
    // Find sun planet to get current units
    const sunP = planets.find(p => p.x === SUN_X && p.y === SUN_Y && p.radius === SUN_RADIUS);
    if (sunP && sunP.units > 0) {
      const unitStr = sunP.units >= 1000000 ? `${(sunP.units / 1000000).toFixed(1)}M`
        : sunP.units >= 1000 ? `${Math.floor(sunP.units / 1000)}K`
        : `${Math.floor(sunP.units)}`;
      const fontSize = Math.max(12, Math.min(28, screenRadius * 0.15));
      ctx.font = `bold ${fontSize}px "Press Start 2P"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 5;
      ctx.fillStyle = '#fff';
      ctx.fillText(unitStr, screen.x, screen.y);
      ctx.shadowBlur = 0;
    }
  }
}

function renderPlanet(planet: Planet): void {
  // Sun is rendered separately by renderSun()
  if (planet.x === SUN_X && planet.y === SUN_Y && planet.radius === SUN_RADIUS) return;

  const screen = worldToScreen(planet.x, planet.y);
  const screenRadius = planet.radius * camera.zoom;

  if (screen.x + screenRadius < 0 || screen.x - screenRadius > gameWidth) return;
  if (screen.y + screenRadius < 0 || screen.y - screenRadius > gameHeight) return;

  // Fog of war: check visibility (used for hiding unit counts)
  const visible = isVisibleToPlayer(planet);

  // Planet pulse/glow for owned planets
  let glowRadius = 0;
  if (planet.ownerId !== -1 && visible) {
    planet.pulsePhase += 0.02;
    glowRadius = screenRadius + 3 + Math.sin(planet.pulsePhase) * 2;
  }

  // Glow effect
  if (glowRadius > 0 && planet.ownerId !== -1) {
    const player = players[planet.ownerId];
    if (player) {
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, glowRadius, 0, Math.PI * 2);
      ctx.strokeStyle = player.color + '33';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // === PLAYER OWNED PLANET EFFECTS ===
  const isPlayerPlanet = planet.ownerId === 0;

  // Effect 1: Glowing aura (švytinti aura) - rendered BEFORE planet - GREEN - constant
  if (isPlayerPlanet && visible) {
    const auraPulse = 0.7; // Constant glow, no pulsing

    // Outer aura glow - stronger at planet edge - GREEN
    const auraGradient = ctx.createRadialGradient(
      screen.x, screen.y, screenRadius * 0.9,
      screen.x, screen.y, screenRadius * 2.0
    );
    auraGradient.addColorStop(0, `rgba(100, 255, 120, ${auraPulse * 0.9})`);
    auraGradient.addColorStop(0.2, `rgba(80, 220, 100, ${auraPulse * 0.7})`);
    auraGradient.addColorStop(0.5, `rgba(60, 180, 80, ${auraPulse * 0.35})`);
    auraGradient.addColorStop(0.8, `rgba(50, 150, 60, ${auraPulse * 0.1})`);
    auraGradient.addColorStop(1, 'rgba(50, 150, 60, 0)');

    ctx.beginPath();
    ctx.arc(screen.x, screen.y, screenRadius * 2.0, 0, Math.PI * 2);
    ctx.fillStyle = auraGradient;
    ctx.fill();
  }

  // Shield is INVISIBLE until hit - no rendering here
  // Shield flicker effect is rendered separately when attack hits it

  // Planet body
  const isDiscovered = discoveredPlanets.has(planet.id) || planet.ownerId === 0;
  const isHomePlanet = players.length > 0 && planet.id === players[0].homeId;

  const isPlayerOwned = planet.ownerId === 0 && !isHomePlanet;

  // Determine which sprite set to use for this planet (ALL planets use sprites now)
  // Small planets (asteroid, tiny, small, moons): moon sprites (60 frames)
  // Medium planets: home planet sprites (120 frames)
  // Large+ planets (large, giant, mega, titan, colossus) + home: large/home sprites (120 frames)
  const isSmallPlanet = planet.size === PlanetSize.ASTEROID || planet.size === PlanetSize.TINY || planet.size === PlanetSize.SMALL;
  const isMediumPlanet = planet.size === PlanetSize.MEDIUM;
  const isLargePlanet = planet.size === PlanetSize.LARGE;
  const isGiantPlanet = planet.size === PlanetSize.GIANT || planet.size === PlanetSize.MEGA ||
                        planet.size === PlanetSize.TITAN || planet.size === PlanetSize.COLOSSUS;

  // Check if sprites are loaded
  const moonSpritesReady = moonFramesLoaded === MOON_FRAME_COUNT;
  const iceSpritesReady = icePlanetFramesLoaded === ICE_PLANET_FRAME_COUNT;
  const moon2SpritesReady = moon2FramesLoaded === MOON2_FRAME_COUNT;
  const moon3SpritesReady = moon3FramesLoaded === MOON3_FRAME_COUNT;
  const homeSpritesReady = homePlanetFramesLoaded === HOME_PLANET_FRAME_COUNT;
  const mediumDesertReady = mediumDesertFramesLoaded === MEDIUM_DESERT_FRAME_COUNT;
  const mediumLavaReady = mediumLavaFramesLoaded === MEDIUM_LAVA_FRAME_COUNT;
  const mediumLava3Ready = mediumLava3FramesLoaded === MEDIUM_LAVA3_FRAME_COUNT;
  const mediumTran02Ready = mediumTran02FramesLoaded === MEDIUM_TRAN02_FRAME_COUNT;
  const largeSpritesReady = largePlanetFramesLoaded === LARGE_PLANET_FRAME_COUNT;
  const giantSpritesReady = giantPlanetFramesLoaded === GIANT_PLANET_FRAME_COUNT;
  const blackHoleReady = blackHoleFramesLoaded === BLACK_HOLE_FRAME_COUNT;

  // Determine sprite type for this planet
  let spriteType: 'moon' | 'ice' | 'moon2' | 'moon3' | 'home' | 'mediumDesert' | 'mediumLava' | 'mediumLava3' | 'mediumTran02' | 'large' | 'giant' | 'blackHole' | 'none' = 'none';
  if (planet.isBlackHole && blackHoleReady) {
    spriteType = 'blackHole';
  } else if (isHomePlanet && homeSpritesReady) {
    spriteType = 'home';
  } else if (planet.isMoon || isSmallPlanet) {
    // Small planets alternate between 4 variants: moon, ice, moon2, moon3
    const smallVariant = planet.id % 4;
    if (smallVariant === 0 && moonSpritesReady) {
      spriteType = 'moon';
    } else if (smallVariant === 1 && iceSpritesReady) {
      spriteType = 'ice';
    } else if (smallVariant === 2 && moon2SpritesReady) {
      spriteType = 'moon2';
    } else if (moon3SpritesReady) {
      spriteType = 'moon3';
    } else if (moonSpritesReady) {
      spriteType = 'moon';
    }
  } else if (isMediumPlanet) {
    // Medium planets alternate between 5 variants: home, desert02, lava01, lava3, tran02
    const mediumVariant = planet.id % 5;
    if (mediumVariant === 0 && homeSpritesReady) {
      spriteType = 'home';
    } else if (mediumVariant === 1 && mediumDesertReady) {
      spriteType = 'mediumDesert';
    } else if (mediumVariant === 2 && mediumLavaReady) {
      spriteType = 'mediumLava';
    } else if (mediumVariant === 3 && mediumLava3Ready) {
      spriteType = 'mediumLava3';
    } else if (mediumTran02Ready) {
      spriteType = 'mediumTran02';
    } else if (homeSpritesReady) {
      spriteType = 'home';
    }
  } else if (isLargePlanet && largeSpritesReady) {
    spriteType = 'large';
  } else if (isGiantPlanet && giantSpritesReady) {
    spriteType = 'giant';
  }

  if (spriteType !== 'none') {
    // Render planet using animated sprite frames with alpha blending
    let frames: HTMLImageElement[];
    let frameCount: number;
    let frameDuration: number;

    if (spriteType === 'moon') {
      frames = moonFrames;
      frameCount = MOON_FRAME_COUNT;
      frameDuration = MOON_FRAME_DURATION;
    } else if (spriteType === 'ice') {
      frames = icePlanetFrames;
      frameCount = ICE_PLANET_FRAME_COUNT;
      frameDuration = ICE_PLANET_FRAME_DURATION;
    } else if (spriteType === 'moon2') {
      frames = moon2Frames;
      frameCount = MOON2_FRAME_COUNT;
      frameDuration = MOON2_FRAME_DURATION;
    } else if (spriteType === 'moon3') {
      frames = moon3Frames;
      frameCount = MOON3_FRAME_COUNT;
      frameDuration = MOON3_FRAME_DURATION;
    } else if (spriteType === 'home') {
      frames = homePlanetFrames;
      frameCount = HOME_PLANET_FRAME_COUNT;
      frameDuration = HOME_PLANET_FRAME_DURATION;
    } else if (spriteType === 'mediumDesert') {
      frames = mediumDesertFrames;
      frameCount = MEDIUM_DESERT_FRAME_COUNT;
      frameDuration = MEDIUM_DESERT_FRAME_DURATION;
    } else if (spriteType === 'mediumLava') {
      frames = mediumLavaFrames;
      frameCount = MEDIUM_LAVA_FRAME_COUNT;
      frameDuration = MEDIUM_LAVA_FRAME_DURATION;
    } else if (spriteType === 'mediumLava3') {
      frames = mediumLava3Frames;
      frameCount = MEDIUM_LAVA3_FRAME_COUNT;
      frameDuration = MEDIUM_LAVA3_FRAME_DURATION;
    } else if (spriteType === 'mediumTran02') {
      frames = mediumTran02Frames;
      frameCount = MEDIUM_TRAN02_FRAME_COUNT;
      frameDuration = MEDIUM_TRAN02_FRAME_DURATION;
    } else if (spriteType === 'blackHole') {
      frames = blackHoleFrames;
      frameCount = BLACK_HOLE_FRAME_COUNT;
      frameDuration = BLACK_HOLE_FRAME_DURATION;
    } else if (spriteType === 'giant') {
      // Giant planets alternate between 4 variants
      const giantVariant = planet.id % 4;
      if (giantVariant === 0 && giantPlanetFramesLoaded === GIANT_PLANET_FRAME_COUNT) {
        frames = giantPlanetFrames;
      } else if (giantVariant === 1 && giantPlanetFrames2Loaded === GIANT_PLANET_FRAME_COUNT) {
        frames = giantPlanetFrames2;
      } else if (giantVariant === 2 && giantPlanetFrames3Loaded === GIANT_PLANET_FRAME_COUNT) {
        frames = giantPlanetFrames3;
      } else if (giantPlanetFrames4Loaded === GIANT_PLANET_FRAME_COUNT) {
        frames = giantPlanetFrames4;
      } else {
        frames = giantPlanetFrames;
      }
      frameCount = GIANT_PLANET_FRAME_COUNT;
      frameDuration = GIANT_PLANET_FRAME_DURATION;
    } else {
      // Large planet - pick variant based on planet id (5 variants for variety)
      const variant = planet.id % 5;
      if (variant === 0 && largePlanetFramesLoaded === LARGE_PLANET_FRAME_COUNT) {
        frames = largePlanetFrames;
        frameCount = LARGE_PLANET_FRAME_COUNT;
        frameDuration = LARGE_PLANET_FRAME_DURATION;
      } else if (variant === 1 && largePlanetFrames2Loaded === LARGE_PLANET_FRAME_COUNT) {
        frames = largePlanetFrames2;
        frameCount = LARGE_PLANET_FRAME_COUNT;
        frameDuration = LARGE_PLANET_FRAME_DURATION;
      } else if (variant === 2 && largePlanetFrames3Loaded === LARGE_PLANET_FRAME_COUNT) {
        frames = largePlanetFrames3;
        frameCount = LARGE_PLANET_FRAME_COUNT;
        frameDuration = LARGE_PLANET_FRAME_DURATION;
      } else if (variant === 3 && largePlanetFrames4Loaded === LARGE_PLANET_FRAME_COUNT) {
        frames = largePlanetFrames4;
        frameCount = LARGE_PLANET_FRAME_COUNT;
        frameDuration = LARGE_PLANET_FRAME_DURATION;
      } else if (variant === 4 && largePlanetFrames5Loaded === DESERT_PLANET_FRAME_COUNT) {
        frames = largePlanetFrames5;
        frameCount = DESERT_PLANET_FRAME_COUNT;
        frameDuration = LARGE_PLANET_FRAME_DURATION;
      } else {
        frames = largePlanetFrames; // fallback
        frameCount = LARGE_PLANET_FRAME_COUNT;
        frameDuration = LARGE_PLANET_FRAME_DURATION;
      }
    }

    // Each planet has slightly different rotation speed for variety
    const speedVariation = 0.7 + (planet.id % 7) * 0.1; // 0.7x to 1.3x speed
    const adjustedDuration = frameDuration / speedVariation;

    // All planets rotate
    const frameIndex = Math.floor((performance.now() / adjustedDuration) % frameCount);
    const frame = frames[frameIndex];

    if (frame && frame.complete) {
      const spriteSize = screenRadius * 2.2;
      const drawX = screen.x - spriteSize / 2;
      const drawY = screen.y - spriteSize / 2;

      ctx.save();
      ctx.imageSmoothingEnabled = false; // Keep pixel art crisp
      ctx.drawImage(frame, drawX, drawY, spriteSize, spriteSize);
      ctx.restore();
    }
  } else {
    // Fallback: Regular circle planet (only if sprites not loaded)
    let bodyColor = isDiscovered ? planet.color : '#4a4a4a';
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

    // Craters
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
  }

  // Planet outline (skip for sprite planets)
  if (spriteType === 'none') {
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, screenRadius, 0, Math.PI * 2);
    ctx.strokeStyle = planet.ownerId !== -1 ? (players[planet.ownerId]?.colorDark || '#444') : '#444';
    ctx.lineWidth = planet.ownerId !== -1 ? 2 : 1;
    ctx.stroke();
  }


  // Disconnected indicator (skip for large sprite planets)
  if (planet.ownerId !== -1 && !planet.connected && spriteType !== 'large') {
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, screenRadius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff000066';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Generator indicator (skip for large sprite planets)
  if (planet.ownerId === 0 && planet.generating && screenRadius > 6 && spriteType !== 'large') {
    const pulse = 0.4 + Math.sin(planet.pulsePhase + performance.now() * 0.003) * 0.3;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, screenRadius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180, 255, 50, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Units number - on all planets (thin and bright font)
  if (screenRadius > 8 && planet.units > 0) {
    const showUnits = visible || planet.ownerId === 0;
    if (showUnits) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;

      // Thinner font - use Arial or sans-serif instead of pixel font
      const fontSize = Math.max(13, Math.min(17, screenRadius * 0.5));
      ctx.font = `${fontSize}px Arial, sans-serif`;

      // Cap display at 99 for very small planets
      const isVerySmall = planet.size === PlanetSize.ASTEROID || planet.size === PlanetSize.TINY;
      const rawUnits = isVerySmall ? Math.min(99, Math.floor(planet.units)) : Math.floor(planet.units);
      let unitsText: string;
      if (rawUnits >= 1000) {
        const k = rawUnits / 1000;
        if (k === Math.floor(k)) {
          unitsText = `${Math.floor(k)}k`;
        } else {
          unitsText = `${k.toFixed(1)}k`;
        }
      } else {
        unitsText = rawUnits.toString();
      }

      // All white color
      const textColor = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Black outline for visibility on any background
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(unitsText, Math.round(screen.x), Math.round(screen.y));

      // Main text - bright
      ctx.fillStyle = textColor;
      ctx.fillText(unitsText, Math.round(screen.x), Math.round(screen.y));

      ctx.restore();
    } else {
      const fontSize = Math.max(8, Math.min(14, screenRadius * 0.4));
      ctx.font = `${fontSize}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#888';
      ctx.fillText('?', screen.x, screen.y);
    }
  }


  // "YOU" label above home planet
  if (isHomePlanet && visible) {
    ctx.save();
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Black outline for visibility
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText('YOU', Math.round(screen.x), Math.round(screen.y - screenRadius - 23));

    // Softer green text
    ctx.fillStyle = '#88cc99';
    ctx.fillText('YOU', Math.round(screen.x), Math.round(screen.y - screenRadius - 23));
    ctx.restore();
  }

  // Size label - DISABLED
  // if (screenRadius > 30 && (planet.size === PlanetSize.LARGE || planet.size === PlanetSize.GIANT)) {
  //   ctx.font = '10px "Press Start 2P"';
  //   ctx.fillStyle = '#ffffff66';
  //   ctx.textAlign = 'center';
  //   ctx.fillText(planet.size.toUpperCase(), screen.x, screen.y + screenRadius * 0.5);
  // }

  // Mode indicator (SCOUT label, BOOST uses green ring)
  if (planet.ownerId === 0 && modePlanetId === planet.id) {
    if (planetMode === 'scout') {
      ctx.font = '10px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#66ccff';
      ctx.fillText('SCOUT MODE', Math.round(screen.x), Math.round(screen.y - screenRadius - 6));
    }
  }

  // === PLAYER OWNED PLANET EFFECTS (AFTER PLANET) ===
  if (isPlayerPlanet && visible) {
    const time = performance.now() / 1000;

    // Effect: Energy shield bubble (energijos skydas)
    const shieldRadius = screenRadius * 1.15;
    const shieldPulse = 0.15 + Math.sin(time * 3 + planet.id) * 0.05;

    // Shield outer ring
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, shieldRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100, 255, 150, ${shieldPulse})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Shield inner glow ring
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, shieldRadius - 2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(150, 255, 200, ${shieldPulse * 0.5})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Hexagonal pattern hint (pixel art style shield segments)
    const segmentCount = 6;
    for (let i = 0; i < segmentCount; i++) {
      const segAngle = (i / segmentCount) * Math.PI * 2 + time * 0.5;
      const segX1 = screen.x + Math.cos(segAngle) * shieldRadius;
      const segY1 = screen.y + Math.sin(segAngle) * shieldRadius;
      const segX2 = screen.x + Math.cos(segAngle) * (shieldRadius - 6);
      const segY2 = screen.y + Math.sin(segAngle) * (shieldRadius - 6);

      ctx.beginPath();
      ctx.moveTo(segX1, segY1);
      ctx.lineTo(segX2, segY2);
      ctx.strokeStyle = `rgba(100, 255, 150, ${shieldPulse * 0.8})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1.0;
}

function renderAttacks(): void {
  for (const attack of attacks) {
    const player = players[attack.playerId];
    if (!player) continue;

    // Use stored world position and convert to screen
    const startScreen = worldToScreen(attack.startX, attack.startY);
    const currentScreen = worldToScreen(attack.x, attack.y);
    const cx = currentScreen.x;
    const cy = currentScreen.y;

    // Trail line from start to current position
    ctx.strokeStyle = player.color + '33';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startScreen.x, startScreen.y);
    ctx.lineTo(cx, cy);
    ctx.stroke();

    // Use stored angle (homing direction)
    const angle = attack.angle;
    const shipColor = attack.isBlitz ? '#FFD700' : player.color;
    const time = performance.now() / 1000;

    // Choose ship type based on unit count: pod (1-100), fighter (101+)
    const usePod = attack.units <= 100;

    ctx.save();
    ctx.translate(cx, cy);

    if (usePod && podSpriteLoaded && podSprite.complete && podSprite.naturalWidth > 0) {
      // === POD (small rocket, 1-100 units) ===
      const podSize = Math.max(14, 22 * camera.zoom);
      const spriteSize = podSize * 1.3;

      // Rotate to face travel direction (sprite points UP by default, so add PI/2)
      ctx.rotate(angle + Math.PI / 2);

      // Drill spin effect - oscillate scale X to simulate cylinder spinning
      const drillSpin = time * 10;
      const scaleX = 0.75 + Math.abs(Math.sin(drillSpin)) * 0.25;

      // Yellow/orange engine flame (behind pod = positive Y)
      const flameFlicker = 0.6 + Math.sin(time * 30) * 0.4;
      const flameSize = spriteSize * 0.4 * flameFlicker;

      // Outer flame (orange)
      ctx.beginPath();
      ctx.ellipse(0, spriteSize * 0.5, spriteSize * 0.12, flameSize, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 120, 20, ${0.8 * flameFlicker})`;
      ctx.fill();

      // Middle flame (yellow)
      ctx.beginPath();
      ctx.ellipse(0, spriteSize * 0.45, spriteSize * 0.08, flameSize * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 200, 50, ${0.9 * flameFlicker})`;
      ctx.fill();

      // Inner flame (white-yellow core)
      ctx.beginPath();
      ctx.ellipse(0, spriteSize * 0.4, spriteSize * 0.04, flameSize * 0.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 200, ${flameFlicker})`;
      ctx.fill();

      // Draw pod sprite with drill rotation effect (scale X for spinning look)
      ctx.save();
      ctx.scale(scaleX, 1);
      ctx.drawImage(podSprite, -spriteSize / 2 / scaleX, -spriteSize / 2, spriteSize / scaleX, spriteSize);
      ctx.restore();

      // Spinning highlight moving around the cylinder
      const highlightX = Math.sin(drillSpin * 2) * spriteSize * 0.1;
      ctx.beginPath();
      ctx.arc(highlightX, -spriteSize * 0.15, spriteSize * 0.04, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + Math.sin(drillSpin) * 0.2})`;
      ctx.fill();

    } else if (!usePod && fighterSpriteLoaded && fighterSprite.complete && fighterSprite.naturalWidth > 0) {
      // === FIGHTER (large ship, 101+ units) ===
      const shipSize = Math.max(16, 28 * camera.zoom);
      const spriteSize = shipSize * 1.5;

      // Rotate to face travel direction
      ctx.rotate(angle + Math.PI / 2);

      // Engine thruster glow (behind ship)
      const glowPulse = 0.5 + Math.sin(time * 20) * 0.3;
      const engineFlicker = 0.7 + Math.sin(time * 35) * 0.3;

      // Main engine flame
      ctx.beginPath();
      ctx.ellipse(0, spriteSize * 0.45, spriteSize * 0.15 * engineFlicker, spriteSize * 0.3 * glowPulse, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 200, 255, ${0.8 * engineFlicker})`;
      ctx.fill();

      // Inner hot core
      ctx.beginPath();
      ctx.ellipse(0, spriteSize * 0.4, spriteSize * 0.08 * engineFlicker, spriteSize * 0.15 * glowPulse, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 255, 255, ${0.9 * engineFlicker})`;
      ctx.fill();

      // Draw fighter sprite
      ctx.drawImage(fighterSprite, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);

      // Cockpit light blink
      const blinkOn = Math.sin(time * 4) > 0.3;
      if (blinkOn) {
        ctx.beginPath();
        ctx.arc(0, -spriteSize * 0.25, spriteSize * 0.05, 0, Math.PI * 2);
        ctx.fillStyle = attack.isBlitz ? '#FFD700' : '#00ff88';
        ctx.fill();
      }

      // Player color aura
      ctx.beginPath();
      ctx.arc(0, 0, spriteSize * 0.6, 0, Math.PI * 2);
      const auraGradient = ctx.createRadialGradient(0, 0, spriteSize * 0.3, 0, 0, spriteSize * 0.6);
      auraGradient.addColorStop(0, shipColor + '00');
      auraGradient.addColorStop(0.7, shipColor + '22');
      auraGradient.addColorStop(1, shipColor + '00');
      ctx.fillStyle = auraGradient;
      ctx.fill();
    } else {
      // Fallback: draw triangle if sprites not loaded
      const fallbackSize = Math.max(12, 20 * camera.zoom);
      ctx.rotate(angle);

      // Ship body (triangle)
      ctx.beginPath();
      ctx.moveTo(fallbackSize, 0);
      ctx.lineTo(-fallbackSize * 0.7, -fallbackSize * 0.5);
      ctx.lineTo(-fallbackSize * 0.3, 0);
      ctx.lineTo(-fallbackSize * 0.7, fallbackSize * 0.5);
      ctx.closePath();
      ctx.fillStyle = shipColor;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Engine glow
      const glowPulse = 0.6 + Math.sin(time * 15) * 0.4;
      ctx.beginPath();
      ctx.arc(-fallbackSize * 0.4, 0, fallbackSize * 0.25 * glowPulse, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 200, 100, ${glowPulse * 0.7})`;
      ctx.fill();
    }

    ctx.restore();

    // Unit count label
    if (camera.zoom > 0.4) {
      const labelOffset = usePod ? 18 : 28;
      ctx.font = '10px "Press Start 2P"';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(Math.floor(attack.units).toString(), cx, cy - labelOffset * camera.zoom);
    }
  }
}

function renderTurretRadars(): void {
  for (const planet of planets) {
    if (planet.ownerId === -1) continue;
    if (!isVisibleToPlayer(planet)) continue;

    const hasTurret = planet.buildings.some(b => b && b.type === 'turret');
    if (!hasTurret) continue;

    // Only show radar when this planet is selected
    if (!selectedPlanets.has(planet.id)) continue;

    const screen = worldToScreen(planet.x, planet.y);
    const radarRadius = TURRET_FIRE_DISTANCE * camera.zoom;

    // Radar zone (pulsing circle)
    const pulse = 0.3 + Math.sin(gameTime / 200) * 0.1;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radarRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 102, 68, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Inner glow
    const gradient = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, radarRadius);
    gradient.addColorStop(0, 'rgba(255, 102, 68, 0)');
    gradient.addColorStop(0.7, 'rgba(255, 102, 68, 0)');
    gradient.addColorStop(1, `rgba(255, 102, 68, ${pulse * 0.15})`);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radarRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Scanning line (rotating) - slower rotation
    const scanAngle = (gameTime / 1500) % (Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y);
    ctx.lineTo(
      screen.x + Math.cos(scanAngle) * radarRadius,
      screen.y + Math.sin(scanAngle) * radarRadius
    );
    ctx.strokeStyle = 'rgba(255, 102, 68, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function renderTurretMissiles(): void {
  for (const missile of turretMissiles) {
    // Don't render missiles still waiting to launch
    if (missile.delay > 0) continue;

    const screen = worldToScreen(missile.x, missile.y);
    const attack = attacks[missile.targetAttackIndex];

    // Get target position for direction
    let targetScreen = screen;
    if (attack) {
      const attackPos = getAttackCurrentPosition(attack);
      if (attackPos) {
        targetScreen = worldToScreen(attackPos.x, attackPos.y);
      }
    }

    // Calculate direction angle
    const angle = Math.atan2(targetScreen.y - screen.y, targetScreen.x - screen.x);

    // Missile body (triangle pointing at target)
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(6, 0); // nose
    ctx.lineTo(-4, -3);
    ctx.lineTo(-4, 3);
    ctx.closePath();
    ctx.fillStyle = '#ff4400';
    ctx.fill();

    // Engine trail
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-12, 0);
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    // Glow
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 68, 0, 0.4)';
    ctx.fill();
  }
}

function renderDroneProjectiles(): void {
  for (const proj of droneProjectiles) {
    const missile = turretMissiles[proj.targetMissileIndex];
    if (!missile) continue;

    const screen = worldToScreen(proj.x, proj.y);
    const targetScreen = worldToScreen(missile.x, missile.y);

    // Calculate direction angle
    const angle = Math.atan2(targetScreen.y - screen.y, targetScreen.x - screen.x);

    // Small purple projectile
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(angle);

    // Projectile body (small triangle)
    ctx.beginPath();
    ctx.moveTo(5, 0); // nose
    ctx.lineTo(-3, -2);
    ctx.lineTo(-3, 2);
    ctx.closePath();
    ctx.fillStyle = '#b868d8';
    ctx.fill();

    // Trail
    ctx.beginPath();
    ctx.moveTo(-3, 0);
    ctx.lineTo(-10, 0);
    ctx.strokeStyle = '#d898f8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    // Glow
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(184, 104, 216, 0.5)';
    ctx.fill();
  }
}

function renderProbes(): void {
  for (const probe of probes) {
    if (probe.done) continue;
    const screen = worldToScreen(probe.x, probe.y);

    // Trail line from origin
    const originScreen = worldToScreen(
      probe.x - (probe.x - probe.targetX) * 0.1,
      probe.y - (probe.y - probe.targetY) * 0.1
    );

    ctx.strokeStyle = '#44ff8855';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(originScreen.x, originScreen.y);
    ctx.lineTo(screen.x, screen.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Probe dot (green pulsing)
    const pulse = 1 + Math.sin(gameTime / 100) * 0.3;
    const dotSize = 4 * camera.zoom * pulse;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, dotSize, 0, Math.PI * 2);
    ctx.fillStyle = '#44ff88';
    ctx.fill();

    // Glow
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, dotSize + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#44ff8844';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function renderOrbitProbes(): void {
  for (const probe of orbitProbes) {
    const planet = planetMap.get(probe.targetPlanetId);
    if (!planet) continue;

    // Calculate probe position on orbit
    const probeX = planet.x + Math.cos(probe.orbitAngle) * probe.orbitRadius;
    const probeY = planet.y + Math.sin(probe.orbitAngle) * probe.orbitRadius;
    const screen = worldToScreen(probeX, probeY);
    const planetScreen = worldToScreen(planet.x, planet.y);

    // Orbit path (dashed circle)
    ctx.strokeStyle = 'rgba(68, 255, 136, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(planetScreen.x, planetScreen.y, probe.orbitRadius * camera.zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Probe dot (pulsing green)
    const pulse = 1 + Math.sin(gameTime / 100) * 0.3;
    const dotSize = 5 * camera.zoom * pulse;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, dotSize, 0, Math.PI * 2);
    ctx.fillStyle = '#44ffaa';
    ctx.fill();

    // Glow
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, dotSize + 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#44ffaa44';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Orbits remaining indicator
    ctx.font = '10px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#44ffaa';
    ctx.fillText(`${probe.orbitsRemaining}`, Math.round(screen.x), Math.round(screen.y - dotSize - 8));
  }
}

function renderParticles(): void {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1.0;
}

function renderBattles(): void {
  const now = performance.now();
  for (const battle of battles) {
    const planet = planetMap.get(battle.planetId);
    if (!planet) continue;

    const screen = worldToScreen(planet.x, planet.y);
    const r = planet.radius * camera.zoom;
    const elapsed = (now - battle.startTime) / 1000;
    const progress = Math.min(1, elapsed / battle.duration);

    // Pulsing battle ring
    const pulseSpeed = 8 + progress * 12; // speeds up as battle progresses
    const pulse = 0.5 + Math.sin(elapsed * pulseSpeed) * 0.3;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, r + 6 + Math.sin(elapsed * 6) * 3, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 100, 50, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Outer shockwave ring expanding
    const waveR = r + 10 + progress * 20;
    const waveAlpha = 0.4 * (1 - progress);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, waveR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 200, 50, ${waveAlpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Clash sparks (small lines radiating from planet)
    const sparkCount = 4 + Math.floor(progress * 4);
    for (let i = 0; i < sparkCount; i++) {
      const angle = (i / sparkCount) * Math.PI * 2 + elapsed * 3;
      const sparkR = r + 4 + Math.sin(elapsed * 10 + i * 2) * 6;
      const sparkLen = 4 + Math.random() * 4;
      const sx = screen.x + Math.cos(angle) * sparkR;
      const sy = screen.y + Math.sin(angle) * sparkR;
      const ex = screen.x + Math.cos(angle) * (sparkR + sparkLen);
      const ey = screen.y + Math.sin(angle) * (sparkR + sparkLen);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = `rgba(255, 255, 150, ${0.3 + Math.random() * 0.5})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Battle progress bar below planet
    const barW = r * 2;
    const barH = 4;
    const barX = screen.x - barW / 2;
    const barY = screen.y + r + 10;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = `rgba(255, ${Math.floor(100 + progress * 155)}, 50, 0.9)`;
    ctx.fillRect(barX, barY, barW * progress, barH);

    // Attacker vs Defender unit labels
    if (r > 12) {
      ctx.font = '6px "Press Start 2P"';
      ctx.textBaseline = 'middle';
      const attackColor = players[battle.attackPlayerId]?.color || '#ff4444';
      const defendColor = players[battle.defendPlayerId]?.color || '#4444ff';

      // Show units decreasing during battle
      const attackShow = Math.floor(battle.attackUnits * (1 - progress * 0.3));
      const defendShow = Math.floor(battle.defendUnits * (1 - progress * 0.5));

      ctx.textAlign = 'right';
      ctx.fillStyle = attackColor;
      ctx.fillText(`${attackShow}`, screen.x - 4, screen.y);

      ctx.textAlign = 'left';
      ctx.fillStyle = defendColor;
      ctx.fillText(`${defendShow}`, screen.x + 4, screen.y);

      // VS symbol
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = '5px "Press Start 2P"';
      ctx.fillText('x', screen.x, screen.y);
    }
  }
}

function renderFogOfWar(): void {
  // No fog during initial reveal period
  if (gameTime < FOG_REVEAL_DURATION) return;

  // Calculate fog opacity (fades in after reveal)
  const fadeProgress = Math.min(1, (gameTime - FOG_REVEAL_DURATION) / FOG_FADE_IN_DURATION);
  const fogOpacity = 0.93 * fadeProgress;
  if (fogOpacity < 0.01) return;

  // Create/resize offscreen canvas
  if (!fogCanvas || fogCanvas.width !== gameWidth || fogCanvas.height !== gameHeight) {
    fogCanvas = document.createElement('canvas');
    fogCanvas.width = gameWidth;
    fogCanvas.height = gameHeight;
    fogCtx = fogCanvas.getContext('2d')!;
  }

  const fc = fogCtx!;

  // Fill with darkness (opacity increases during fade-in)
  fc.globalCompositeOperation = 'source-over';
  fc.fillStyle = `rgba(5, 5, 16, ${fogOpacity})`;
  fc.fillRect(0, 0, gameWidth, gameHeight);

  // Cut out vision circles around player-owned planets
  fc.globalCompositeOperation = 'destination-out';

  // Sun is always visible (brightest object)
  {
    const sunScreen = worldToScreen(SUN_X, SUN_Y);
    const sunVisionRadius = SUN_RADIUS * 2.5 * camera.zoom;

    const sunGrad = fc.createRadialGradient(
      sunScreen.x, sunScreen.y, sunVisionRadius * 0.4,
      sunScreen.x, sunScreen.y, sunVisionRadius
    );
    sunGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    fc.fillStyle = sunGrad;
    fc.beginPath();
    fc.arc(sunScreen.x, sunScreen.y, sunVisionRadius, 0, Math.PI * 2);
    fc.fill();
  }

  for (const planet of planets) {
    if (planet.ownerId !== 0) continue;

    const screen = worldToScreen(planet.x, planet.y);
    const visionRadius = getVisionRange(planet) * camera.zoom;

    // Radial gradient for smooth edge
    const gradient = fc.createRadialGradient(
      screen.x, screen.y, visionRadius * 0.5,
      screen.x, screen.y, visionRadius
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    fc.fillStyle = gradient;
    fc.beginPath();
    fc.arc(screen.x, screen.y, visionRadius, 0, Math.PI * 2);
    fc.fill();
  }

  // Cut out light from flying attacks (player only)
  for (const attack of attacks) {
    if (attack.playerId !== 0) continue;
    const from = planetMap.get(attack.fromId);
    const to = planetMap.get(attack.toId);
    if (!from || !to) continue;

    const wx = from.x + (to.x - from.x) * attack.progress;
    const wy = from.y + (to.y - from.y) * attack.progress;
    const screen = worldToScreen(wx, wy);
    const lightRadius = 250 * camera.zoom;

    const gradient = fc.createRadialGradient(
      screen.x, screen.y, lightRadius * 0.3,
      screen.x, screen.y, lightRadius
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    fc.fillStyle = gradient;
    fc.beginPath();
    fc.arc(screen.x, screen.y, lightRadius, 0, Math.PI * 2);
    fc.fill();
  }

  // Cut out light from probes (scouts)
  for (const probe of probes) {
    if (probe.done) continue;
    const screen = worldToScreen(probe.x, probe.y);
    const lightRadius = 300 * camera.zoom;

    const gradient = fc.createRadialGradient(
      screen.x, screen.y, lightRadius * 0.3,
      screen.x, screen.y, lightRadius
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    fc.fillStyle = gradient;
    fc.beginPath();
    fc.arc(screen.x, screen.y, lightRadius, 0, Math.PI * 2);
    fc.fill();
  }

  // Cut out reveal zones (from probes and permanent start zone)
  for (const zone of revealZones) {
    const screen = worldToScreen(zone.x, zone.y);
    const zoneRadius = zone.radius * camera.zoom;

    // Fade out near end of life
    let alpha = 1.0;
    if (!zone.permanent && zone.timeLeft < 3000) {
      alpha = zone.timeLeft / 3000;
    }

    const gradient = fc.createRadialGradient(
      screen.x, screen.y, zoneRadius * 0.6,
      screen.x, screen.y, zoneRadius
    );
    gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    fc.fillStyle = gradient;
    fc.beginPath();
    fc.arc(screen.x, screen.y, zoneRadius, 0, Math.PI * 2);
    fc.fill();
  }

  fc.globalCompositeOperation = 'source-over';

  // Draw fog overlay on main canvas
  ctx.drawImage(fogCanvas, 0, 0);

  // Brighten revealed areas with subtle glow
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const planet of planets) {
    if (planet.ownerId !== 0) continue;
    const screen = worldToScreen(planet.x, planet.y);
    const visionRadius = getVisionRange(planet) * camera.zoom;

    const glow = ctx.createRadialGradient(
      screen.x, screen.y, 0,
      screen.x, screen.y, visionRadius * 0.7
    );
    glow.addColorStop(0, 'rgba(40, 50, 80, 0.12)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, visionRadius * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function getPopupLayout(popup: ActionPopup) {
  const btnW = Math.round(120 * UI_SCALE);
  const btnH = Math.round(38 * UI_SCALE);
  const padding = Math.round(10 * UI_SCALE);
  const hasSlider = popup.buttons.some(b => b.action === 'attack');
  const percentRowH = hasSlider ? 24 : 0;
  const percentGap = hasSlider ? 4 : 0;
  const totalH = percentRowH + percentGap + popup.buttons.length * (btnH + 4) + padding * 2 - 4;
  const arrowW = 10;
  const startX = popup.screenX + arrowW;
  const startY = popup.screenY - totalH / 2;
  return { btnW, btnH, padding, hasSlider, percentRowH, percentGap, totalH, arrowW, startX, startY };
}

function renderPopup(): void {
  if (!actionPopup) return;

  const { btnW, btnH, padding, hasSlider, percentRowH, percentGap, totalH, arrowW, startX, startY } = getPopupLayout(actionPopup);

  // Animation: scale + fade in
  const elapsed = performance.now() - actionPopup.openTime;
  const animDuration = 180; // ms
  const t = Math.min(1, elapsed / animDuration);
  // Ease-out cubic
  const ease = 1 - Math.pow(1 - t, 3);
  const scale = 0.6 + 0.4 * ease;
  const alpha = ease;

  // Transform origin = left center (arrow tip)
  const originX = actionPopup.screenX;
  const originY = actionPopup.screenY;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(originX, originY);
  ctx.scale(scale, scale);
  ctx.translate(-originX, -originY);

  // Background with rounded corners effect
  const bgX = startX - padding;
  const bgY = startY - padding;
  const bgW = btnW + padding * 2;
  const bgH = totalH + padding;
  const radius = 4;

  ctx.beginPath();
  ctx.moveTo(bgX + radius, bgY);
  ctx.lineTo(bgX + bgW - radius, bgY);
  ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + radius);
  ctx.lineTo(bgX + bgW, bgY + bgH - radius);
  ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - radius, bgY + bgH);
  ctx.lineTo(bgX + radius, bgY + bgH);
  ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + bgH - radius);
  ctx.lineTo(bgX, bgY + radius);
  ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
  ctx.closePath();

  ctx.fillStyle = 'rgba(5, 8, 22, 0.92)';
  ctx.fill();
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Arrow pointing left toward planet
  ctx.fillStyle = 'rgba(5, 8, 22, 0.92)';
  ctx.beginPath();
  ctx.moveTo(bgX, originY - 6);
  ctx.lineTo(bgX - arrowW, originY);
  ctx.lineTo(bgX, originY + 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Cover the arrow's inner edge
  ctx.fillStyle = 'rgba(5, 8, 22, 0.92)';
  ctx.fillRect(bgX - 1, originY - 5, 3, 10);

  // Slider row (only for attack popups)
  if (hasSlider) {
    const sliderTrackH = 8;
    const sliderPad = 4;
    const sliderY = startY + (percentRowH - sliderTrackH) / 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(startX + sliderPad, sliderY, btnW - sliderPad * 2, sliderTrackH);

    const sliderW = btnW - sliderPad * 2;
    const fillW = sliderW * (sendPercent / 100);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(startX + sliderPad, sliderY, fillW, sliderTrackH);

    const handleX = startX + sliderPad + fillW - 3;
    ctx.fillStyle = '#fff';
    ctx.fillRect(handleX, sliderY - 2, 6, sliderTrackH + 4);
  }

  // Action buttons - use simple canvas centering (works better with transforms)
  const btnFontSize = 10;
  let by = startY + percentRowH + percentGap;
  for (const btn of actionPopup.buttons) {
    const isHovered = mouseX >= startX && mouseX <= startX + btnW && mouseY >= by && mouseY <= by + btnH;
    ctx.fillStyle = isHovered ? 'rgba(255, 215, 0, 0.25)' : 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(startX, by, btnW, btnH);
    ctx.strokeStyle = isHovered ? '#FFD700' : '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, by, btnW, btnH);

    // Draw text with simple canvas alignment
    ctx.font = `${btnFontSize}px "Press Start 2P"`;
    ctx.fillStyle = isHovered ? '#FFD700' : '#cccccc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, startX + btnW / 2, by + btnH / 2 + 1);

    by += btnH + 4;
  }

  ctx.restore();
}


// ========== BUILD PANEL ==========

function canAffordBuilding(planet: Planet, def: BuildingDef): boolean {
  for (const [res, cost] of Object.entries(def.cost) as [DepositType, number][]) {
    const dep = planet.deposits.find(d => d.type === res);
    if (!dep || dep.amount < cost) return false;
  }
  return true;
}

function getBuildPanelLayout() {
  if (buildPanelPlanetId === null) return null;
  const planet = planetMap.get(buildPanelPlanetId);
  if (!planet) return null;

  const panelW = 204;
  const slotH = 34;
  const slotGap = 4;
  const padding = 12;
  const titleH = 30;
  const slotsH = 3 * (slotH + slotGap) - slotGap;

  // If a slot is selected, show building picker
  const pickerH = buildPanelSlot !== null ? (BUILDINGS.length * (slotH + slotGap) - slotGap + titleH + padding) : 0;
  const totalH = padding + titleH + slotsH + (pickerH > 0 ? padding + pickerH : 0) + padding;

  const planetScreen = worldToScreen(planet.x, planet.y);
  const planetR = planet.radius * camera.zoom;
  const arrowW = 8;
  const panelX = planetScreen.x - planetR - panelW - arrowW - 6;
  const panelY = planetScreen.y - totalH / 2;

  return { panelW, slotH, slotGap, padding, titleH, slotsH, pickerH, totalH, panelX, panelY, arrowW, planetScreen, planet };
}

function getBuildPanelClickAt(px: number, py: number): string | null {
  const layout = getBuildPanelLayout();
  if (!layout) return null;
  const { panelW, slotH, slotGap, padding, titleH, panelX, panelY, planet } = layout;

  // Check if click is inside panel bounds
  if (px < panelX || px > panelX + panelW || py < panelY || py > panelY + layout.totalH) {
    return null; // outside panel
  }

  // Check slot clicks
  const slotsStartY = panelY + padding + titleH;
  for (let i = 0; i < 3; i++) {
    const slotY = slotsStartY + i * (slotH + slotGap);
    if (px >= panelX + padding && px <= panelX + panelW - padding && py >= slotY && py <= slotY + slotH) {
      return `slot_${i}`;
    }
  }

  // Check building picker clicks (if slot is selected)
  if (buildPanelSlot !== null) {
    const pickerStartY = slotsStartY + 3 * (slotH + slotGap) + padding + layout.titleH;
    for (let i = 0; i < BUILDINGS.length; i++) {
      const buildY = pickerStartY + i * (slotH + slotGap);
      if (px >= panelX + padding && px <= panelX + panelW - padding && py >= buildY && py <= buildY + slotH) {
        if (canAffordBuilding(planet, BUILDINGS[i])) {
          return `build_${i}`;
        }
        return 'inside'; // clicked but can't afford
      }
    }
  }

  return 'inside'; // inside panel but not on any button
}

function handleBuildPanelClick(action: string): void {
  if (action === 'inside') return; // clicked empty area inside panel

  if (action.startsWith('slot_')) {
    const slotIdx = parseInt(action.split('_')[1]);
    const planet = planetMap.get(buildPanelPlanetId!);
    if (!planet) return;

    if (planet.buildings[slotIdx] !== null) {
      // Slot already has a building - do nothing (or could demolish)
      return;
    }
    // Toggle slot selection
    buildPanelSlot = buildPanelSlot === slotIdx ? null : slotIdx;
    return;
  }

  if (action.startsWith('build_')) {
    const buildIdx = parseInt(action.split('_')[1]);
    const planet = planetMap.get(buildPanelPlanetId!);
    if (!planet || buildPanelSlot === null) return;

    const def = BUILDINGS[buildIdx];
    if (!canAffordBuilding(planet, def)) return;

    // Deduct costs from deposits
    for (const [res, cost] of Object.entries(def.cost) as [DepositType, number][]) {
      const dep = planet.deposits.find(d => d.type === res);
      if (dep) dep.amount -= cost;
    }

    // Place building
    planet.buildings[buildPanelSlot] = { type: def.type, slot: buildPanelSlot };

    // Apply immediate effects
    // Turret: no immediate effect, radar + missiles handled by updateTurrets()
    if (def.type === 'mine') planet.growthRate *= 1.5;
    if (def.type === 'factory') {
      // Factory bonus based on planet size
      const factoryBonus: Record<PlanetSize, number> = {
        [PlanetSize.ASTEROID]: 25,
        [PlanetSize.TINY]: 50,
        [PlanetSize.SMALL]: 100,
        [PlanetSize.MEDIUM]: 150,
        [PlanetSize.LARGE]: 200,
        [PlanetSize.GIANT]: 300,
        [PlanetSize.MEGA]: 400,
        [PlanetSize.TITAN]: 600,
        [PlanetSize.COLOSSUS]: 800
      };
      planet.maxUnits += factoryBonus[planet.size] || 50;
    }
    if (def.type === 'shield_gen') planet.hasShield = true; // one-time shield

    // Particles
    const screen = worldToScreen(planet.x, planet.y);
    spawnParticles(screen.x, screen.y, def.color, 12, 80);

    buildPanelSlot = null; // close picker
  }
}

function renderBuildPanel(): void {
  const layout = getBuildPanelLayout();
  if (!layout) return;
  const { panelW, slotH, slotGap, padding, titleH, panelX, panelY, arrowW, planetScreen, planet, totalH } = layout;

  ctx.save();

  // Panel background with rounded corners
  const cornerR = 4;
  ctx.beginPath();
  ctx.moveTo(panelX + cornerR, panelY);
  ctx.lineTo(panelX + panelW - cornerR, panelY);
  ctx.quadraticCurveTo(panelX + panelW, panelY, panelX + panelW, panelY + cornerR);
  ctx.lineTo(panelX + panelW, panelY + totalH - cornerR);
  ctx.quadraticCurveTo(panelX + panelW, panelY + totalH, panelX + panelW - cornerR, panelY + totalH);
  ctx.lineTo(panelX + cornerR, panelY + totalH);
  ctx.quadraticCurveTo(panelX, panelY + totalH, panelX, panelY + totalH - cornerR);
  ctx.lineTo(panelX, panelY + cornerR);
  ctx.quadraticCurveTo(panelX, panelY, panelX + cornerR, panelY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(5, 8, 22, 0.94)';
  ctx.fill();
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Arrow pointing right toward planet
  const arrowTipX = panelX + panelW + arrowW;
  const arrowY = planetScreen.y;
  ctx.fillStyle = 'rgba(5, 8, 22, 0.94)';
  ctx.beginPath();
  ctx.moveTo(panelX + panelW, arrowY - 6);
  ctx.lineTo(arrowTipX, arrowY);
  ctx.lineTo(panelX + panelW, arrowY + 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(5, 8, 22, 0.94)';
  ctx.fillRect(panelX + panelW - 1, arrowY - 5, 3, 10);

  // Title - use precise text rendering
  drawTextLeft('BUILD SLOTS', 10, '#FFD700', panelX + padding, panelY + padding + 9);

  // Separator
  const sepY = panelY + padding + 18;
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(panelX + padding, sepY);
  ctx.lineTo(panelX + panelW - padding, sepY);
  ctx.stroke();

  // 3 Slots
  const slotsStartY = panelY + padding + titleH;
  const slotFontSize = 10;

  for (let i = 0; i < 3; i++) {
    const slotY = slotsStartY + i * (slotH + slotGap);
    const slotW = panelW - padding * 2;
    const sx = panelX + padding;
    const isSelected = buildPanelSlot === i;
    const building = planet.buildings[i];

    if (building) {
      // Filled slot
      const def = BUILDINGS.find(b => b.type === building.type)!;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(sx, slotY, slotW, slotH);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, slotY, slotW, slotH);

      // Draw text using precise centering
      drawTextCentered(`[${def.icon}] ${def.name}`, slotFontSize, def.color, sx + slotW / 2, slotY + slotH / 2);
    } else {
      // Empty slot
      ctx.fillStyle = isSelected ? 'rgba(255, 215, 0, 0.12)' : 'rgba(255, 255, 255, 0.04)';
      ctx.fillRect(sx, slotY, slotW, slotH);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isSelected ? '#FFD700' : '#555';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, slotY, slotW, slotH);
      ctx.setLineDash([]);

      // Draw text using precise centering
      const textColor = isSelected ? '#FFD700' : '#666666';
      const text = isSelected ? 'SELECT...' : 'EMPTY';
      drawTextCentered(text, slotFontSize, textColor, sx + slotW / 2, slotY + slotH / 2);
    }
  }

  // Building picker (if slot is selected)
  if (buildPanelSlot !== null && planet.buildings[buildPanelSlot] === null) {
    const pickerTitleY = slotsStartY + 3 * (slotH + slotGap) + padding;

    // Picker title - use precise text rendering
    drawTextLeft('AVAILABLE:', 10, '#aaaaaa', panelX + padding, pickerTitleY + 5);

    // Separator
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + padding, pickerTitleY + 14);
    ctx.lineTo(panelX + panelW - padding, pickerTitleY + 14);
    ctx.stroke();

    const pickerStartY = pickerTitleY + titleH;
    const slotW = panelW - padding * 2;
    const sx = panelX + padding;
    const pickerFontSize = 10;

    for (let i = 0; i < BUILDINGS.length; i++) {
      const def = BUILDINGS[i];
      const buildY = pickerStartY + i * (slotH + slotGap);
      const affordable = canAffordBuilding(planet, def);
      const isHovered = mouseX >= sx && mouseX <= sx + slotW && mouseY >= buildY && mouseY <= buildY + slotH;

      ctx.fillStyle = affordable ? (isHovered ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255, 255, 255, 0.06)') : 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(sx, buildY, slotW, slotH);
      ctx.strokeStyle = affordable ? (isHovered ? '#FFD700' : def.color) : '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, buildY, slotW, slotH);

      // Building name - use precise centering
      const textColor = affordable ? def.color : '#444444';
      drawTextCentered(def.name, pickerFontSize, textColor, sx + slotW / 2, buildY + slotH / 2);
    }
  }

  ctx.restore();
}

// ========== TRANSPORT PANEL ==========

function getTransportPanelLayout() {
  if (!transportPanelOpen || transportSourceId === null || transportTargetId === null) return null;
  const source = planetMap.get(transportSourceId);
  const target = planetMap.get(transportTargetId);
  if (!source || !target) return null;

  const deposits = source.deposits.filter(d => d.amount > 0);
  const panelW = 184;
  const slotH = 34;
  const slotGap = 4;
  const padding = 12;
  const titleH = 30;
  const totalH = padding + titleH + deposits.length * (slotH + slotGap) + padding;

  const targetScreen = worldToScreen(target.x, target.y);
  const targetR = target.radius * camera.zoom;
  const arrowW = 8;
  const panelX = targetScreen.x - targetR - panelW - arrowW - 6;
  const panelY = targetScreen.y - totalH / 2;

  return { panelW, slotH, slotGap, padding, titleH, totalH, panelX, panelY, arrowW, targetScreen, source, target, deposits };
}

function getTransportPanelClickAt(px: number, py: number): string | null {
  const layout = getTransportPanelLayout();
  if (!layout) return null;
  const { panelW, slotH, slotGap, padding, titleH, panelX, panelY, totalH, deposits } = layout;

  // Check if click is inside panel bounds
  if (px < panelX || px > panelX + panelW || py < panelY || py > panelY + totalH) {
    return null;
  }

  // Check deposit clicks
  const slotsStartY = panelY + padding + titleH;
  for (let i = 0; i < deposits.length; i++) {
    const slotY = slotsStartY + i * (slotH + slotGap);
    if (px >= panelX + padding && px <= panelX + panelW - padding && py >= slotY && py <= slotY + slotH) {
      return `transport_${deposits[i].type}`;
    }
  }

  return 'inside';
}

function handleTransportPanelClick(action: string): void {
  if (action === 'inside') return;

  if (action.startsWith('transport_')) {
    const resType = action.split('_')[1] as DepositType;
    const source = planetMap.get(transportSourceId!);
    const target = planetMap.get(transportTargetId!);
    if (!source || !target) return;

    const sourceDep = source.deposits.find(d => d.type === resType);
    if (!sourceDep || sourceDep.amount <= 0) return;

    // Transfer 10 or all if less
    const amount = Math.min(10, sourceDep.amount);
    sourceDep.amount -= amount;

    // Add to target (or create new deposit)
    let targetDep = target.deposits.find(d => d.type === resType);
    if (targetDep) {
      targetDep.amount += amount;
    } else {
      target.deposits.push({ type: resType, amount });
    }

    // Particles
    const sourceScreen = worldToScreen(source.x, source.y);
    const targetScreen = worldToScreen(target.x, target.y);
    spawnParticles(sourceScreen.x, sourceScreen.y, DEPOSIT_INFO[resType].color, 8, 60);
    spawnParticles(targetScreen.x, targetScreen.y, DEPOSIT_INFO[resType].color, 8, 60);

    // Close panel if source has no more deposits
    if (source.deposits.filter(d => d.amount > 0).length === 0) {
      transportPanelOpen = false;
      transportSourceId = null;
      transportTargetId = null;
    }
  }
}

function renderTransportPanel(): void {
  const layout = getTransportPanelLayout();
  if (!layout) return;
  const { panelW, slotH, slotGap, padding, titleH, panelX, panelY, arrowW, targetScreen, source, deposits, totalH } = layout;

  ctx.save();

  // Panel background with rounded corners
  const cornerR = 4;
  ctx.beginPath();
  ctx.moveTo(panelX + cornerR, panelY);
  ctx.lineTo(panelX + panelW - cornerR, panelY);
  ctx.quadraticCurveTo(panelX + panelW, panelY, panelX + panelW, panelY + cornerR);
  ctx.lineTo(panelX + panelW, panelY + totalH - cornerR);
  ctx.quadraticCurveTo(panelX + panelW, panelY + totalH, panelX + panelW - cornerR, panelY + totalH);
  ctx.lineTo(panelX + cornerR, panelY + totalH);
  ctx.quadraticCurveTo(panelX, panelY + totalH, panelX, panelY + totalH - cornerR);
  ctx.lineTo(panelX, panelY + cornerR);
  ctx.quadraticCurveTo(panelX, panelY, panelX + cornerR, panelY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(5, 8, 22, 0.94)';
  ctx.fill();
  ctx.strokeStyle = '#64c8ff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Arrow pointing right toward planet
  const arrowTipX = panelX + panelW + arrowW;
  const arrowY = targetScreen.y;
  ctx.fillStyle = 'rgba(5, 8, 22, 0.94)';
  ctx.beginPath();
  ctx.moveTo(panelX + panelW, arrowY - 6);
  ctx.lineTo(arrowTipX, arrowY);
  ctx.lineTo(panelX + panelW, arrowY + 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#64c8ff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(5, 8, 22, 0.94)';
  ctx.fillRect(panelX + panelW - 1, arrowY - 5, 3, 10);

  // Title
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '10px "Press Start 2P"';
  ctx.fillStyle = '#64c8ff';
  ctx.fillText('TRANSPORT', panelX + padding, panelY + padding);

  // Separator
  const sepY = panelY + padding + 16;
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(panelX + padding, sepY);
  ctx.lineTo(panelX + panelW - padding, sepY);
  ctx.stroke();

  // Resource slots
  const slotsStartY = panelY + padding + titleH;
  const slotW = panelW - padding * 2;
  const sx = panelX + padding;

  for (let i = 0; i < deposits.length; i++) {
    const dep = deposits[i];
    const info = DEPOSIT_INFO[dep.type];
    const slotY = slotsStartY + i * (slotH + slotGap);
    const isHovered = mouseX >= sx && mouseX <= sx + slotW && mouseY >= slotY && mouseY <= slotY + slotH;

    ctx.fillStyle = isHovered ? 'rgba(100, 200, 255, 0.15)' : 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(sx, slotY, slotW, slotH);
    ctx.strokeStyle = isHovered ? '#64c8ff' : info.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, slotY, slotW, slotH);

    // Resource icon and name
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '10px "Press Start 2P"';
    ctx.fillStyle = info.color;
    ctx.fillText(`[${info.icon}] ${info.name}`, sx + 6, Math.round(slotY + slotH / 2 - 5));

    // Amount and send hint
    ctx.font = '6px "Press Start 2P"';
    ctx.fillStyle = '#888';
    ctx.fillText(`${dep.amount} (click: -10)`, sx + 6, Math.round(slotY + slotH / 2 + 8));
  }

  ctx.restore();
}

function renderAbilities(): void {
  const btnW = Math.round(92 * UI_SCALE);
  const btnH = Math.round(40 * UI_SCALE);
  const gap = Math.round(6 * UI_SCALE);
  const totalW = abilities.length * btnW + (abilities.length - 1) * gap;
  const abX = gameWidth - totalW - 15;
  const abY = gameHeight - Math.round(52 * UI_SCALE);

  ctx.font = `${Math.round(10 * UI_SCALE)}px "Press Start 2P"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < abilities.length; i++) {
    const ability = abilities[i];
    const bx = abX + i * (btnW + gap);
    const ready = isAbilityReady(ability);
    const isActive = activeAbility === ability.id;

    // Button bg
    ctx.fillStyle = isActive ? 'rgba(255, 215, 0, 0.3)' : ready ? 'rgba(40, 40, 80, 0.9)' : 'rgba(20, 20, 40, 0.9)';
    ctx.fillRect(bx, abY, btnW, btnH);
    ctx.strokeStyle = isActive ? '#FFD700' : ready ? '#4488ff' : '#333';
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.strokeRect(bx, abY, btnW, btnH);

    // Cooldown overlay
    if (!ready) {
      const remaining = getAbilityCooldownRemaining(ability);
      const ratio = remaining / ability.cooldown;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(bx, abY, btnW * ratio, btnH);

      // Cooldown text
      ctx.fillStyle = '#666';
      ctx.fillText(`${Math.ceil(remaining / 1000)}s`, Math.round(bx + btnW / 2), Math.round(abY + btnH / 2));
    } else {
      ctx.fillStyle = isActive ? '#FFD700' : '#fff';
      ctx.fillText(ability.name, Math.round(bx + btnW / 2), Math.round(abY + btnH / 2));
    }
  }
}

// Calculate total resources for a player across all their planets
function getPlayerTotalResources(playerId: number): Record<DepositType, number> {
  const totals: Record<DepositType, number> = {
    carbon: 0, water: 0, gas: 0, metal: 0, crystal: 0
  };

  for (const planet of planets) {
    if (planet.ownerId === playerId) {
      for (const dep of planet.deposits) {
        totals[dep.type] += dep.amount;
      }
    }
  }

  return totals;
}

// Track previous resource values for change indicators
let prevResources: Record<DepositType, number> = { carbon: 0, water: 0, gas: 0, metal: 0, crystal: 0 };
let resourceChanges: Record<DepositType, { amount: number; time: number }> = {
  carbon: { amount: 0, time: 0 },
  water: { amount: 0, time: 0 },
  gas: { amount: 0, time: 0 },
  metal: { amount: 0, time: 0 },
  crystal: { amount: 0, time: 0 }
};

// Track previous units for change indicator
let prevUnits = 0;
let unitsChange = { amount: 0, time: 0 };

function renderResourceBar(): void {
  const resources = getPlayerTotalResources(controlledPlayerId);
  const allTypes: DepositType[] = ['carbon', 'water', 'gas', 'metal', 'crystal'];
  const totalUnits = Math.floor(players[controlledPlayerId]?.totalUnits || 0);

  // Check for changes
  const now = performance.now();
  for (const type of allTypes) {
    const diff = resources[type] - prevResources[type];
    if (diff !== 0) {
      resourceChanges[type] = { amount: diff, time: now };
    }
    prevResources[type] = resources[type];
  }

  // Check units change
  const unitsDiff = totalUnits - prevUnits;
  if (Math.abs(unitsDiff) >= 1) {
    unitsChange = { amount: unitsDiff, time: now };
  }
  prevUnits = totalUnits;

  // Bar dimensions - COMPACT on mobile to fit screen
  const barH = isMobile ? 32 : 36;
  const barW = gameWidth;
  const slotW = isMobile ? Math.floor(gameWidth / 7.5) : 150; // Auto-fit on mobile
  const totalSlots = 7; // 5 resources + units + planets
  const startX = isMobile ? 5 : (gameWidth - slotW * totalSlots) / 2;
  const planetCount = players[controlledPlayerId]?.planetCount || 0;

  // Background
  ctx.fillStyle = 'rgba(10, 15, 30, 0.9)';
  ctx.fillRect(0, 0, barW, barH);

  // Bottom border
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, barH);
  ctx.lineTo(barW, barH);
  ctx.stroke();

  // Draw each resource (compact on mobile)
  const iconR = isMobile ? 8 : 12;
  const iconFont = isMobile ? 'bold 8px "Press Start 2P"' : 'bold 12px "Press Start 2P"';
  const amountFont = isMobile ? '8px "Press Start 2P"' : '11px "Press Start 2P"';
  const iconOffset = isMobile ? 12 : 18;
  const textOffset = isMobile ? 24 : 38;

  for (let i = 0; i < allTypes.length; i++) {
    const type = allTypes[i];
    const info = DEPOSIT_INFO[type];
    const amount = resources[type];
    const x = startX + i * slotW;

    // Icon background
    ctx.fillStyle = info.color;
    ctx.beginPath();
    ctx.arc(x + iconOffset, barH / 2, iconR, 0, Math.PI * 2);
    ctx.fill();

    // Icon letter
    ctx.font = iconFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(info.icon, x + iconOffset, barH / 2 + 1);

    // Amount
    ctx.font = amountFont;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText(Math.floor(amount).toString(), x + textOffset, barH / 2 + 1);

    // Change indicator (fade out over 2 seconds) - skip on mobile to save space
    if (!isMobile) {
      const change = resourceChanges[type];
      const elapsed = now - change.time;
      if (elapsed < 2000 && change.amount !== 0) {
        const alpha = 1 - elapsed / 2000;
        const changeText = change.amount > 0 ? `+${change.amount}` : `${change.amount}`;
        ctx.font = '10px "Press Start 2P"';
        ctx.fillStyle = change.amount > 0 ? `rgba(100, 255, 100, ${alpha})` : `rgba(255, 100, 100, ${alpha})`;
        ctx.fillText(changeText, x + 77, barH / 2 + 1);
      }
    }
  }

  // Units display (last slot)
  const unitsX = startX + 5 * slotW;

  // Icon background (yellow/gold for units)
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(unitsX + iconOffset, barH / 2, iconR, 0, Math.PI * 2);
  ctx.fill();

  // Icon letter
  ctx.font = iconFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText('U', unitsX + iconOffset, barH / 2 + 1);

  // Amount
  ctx.font = amountFont;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.fillText(totalUnits.toString(), unitsX + textOffset, barH / 2 + 1);

  // Units change indicator - skip on mobile
  if (!isMobile) {
    const unitsElapsed = now - unitsChange.time;
    if (unitsElapsed < 2000 && unitsChange.amount !== 0) {
      const alpha = 1 - unitsElapsed / 2000;
      const changeText = unitsChange.amount > 0 ? `+${Math.floor(unitsChange.amount)}` : `${Math.floor(unitsChange.amount)}`;
      ctx.font = '10px "Press Start 2P"';
      ctx.fillStyle = unitsChange.amount > 0 ? `rgba(100, 255, 100, ${alpha})` : `rgba(255, 100, 100, ${alpha})`;
      ctx.fillText(changeText, unitsX + 72, barH / 2 + 1);
    }
  }

  // Planets display (last slot)
  const planetsX = startX + 6 * slotW;

  // Icon background (cyan for planets)
  ctx.fillStyle = '#44aaff';
  ctx.beginPath();
  ctx.arc(planetsX + iconOffset, barH / 2, iconR, 0, Math.PI * 2);
  ctx.fill();

  // Icon letter
  ctx.font = iconFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText('P', planetsX + iconOffset, barH / 2 + 1);

  // Amount
  ctx.font = amountFont;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.fillText(planetCount.toString(), planetsX + textOffset, barH / 2 + 1);

  // Tooltip on hover
  if (mouseY < barH && mouseY > 0) {
    let hoveredSlot = -1;
    let tooltipText = '';

    // Check which slot mouse is over
    for (let i = 0; i < 7; i++) {
      const slotX = startX + i * slotW;
      if (mouseX >= slotX && mouseX < slotX + slotW) {
        hoveredSlot = i;
        break;
      }
    }

    if (hoveredSlot >= 0 && hoveredSlot < 5) {
      const type = allTypes[hoveredSlot];
      tooltipText = DEPOSIT_INFO[type].name;
    } else if (hoveredSlot === 5) {
      tooltipText = 'Units';
    } else if (hoveredSlot === 6) {
      tooltipText = 'Planets';
    }

    if (tooltipText) {
      const tooltipX = startX + hoveredSlot * slotW + slotW / 2;
      const tooltipY = barH + 6;

      ctx.font = '11px "Press Start 2P"';
      const textW = ctx.measureText(tooltipText).width;
      const boxW = textW + 18;
      const boxH = 28;
      const boxX = tooltipX - boxW / 2;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.fillRect(boxX, tooltipY, boxW, boxH);
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX, tooltipY, boxW, boxH);

      // Arrow pointing up
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.beginPath();
      ctx.moveTo(tooltipX - 6, tooltipY);
      ctx.lineTo(tooltipX + 6, tooltipY);
      ctx.lineTo(tooltipX, tooltipY - 5);
      ctx.closePath();
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.fillText(tooltipText, tooltipX, tooltipY + 19);
    }
  }
}

// Render virtual joystick (mobile only)
function renderJoystick(): void {
  if (!isMobile) return;

  const centerX = JOYSTICK_X;
  const centerY = gameHeight - JOYSTICK_Y_OFFSET;
  const outerR = JOYSTICK_SIZE / 2;
  const innerR = JOYSTICK_INNER / 2;

  // Outer circle (base)
  ctx.beginPath();
  ctx.arc(centerX, centerY, outerR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner circle (thumb) - moves with joystick
  const thumbX = centerX + joystickX * (outerR - innerR);
  const thumbY = centerY + joystickY * (outerR - innerR);

  ctx.beginPath();
  ctx.arc(thumbX, thumbY, innerR, 0, Math.PI * 2);
  ctx.fillStyle = joystickActive ? 'rgba(255, 215, 0, 0.6)' : 'rgba(255, 255, 255, 0.3)';
  ctx.fill();
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Direction indicator arrows
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('▲', centerX, centerY - outerR + 12);
  ctx.fillText('▼', centerX, centerY + outerR - 12);
  ctx.fillText('◀', centerX - outerR + 12, centerY);
  ctx.fillText('▶', centerX + outerR - 12, centerY);
}

function renderUI(): void {
  // Resource bar at top
  renderResourceBar();

  // Ability bar (bottom right)
  renderAbilities();

  // Virtual joystick (mobile only, bottom left)
  renderJoystick();

  // Player control indicator (test mode)
  if (players.filter(p => p.alive).length > 1) {
    const player = players[controlledPlayerId];
    if (player) {
      const text = `[TAB] P${controlledPlayerId + 1}: ${player.name}`;
      ctx.font = '10px "Press Start 2P"';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(canvas.width - 200, 50, 195, 24);
      ctx.strokeStyle = player.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(canvas.width - 200, 50, 195, 24);
      ctx.fillStyle = player.color;
      ctx.fillText(text, canvas.width - 10, 58);
    }
  }

  // Attack/send line preview (only for visible targets)
  if (selectedPlanets.size > 0 && hoveredPlanet !== null && !selectedPlanets.has(hoveredPlanet)) {
    const to = planetMap.get(hoveredPlanet);
    if (to && isVisibleToPlayer(to)) {
      const hasOwnSelected = [...selectedPlanets].some(id => {
        const p = planetMap.get(id);
        return p && p.ownerId === controlledPlayerId;
      });

      if (hasOwnSelected) {
        const toScreen = worldToScreen(to.x, to.y);
        for (const fromId of selectedPlanets) {
          const from = planetMap.get(fromId);
          if (!from || from.ownerId !== controlledPlayerId) continue;

          const fromScreen = worldToScreen(from.x, from.y);
          const dist = getDistance(from, to);
          const unitsLost = dist <= DISTANCE_NO_PENALTY ? 0 : Math.floor((dist - DISTANCE_NO_PENALTY) / 30) * DISTANCE_PENALTY_PER_30PX;
          const colorVal = Math.max(0, 200 - unitsLost * 2);

          ctx.strokeStyle = `rgba(255, ${colorVal}, 0, 0.4)`;
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 4]);
          ctx.beginPath();
          ctx.moveTo(fromScreen.x, fromScreen.y);
          ctx.lineTo(toScreen.x, toScreen.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Units lost label at target
        const firstFrom = planetMap.get([...selectedPlanets].find(id => {
          const p = planetMap.get(id);
          return p && p.ownerId === controlledPlayerId;
        })!);
        if (firstFrom) {
          const dist = getDistance(firstFrom, to);
          const unitsLost = dist <= DISTANCE_NO_PENALTY ? 0 : Math.floor((dist - DISTANCE_NO_PENALTY) / 30) * DISTANCE_PENALTY_PER_30PX;
          ctx.font = '10px "Press Start 2P"';
          ctx.textAlign = 'center';
          if (unitsLost > 0) {
            ctx.fillStyle = '#ff6644';
            ctx.fillText(`-${unitsLost}`, toScreen.x, toScreen.y - to.radius * camera.zoom - 16);
          } else {
            ctx.fillStyle = '#44ff44';
            ctx.fillText(`OK`, toScreen.x, toScreen.y - to.radius * camera.zoom - 16);
          }
        }
      }
    }
  }

  // Popup
  renderPopup();

  // Build panel
  renderBuildPanel();

  // Transport panel
  renderTransportPanel();

  // Info panel (deposits)
  if (infoPlanetId !== null) {
    const infoPlanet = planetMap.get(infoPlanetId);
    if (infoPlanet) {
      const deposits = infoPlanet.deposits;
      const lineH = 24;
      const padding = 14;
      const panelW = 180;
      const panelH = 36 + Math.max(1, deposits.length) * lineH + padding * 2;
      const planetScreen = worldToScreen(infoPlanet.x, infoPlanet.y);
      const planetR = infoPlanet.radius * camera.zoom;
      const arrowW = 8;
      const panelX = planetScreen.x - planetR - panelW - arrowW - 6;
      const panelY = planetScreen.y - panelH / 2;
      const cornerR = 4;

      ctx.save();

      // Rounded rectangle background
      ctx.beginPath();
      ctx.moveTo(panelX + cornerR, panelY);
      ctx.lineTo(panelX + panelW - cornerR, panelY);
      ctx.quadraticCurveTo(panelX + panelW, panelY, panelX + panelW, panelY + cornerR);
      ctx.lineTo(panelX + panelW, panelY + panelH - cornerR);
      ctx.quadraticCurveTo(panelX + panelW, panelY + panelH, panelX + panelW - cornerR, panelY + panelH);
      ctx.lineTo(panelX + cornerR, panelY + panelH);
      ctx.quadraticCurveTo(panelX, panelY + panelH, panelX, panelY + panelH - cornerR);
      ctx.lineTo(panelX, panelY + cornerR);
      ctx.quadraticCurveTo(panelX, panelY, panelX + cornerR, panelY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(5, 8, 22, 0.92)';
      ctx.fill();
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Arrow pointing right toward planet
      const arrowTipX = panelX + panelW + arrowW;
      const arrowY = planetScreen.y;
      ctx.fillStyle = 'rgba(5, 8, 22, 0.92)';
      ctx.beginPath();
      ctx.moveTo(panelX + panelW, arrowY - 6);
      ctx.lineTo(arrowTipX, arrowY);
      ctx.lineTo(panelX + panelW, arrowY + 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Cover arrow inner edge
      ctx.fillStyle = 'rgba(5, 8, 22, 0.92)';
      ctx.fillRect(panelX + panelW - 1, arrowY - 5, 3, 10);

      // Title
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '11px "Press Start 2P"';
      ctx.fillStyle = '#FFD700';
      ctx.fillText('DEPOSITS', panelX + padding, panelY + padding);

      // Separator line
      const sepY = panelY + padding + 18;
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(panelX + padding, sepY);
      ctx.lineTo(panelX + panelW - padding, sepY);
      ctx.stroke();

      // List deposits
      let dy = sepY + 12;
      if (deposits.length === 0) {
        ctx.font = '11px "Press Start 2P"';
        ctx.fillStyle = '#666';
        ctx.fillText('None', panelX + padding, dy);
      } else {
        for (const dep of deposits) {
          const info = DEPOSIT_INFO[dep.type];
          ctx.font = '11px "Press Start 2P"';
          ctx.fillStyle = info.color;
          ctx.fillText(`[${info.icon}]`, panelX + padding, dy);
          ctx.fillStyle = '#ccc';
          ctx.fillText(info.name, panelX + padding + 40, dy);
          dy += lineH;
        }
      }

      ctx.restore();
    }
  }

}

function renderExploreDrag(): void {
  if (!exploreDragging || explorePlanetId === null) return;

  const planet = planetMap.get(explorePlanetId);
  if (!planet) return;

  const planetScreen = worldToScreen(planet.x, planet.y);
  const worldTarget = screenToWorld(mouseX, mouseY);
  const worldDist = getDistance(planet, worldTarget);
  const unitCost = Math.max(5, Math.ceil(worldDist / 100 * PROBE_UNIT_COST_PER_100PX));
  const affordable = planet.units - 5 >= unitCost;

  // Dashed line from planet to cursor
  ctx.strokeStyle = affordable ? '#44ff88' : '#ff4444';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(planetScreen.x, planetScreen.y);
  ctx.lineTo(mouseX, mouseY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Target circle (reveal preview)
  const previewRadius = PROBE_REVEAL_RADIUS * camera.zoom;
  ctx.beginPath();
  ctx.arc(mouseX, mouseY, previewRadius, 0, Math.PI * 2);
  ctx.strokeStyle = affordable ? '#44ff8866' : '#ff444466';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Cost label
  const costText = `${unitCost} units`;
  const distText = `${Math.round(worldDist)}px`;
  const midX = (planetScreen.x + mouseX) / 2;
  const midY = (planetScreen.y + mouseY) / 2;

  ctx.font = '10px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Background for text
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(midX - 60, midY - 18, 120, 36);

  ctx.fillStyle = affordable ? '#44ff88' : '#ff4444';
  ctx.fillText(costText, midX, midY - 6);
  ctx.fillStyle = '#888';
  ctx.font = '10px "Press Start 2P"';
  ctx.fillText(distText, midX, midY + 10);
}

function renderGameOver(): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, gameWidth, gameHeight);

  ctx.font = '36px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillStyle = gameResult === 'win' ? '#FFD700' : '#ff4444';
  ctx.fillText(gameResult === 'win' ? 'VICTORY!' : 'DEFEATED', gameWidth / 2, gameHeight / 2 - 30);

  ctx.font = '12px "Press Start 2P"';
  ctx.fillStyle = '#aaa';
  ctx.fillText(`Planets: ${players[0]?.planetCount || 0} | Units: ${Math.floor(players[0]?.totalUnits || 0)}`, gameWidth / 2, gameHeight / 2 + 10);

  // Restart button
  const btnX = gameWidth / 2 - 80;
  const btnY = gameHeight / 2 + 40;
  ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
  ctx.fillRect(btnX, btnY, 160, 40);
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.strokeRect(btnX, btnY, 160, 40);
  ctx.font = '12px "Press Start 2P"';
  ctx.fillStyle = '#FFD700';
  ctx.fillText('RESTART', gameWidth / 2, btnY + 24);
}

function renderPaused(): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, gameWidth, gameHeight);

  ctx.font = '28px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD700';
  ctx.fillText('PAUSED', gameWidth / 2, gameHeight / 2);
  ctx.font = '10px "Press Start 2P"';
  ctx.fillStyle = '#aaa';
  ctx.fillText('Press P to resume', gameWidth / 2, gameHeight / 2 + 30);
}

function render(): void {
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, gameWidth, gameHeight);

  // Render space background
  if (spaceBackgroundLoaded) {
    ctx.drawImage(spaceBackground, 0, 0, gameWidth, gameHeight);
  }

  ctx.save();

  renderStars();
  renderAnimStars();
  renderComets();
  renderSupplyLines();

  // Moon orbit rings
  for (const moon of planets) {
    if (!moon.isMoon || moon.parentId === undefined) continue;
    const parent = planetMap.get(moon.parentId);
    if (!parent) continue;

    const parentScreen = worldToScreen(parent.x, parent.y);
    const orbitR = (moon.orbitRadius || 0) * camera.zoom;

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

  // Sun (center of map)
  renderSun();

  // Planets
  for (const planet of planets) {
    renderPlanet(planet);
  }

  // Own planet rings - blue ring on player's planets (thin normally, thick on hover)
  for (const planet of planets) {
    if (planet.ownerId !== 0) continue; // Only player's planets
    if (selectedPlanets.has(planet.id)) continue; // Skip if selected (will draw selection ring instead)

    const screen = worldToScreen(planet.x, planet.y);
    const r = planet.radius * camera.zoom;
    const isLargePlus = planet.size === PlanetSize.LARGE || planet.size === PlanetSize.GIANT ||
                        planet.size === PlanetSize.MEGA || planet.size === PlanetSize.TITAN ||
                        planet.size === PlanetSize.COLOSSUS;
    const ringRadius = isLargePlus ? (r * 1.1 + 10) : (r + 6);

    // Check if hovered
    const isHovered = hoveredPlanet === planet.id;

    ctx.beginPath();
    ctx.arc(screen.x, screen.y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = players[0]?.color || '#4488ff';
    ctx.lineWidth = isHovered ? 5 : 2; // Thick on hover, thin normally
    ctx.stroke();
  }

  // Selection rings (multi-select) - with one-time flash for own planets
  const now = performance.now();
  const FLASH_DURATION = 300; // ms
  for (const id of selectedPlanets) {
    const planet = planetMap.get(id);
    if (planet) {
      const screen = worldToScreen(planet.x, planet.y);
      const r = planet.radius * camera.zoom;
      // Calculate ring radius based on sprite type
      const isLargePlus = planet.size === PlanetSize.LARGE || planet.size === PlanetSize.GIANT ||
                          planet.size === PlanetSize.MEGA || planet.size === PlanetSize.TITAN ||
                          planet.size === PlanetSize.COLOSSUS;
      const ringRadius = isLargePlus ? (r * 1.1 + 10) : (r + 6);

      ctx.beginPath();
      ctx.arc(screen.x, screen.y, ringRadius, 0, Math.PI * 2);
      const isBoost = planetMode === 'boost' && modePlanetId === planet.id;
      ctx.strokeStyle = isBoost ? '#00ff66' : (planet.ownerId !== -1 ? (players[planet.ownerId]?.color || '#FFD700') : '#FFD700');

      // One-time flash effect for own planets when just selected
      if (planet.ownerId === 0) {
        const selectTime = planetSelectTime.get(planet.id) || 0;
        const elapsed = now - selectTime;
        if (elapsed < FLASH_DURATION) {
          // Flash: bright -> normal (1.0 -> 0.3 -> 1.0)
          const progress = elapsed / FLASH_DURATION;
          const flash = progress < 0.5
            ? 1.0 - progress * 1.4  // 1.0 -> 0.3
            : 0.3 + (progress - 0.5) * 1.4; // 0.3 -> 1.0
          ctx.globalAlpha = flash;
        }
        ctx.lineWidth = 5;
      } else {
        ctx.lineWidth = 3;
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Hover ring (only for visible planets, not selected) - yellow, thin
  if (hoveredPlanet !== null && !selectedPlanets.has(hoveredPlanet)) {
    const planet = planetMap.get(hoveredPlanet);
    if (planet && (planet.ownerId === 0 || isVisibleToPlayer(planet))) {
      const screen = worldToScreen(planet.x, planet.y);
      const r = planet.radius * camera.zoom;
      // Calculate ring radius based on sprite type
      const isLargePlus = planet.size === PlanetSize.LARGE || planet.size === PlanetSize.GIANT ||
                          planet.size === PlanetSize.MEGA || planet.size === PlanetSize.TITAN ||
                          planet.size === PlanetSize.COLOSSUS;
      const ringRadius = isLargePlus ? (r * 1.1 + 10) : (r + 4);

      ctx.beginPath();
      ctx.arc(screen.x, screen.y, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = planet.ownerId !== -1 ? (players[planet.ownerId]?.color || '#FFD700') : '#FFD700';
      ctx.lineWidth = 1; // Thin when just hovered
      ctx.stroke();

      // Pixel art hover popup - DISABLED FOR NOW
      /*
      const popupWidth = 100;
      const popupHeight = 60;
      const popupOffsetX = ringRadius + 20;
      const popupOffsetY = -ringRadius - 30;
      const popupX = screen.x + popupOffsetX;
      const popupY = screen.y + popupOffsetY;

      // Animation timing
      const animTime = performance.now() - hoverStartTime;
      const lineAnimDuration = 200; // Line draws in 200ms
      const panelAnimDuration = 150; // Panel appears in 150ms
      const lineProgress = Math.min(1, animTime / lineAnimDuration);
      const panelProgress = Math.max(0, Math.min(1, (animTime - lineAnimDuration) / panelAnimDuration));

      // Easing function for smooth animation
      const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
      const easedLineProgress = easeOut(lineProgress);
      const easedPanelProgress = easeOut(panelProgress);

      // Animated border pulse (only after panel is visible)
      const pulseTime = performance.now() / 500;
      const pulseFactor = 0.5 + Math.sin(pulseTime) * 0.5;

      // Connection line points
      const lineStartX = screen.x + ringRadius * 0.7;
      const lineStartY = screen.y - ringRadius * 0.7;
      const lineMidX = lineStartX + (popupX - lineStartX) * 0.5;
      const lineMidY = lineStartY;
      const lineEndX = popupX;
      const lineEndY = popupY + popupHeight / 2;

      // Draw animated line (pixel art style - stepped)
      if (lineProgress > 0) {
        ctx.strokeStyle = `rgba(255, 215, 0, ${0.6 + pulseFactor * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lineStartX, lineStartY);

        if (easedLineProgress < 0.5) {
          // First half: draw to mid point
          const p = easedLineProgress * 2;
          const currentX = lineStartX + (lineMidX - lineStartX) * p;
          const currentY = lineStartY + (lineMidY - lineStartY) * p;
          ctx.lineTo(currentX, currentY);
        } else {
          // Second half: draw to end point
          ctx.lineTo(lineMidX, lineMidY);
          const p = (easedLineProgress - 0.5) * 2;
          const currentX = lineMidX + (lineEndX - lineMidX) * p;
          const currentY = lineMidY + (lineEndY - lineMidY) * p;
          ctx.lineTo(currentX, currentY);
        }
        ctx.stroke();
      }

      // Draw panel only after line is complete
      if (panelProgress > 0) {
        ctx.save();

        // Scale animation from center
        const scale = easedPanelProgress;
        const centerX = popupX + popupWidth / 2;
        const centerY = popupY + popupHeight / 2;
        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);
        ctx.translate(-centerX, -centerY);

        ctx.globalAlpha = easedPanelProgress;

        // Popup background (dark with pixel border)
        ctx.fillStyle = 'rgba(10, 10, 30, 0.9)';
        ctx.fillRect(popupX, popupY, popupWidth, popupHeight);

        // Pixel art border (animated glow)
        const borderColor = `rgba(255, 215, 0, ${0.7 + pulseFactor * 0.3})`;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(popupX, popupY, popupWidth, popupHeight);

        // Inner border (pixel art double border effect)
        ctx.strokeStyle = 'rgba(255, 180, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(popupX + 3, popupY + 3, popupWidth - 6, popupHeight - 6);

        // Corner decorations (pixel art style)
        ctx.fillStyle = borderColor;
        ctx.fillRect(popupX - 2, popupY - 2, 6, 6);
        ctx.fillRect(popupX + popupWidth - 4, popupY - 2, 6, 6);
        ctx.fillRect(popupX - 2, popupY + popupHeight - 4, 6, 6);
        ctx.fillRect(popupX + popupWidth - 4, popupY + popupHeight - 4, 6, 6);

        // Planet info text
        ctx.font = '10px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const lineHeight = 14;
        const startY = popupY + 12;

        // Line 1: Size
        const sizeText = planet.size.toUpperCase();
        ctx.fillStyle = '#000';
        ctx.fillText(sizeText, popupX + popupWidth / 2 + 1, startY + 1);
        ctx.fillStyle = '#FFD700';
        ctx.fillText(sizeText, popupX + popupWidth / 2, startY);

        // Line 2: Max units
        const maxText = `MAX: ${planet.maxUnits}`;
        ctx.fillStyle = '#000';
        ctx.fillText(maxText, popupX + popupWidth / 2 + 1, startY + lineHeight + 1);
        ctx.fillStyle = '#88ccff';
        ctx.fillText(maxText, popupX + popupWidth / 2, startY + lineHeight);

        // Line 3: Owner
        const ownerText = planet.ownerId === 0 ? 'YOU' : (planet.ownerId === -1 ? 'NEUTRAL' : 'UNKNOWN');
        const ownerColor = planet.ownerId === 0 ? '#66ff66' : (planet.ownerId === -1 ? '#888888' : '#ff6666');
        ctx.fillStyle = '#000';
        ctx.fillText(ownerText, popupX + popupWidth / 2 + 1, startY + lineHeight * 2 + 1);
        ctx.fillStyle = ownerColor;
        ctx.fillText(ownerText, popupX + popupWidth / 2, startY + lineHeight * 2);

        ctx.restore();
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      */
    }
  }

  // Turret radar zones (under attacks)
  renderTurretRadars();

  // Attacks
  renderAttacks();

  // Turret missiles
  renderTurretMissiles();

  // Drone projectiles
  renderDroneProjectiles();

  // Battles
  renderBattles();

  // Probes
  renderProbes();
  renderOrbitProbes();

  // Click +1 anims
  renderClickAnims();

  // Particles
  renderParticles();

  // Shield flicker effects
  renderShieldFlickers();

  ctx.restore();

  // Fog of war overlay (covers world, not UI)
  renderFogOfWar();

  // UI overlay
  renderUI();

  // Explore drag overlay
  renderExploreDrag();

  // Game state overlays
  if (gameState === GameState.GAMEOVER) {
    renderGameOver();
  } else if (gameState === GameState.PAUSED) {
    renderPaused();
  }
}

// ========== MOON ORBIT ==========
function updateMoons(dt: number): void {
  for (const moon of planets) {
    if (!moon.isMoon || moon.parentId === undefined) continue;

    const parent = planetMap.get(moon.parentId);
    if (!parent) continue;

    moon.orbitAngle = (moon.orbitAngle || 0) + (moon.orbitSpeed || 0.1) * dt;
    const orbitR = moon.orbitRadius || (parent.radius + 90);
    moon.x = parent.x + Math.cos(moon.orbitAngle) * orbitR;
    moon.y = parent.y + Math.sin(moon.orbitAngle) * orbitR;
  }
}

// ========== GAME LOOP ==========
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  }
  return '255, 255, 255';
}

function updateMining(): void {
  // Mine resources on owned planets
  for (const planet of planets) {
    if (planet.ownerId !== 0) continue; // only player's planets
    if (planet.deposits.length === 0) continue; // no deposits to mine
    if (gameTime < planet.nextMineTime) continue; // not time yet

    // Mine resources based on planet size
    const deposit = planet.deposits[Math.floor(Math.random() * planet.deposits.length)];
    let mineAmount = 1;
    let mineTimeMin = 5000;
    let mineTimeMax = 10000;

    switch (planet.size) {
      case PlanetSize.ASTEROID:
        mineAmount = 1; mineTimeMin = 60000; mineTimeMax = 60000; break;
      case PlanetSize.TINY:
        mineAmount = 1; mineTimeMin = 60000; mineTimeMax = 60000; break;
      case PlanetSize.SMALL:
        mineAmount = 1; mineTimeMin = 20000; mineTimeMax = 30000; break;
      case PlanetSize.MEDIUM:
        mineAmount = 2; mineTimeMin = 15000; mineTimeMax = 25000; break;
      case PlanetSize.LARGE:
        mineAmount = 3; mineTimeMin = 10000; mineTimeMax = 20000; break;
      case PlanetSize.GIANT:
        mineAmount = 5; mineTimeMin = 10000; mineTimeMax = 15000; break;
      case PlanetSize.MEGA:
        mineAmount = 8; mineTimeMin = 5000; mineTimeMax = 10000; break;
      case PlanetSize.TITAN:
        mineAmount = 12; mineTimeMin = 4000; mineTimeMax = 8000; break;
      case PlanetSize.COLOSSUS:
        mineAmount = 16; mineTimeMin = 3000; mineTimeMax = 6000; break;
    }
    deposit.amount += mineAmount;

    // Show animation with resource color
    const info = DEPOSIT_INFO[deposit.type];
    const screen = worldToScreen(planet.x, planet.y);
    clickAnims.push({
      x: screen.x + (Math.random() - 0.5) * 30,
      y: screen.y - planet.radius * camera.zoom - 10,
      vx: (Math.random() - 0.5) * 2,
      vy: -1.5 - Math.random(),
      life: 50,
      maxLife: 50,
      text: `+${mineAmount}`,
      color: hexToRgb(info.color)
    });

    // Set next mine time based on planet size
    planet.nextMineTime = gameTime + mineTimeMin + Math.random() * (mineTimeMax - mineTimeMin);
  }
}

function update(dt: number): void {
  if (gameState !== GameState.PLAYING) return;

  // Joystick camera movement (mobile)
  if (isMobile && (joystickX !== 0 || joystickY !== 0)) {
    const JOYSTICK_CAMERA_SPEED = 800; // pixels per second
    camera.x += joystickX * JOYSTICK_CAMERA_SPEED * dt;
    camera.y += joystickY * JOYSTICK_CAMERA_SPEED * dt;
  }

  gameTime += dt * 1000;

  updateMoons(dt);
  updateMining();
  updateGrowth(dt);
  updateStability(dt);
  updateAttacks(dt);
  updateTurrets();
  updateTurretMissiles(dt);
  updateDroneIntercept();
  updateDroneProjectiles(dt);
  updateBattles();
  updateParticles(dt);
  updateShields(dt);
  updateProbes(dt);
  updateOrbitProbes(dt);
  updateClickAnims(dt);
  updateShieldFlickers();

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



  checkGameOver();
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
