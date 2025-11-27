// Simple version without complex imports
// Force rebuild - wallet button fix (v2)
import { SaveManagerV2 } from './persistence/SaveManagerV2';
import { SaveDataV2, createInitialSaveDataV2 } from './persistence/SaveDataV2';
import { walletService } from './services/WalletService';
import { supabaseService } from './services/SupabaseService';
import { matchmakingService } from './services/MatchmakingService';
import { pvpSyncService } from './services/PvPSyncService';
import { colyseusService } from './services/ColyseusService';
import type { Match } from './services/SupabaseService';
import { ProfileManager } from './profile/ProfileManager';
import { nftService } from './services/NftService';
import type { NftItem } from './types/nft';

console.log('Starting simple game...');

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

console.log('Canvas:', canvas);
console.log('Context:', ctx);

// Helper function to convert mouse coordinates to canvas coordinates
// This handles canvas scaling correctly
function getCanvasMousePos(e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

// Initialize wallet service - try to restore connection on startup
try {
  console.log('Initializing wallet service...');
  
  // Listen to wallet state changes to update UI
  walletService.onStateChange((state) => {
    console.log('Wallet state changed:', state);
    console.log('isConnected:', state.isConnected, 'address:', state.address);
    // UI will update automatically on next render
  });
  
  walletService.restoreConnection().then((restored) => {
    if (restored) {
      console.log('Wallet connection restored');
      const address = walletService.getAddress();
      if (address) {
        // Load profile from Supabase
        supabaseService.getProfile(address).then((profile) => {
          if (profile) {
            console.log('Profile loaded on startup:', profile);
            // TODO: Load profile data into game state
          }
        }).catch((error) => {
          console.error('Error loading profile:', error);
        });
      }
    } else {
      console.log('No wallet connection to restore');
    }
  }).catch((error) => {
    console.error('Error restoring wallet connection:', error);
  });
} catch (error) {
  console.error('Error initializing wallet service:', error);
}

// Profile Manager
const profileManager = new ProfileManager();

// Game state
let dotCurrency = 1000;
let dmg = 1;

// Wallet DOT token balance (read-only display)
const DOT_TOKEN_ADDRESS = '0x4a4e24b057b595f530417860a901f3a540995256';
let walletDotBalance: string | null = null;
let lastBalanceCheck = 0;
const BALANCE_CHECK_INTERVAL = 30000; // Check balance every 30 seconds (reduced frequency to prevent lag)
let dotHP = 10;
let dotMaxHP = 10;
let dotArmor = 5;
let dotMaxArmor = 5;
let gameState = 'Alive'; // 'Alive', 'Dying', 'Dead'

// Crit hit system
let critChance = 4; // 4% base crit chance
let critUpgradeLevel = 0; // Track upgrade level for cost calculation

// Accuracy system
let accuracy = 60; // 60% base accuracy
let accuracyUpgradeLevel = 0; // Track upgrade level for cost calculation

// NFT Bonus system
// Calculate NFT bonuses based on owned NFT count
// 1 NFT = +1 dmg, +2% crit chance, +5 HP
function calculateNftBonuses(): { dmg: number; critChance: number; hp: number } {
  const nftCount = nftList.length;
  return {
    dmg: nftCount, // +1 dmg per NFT
    critChance: nftCount * 2, // +2% crit chance per NFT
    hp: nftCount * 5 // +5 HP per NFT
  };
}

// Cache for upgrade costs (to avoid recalculating Math.pow every frame)
let cachedDmgCost: number | null = null;
let cachedDmgLevel: number = -1;
let cachedCritCost: number | null = null;
let cachedCritLevel: number = -1;
let cachedAccuracyCost: number | null = null;
let cachedAccuracyLevel: number = -1;

// FPS tracking for performance monitoring
let fpsFrameCount = 0;
let fpsLastTime = Date.now();
let currentFPS = 60;

// Frame time tracking (to detect frame pacing issues)
let frameTimeHistory: number[] = [];
let averageFrameTime = 16.67; // 60 FPS = 16.67ms per frame
let maxFrameTime = 16.67;

// Network latency tracking (for PvP mode)
let networkLatencyHistory: number[] = [];
let averageNetworkLatency = 0;
let lastNetworkUpdateTime = 0;

// Combo system
let comboProgress = 0; // 0-100%
let comboActive = false; // Whether combo is active (100%)
let comboMultiplier = 1; // Damage multiplier (1x normal, 4x with combo)

// Armor regeneration
let lastArmorRegen = 0;

// Animation state
let deathTimer = 0;
let deathAnimation = false;
let respawnTimer = 0; // Timer for respawn delay after death animation
let upgradeMessage = '';
let upgradeMessageTimer = 0;
let upgradeSuccess = false;
let upgradeMessageX = 0; // X position where message should appear
let upgradeMessageY = 0; // Y position where message should appear

// Upgrade animation
let upgradeAnimation = false;
let upgradeProgress = 0; // 0 to 1
let upgradeType = ''; // 'dmg' or 'crit'
let upgradeCost = 0;
let upgradeParticles: Particle[] = [];
let upgradeWillSucceed = false; // Known immediately when upgrade starts
let upgradeFailAt = 1.0; // Progress where animation stops if fail (random %)

// Screen shake for crit hits
let screenShake = 0;

// Click particles
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size?: number;
};
type DamageNumber = {
  x: number;
  y: number;
  value: number | string;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  isCrit?: boolean;
  isMiss?: boolean;
};

let clickParticles: Particle[] = [];

// Projectile smoke particles (black smoke trail)
let projectileSmokeParticles: Particle[] = [];

// Click smudges/blotches (pixel art smears)
type ClickSmudge = {
  x: number;
  y: number;
  life: number;
  maxLife: number;
};
let clickSmudges: ClickSmudge[] = [];

// DOT decay particles
let dotDecayParticles: Particle[] = [];

// Damage numbers animation
let damageNumbers: DamageNumber[] = [];

// Supersonic shadow tail (comet effect)
let speedTrail: Particle[] = [];

// Reward popup animation (big center number)
type RewardPopup = {
  x: number;
  y: number;
  value: number;
  startTime: number;
  durationMs: number;
  state?: 'up' | 'fly';
  flyStartTime?: number;
  flyDurationMs?: number;
};
let rewardPopups: RewardPopup[] = [];

// CRITICAL: Helper functions to limit array sizes and prevent memory leaks
function safePushRewardPopup(popup: RewardPopup): void {
  const MAX_REWARD_POPUPS = 10;
  if (rewardPopups.length >= MAX_REWARD_POPUPS) {
    rewardPopups.shift(); // Remove oldest if at limit
  }
  rewardPopups.push(popup);
}

function safePushDamageNumber(damage: DamageNumber): void {
  const MAX_DAMAGE_NUMBERS = 50;
  if (damageNumbers.length >= MAX_DAMAGE_NUMBERS) {
    damageNumbers.shift(); // Remove oldest if at limit
  }
  damageNumbers.push(damage);
}

function safePushClickParticle(particle: Particle): void {
  const MAX_CLICK_PARTICLES = 100;
  if (clickParticles.length >= MAX_CLICK_PARTICLES) {
    clickParticles.shift(); // Remove oldest if at limit
  }
  clickParticles.push(particle);
}

function safePushProjectileSmokeParticle(particle: Particle): void {
  const MAX_PROJECTILE_SMOKE_PARTICLES = 50;
  if (projectileSmokeParticles.length >= MAX_PROJECTILE_SMOKE_PARTICLES) {
    projectileSmokeParticles.shift(); // Remove oldest if at limit
  }
  projectileSmokeParticles.push(particle);
}

function safePushDotDecayParticle(particle: Particle): void {
  const MAX_DOT_DECAY_PARTICLES = 200;
  if (dotDecayParticles.length >= MAX_DOT_DECAY_PARTICLES) {
    dotDecayParticles.shift(); // Remove oldest if at limit
  }
  dotDecayParticles.push(particle);
}

function safePushUpgradeParticle(particle: Particle): void {
  const MAX_UPGRADE_PARTICLES = 50;
  if (upgradeParticles.length >= MAX_UPGRADE_PARTICLES) {
    upgradeParticles.shift(); // Remove oldest if at limit
  }
  upgradeParticles.push(particle);
}

// Balance flash timing after reward merges
let balanceFlashUntil = 0;

// Drawing system
type DrawnLine = {
  points: Array<{ x: number; y: number }>; // Array of points for freehand drawing
  life: number;
  maxLife: number;
  hits: number; // Number of times DOT has hit this line
  maxHits: number; // Maximum hits before line disappears (2)
  ownerId?: string; // Player ID who drew this line (undefined = my line, opponentId = opponent's line)
};
let drawnLines: DrawnLine[] = [];
let isDrawing = false;
let currentDrawPoints: Array<{ x: number; y: number }> = []; // Points for current drawing
let lastDrawEndTime = 0; // When the last drawing ended
const drawCooldown = 5000; // 5 seconds cooldown between drawings
const maxDrawLength = 80; // Maximum total length of drawn line

// UI state
let isHoveringUpgrade = false;
let isPressingUpgrade = false;
let isHoveringCrit = false;
let isPressingCrit = false;
let isHoveringAccuracy = false;
let isPressingAccuracy = false;

// DOT position and physics
let dotX = 240 + (1920 - 240) / 2;
let dotY = 1080 / 2;
const dotRadius = 25; // Increased from 15 to 25
let dotVx = 0; // Horizontal velocity
let dotVy = 0; // Vertical velocity
const gravity = 0.05; // Reduced gravity (was 0.1)
const groundY = 1080 - 220; // Invisible ground 220px from bottom
let lastHitTime = 0; // Track when DOT was last hit
const gravityDelay = 1000; // 1 second delay before gravity starts (moved up another 60px)
let awaitingRestart = false;
let scheduledRestartAt = 0;
let groundShrinkStartAt = 0;
let gravityLocked = true; // Disable gravity until first successful DMG click
// Force-next-crit after high-speed platform bounce
let nextHitForceCrit = false;
let nextHitForceCritExpiresAt = 0;

// Slow-motion system
let mouseHoldStartTime = 0; // When mouse button was pressed down
let slowMotionActive = false; // Whether slow-motion is active
let slowMotionStartTime = 0; // When slow-motion started
const slowMotionHoldDelay = 600; // 0.6 seconds hold to activate
const slowMotionFreezeDuration = 600; // 0.6 seconds freeze
let savedDotVx = 0; // Save DOT velocity before freeze
let savedDotVy = 0;

// Reward: grant 10% of max HP + 10% of max Armor on death
// Track if reward has been granted for current death
let rewardGranted = false;
let deathStartX = 0;
let deathStartY = 0;

// Game mode system
type GameMode = 'Solo' | 'Training' | 'PvP';
let gameMode: GameMode = 'Solo'; // Current game mode

// PvP system
type PvPPlayer = {
  id: string; // Player ID
  x: number; // Position X
  y: number; // Position Y
  vx: number; // Velocity X
  vy: number; // Velocity Y
  mass: number; // Base mass (from Solo level conversion)
  radius: number; // DOT radius
  isOut: boolean; // Whether player is out of bounds
  color: string; // Player color for rendering
  // Solo DOT physics state (copied from Solo)
  lastHitTime: number; // Track when player was last hit
  gravityLocked: boolean; // Disable gravity until first successful hit
  speedTrail: Particle[]; // Supersonic shadow tail
  // HP and Armor system (from Solo)
  hp: number; // Current HP
  maxHP: number; // Maximum HP (from Solo)
  armor: number; // Current Armor
  maxArmor: number; // Maximum Armor (from Solo)
  // Out of bounds tracking
  outOfBoundsStartTime: number | null; // When player first went out of bounds
  lastOutOfBoundsDamageTime: number; // When last damage was dealt for being out of bounds
  // Armor regeneration
  lastArmorRegen: number; // When armor was last regenerated
  // Bullet paralysis
  paralyzedUntil: number; // Timestamp when paralysis ends (0 = not paralyzed)
};

let pvpPlayers: { [playerId: string]: PvPPlayer } = {};
let myPlayerId: string | null = null; // My player ID
let opponentId: string | null = null; // Opponent player ID

// Collision damage cooldown tracking - prevent infinite damage when players are stuck together
// Key format: "playerId1_playerId2" (sorted alphabetically to ensure same key for both players)
let lastCollisionDamageTime: { [key: string]: number } = {};
const COLLISION_DAMAGE_COOLDOWN = 500; // 500ms cooldown between collision damage
const COLLISION_DAMAGE_MIN_DISTANCE = 5; // Minimum distance (in speed units) to reset cooldown

// PvP arena bounds
const pvpBounds = {
  left: 240, // Same as playLeft
  right: 1920, // Same as playRight
  top: 0,
  bottom: 1080 - 220, // Same as groundY (invisible ground)
};

// PvP physics constants
const pvpFriction = 0.98; // Air resistance/friction
const pvpGravity = 0.05; // Same as Solo gravity

// PvP Bot AI
let botLastClickTime = 0;
let botLastSelfClickTime = 0;
const botClickCooldown = 500; // Minimum 500ms between bot clicks on blue player (less frequent)
const botSelfClickCooldown = 400; // Minimum 400ms between bot clicks on itself
const botClickChance = 0.25; // 25% chance to click on blue player (reduced to make it clear blue is player-controlled)
const botSelfClickChance = 0.3; // 30% chance to click on itself (to move around)

// PvP Projectile system (Angry Birds style - bouncing platform)
let projectileCharging = false; // Whether projectile is being charged (mouse held down)
let projectileChargeStartTime = 0; // When charging started
let projectileStartX = 0; // Projectile launch position X
let projectileStartY = 0; // Projectile launch position Y
let projectileFlying = false; // Whether projectile is flying
let projectileX = 0; // Current projectile position
let projectileY = 0;
let projectileVx = 0; // Projectile velocity X
let projectileVy = 0; // Projectile velocity Y
let projectileSpawnTime = 0; // When projectile was spawned (for 5 second lifetime)
let projectileBounceCount = 0; // How many times players have bounced on this projectile
let projectileLastShotTime = 0; // When projectile was last fired (for cooldown after hit)
const projectileGravity = 0.15; // Gravity for projectile (reduced for better upward shots)
const projectileMaxCharge = 2000; // Maximum charge time (2 seconds)
const projectileBaseSpeed = 4; // Base speed multiplier (reduced from 8)
const projectileRadius = 16; // Projectile size (doubled)
const projectileLifetime = 5000; // Projectile lifetime in milliseconds (5 seconds)
const projectileMaxBounces = 2; // Maximum number of bounces allowed on projectile
const projectileCooldown = 3000; // Cooldown after hitting target (3 seconds)

// Bullet system (simple projectile, faster than arrow, smaller than projectile)
let bulletFlying = false; // Whether bullet is flying
let bulletX = 0; // Bullet current position
let bulletY = 0;
let bulletVx = 0; // Bullet velocity X
let bulletVy = 0; // Bullet velocity Y
let bulletLastShotTime = 0; // When bullet was last fired (for cooldown)
const bulletSpeed = 18; // Bullet speed (20% faster than arrow: 15 * 1.2 = 18)
const bulletRadius = 8; // Bullet size (doubled for heavier look)
const bulletCooldown = 5000; // Cooldown between shots (5 seconds)
const bulletLifetime = 3000; // Bullet lifetime in milliseconds (3 seconds)
let bulletSpawnTime = 0; // When bullet was spawned

// Performance optimization: Cache speed calculations
let cachedDotSpeed = 0;
let cachedDotSpeedSquared = 0;
let cachedDotSpeedFrame = -1;
let cachedPlayerSpeeds: { [playerId: string]: { speed: number; speedSquared: number; frame: number } } = {};
let currentFrame = 0;

// Clean up cached player speeds periodically to prevent memory leaks
function cleanupCachedPlayerSpeeds(): void {
  // Remove entries for players that no longer exist
  for (const playerId in cachedPlayerSpeeds) {
    if (!pvpPlayers[playerId]) {
      delete cachedPlayerSpeeds[playerId];
    }
  }
  // Reset frame counter periodically to prevent overflow (every 1 million frames)
  if (currentFrame > 1000000) {
    currentFrame = 0;
    cachedDotSpeedFrame = -1;
    // Reset all cached speeds
    for (const playerId in cachedPlayerSpeeds) {
      cachedPlayerSpeeds[playerId].frame = -1;
    }
  }
}

// Apply 50% damage variance (damage ranges from 50% to 100% of base damage)
function applyDamageVariance(baseDamage: number): number {
  // Random multiplier between 0.5 and 1.0 (50% to 100%)
  const varianceMultiplier = 0.5 + Math.random() * 0.5;
  // Round to nearest integer (no decimals)
  return Math.round(baseDamage * varianceMultiplier);
}

// PvP Arrow system (from Solo mode)
let pvpArrowReady = false; // Whether arrow is ready to be fired in PvP (toggled by key "1")
let pvpArrowFired = false; // Whether arrow has been fired in PvP
let pvpKatanaFlying = false; // Whether arrow is flying in PvP
let pvpKatanaX = 0; // Arrow current position
let pvpKatanaY = 0;

// PvP position sync - OPTIMIZED for network latency
// Reduced frequency to prevent lag: 100ms = 10 times per second (was 50ms = 20 times per second)
let lastPositionSyncTime = 0;
const POSITION_SYNC_INTERVAL = 100; // Sync position every 100ms (10 times per second) - reduced to prevent network lag
let pvpKatanaVx = 0; // Arrow velocity X
let pvpKatanaVy = 0; // Arrow velocity Y
let pvpKatanaAngle = 0; // Arrow rotation angle
const pvpKatanaSpeed = 15; // Arrow flying speed
let pvpArrowLastShotTime = 0; // When arrow was last shot (for cooldown)
const pvpArrowCooldown = 10000; // Arrow cooldown in milliseconds (10 seconds)

// Opponent arrow/projectile state (synced from network)
let opponentArrowFlying = false;
let opponentArrowX = 0;
let opponentArrowY = 0;
let opponentArrowVx = 0;
let opponentArrowVy = 0;
let opponentArrowAngle = 0;

let opponentProjectileFlying = false;
let opponentProjectileX = 0;
let opponentProjectileY = 0;
let opponentProjectileVx = 0;
let opponentProjectileVy = 0;
let opponentProjectileSpawnTime = 0; // When opponent projectile was spawned
let opponentProjectileBounceCount = 0; // How many times players have bounced on opponent projectile

// Opponent bullet state (synced from network)
let opponentBulletFlying = false;
let opponentBulletX = 0;
let opponentBulletY = 0;
let opponentBulletVx = 0;
let opponentBulletVy = 0;
let opponentBulletSpawnTime = 0;


// Leveling system
let currentLevel = 1; // Current active level
let maxUnlockedLevel = 1; // Highest level unlocked
let killsInCurrentLevel = 0; // Kill counter for current level (need 5 kills to advance)
const killsNeededPerLevel = 5; // Kills needed to unlock next level
let levelButtons: Array<{x: number, y: number, level: number, hovered: boolean, pressed: boolean}> = [];
let isHoveringLevelButton = false;
let isPressingLevelButton = false;
let hoveredLevel = -1;
let pressedLevel = -1;

// Game Mode toggle button state
let isHoveringGameMode = false;
let isPressingGameMode = false;
let isHoveringPvPOnline = false;
let isPressingPvPOnline = false;

// New button state
let isHoveringNewButton = false;
let isPressingNewButton = false;

// Wallet connection button state
let isHoveringWallet = false;
let isPressingWallet = false;
let walletConnecting = false;
let walletError: string | null = null;

// Profile UI state
let isProfileOpen = false;
let isHoveringProfile = false;
let isPressingProfile = false;

// NFT state
let nftList: NftItem[] = [];
let isLoadingNfts = false;
let nftError: string | null = null;
let nftCurrentPage = 0;
const nftsPerPage = 4;
let nftPaginationHoverLeft = false;
let nftPaginationHoverRight = false;
let nftPaginationPressLeft = false;
let nftPaginationPressRight = false;

// NFT image cache
const nftImageCache: Map<string, HTMLImageElement> = new Map();
const nftImageLoading: Set<string> = new Set();

// Lobby state
let isInLobby = false;
let isSearchingForMatch = false;
let currentMatch: Match | null = null;
let isReady = false; // Whether I have clicked Ready
let waitingForOpponentReady = false; // Whether we're waiting for opponent to be ready
let lobbySearchStartTime = 0;
let isHoveringReady = false;
let isPressingReady = false;
let isHoveringCancel = false;
let isPressingCancel = false;

// Match result state
let matchResult: 'victory' | 'defeat' | null = null;
let matchResultEloChange = 0;
let showingMatchResult = false;
let opponentNicknameForResult: string | null = null; // Opponent nickname for result screen
let opponentAddressForResult: string | null = null; // Opponent address for result screen (saved when match ends)
let savedCurrentMatch: Match | null = null; // Saved copy of currentMatch for result screen
let opponentWalletAddress: string | null = null; // Opponent wallet address (for Colyseus mode)

// Opponent profile state
let isOpponentProfileOpen = false;
let opponentProfileData: any = null; // Opponent profile data from Supabase

// Death animation system - pixel art particles
interface DeathParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
}

const deathAnimations: Map<string, DeathParticle[]> = new Map(); // playerId -> particles
const deathAnimationDuration = 1500; // 1.5 seconds

// Arrow weapon system
let arrowReady = false; // Whether arrow is ready to be fired (toggled by key "1")
let arrowFired = false; // Whether arrow has been fired in this DOT lifetime (can only fire once)
let katanaX = 0; // Arrow current position - flies towards DOT
let katanaY = 0;
let arrowStartX = 0; // Arrow launch position (where it was fired from)
let arrowStartY = 0;
let katanaAngle = 0; // Arrow rotation angle
let isHoveringKatana = false;
let isPressingKatana = false;
const arrowLength = 85; // Arrow total length
const arrowShaftWidth = 2.5; // Arrow shaft width
const arrowHeadLength = 25; // Arrowhead length (longer, sharper tip)
const arrowFletchingLength = 15; // Fletching length (feathers at back)

// Katana flying system
let katanaFlying = false; // Whether katana is flying towards DOT
let katanaVx = 0; // Katana velocity X
let katanaVy = 0; // Katana velocity Y
const katanaSpeed = 15; // Katana flying speed

// Katana slash animation (happens on impact)
let katanaSlashing = false; // Whether katana is performing a slash
let katanaSlashStartTime = 0;
const katanaSlashDuration = 200; // Slash animation duration (0.2 seconds - quick strike)
let katanaHitTargets = new Set<number>(); // Track which DOT positions already hit (to avoid multiple hits)

// Save system
const saveManager = new SaveManagerV2();

// Convert current game state to SaveDataV2
let profileCreatedAt: number | null = null; // Track when profile was created

function getCurrentSaveData(): SaveDataV2 {
  // If profileCreatedAt is not set, use current time (first save)
  if (profileCreatedAt === null) {
    profileCreatedAt = Date.now();
  }
  
  return {
    version: 2,
    profile: {
      createdAt: profileCreatedAt,
      lastPlayed: Date.now(),
    },
    solo: {
      currency: dotCurrency,
      dmg: dmg,
      level: currentLevel,
      maxUnlockedLevel: maxUnlockedLevel,
      killsInCurrentLevel: killsInCurrentLevel,
      upgrades: {
        critChance: critChance,
        critUpgradeLevel: critUpgradeLevel,
        accuracy: accuracy,
        accuracyUpgradeLevel: accuracyUpgradeLevel,
      },
      maxHP: dotMaxHP,
      maxArmor: dotMaxArmor,
    },
    settings: {
      mute: false, // TODO: Add mute setting if needed
    },
  };
}

// Load game state from SaveDataV2
function loadGameState(saveData: SaveDataV2): void {
  // Restore profile creation time
  profileCreatedAt = saveData.profile.createdAt;
  
  dotCurrency = saveData.solo.currency;
  dmg = saveData.solo.dmg;
  currentLevel = saveData.solo.level;
  maxUnlockedLevel = saveData.solo.maxUnlockedLevel;
  killsInCurrentLevel = saveData.solo.killsInCurrentLevel;
  critChance = saveData.solo.upgrades.critChance;
  critUpgradeLevel = saveData.solo.upgrades.critUpgradeLevel;
  accuracy = saveData.solo.upgrades.accuracy;
  accuracyUpgradeLevel = saveData.solo.upgrades.accuracyUpgradeLevel;
  dotMaxHP = saveData.solo.maxHP;
  dotMaxArmor = saveData.solo.maxArmor;
  
  // Reset current DOT state (don't restore HP/armor, start fresh)
  dotHP = dotMaxHP;
  dotArmor = dotMaxArmor;
  gameState = 'Alive';
  
  console.log('Game state loaded from save');
}

// Load game on startup
function loadGame(): void {
  const saveData = saveManager.load();
  if (saveData) {
    loadGameState(saveData);
  } else {
    console.log('No save data found, starting fresh game');
  }
}

// Save game (only if wallet is connected)
function saveGame(): void {
  // Check if wallet is connected - only save if connected
  const walletState = walletService.getState();
  const isWalletConnected = walletState.isConnected && walletState.address;
  
  if (!isWalletConnected) {
    // Wallet not connected - don't save (game continues but progress is not saved)
    return;
  }
  
  const saveData = getCurrentSaveData();
  saveManager.save(saveData);
}

// Force save (call after important events) - only if wallet is connected
function forceSaveGame(): void {
  // Check if wallet is connected - only save if connected
  const walletState = walletService.getState();
  const isWalletConnected = walletState.isConnected && walletState.address;
  
  if (!isWalletConnected) {
    // Wallet not connected - don't save (game continues but progress is not saved)
    return;
  }
  
  const saveData = getCurrentSaveData();
  saveManager.forceSave(saveData);
}

// Solo to PvP conversion functions
function soloLevelToPvpMass(level: number): number {
  // Convert Solo level to PvP base mass: clamp(1.0 + level * 0.05, 1.0, 2.0)
  return Math.max(1.0, Math.min(2.0, 1.0 + level * 0.05));
}

function soloDmgToPvpMaxImpulse(dmg: number): number {
  // Convert Solo dmg to PvP max impulse: clamp(200 + dmg * 5, 200, 400)
  return Math.max(200, Math.min(400, 200 + dmg * 5));
}

// PvP initialization
function initializePvP(): void {
  // Clear any existing players first
  pvpPlayers = {};
  
  // Clear death animations when starting new game
  deathAnimations.clear();
  
  // Generate player IDs if not set
  if (!myPlayerId) {
    myPlayerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Convert Solo stats to PvP stats
  const pvpMass = soloLevelToPvpMass(currentLevel);
  const pvpMaxImpulse = soloDmgToPvpMaxImpulse(dmg);
  
  // Initialize my player (left side) - with NFT bonuses
  const nftBonuses = calculateNftBonuses();
  const totalMaxHP = dotMaxHP + nftBonuses.hp;
  const myPlayer: PvPPlayer = {
    id: myPlayerId,
    x: pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.25, // Left quarter
    y: pvpBounds.bottom / 2, // Middle vertically
    vx: 0,
    vy: 0,
    mass: pvpMass, // Converted from Solo level
    radius: dotRadius,
    isOut: false,
    color: '#000000', // Black for my player
    lastHitTime: 0,
    gravityLocked: true, // Same as Solo - disable gravity until first hit
    speedTrail: [], // Supersonic shadow tail
    hp: totalMaxHP, // Use Solo max HP + NFT bonus
    maxHP: totalMaxHP, // Use Solo max HP + NFT bonus
    armor: dotMaxArmor, // Use Solo max Armor
    maxArmor: dotMaxArmor, // Use Solo max Armor
    outOfBoundsStartTime: null, // Track when player goes out of bounds
    lastOutOfBoundsDamageTime: 0, // Track last damage time for out of bounds
    lastArmorRegen: Date.now(), // When armor was last regenerated
    paralyzedUntil: 0, // Not paralyzed initially
  };
  
  pvpPlayers[myPlayerId] = myPlayer;
  
  console.log(`PvP stats: mass=${pvpMass.toFixed(2)}, maxImpulse=${pvpMaxImpulse}`);
  
  // Initialize opponent (right side) - will be synced from network later
  // For testing: create a test opponent if no network opponent
  if (!opponentId) {
    opponentId = `opponent_test_${Date.now()}`;
  }
  
  const opponent: PvPPlayer = {
    id: opponentId,
    x: pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.75, // Right quarter
    y: pvpBounds.bottom / 2, // Middle vertically
    vx: 0,
    vy: 0,
    mass: 1.0, // Default, will be synced from network
    radius: dotRadius,
    isOut: false,
    color: '#000000', // Black for opponent
    lastHitTime: 0,
    gravityLocked: true,
    speedTrail: [],
    hp: dotMaxHP, // Use Solo max HP (same as my player for now)
    maxHP: dotMaxHP, // Use Solo max HP
    armor: dotMaxArmor, // Use Solo max Armor (same as my player for now)
    maxArmor: dotMaxArmor, // Use Solo max Armor
    outOfBoundsStartTime: null, // Track when player goes out of bounds
    lastOutOfBoundsDamageTime: 0, // Track last damage time for out of bounds
    lastArmorRegen: Date.now(),
    paralyzedUntil: 0, // Not paralyzed initially
  };
  
  pvpPlayers[opponentId] = opponent;
  
  console.log('PvP initialized', { myPlayerId, opponentId });
}

// PvP cleanup (when switching back to Solo)
function cleanupPvP(): void {
  pvpPlayers = {};
  myPlayerId = null;
  opponentId = null;
  isInLobby = false;
  isSearchingForMatch = false;
  currentMatch = null;
  // Cleanup Colyseus connection
  colyseusService.leaveRoom().catch(console.error);
  
  // Cleanup Supabase sync (for compatibility)
  pvpSyncService.stopSync();
  matchmakingService.clearMatch();
  console.log('PvP cleaned up');
}

// Get CORS proxy URL for images
function getCorsProxyUrl(url: string): string {
  // Use CORS proxy for S3 URLs and other external URLs that might have CORS issues
  if (url.includes('s3.amazonaws.com') || url.includes('s3.')) {
    return `https://corsproxy.io/?${encodeURIComponent(url)}`;
  }
  return url;
}

// Load NFT image asynchronously
function loadNftImage(imageUrl: string, tokenId: string): void {
  if (!imageUrl || imageUrl.trim() === '') {
    console.warn(`No image URL for token ${tokenId}`);
    return;
  }
  
  if (nftImageCache.has(imageUrl) || nftImageLoading.has(imageUrl)) {
    return; // Already loaded or loading
  }
  
  console.log(`Loading NFT image for token ${tokenId}:`, imageUrl);
  nftImageLoading.add(imageUrl);
  
  const img = new Image();
  
  // Try direct load first (for IPFS and other CORS-enabled sources)
  img.crossOrigin = 'anonymous'; // Allow CORS
  
  img.onload = () => {
    nftImageCache.set(imageUrl, img);
    nftImageLoading.delete(imageUrl);
    console.log(`✅ NFT image loaded successfully for token ${tokenId}:`, imageUrl, `(${img.width}x${img.height})`);
  };
  
  img.onerror = (error) => {
    console.warn(`Direct load failed for token ${tokenId}, trying CORS proxy...`);
    nftImageLoading.delete(imageUrl);
    
    // If direct load failed (likely CORS), try CORS proxy
    if (imageUrl.includes('s3.amazonaws.com') || imageUrl.includes('s3.')) {
      const proxyUrl = getCorsProxyUrl(imageUrl);
      console.log(`Trying CORS proxy for token ${tokenId}:`, proxyUrl);
      
      const proxyImg = new Image();
      proxyImg.crossOrigin = 'anonymous';
      
      proxyImg.onload = () => {
        nftImageCache.set(imageUrl, proxyImg); // Cache with original URL as key
        nftImageLoading.delete(imageUrl);
        console.log(`✅ NFT image loaded via proxy for token ${tokenId}:`, imageUrl, `(${proxyImg.width}x${proxyImg.height})`);
      };
      
      proxyImg.onerror = (proxyError) => {
        console.error(`❌ Failed to load NFT image via proxy for token ${tokenId}:`, imageUrl, proxyError);
        nftImageLoading.delete(imageUrl);
      };
      
      try {
        proxyImg.src = proxyUrl;
      } catch (proxyError) {
        console.error(`❌ Error setting proxy image src for token ${tokenId}:`, proxyError);
        nftImageLoading.delete(imageUrl);
      }
    } else {
      console.error(`❌ Failed to load NFT image for token ${tokenId}:`, imageUrl, error);
    }
  };
  
  try {
    img.src = imageUrl;
  } catch (error) {
    console.error(`❌ Error setting image src for token ${tokenId}:`, error);
    nftImageLoading.delete(imageUrl);
  }
}

// Load player NFTs
async function loadPlayerNfts(walletAddress: string): Promise<void> {
  if (isLoadingNfts) return; // Already loading
  
  isLoadingNfts = true;
  nftError = null;
  nftList = [];
  nftCurrentPage = 0;
  
  try {
    console.log('Loading NFTs for wallet:', walletAddress);
    const nfts = await nftService.loadPlayerNfts(walletAddress);
    nftList = nfts;
    console.log(`Loaded ${nfts.length} NFTs`);
    
    // Preload images for all NFTs
    nfts.forEach((nft) => {
      if (nft.image) {
        loadNftImage(nft.image, nft.tokenId);
      }
    });
  } catch (error: any) {
    console.error('Failed to load NFTs:', error);
    nftError = error.message || 'Could not load your Ronkeverse NFTs. Please try again later.';
    nftList = [];
  } finally {
    isLoadingNfts = false;
  }
}

// Enter PvP lobby (Colyseus primary, Supabase fallback)
async function enterLobby(): Promise<void> {
  const walletState = walletService.getState();
  if (!walletState.isConnected || !walletState.address) {
    walletError = 'Connect Ronin Wallet to play PvP';
    return;
  }

  const myAddress = walletState.address;
  isInLobby = true;
  isSearchingForMatch = true;
  lobbySearchStartTime = Date.now();
  currentMatch = null;
  isReady = false;
  waitingForOpponentReady = false;

  // Check if Colyseus endpoint is configured
  // IMPORTANT: Vite replaces import.meta.env.VITE_* at build time
  // For local development, use default ws://localhost:2567
  // For production (Netlify), use Colyseus Cloud endpoint
  const isProduction = import.meta.env.PROD || 
    (window.location.hostname !== 'localhost' && 
     window.location.hostname !== '127.0.0.1');
  
  // Default endpoints
  const defaultLocalEndpoint = 'ws://localhost:2567';
  
  // Use environment variable if set, otherwise use default based on environment
  let colyseusEndpoint = import.meta.env.VITE_COLYSEUS_ENDPOINT;
  
  if (!colyseusEndpoint) {
    if (isProduction) {
      // Production: Try to use default Colyseus Cloud endpoint as fallback
      colyseusEndpoint = 'https://de-fra-f8820c12.colyseus.cloud';
      console.warn('⚠️ VITE_COLYSEUS_ENDPOINT not set, using default Colyseus Cloud endpoint');
    } else {
      // Local: use localhost endpoint
      colyseusEndpoint = defaultLocalEndpoint;
      console.log('🔵 Using default localhost endpoint for local development');
    }
  }
  
  console.log('🔍 Environment check in enterLobby:', {
    hasEnv: !!import.meta.env.VITE_COLYSEUS_ENDPOINT,
    endpoint: colyseusEndpoint ? colyseusEndpoint.substring(0, 50) + '...' : 'not set',
    isProduction: isProduction,
    hostname: window.location.hostname,
    allEnvKeys: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_'))
  });
  
  console.log('🔵 Attempting Colyseus connection first...', colyseusEndpoint);

  // TRY COLYSEUS FIRST (Primary System)
  try {
    console.log('🔵 Connecting to Colyseus server...', { endpoint: colyseusEndpoint });
    
    // Always create new client with the correct endpoint (overrides constructor default)
    const connected = await colyseusService.connect(colyseusEndpoint);
    if (!connected) {
      throw new Error(`Failed to connect to Colyseus server at ${colyseusEndpoint}`);
    }
    
    console.log('✅ Connected to Colyseus server, joining room...');
    
    // Join or create room (Colyseus handles matchmaking automatically)
    const room = await colyseusService.joinOrCreateRoom(myAddress, handleOpponentInput);
    
    if (!room) {
      throw new Error('Failed to join Colyseus room - room is null');
    }

    console.log('✅ Successfully joined Colyseus room:', room.id);
    console.log('✅ Using Colyseus as primary PvP system');
    
    // Set up room event handlers
    room.onMessage("player_joined", (message: any) => {
      console.log('Player joined:', message);
      if (message.playerCount === 2) {
        isInLobby = false;
        isSearchingForMatch = false;
        waitingForOpponentReady = true;
        console.log('Both players joined! Waiting for ready...');
        
        // Update currentMatch with opponent info
        if (currentMatch) {
          const players = Array.from(room.state.players.values());
          const opponent = players.find(p => p.sessionId !== room.sessionId);
          if (opponent && opponent.address) {
            currentMatch.p2 = opponent.address;
            // CRITICAL: Save opponent wallet address for result screen
            opponentWalletAddress = opponent.address;
            console.log('Saved opponent wallet address:', opponentWalletAddress);
          }
        }
      }
    });

    // Listen to room state changes for ready status
    room.onStateChange((state) => {
      if (currentMatch && state.players) {
        const players = Array.from(state.players.values());
        if (players.length === 2) {
          const myPlayer = players.find(p => p.sessionId === room.sessionId);
          const opponent = players.find(p => p.sessionId !== room.sessionId);
          
          if (myPlayer && opponent) {
            // CRITICAL: Save opponent wallet address for result screen
            if (opponent.address) {
              opponentWalletAddress = opponent.address;
              currentMatch.p2 = opponent.address; // Ensure p2 is set
              console.log('Saved opponent wallet address from state change:', opponentWalletAddress);
            }
            
            // Update ready status based on player order
            const isPlayer1 = currentMatch.p1 === myPlayer.address;
            if (isPlayer1) {
              currentMatch.p1Ready = myPlayer.ready;
              currentMatch.p2Ready = opponent.ready;
            } else {
              currentMatch.p1Ready = opponent.ready;
              currentMatch.p2Ready = myPlayer.ready;
            }
            
            // Update local ready state
            isReady = myPlayer.ready;
          }
        }
      }
    });

    room.onMessage("game_start", (message: any) => {
      console.log('Game started!', message);
      waitingForOpponentReady = false;
      isInLobby = false; // Exit lobby when game starts
      gameMode = 'PvP'; // Ensure game mode is set to PvP
      // Initialize PvP game
      const roomState = colyseusService.getState();
      if (roomState) {
        // Get opponent session ID
        const players = Array.from(roomState.players.keys());
        const mySessionId = room.sessionId;
        const opponentSessionId = players.find(id => id !== mySessionId);
        
        if (opponentSessionId) {
          // Initialize PvP with Colyseus room data
          initializePvPWithColyseus(room, mySessionId, opponentSessionId);
          console.log('PvP game initialized, players:', Object.keys(pvpPlayers));
        }
      }
    });

    // Create a mock match object for compatibility
    currentMatch = {
      id: room.id,
      p1: myAddress,
      p2: '', // Will be set when opponent joins
      state: 'waiting' as const,
      seed: room.state?.seed || Math.floor(Math.random() * 1000000),
      winner: null,
      p1Ready: false,
      p2Ready: false,
      created_at: new Date().toISOString()
    };

    // Successfully connected to Colyseus - return early
    return;

  } catch (error: any) {
    console.error('❌ Colyseus connection failed:', error);
    console.error('❌ Error details:', {
      message: error?.message,
      endpoint: colyseusEndpoint,
      isProduction: isProduction,
      errorType: error?.name,
      errorCode: error?.code,
      stack: error?.stack
    });
    
    // Check for specific error types
    if (error?.message?.includes('CORS') || error?.message?.includes('Access-Control')) {
      walletError = 'CORS Error: Colyseus serveris blokuoja request\'us. Reikia redeploy\'inti serverį su nauja CORS konfigūracija.';
      console.error('❌ CORS ERROR DETECTED!');
      console.error('❌ Sprendimas: Colyseus Cloud → Deployments → Redeploy');
    } else if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError') || error?.message?.includes('ERR_FAILED')) {
      walletError = 'Network Error: Negaliu pasiekti Colyseus serverio. Patikrinkite ar serveris veikia.';
      console.error('❌ NETWORK ERROR DETECTED!');
      console.error('❌ Patikrinkite: https://de-fra-f8820c12.colyseus.cloud/health');
    } else if (error?.message?.includes('room is null')) {
      walletError = 'Colyseus Room Error: Negaliu prisijungti prie room. Patikrinkite ar serveris deploy\'intas su nauja versija.';
      console.error('❌ ROOM NULL ERROR DETECTED!');
      console.error('❌ Sprendimas: Colyseus Cloud → Deployments → Redeploy');
    } else {
      walletError = `Colyseus Error: ${error?.message || 'Unknown error'}. Patikrinkite serverio status.`;
    }
    
    isInLobby = false;
    isSearchingForMatch = false;
    
    // NO SUPABASE FALLBACK - Focus only on Colyseus
    console.log('⚠️ Colyseus failed - no fallback. Please fix Colyseus server.');
  }
}

// Leave PvP lobby
async function leaveLobby(): Promise<void> {
  const walletState = walletService.getState();
  if (!walletState.address) return;

  // Leave Colyseus room if connected
  if (colyseusService.isConnectedToRoom()) {
    await colyseusService.leaveRoom().catch(console.error);
  }

  // Note: Supabase matchmaking cleanup removed - using Colyseus only

  isInLobby = false;
  isSearchingForMatch = false;
  currentMatch = null;
  isReady = false;
  waitingForOpponentReady = false;
  walletError = null;
  cleanupPvP();
}

// Subscribe to match updates to detect when both players are ready
function subscribeToMatchUpdates(matchId: string, myAddress: string, isPlayer1: boolean): void {
  const client = supabaseService.getClient();
  if (!client) {
    console.error('Cannot subscribe to match updates: Supabase client is null');
    return;
  }

  // CRITICAL: Prevent duplicate subscriptions (HMR protection)
  const channelKey = `matchChannel_${matchId}`;
  if ((window as any)[channelKey]) {
    console.warn(`⚠️ Match channel ${matchId} already exists - skipping duplicate subscription (HMR protection)`);
    return;
  }

  console.log('Subscribing to match updates...', { matchId, myAddress, isPlayer1 });

  // Listen to match state changes
  const matchChannel = client
    .channel(`match_ready_${matchId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
        filter: `id.eq.${matchId}`,
      },
      async (payload: any) => {
        console.log('Received match update via subscription:', payload);
        const match = payload.new as Match;
        console.log('Match updated via subscription:', match);
        
        // Always update currentMatch to reflect latest state
        currentMatch = match;
        
        // Update local ready state
        const isMePlayer1 = match.p1 === myAddress;
        if (isMePlayer1) {
          isReady = match.p1Ready === true;
        } else {
          isReady = match.p2Ready === true;
        }
        
        console.log('Match state updated via subscription:', { 
          p1Ready: match.p1Ready, 
          p2Ready: match.p2Ready, 
          state: match.state,
          myReady: isReady,
          isMePlayer1
        });
        
        // Check if both players are ready
        if (match.p1Ready === true && match.p2Ready === true && match.state === 'active') {
          console.log('Both players ready! Starting game...');
          waitingForOpponentReady = false;
          
          // CRITICAL: Unsubscribe from match updates BEFORE starting game
          // This frees up Supabase connection and prevents rate limiting
          await matchChannel.unsubscribe();
          console.log('Unsubscribed from match updates');
          
          // Initialize PvP with match data
          initializePvPWithMatch(match, isPlayer1);
          
          // Start PvP sync - CRITICAL: Only start if not already syncing (prevents duplicate channels)
          if (myAddress && !pvpSyncService.isSyncing()) {
            pvpSyncService.startSync(match.id, myAddress, handleOpponentInput);
          }
        }
      }
    )
    .subscribe((status: string) => {
      console.log('Match subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('Successfully subscribed to match updates');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('Error subscribing to match updates');
      }
    });
  
  // Store channel reference for cleanup
  (window as any)[`matchChannel_${matchId}`] = matchChannel;
}

// Set player ready (Colyseus only - no Supabase fallback)
async function setPlayerReady(): Promise<void> {
  console.log('=== setPlayerReady() called ===');
  
  if (!colyseusService.isConnectedToRoom()) {
    console.error('❌ Cannot set ready: Colyseus not connected');
    walletError = 'Not connected to game server. Please reconnect.';
    return;
  }

  if (!currentMatch) {
    console.error('Cannot set ready: no current match');
    return;
  }
  
  const walletState = walletService.getState();
  if (!walletState.address) {
    console.error('Cannot set ready: wallet not connected');
    return;
  }

  // Use Colyseus only
  isReady = !isReady; // Toggle ready state
  const success = colyseusService.sendReady(isReady);
  
  if (success) {
    console.log('✅ Player ready status sent to Colyseus:', isReady);
    
    // Update local match state (will be synced via onStateChange)
    const isPlayer1 = currentMatch.p1 === walletState.address;
    if (isPlayer1) {
      currentMatch.p1Ready = isReady;
    } else {
      currentMatch.p2Ready = isReady;
    }
  } else {
    console.error('❌ Failed to send ready to Colyseus');
    isReady = false;
  }
  
  console.log('=== setPlayerReady() completed ===');
}

// Initialize PvP with Colyseus room
function initializePvPWithColyseus(room: any, mySessionId: string, opponentSessionId: string): void {
  // Clear any existing players first
  pvpPlayers = {};
  
  // Clear death animations when starting new game
  deathAnimations.clear();
  
  const walletState = walletService.getState();
  const myAddress = walletState.address || '';
  
  // CRITICAL: Get opponent wallet address from room state
  const roomState = colyseusService.getState();
  if (roomState && roomState.players) {
    const players = Array.from(roomState.players.values());
    const opponent = players.find(p => p.sessionId === opponentSessionId);
    if (opponent && opponent.address) {
      opponentWalletAddress = opponent.address;
      // Update currentMatch.p2 if not already set
      if (currentMatch && !currentMatch.p2) {
        currentMatch.p2 = opponent.address;
      }
      console.log('Saved opponent wallet address in initializePvPWithColyseus:', opponentWalletAddress);
    }
  }
  
  // Set player IDs based on session IDs
  myPlayerId = mySessionId;
  opponentId = opponentSessionId;

  // Convert Solo stats to PvP stats
  const pvpMass = soloLevelToPvpMass(currentLevel);
  const pvpMaxImpulse = soloDmgToPvpMaxImpulse(dmg);

  // Calculate NFT bonuses for HP
  const nftBonuses = calculateNftBonuses();
  const totalMaxHP = dotMaxHP + nftBonuses.hp;

  // Determine if I'm player 1 or 2 based on session ID order
  const sessionIds = [mySessionId, opponentSessionId].sort();
  const isMePlayer1 = mySessionId === sessionIds[0];
  
  // Initialize my player
  const myPlayer: PvPPlayer = {
    id: myPlayerId,
    x: isMePlayer1 
      ? pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.25  // LEFT if I'm p1
      : pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.75,  // RIGHT if I'm p2
    y: pvpBounds.bottom / 2,
    vx: 0,
    vy: 0,
    mass: pvpMass,
    radius: dotRadius,
    isOut: false,
    color: '#000000', // Black - ALWAYS black for my player
    lastHitTime: 0,
    gravityLocked: true,
    speedTrail: [],
    hp: totalMaxHP,
    maxHP: totalMaxHP,
    armor: dotMaxArmor,
    maxArmor: dotMaxArmor,
    outOfBoundsStartTime: null,
    lastOutOfBoundsDamageTime: 0,
    lastArmorRegen: Date.now(),
    paralyzedUntil: 0, // Not paralyzed initially
  };

  pvpPlayers[myPlayerId] = myPlayer;

  // Initialize opponent
  const opponent: PvPPlayer = {
    id: opponentId,
    x: isMePlayer1 
      ? pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.75  // RIGHT if I'm p1
      : pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.25, // LEFT if I'm p2
    y: pvpBounds.bottom / 2,
    vx: 0,
    vy: 0,
    mass: 1.0, // Will be synced from network
    radius: dotRadius,
    isOut: false,
    color: '#000000', // Black - ALWAYS black for opponent
    lastHitTime: 0,
    gravityLocked: true,
    speedTrail: [],
    hp: dotMaxHP, // Will be synced from network
    maxHP: dotMaxHP,
    armor: dotMaxArmor,
    maxArmor: dotMaxArmor,
    outOfBoundsStartTime: null,
    lastOutOfBoundsDamageTime: 0,
    lastArmorRegen: Date.now(),
    paralyzedUntil: 0, // Not paralyzed initially
  };

  pvpPlayers[opponentId] = opponent;

  // Initialize wall spikes
  initializeWallSpikes();

  // Ensure we're not in lobby anymore
  isInLobby = false;
  gameMode = 'PvP';

  console.log('PvP initialized with Colyseus', { 
    myPlayerId, 
    opponentId, 
    players: Object.keys(pvpPlayers),
    gameMode,
    isInLobby 
  });
}

// Initialize PvP with match data (Supabase version - kept for compatibility)
function initializePvPWithMatch(match: Match, isPlayer1: boolean): void {
  // Clear any existing players first
  pvpPlayers = {};
  
  // Clear death animations when starting new game
  deathAnimations.clear();
  
  // Set player IDs based on match and wallet address
  const walletState = walletService.getState();
  const myAddress = walletState.address;
  
  // Determine which player I am based on my wallet address
  if (match.p1 === myAddress) {
    myPlayerId = match.p1;
    opponentId = match.p2;
  } else if (match.p2 === myAddress) {
    myPlayerId = match.p2;
    opponentId = match.p1;
  } else {
    // Fallback to isPlayer1 flag if address doesn't match
    myPlayerId = isPlayer1 ? match.p1 : match.p2;
    opponentId = isPlayer1 ? match.p2 : match.p1;
    console.warn('Wallet address does not match match players, using isPlayer1 flag', { myAddress, match });
  }

  // Convert Solo stats to PvP stats
  const pvpMass = soloLevelToPvpMass(currentLevel);
  const pvpMaxImpulse = soloDmgToPvpMaxImpulse(dmg);

  // CRITICAL: Player 1 (p1) always starts on LEFT, Player 2 (p2) always starts on RIGHT
  // This ensures both players see themselves in the correct position
  const isMePlayer1 = myPlayerId === match.p1;
  
  // Initialize my player - ALWAYS on the side based on whether I'm p1 or p2 - with NFT bonuses
  const nftBonuses = calculateNftBonuses();
  const totalMaxHP = dotMaxHP + nftBonuses.hp;
  const myPlayer: PvPPlayer = {
    id: myPlayerId,
    x: isMePlayer1 
      ? pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.25  // LEFT if I'm p1
      : pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.75,  // RIGHT if I'm p2
    y: pvpBounds.bottom / 2,
    vx: 0,
    vy: 0,
    mass: pvpMass,
    radius: dotRadius,
    isOut: false,
    color: '#000000', // Black - ALWAYS black for my player
    lastHitTime: 0,
    gravityLocked: true,
    speedTrail: [],
    hp: totalMaxHP,
    maxHP: totalMaxHP,
    armor: dotMaxArmor,
    maxArmor: dotMaxArmor,
    outOfBoundsStartTime: null,
    lastOutOfBoundsDamageTime: 0,
    lastArmorRegen: Date.now(),
    paralyzedUntil: 0, // Not paralyzed initially
  };

  pvpPlayers[myPlayerId] = myPlayer;

  // Initialize opponent - ALWAYS on the opposite side
  const opponent: PvPPlayer = {
    id: opponentId,
    x: isMePlayer1 
      ? pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.75  // RIGHT if I'm p1
      : pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.25, // LEFT if I'm p2
    y: pvpBounds.bottom / 2,
    vx: 0,
    vy: 0,
    mass: 1.0, // Will be synced from network
    radius: dotRadius,
    isOut: false,
    color: '#000000', // Black - ALWAYS black for opponent
    lastHitTime: 0,
    gravityLocked: true,
    speedTrail: [],
    hp: dotMaxHP, // Will be synced from network
    maxHP: dotMaxHP,
    armor: dotMaxArmor,
    maxArmor: dotMaxArmor,
    outOfBoundsStartTime: null,
    lastOutOfBoundsDamageTime: 0,
    lastArmorRegen: Date.now(),
    paralyzedUntil: 0, // Not paralyzed initially
  };

  pvpPlayers[opponentId] = opponent;

  console.log('PvP initialized with match', { 
    matchId: match.id, 
    isPlayer1: isMePlayer1,
    seed: match.seed,
    myPlayerId,
    opponentId,
    myPlayerPosition: pvpPlayers[myPlayerId]?.x,
    opponentPosition: pvpPlayers[opponentId]?.x,
    myPlayerColor: pvpPlayers[myPlayerId]?.color,
    opponentColor: pvpPlayers[opponentId]?.color,
    players: Object.keys(pvpPlayers),
    matchP1: match.p1,
    matchP2: match.p2,
    myAddress: myAddress
  });
  
  // Initialize wall spikes
  initializeWallSpikes();
}

// Handle opponent input from network
function handleOpponentInput(input: any): void {
  if (!opponentId || !pvpPlayers[opponentId]) {
    console.warn('handleOpponentInput: opponentId or opponent not found', { opponentId, players: Object.keys(pvpPlayers) });
    return;
  }

  const opponent = pvpPlayers[opponentId];

  // Handle position sync (real-time position updates)
  // OPTIMIZED: Use client-side prediction - opponent moves via physics between network updates
  // Only correct position if there's a significant difference (smooth interpolation)
  if (input.type === 'position' && input.x !== undefined && input.y !== undefined) {
    // Track network latency (time since input was created)
    if (input.timestamp) {
      const latency = Date.now() - input.timestamp;
      networkLatencyHistory.push(latency);
      if (networkLatencyHistory.length > 60) {
        networkLatencyHistory.shift(); // Keep last 60 measurements
      }
      // Calculate average latency
      const sum = networkLatencyHistory.reduce((a, b) => a + b, 0);
      averageNetworkLatency = Math.round(sum / networkLatencyHistory.length);
      lastNetworkUpdateTime = Date.now();
    }
    
    // OPTIMIZED for high latency (557ms): Use adaptive correction based on latency
    // With high latency, we need to trust client-side prediction more
    const dx = input.x - opponent.x;
    const dy = input.y - opponent.y;
    const distanceSquared = dx * dx + dy * dy;
    
    // Adaptive correction distance based on latency
    // Higher latency = larger correction distance (trust prediction more)
    const adaptiveCorrectionDistance = Math.max(50, averageNetworkLatency / 10); // 50px base, +10px per 100ms latency
    const maxCorrectionDistance = adaptiveCorrectionDistance;
    
    if (distanceSquared > maxCorrectionDistance * maxCorrectionDistance) {
      // Significant difference - smoothly interpolate towards network position
      // With high latency, use slower correction to avoid jitter
      const correctionFactor = averageNetworkLatency > 200 ? 0.3 : 0.6; // Slower correction for high latency
      opponent.x += dx * correctionFactor;
      opponent.y += dy * correctionFactor;
    } else {
      // Small difference - trust client-side prediction (opponent moves via physics)
      // Only apply small correction to prevent drift
      const smallCorrectionFactor = 0.1; // Very small correction to prevent drift
      opponent.x += dx * smallCorrectionFactor;
      opponent.y += dy * smallCorrectionFactor;
    }
    
    // Always update velocity from network (critical for physics prediction)
    // This ensures client-side prediction is accurate
    if (input.vx !== undefined) opponent.vx = input.vx;
    if (input.vy !== undefined) opponent.vy = input.vy;
    
    return;
  }

  // Apply input to opponent (simulate click/action)
  if (input.type === 'click' && input.x !== undefined && input.y !== undefined) {
    // Calculate direction from click to opponent
    const dx = input.x - opponent.x;
    const dy = input.y - opponent.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      const angle = Math.atan2(dy, dx);
      const oppositeAngle = angle + Math.PI;
      const force = input.isCrit ? 8.625 : 4.6; // Use crit flag from input
      
      opponent.vx += Math.cos(oppositeAngle) * force;
      opponent.vy += Math.sin(oppositeAngle) * force;
      opponent.lastHitTime = input.timestamp;
      opponent.gravityLocked = false;
    }
  }
  
  // Handle arrow input from opponent (launch event)
  if (input.type === 'arrow' && input.x !== undefined && input.y !== undefined) {
    opponentArrowFlying = true;
    opponentArrowX = input.x;
    opponentArrowY = input.y;
    if (input.targetX !== undefined && input.targetY !== undefined) {
      const dx = input.targetX - input.x;
      const dy = input.targetY - input.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 0) {
        opponentArrowVx = (dx / distance) * pvpKatanaSpeed;
        opponentArrowVy = (dy / distance) * pvpKatanaSpeed;
        opponentArrowAngle = Math.atan2(dy, dx);
      }
    }
    console.log('Opponent arrow launched', { x: input.x, y: input.y, targetX: input.targetX, targetY: input.targetY });
  }
  
  // Handle arrow position sync from opponent (real-time position updates)
  if (input.type === 'arrow_position' && input.x !== undefined && input.y !== undefined) {
    if (!opponentArrowFlying) {
      // Arrow was launched but we missed the launch event - initialize it
      opponentArrowFlying = true;
    }
    opponentArrowX = input.x;
    opponentArrowY = input.y;
    if (input.vx !== undefined) opponentArrowVx = input.vx;
    if (input.vy !== undefined) opponentArrowVy = input.vy;
    if (input.angle !== undefined) opponentArrowAngle = input.angle;
  }
  
  // Handle projectile input from opponent (launch event)
  if (input.type === 'projectile' && input.x !== undefined && input.y !== undefined) {
    opponentProjectileFlying = true;
    opponentProjectileX = input.x;
    opponentProjectileY = input.y;
    opponentProjectileSpawnTime = input.timestamp || Date.now(); // Record spawn time for lifetime
    opponentProjectileBounceCount = 0; // Reset bounce count
    
    // Create explosion animation at opponent's launch position
    createProjectileExplosion(opponentProjectileX, opponentProjectileY);
    
    if (input.targetX !== undefined && input.targetY !== undefined) {
      const dx = input.targetX - input.x;
      const dy = input.targetY - input.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 0) {
        const chargeRatio = input.chargeTime ? Math.min(input.chargeTime / projectileMaxCharge, 1.0) : 0.5;
        const speed = projectileBaseSpeed * (0.5 + chargeRatio * 1.5) * 1.15;
        opponentProjectileVx = (dx / distance) * speed;
        opponentProjectileVy = (dy / distance) * speed;
      }
    }
    console.log('Opponent projectile launched', { x: input.x, y: input.y, targetX: input.targetX, targetY: input.targetY });
  }
  
  // Handle projectile position sync from opponent (real-time position updates)
  if (input.type === 'projectile_position' && input.x !== undefined && input.y !== undefined) {
    if (!opponentProjectileFlying) {
      // Projectile was launched but we missed the launch event - initialize it
      opponentProjectileFlying = true;
      opponentProjectileSpawnTime = input.timestamp || Date.now();
      opponentProjectileBounceCount = 0;
    }
    opponentProjectileX = input.x;
    opponentProjectileY = input.y;
    if (input.vx !== undefined) opponentProjectileVx = input.vx;
    if (input.vy !== undefined) opponentProjectileVy = input.vy;
  }
  
  // Handle drawn line from opponent
  if (input.type === 'line' && input.points && input.points.length >= 2) {
    // Add opponent's drawn line to our drawnLines array
    drawnLines.push({
      points: input.points.map((p: any) => ({ x: p.x, y: p.y })), // Copy points
      life: 240, // 4 seconds at 60 FPS
      maxLife: 240,
      hits: 0, // Start with 0 hits
      maxHits: 2, // Line can take 2 hits before disappearing
      ownerId: opponentId // Mark as opponent's line
    });
    console.log('Received opponent drawn line', { pointCount: input.points.length });
  }
  
  // Handle bullet input from opponent (fire event)
  if (input.type === 'bullet' && input.x !== undefined && input.y !== undefined && input.vx !== undefined && input.vy !== undefined) {
    // Spawn opponent bullet
    opponentBulletFlying = true;
    opponentBulletX = input.x;
    opponentBulletY = input.y;
    opponentBulletVx = input.vx;
    opponentBulletVy = input.vy;
    opponentBulletSpawnTime = Date.now();
    
    console.log('Opponent bullet fired', { x: input.x, y: input.y, vx: input.vx, vy: input.vy });
  }
  
  // Handle hit event from opponent (damage sync)
  // When opponent hits us, they send their calculated damage, and we apply it
  // This ensures both players see/feel the EXACT same damage
  if (input.type === 'hit' && input.damage !== undefined && input.isCrit !== undefined && input.targetPlayerId !== undefined) {
    // Only process if this hit is targeting us (myPlayerId)
    if (input.targetPlayerId === myPlayerId && myPlayerId && pvpPlayers[myPlayerId]) {
      const myPlayer = pvpPlayers[myPlayerId];
      const hitDamage = input.damage;
      const isCritHit = input.isCrit;
      
      // Apply damage (armor first, then HP) - using EXACT damage from opponent
      const absorbed = Math.min(hitDamage, myPlayer.armor);
      myPlayer.armor -= absorbed;
      const remainingDamage = hitDamage - absorbed;
      myPlayer.hp = Math.max(0, myPlayer.hp - remainingDamage);
      
      // Profile: Track damage taken (PvP mode - I receive damage)
      profileManager.addDamageTaken(hitDamage);
      
      // Apply paralysis if this is a bullet hit
      if (input.isBullet && input.paralysisDuration !== undefined) {
        myPlayer.paralyzedUntil = Date.now() + input.paralysisDuration;
      }
      
      // Show damage number (EXACT same as attacker sees)
      safePushDamageNumber({
        x: myPlayer.x + (Math.random() - 0.5) * 40,
        y: myPlayer.y - 20,
        value: hitDamage,
        life: 60,
        maxLife: 60,
        vx: (Math.random() - 0.5) * 2,
        vy: -2 - Math.random() * 2,
        isCrit: isCritHit
      });
      
      // Screen shake for crit hits (same as attacker feels)
      if (isCritHit) {
        screenShake = Math.max(screenShake, 30);
      }
      
      // Send stats update back to opponent (include paralyzedUntil for paralysis sync)
      // Only send paralyzedUntil if player is actually paralyzed (paralyzedUntil > Date.now())
      const paralyzedUntilToSend = (myPlayer.paralyzedUntil > Date.now()) ? myPlayer.paralyzedUntil : undefined;
      sendStatsUpdate(myPlayer.hp, myPlayer.armor, myPlayer.maxHP, myPlayer.maxArmor, paralyzedUntilToSend);
      
      // Check if I died - start death animation
      if (myPlayer.hp <= 0 && !myPlayer.isOut && !deathAnimations.has(myPlayerId)) {
        myPlayer.isOut = true;
        const myPlayerColor = '#000000';
        createDeathAnimation(myPlayerId, myPlayer.x, myPlayer.y, myPlayerColor, myPlayer.radius);
      }
    }
    return;
  }
  
  // Handle stats update from opponent (HP/Armor sync)
  if (input.type === 'stats' && input.hp !== undefined && input.armor !== undefined) {
    // Update opponent's stats from network
    if (opponentId && pvpPlayers[opponentId]) {
      const opponent = pvpPlayers[opponentId];
      const oldHP = opponent.hp;
      opponent.hp = input.hp;
      opponent.armor = input.armor;
      if (input.maxHP !== undefined) opponent.maxHP = input.maxHP;
      if (input.maxArmor !== undefined) opponent.maxArmor = input.maxArmor;
      
      // Sync paralysis state (paralyzedUntil)
      if (input.paralyzedUntil !== undefined && input.paralyzedUntil > Date.now()) {
        opponent.paralyzedUntil = input.paralyzedUntil;
      } else if (input.paralyzedUntil !== undefined && input.paralyzedUntil <= Date.now()) {
        // Clear paralysis if it expired
        opponent.paralyzedUntil = 0;
      }
      
      console.log('Received opponent stats update', { hp: input.hp, armor: input.armor, paralyzedUntil: input.paralyzedUntil });
      
      // Check if opponent died (HP reached 0) - start death animation
      if (opponent.hp <= 0 && oldHP > 0 && !opponent.isOut && !deathAnimations.has(opponentId)) {
        opponent.isOut = true;
        
        // Determine opponent color for death animation
        const opponentColor = '#000000'; // Black for opponent
        
        // Start death animation at opponent's current position
        createDeathAnimation(opponentId, opponent.x, opponent.y, opponentColor, opponent.radius);
      }
    }
  }
}

// Send stats update to opponent
function sendStatsUpdate(hp: number, armor: number, maxHP: number, maxArmor: number, paralyzedUntil?: number): void {
  if (gameMode === 'PvP' && currentMatch) {
    const useColyseus = colyseusService.isConnectedToRoom();
    const isSyncing = useColyseus || pvpSyncService.isSyncing();
    
    if (isSyncing) {
      const statsInput: any = {
        type: 'stats' as const,
        timestamp: Date.now(),
        hp: hp,
        armor: armor,
        maxHP: maxHP,
        maxArmor: maxArmor
      };
      
      // Include paralyzedUntil if provided (for paralysis sync)
      if (paralyzedUntil !== undefined) {
        statsInput.paralyzedUntil = paralyzedUntil;
      }
      
      if (useColyseus) {
        colyseusService.sendInput(statsInput);
      } else {
        pvpSyncService.sendInput(statsInput);
      }
    }
  }
}

// Create death animation - pixel art particles that disintegrate
function createDeathAnimation(playerId: string, x: number, y: number, color: string, radius: number): void {
  const particles: DeathParticle[] = [];
  const particleCount = 30; // Number of pixel art pieces
  
  // Ensure minimum particle size for visibility
  const minParticleSize = 4; // Minimum 4 pixels
  const maxParticleSize = 8; // Maximum 8 pixels
  
  for (let i = 0; i < particleCount; i++) {
    // Random position within the player circle
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance;
    
    // Random velocity - particles fly outward
    const speed = 3 + Math.random() * 5; // Increased speed for better visibility
    const vAngle = angle + (Math.random() - 0.5) * 0.8; // More spread
    const vx = Math.cos(vAngle) * speed;
    const vy = Math.sin(vAngle) * speed - 2; // More upward bias
    
    // Random particle size within range
    const particleSize = minParticleSize + Math.random() * (maxParticleSize - minParticleSize);
    
    particles.push({
      x: px,
      y: py,
      vx: vx,
      vy: vy,
      life: deathAnimationDuration,
      maxLife: deathAnimationDuration,
      size: particleSize,
      color: color,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.15 // Slightly faster rotation
    });
  }
  
  deathAnimations.set(playerId, particles);
}

// Create projectile explosion animation (particles)
function createProjectileExplosion(x: number, y: number): void {
  // Create explosion particles (reduced from 16 to 8)
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    const speed = 2 + Math.random() * 4;
    safePushClickParticle({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 30 + Math.floor(Math.random() * 20), // 30-50 frames
      maxLife: 30 + Math.floor(Math.random() * 20),
      size: 3 + Math.random() * 4 // 3-7 pixels
    });
  }
  
  // Screen shake effect
  screenShake = Math.max(screenShake, 6);
}

// Send projectile explosion to opponent
function sendProjectileExplosion(x: number, y: number): void {
  if (gameMode === 'PvP' && currentMatch) {
    const useColyseus = colyseusService.isConnectedToRoom();
    const isSyncing = useColyseus || pvpSyncService.isSyncing();
    
    if (isSyncing) {
      const explodeInput = {
        type: 'projectile_explode' as const,
        timestamp: Date.now(),
        x: x,
        y: y
      };
      
      if (useColyseus) {
        colyseusService.sendInput(explodeInput);
      } else {
        pvpSyncService.sendInput(explodeInput);
      }
    }
  }
}

function grantDeathReward() {
  // Base reward = max HP + 25%
  const baseReward = Math.floor(dotMaxHP * 1.25);
  
  // Calculate reward multiplier based on probability
  // Priority order (highest first): 1% 8x, 5% 5x, 40% 2x, 10% 1.5x, 44% 1x
  let rewardMultiplier = 1.0; // Default (44% chance - remaining)
  const random = Math.random() * 100; // 0-100
  
  if (random < 1) {
    // 1% chance (0-1%) - 8x reward
    rewardMultiplier = 8.0;
    console.log('LUCKY! 8x reward!');
  } else if (random < 6) {
    // 5% chance (1-6%) - 5x reward
    rewardMultiplier = 5.0;
    console.log('JACKPOT! 5x reward!');
  } else if (random < 46) {
    // 40% chance (6-46%) - 2x reward
    rewardMultiplier = 2.0;
    console.log('DOUBLE! 2x reward!');
  } else if (random < 56) {
    // 10% chance (46-56%) - 1.5x reward
    rewardMultiplier = 1.5;
    console.log('BONUS! 1.5x reward!');
  }
  // else: 44% chance (56-100%) - 1x reward (default)
  
  // Apply 25% bonus to all rewards, then additional 10% (except for 10x rewards)
  let finalReward = Math.floor(baseReward * rewardMultiplier * 1.25);
  // Don't increase 10x rewards (8x multiplier * 1.25 = 10x) further
  if (rewardMultiplier < 8.0) {
    finalReward = Math.floor(finalReward * 1.1); // Additional 10% for rewards below 10x
  }
  
  if (finalReward > 0) {
    // Big reward popup at DOT death position (use saved death position)
    safePushRewardPopup({
      x: deathStartX, // Use saved DOT's death position
      y: deathStartY, // Use saved DOT's death position
      value: finalReward,
      startTime: Date.now(),
      durationMs: 3000
    });
    // Sparkles
    for (let i = 0; i < 18; i++) {
      const a = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.3;
      const s = 1 + Math.random() * 2;
      safePushDotDecayParticle({
        x: (canvas.width + 240) / 2 + Math.cos(a) * 4,
        y: canvas.height / 2 - 200 + Math.sin(a) * 4,
        vx: Math.cos(a) * (1 + Math.random() * 2),
        vy: Math.sin(a) * (1 + Math.random() * 2),
        life: 24,
        maxLife: 24,
        size: s
      });
    }
    rewardGranted = true; // Mark reward as granted
    
    // Profile: Solo kill + XP
    profileManager.addSoloKill();
    profileManager.addXP(3);
    profileManager.addDot(finalReward); // Track DOT balance increase
    
    forceSaveGame(); // Save after death reward (currency increase)
  }
}

// Moving platform (sliding horizontally across screen)
const movingPlatformWidth = 400; // increased by 100px
const movingPlatformArcHeight = 6; // bow depth
const movingPlatformY = groundY - 2; // just above ground
const movingPlatformThickness = 13; // platform thickness for 3D effect (increased by 5px)
const playLeft = 240;
const playRight = 1920;
let movingPlatformX = playLeft + movingPlatformWidth / 2; // center of platform
let movingPlatformVx = 1.5; // horizontal speed
let movingPlatformFlashTimer = 0;

// PvP platforms (static positions)
const pvpPlatformLeftX = playLeft + (playRight - playLeft) * 0.25 - 50; // Left platform (25% from left, shifted 50px left)
const pvpPlatformCenterX = (playLeft + playRight) / 2; // Center platform (50% - middle)
const pvpPlatformRightX = playLeft + (playRight - playLeft) * 0.75 + 50; // Right platform (75% from left, shifted 50px right)
const pvpPlatformSideWidth = movingPlatformWidth * 0.5; // Left and right platforms are 50% of center platform width

// Wall spikes system
interface WallSpike {
  id: string;
  side: 'left' | 'right'; // Which wall
  y: number; // Vertical position
  state: 'extending' | 'extended' | 'retracting' | 'retracted'; // Animation state
  progress: number; // 0-1, animation progress
  extendDuration: number; // 4 seconds = 4000ms
  retractDuration: number; // 5 seconds = 5000ms
  startTime: number; // When current state started
  length: number; // Spike length when fully extended (in pixels)
  width: number; // Spike width
  damagePercent: number; // 5% of max HP
  lastDamageTime: { [playerId: string]: number }; // Track damage cooldown per player
}

let wallSpikes: WallSpike[] = [];
const SPIKE_DAMAGE_COOLDOWN = 500; // 500ms cooldown between damage ticks
const SPIKE_LENGTH = 40; // Spike length when fully extended
const SPIKE_WIDTH = 8; // Spike width
const SPIKE_SPACING = 120; // Vertical spacing between spikes

// Initialize wall spikes
function initializeWallSpikes() {
  wallSpikes = [];
  // Spikes at the top (ceiling), centered vertically
  const spikeAreaTop = pvpBounds.top + 100; // Start 100px from top
  const spikeAreaBottom = pvpBounds.top + 300; // End 300px from top (200px height area)
  const centerY = (spikeAreaTop + spikeAreaBottom) / 2; // Center of spike area
  
  // Create spikes on left wall - centered vertically
  wallSpikes.push({
    id: `left_center`,
    side: 'left',
    y: centerY,
    state: 'retracted',
    progress: 0,
    extendDuration: 4000, // 4 seconds
    retractDuration: 5000, // 5 seconds
    startTime: Date.now() + Math.random() * 2000, // Random start time (0-2s delay)
    length: SPIKE_LENGTH,
    width: SPIKE_WIDTH,
    damagePercent: 5, // 5% of max HP
    lastDamageTime: {}
  });
  
  // Create spikes on right wall - centered vertically
  wallSpikes.push({
    id: `right_center`,
    side: 'right',
    y: centerY,
    state: 'retracted',
    progress: 0,
    extendDuration: 4000, // 4 seconds
    retractDuration: 5000, // 5 seconds
    startTime: Date.now() + Math.random() * 2000, // Random start time (0-2s delay)
    length: SPIKE_LENGTH,
    width: SPIKE_WIDTH,
    damagePercent: 5, // 5% of max HP
    lastDamageTime: {}
  });
}

// Sewer background rendering function
function drawSewerBackground() {
  // Dark sewer background color (dirty gray-green)
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw brick wall pattern
  const brickWidth = 40;
  const brickHeight = 20;
  const brickColor1 = '#4a3a2a'; // Dark brown brick
  const brickColor2 = '#3a2a1a'; // Darker brown brick
  const mortarColor = '#1a1a1a'; // Dark mortar
  
  // Draw bricks in background
  for (let y = 0; y < canvas.height; y += brickHeight) {
    for (let x = 240; x < canvas.width; x += brickWidth) {
      const offset = (y / brickHeight) % 2 === 0 ? 0 : brickWidth / 2; // Staggered pattern
      const brickX = x + offset;
      
      // Skip if outside canvas
      if (brickX >= canvas.width) continue;
      
      // Random brick color variation
      const isDark = Math.floor((x + y) / brickWidth) % 3 === 0;
      ctx.fillStyle = isDark ? brickColor2 : brickColor1;
      
      // Draw brick with slight 3D effect (some bricks protrude)
      const protrude = Math.floor((x + y * 7) / (brickWidth * 3)) % 5 === 0;
      const protrudeAmount = protrude ? 2 : 0;
      
      ctx.fillRect(brickX, y, brickWidth - 2, brickHeight - 2);
      
      // Draw mortar lines
      ctx.fillStyle = mortarColor;
      ctx.fillRect(brickX, y, brickWidth - 2, 1); // Top mortar
      ctx.fillRect(brickX, y + brickHeight - 3, brickWidth - 2, 1); // Bottom mortar
      ctx.fillRect(brickX, y, 1, brickHeight - 2); // Left mortar
      ctx.fillRect(brickX + brickWidth - 3, y, 1, brickHeight - 2); // Right mortar
      
      // Draw 3D shadow on protruding bricks
      if (protrude) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(brickX + brickWidth - 4, y + 1, 2, brickHeight - 4);
        ctx.fillRect(brickX + 1, y + brickHeight - 4, brickWidth - 4, 2);
      }
    }
  }
  
  // Draw pipes with spider webs
  const pipeY1 = canvas.height * 0.2;
  const pipeY2 = canvas.height * 0.6;
  const pipeY3 = canvas.height * 0.85;
  const pipeRadius = 15;
  const pipeColor = '#1a1a1a';
  const pipeHighlight = '#3a3a3a';
  
  // Pipe 1 (top)
  const pipe1X = 240 + 50;
  ctx.fillStyle = pipeColor;
  ctx.beginPath();
  ctx.arc(pipe1X, pipeY1, pipeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(pipe1X - pipeRadius, pipeY1, pipeRadius * 2, 100);
  
  // Pipe joint/connection
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(pipe1X - pipeRadius - 2, pipeY1 + 40, pipeRadius * 2 + 4, 8);
  ctx.fillRect(pipe1X - pipeRadius - 2, pipeY1 + 80, pipeRadius * 2 + 4, 8);
  
  // Pipe highlight
  ctx.fillStyle = pipeHighlight;
  ctx.beginPath();
  ctx.arc(pipe1X, pipeY1, pipeRadius - 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Rust stains on pipe
  ctx.fillStyle = 'rgba(100, 50, 20, 0.5)';
  ctx.beginPath();
  ctx.arc(pipe1X + 5, pipeY1 + 50, 8, 0, Math.PI * 2);
  ctx.fill();
  
  // Spider web on pipe 1
  drawSpiderWeb(pipe1X, pipeY1 + 30, 25);
  
  // Pipe 2 (middle)
  const pipe2X = canvas.width - 80;
  ctx.fillStyle = pipeColor;
  ctx.beginPath();
  ctx.arc(pipe2X, pipeY2, pipeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(pipe2X - pipeRadius, pipeY2, pipeRadius * 2, 80);
  
  // Pipe joint/connection
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(pipe2X - pipeRadius - 2, pipeY2 + 30, pipeRadius * 2 + 4, 8);
  ctx.fillRect(pipe2X - pipeRadius - 2, pipeY2 + 60, pipeRadius * 2 + 4, 8);
  
  // Pipe highlight
  ctx.fillStyle = pipeHighlight;
  ctx.beginPath();
  ctx.arc(pipe2X, pipeY2, pipeRadius - 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Rust stains on pipe
  ctx.fillStyle = 'rgba(100, 50, 20, 0.5)';
  ctx.beginPath();
  ctx.arc(pipe2X - 5, pipeY2 + 40, 6, 0, Math.PI * 2);
  ctx.fill();
  
  // Spider web on pipe 2
  drawSpiderWeb(pipe2X, pipeY2 + 25, 20);
  
  // Pipe 3 (bottom)
  const pipe3X = 240 + 120;
  ctx.fillStyle = pipeColor;
  ctx.beginPath();
  ctx.arc(pipe3X, pipeY3, pipeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(pipe3X - pipeRadius, pipeY3, pipeRadius * 2, 60);
  
  // Pipe joint/connection
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(pipe3X - pipeRadius - 2, pipeY3 + 25, pipeRadius * 2 + 4, 8);
  ctx.fillRect(pipe3X - pipeRadius - 2, pipeY3 + 45, pipeRadius * 2 + 4, 8);
  
  // Pipe highlight
  ctx.fillStyle = pipeHighlight;
  ctx.beginPath();
  ctx.arc(pipe3X, pipeY3, pipeRadius - 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Rust stains on pipe
  ctx.fillStyle = 'rgba(100, 50, 20, 0.5)';
  ctx.beginPath();
  ctx.arc(pipe3X + 8, pipeY3 + 30, 7, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw grime and stains
  ctx.fillStyle = 'rgba(50, 40, 30, 0.4)';
  for (let i = 0; i < 15; i++) {
    const stainX = 240 + Math.random() * (canvas.width - 240);
    const stainY = Math.random() * canvas.height;
    const stainSize = 20 + Math.random() * 40;
    ctx.beginPath();
    ctx.arc(stainX, stainY, stainSize, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Draw water stains/drips
  ctx.strokeStyle = 'rgba(100, 80, 60, 0.3)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const dripX = 240 + Math.random() * (canvas.width - 240);
    const dripStartY = Math.random() * canvas.height * 0.5;
    const dripLength = 30 + Math.random() * 50;
    ctx.beginPath();
    ctx.moveTo(dripX, dripStartY);
    ctx.lineTo(dripX + (Math.random() - 0.5) * 10, dripStartY + dripLength);
    ctx.stroke();
  }
}

// Helper function to draw spider web
function drawSpiderWeb(centerX: number, centerY: number, radius: number) {
  ctx.strokeStyle = 'rgba(180, 180, 180, 0.5)';
  ctx.lineWidth = 1;
  
  // Draw radial lines (spokes)
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    ctx.stroke();
  }
  
  // Draw concentric circles (spiral web pattern)
  for (let r = radius * 0.25; r <= radius; r += radius * 0.12) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Draw some broken/irregular web lines for realism
  ctx.strokeStyle = 'rgba(150, 150, 150, 0.3)';
  for (let i = 0; i < 3; i++) {
    const angle1 = (Math.PI * 2 * Math.random());
    const angle2 = (Math.PI * 2 * Math.random());
    const r1 = radius * (0.3 + Math.random() * 0.4);
    const r2 = radius * (0.5 + Math.random() * 0.3);
    ctx.beginPath();
    ctx.moveTo(centerX + Math.cos(angle1) * r1, centerY + Math.sin(angle1) * r1);
    ctx.lineTo(centerX + Math.cos(angle2) * r2, centerY + Math.sin(angle2) * r2);
    ctx.stroke();
  }
}

// Render function
function render() {
  // Clear canvas with white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Speed display at top (PvP/Training mode only) - render before shake so it's always visible
  if ((gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
    const myPlayer = pvpPlayers[myPlayerId];
    // Calculate current speed
    const speedSquared = myPlayer.vx * myPlayer.vx + myPlayer.vy * myPlayer.vy;
    const currentSpeed = Math.sqrt(speedSquared);
    
    // Speed text (centered, no frame)
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText(`SPEED: ${currentSpeed.toFixed(2)}`, canvas.width / 2, 18);
    ctx.textAlign = 'left'; // Reset alignment
  }
  
  // Apply screen shake
  let shakeX = 0;
  let shakeY = 0;
  if (screenShake > 0) {
    shakeX = (Math.random() - 0.5) * 4; // Reduced from 8 to 4
    shakeY = (Math.random() - 0.5) * 4; // Reduced from 8 to 4
  }
  
  // Save context for shake (UI panel is not affected by camera)
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Draw UI panel
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, 240, canvas.height);
  
  // Panel border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 240, canvas.height);

    // Currency
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.fillText(`DOT: ${dotCurrency}`, 20, 40);

  // DOT stats with frame - Solo mode only
  if (gameMode === 'Solo') {
    const statsX = 20;
    const statsY = 70;
    const statsWidth = 200;
    const statsHeight = 50;
    
    // Frame background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(statsX, statsY, statsWidth, statsHeight);
    
    // Frame border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(statsX, statsY, statsWidth, statsHeight);
    
    // HP and Armor text
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    const nftBonuses = calculateNftBonuses();
    const totalMaxHP = dotMaxHP + nftBonuses.hp;
    ctx.fillText(`HP: ${dotHP}/${dotMaxHP}`, statsX + 10, statsY + 20);
    if (nftBonuses.hp > 0) {
      ctx.fillStyle = '#00aa00'; // Green color for bonus
      ctx.fillText(`+${nftBonuses.hp}`, statsX + 10 + ctx.measureText(`HP: ${dotHP}/${dotMaxHP} `).width, statsY + 20);
    }
    
    // Armor text
    ctx.fillStyle = '#000000';
    ctx.fillText(`ARMOR: ${dotArmor}/${dotMaxArmor}`, statsX + 10, statsY + 40);
  }

  // Upgrade buttons - Solo mode only
  if (gameMode === 'Solo') {
  // Upgrade button - pixel art style
  const buttonX = 20;
  let buttonY = 160; // Moved down to make room for combo bar
  const buttonWidth = 200;
  const buttonHeight = 40;
  
  // Button pressed effect
  if (isPressingUpgrade) {
    buttonY += 2; // Move button down when pressed
  }
  
  // Button shadow (dark gray) - only if not pressed
  if (!isPressingUpgrade) {
    ctx.fillStyle = '#404040';
    ctx.fillRect(buttonX + 3, buttonY + 3, buttonWidth, buttonHeight);
  }
  
  // Button main (changes based on state)
  if (isPressingUpgrade) {
    ctx.fillStyle = '#909090'; // Darker when pressed
  } else if (isHoveringUpgrade) {
    ctx.fillStyle = '#b0b0b0'; // Slightly darker when hovering
  } else {
    ctx.fillStyle = '#c0c0c0'; // Normal state
  }
  ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
  
  // Button highlight (white) - only if not pressed
  if (!isPressingUpgrade) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(buttonX, buttonY, buttonWidth, 2);
    ctx.fillRect(buttonX, buttonY, 2, buttonHeight);
  }
  
  // Button shadow (dark gray)
  ctx.fillStyle = '#808080';
  ctx.fillRect(buttonX + buttonWidth - 2, buttonY, 2, buttonHeight);
  ctx.fillRect(buttonX, buttonY + buttonHeight - 2, buttonWidth, 2);
  
  // Button border (black)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
  
  // Button text
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 8px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillText(`UPGRADE DMG (${dmg})`, buttonX + buttonWidth/2, buttonY + 20);
  
  // Button cost info (cached to avoid recalculating Math.pow every frame)
  if (cachedDmgLevel !== dmg) {
    cachedDmgCost = Math.ceil(10 * Math.pow(1.15, dmg - 1));
    cachedDmgLevel = dmg;
  }
  const cost = cachedDmgCost!;
  ctx.font = '6px "Press Start 2P"';
  ctx.fillText(`COST: ${cost} DOT`, buttonX + buttonWidth/2, buttonY + 35);

  // Crit Hit button - pixel art style
  const critButtonX = 20;
  let critButtonY = 220; // Moved down
  const critButtonWidth = 200;
  const critButtonHeight = 40;
  
  // Button pressed effect
  if (isPressingCrit) {
    critButtonY += 2; // Move button down when pressed
  }
  
  // Button shadow (dark gray) - only if not pressed
  if (!isPressingCrit) {
    ctx.fillStyle = '#404040';
    ctx.fillRect(critButtonX + 3, critButtonY + 3, critButtonWidth, critButtonHeight);
  }
  
  // Button main (changes based on state)
  if (isPressingCrit) {
    ctx.fillStyle = '#909090'; // Darker when pressed
  } else if (isHoveringCrit) {
    ctx.fillStyle = '#b0b0b0'; // Slightly darker when hovering
  } else {
    ctx.fillStyle = '#c0c0c0'; // Normal state
  }
  ctx.fillRect(critButtonX, critButtonY, critButtonWidth, critButtonHeight);
  
  // Button highlight (white) - only if not pressed
  if (!isPressingCrit) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(critButtonX, critButtonY, critButtonWidth, 2);
    ctx.fillRect(critButtonX, critButtonY, 2, critButtonHeight);
  }
  
  // Button shadow (dark gray)
  ctx.fillStyle = '#808080';
  ctx.fillRect(critButtonX + critButtonWidth - 2, critButtonY, 2, critButtonHeight);
  ctx.fillRect(critButtonX, critButtonY + critButtonHeight - 2, critButtonWidth, 2);
  
  // Button border (black)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(critButtonX, critButtonY, critButtonWidth, critButtonHeight);
  
  // Crit button text
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 8px "Press Start 2P"';
  ctx.textAlign = 'center';
  
  // Crit chance info
  ctx.fillText(`CRIT CHANCE ${critChance}%`, critButtonX + critButtonWidth/2, critButtonY + 20);
  
  // Crit upgrade cost info (cached to avoid recalculating Math.pow every frame)
  if (cachedCritLevel !== critUpgradeLevel) {
    cachedCritCost = Math.ceil(20 * Math.pow(1.1, critUpgradeLevel));
    cachedCritLevel = critUpgradeLevel;
  }
  const critUpgradeCost = cachedCritCost!;
  ctx.font = '6px "Press Start 2P"';
  ctx.fillText(`COST : ${critUpgradeCost} DOT`, critButtonX + critButtonWidth/2, critButtonY + 35);

  // Accuracy button - pixel art style
  const accuracyButtonX = 20;
  let accuracyButtonY = 280; // Moved down
  const accuracyButtonWidth = 200;
  const accuracyButtonHeight = 40;
  
  // Button pressed effect
  if (isPressingAccuracy) {
    accuracyButtonY += 2; // Move button down when pressed
  }
  
  // Button shadow (dark gray) - only if not pressed
  if (!isPressingAccuracy) {
    ctx.fillStyle = '#404040';
    ctx.fillRect(accuracyButtonX + 3, accuracyButtonY + 3, accuracyButtonWidth, accuracyButtonHeight);
  }
  
  // Button main (changes based on state)
  if (isPressingAccuracy) {
    ctx.fillStyle = '#909090'; // Darker when pressed
  } else if (isHoveringAccuracy) {
    ctx.fillStyle = '#b0b0b0'; // Slightly darker when hovering
  } else {
    ctx.fillStyle = '#c0c0c0'; // Normal state
  }
  ctx.fillRect(accuracyButtonX, accuracyButtonY, accuracyButtonWidth, accuracyButtonHeight);
  
  // Button highlight (white) - only if not pressed
  if (!isPressingAccuracy) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(accuracyButtonX, accuracyButtonY, accuracyButtonWidth, 2);
    ctx.fillRect(accuracyButtonX, accuracyButtonY, 2, accuracyButtonHeight);
  }
  
  // Button shadow (dark gray)
  ctx.fillStyle = '#808080';
  ctx.fillRect(accuracyButtonX + accuracyButtonWidth - 2, accuracyButtonY, 2, accuracyButtonHeight);
  ctx.fillRect(accuracyButtonX, accuracyButtonY + accuracyButtonHeight - 2, accuracyButtonWidth, 2);
  
  // Button border (black)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(accuracyButtonX, accuracyButtonY, accuracyButtonWidth, accuracyButtonHeight);
  
  // Accuracy button text
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 8px "Press Start 2P"';
  ctx.textAlign = 'center';
  
  // Accuracy info
  ctx.fillText(`ACCURACY ${accuracy}%`, accuracyButtonX + accuracyButtonWidth/2, accuracyButtonY + 20);
  
  // Accuracy upgrade cost info (cached to avoid recalculating Math.pow every frame)
  if (cachedAccuracyLevel !== accuracyUpgradeLevel) {
    cachedAccuracyCost = Math.ceil(20 * Math.pow(1.1, accuracyUpgradeLevel));
    cachedAccuracyLevel = accuracyUpgradeLevel;
  }
  const accuracyUpgradeCost = cachedAccuracyCost!;
  ctx.font = '6px "Press Start 2P"';
  ctx.fillText(`COST : ${accuracyUpgradeCost} DOT`, accuracyButtonX + accuracyButtonWidth/2, accuracyButtonY + 35);
  } // End of Solo mode upgrade buttons

  // Level selection section - REMOVED (hidden from UI)
  // Level system still exists in code but is not displayed in UI panel

  // Arrow status indicator (replaces katana button) - Solo mode only
  if (gameMode === 'Solo') {
    if (arrowReady && !arrowFired && gameState === 'Alive') {
      // Show arrow ready status
      ctx.fillStyle = '#ffff00'; // Yellow when ready
      ctx.font = 'bold 8px "Press Start 2P"';
      ctx.textAlign = 'left';
      ctx.fillText('ARROW READY - Click to fire!', 20, 480); // Moved down
    } else if (arrowFired && gameState === 'Alive') {
      // Show arrow already fired
      ctx.fillStyle = '#808080'; // Gray when fired
      ctx.font = 'bold 8px "Press Start 2P"';
      ctx.textAlign = 'left';
      ctx.fillText('ARROW FIRED', 20, 480); // Moved down
    }
  }

  // Profile button (above wallet button)
  const profileButtonX = 20;
  const profileButtonY = 400; // Above wallet button
  const profileButtonWidth = 200;
  const profileButtonHeight = 40;
  
  // Button shadow (dark gray) - only if not pressed
  if (!isPressingProfile) {
    ctx.fillStyle = '#404040';
    ctx.fillRect(profileButtonX + 2, profileButtonY + 2, profileButtonWidth, profileButtonHeight);
  }
  
  // Button main
  if (isPressingProfile) {
    ctx.fillStyle = '#909090';
  } else if (isHoveringProfile) {
    ctx.fillStyle = '#b0b0b0';
  } else {
    ctx.fillStyle = '#c0c0c0';
  }
  ctx.fillRect(profileButtonX, profileButtonY, profileButtonWidth, profileButtonHeight);
  
  // Button highlight (white) - only if not pressed
  if (!isPressingProfile) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(profileButtonX, profileButtonY, profileButtonWidth, 2);
    ctx.fillRect(profileButtonX, profileButtonY, 2, profileButtonHeight);
  }
  
  // Button shadow (dark gray)
  ctx.fillStyle = '#808080';
  ctx.fillRect(profileButtonX + profileButtonWidth - 2, profileButtonY, 2, profileButtonHeight);
  ctx.fillRect(profileButtonX, profileButtonY + profileButtonHeight - 2, profileButtonWidth, 2);
  
  // Button border (black)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(profileButtonX, profileButtonY, profileButtonWidth, profileButtonHeight);
  
  // Button text
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 10px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PROFILE', profileButtonX + profileButtonWidth/2, profileButtonY + profileButtonHeight/2);

  // Wallet connection button (moved down to avoid overlapping with other info) - ALWAYS render, regardless of game mode
  const walletButtonX = 20;
  const walletButtonY = 450; // Moved down below Profile button
  const walletButtonWidth = 200;
  const walletButtonHeight = 40;
  
  // DEBUG: Log wallet button rendering (only once per session)
  if (!(window as any).walletButtonDebugLogged) {
    console.log('Rendering wallet button at:', { x: walletButtonX, y: walletButtonY, width: walletButtonWidth, height: walletButtonHeight });
    (window as any).walletButtonDebugLogged = true;
  }
  
  // Button shadow (dark gray) - only if not pressed
  if (!isPressingWallet) {
    ctx.fillStyle = '#404040';
    ctx.fillRect(walletButtonX + 2, walletButtonY + 2, walletButtonWidth, walletButtonHeight);
  }
  
  // Button main - make it more visible
  if (isPressingWallet) {
    ctx.fillStyle = '#909090';
  } else if (isHoveringWallet) {
    ctx.fillStyle = '#b0b0b0';
  } else {
    try {
      const walletState = walletService.getState();
      ctx.fillStyle = walletState.isConnected ? '#00ff00' : '#ff8800'; // Green if connected, ORANGE if not (more visible)
    } catch (error) {
      console.error('Error getting wallet state:', error);
      ctx.fillStyle = '#ff8800'; // Orange on error (more visible)
    }
  }
  ctx.fillRect(walletButtonX, walletButtonY, walletButtonWidth, walletButtonHeight);
  
  // Button highlight (white) - only if not pressed
  if (!isPressingWallet) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(walletButtonX, walletButtonY, walletButtonWidth, 2);
    ctx.fillRect(walletButtonX, walletButtonY, 2, walletButtonHeight);
  }
  
  // Button shadow (dark gray)
  ctx.fillStyle = '#808080';
  ctx.fillRect(walletButtonX + walletButtonWidth - 2, walletButtonY, 2, walletButtonHeight);
  ctx.fillRect(walletButtonX, walletButtonY + walletButtonHeight - 2, walletButtonWidth, 2);
  
  // Button border (black)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(walletButtonX, walletButtonY, walletButtonWidth, walletButtonHeight);
  
  // Button text
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 8px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try {
    const walletState = walletService.getState();
    // Debug: Log state on every render (only once per second to avoid spam)
    const now = Date.now();
    if (!(window as any).lastWalletStateLog || now - (window as any).lastWalletStateLog > 1000) {
      // Removed excessive logging to reduce lag - only log if there's an issue
      // console.log('Render: walletState =', walletState, 'walletConnecting =', walletConnecting);
      (window as any).lastWalletStateLog = now;
    }
    
    if (walletConnecting) {
      ctx.fillText('CONNECTING...', walletButtonX + walletButtonWidth/2, walletButtonY + walletButtonHeight/2);
    } else if (walletState.isConnected && walletState.address) {
      // Show shortened address
      const shortAddress = walletState.address.length > 12 
        ? `${walletState.address.substring(0, 6)}...${walletState.address.substring(walletState.address.length - 4)}`
        : walletState.address;
      ctx.font = 'bold 6px "Press Start 2P"';
      ctx.fillText(shortAddress, walletButtonX + walletButtonWidth/2, walletButtonY + walletButtonHeight/2 - 5);
      ctx.fillText('DISCONNECT', walletButtonX + walletButtonWidth/2, walletButtonY + walletButtonHeight/2 + 8);
    } else {
      ctx.fillText('CONNECT RONIN', walletButtonX + walletButtonWidth/2, walletButtonY + walletButtonHeight/2);
    }
  } catch (error) {
    console.error('Error rendering wallet button text:', error);
    ctx.fillText('CONNECT RONIN', walletButtonX + walletButtonWidth/2, walletButtonY + walletButtonHeight/2);
  }
  
  // Show error if any
  if (walletError) {
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 6px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.fillText(walletError.substring(0, 30), walletButtonX + 5, walletButtonY + walletButtonHeight + 15);
  }

  // Wallet DOT Balance Frame (only if wallet is connected)
  try {
    const walletStateForBalance = walletService.getState();
    if (walletStateForBalance.isConnected && walletStateForBalance.address) {
    const balanceFrameX = 20;
    const balanceFrameY = walletButtonY + walletButtonHeight + 10; // Below wallet button
    const balanceFrameWidth = 200;
    const balanceFrameHeight = 40;
    
    // Frame background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(balanceFrameX, balanceFrameY, balanceFrameWidth, balanceFrameHeight);
    
    // Frame border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(balanceFrameX, balanceFrameY, balanceFrameWidth, balanceFrameHeight);
    
    // Balance text
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 10px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    if (walletDotBalance !== null) {
      ctx.fillText(`Wallet DOT:`, balanceFrameX + 10, balanceFrameY + 8);
      ctx.font = 'bold 12px "Press Start 2P"';
      ctx.fillText(`${walletDotBalance} DOT`, balanceFrameX + 10, balanceFrameY + 22);
    } else {
      ctx.fillText(`Checking...`, balanceFrameX + 10, balanceFrameY + 15);
    }
    } // End of wallet connected check
  } catch (error) {
    // Ignore error - balance frame won't show
  }

  // Training Mode button (PvP with bot)
  const trainingButtonX = 20;
  let trainingButtonY = 500; // Default position
  try {
    const walletStateForButton = walletService.getState();
    if (walletStateForButton.isConnected && walletStateForButton.address) {
      trainingButtonY = walletButtonY + walletButtonHeight + 60; // Below balance frame
    }
  } catch (error) {
    // Use default position if error
  }
  const trainingButtonWidth = 200;
  const trainingButtonHeight = 40;
  
  // Button shadow (dark gray) - only if not pressed
  if (!isPressingGameMode) {
    ctx.fillStyle = '#404040';
    ctx.fillRect(trainingButtonX + 2, trainingButtonY + 2, trainingButtonWidth, trainingButtonHeight);
  }
  
  // Button main
  if (isPressingGameMode) {
    ctx.fillStyle = '#909090';
  } else if (isHoveringGameMode) {
    ctx.fillStyle = '#b0b0b0';
  } else {
    ctx.fillStyle = gameMode === 'Training' ? '#ffff00' : '#c0c0c0'; // Yellow for Training, gray otherwise
  }
  ctx.fillRect(trainingButtonX, trainingButtonY, trainingButtonWidth, trainingButtonHeight);
  
  // Button highlight (white) - only if not pressed
  if (!isPressingGameMode) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(trainingButtonX, trainingButtonY, trainingButtonWidth, 2);
    ctx.fillRect(trainingButtonX, trainingButtonY, 2, trainingButtonHeight);
  }
  
  // Button shadow (dark gray)
  ctx.fillStyle = '#808080';
  ctx.fillRect(trainingButtonX + trainingButtonWidth - 2, trainingButtonY, 2, trainingButtonHeight);
  ctx.fillRect(trainingButtonX, trainingButtonY + trainingButtonHeight - 2, trainingButtonWidth, 2);
  
  // Button border (black)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(trainingButtonX, trainingButtonY, trainingButtonWidth, trainingButtonHeight);
  
  // Button text
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 10px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`TRAINING`, trainingButtonX + trainingButtonWidth/2, trainingButtonY + trainingButtonHeight/2);
  
  // PvP Online button (real multiplayer)
  const pvpOnlineButtonX = 20;
  const pvpOnlineButtonY = trainingButtonY + trainingButtonHeight + 10; // Below training button
  const pvpOnlineButtonWidth = 200;
  const pvpOnlineButtonHeight = 40;
  
  // Button shadow (dark gray) - only if not pressed
  if (!isPressingPvPOnline) {
    ctx.fillStyle = '#404040';
    ctx.fillRect(pvpOnlineButtonX + 2, pvpOnlineButtonY + 2, pvpOnlineButtonWidth, pvpOnlineButtonHeight);
  }
  
  // Button main
  if (isPressingPvPOnline) {
    ctx.fillStyle = '#909090';
  } else if (isHoveringPvPOnline) {
    ctx.fillStyle = '#b0b0b0';
  } else {
    ctx.fillStyle = gameMode === 'PvP' ? '#00ff00' : '#c0c0c0'; // Green for PvP Online, gray otherwise
  }
  ctx.fillRect(pvpOnlineButtonX, pvpOnlineButtonY, pvpOnlineButtonWidth, pvpOnlineButtonHeight);
  
  // Button highlight (white) - only if not pressed
  if (!isPressingPvPOnline) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pvpOnlineButtonX, pvpOnlineButtonY, pvpOnlineButtonWidth, 2);
    ctx.fillRect(pvpOnlineButtonX, pvpOnlineButtonY, 2, pvpOnlineButtonHeight);
  }
  
  // Button shadow (dark gray)
  ctx.fillStyle = '#808080';
  ctx.fillRect(pvpOnlineButtonX + pvpOnlineButtonWidth - 2, pvpOnlineButtonY, 2, pvpOnlineButtonHeight);
  ctx.fillRect(pvpOnlineButtonX, pvpOnlineButtonY + pvpOnlineButtonHeight - 2, pvpOnlineButtonWidth, 2);
  
  // Button border (black)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(pvpOnlineButtonX, pvpOnlineButtonY, pvpOnlineButtonWidth, pvpOnlineButtonHeight);
  
  // Button text
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 10px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`PvP ONLINE`, pvpOnlineButtonX + pvpOnlineButtonWidth/2, pvpOnlineButtonY + pvpOnlineButtonHeight/2);

  // New button (placeholder - does nothing yet)
  const newButtonX = 20;
  const newButtonY = pvpOnlineButtonY + pvpOnlineButtonHeight + 10; // Below PvP Online button
  const newButtonWidth = 200;
  const newButtonHeight = 40;
  
  // Button shadow (dark gray) - only if not pressed
  if (!isPressingNewButton) {
    ctx.fillStyle = '#404040';
    ctx.fillRect(newButtonX + 2, newButtonY + 2, newButtonWidth, newButtonHeight);
  }
  
  // Button main
  if (isPressingNewButton) {
    ctx.fillStyle = '#909090';
  } else if (isHoveringNewButton) {
    ctx.fillStyle = '#b0b0b0';
  } else {
    ctx.fillStyle = '#c0c0c0'; // Gray
  }
  ctx.fillRect(newButtonX, newButtonY, newButtonWidth, newButtonHeight);
  
  // Button highlight (white) - only if not pressed
  if (!isPressingNewButton) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(newButtonX, newButtonY, newButtonWidth, 2);
    ctx.fillRect(newButtonX, newButtonY, 2, newButtonHeight);
  }
  
  // Button shadow (dark gray)
  ctx.fillStyle = '#808080';
  ctx.fillRect(newButtonX + newButtonWidth - 2, newButtonY, 2, newButtonHeight);
  ctx.fillRect(newButtonX, newButtonY + newButtonHeight - 2, newButtonWidth, 2);
  
  // Button border (black)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(newButtonX, newButtonY, newButtonWidth, newButtonHeight);
  
  // Button text
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 10px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`NEW BUTTON`, newButtonX + newButtonWidth/2, newButtonY + newButtonHeight/2);

  // FPS Statistics Frame (at bottom of panel) - EXPANDED to show network latency and frame time
  const fpsFrameX = 20;
  const fpsFrameY = canvas.height - 80; // 80px from bottom (increased height)
  const fpsFrameWidth = 200;
  const fpsFrameHeight = 70; // Increased height to show more info
  
  // Frame background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(fpsFrameX, fpsFrameY, fpsFrameWidth, fpsFrameHeight);
  
  // Frame border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(fpsFrameX, fpsFrameY, fpsFrameWidth, fpsFrameHeight);
  
  // FPS text
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 10px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`FPS: ${currentFPS}`, fpsFrameX + 10, fpsFrameY + 8);
  
  // Frame time text (shows how long each frame takes)
  ctx.font = 'bold 8px "Press Start 2P"';
  const frameTimeText = `Frame: ${averageFrameTime.toFixed(1)}ms (max: ${maxFrameTime.toFixed(1)}ms)`;
  ctx.fillText(frameTimeText, fpsFrameX + 10, fpsFrameY + 22);
  
  // Network latency text (only in PvP mode)
  if (gameMode === 'PvP' && averageNetworkLatency > 0) {
    ctx.font = 'bold 8px "Press Start 2P"';
    const latencyColor = averageNetworkLatency < 50 ? '#00ff00' : averageNetworkLatency < 100 ? '#ffff00' : '#ff0000';
    ctx.fillStyle = latencyColor;
    ctx.fillText(`Network: ${averageNetworkLatency}ms`, fpsFrameX + 10, fpsFrameY + 36);
    ctx.fillStyle = '#000000'; // Reset color
  }
  
  // FPS bar (visual indicator)
  const maxFPS = 60;
  const fpsBarWidth = fpsFrameWidth - 20;
  const fpsBarHeight = 12;
  const fpsBarX = fpsFrameX + 10;
  const fpsBarY = fpsFrameY + 50; // Moved down
  
  // FPS bar background
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(fpsBarX, fpsBarY, fpsBarWidth, fpsBarHeight);
  
  // FPS bar fill (green if >= 55, yellow if >= 30, red if < 30)
  const fpsRatio = Math.min(currentFPS / maxFPS, 1);
  const fpsBarFillWidth = fpsBarWidth * fpsRatio;
  
  if (currentFPS >= 55) {
    ctx.fillStyle = '#00ff00'; // Green
  } else if (currentFPS >= 30) {
    ctx.fillStyle = '#ffff00'; // Yellow
  } else {
    ctx.fillStyle = '#ff0000'; // Red
  }
  ctx.fillRect(fpsBarX, fpsBarY, fpsBarFillWidth, fpsBarHeight);
  
  // FPS bar border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(fpsBarX, fpsBarY, fpsBarWidth, fpsBarHeight);
  
  // Performance status text
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 6px "Press Start 2P"';
  let statusText = '';
  if (currentFPS >= 55 && averageFrameTime < 20) {
    statusText = 'EXCELLENT';
  } else if (currentFPS >= 30 && averageFrameTime < 35) {
    statusText = 'GOOD';
  } else {
    statusText = 'LAGGING';
  }
  ctx.fillText(statusText, fpsFrameX + 10, fpsFrameY + 65);

  // Combo bar - pixel art style like upgrade buttons (moved up and made thinner)
  const comboBarX = 20;
  const comboBarY = 130; // Moved up between HP frame and upgrade button
  const comboBarWidth = 200;
  const comboBarHeight = 20; // Made thinner
  
  // Combo bar shadow (dark gray)
  ctx.fillStyle = '#404040';
  ctx.fillRect(comboBarX + 3, comboBarY + 3, comboBarWidth, comboBarHeight);
  
  // Combo bar main background
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(comboBarX, comboBarY, comboBarWidth, comboBarHeight);
  
  // Combo bar highlight (white)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(comboBarX, comboBarY, comboBarWidth, 2);
  ctx.fillRect(comboBarX, comboBarY, 2, comboBarHeight);
  
  // Combo bar shadow (dark gray)
  ctx.fillStyle = '#808080';
  ctx.fillRect(comboBarX + comboBarWidth - 2, comboBarY, 2, comboBarHeight);
  ctx.fillRect(comboBarX, comboBarY + comboBarHeight - 2, comboBarWidth, 2);
  
  // Combo bar border (black)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(comboBarX, comboBarY, comboBarWidth, comboBarHeight);
  
  // Combo progress bar (upgrade style with black fill)
  if (comboProgress > 0) {
    const progressWidth = (comboProgress / 100) * comboBarWidth;
    
    // Draw progress in 8px chunks for cleaner pixel art effect
    const chunkSize = 8;
    for (let x = 0; x < progressWidth; x += chunkSize) {
      const chunkWidth = Math.min(chunkSize, progressWidth - x);
      ctx.fillStyle = '#000000'; // Black color for combo bar
      ctx.fillRect(comboBarX + x, comboBarY, chunkWidth, comboBarHeight);
    }
    
    // Add pixel art "loading" pattern inside progress - smaller, more subtle
    ctx.fillStyle = '#000000';
    for (let x = 4; x < progressWidth - 4; x += 8) {
      for (let y = 4; y < comboBarHeight - 4; y += 8) {
        if ((x + y) % 16 === 0) {
          ctx.fillRect(comboBarX + x, comboBarY + y, 2, 2); // Smaller squares
        }
      }
    }
    
    // Add jagged edge effect at progress end
    const edgeX = Math.floor(progressWidth / chunkSize) * chunkSize;
    ctx.fillStyle = '#000000';
    for (let y = 0; y < comboBarHeight; y += 4) {
      const offset = (y % 8 === 0) ? 2 : 0;
      ctx.fillRect(comboBarX + edgeX + offset, comboBarY + y, 2, 2);
    }
    
    // Add pixel art border to progress bar
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(comboBarX, comboBarY, progressWidth, comboBarHeight);
  }
  
  // Combo text
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 6px "Press Start 2P"'; // Smaller font for thinner bar
  ctx.textAlign = 'center';
  ctx.fillText(`COMBO ${Math.round(comboProgress)}%`, comboBarX + comboBarWidth/2, comboBarY + 13);
  
  // Combo status text
  if (comboActive) {
    ctx.font = 'bold 4px "Press Start 2P"'; // Even smaller for status
    ctx.fillText(`4x DAMAGE!`, comboBarX + comboBarWidth/2, comboBarY + 18);
  }

  // DOT (Solo mode only)
  if (gameMode === 'Solo' && (gameState === 'Alive' || gameState === 'Dying')) {
    // Draw fading shadow tail (behind the DOT)
    {
      ctx.save();
      for (const seg of speedTrail) {
        const alpha = (seg.life / seg.maxLife) * 0.25; // subtle shadow
        const radius = (seg.size ?? (dotRadius * 1.2)) * (seg.life / seg.maxLife);
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.beginPath();
        ctx.arc(seg.x, seg.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 1) Classic death animation takes precedence
    if (gameState === 'Dying' && deathAnimation) {
      // Pulsing + decay particles, shrink to nothing over 1s
      const progress = Math.min(1, deathTimer / 1000);
      const pulse = Math.sin(progress * Math.PI * 8) * 0.3 + 1;
      const baseRadius = dotRadius * pulse;
      const decayRadius = baseRadius * (1 - progress);

      // Emit decay particles heavily while dying
      if (Math.random() < 0.9) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * Math.max(1, decayRadius);
        const particleX = dotX + Math.cos(angle) * distance;
        const particleY = dotY + Math.sin(angle) * distance;
        safePushDotDecayParticle({
          x: particleX,
          y: particleY,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 8,
          life: 90,
          maxLife: 90,
          size: 2 + Math.random() * 4
        });
      }

      if (decayRadius > 0) {
        ctx.fillStyle = '#000000'; // Black
        ctx.beginPath();
        ctx.arc(dotX, dotY, decayRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 2) Ground-touch shrink (only when Alive and awaiting restart)
    else if (awaitingRestart && gameState === 'Alive') {
      const now = Date.now();
      const duration = Math.max(1, scheduledRestartAt - groundShrinkStartAt);
      const t = Math.min(1, (now - groundShrinkStartAt) / duration);
      const fade = 1 - t;
      const shrinkRadius = Math.max(0, dotRadius * fade);
      if (Math.random() < 0.3 && shrinkRadius > 0) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * shrinkRadius;
        safePushDotDecayParticle({
          x: dotX + Math.cos(angle) * dist,
          y: dotY + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          life: 30,
          maxLife: 30,
          size: 1 + Math.random() * 2
        });
      }
      if (shrinkRadius > 0) {
        ctx.fillStyle = '#000000'; // Black
        ctx.beginPath();
        ctx.arc(dotX, dotY, shrinkRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 3) Normal dot
    else {
      // Magnetic field braking effect when mouse is being held (only before slow-motion activates)
      // Shows magnetic field on the side where DOT is moving (braking barrier effect)
      if (mouseHoldStartTime > 0 && !slowMotionActive && gameState === 'Alive') {
        const holdTime = Date.now() - mouseHoldStartTime;
        const t = Date.now() * 0.006; // Slightly slower animation for smoother effect
        const holdProgress = Math.min(1, holdTime / slowMotionHoldDelay); // 0 to 1 as hold approaches 1 second
        
        // Calculate DOT movement direction
        const speed = Math.sqrt(dotVx * dotVx + dotVy * dotVy);
        let moveAngle = 0;
        if (speed > 0.1) {
          moveAngle = Math.atan2(dotVy, dotVx); // Direction DOT is moving
        } else {
          // If DOT is barely moving, use last known direction or default
          moveAngle = Math.atan2(dotVy || 1, dotVx || 0);
        }
        
        ctx.save();
        
        // Draw magnetic field barrier on the side where DOT is moving (smoother, shorter waves)
        const baseDistance = dotRadius + 6; // Closer to DOT
        const waveSpread = 0.7; // Shorter arc span (reduced from PI/2 to 0.7 radians ~ 40 degrees)
        
        // Draw semi-circular magnetic field barrier in movement direction (shorter waves)
        const startAngle = moveAngle - waveSpread; // Shorter arc
        const endAngle = moveAngle + waveSpread; // Shorter arc
        
        // Smooth gradient effect for waves
        const waveCount = 4;
        for (let wave = 0; wave < waveCount; wave++) {
          const waveOffset = wave * 4; // Closer waves
          const pulseAmount = Math.sin(t * 1.2 + wave * 0.5) * 2;
          const waveRadius = baseDistance + waveOffset + pulseAmount;
          
          // Fade out effect - waves get more transparent as they get farther
          const baseAlpha = 0.6 - wave * 0.15;
          const waveAlpha = (baseAlpha + Math.sin(t + wave * 0.8) * 0.1) * holdProgress;
          
          // Black color gradient - darker as they get farther
          const colorIntensity = 0 + wave * 20; // Starts at 0 (black), gets slightly lighter
          ctx.strokeStyle = `rgba(${colorIntensity}, ${colorIntensity}, ${colorIntensity}, ${waveAlpha})`;
          ctx.lineWidth = 1.5 + (1 - wave / waveCount) * 0.5; // Thinner outer waves
          ctx.lineCap = 'round';
          
          ctx.beginPath();
          ctx.arc(dotX, dotY, waveRadius, startAngle, endAngle);
          ctx.stroke();
        }
        
        // Draw magnetic field particles in front (more subtle and smoother)
        const particleCount = 6;
        for (let i = 0; i < particleCount; i++) {
          const particleSpread = waveSpread * 0.8; // Match wave spread
          const particleAngle = moveAngle + (i - particleCount / 2) * (particleSpread / particleCount);
          const particleDist = baseDistance + 8 + Math.sin(t * 2.5 + i * 0.7) * 4;
          const particleX = dotX + Math.cos(particleAngle) * particleDist;
          const particleY = dotY + Math.sin(particleAngle) * particleDist;
          
          // Smoother particle alpha with fade
          const particleAlpha = (0.5 + Math.sin(t * 3 + i) * 0.2) * holdProgress;
          
          ctx.fillStyle = `rgba(0, 0, 0, ${particleAlpha})`; // Black particles
          // Smaller, smoother particles
          const particleSize = 2 + Math.sin(t * 2 + i) * 0.5;
          ctx.fillRect(
            Math.floor(particleX - particleSize / 2),
            Math.floor(particleY - particleSize / 2),
            particleSize,
            particleSize
          );
        }
        
        // Draw subtle magnetic field force lines (smoother, pointing towards DOT)
        ctx.strokeStyle = `rgba(0, 0, 0, ${0.3 * holdProgress})`; // Black lines
        ctx.lineWidth = 0.8;
        ctx.lineCap = 'round';
        const lineCount = 5;
        const lineSpread = waveSpread * 0.6; // Match wave spread
        for (let i = 0; i < lineCount; i++) {
          const lineAngle = moveAngle + (i - lineCount / 2) * (lineSpread / lineCount);
          const lineStartDist = baseDistance + 10;
          const lineEndDist = baseDistance + 2;
          const startX = dotX + Math.cos(lineAngle) * lineStartDist;
          const startY = dotY + Math.sin(lineAngle) * lineStartDist;
          const endX = dotX + Math.cos(lineAngle) * lineEndDist;
          const endY = dotY + Math.sin(lineAngle) * lineEndDist;
          
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }
        
        ctx.restore();
      }
      
      // Solo mode: Draw dot in full black (no color change)
      if (gameMode === 'Solo') {
        ctx.fillStyle = '#000000'; // Black
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw cooldown timer in center of dot (visual indicator only)
        const now = Date.now();
        const timeSinceLastDraw = now - lastDrawEndTime;
        const remainingCooldown = Math.max(0, drawCooldown - timeSinceLastDraw);
        const canDraw = remainingCooldown <= 0;
        
        if (!canDraw) {
          const seconds = Math.ceil(remainingCooldown / 1000);
          ctx.fillStyle = '#ffffff'; // White text
          ctx.font = 'bold 8px "Press Start 2P"'; // Smaller font
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(seconds.toString(), dotX, dotY);
        }
      }
    }

    // Supersonic animation when speed >= 7 (Solo mode only)
    // OPTIMIZED: Use squared speed for comparison to avoid Math.sqrt
    if (gameMode === 'Solo') {
      const speedSquared = dotVx * dotVx + dotVy * dotVy;
      if (speedSquared >= 49) { // 7^2 = 49
        const speed = Math.sqrt(speedSquared); // Only calculate sqrt when needed
        const t = Date.now() * 0.004;
        // Pulsing white ring around the dot
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        const ringRadius = dotRadius + 3 + Math.sin(t) * 1.5;
        ctx.beginPath();
        ctx.arc(dotX, dotY, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Motion streaks in direction of velocity
        const angle = Math.atan2(dotVy, dotVx);
        const backAngle = angle + Math.PI;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) {
          const offset = i * 3;
          const sx = dotX + Math.cos(backAngle + i * 0.08) * (dotRadius + 2);
          const sy = dotY + Math.sin(backAngle + i * 0.08) * (dotRadius + 2);
          const ex = sx + Math.cos(backAngle + i * 0.08) * (6 + Math.min(12, speed));
          const ey = sy + Math.sin(backAngle + i * 0.08) * (6 + Math.min(12, speed));
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }

        // Small white highlights on the rim
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) {
          const a = angle + i * (Math.PI / 3) + Math.sin(t + i) * 0.2;
          const hx = dotX + Math.cos(a) * (dotRadius + 1);
          const hy = dotY + Math.sin(a) * (dotRadius + 1);
          ctx.fillRect(hx - 1, hy - 1, 2, 2);
        }
      }
    }

    // No death messages - only pixel art animation
  }

  // Reward popups render (on top of play area)
  {
    ctx.save();
    ctx.textAlign = 'center';
    for (let i = rewardPopups.length - 1; i >= 0; i--) {
      const rp = rewardPopups[i];
      const now = Date.now();
      // Target (DOT balance number in UI panel)
      // Calculate the center position of the current balance number
      ctx.font = 'bold 16px "Press Start 2P"';
      ctx.textAlign = 'left';
      const prefixWidth = ctx.measureText(`DOT: `).width; // Measure "DOT: " width
      const currentBalanceWidth = ctx.measureText(`${dotCurrency}`).width; // Current balance width
      const targetX = 20 + prefixWidth + currentBalanceWidth / 2; // Middle of the current balance number
      const targetY = 40 - 10;

      if (!rp.state || rp.state === 'up') {
        const tRaw = Math.min(1, Math.max(0, (now - rp.startTime) / rp.durationMs));
        const t = 1 - Math.pow(1 - tRaw, 3);
        const shown = Math.floor(rp.value * t);
        const alpha = 0.95;
        const scale = 1 + t * 0.5;
        const y = rp.y - 20 * t;
        ctx.font = `bold ${Math.floor(12 * scale)}px "Press Start 2P"`;
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
        ctx.strokeText(`+${shown} DOT`, rp.x, y);
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillText(`+${shown} DOT`, rp.x, y);
        if (tRaw >= 1) {
          // Start fly phase
          rp.state = 'fly';
          rp.flyStartTime = now;
          rp.flyDurationMs = 600; // fast merge
        }
      } else if (rp.state === 'fly') {
        const flyStart = rp.flyStartTime ?? now;
        const flyDur = rp.flyDurationMs ?? 600;
        const tf = Math.min(1, Math.max(0, (now - flyStart) / flyDur));
        const ease = 1 - Math.pow(1 - tf, 3);
        // Interpolate position towards target
        const x = rp.x + (targetX - rp.x) * ease;
        const y = rp.y - 20 + (targetY - (rp.y - 20)) * ease;
        // Count down number while flying
        const shown = Math.max(0, Math.floor(rp.value * (1 - ease)));
        // Shrink and fade
        const scale = Math.max(0.6, 1 - ease * 0.6);
        const alpha = 0.7 * (1 - ease) + 0.3;
        ctx.font = `bold ${Math.floor(12 * scale)}px "Press Start 2P"`;
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
        ctx.strokeText(`+${shown} DOT`, x, y);
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillText(`+${shown} DOT`, x, y);
        if (tf >= 1) {
          // Merge finished: add to balance
          dotCurrency += rp.value;
          // Profile: Track DOT balance increase
          profileManager.addDot(rp.value);
          rewardPopups.splice(i, 1);
        }
      }
    }
    ctx.restore();
  }

  // Moving platform render (straight, smooth, proper 3D effect)
  {
    const halfW = movingPlatformWidth / 2;
    const centerX = movingPlatformX;
    const topY = Math.floor(movingPlatformY);
    const bottomY = Math.floor(movingPlatformY + movingPlatformThickness);
    const baseColor = movingPlatformFlashTimer > 0 ? '#555555' : '#000000';
    const highlightColor = '#c0c0c0'; // light highlight
    const whiteHighlight = '#ffffff'; // brightest highlight
    
    // Main platform body (straight rectangular)
    ctx.fillStyle = baseColor;
    ctx.fillRect(centerX - halfW, topY, movingPlatformWidth, movingPlatformThickness);
    
    // Top surface highlight (bright white line)
    ctx.fillStyle = whiteHighlight;
    ctx.fillRect(centerX - halfW, topY, movingPlatformWidth, 2);
  }
  
  // PvP/Training mode: Render additional left and right platforms
  if (gameMode === 'PvP' || gameMode === 'Training') {
    const topY = Math.floor(movingPlatformY);
    const baseColor = '#000000';
    const whiteHighlight = '#ffffff';
    
    // Helper function to draw a platform with custom width
    const drawPlatform = (centerX: number, width: number) => {
      const halfW = width / 2;
      // Main platform body
      ctx.fillStyle = baseColor;
      ctx.fillRect(centerX - halfW, topY, width, movingPlatformThickness);
      
      // Top surface highlight
      ctx.fillStyle = whiteHighlight;
      ctx.fillRect(centerX - halfW, topY, width, 2);
    };
    
    // Draw left platform (50% width)
    drawPlatform(pvpPlatformLeftX, pvpPlatformSideWidth);
    
    // Draw right platform (50% width)
    drawPlatform(pvpPlatformRightX, pvpPlatformSideWidth);
  }
  
  // Bottom floor line (100px below moving platform) - where DOT/players land but don't bounce
  const bottomFloorY = movingPlatformY + 100; // 100px below platform
  
  // PvP/Training mode: Draw lava between platforms and bottom floor
  if (gameMode === 'PvP' || gameMode === 'Training') {
    const lavaTopY = movingPlatformY + movingPlatformThickness; // Start from platform bottom
    const lavaBottomY = bottomFloorY; // End at bottom floor
    const lavaHeight = lavaBottomY - lavaTopY;
    
    // Lava animation time
    const time = Date.now() * 0.002; // Slow animation
    
    // Draw lava with wave animation
    ctx.save();
    
    // Create gradient for toxic water (gray/white with green tones, brighter at top, darker at bottom) - no white, only bubbles are white
    const lavaGradient = ctx.createLinearGradient(playLeft, lavaTopY, playLeft, lavaBottomY);
    lavaGradient.addColorStop(0, 'rgba(200, 220, 200, 0.8)'); // Light gray-green at top (toxic water surface)
    lavaGradient.addColorStop(0.2, 'rgba(150, 200, 150, 0.85)'); // Light toxic green in upper middle
    lavaGradient.addColorStop(0.4, 'rgba(100, 160, 120, 0.9)'); // Medium toxic green in middle
    lavaGradient.addColorStop(0.7, 'rgba(60, 120, 80, 0.95)'); // Dark toxic green lower middle
    lavaGradient.addColorStop(1, 'rgba(30, 80, 50, 0.95)'); // Very dark toxic green at bottom
    
    // Draw lava base
    ctx.fillStyle = lavaGradient;
    ctx.fillRect(playLeft, lavaTopY, playRight - playLeft, lavaHeight);
    
    // Draw wave animation on top of toxic water (light gray with green tones) - calm waves (not white, only bubbles are white)
    ctx.strokeStyle = 'rgba(180, 220, 200, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const wavePoints = 50; // Number of wave points
    const waveAmplitude = 3; // Wave height (back to original)
    for (let i = 0; i <= wavePoints; i++) {
      const x = playLeft + (playRight - playLeft) * (i / wavePoints);
      const waveOffset = Math.sin(time + i * 0.3) * waveAmplitude; // Original calm wave movement
      const y = lavaTopY + waveOffset;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    
    // Draw additional smaller waves for depth (gray with green tones) - calm
    ctx.strokeStyle = 'rgba(160, 200, 180, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= wavePoints; i++) {
      const x = playLeft + (playRight - playLeft) * (i / wavePoints);
      const waveOffset = Math.sin(time * 1.5 + i * 0.4) * (waveAmplitude * 0.6); // Original calm
      const y = lavaTopY + waveOffset + 5;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    
    // Draw lava bubbles that rise from bottom to top and pop randomly during rise
    const bubbleCount = 12; // Increased from 7 to 12
    for (let i = 0; i < bubbleCount; i++) {
      // Each bubble has its own cycle - starts at bottom, rises to top
      const bubbleCycle = (time * 0.25 + i * 0.7) % (Math.PI * 2); // Slow rise cycle
      const bubbleProgress = bubbleCycle / (Math.PI * 2); // 0 to 1
      
      // Random spawn position for each bubble (better spread)
      // Use seeded random based on bubble index to get consistent random positions
      const seedX = i * 1234.567; // Seed for X position
      const seedY = i * 987.654; // Seed for Y spawn timing
      const randomX = (Math.sin(seedX) * 0.5 + 0.5); // 0 to 1
      const baseX = playLeft + (playRight - playLeft) * randomX; // Full width spread (0% to 100%)
      const horizontalDrift = Math.sin(time * 0.4 + i * 1.3) * 12; // Gentle horizontal drift
      const bubbleX = baseX + horizontalDrift;
      
      // Random pop point for each bubble (can pop anywhere during rise, not just at surface)
      const randomPopPoint = (Math.sin(seedY) * 0.5 + 0.5) * 0.7 + 0.2; // Pop between 20% and 90% of the way up
      
      // Bubble Y position - rises from bottom to top
      const bubbleY = lavaBottomY - 10 - bubbleProgress * (lavaHeight - 20); // Rises from bottom
      
      // Bubble size - grows as it rises
      let bubbleSize = 2 + bubbleProgress * 2.5; // Grows from 2 to 4.5 as it rises
      
      // Bubble pulsing/expanding effect (simulating bubble growth)
      const bubblePulse = Math.sin(bubbleCycle * 4) * 0.4 + 1; // Pulsing effect
      bubbleSize *= bubblePulse;
      
      // Bubble glow intensity - brighter as it rises
      const bubbleGlow = 0.4 + bubbleProgress * 0.5; // Gets brighter as it rises
      
      // Check if bubble should pop (random pop point reached)
      const shouldPop = bubbleProgress >= randomPopPoint && bubbleProgress < randomPopPoint + 0.1;
      
      // Draw bubble if it's still rising (not popped yet)
      if (!shouldPop && bubbleProgress < randomPopPoint + 0.1) {
        ctx.globalAlpha = bubbleGlow;
        // Gray/white bubbles with green tones - lighter as they rise (toxic bubbles)
        const bubbleGray = 200 + bubbleProgress * 55; // 200-255 (light gray to white)
        const bubbleGreen = 220 - bubbleProgress * 50; // 220-170 (green-gray tones)
        ctx.fillStyle = `rgba(${bubbleGray - 20}, ${bubbleGreen}, ${bubbleGray - 30}, 0.8)`;
        ctx.beginPath();
        ctx.arc(bubbleX, bubbleY, bubbleSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw bubble highlight (white)
        ctx.fillStyle = `rgba(255, 255, 255, ${bubbleGlow * 0.6})`;
        ctx.beginPath();
        ctx.arc(bubbleX - bubbleSize * 0.3, bubbleY - bubbleSize * 0.3, bubbleSize * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (shouldPop) {
        // Bubble pops during rise - draw explosion particles
        const popProgress = (bubbleProgress - randomPopPoint) / 0.1; // 0 to 1 during pop
        if (popProgress < 1.0) {
          const explosionParticles = 8;
          for (let j = 0; j < explosionParticles; j++) {
            const angle = (Math.PI * 2 * j) / explosionParticles;
            const distance = popProgress * 15;
            const particleX = bubbleX + Math.cos(angle) * distance;
            const particleY = bubbleY + Math.sin(angle) * distance - popProgress * 5; // Slight upward
            const particleSize = (1 - popProgress) * 3;
            const particleAlpha = (1 - popProgress) * 0.8;
            
            ctx.globalAlpha = particleAlpha;
            // Gray/white particles with green tones when bubble pops (toxic particles)
            const particleGray = 220 - popProgress * 50; // 220-170 (light gray to darker gray)
            const particleGreen = 200 - popProgress * 80; // 200-120 (green-gray tones)
            ctx.fillStyle = `rgba(${particleGray - 20}, ${particleGreen}, ${particleGray - 30}, 1)`;
            ctx.beginPath();
            ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    ctx.globalAlpha = 1.0;
    
    ctx.restore();
  }
  
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(playLeft, bottomFloorY);
  ctx.lineTo(playRight, bottomFloorY);
  ctx.stroke();
  
  // White highlight on top of line
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(playLeft, bottomFloorY);
  ctx.lineTo(playRight, bottomFloorY);
  ctx.stroke();

  // Drawn lines render (with fade-out animation)
  {
    for (let i = drawnLines.length - 1; i >= 0; i--) {
      const line = drawnLines[i];
      const progress = line.life / line.maxLife; // 1.0 = full, 0.0 = gone
      const alpha = Math.max(0, Math.min(1, progress)); // Fade out based on progress
      
      if (line.points.length < 2) continue; // Skip degenerate lines
      
      // Draw the line with fade-out effect
      ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.9})`;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(line.points[0].x, line.points[0].y);
      for (let j = 1; j < line.points.length; j++) {
        ctx.lineTo(line.points[j].x, line.points[j].y);
      }
      ctx.stroke();
      
      // White highlight on top (also fades out)
      if (progress > 0.2) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(line.points[0].x, line.points[0].y);
        for (let j = 1; j < line.points.length; j++) {
          ctx.lineTo(line.points[j].x, line.points[j].y);
        }
        ctx.stroke();
      }
    }
  }

  // Current drawing line preview (while drawing) - pencil tool
  if (isDrawing && currentDrawPoints.length >= 2) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(currentDrawPoints[0].x, currentDrawPoints[0].y);
    for (let i = 1; i < currentDrawPoints.length; i++) {
      ctx.lineTo(currentDrawPoints[i].x, currentDrawPoints[i].y);
    }
    ctx.stroke();
    
    // White highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(currentDrawPoints[0].x, currentDrawPoints[0].y);
    for (let i = 1; i < currentDrawPoints.length; i++) {
      ctx.lineTo(currentDrawPoints[i].x, currentDrawPoints[i].y);
    }
    ctx.stroke();
  }

  // Click particles
  ctx.fillStyle = '#000000';
  for (const particle of clickParticles) {
    const alpha = particle.life / particle.maxLife;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    const s = particle.size ?? 2;
    ctx.fillRect(particle.x, particle.y, s, s);
  }
  
  // Projectile smoke particles (black smoke trail)
  for (const particle of projectileSmokeParticles) {
    const alpha = particle.life / particle.maxLife;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.8})`; // Black with fade out
    const s = particle.size ?? 4;
    ctx.fillRect(particle.x, particle.y, s, s);
  }
  
  // Arrow render - flying or following mouse
  // Only render if arrow is ready or flying (always show when flying for smooth animation)
  if ((arrowReady && !arrowFired && gameState === 'Alive') || (katanaFlying && gameState === 'Alive')) {
    ctx.save();
    
    // Use flying position or mouse position
    const katanaPosX = katanaFlying ? katanaX : globalMouseX;
    const katanaPosY = katanaFlying ? katanaY : globalMouseY;
    
    // Only render if position is within reasonable bounds (allow some overflow for smooth animation)
    const renderMargin = 100; // Allow rendering slightly outside bounds
    const shouldRender = katanaPosX >= 240 - renderMargin && katanaPosX <= 1920 + renderMargin &&
                         katanaPosY >= 0 - renderMargin && katanaPosY <= 1080 + renderMargin;
    
    if (shouldRender) {
    
    // Calculate angle
    let currentKatanaAngle;
    if (katanaSlashing) {
      // During slash, use animated angle
      const now = Date.now();
      const slashProgress = Math.min(1, (now - katanaSlashStartTime) / katanaSlashDuration);
      const angleRange = Math.PI / 12;
      const startAngle = katanaAngle - angleRange;
      const endAngle = katanaAngle + angleRange;
      const easedProgress = slashProgress < 0.5 
        ? 2 * slashProgress * slashProgress
        : 1 - 2 * (1 - slashProgress) * (1 - slashProgress);
      currentKatanaAngle = startAngle + (endAngle - startAngle) * easedProgress;
    } else if (katanaFlying) {
      // Flying - use stored angle (pointing towards DOT)
      currentKatanaAngle = katanaAngle;
    } else {
      // Normal state - point blade towards DOT (handle at mouse, blade extends towards DOT)
      const dx = dotX - katanaPosX;
      const dy = dotY - katanaPosY;
      currentKatanaAngle = Math.atan2(dy, dx); // Blade points towards DOT
    }
    
    ctx.translate(katanaPosX, katanaPosY);
    ctx.rotate(currentKatanaAngle);
    
    const alpha = katanaSlashing ? (1 - Math.min(1, (Date.now() - katanaSlashStartTime) / katanaSlashDuration) * 0.5) : 1;
    
    // Arrow shaft (brown wooden) - main body
    const shaftLength = arrowLength - arrowHeadLength - arrowFletchingLength;
    const shaftStartX = arrowFletchingLength;
    ctx.fillStyle = `rgba(101, 67, 33, ${alpha})`; // Brown wood color
    ctx.fillRect(shaftStartX, -arrowShaftWidth / 2, shaftLength, arrowShaftWidth);
    
    // New arrowhead design - elegant, sharp, multi-layered (pointing forward)
    const headStartX = arrowLength - arrowHeadLength;
    
    // Base arrowhead layer (dark metal) - triangle pointing forward
    ctx.fillStyle = `rgba(80, 80, 90, ${alpha})`; // Dark steel
    ctx.beginPath();
    ctx.moveTo(headStartX, -arrowShaftWidth * 2.5); // Top of base (left point)
    ctx.lineTo(arrowLength, 0); // Sharp tip (forward, center)
    ctx.lineTo(headStartX, arrowShaftWidth * 2.5); // Bottom of base (right point)
    ctx.closePath();
    ctx.fill();
    
    // Middle layer (medium metal) - smaller triangle inside
    ctx.fillStyle = `rgba(120, 120, 130, ${alpha})`; // Medium steel
    ctx.beginPath();
    ctx.moveTo(headStartX + arrowHeadLength * 0.3, -arrowShaftWidth * 1.8); // Top
    ctx.lineTo(arrowLength, 0); // Sharp tip
    ctx.lineTo(headStartX + arrowHeadLength * 0.3, arrowShaftWidth * 1.8); // Bottom
    ctx.closePath();
    ctx.fill();
    
    // Top highlight layer (bright metal edge) - left edge
    ctx.fillStyle = `rgba(200, 200, 210, ${alpha})`; // Bright steel highlight
    ctx.beginPath();
    ctx.moveTo(headStartX + arrowHeadLength * 0.5, -arrowShaftWidth / 2); // Top
    ctx.lineTo(arrowLength - arrowHeadLength * 0.1, -arrowShaftWidth * 1.2); // Middle
    ctx.lineTo(arrowLength, 0); // Sharp tip
    ctx.closePath();
    ctx.fill();
    
    // Top highlight layer (bright metal edge) - right edge
    ctx.beginPath();
    ctx.moveTo(headStartX + arrowHeadLength * 0.5, arrowShaftWidth / 2); // Bottom
    ctx.lineTo(arrowLength - arrowHeadLength * 0.1, arrowShaftWidth * 1.2); // Middle
    ctx.lineTo(arrowLength, 0); // Sharp tip
    ctx.closePath();
    ctx.fill();
    
    // Extra sharp tip accent (white/silver)
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`; // White tip
    ctx.beginPath();
    ctx.moveTo(arrowLength - 2, -arrowShaftWidth * 0.8); // Top
    ctx.lineTo(arrowLength, 0); // Sharp tip
    ctx.lineTo(arrowLength - 2, arrowShaftWidth * 0.8); // Bottom
    ctx.closePath();
    ctx.fill();
    
    // Fletching (feathers at back) - colorful feathers
    ctx.fillStyle = `rgba(180, 40, 40, ${alpha})`; // Red feather
    ctx.fillRect(0, -arrowShaftWidth * 2.5, 5, arrowShaftWidth * 1.5);
    ctx.fillRect(0, arrowShaftWidth, 5, arrowShaftWidth * 1.5);
    
    ctx.fillStyle = `rgba(40, 40, 180, ${alpha})`; // Blue feather
    ctx.fillRect(5, -arrowShaftWidth * 2.5, 5, arrowShaftWidth * 1.5);
    ctx.fillRect(5, arrowShaftWidth, 5, arrowShaftWidth * 1.5);
    
    ctx.fillStyle = `rgba(180, 40, 40, ${alpha})`; // Red feather
    ctx.fillRect(10, -arrowShaftWidth * 2.5, 5, arrowShaftWidth * 1.5);
    ctx.fillRect(10, arrowShaftWidth, 5, arrowShaftWidth * 1.5);
    
    // Motion trail effect during slash (only early in animation)
    if (katanaSlashing) {
      const now = Date.now();
      const slashProgress = Math.min(1, (now - katanaSlashStartTime) / katanaSlashDuration);
      if (slashProgress < 0.7) {
        ctx.fillStyle = `rgba(200, 200, 255, ${alpha * 0.3})`;
        ctx.fillRect(-10, -arrowShaftWidth - 1, 10, arrowShaftWidth * 2 + 2);
      }
    }
    
    ctx.restore();
    }
  }

  // Arrow slash animation render (only when slashing) - quick strike on impact
  if (katanaSlashing) {
    ctx.save();
    
    const now = Date.now();
    const slashProgress = Math.min(1, (now - katanaSlashStartTime) / katanaSlashDuration);
    
    // Quick strike animation - small angle sweep for quick, sharp movement
    // Arrow points towards DOT (no flip needed)
    const angleRange = Math.PI / 12; // Small range: 15 degrees (quick strike, not clock rotation)
    const startAngle = katanaAngle - angleRange; // Start angle (arrow towards DOT)
    const endAngle = katanaAngle + angleRange; // End angle (arrow towards DOT)
    
    // Use easing for quick strike effect (fast start, slow end for impact feel)
    const easedProgress = slashProgress < 0.5 
      ? 2 * slashProgress * slashProgress // Fast acceleration
      : 1 - 2 * (1 - slashProgress) * (1 - slashProgress); // Slow deceleration
    const currentAngle = startAngle + (endAngle - startAngle) * easedProgress;
    
    // Static position (use saved position for slash)
    const slashX = katanaX;
    const slashY = katanaY;
    const slashAlpha = 1 - slashProgress * 0.5; // Fade out faster for quick strike
    
    // Draw arrow at impact position
    ctx.translate(slashX, slashY);
    ctx.rotate(currentAngle);
    
    // Arrow shaft (brown wooden) - main body
    const shaftLength = arrowLength - arrowHeadLength - arrowFletchingLength;
    const shaftStartX = arrowFletchingLength;
    ctx.fillStyle = `rgba(101, 67, 33, ${slashAlpha})`; // Brown wood color
    ctx.fillRect(shaftStartX, -arrowShaftWidth / 2, shaftLength, arrowShaftWidth);
    
    // New arrowhead design - elegant, sharp, multi-layered (pointing forward)
    const headStartX = arrowLength - arrowHeadLength;
    
    // Base arrowhead layer (dark metal) - triangle pointing forward
    ctx.fillStyle = `rgba(80, 80, 90, ${slashAlpha})`; // Dark steel
    ctx.beginPath();
    ctx.moveTo(headStartX, -arrowShaftWidth * 2.5); // Top of base (left point)
    ctx.lineTo(arrowLength, 0); // Sharp tip (forward, center)
    ctx.lineTo(headStartX, arrowShaftWidth * 2.5); // Bottom of base (right point)
    ctx.closePath();
    ctx.fill();
    
    // Middle layer (medium metal) - smaller triangle inside
    ctx.fillStyle = `rgba(120, 120, 130, ${slashAlpha})`; // Medium steel
    ctx.beginPath();
    ctx.moveTo(headStartX + arrowHeadLength * 0.3, -arrowShaftWidth * 1.8); // Top
    ctx.lineTo(arrowLength, 0); // Sharp tip
    ctx.lineTo(headStartX + arrowHeadLength * 0.3, arrowShaftWidth * 1.8); // Bottom
    ctx.closePath();
    ctx.fill();
    
    // Top highlight layer (bright metal edge) - left edge
    ctx.fillStyle = `rgba(200, 200, 210, ${slashAlpha})`; // Bright steel highlight
    ctx.beginPath();
    ctx.moveTo(headStartX + arrowHeadLength * 0.5, -arrowShaftWidth / 2); // Top
    ctx.lineTo(arrowLength - arrowHeadLength * 0.1, -arrowShaftWidth * 1.2); // Middle
    ctx.lineTo(arrowLength, 0); // Sharp tip
    ctx.closePath();
    ctx.fill();
    
    // Top highlight layer (bright metal edge) - right edge
    ctx.beginPath();
    ctx.moveTo(headStartX + arrowHeadLength * 0.5, arrowShaftWidth / 2); // Bottom
    ctx.lineTo(arrowLength - arrowHeadLength * 0.1, arrowShaftWidth * 1.2); // Middle
    ctx.lineTo(arrowLength, 0); // Sharp tip
    ctx.closePath();
    ctx.fill();
    
    // Extra sharp tip accent (white/silver)
    ctx.fillStyle = `rgba(255, 255, 255, ${slashAlpha * 0.9})`; // White tip
    ctx.beginPath();
    ctx.moveTo(arrowLength - 2, -arrowShaftWidth * 0.8); // Top
    ctx.lineTo(arrowLength, 0); // Sharp tip
    ctx.lineTo(arrowLength - 2, arrowShaftWidth * 0.8); // Bottom
    ctx.closePath();
    ctx.fill();
    
    // Fletching (feathers at back) - colorful feathers
    ctx.fillStyle = `rgba(180, 40, 40, ${slashAlpha})`; // Red feather
    ctx.fillRect(0, -arrowShaftWidth * 2.5, 5, arrowShaftWidth * 1.5);
    ctx.fillRect(0, arrowShaftWidth, 5, arrowShaftWidth * 1.5);
    
    ctx.fillStyle = `rgba(40, 40, 180, ${slashAlpha})`; // Blue feather
    ctx.fillRect(5, -arrowShaftWidth * 2.5, 5, arrowShaftWidth * 1.5);
    ctx.fillRect(5, arrowShaftWidth, 5, arrowShaftWidth * 1.5);
    
    ctx.fillStyle = `rgba(180, 40, 40, ${slashAlpha})`; // Red feather
    ctx.fillRect(10, -arrowShaftWidth * 2.5, 5, arrowShaftWidth * 1.5);
    ctx.fillRect(10, arrowShaftWidth, 5, arrowShaftWidth * 1.5);
    
    ctx.restore();
    
    // Hit zone indicator removed - not visible to user (invisible for collision detection only)
  }

  // Click smudges (pixel art smears)
  for (const smudge of clickSmudges) {
    const alpha = smudge.life / smudge.maxLife;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.6})`; // Slightly transparent
    // Draw small pixel art smudge (3x3 pixels)
    const pixelSize = 3;
    ctx.fillRect(
      Math.floor(smudge.x - pixelSize / 2),
      Math.floor(smudge.y - pixelSize / 2),
      pixelSize,
      pixelSize
    );
  }
  
  // DOT decay particles
  for (const particle of dotDecayParticles) {
    const alpha = particle.life / particle.maxLife;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    const s = particle.size ?? 2;
    ctx.fillRect(particle.x, particle.y, s, s);
  }

  // Damage numbers
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const dmgNum = damageNumbers[i];
    
    // Update position
    dmgNum.x += dmgNum.vx;
    dmgNum.y += dmgNum.vy;
    dmgNum.vy += 0.1; // Gravity
    
    // Update life
    dmgNum.life--;
    
    // Render damage number
    const alpha = dmgNum.life / dmgNum.maxLife;
    
    // Different colors for crit hits and misses
    if (dmgNum.isCrit) {
      // Draw pixel art lightning bolt for crit - top right corner
      const lightningX = dmgNum.x + 18;
      const lightningY = dmgNum.y - 23;
      
      // Lightning bolt - pixel art style (flipped, top right)
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.fillRect(lightningX, lightningY, 2, 2);
      ctx.fillRect(lightningX - 2, lightningY + 2, 2, 2);
      ctx.fillRect(lightningX - 4, lightningY + 4, 2, 2);
      ctx.fillRect(lightningX - 2, lightningY + 6, 2, 2);
      ctx.fillRect(lightningX - 4, lightningY + 8, 2, 2);
      ctx.fillRect(lightningX - 6, lightningY + 10, 2, 2);
      
      // Crit damage number - black
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.font = `bold ${14 + (1 - alpha) * 8}px "Press Start 2P"`; // Bigger font
    } else if (dmgNum.isMiss) {
      // Miss text - gray, smaller size
      ctx.fillStyle = `rgba(128, 128, 128, ${alpha})`;
      ctx.font = `bold ${8 + (1 - alpha) * 4}px "Press Start 2P"`; // Smaller than damage numbers
    } else if (typeof dmgNum.value === 'string' && dmgNum.value.startsWith('+')) {
      // Green for armor regeneration (+1)
      ctx.fillStyle = `rgba(0, 255, 0, ${alpha})`; // Green for armor regen
      ctx.font = `bold ${12 + (1 - alpha) * 6}px "Press Start 2P"`;
    } else {
      ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`; // Red for normal damage
      ctx.font = `bold ${12 + (1 - alpha) * 6}px "Press Start 2P"`;
    }
    
    ctx.textAlign = 'center';
    ctx.fillText(`${dmgNum.value}`, dmgNum.x, dmgNum.y);
    
    // Remove dead damage numbers
    if (dmgNum.life <= 0) {
      damageNumbers.splice(i, 1);
    }
  }

  // Upgrade animation - pixel art particles
  if (upgradeAnimation) {
    const buttonX = 20;
    let buttonY = 160; // Default for dmg (moved down)
    if (upgradeType === 'crit') buttonY = 220;
    else if (upgradeType === 'accuracy') buttonY = 280;
    const buttonWidth = 200;
    const buttonHeight = 40;
    
    // Draw pixelated progress bar inside button
    // If failed, show reverse animation (progress going back)
    let actualProgress;
    if (!upgradeWillSucceed && upgradeProgress >= upgradeFailAt) {
      // Failed - show reverse animation (2x faster)
      const reverseProgress = Math.max(0, 1 - (upgradeProgress - upgradeFailAt) * 4);
      actualProgress = upgradeFailAt * reverseProgress;
    } else {
      // Normal progress
      actualProgress = Math.min(upgradeProgress, upgradeFailAt);
    }
    const progressWidth = buttonWidth * actualProgress;
    
    // Draw progress in 8px chunks for cleaner pixel art effect
    const chunkSize = 8;
    for (let x = 0; x < progressWidth; x += chunkSize) {
      const chunkWidth = Math.min(chunkSize, progressWidth - x);
      ctx.fillStyle = '#000000';
      ctx.fillRect(buttonX + x, buttonY, chunkWidth, buttonHeight);
    }
    
    // Add pixel art "loading" pattern inside progress - smaller, more subtle
    ctx.fillStyle = '#000000';
    for (let x = 4; x < progressWidth - 4; x += 8) {
      for (let y = 4; y < buttonHeight - 4; y += 8) {
        if ((x + y) % 16 === 0) {
          ctx.fillRect(buttonX + x, buttonY + y, 2, 2); // Smaller squares
        }
      }
    }
    
    // Add jagged edge effect at progress end
    const edgeX = Math.floor(progressWidth / chunkSize) * chunkSize;
    ctx.fillStyle = '#000000';
    for (let y = 0; y < buttonHeight; y += 4) {
      const offset = (y % 8 === 0) ? 2 : 0;
      ctx.fillRect(buttonX + edgeX + offset, buttonY + y, 2, 2);
    }
    
    // Add pixel art border to progress bar
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(buttonX, buttonY, progressWidth, buttonHeight);
    
    // Draw particles
    ctx.fillStyle = '#000000';
    for (const particle of upgradeParticles) {
      const alpha = particle.life / particle.maxLife;
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      // Make particles more pixelated
      const pixelX = Math.floor(particle.x);
      const pixelY = Math.floor(particle.y);
      ctx.fillRect(pixelX, pixelY, 3, 3);
    }
  }
  
  // Upgrade message - centered with main info in black pixel art style
  if (upgradeMessageTimer > 0) {
    ctx.fillStyle = '#000000'; // Black pixel art style
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.textAlign = 'center';
    // Center the message with the stats frame (statsX + statsWidth/2)
    ctx.fillText(upgradeMessage, upgradeMessageX + 100, upgradeMessageY);
    upgradeMessageTimer -= 16; // Assuming 60 FPS
  }

  // PvP/Training mode: Lobby screen or Arena
  if (gameMode === 'PvP' || gameMode === 'Training') {
    // Show lobby screen if searching for match (only for PvP Online, not Training)
    if (gameMode === 'PvP' && isInLobby && !currentMatch) {
      // Lobby screen - searching for opponent
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(240, 0, canvas.width - 240, canvas.height);
      
      // Lobby text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const searchTime = Math.floor((Date.now() - lobbySearchStartTime) / 1000);
      ctx.fillText('SEARCHING FOR OPPONENT...', canvas.width / 2, canvas.height / 2 - 50);
      ctx.fillText(`${searchTime}s`, canvas.width / 2, canvas.height / 2);
      
      // Animated dots
      const dotCount = (Math.floor(Date.now() / 500) % 4);
      let dots = '';
      for (let i = 0; i < dotCount; i++) {
        dots += '.';
      }
      ctx.fillText(dots, canvas.width / 2, canvas.height / 2 + 30);
      
      // Cancel button
      const cancelButtonX = canvas.width / 2 - 100;
      const cancelButtonY = canvas.height / 2 + 80;
      const cancelButtonWidth = 200;
      const cancelButtonHeight = 40;
      
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(cancelButtonX, cancelButtonY, cancelButtonWidth, cancelButtonHeight);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(cancelButtonX, cancelButtonY, cancelButtonWidth, cancelButtonHeight);
      
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px "Press Start 2P"';
      ctx.fillText('CANCEL', canvas.width / 2, cancelButtonY + cancelButtonHeight / 2);
      
      return; // Don't render arena if in lobby
    }
    
    // PvP Online: Show Ready screen if match found but waiting for both players to be ready
    // REMOVED: Polling causes lag - rely only on real-time subscriptions from subscribeToMatchUpdates
    if (gameMode === 'PvP' && currentMatch && waitingForOpponentReady) {
      // Ready screen
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(240, 0, canvas.width - 240, canvas.height);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.fillText('OPPONENT FOUND!', canvas.width / 2, canvas.height / 2 - 100);
      
      // Show ready status
      const walletState = walletService.getState();
      if (!walletState.address) {
        console.error('Wallet not connected in Ready screen!');
        return;
      }
      
      const isPlayer1 = currentMatch.p1 === walletState.address;
      // Handle null/undefined ready states
      const myReady = isPlayer1 
        ? (currentMatch.p1Ready === true) 
        : (currentMatch.p2Ready === true);
      const opponentReady = isPlayer1 
        ? (currentMatch.p2Ready === true) 
        : (currentMatch.p1Ready === true);
      
      // Removed console.log to reduce lag - only log if there's an issue
      
      // Debug info (remove in production)
      ctx.font = 'bold 8px "Press Start 2P"';
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'left';
      ctx.fillText(`Match ID: ${currentMatch.id.substring(0, 8)}...`, 250, 30);
      ctx.fillText(`P1: ${currentMatch.p1Ready === true ? 'READY' : 'NOT READY'}`, 250, 50);
      ctx.fillText(`P2: ${currentMatch.p2Ready === true ? 'READY' : 'NOT READY'}`, 250, 70);
      ctx.fillText(`State: ${currentMatch.state}`, 250, 90);
      ctx.fillText(`My Ready: ${isReady}`, 250, 110);
      ctx.textAlign = 'center';
      
      ctx.font = 'bold 16px "Press Start 2P"';
      ctx.fillStyle = myReady ? '#00ff00' : '#ff0000';
      ctx.fillText(`YOU: ${myReady ? 'READY' : 'NOT READY'}`, canvas.width / 2, canvas.height / 2 - 40);
      
      ctx.fillStyle = opponentReady ? '#00ff00' : '#ff0000';
      ctx.fillText(`OPPONENT: ${opponentReady ? 'READY' : 'WAITING...'}`, canvas.width / 2, canvas.height / 2);
      
      // Ready button (if not ready yet)
      if (!isReady) {
        // Calculate button position relative to play area (not full canvas)
        const playAreaX = 240; // Play area starts at x=240
        const playAreaWidth = canvas.width - playAreaX;
        const readyButtonX = playAreaX + playAreaWidth / 2 - 100;
        const readyButtonY = canvas.height / 2 + 60;
        const readyButtonWidth = 200;
        const readyButtonHeight = 50;
        
        // Button shadow (dark gray) - only if not pressed
        if (!isPressingReady) {
          ctx.fillStyle = '#404040';
          ctx.fillRect(readyButtonX + 2, readyButtonY + 2, readyButtonWidth, readyButtonHeight);
        }
        
        // Button main
        if (isPressingReady) {
          ctx.fillStyle = '#909090';
        } else if (isHoveringReady) {
          ctx.fillStyle = '#b0ffb0'; // Lighter green on hover
        } else {
          ctx.fillStyle = '#00ff00'; // Green
        }
        ctx.fillRect(readyButtonX, readyButtonY, readyButtonWidth, readyButtonHeight);
        
        // Button highlight (white) - only if not pressed
        if (!isPressingReady) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(readyButtonX, readyButtonY, readyButtonWidth, 2);
          ctx.fillRect(readyButtonX, readyButtonY, 2, readyButtonHeight);
        }
        
        // Button shadow (dark gray)
        ctx.fillStyle = '#808080';
        ctx.fillRect(readyButtonX + readyButtonWidth - 2, readyButtonY, 2, readyButtonHeight);
        ctx.fillRect(readyButtonX, readyButtonY + readyButtonHeight - 2, readyButtonWidth, 2);
        
        // Button border (black)
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(readyButtonX, readyButtonY, readyButtonWidth, readyButtonHeight);
        
        // Button text
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 16px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('READY', readyButtonX + readyButtonWidth / 2, readyButtonY + readyButtonHeight / 2);
      } else {
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 14px "Press Start 2P"';
        ctx.fillText('Waiting for opponent...', canvas.width / 2, canvas.height / 2 + 60);
      }
      
      // Cancel button
      const playAreaX = 240; // Play area starts at x=240
      const playAreaWidth = canvas.width - playAreaX;
      const cancelButtonX = playAreaX + playAreaWidth / 2 - 100;
      const cancelButtonY = canvas.height / 2 + 130;
      const cancelButtonWidth = 200;
      const cancelButtonHeight = 40;
      
      // Button shadow (dark gray) - only if not pressed
      if (!isPressingCancel) {
        ctx.fillStyle = '#404040';
        ctx.fillRect(cancelButtonX + 2, cancelButtonY + 2, cancelButtonWidth, cancelButtonHeight);
      }
      
      // Button main
      if (isPressingCancel) {
        ctx.fillStyle = '#909090';
      } else if (isHoveringCancel) {
        ctx.fillStyle = '#b0b0b0';
      } else {
        ctx.fillStyle = '#c0c0c0';
      }
      ctx.fillRect(cancelButtonX, cancelButtonY, cancelButtonWidth, cancelButtonHeight);
      
      // Button highlight (white) - only if not pressed
      if (!isPressingCancel) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cancelButtonX, cancelButtonY, cancelButtonWidth, 2);
        ctx.fillRect(cancelButtonX, cancelButtonY, 2, cancelButtonHeight);
      }
      
      // Button shadow (dark gray)
      ctx.fillStyle = '#808080';
      ctx.fillRect(cancelButtonX + cancelButtonWidth - 2, cancelButtonY, 2, cancelButtonHeight);
      ctx.fillRect(cancelButtonX, cancelButtonY + cancelButtonHeight - 2, cancelButtonWidth, 2);
      
      // Button border (black)
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(cancelButtonX, cancelButtonY, cancelButtonWidth, cancelButtonHeight);
      
      // Button text
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CANCEL', cancelButtonX + cancelButtonWidth / 2, cancelButtonY + cancelButtonHeight / 2);
      
      return; // Don't render arena if waiting for ready
    }
    
    // PvP Online: If in PvP mode but not in lobby and no match/players, show error
    if (gameMode === 'PvP' && !isInLobby && !currentMatch && (!myPlayerId || !pvpPlayers[myPlayerId])) {
      // Show error message
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(240, 0, canvas.width - 240, canvas.height);
      
      ctx.fillStyle = '#ff0000';
      ctx.font = 'bold 24px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FAILED TO ENTER LOBBY', canvas.width / 2, canvas.height / 2 - 50);
      
      if (walletError) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px "Press Start 2P"';
        ctx.fillText(walletError, canvas.width / 2, canvas.height / 2);
      }
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px "Press Start 2P"';
      ctx.fillText('Click PvP Online button to retry', canvas.width / 2, canvas.height / 2 + 50);
      
      return; // Don't render arena if error
    }
    
    // Draw arena bounds (visual indicator) - but skip dotted line where platforms are located
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]); // Dashed line
    
    // Calculate platform edges
    const halfW = movingPlatformWidth / 2;
    const halfSideW = pvpPlatformSideWidth / 2;
    const leftPlatformLeftEdge = pvpPlatformLeftX - halfSideW;
    const leftPlatformRightEdge = pvpPlatformLeftX + halfSideW;
    const centerPlatformLeftEdge = pvpPlatformCenterX - halfW;
    const centerPlatformRightEdge = pvpPlatformCenterX + halfW;
    const rightPlatformLeftEdge = pvpPlatformRightX - halfSideW;
    const rightPlatformRightEdge = pvpPlatformRightX + halfSideW;
    const platformY = movingPlatformY; // Platform Y position
    const platformBottomY = platformY + movingPlatformThickness; // Platform bottom Y position
    
    // Draw top line segments only over platforms (not in empty spaces)
    // Left platform segment: over left platform only
    ctx.beginPath();
    ctx.moveTo(leftPlatformLeftEdge, pvpBounds.top);
    ctx.lineTo(leftPlatformRightEdge, pvpBounds.top);
    ctx.stroke();
    
    // Center platform segment: over center platform only
    ctx.beginPath();
    ctx.moveTo(centerPlatformLeftEdge, pvpBounds.top);
    ctx.lineTo(centerPlatformRightEdge, pvpBounds.top);
    ctx.stroke();
    
    // Right platform segment: over right platform only
    ctx.beginPath();
    ctx.moveTo(rightPlatformLeftEdge, pvpBounds.top);
    ctx.lineTo(rightPlatformRightEdge, pvpBounds.top);
    ctx.stroke();
    
    // Draw bottom line segments only over platforms (not in empty spaces)
    // Left platform segment: over left platform only
    ctx.beginPath();
    ctx.moveTo(leftPlatformLeftEdge, pvpBounds.bottom);
    ctx.lineTo(leftPlatformRightEdge, pvpBounds.bottom);
    ctx.stroke();
    
    // Center platform segment: over center platform only
    ctx.beginPath();
    ctx.moveTo(centerPlatformLeftEdge, pvpBounds.bottom);
    ctx.lineTo(centerPlatformRightEdge, pvpBounds.bottom);
    ctx.stroke();
    
    // Right platform segment: over right platform only
    ctx.beginPath();
    ctx.moveTo(rightPlatformLeftEdge, pvpBounds.bottom);
    ctx.lineTo(rightPlatformRightEdge, pvpBounds.bottom);
    ctx.stroke();
    
    // Draw left side segments only over left platform (not in empty spaces)
    // Left platform vertical segment: over left platform only
    ctx.beginPath();
    ctx.moveTo(pvpBounds.left, platformY);
    ctx.lineTo(pvpBounds.left, platformBottomY);
    ctx.stroke();
    
    // Draw right side segments only over right platform (not in empty spaces)
    // Right platform vertical segment: over right platform only
    ctx.beginPath();
    ctx.moveTo(pvpBounds.right, platformY);
    ctx.lineTo(pvpBounds.right, platformBottomY);
    ctx.stroke();
    
    ctx.setLineDash([]); // Reset line dash
    
    // Draw side walls from platform to bottom floor (prevent players from going through UI panel)
    // Use existing bottomFloorY from render function scope (declared above)
    const wallTopY = movingPlatformY; // Start from platform level
    const wallBottomY = bottomFloorY; // End at bottom floor (bottomFloorY already declared above)
    
    // Left wall (prevents going through UI panel)
    ctx.fillStyle = '#000000';
    ctx.fillRect(playLeft - 5, wallTopY, 5, wallBottomY - wallTopY);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(playLeft - 5, wallTopY, 5, wallBottomY - wallTopY);
    
    // Right wall
    ctx.fillStyle = '#000000';
    ctx.fillRect(playRight, wallTopY, 5, wallBottomY - wallTopY);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(playRight, wallTopY, 5, wallBottomY - wallTopY);
    
    // Draw wall spikes (PvP mode only)
    if (gameMode === 'PvP' || gameMode === 'Training') {
      for (const spike of wallSpikes) {
        // Only draw spikes that are extending or extended
        if (spike.state === 'retracted' || spike.state === 'retracting') continue;
        
        const spikeCurrentLength = spike.length * spike.progress;
        if (spikeCurrentLength <= 0) continue;
        
        const spikeX = spike.side === 'left' ? playLeft : playRight;
        const spikeTopY = spike.y - spike.width / 2;
        const spikeBottomY = spike.y + spike.width / 2;
        
        // Draw spike (triangle pointing inward)
        ctx.save();
        ctx.fillStyle = '#8B0000'; // Dark red
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        if (spike.side === 'left') {
          // Left spike pointing right
          ctx.moveTo(spikeX, spikeTopY);
          ctx.lineTo(spikeX + spikeCurrentLength, spike.y);
          ctx.lineTo(spikeX, spikeBottomY);
          ctx.closePath();
        } else {
          // Right spike pointing left
          ctx.moveTo(spikeX, spikeTopY);
          ctx.lineTo(spikeX - spikeCurrentLength, spike.y);
          ctx.lineTo(spikeX, spikeBottomY);
          ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    
    // Draw death animations (pixel art particles) - draw before players so they appear behind
    for (const [playerId, particles] of deathAnimations.entries()) {
      for (const particle of particles) {
        const lifeRatio = particle.life / particle.maxLife;
        const alpha = lifeRatio; // Fade out as life decreases
        
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        
        // Draw pixel art square piece - make sure it's visible
        ctx.fillStyle = particle.color;
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
        
        // Draw outline for pixel art look
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1; // Increased line width for better visibility
        ctx.strokeRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
        
        ctx.restore();
      }
    }
    
    // Draw all players
    for (const playerId in pvpPlayers) {
      const player = pvpPlayers[playerId];
      
      // Skip drawing player if death animation is playing
      if (deathAnimations.has(playerId)) {
        continue; // Don't draw player during death animation
      }
      
      // Draw fading shadow tail (behind the player) - same as Solo
      {
        ctx.save();
        for (const seg of player.speedTrail) {
          const alpha = (seg.life / seg.maxLife) * 0.25; // subtle shadow
          const radius = (seg.size ?? (player.radius * 1.2)) * (seg.life / seg.maxLife);
          ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
          ctx.beginPath();
          ctx.arc(seg.x, seg.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      
      // Draw player DOT
      // CRITICAL: Ensure correct color based on player ID
      // Both players are black
      let dotColor: string;
      if (playerId === myPlayerId) {
        dotColor = '#000000'; // Black for my player
      } else if (playerId === opponentId && opponentId) {
        dotColor = '#000000'; // Black for opponent
      } else {
        // Fallback to player's stored color (should not happen)
        dotColor = player.color;
        console.warn('Unknown player ID in render', { playerId, myPlayerId, opponentId, allPlayers: Object.keys(pvpPlayers) });
      }
      
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw player outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw magnetic wave animation when paralyzed
      if (player.paralyzedUntil > Date.now()) {
        const time = Date.now() * 0.003; // Slow animation
        const waveRadius = player.radius + 8 + Math.sin(time * 2) * 3; // Gentle wave
        const waveCount = 3; // Number of wave rings
        
        for (let i = 0; i < waveCount; i++) {
          const offset = i * 0.5;
          const alpha = 0.3 - (i * 0.1); // Fade out
          const radius = waveRadius + i * 4 + Math.sin(time * 2 + offset) * 2;
          
          ctx.strokeStyle = `rgba(100, 100, 120, ${alpha})`; // Gray-blue magnetic color
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        
        // Draw small black dot in center (paralyzed indicator)
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(player.x, player.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Supersonic animation when speed >= 7 (same as Solo)
      // OPTIMIZED: Use squared speed for comparison to avoid Math.sqrt
      {
        const speedSquared = player.vx * player.vx + player.vy * player.vy;
        if (speedSquared >= 49) { // 7^2 = 49
          const speed = Math.sqrt(speedSquared); // Only calculate sqrt when needed
          const t = Date.now() * 0.004;
          // Pulsing white ring around the player
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          const ringRadius = player.radius + 3 + Math.sin(t) * 1.5;
          ctx.beginPath();
          ctx.arc(player.x, player.y, ringRadius, 0, Math.PI * 2);
          ctx.stroke();

          // Motion streaks in direction of velocity
          const angle = Math.atan2(player.vy, player.vx);
          const backAngle = angle + Math.PI;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          for (let i = -2; i <= 2; i++) {
            const offset = i * 3;
            const sx = player.x + Math.cos(backAngle + i * 0.08) * (player.radius + 2);
            const sy = player.y + Math.sin(backAngle + i * 0.08) * (player.radius + 2);
            const ex = sx + Math.cos(backAngle + i * 0.08) * (6 + Math.min(12, speed));
            const ey = sy + Math.sin(backAngle + i * 0.08) * (6 + Math.min(12, speed));
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
          }

          // Small white highlights on the rim
          ctx.fillStyle = '#ffffff';
          for (let i = 0; i < 6; i++) {
            const a = angle + i * (Math.PI / 3) + Math.sin(t + i) * 0.2;
            const hx = player.x + Math.cos(a) * (player.radius + 1);
            const hy = player.y + Math.sin(a) * (player.radius + 1);
            ctx.fillRect(hx - 1, hy - 1, 2, 2);
          }
        }
      }
      
      // Draw player HP and Armor stats - positioned right after DOT balance (top left)
      if (myPlayerId && playerId === myPlayerId) {
        // My player stats - draw in UI panel right after DOT balance
        const statsX = 20;
        const statsY = 65; // Moved 5px down from 60 to 65
        const statsWidth = 200;
        const statsHeight = 60; // Increased height from 50 to 60 for better visibility
        
        // Frame background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(statsX, statsY, statsWidth, statsHeight);
        
        // Frame border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(statsX, statsY, statsWidth, statsHeight);
        
        // HP and Armor text (same format as Solo, no label to save space)
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 12px "Press Start 2P"';
        ctx.textAlign = 'left';
        ctx.fillText(`HP: ${player.hp}/${player.maxHP}`, statsX + 10, statsY + 20);
        ctx.fillText(`ARMOR: ${player.armor}/${player.maxArmor}`, statsX + 10, statsY + 40);
      }
      
      // Weapon info panels - PvP mode only (shows weapon status and cooldowns)
      if ((gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && playerId === myPlayerId) {
        const weaponPanelX = 20;
        const weaponPanelWidth = 200;
        const weaponPanelHeight = 50;
        
        // Arrow weapon panel
        {
          const weaponPanelY = 160;
          const currentTime = Date.now();
          const timeSinceLastShot = currentTime - pvpArrowLastShotTime;
          const remainingCooldown = Math.max(0, pvpArrowCooldown - timeSinceLastShot);
          const isOnCooldown = remainingCooldown > 0;
          const isFlying = pvpKatanaFlying;
          
          // Frame background
          ctx.fillStyle = isFlying ? '#ffff00' : (isOnCooldown ? '#ffcccc' : '#ccffcc'); // Yellow if flying, light red if cooldown, light green if ready
          ctx.fillRect(weaponPanelX, weaponPanelY, weaponPanelWidth, weaponPanelHeight);
          
          // Frame border
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.strokeRect(weaponPanelX, weaponPanelY, weaponPanelWidth, weaponPanelHeight);
          
          // Weapon name
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 10px "Press Start 2P"';
          ctx.textAlign = 'left';
          ctx.fillText('ARROW', weaponPanelX + 10, weaponPanelY + 15);
          
          // Key hint (always black, left side)
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 7px "Press Start 2P"';
          ctx.fillText('Press 1', weaponPanelX + 10, weaponPanelY + 30);
          
          // Status text (right side)
          ctx.textAlign = 'right';
          if (isFlying) {
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText('FLYING', weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
          } else if (isOnCooldown) {
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText(`CD: ${Math.ceil(remainingCooldown / 1000)}s`, weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
          } else {
            ctx.fillStyle = '#00ff00';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText('READY', weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
          }
          ctx.textAlign = 'left'; // Reset alignment
          
          // Cooldown bar
          if (isOnCooldown) {
            const cooldownProgress = remainingCooldown / pvpArrowCooldown;
            const barWidth = (weaponPanelWidth - 20) * (1 - cooldownProgress);
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(weaponPanelX + 10, weaponPanelY + 38, barWidth, 8);
          }
        }
        
        // Projectile weapon panel
        {
          const weaponPanelY = 220;
          const isFlying = projectileFlying;
          const isCharging = projectileCharging;
          const currentTime = Date.now();
          const timeSinceLastShot = currentTime - projectileLastShotTime;
          const remainingCooldown = Math.max(0, projectileCooldown - timeSinceLastShot);
          const isOnCooldown = remainingCooldown > 0;
          
          // Frame background
          ctx.fillStyle = isFlying ? '#ffff00' : (isCharging ? '#ffcc00' : (isOnCooldown ? '#ffcccc' : '#ccffcc')); // Yellow if flying, orange if charging, light red if cooldown, light green if ready
          ctx.fillRect(weaponPanelX, weaponPanelY, weaponPanelWidth, weaponPanelHeight);
          
          // Frame border
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.strokeRect(weaponPanelX, weaponPanelY, weaponPanelWidth, weaponPanelHeight);
          
          // Weapon name
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 10px "Press Start 2P"';
          ctx.textAlign = 'left';
          ctx.fillText('PROJECTILE', weaponPanelX + 10, weaponPanelY + 15);
          
          // Key hint (always black, left side)
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 7px "Press Start 2P"';
          ctx.fillText('Press 2', weaponPanelX + 10, weaponPanelY + 30);
          
          // Status text (right side)
          ctx.textAlign = 'right';
          if (isFlying) {
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText('FLYING', weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
          } else if (isCharging) {
            const chargeTime = Date.now() - projectileChargeStartTime;
            const chargeProgress = Math.min(1, chargeTime / projectileMaxCharge);
            ctx.fillStyle = '#ff8800';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText(`CHARGING ${Math.round(chargeProgress * 100)}%`, weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
            
            // Charge bar
            const barWidth = (weaponPanelWidth - 20) * chargeProgress;
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(weaponPanelX + 10, weaponPanelY + 38, barWidth, 8);
          } else if (isOnCooldown) {
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText(`CD: ${Math.ceil(remainingCooldown / 1000)}s`, weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
            
            // Cooldown bar
            const cooldownProgress = remainingCooldown / projectileCooldown;
            const barWidth = (weaponPanelWidth - 20) * (1 - cooldownProgress);
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(weaponPanelX + 10, weaponPanelY + 38, barWidth, 8);
          } else {
            ctx.fillStyle = '#00ff00';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText('READY', weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
          }
          ctx.textAlign = 'left'; // Reset alignment
        }
        
        // Bullet weapon panel
        {
          const weaponPanelY = 280;
          const currentTime = Date.now();
          const timeSinceLastShot = currentTime - bulletLastShotTime;
          const remainingCooldown = Math.max(0, bulletCooldown - timeSinceLastShot);
          const isOnCooldown = remainingCooldown > 0;
          const isFlying = bulletFlying;
          
          // Frame background
          ctx.fillStyle = isFlying ? '#ffff00' : (isOnCooldown ? '#ffcccc' : '#ccffcc'); // Yellow if flying, light red if cooldown, light green if ready
          ctx.fillRect(weaponPanelX, weaponPanelY, weaponPanelWidth, weaponPanelHeight);
          
          // Frame border
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.strokeRect(weaponPanelX, weaponPanelY, weaponPanelWidth, weaponPanelHeight);
          
          // Weapon name
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 10px "Press Start 2P"';
          ctx.textAlign = 'left';
          ctx.fillText('BULLET', weaponPanelX + 10, weaponPanelY + 15);
          
          // Key hint (always black, left side)
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 7px "Press Start 2P"';
          ctx.fillText('Press 3', weaponPanelX + 10, weaponPanelY + 30);
          
          // Status text (right side)
          ctx.textAlign = 'right';
          if (isFlying) {
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText('FLYING', weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
          } else if (isOnCooldown) {
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText(`CD: ${Math.ceil(remainingCooldown / 1000)}s`, weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
          } else {
            ctx.fillStyle = '#00ff00';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText('READY', weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
          }
          ctx.textAlign = 'left'; // Reset alignment
          
          // Cooldown bar
          if (isOnCooldown) {
            const cooldownProgress = remainingCooldown / bulletCooldown;
            const barWidth = (weaponPanelWidth - 20) * (1 - cooldownProgress);
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(weaponPanelX + 10, weaponPanelY + 38, barWidth, 8);
          }
        }
        
        // Drawing/Line skill panel
        {
          const weaponPanelY = 340;
          const currentTime = Date.now();
          const timeSinceLastDraw = currentTime - lastDrawEndTime;
          const remainingCooldown = Math.max(0, drawCooldown - timeSinceLastDraw);
          const isOnCooldown = remainingCooldown > 0;
          const isActive = isDrawing;
          
          // Frame background
          ctx.fillStyle = isActive ? '#ffff00' : (isOnCooldown ? '#ffcccc' : '#ccffcc'); // Yellow if drawing, light red if cooldown, light green if ready
          ctx.fillRect(weaponPanelX, weaponPanelY, weaponPanelWidth, weaponPanelHeight);
          
          // Frame border
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.strokeRect(weaponPanelX, weaponPanelY, weaponPanelWidth, weaponPanelHeight);
          
          // Skill name
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 10px "Press Start 2P"';
          ctx.textAlign = 'left';
          ctx.fillText('DRAW LINE', weaponPanelX + 10, weaponPanelY + 15);
          
          // Key hint (always black, left side)
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 7px "Press Start 2P"';
          ctx.fillText('RMB', weaponPanelX + 10, weaponPanelY + 30);
          
          // Status text (right side)
          ctx.textAlign = 'right';
          if (isActive) {
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText('DRAWING...', weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
          } else if (isOnCooldown) {
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText(`CD: ${Math.ceil(remainingCooldown / 1000)}s`, weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
            
            // Cooldown bar
            const cooldownProgress = remainingCooldown / drawCooldown;
            const barWidth = (weaponPanelWidth - 20) * (1 - cooldownProgress);
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(weaponPanelX + 10, weaponPanelY + 38, barWidth, 8);
          } else {
            ctx.fillStyle = '#00ff00';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText('READY', weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
          }
          ctx.textAlign = 'left'; // Reset alignment
        }
      }
      
      // Draw Armor and HP bars above player head (combined bar - always same height)
      {
        const barWidth = player.radius * 2 - 6; // Shorter bar width (6px shorter total)
        const barHeight = 4; // Thinner bar height - always same height
        const barX = player.x - barWidth / 2;
        const barY = player.y - player.radius - 8; // Bar position
        
        // Draw "You" text above HP bar (only for my player)
        if (myPlayerId && playerId === myPlayerId) {
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 8px "Press Start 2P"';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('You', player.x, barY - 3);
        }
        
        // Calculate percentages
        const armorPercentage = Math.max(0, Math.min(1, player.armor / player.maxArmor));
        const hpPercentage = Math.max(0, Math.min(1, player.hp / player.maxHP));
        
        // Draw bar background (thin black outline) - always same height
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1; // Thin outline
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        // Draw HP bar (green/yellow/red) first - always draw it, but armor will cover it
        if (player.maxArmor > 0) {
          // Show HP bar when armor exists (armor will cover it)
          if (hpPercentage > 0.6) {
            ctx.fillStyle = '#00ff00'; // Green when HP > 60%
          } else if (hpPercentage > 0.3) {
            ctx.fillStyle = '#ffff00'; // Yellow when HP 30-60%
          } else {
            ctx.fillStyle = '#ff0000'; // Red when HP < 30%
          }
          
          const fillWidth = barWidth * hpPercentage;
          if (fillWidth > 0) {
            ctx.fillRect(barX + 0.5, barY + 0.5, fillWidth - 1, barHeight - 1);
          }
        } else {
          // If no armor, show HP bar only
          if (hpPercentage > 0.6) {
            ctx.fillStyle = '#00ff00'; // Green when HP > 60%
          } else if (hpPercentage > 0.3) {
            ctx.fillStyle = '#ffff00'; // Yellow when HP 30-60%
          } else {
            ctx.fillStyle = '#ff0000'; // Red when HP < 30%
          }
          
          const fillWidth = barWidth * hpPercentage;
          if (fillWidth > 0) {
            ctx.fillRect(barX + 0.5, barY + 0.5, fillWidth - 1, barHeight - 1);
          }
        }
        
        // Draw Armor bar (blue) on top - always visible if armor exists, covers HP bar
        if (player.maxArmor > 0 && armorPercentage > 0) {
          ctx.fillStyle = '#0000ff'; // Blue for armor
          const armorFillWidth = barWidth * armorPercentage;
          if (armorFillWidth > 0) {
            ctx.fillRect(barX + 0.5, barY + 0.5, armorFillWidth - 1, barHeight - 1); // Covers HP
          }
        }
      }
    }
    
    // PvP mode: Draw projectile trajectory (dotted line) when charging
    if (projectileCharging && myPlayerId && pvpPlayers[myPlayerId]) {
      const myPlayer = pvpPlayers[myPlayerId];
      
      // Always use current player position (not the initial charging position)
      const currentStartX = myPlayer.x;
      const currentStartY = myPlayer.y;
      
      // Calculate direction to mouse position (player controls trajectory with mouse)
      const dx = globalMouseX - currentStartX;
      const dy = globalMouseY - currentStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0) {
        const chargeTime = Date.now() - projectileChargeStartTime;
        const chargeRatio = Math.min(chargeTime / projectileMaxCharge, 1.0);
        const speed = projectileBaseSpeed * (0.5 + chargeRatio * 1.5) * 1.15; // 15% stronger flight speed
        
        const vx = (dx / distance) * speed;
        const vy = (dy / distance) * speed;
        
        // Simulate trajectory (parabolic path with gravity)
        ctx.strokeStyle = '#cccccc'; // Lighter gray color (more visible)
        ctx.lineWidth = 3; // Thicker line (more visible)
        ctx.setLineDash([8, 4]); // Longer dashes (more visible)
        ctx.beginPath();
        
        let trajX = currentStartX;
        let trajY = currentStartY;
        let trajVx = vx;
        let trajVy = vy;
        
        ctx.moveTo(trajX, trajY);
        
        // Draw trajectory for shorter duration (shorter line)
        // Use reduced gravity for trajectory visualization (less curved)
        const trajectoryGravity = projectileGravity * 0.5; // Half gravity for visualization
        for (let i = 0; i < 60; i++) { // 60 frames = 1 second at 60 FPS (shorter trajectory)
          trajX += trajVx;
          trajY += trajVy;
          trajVy += trajectoryGravity; // Apply reduced gravity for visualization
          
          ctx.lineTo(trajX, trajY);
          
          // Stop if out of bounds
          if (trajX < playLeft || trajX > playRight || trajY > pvpBounds.bottom) {
            break;
          }
        }
        
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
      }
    }
    
    // PvP mode: Draw flying bullet (my bullet) - doubled size for heavier look
    if (bulletFlying) {
      ctx.save();
      ctx.translate(bulletX, bulletY);
      
      // Calculate angle from velocity
      const bulletAngle = Math.atan2(bulletVy, bulletVx);
      ctx.rotate(bulletAngle);
      
      // Bullet dimensions - doubled size for heavier look, maintaining form
      const bulletLength = 24; // Length of bullet (doubled from 12)
      const bulletWidth = 4; // Width of bullet (doubled from 2)
      const tipLength = 8; // Pointed tip length (doubled from 4)
      
      // Draw bullet body (gray cylinder) - heavier look
      ctx.fillStyle = '#666666'; // Darker gray for heavier look
      ctx.beginPath();
      ctx.fillRect(-bulletLength / 2, -bulletWidth / 2, bulletLength - tipLength, bulletWidth);
      
      // Draw pointed tip (triangle) - green color for poisoned look
      ctx.fillStyle = '#00ff00'; // Green color for poisoned tip
      ctx.beginPath();
      ctx.moveTo(bulletLength / 2 - tipLength, -bulletWidth / 2);
      ctx.lineTo(bulletLength / 2, 0); // Point at tip
      ctx.lineTo(bulletLength / 2 - tipLength, bulletWidth / 2);
      ctx.closePath();
      ctx.fill();
      
      // Draw darker outline - thicker for heavier look
      ctx.strokeStyle = '#444444'; // Darker outline
      ctx.lineWidth = 1.5; // Thicker outline (doubled from 0.5)
      ctx.strokeRect(-bulletLength / 2, -bulletWidth / 2, bulletLength - tipLength, bulletWidth);
      // Green outline for tip
      ctx.strokeStyle = '#00aa00'; // Darker green for tip outline
      ctx.lineWidth = 1.5; // Thicker outline
      ctx.beginPath();
      ctx.moveTo(bulletLength / 2 - tipLength, -bulletWidth / 2);
      ctx.lineTo(bulletLength / 2, 0);
      ctx.lineTo(bulletLength / 2 - tipLength, bulletWidth / 2);
      ctx.closePath();
      ctx.stroke();
      
      ctx.restore();
    }
    
    // PvP mode: Draw opponent bullet - doubled size for heavier look
    if (opponentBulletFlying && gameMode === 'PvP') {
      ctx.save();
      ctx.translate(opponentBulletX, opponentBulletY);
      
      // Calculate angle from velocity
      const bulletAngle = Math.atan2(opponentBulletVy, opponentBulletVx);
      ctx.rotate(bulletAngle);
      
      // Bullet dimensions - doubled size for heavier look, maintaining form
      const bulletLength = 24; // Length of bullet (doubled from 12)
      const bulletWidth = 4; // Width of bullet (doubled from 2)
      const tipLength = 8; // Pointed tip length (doubled from 4)
      
      // Draw bullet body (gray cylinder) - heavier look
      ctx.fillStyle = '#666666'; // Darker gray for heavier look
      ctx.beginPath();
      ctx.fillRect(-bulletLength / 2, -bulletWidth / 2, bulletLength - tipLength, bulletWidth);
      
      // Draw pointed tip (triangle) - green color for poisoned look
      ctx.fillStyle = '#00ff00'; // Green color for poisoned tip
      ctx.beginPath();
      ctx.moveTo(bulletLength / 2 - tipLength, -bulletWidth / 2);
      ctx.lineTo(bulletLength / 2, 0); // Point at tip
      ctx.lineTo(bulletLength / 2 - tipLength, bulletWidth / 2);
      ctx.closePath();
      ctx.fill();
      
      // Draw darker outline - thicker for heavier look
      ctx.strokeStyle = '#444444'; // Darker outline
      ctx.lineWidth = 1.5; // Thicker outline (doubled from 0.5)
      ctx.strokeRect(-bulletLength / 2, -bulletWidth / 2, bulletLength - tipLength, bulletWidth);
      // Green outline for tip
      ctx.strokeStyle = '#00aa00'; // Darker green for tip outline
      ctx.lineWidth = 1.5; // Thicker outline
      ctx.beginPath();
      ctx.moveTo(bulletLength / 2 - tipLength, -bulletWidth / 2);
      ctx.lineTo(bulletLength / 2, 0);
      ctx.lineTo(bulletLength / 2 - tipLength, bulletWidth / 2);
      ctx.closePath();
      ctx.stroke();
      
      ctx.restore();
    }
    
    // PvP mode: Draw flying projectile (my projectile) - cannonball shape with pointed tip
    if (projectileFlying) {
      ctx.save();
      ctx.translate(projectileX, projectileY);
      
      // Calculate angle from velocity
      const angle = Math.atan2(projectileVy, projectileVx);
      ctx.rotate(angle);
      
      // Draw cannonball shape: short cylinder with pointed tip
      const length = 24; // Short projectile (doubled from 12)
      const width = 12; // Width of projectile (doubled from 6)
      const tipLength = 8; // Pointed tip length (doubled from 4)
      
      ctx.fillStyle = '#8B4513'; // Brown cannonball color
      ctx.beginPath();
      
      // Draw main body (rounded rectangle)
      ctx.fillRect(-length / 2, -width / 2, length - tipLength, width);
      
      // Draw pointed tip (triangle)
      ctx.beginPath();
      ctx.moveTo(length / 2 - tipLength, -width / 2);
      ctx.lineTo(length / 2, 0); // Point at tip
      ctx.lineTo(length / 2 - tipLength, width / 2);
      ctx.closePath();
      ctx.fill();
      
      // Dark outline
      ctx.strokeStyle = '#654321';
      ctx.lineWidth = 3; // Thicker outline (doubled from 1.5)
      ctx.strokeRect(-length / 2, -width / 2, length - tipLength, width);
      ctx.beginPath();
      ctx.moveTo(length / 2 - tipLength, -width / 2);
      ctx.lineTo(length / 2, 0);
      ctx.lineTo(length / 2 - tipLength, width / 2);
      ctx.closePath();
      ctx.stroke();
      
      ctx.restore();
    }
    
    // PvP mode: Draw opponent's flying projectile - cannonball shape with pointed tip
    if (opponentProjectileFlying && gameMode === 'PvP') {
      ctx.save();
      ctx.translate(opponentProjectileX, opponentProjectileY);
      
      // Calculate angle from velocity
      const angle = Math.atan2(opponentProjectileVy, opponentProjectileVx);
      ctx.rotate(angle);
      
      // Draw cannonball shape: short cylinder with pointed tip
      const length = 24; // Short projectile (doubled from 12)
      const width = 12; // Width of projectile (doubled from 6)
      const tipLength = 8; // Pointed tip length (doubled from 4)
      
      ctx.fillStyle = '#CD853F'; // Lighter brown for opponent (different color to distinguish)
      ctx.beginPath();
      
      // Draw main body (rounded rectangle)
      ctx.fillRect(-length / 2, -width / 2, length - tipLength, width);
      
      // Draw pointed tip (triangle)
      ctx.beginPath();
      ctx.moveTo(length / 2 - tipLength, -width / 2);
      ctx.lineTo(length / 2, 0); // Point at tip
      ctx.lineTo(length / 2 - tipLength, width / 2);
      ctx.closePath();
      ctx.fill();
      
      // Dark outline
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 3; // Thicker outline (doubled from 1.5)
      ctx.strokeRect(-length / 2, -width / 2, length - tipLength, width);
      ctx.beginPath();
      ctx.moveTo(length / 2 - tipLength, -width / 2);
      ctx.lineTo(length / 2, 0);
      ctx.lineTo(length / 2 - tipLength, width / 2);
      ctx.closePath();
      ctx.stroke();
      
      ctx.restore();
    }
    
    // PvP mode: Draw arrow (ready or flying) - always near player, follows mouse like trajectory line
    if ((pvpArrowReady && !pvpArrowFired && myPlayerId && pvpPlayers[myPlayerId]) || (pvpKatanaFlying && myPlayerId && pvpPlayers[myPlayerId])) {
      ctx.save();
      
      if (!myPlayerId || !pvpPlayers[myPlayerId]) {
        ctx.restore();
        return;
      }
      const myPlayer = pvpPlayers[myPlayerId];
      // Always use current player position (arrow stays near player, like trajectory line)
      const arrowPosX = pvpKatanaFlying ? pvpKatanaX : myPlayer.x;
      const arrowPosY = pvpKatanaFlying ? pvpKatanaY : myPlayer.y;
      
      // Calculate angle - arrow follows player position but points towards mouse (like Solo mode)
      let currentArrowAngle;
      if (pvpKatanaFlying) {
        // Flying - use stored angle
        currentArrowAngle = pvpKatanaAngle;
      } else {
        // Ready state - point arrow towards mouse (arrow stays at player position, but aims at mouse)
        const dx = globalMouseX - myPlayer.x;
        const dy = globalMouseY - myPlayer.y;
        currentArrowAngle = Math.atan2(dy, dx);
      }
      
      ctx.translate(arrowPosX, arrowPosY);
      ctx.rotate(currentArrowAngle);
      
      // Arrow shaft (brown wooden) - main body
      const shaftLength = arrowLength - arrowHeadLength - arrowFletchingLength;
      const shaftStartX = arrowFletchingLength;
      ctx.fillStyle = 'rgba(101, 67, 33, 1)'; // Brown wood color
      ctx.fillRect(shaftStartX, -arrowShaftWidth / 2, shaftLength, arrowShaftWidth);
      
      // Arrowhead design (same as Solo)
      const headStartX = arrowLength - arrowHeadLength;
      
      // Base arrowhead layer (dark metal)
      ctx.fillStyle = 'rgba(80, 80, 90, 1)'; // Dark steel
      ctx.beginPath();
      ctx.moveTo(headStartX, -arrowShaftWidth * 2.5);
      ctx.lineTo(arrowLength, 0);
      ctx.lineTo(headStartX, arrowShaftWidth * 2.5);
      ctx.closePath();
      ctx.fill();
      
      // Middle layer (medium metal)
      ctx.fillStyle = 'rgba(120, 120, 130, 1)'; // Medium steel
      ctx.beginPath();
      ctx.moveTo(headStartX + arrowHeadLength * 0.3, -arrowShaftWidth * 1.8);
      ctx.lineTo(arrowLength, 0);
      ctx.lineTo(headStartX + arrowHeadLength * 0.3, arrowShaftWidth * 1.8);
      ctx.closePath();
      ctx.fill();
      
      // Top highlight layer (bright metal edge) - left edge
      ctx.fillStyle = 'rgba(200, 200, 210, 1)'; // Bright steel highlight
      ctx.beginPath();
      ctx.moveTo(headStartX + arrowHeadLength * 0.5, -arrowShaftWidth / 2);
      ctx.lineTo(arrowLength - arrowHeadLength * 0.1, -arrowShaftWidth * 1.2);
      ctx.lineTo(arrowLength, 0);
      ctx.closePath();
      ctx.fill();
      
      // Top highlight layer (bright metal edge) - right edge
      ctx.beginPath();
      ctx.moveTo(headStartX + arrowHeadLength * 0.5, arrowShaftWidth / 2);
      ctx.lineTo(arrowLength - arrowHeadLength * 0.1, arrowShaftWidth * 1.2);
      ctx.lineTo(arrowLength, 0);
      ctx.closePath();
      ctx.fill();
      
      // Extra sharp tip accent (white/silver)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; // White tip
      ctx.beginPath();
      ctx.moveTo(arrowLength - arrowHeadLength * 0.2, -arrowShaftWidth * 0.5);
      ctx.lineTo(arrowLength, 0);
      ctx.lineTo(arrowLength - arrowHeadLength * 0.2, arrowShaftWidth * 0.5);
      ctx.closePath();
      ctx.fill();
      
      // Fletching (feathers at back)
      ctx.fillStyle = 'rgba(150, 150, 150, 1)'; // Gray feathers
      ctx.beginPath();
      ctx.moveTo(0, -arrowShaftWidth * 1.5);
      ctx.lineTo(arrowFletchingLength, -arrowShaftWidth * 2);
      ctx.lineTo(arrowFletchingLength, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      
      ctx.beginPath();
      ctx.moveTo(0, arrowShaftWidth * 1.5);
      ctx.lineTo(arrowFletchingLength, arrowShaftWidth * 2);
      ctx.lineTo(arrowFletchingLength, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
    }
    
    // PvP mode: Draw opponent's flying arrow
    if (opponentArrowFlying && gameMode === 'PvP' && opponentId) {
      ctx.save();
      
      ctx.translate(opponentArrowX, opponentArrowY);
      ctx.rotate(opponentArrowAngle);
      
      // Arrow shaft (brown wooden) - main body
      const shaftLength = arrowLength - arrowHeadLength - arrowFletchingLength;
      const shaftStartX = arrowFletchingLength;
      ctx.fillStyle = 'rgba(101, 67, 33, 1)'; // Brown wood color
      ctx.fillRect(shaftStartX, -arrowShaftWidth / 2, shaftLength, arrowShaftWidth);
      
      // Arrowhead design (same as Solo)
      const headStartX = arrowLength - arrowHeadLength;
      
      // Base arrowhead layer (dark metal)
      ctx.fillStyle = 'rgba(80, 80, 90, 1)'; // Dark steel
      ctx.beginPath();
      ctx.moveTo(headStartX, -arrowShaftWidth * 2.5);
      ctx.lineTo(arrowLength, 0);
      ctx.lineTo(headStartX, arrowShaftWidth * 2.5);
      ctx.closePath();
      ctx.fill();
      
      // Middle layer (medium metal)
      ctx.fillStyle = 'rgba(120, 120, 130, 1)'; // Medium steel
      ctx.beginPath();
      ctx.moveTo(headStartX + arrowHeadLength * 0.3, -arrowShaftWidth * 1.8);
      ctx.lineTo(arrowLength, 0);
      ctx.lineTo(headStartX + arrowHeadLength * 0.3, arrowShaftWidth * 1.8);
      ctx.closePath();
      ctx.fill();
      
      // Top highlight layer (bright metal edge) - left edge
      ctx.fillStyle = 'rgba(200, 200, 210, 1)'; // Bright steel highlight
      ctx.beginPath();
      ctx.moveTo(headStartX + arrowHeadLength * 0.5, -arrowShaftWidth / 2);
      ctx.lineTo(arrowLength - arrowHeadLength * 0.1, -arrowShaftWidth * 1.2);
      ctx.lineTo(arrowLength, 0);
      ctx.closePath();
      ctx.fill();
      
      // Top highlight layer (bright metal edge) - right edge
      ctx.beginPath();
      ctx.moveTo(headStartX + arrowHeadLength * 0.5, arrowShaftWidth / 2);
      ctx.lineTo(arrowLength - arrowHeadLength * 0.1, arrowShaftWidth * 1.2);
      ctx.lineTo(arrowLength, 0);
      ctx.closePath();
      ctx.fill();
      
      // Extra sharp tip accent (white/silver)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; // White tip
      ctx.beginPath();
      ctx.moveTo(arrowLength - arrowHeadLength * 0.2, -arrowShaftWidth * 0.5);
      ctx.lineTo(arrowLength, 0);
      ctx.lineTo(arrowLength - arrowHeadLength * 0.2, arrowShaftWidth * 0.5);
      ctx.closePath();
      ctx.fill();
      
      // Fletching (feathers at back) - left feather
      ctx.fillStyle = 'rgba(150, 150, 150, 1)'; // Gray feathers
      ctx.beginPath();
      ctx.moveTo(0, -arrowShaftWidth * 1.5);
      ctx.lineTo(arrowFletchingLength, -arrowShaftWidth * 2);
      ctx.lineTo(arrowFletchingLength, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      
      ctx.beginPath();
      ctx.moveTo(0, arrowShaftWidth * 1.5);
      ctx.lineTo(arrowFletchingLength, arrowShaftWidth * 2);
      ctx.lineTo(arrowFletchingLength, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
    }
  }

  // PvP Match Result Modal
  if (gameMode === 'PvP' && showingMatchResult && matchResult) {
    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(240, 0, canvas.width - 240, canvas.height);
    
    // Modal background (larger to fit more info)
    const modalX = canvas.width / 2 - 250;
    const modalY = canvas.height / 2 - 200;
    const modalWidth = 500;
    const modalHeight = 400;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(modalX, modalY, modalWidth, modalHeight);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeRect(modalX, modalY, modalWidth, modalHeight);
    
    // Result text
    ctx.fillStyle = matchResult === 'victory' ? '#00ff00' : '#ff0000';
    ctx.font = 'bold 32px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText(matchResult === 'victory' ? 'VICTORY!' : 'DEFEAT', canvas.width / 2, modalY + 50);
    
    // Opponent info - use saved address from when match ended
    // CRITICAL: Always use opponentAddressForResult first, then fallback to currentMatch/opponentId
    let opponentAddress = '';
    
    // First priority: use saved address from when match ended
    if (opponentAddressForResult) {
      opponentAddress = opponentAddressForResult;
      console.log('Render: Using saved opponentAddressForResult:', opponentAddress);
    } else {
      // Fallback: try to get from currentMatch or opponentId
      const walletState = walletService.getState();
      const myAddress = walletState.address;
      
      // Try currentMatch or savedCurrentMatch first (most reliable)
      const matchToUse = currentMatch || savedCurrentMatch;
      if (matchToUse && myAddress) {
        // Determine opponent: if I'm p1, opponent is p2; if I'm p2, opponent is p1
        if (matchToUse.p1 === myAddress) {
          opponentAddress = matchToUse.p2;
        } else if (matchToUse.p2 === myAddress) {
          opponentAddress = matchToUse.p1;
        } else {
          opponentAddress = opponentId || '';
        }
        console.log('Render: Fallback - Using opponent address from match:', opponentAddress, { 
          myAddress, 
          p1: matchToUse.p1, 
          p2: matchToUse.p2,
          usedSavedMatch: !currentMatch && !!savedCurrentMatch
        });
      } else if (opponentId) {
        // Fallback to opponentId
        opponentAddress = opponentId;
        console.log('Render: Fallback - Using opponentId as address:', opponentAddress);
      } else {
        opponentAddress = 'Unknown';
        console.warn('Render: No opponent address found!', { 
          opponentAddressForResult, 
          currentMatch: currentMatch ? { p1: currentMatch.p1, p2: currentMatch.p2 } : null, 
          opponentId, 
          myAddress 
        });
      }
    }
    
    // Opponent address/nickname
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.fillText('OPPONENT:', modalX + 20, modalY + 90);
    ctx.font = 'bold 10px "Press Start 2P"';
    // Always show opponent address (nickname is optional)
    // Priority: nickname > saved address > fallback address > 'Unknown'
    const opponentDisplay = opponentNicknameForResult || opponentAddress || 'Unknown';
    console.log('Rendering opponent info:', { 
      matchResult, 
      opponentNicknameForResult, 
      opponentAddress, 
      opponentAddressForResult, 
      currentMatch: currentMatch ? { p1: currentMatch.p1, p2: currentMatch.p2 } : null,
      display: opponentDisplay 
    });
    // Truncate address if too long (only if it's an address, not nickname)
    const displayOpponent = (opponentNicknameForResult || opponentAddress) && (opponentNicknameForResult || opponentAddress).length > 30 
      ? (opponentNicknameForResult || opponentAddress).substring(0, 27) + '...' 
      : (opponentNicknameForResult || opponentAddress || 'Unknown');
    ctx.fillText(displayOpponent, modalX + 20, modalY + 110);
    
    // XP change
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillText('XP CHANGE:', modalX + 20, modalY + 140);
    ctx.font = 'bold 14px "Press Start 2P"';
    const xpChange = matchResult === 'victory' ? 3 : -1;
    ctx.fillStyle = matchResult === 'victory' ? '#00ff00' : '#ff0000';
    const xpText = xpChange > 0 ? `+${xpChange} XP` : `${xpChange} XP`;
    ctx.fillText(xpText, modalX + 20, modalY + 160);
    
    // ELO change
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillText('ELO CHANGE:', modalX + 20, modalY + 190);
    ctx.font = 'bold 14px "Press Start 2P"';
    ctx.fillStyle = matchResultEloChange > 0 ? '#00ff00' : '#ff0000';
    const eloText = matchResultEloChange > 0 ? `+${matchResultEloChange} ELO` : `${matchResultEloChange} ELO`;
    ctx.fillText(eloText, modalX + 20, modalY + 210);
    
    // Close button (X) - top right
    const closeButtonX = modalX + modalWidth - 40;
    const closeButtonY = modalY + 10;
    const closeButtonSize = 30;
    
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(closeButtonX, closeButtonY, closeButtonSize, closeButtonSize);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(closeButtonX, closeButtonY, closeButtonSize, closeButtonSize);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('X', closeButtonX + closeButtonSize / 2, closeButtonY + closeButtonSize / 2 + 6);
    
    // Back to Lobby button
    const backButtonX = canvas.width / 2 - 100;
    const backButtonY = modalY + 320;
    const backButtonWidth = 200;
    const backButtonHeight = 40;
    
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(backButtonX, backButtonY, backButtonWidth, backButtonHeight);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(backButtonX, backButtonY, backButtonWidth, backButtonHeight);
    
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('BACK TO LOBBY', canvas.width / 2, backButtonY + backButtonHeight / 2);
  }

  // Debug info
  ctx.fillStyle = '#000000';
  ctx.font = '8px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.fillText(`STATE: ${gameState}`, 10, canvas.height - 20);
  if (gameMode === 'PvP') {
    ctx.fillText(`MODE: PvP | MyID: ${myPlayerId?.substr(0, 8)}...`, 10, canvas.height - 10);
    if (currentMatch) {
      ctx.fillText(`MATCH: ${currentMatch.id.substring(0, 8)}...`, 10, canvas.height - 30);
    }
  }
  
  // Restore context from shake
  ctx.restore();
  
  // Profile panel (render LAST - highest layer) - no overlay, game continues in background
  // Only show profile panel if wallet is connected
  const walletStateForProfile = walletService.getState();
  const isWalletConnectedForProfile = walletStateForProfile.isConnected && walletStateForProfile.address;
  
  // Close profile if wallet disconnects
  if (isProfileOpen && !isWalletConnectedForProfile) {
    isProfileOpen = false;
    // Hide nickname input if visible
    const nicknameInput = document.getElementById('nicknameInput') as HTMLInputElement;
    if (nicknameInput) {
      nicknameInput.style.display = 'none';
    }
  }
  
  if (isProfileOpen && isWalletConnectedForProfile) {
    // Profile window (centered, moved up 100px)
    const profileWindowWidth = 900;
    const profileWindowHeight = 750;
    const profileWindowX = (canvas.width - profileWindowWidth) / 2;
    const profileWindowY = (canvas.height - profileWindowHeight) / 2 - 100; // Move up 100px
    
    // Window shadow (dark gray, offset)
    ctx.fillStyle = '#404040';
    ctx.fillRect(profileWindowX + 4, profileWindowY + 4, profileWindowWidth, profileWindowHeight);
    
    // Window background (light gray)
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(profileWindowX, profileWindowY, profileWindowWidth, profileWindowHeight);
    
    // Window border (thick black)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeRect(profileWindowX, profileWindowY, profileWindowWidth, profileWindowHeight);
    
    // Inner border (white highlight)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(profileWindowX + 2, profileWindowY + 2, profileWindowWidth - 4, profileWindowHeight - 4);
    
    // Title bar background
    ctx.fillStyle = '#000000';
    ctx.fillRect(profileWindowX, profileWindowY, profileWindowWidth, 50);
    
    // Title text (white on black)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 19px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('PROFILE', profileWindowX + profileWindowWidth / 2, profileWindowY + 32);
    
    // Get profile data
    const profile = profileManager.getProfile();
    
    // Profile data container (with background)
    const dataStartY = profileWindowY + 70;
    const dataEndY = profileWindowY + profileWindowHeight - 20;
    
    // Left column background (wider for larger window)
    const leftColumnWidth = 400;
    const rightColumnWidth = 450;
    const columnSpacing = 30;
    
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(profileWindowX + 20, dataStartY, leftColumnWidth, dataEndY - dataStartY);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(profileWindowX + 20, dataStartY, leftColumnWidth, dataEndY - dataStartY);
    
    // Right column background (NFT gallery)
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(profileWindowX + 20 + leftColumnWidth + columnSpacing, dataStartY, rightColumnWidth, dataEndY - dataStartY);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(profileWindowX + 20 + leftColumnWidth + columnSpacing, dataStartY, rightColumnWidth, dataEndY - dataStartY);
    
    // Profile data (left side)
    let yOffset = dataStartY + 25;
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillStyle = '#000000';
    
    // Label style
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 9px "Press Start 2P"';
    ctx.fillText('NICKNAME', profileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillText(`${profile.nickname || '(not set)'}`, profileWindowX + 30, yOffset + 10);
    yOffset += 35;
    
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.fillText('XP', profileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillText(`${profile.xp}`, profileWindowX + 30, yOffset + 10);
    yOffset += 35;
    
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.fillText('PVP WINS', profileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#00aa00';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillText(`${profile.winsPvP}`, profileWindowX + 30, yOffset + 10);
    yOffset += 35;
    
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.fillText('PVP LOSSES', profileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#aa0000';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillText(`${profile.lossesPvP}`, profileWindowX + 30, yOffset + 10);
    yOffset += 35;
    
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.fillText('WALLET BALANCE', profileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    // Show Ronin wallet DOT balance if available, otherwise show "Not connected"
    const walletBalanceText = walletDotBalance !== null ? `${walletDotBalance} DOT` : 'Not connected';
    ctx.fillText(walletBalanceText, profileWindowX + 30, yOffset + 10);
    yOffset += 35;
    
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.fillText('SOLO KILLS', profileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillText(`${profile.totalSoloKills}`, profileWindowX + 30, yOffset + 10);
    yOffset += 35;
    
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.fillText('UPGRADE ATTEMPTS', profileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillText(`${profile.totalUpgradeAttempts}`, profileWindowX + 30, yOffset + 10);
    yOffset += 35;
    
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.fillText('UPGRADE SUCCESS CHANCE', profileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillText(`${profile.upgradeSuccessChance}%`, profileWindowX + 30, yOffset + 10);
    yOffset += 35;
    
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.fillText('BASIC DMG', profileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    const nftBonuses = calculateNftBonuses();
    const totalDmg = dmg + nftBonuses.dmg;
    ctx.fillText(`${dmg}`, profileWindowX + 30, yOffset + 10);
    if (nftBonuses.dmg > 0) {
      ctx.fillStyle = '#00aa00'; // Green color for bonus
      ctx.fillText(`+${nftBonuses.dmg}`, profileWindowX + 30 + ctx.measureText(`${dmg} `).width, yOffset + 10);
    }
    yOffset += 35;
    
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.fillText('CRIT CHANCE', profileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    const totalCritChance = critChance + nftBonuses.critChance;
    ctx.fillText(`${critChance}%`, profileWindowX + 30, yOffset + 10);
    if (nftBonuses.critChance > 0) {
      ctx.fillStyle = '#00aa00'; // Green color for bonus
      ctx.fillText(`+${nftBonuses.critChance}%`, profileWindowX + 30 + ctx.measureText(`${critChance}% `).width, yOffset + 10);
    }
    yOffset += 35;
    
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.fillText('ACCURACY', profileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillText(`${accuracy}%`, profileWindowX + 30, yOffset + 10);
    yOffset += 35;
    
    // Move MAX HP and MAX ARMOR to left side
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.fillText('MAX HP', profileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillText(`${profile.maxHP}`, profileWindowX + 30, yOffset + 10);
    if (nftBonuses.hp > 0) {
      ctx.fillStyle = '#00aa00'; // Green color for bonus
      ctx.fillText(`+${nftBonuses.hp}`, profileWindowX + 30 + ctx.measureText(`${profile.maxHP} `).width, yOffset + 10);
    }
    yOffset += 35;
    
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.fillText('MAX ARMOR', profileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillText(`${profile.maxArmor}`, profileWindowX + 30, yOffset + 10);
    
    // NFT Gallery (right side)
    const nftSectionX = profileWindowX + 20 + leftColumnWidth + columnSpacing;
    const nftSectionY = dataStartY;
    const nftSectionWidth = rightColumnWidth;
    const nftSectionHeight = dataEndY - dataStartY;
    
    // NFT Section Title
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 11px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('RONKEVERSE NFT COLLECTION', nftSectionX + nftSectionWidth / 2, nftSectionY + 20);
    
    // NFT Content Area
    const nftContentY = nftSectionY + 35;
    const nftContentHeight = nftSectionHeight - 80; // Leave space for pagination
    
    // Loading state
    if (isLoadingNfts) {
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 10px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('Loading Ronkeverse collection...', nftSectionX + nftSectionWidth / 2, nftContentY + nftContentHeight / 2);
    }
    // Error state
    else if (nftError) {
      ctx.fillStyle = '#aa0000';
      ctx.font = 'bold 9px "Press Start 2P"';
      ctx.textAlign = 'center';
      const errorLines = nftError.match(/.{1,35}/g) || [nftError];
      errorLines.forEach((line, i) => {
        ctx.fillText(line, nftSectionX + nftSectionWidth / 2, nftContentY + nftContentHeight / 2 + i * 15);
      });
    }
    // Empty state
    else if (nftList.length === 0) {
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 10px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('You don\'t own any', nftSectionX + nftSectionWidth / 2, nftContentY + nftContentHeight / 2 - 10);
      ctx.fillText('Ronkeverse NFTs yet.', nftSectionX + nftSectionWidth / 2, nftContentY + nftContentHeight / 2 + 10);
    }
    // NFT Grid (2x2)
    else {
      const totalPages = Math.ceil(nftList.length / nftsPerPage);
      const startIndex = nftCurrentPage * nftsPerPage;
      const endIndex = Math.min(startIndex + nftsPerPage, nftList.length);
      const currentNfts = nftList.slice(startIndex, endIndex);
      
      // Grid layout: 2 rows x 2 columns (larger cards for bigger window)
      const cardWidth = 200;
      const cardHeight = 200;
      const cardSpacing = 15;
      const gridStartX = nftSectionX + (nftSectionWidth - (cardWidth * 2 + cardSpacing)) / 2;
      const gridStartY = nftContentY + 10;
      
      for (let i = 0; i < nftsPerPage; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const cardX = gridStartX + col * (cardWidth + cardSpacing);
        const cardY = gridStartY + row * (cardHeight + cardSpacing);
        
        if (i < currentNfts.length) {
          const nft = currentNfts[i];
          
          // Card background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.strokeRect(cardX, cardY, cardWidth, cardHeight);
          
          // NFT Image (if available)
          const imageAreaX = cardX + 5;
          const imageAreaY = cardY + 5;
          const imageAreaWidth = cardWidth - 10;
          const imageAreaHeight = cardHeight - 40;
          
          if (nft.image) {
            const cachedImage = nftImageCache.get(nft.image);
            
            if (cachedImage && cachedImage.complete) {
              // Draw image
              try {
                // Calculate aspect ratio to fit image in area
                const imgAspect = cachedImage.width / cachedImage.height;
                const areaAspect = imageAreaWidth / imageAreaHeight;
                
                let drawWidth = imageAreaWidth;
                let drawHeight = imageAreaHeight;
                let drawX = imageAreaX;
                let drawY = imageAreaY;
                
                if (imgAspect > areaAspect) {
                  // Image is wider - fit to width
                  drawHeight = imageAreaWidth / imgAspect;
                  drawY = imageAreaY + (imageAreaHeight - drawHeight) / 2;
                } else {
                  // Image is taller - fit to height
                  drawWidth = imageAreaHeight * imgAspect;
                  drawX = imageAreaX + (imageAreaWidth - drawWidth) / 2;
                }
                
                ctx.drawImage(cachedImage, drawX, drawY, drawWidth, drawHeight);
              } catch (error) {
                console.error('Error drawing NFT image:', error);
                // Fallback to placeholder
                ctx.fillStyle = '#e0e0e0';
                ctx.fillRect(imageAreaX, imageAreaY, imageAreaWidth, imageAreaHeight);
                ctx.fillStyle = '#666666';
                ctx.font = 'bold 8px "Press Start 2P"';
                ctx.textAlign = 'center';
                ctx.fillText('ERROR', cardX + cardWidth / 2, cardY + cardHeight / 2 - 20);
              }
            } else {
              // Image is loading - show placeholder
              ctx.fillStyle = '#e0e0e0';
              ctx.fillRect(imageAreaX, imageAreaY, imageAreaWidth, imageAreaHeight);
              ctx.fillStyle = '#666666';
              ctx.font = 'bold 8px "Press Start 2P"';
              ctx.textAlign = 'center';
              ctx.fillText('LOADING...', cardX + cardWidth / 2, cardY + cardHeight / 2 - 20);
              
              // Try to load image if not already loading
              if (!nftImageLoading.has(nft.image)) {
                loadNftImage(nft.image, nft.tokenId);
              }
            }
          } else {
            // No image URL
            ctx.fillStyle = '#e0e0e0';
            ctx.fillRect(imageAreaX, imageAreaY, imageAreaWidth, imageAreaHeight);
            ctx.fillStyle = '#666666';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.textAlign = 'center';
            ctx.fillText('NO IMAGE', cardX + cardWidth / 2, cardY + cardHeight / 2 - 20);
          }
          
          // NFT Name
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 8px "Press Start 2P"';
          ctx.textAlign = 'center';
          const nameText = nft.name.length > 18 ? nft.name.substring(0, 15) + '...' : nft.name;
          ctx.fillText(nameText, cardX + cardWidth / 2, cardY + cardHeight - 25);
          
          // Token ID
          ctx.fillStyle = '#666666';
          ctx.font = 'bold 7px "Press Start 2P"';
          ctx.fillText(`#${nft.tokenId}`, cardX + cardWidth / 2, cardY + cardHeight - 10);
        } else {
          // Empty slot
          ctx.fillStyle = '#f5f5f5';
          ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
          ctx.strokeStyle = '#cccccc';
          ctx.lineWidth = 1;
          ctx.strokeRect(cardX, cardY, cardWidth, cardHeight);
        }
      }
      
      // Pagination controls
      if (totalPages > 1) {
        const paginationY = nftSectionY + nftSectionHeight - 40;
        const arrowSize = 20;
        const arrowY = paginationY + 10;
        
        // Left arrow
        const leftArrowX = nftSectionX + 20;
        const canGoLeft = nftCurrentPage > 0;
        
        ctx.fillStyle = canGoLeft ? (nftPaginationPressLeft ? '#666666' : (nftPaginationHoverLeft ? '#999999' : '#cccccc')) : '#e0e0e0';
        ctx.fillRect(leftArrowX, arrowY, arrowSize, arrowSize);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(leftArrowX, arrowY, arrowSize, arrowSize);
        
        // Left arrow symbol (<)
        ctx.fillStyle = canGoLeft ? '#000000' : '#999999';
        ctx.font = 'bold 15px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText('<', leftArrowX + arrowSize / 2, arrowY + arrowSize / 2 + 5);
        
        // Page indicator
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 9px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText(`Page ${nftCurrentPage + 1} / ${totalPages}`, nftSectionX + nftSectionWidth / 2, arrowY + arrowSize / 2 + 5);
        
        // Right arrow
        const rightArrowX = nftSectionX + nftSectionWidth - arrowSize - 20;
        const canGoRight = nftCurrentPage < totalPages - 1;
        
        ctx.fillStyle = canGoRight ? (nftPaginationPressRight ? '#666666' : (nftPaginationHoverRight ? '#999999' : '#cccccc')) : '#e0e0e0';
        ctx.fillRect(rightArrowX, arrowY, arrowSize, arrowSize);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(rightArrowX, arrowY, arrowSize, arrowSize);
        
        // Right arrow symbol (>)
        ctx.fillStyle = canGoRight ? '#000000' : '#999999';
        ctx.font = 'bold 15px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText('>', rightArrowX + arrowSize / 2, arrowY + arrowSize / 2 + 5);
      }
    }
    
    ctx.textAlign = 'left'; // Reset text align
    
    // Close button (better design)
    const closeButtonX = profileWindowX + profileWindowWidth - 45;
    const closeButtonY = profileWindowY + 10;
    const closeButtonSize = 30;
    
    // Close button shadow
    ctx.fillStyle = '#800000';
    ctx.fillRect(closeButtonX + 2, closeButtonY + 2, closeButtonSize, closeButtonSize);
    
    // Close button background
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(closeButtonX, closeButtonY, closeButtonSize, closeButtonSize);
    
    // Close button border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(closeButtonX, closeButtonY, closeButtonSize, closeButtonSize);
    
    // Close button highlight
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(closeButtonX + 1, closeButtonY + 1, closeButtonSize - 2, closeButtonSize - 2);
    
    // Close button text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 19px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('X', closeButtonX + closeButtonSize / 2, closeButtonY + closeButtonSize / 2 + 6);
  }
  
  // Opponent Profile panel (render AFTER profile panel - highest layer)
  if (isOpponentProfileOpen && opponentAddressForResult) {
    // Opponent profile window (centered)
    const opponentProfileWindowWidth = 650;
    const opponentProfileWindowHeight = 550;
    const opponentProfileWindowX = (canvas.width - opponentProfileWindowWidth) / 2;
    const opponentProfileWindowY = (canvas.height - opponentProfileWindowHeight) / 2;
    
    // Window shadow (dark gray, offset)
    ctx.fillStyle = '#404040';
    ctx.fillRect(opponentProfileWindowX + 4, opponentProfileWindowY + 4, opponentProfileWindowWidth, opponentProfileWindowHeight);
    
    // Window background (light gray)
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(opponentProfileWindowX, opponentProfileWindowY, opponentProfileWindowWidth, opponentProfileWindowHeight);
    
    // Window border (thick black)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeRect(opponentProfileWindowX, opponentProfileWindowY, opponentProfileWindowWidth, opponentProfileWindowHeight);
    
    // Inner border (white highlight)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(opponentProfileWindowX + 2, opponentProfileWindowY + 2, opponentProfileWindowWidth - 4, opponentProfileWindowHeight - 4);
    
    // Title bar background
    ctx.fillStyle = '#000000';
    ctx.fillRect(opponentProfileWindowX, opponentProfileWindowY, opponentProfileWindowWidth, 50);
    
    // Title text (white on black)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('OPPONENT PROFILE', opponentProfileWindowX + opponentProfileWindowWidth / 2, opponentProfileWindowY + 32);
    
    // Opponent profile data container (with background)
    const dataStartY = opponentProfileWindowY + 70;
    const dataEndY = opponentProfileWindowY + opponentProfileWindowHeight - 20;
    
    // Left column background
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(opponentProfileWindowX + 20, dataStartY, 280, dataEndY - dataStartY);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(opponentProfileWindowX + 20, dataStartY, 280, dataEndY - dataStartY);
    
    // Right column background
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(opponentProfileWindowX + 320, dataStartY, 310, dataEndY - dataStartY);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(opponentProfileWindowX + 320, dataStartY, 310, dataEndY - dataStartY);
    
    // Opponent profile data (left side)
    let yOffset = dataStartY + 25;
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.fillStyle = '#000000';
    
    // Label style
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 9px "Press Start 2P"';
    ctx.fillText('NICKNAME', opponentProfileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Press Start 2P"';
    const opponentNickname = opponentProfileData?.nickname || opponentNicknameForResult || '(not set)';
    ctx.fillText(opponentNickname, opponentProfileWindowX + 30, yOffset + 10);
    yOffset += 35;
    
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.fillText('ADDRESS', opponentProfileWindowX + 30, yOffset - 5);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 9px "Press Start 2P"';
    const displayAddress = opponentAddressForResult.length > 20 
      ? opponentAddressForResult.substring(0, 17) + '...' 
      : opponentAddressForResult;
    ctx.fillText(displayAddress, opponentProfileWindowX + 30, yOffset + 10);
    yOffset += 35;
    
    // PvP stats from Supabase profile
    if (opponentProfileData && opponentProfileData.pvp_data) {
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 8px "Press Start 2P"';
      ctx.fillText('PVP WINS', opponentProfileWindowX + 30, yOffset - 5);
      ctx.fillStyle = '#00aa00';
      ctx.font = 'bold 12px "Press Start 2P"';
      ctx.fillText(`${opponentProfileData.pvp_data.wins || 0}`, opponentProfileWindowX + 30, yOffset + 10);
      yOffset += 35;
      
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 8px "Press Start 2P"';
      ctx.fillText('PVP LOSSES', opponentProfileWindowX + 30, yOffset - 5);
      ctx.fillStyle = '#aa0000';
      ctx.font = 'bold 12px "Press Start 2P"';
      ctx.fillText(`${opponentProfileData.pvp_data.losses || 0}`, opponentProfileWindowX + 30, yOffset + 10);
      yOffset += 35;
      
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 8px "Press Start 2P"';
      ctx.fillText('ELO RATING', opponentProfileWindowX + 30, yOffset - 5);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px "Press Start 2P"';
      ctx.fillText(`${opponentProfileData.pvp_data.elo || 1000}`, opponentProfileWindowX + 30, yOffset + 10);
      yOffset += 35;
    }
    
    // Solo stats from Supabase profile
    if (opponentProfileData && opponentProfileData.solo_data) {
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 8px "Press Start 2P"';
      ctx.fillText('SOLO LEVEL', opponentProfileWindowX + 30, yOffset - 5);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px "Press Start 2P"';
      ctx.fillText(`${opponentProfileData.solo_data.level || 1}`, opponentProfileWindowX + 30, yOffset + 10);
      yOffset += 35;
      
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 8px "Press Start 2P"';
      ctx.fillText('SOLO DMG', opponentProfileWindowX + 30, yOffset - 5);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px "Press Start 2P"';
      ctx.fillText(`${opponentProfileData.solo_data.dmg || 1}`, opponentProfileWindowX + 30, yOffset + 10);
      yOffset += 35;
      
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 8px "Press Start 2P"';
      ctx.fillText('CRIT CHANCE', opponentProfileWindowX + 30, yOffset - 5);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px "Press Start 2P"';
      const critChanceOpponent = opponentProfileData.solo_data.upgrades?.critChance || 4;
      ctx.fillText(`${critChanceOpponent}%`, opponentProfileWindowX + 30, yOffset + 10);
      yOffset += 35;
      
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 8px "Press Start 2P"';
      ctx.fillText('ACCURACY', opponentProfileWindowX + 30, yOffset - 5);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px "Press Start 2P"';
      const accuracyOpponent = opponentProfileData.solo_data.upgrades?.accuracy || 60;
      ctx.fillText(`${accuracyOpponent}%`, opponentProfileWindowX + 30, yOffset + 10);
    }
    
    // Right column - Max stats
    yOffset = dataStartY + 25;
    if (opponentProfileData && opponentProfileData.solo_data) {
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 8px "Press Start 2P"';
      ctx.fillText('MAX HP', opponentProfileWindowX + 330, yOffset - 5);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px "Press Start 2P"';
      ctx.fillText(`${opponentProfileData.solo_data.maxHP || 10}`, opponentProfileWindowX + 330, yOffset + 10);
      yOffset += 35;
      
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 8px "Press Start 2P"';
      ctx.fillText('MAX ARMOR', opponentProfileWindowX + 330, yOffset - 5);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px "Press Start 2P"';
      ctx.fillText(`${opponentProfileData.solo_data.maxArmor || 5}`, opponentProfileWindowX + 330, yOffset + 10);
    }
    
    // Loading message if profile not loaded yet
    if (!opponentProfileData) {
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 12px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('Loading profile...', opponentProfileWindowX + opponentProfileWindowWidth / 2, opponentProfileWindowY + opponentProfileWindowHeight / 2);
    }
    
    // Close button (better design)
    const closeButtonX = opponentProfileWindowX + opponentProfileWindowWidth - 45;
    const closeButtonY = opponentProfileWindowY + 10;
    const closeButtonSize = 30;
    
    // Close button shadow
    ctx.fillStyle = '#800000';
    ctx.fillRect(closeButtonX + 2, closeButtonY + 2, closeButtonSize, closeButtonSize);
    
    // Close button background
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(closeButtonX, closeButtonY, closeButtonSize, closeButtonSize);
    
    // Close button border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(closeButtonX, closeButtonY, closeButtonSize, closeButtonSize);
    
    // Close button highlight
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(closeButtonX + 1, closeButtonY + 1, closeButtonSize - 2, closeButtonSize - 2);
    
    // Close button text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('X', closeButtonX + closeButtonSize / 2, closeButtonY + closeButtonSize / 2 + 6);
  }
}

// Global mouse position for katana tracking
let globalMouseX = 0;
let globalMouseY = 0;

// Mouse move handler for hover and drawing
// CRITICAL: Prevent duplicate event listeners (HMR protection)
if (!(window as any).__mousemoveListenerAdded) {
  (window as any).__mousemoveListenerAdded = true;
  canvas.addEventListener('mousemove', (e) => {
  const pos = getCanvasMousePos(e);
  const mouseX = pos.x;
  const mouseY = pos.y;
  
  // Store global mouse position for katana
  globalMouseX = mouseX;
  globalMouseY = mouseY;
  
  // Update drawing with pencil tool - add points as mouse moves
  if (isDrawing) {
    const lastPoint = currentDrawPoints[currentDrawPoints.length - 1];
    
    // Calculate distance from last point
    const dx = mouseX - lastPoint.x;
    const dy = mouseY - lastPoint.y;
    const distToLast = Math.sqrt(dx * dx + dy * dy);
    
    // Add point if moved enough (at least 2 pixels) to avoid too many points
    if (distToLast >= 2) {
      // Calculate total length so far
      let totalLength = 0;
      for (let i = 1; i < currentDrawPoints.length; i++) {
        const prev = currentDrawPoints[i - 1];
        const curr = currentDrawPoints[i];
        totalLength += Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);
      }
      
      // Check if adding this point would exceed max length
      const newLength = totalLength + distToLast;
      if (newLength <= maxDrawLength) {
        // Add the point
        currentDrawPoints.push({ x: mouseX, y: mouseY });
      } else {
        // Limit to max length - add final point at max distance
        const remainingLength = maxDrawLength - totalLength;
        if (remainingLength > 0) {
          const angle = Math.atan2(dy, dx);
          currentDrawPoints.push({
            x: lastPoint.x + Math.cos(angle) * remainingLength,
            y: lastPoint.y + Math.sin(angle) * remainingLength
          });
        }
        // Stop drawing when max length reached (mouseup will finish it)
      }
    }
  }
  
  // Check upgrade button hover - Solo mode only
        if (gameMode === 'Solo') {
          const isOverUpgrade = mouseX >= 20 && mouseX <= 220 && mouseY >= 160 && mouseY <= 200;
          isHoveringUpgrade = isOverUpgrade && !upgradeAnimation && !isDrawing;

          // Check crit button hover
          const isOverCrit = mouseX >= 20 && mouseX <= 220 && mouseY >= 220 && mouseY <= 260;
          isHoveringCrit = isOverCrit && !upgradeAnimation && !isDrawing;
  
          // Check accuracy button hover
          const isOverAccuracy = mouseX >= 20 && mouseX <= 220 && mouseY >= 280 && mouseY <= 320;
          isHoveringAccuracy = isOverAccuracy && !upgradeAnimation && !isDrawing;

          // Check level buttons hover
          hoveredLevel = -1;
          for (const btn of levelButtons) {
            if (mouseX >= btn.x && mouseX <= btn.x + 32 && mouseY >= btn.y && mouseY <= btn.y + 32) {
              const levelDiff = currentLevel - btn.level;
              const canAccess = btn.level <= maxUnlockedLevel && levelDiff <= 2 && levelDiff >= 0;
              if (canAccess) {
                hoveredLevel = btn.level;
                break;
              }
            }
          }
        } else {
          // Reset hover states in PvP mode
          isHoveringUpgrade = false;
          isHoveringCrit = false;
          isHoveringAccuracy = false;
          hoveredLevel = -1;
        }

        // Check wallet button hover
        // Profile button hover
        const isOverProfile = mouseX >= 20 && mouseX <= 220 && mouseY >= 400 && mouseY <= 440;
        isHoveringProfile = isOverProfile && !upgradeAnimation && !isDrawing && !isProfileOpen;
        
        const isOverWallet = mouseX >= 20 && mouseX <= 220 && mouseY >= 450 && mouseY <= 490;
        isHoveringWallet = isOverWallet && !upgradeAnimation && !isDrawing;
        
        // NFT pagination hover (only when profile is open)
        if (isProfileOpen && nftList.length > 0) {
          const totalPages = Math.ceil(nftList.length / nftsPerPage);
          const profileWindowWidth = 900;
          const profileWindowHeight = 750;
          const profileWindowX = (canvas.width - profileWindowWidth) / 2;
          const profileWindowY = (canvas.height - profileWindowHeight) / 2 - 100; // Move up 100px
          const dataStartY = profileWindowY + 70;
          const dataEndY = profileWindowY + profileWindowHeight - 20;
          const nftSectionX = profileWindowX + 20 + 400 + 30; // leftColumnWidth + columnSpacing
          const nftSectionHeight = dataEndY - dataStartY;
          const paginationY = dataStartY + nftSectionHeight - 40;
          const arrowSize = 20;
          const arrowY = paginationY + 10;
          
          const leftArrowX = nftSectionX + 20;
          const rightArrowX = nftSectionX + 310 - arrowSize - 20;
          
          const canGoLeft = nftCurrentPage > 0;
          const canGoRight = nftCurrentPage < totalPages - 1;
          
          nftPaginationHoverLeft = canGoLeft && mouseX >= leftArrowX && mouseX <= leftArrowX + arrowSize &&
                                   mouseY >= arrowY && mouseY <= arrowY + arrowSize;
          nftPaginationHoverRight = canGoRight && mouseX >= rightArrowX && mouseX <= rightArrowX + arrowSize &&
                                    mouseY >= arrowY && mouseY <= arrowY + arrowSize;
        } else {
          nftPaginationHoverLeft = false;
          nftPaginationHoverRight = false;
        }

        // Training button hover detection
        let trainingButtonY = 500;
        try {
          const walletStateForHover = walletService.getState();
          if (walletStateForHover.isConnected && walletStateForHover.address) {
            // Wallet button is at Y=450, height=40, so training button is 60px below
            trainingButtonY = 450 + 40 + 60;
          }
        } catch (error) {
          // Use default position
        }
        const isOverTraining = mouseX >= 20 && mouseX <= 220 && mouseY >= trainingButtonY && mouseY <= trainingButtonY + 40;
        isHoveringGameMode = isOverTraining && !upgradeAnimation && !isDrawing;
        
        // PvP Online button hover detection
        const pvpOnlineButtonY = trainingButtonY + 50;
        const isOverPvPOnline = mouseX >= 20 && mouseX <= 220 && mouseY >= pvpOnlineButtonY && mouseY <= pvpOnlineButtonY + 40;
        isHoveringPvPOnline = isOverPvPOnline && !upgradeAnimation && !isDrawing;
        
        // New button hover detection
        const newButtonY = pvpOnlineButtonY + 50; // Below PvP Online button
        const isOverNewButton = mouseX >= 20 && mouseX <= 220 && mouseY >= newButtonY && mouseY <= newButtonY + 40;
        isHoveringNewButton = isOverNewButton && !upgradeAnimation && !isDrawing;
        
        // Ready/Cancel button hover detection (in Ready screen)
        if (gameMode === 'PvP' && currentMatch && waitingForOpponentReady) {
          const playAreaX = 240; // Play area starts at x=240
          const playAreaWidth = canvas.width - playAreaX;
          const readyButtonX = playAreaX + playAreaWidth / 2 - 100;
          const readyButtonY = canvas.height / 2 + 60;
          const readyButtonWidth = 200;
          const readyButtonHeight = 50;
          const cancelButtonX = playAreaX + playAreaWidth / 2 - 100;
          const cancelButtonY = canvas.height / 2 + 130;
          const cancelButtonWidth = 200;
          const cancelButtonHeight = 40;
          
          if (!isReady) {
            const isOverReady = mouseX >= readyButtonX && mouseX <= readyButtonX + readyButtonWidth &&
                                mouseY >= readyButtonY && mouseY <= readyButtonY + readyButtonHeight;
            isHoveringReady = isOverReady;
          } else {
            isHoveringReady = false;
          }
          
          const isOverCancel = mouseX >= cancelButtonX && mouseX <= cancelButtonX + cancelButtonWidth &&
                               mouseY >= cancelButtonY && mouseY <= cancelButtonY + cancelButtonHeight;
          isHoveringCancel = isOverCancel;
        } else {
          isHoveringReady = false;
          isHoveringCancel = false;
        }

        // Change cursor - show arrow icon when arrow is ready
        if (arrowReady && !arrowFired && mouseX > 240 && !isDrawing && gameState === 'Alive') {
          // Custom arrow cursor
          canvas.style.cursor = 'crosshair';
        } else if (((gameMode === 'Solo' && (isHoveringUpgrade || isHoveringCrit || isHoveringAccuracy || hoveredLevel >= 0)) || isOverProfile || isOverWallet || isHoveringGameMode || isHoveringPvPOnline || isHoveringReady || isHoveringCancel) && !upgradeAnimation && !isDrawing) {
          canvas.style.cursor = 'pointer';
        } else if (isDrawing) {
          canvas.style.cursor = 'crosshair';
        } else if (mouseX > 240) {
          // In play area - show default when katana not active
          canvas.style.cursor = 'default';
        } else {
          canvas.style.cursor = 'default';
        }
  });
} else {
  console.warn('⚠️ Mousemove listener already added - skipping duplicate (HMR protection)');
}

// Mouse down handler
// CRITICAL: Prevent duplicate event listeners (HMR protection)
if (!(window as any).__mousedownListenerAdded) {
  (window as any).__mousedownListenerAdded = true;
  canvas.addEventListener('mousedown', (e) => {
  const pos = getCanvasMousePos(e);
  const mouseX = pos.x;
  const mouseY = pos.y;
  
  // PvP Online: Handle Ready button press (in Ready screen)
  if (gameMode === 'PvP' && currentMatch && waitingForOpponentReady && !isReady) {
    // Calculate button position relative to play area (not full canvas) - MUST MATCH click handler
    const playAreaX = 240; // Play area starts at x=240
    const playAreaWidth = canvas.width - playAreaX;
    const readyButtonX = playAreaX + playAreaWidth / 2 - 100;
    const readyButtonY = canvas.height / 2 + 60;
    const readyButtonWidth = 200;
    const readyButtonHeight = 50;
    
    // Removed console.log to reduce lag
    if (mouseX >= readyButtonX && mouseX <= readyButtonX + readyButtonWidth &&
        mouseY >= readyButtonY && mouseY <= readyButtonY + readyButtonHeight) {
      isPressingReady = true;
      return; // Don't process other clicks
    }
  }
  
  // PvP Online: Handle Cancel button press (in Ready screen)
  if (gameMode === 'PvP' && currentMatch && waitingForOpponentReady) {
    const playAreaX = 240; // Play area starts at x=240
    const playAreaWidth = canvas.width - playAreaX;
    const cancelButtonX = playAreaX + playAreaWidth / 2 - 100;
    const cancelButtonY = canvas.height / 2 + 130;
    const cancelButtonWidth = 200;
    const cancelButtonHeight = 40;
    
    if (mouseX >= cancelButtonX && mouseX <= cancelButtonX + cancelButtonWidth &&
        mouseY >= cancelButtonY && mouseY <= cancelButtonY + cancelButtonHeight) {
      isPressingCancel = true;
      return; // Don't process other clicks
    }
  }
  
  // Check if clicking upgrade buttons - Solo mode only
  if (gameMode === 'Solo') {
    const isOverUpgrade = mouseX >= 20 && mouseX <= 220 && mouseY >= 160 && mouseY <= 200;
    if (isOverUpgrade) {
      isPressingUpgrade = true;
      return; // Don't start drawing if clicking button
    }
    
    // Check if clicking crit button
    const isOverCrit = mouseX >= 20 && mouseX <= 220 && mouseY >= 220 && mouseY <= 260;
    if (isOverCrit) {
      isPressingCrit = true;
      return; // Don't start drawing if clicking button
    }
    
    // Check if clicking accuracy button
    const isOverAccuracy = mouseX >= 20 && mouseX <= 220 && mouseY >= 280 && mouseY <= 320;
    if (isOverAccuracy) {
      isPressingAccuracy = true;
      return; // Don't start drawing if clicking button
    }
  }
  
  // Check if clicking level button - Solo mode only
  if (gameMode === 'Solo') {
    for (const btn of levelButtons) {
      if (mouseX >= btn.x && mouseX <= btn.x + 32 && mouseY >= btn.y && mouseY <= btn.y + 32) {
        const levelDiff = currentLevel - btn.level;
        const canAccess = btn.level <= maxUnlockedLevel && levelDiff <= 2 && levelDiff >= 0;
        if (canAccess && btn.level !== currentLevel) {
          pressedLevel = btn.level;
          return; // Don't start drawing if clicking level button
        }
      }
    }
  }
  
  // Opponent profile panel close button click (check FIRST)
  if (isOpponentProfileOpen) {
    const opponentProfileWindowWidth = 650;
    const opponentProfileWindowHeight = 550;
    const opponentProfileWindowX = (canvas.width - opponentProfileWindowWidth) / 2;
    const opponentProfileWindowY = (canvas.height - opponentProfileWindowHeight) / 2;
    const closeButtonX = opponentProfileWindowX + opponentProfileWindowWidth - 45;
    const closeButtonY = opponentProfileWindowY + 10;
    const closeButtonSize = 30;
    
    if (mouseX >= closeButtonX && mouseX <= closeButtonX + closeButtonSize &&
        mouseY >= closeButtonY && mouseY <= closeButtonY + closeButtonSize) {
      isOpponentProfileOpen = false;
      opponentProfileData = null; // Clear profile data
      return; // Don't process other clicks
    }
  }
  
  // Profile panel close button click (check AFTER opponent profile)
  // Only allow closing if wallet is connected (profile should only be open if wallet is connected)
  const walletStateForClose = walletService.getState();
  const isWalletConnectedForClose = walletStateForClose.isConnected && walletStateForClose.address;
  
  if (isProfileOpen && isWalletConnectedForClose) {
    const profileWindowWidth = 900;
    const profileWindowHeight = 750;
    const profileWindowX = (canvas.width - profileWindowWidth) / 2;
    const profileWindowY = (canvas.height - profileWindowHeight) / 2 - 100; // Move up 100px
    const closeButtonX = profileWindowX + profileWindowWidth - 45;
    const closeButtonY = profileWindowY + 10;
    const closeButtonSize = 30;
    
    if (mouseX >= closeButtonX && mouseX <= closeButtonX + closeButtonSize &&
        mouseY >= closeButtonY && mouseY <= closeButtonY + closeButtonSize) {
      isProfileOpen = false;
      // Hide nickname input if visible
      const nicknameInput = document.getElementById('nicknameInput') as HTMLInputElement;
      if (nicknameInput) {
        nicknameInput.style.display = 'none';
        // Save nickname if changed
        if (nicknameInput.value.trim()) {
          const newNickname = nicknameInput.value.trim();
          profileManager.setNickname(newNickname);
          // Also save to Supabase if wallet is connected
          const walletState = walletService.getState();
          if (walletState.address) {
            supabaseService.updateNickname(walletState.address, newNickname).catch((error) => {
              console.error('Error updating nickname in Supabase:', error);
            });
          }
        }
      }
      return; // Don't process other clicks
    }
    
    // NFT pagination click handlers
    if (nftList.length > 0) {
      const totalPages = Math.ceil(nftList.length / nftsPerPage);
      const leftColumnWidth = 400;
      const rightColumnWidth = 450;
      const columnSpacing = 30;
      const nftSectionX = profileWindowX + 20 + leftColumnWidth + columnSpacing;
      const dataStartY = profileWindowY + 70;
      const dataEndY = profileWindowY + profileWindowHeight - 20;
      const nftSectionHeight = dataEndY - dataStartY;
      const paginationY = dataStartY + nftSectionHeight - 40;
      const arrowSize = 20;
      const arrowY = paginationY + 10;
      
      const leftArrowX = nftSectionX + 20;
      const rightArrowX = nftSectionX + rightColumnWidth - arrowSize - 20;
      
      // Left arrow click
      if (nftCurrentPage > 0 && mouseX >= leftArrowX && mouseX <= leftArrowX + arrowSize &&
          mouseY >= arrowY && mouseY <= arrowY + arrowSize) {
        nftCurrentPage--;
        return; // Don't process other clicks
      }
      
      // Right arrow click
      if (nftCurrentPage < totalPages - 1 && mouseX >= rightArrowX && mouseX <= rightArrowX + arrowSize &&
          mouseY >= arrowY && mouseY <= arrowY + arrowSize) {
        nftCurrentPage++;
        return; // Don't process other clicks
      }
    }
    
    // Click on nickname area to edit
    const nicknameY = profileWindowY + 70;
    if (mouseX >= profileWindowX + 20 && mouseX <= profileWindowX + 300 &&
        mouseY >= nicknameY - 10 && mouseY <= nicknameY + 10) {
      // Show HTML input for nickname editing
      const profile = profileManager.getProfile();
      let nicknameInput = document.getElementById('nicknameInput') as HTMLInputElement;
      if (!nicknameInput) {
        nicknameInput = document.createElement('input');
        nicknameInput.id = 'nicknameInput';
        nicknameInput.type = 'text';
        nicknameInput.maxLength = 16;
        nicknameInput.style.position = 'absolute';
        nicknameInput.style.fontFamily = '"Press Start 2P", monospace';
        nicknameInput.style.fontSize = '10px';
        nicknameInput.style.padding = '5px';
        nicknameInput.style.border = '2px solid #000000';
        nicknameInput.style.backgroundColor = '#ffffff';
        nicknameInput.style.color = '#000000';
        document.body.appendChild(nicknameInput);
      }
      nicknameInput.value = profile.nickname || '';
      nicknameInput.style.display = 'block';
      nicknameInput.style.left = `${profileWindowX + 20}px`;
      nicknameInput.style.top = `${nicknameY - 5}px`;
      nicknameInput.style.width = '280px';
      nicknameInput.focus();
      nicknameInput.select();
      return; // Don't process other clicks
    }
  }
  
  // Check if clicking profile button
  if (!isProfileOpen) {
    const isOverProfile = mouseX >= 20 && mouseX <= 220 && mouseY >= 400 && mouseY <= 440;
    if (isOverProfile) {
      isPressingProfile = true;
      return; // Don't process other clicks
    }
  }
  
  // NFT pagination button press (when profile is open)
  if (isProfileOpen && nftList.length > 0) {
    const profileWindowWidth = 900;
    const profileWindowHeight = 750;
    const profileWindowX = (canvas.width - profileWindowWidth) / 2;
    const profileWindowY = (canvas.height - profileWindowHeight) / 2 - 100; // Move up 100px
    const leftColumnWidth = 400;
    const rightColumnWidth = 450;
    const columnSpacing = 30;
    const nftSectionX = profileWindowX + 20 + leftColumnWidth + columnSpacing;
    const dataStartY = profileWindowY + 70;
    const dataEndY = profileWindowY + profileWindowHeight - 20;
    const nftSectionHeight = dataEndY - dataStartY;
    const paginationY = dataStartY + nftSectionHeight - 40;
    const arrowSize = 20;
    const arrowY = paginationY + 10;
    
    const leftArrowX = nftSectionX + 20;
    const rightArrowX = nftSectionX + rightColumnWidth - arrowSize - 20;
    const totalPages = Math.ceil(nftList.length / nftsPerPage);
    
    // Left arrow press
    if (nftCurrentPage > 0 && mouseX >= leftArrowX && mouseX <= leftArrowX + arrowSize &&
        mouseY >= arrowY && mouseY <= arrowY + arrowSize) {
      nftPaginationPressLeft = true;
      return;
    }
    
    // Right arrow press
    if (nftCurrentPage < totalPages - 1 && mouseX >= rightArrowX && mouseX <= rightArrowX + arrowSize &&
        mouseY >= arrowY && mouseY <= arrowY + arrowSize) {
      nftPaginationPressRight = true;
      return;
    }
  }
  
  // Check if clicking wallet button
  const isOverWallet = mouseX >= 20 && mouseX <= 220 && mouseY >= 450 && mouseY <= 490;
  if (isOverWallet) {
    isPressingWallet = true;
    return; // Don't start drawing if clicking wallet button
  }
  
  // Check if clicking training button
  let trainingButtonY = 500;
  try {
    const walletStateForPress = walletService.getState();
    if (walletStateForPress.isConnected && walletStateForPress.address) {
      // Wallet button is at Y=450, height=40, so training button is 60px below
      trainingButtonY = 450 + 40 + 60;
    }
  } catch (error) {
    // Use default position
  }
  const isOverTraining = mouseX >= 20 && mouseX <= 220 && mouseY >= trainingButtonY && mouseY <= trainingButtonY + 40;
  if (isOverTraining) {
    isPressingGameMode = true;
    return; // Don't start drawing if clicking training button
  }
  
  // Check if clicking PvP Online button
  const pvpOnlineButtonY = trainingButtonY + 50;
  const isOverPvPOnline = mouseX >= 20 && mouseX <= 220 && mouseY >= pvpOnlineButtonY && mouseY <= pvpOnlineButtonY + 40;
  if (isOverPvPOnline) {
    isPressingPvPOnline = true;
    return; // Don't start drawing if clicking PvP Online button
  }
  
  // New button click detection
  const newButtonY = pvpOnlineButtonY + 50; // Below PvP Online button
  const isOverNewButton = mouseX >= 20 && mouseX <= 220 && mouseY >= newButtonY && mouseY <= newButtonY + 40;
  if (isOverNewButton) {
    isPressingNewButton = true;
    // TODO: Add functionality here later
    return; // Don't start drawing if clicking New button
  }
  
  // PvP mode: Projectile charging is now handled by keyboard (key "2"), not mouse
  
  // Start drawing immediately if not on UI panel, cooldown is ready, and right mouse button
  if (mouseX > 240 && e.button === 2) { // Only in play area and right mouse button (for drawing)
    const now = Date.now();
    const timeSinceLastDraw = now - lastDrawEndTime;
    const canDraw = timeSinceLastDraw >= drawCooldown;
    
    if (canDraw) {
      // Start drawing immediately
      isDrawing = true;
      currentDrawPoints = [{ x: mouseX, y: mouseY }]; // Initialize with first point
    }
  }
  
  // Track left mouse button hold for slow-motion (only in play area, not on UI)
  if (mouseX > 240 && e.button === 0 && gameState === 'Alive') {
    mouseHoldStartTime = Date.now();
  }
  
  // Bullet firing is handled in mouseup event (no charging needed)
  });
} else {
  console.warn('⚠️ Mousedown listener already added - skipping duplicate (HMR protection)');
}

// Mouse up handler
// CRITICAL: Prevent duplicate event listeners (HMR protection)
if (!(window as any).__mouseupListenerAdded) {
  (window as any).__mouseupListenerAdded = true;
  canvas.addEventListener('mouseup', (e) => {
  // PvP mode: Projectile firing is now handled by keyboard (key "2"), not mouse
  
  // Bullet firing is now handled by keyboard (key "3"), not mouse
  
  // Handle upgrade buttons (works with any button)
  isPressingUpgrade = false;
  isPressingCrit = false;
  isPressingAccuracy = false;
  isPressingReady = false;
  isPressingCancel = false;
  
  // Handle wallet button click (always allow, even if not connected)
  if (isPressingWallet) {
    const pos = getCanvasMousePos(e);
    const mouseX = pos.x;
    const mouseY = pos.y;
    const isOverWallet = mouseX >= 20 && mouseX <= 220 && mouseY >= 450 && mouseY <= 490;
    
    if (isOverWallet) {
      // Check current wallet state
      const walletState = walletService.getState();
      if (walletState.isConnected && walletState.address) {
        // Disconnect wallet
        walletService.disconnect().then(() => {
          console.log('Wallet disconnected');
          walletError = null;
          // Reset game mode to Solo if in PvP
          if (gameMode === 'PvP') {
            gameMode = 'Solo';
            cleanupPvP();
          }
        }).catch((error) => {
          console.error('Error disconnecting wallet:', error);
          walletError = 'Failed to disconnect';
        });
      } else {
        // Connect wallet
        walletConnecting = true;
        walletError = null;
        walletService.connect().then((result) => {
          if (result) {
            console.log('Wallet connected:', result.address);
            walletError = null;
            
            // Check DOT token balance after connection
            if (result.address) {
              // Check DOT token balance
              walletService.getTokenBalance(DOT_TOKEN_ADDRESS)
                .then((balance) => {
                  if (balance !== null) {
                    walletDotBalance = balance;
                    console.log('Wallet DOT balance (after auth success):', balance);
                  } else {
                    console.log('Wallet DOT balance: null (check failed)');
                  }
                })
                .catch((error) => {
                  console.error('Failed to get DOT balance:', error);
                });
            }
          } else {
            console.error('Wallet connect() returned null!');
            walletError = 'Connection failed';
          }
          walletConnecting = false;
          console.log('walletConnecting set to false');
        })
        .catch((error: any) => {
          console.error('Wallet connect() error:', error);
          walletError = error.message || 'Connection error';
          walletConnecting = false;
        });
      }
    }
    isPressingWallet = false;
  }
  
  // Handle profile button click (only if wallet is connected)
  if (isPressingProfile) {
    // Check if wallet is connected - only allow profile if connected
    const walletState = walletService.getState();
    const isWalletConnected = walletState.isConnected && walletState.address;
    
    if (!isWalletConnected) {
      // Wallet not connected - don't open profile
      isPressingProfile = false;
      return;
    }
    
    const pos = getCanvasMousePos(e);
    const mouseX = pos.x;
    const mouseY = pos.y;
    const isOverProfile = mouseX >= 20 && mouseX <= 220 && mouseY >= 400 && mouseY <= 440;
    if (isOverProfile) {
      const wasOpen = isProfileOpen;
      isProfileOpen = !isProfileOpen;
      
      // Load NFTs when opening profile
      if (isProfileOpen && !wasOpen) {
        const walletState = walletService.getState();
        if (walletState.address) {
          loadPlayerNfts(walletState.address);
        }
      }
      
      // Show/hide nickname input
      const nicknameInput = document.getElementById('nicknameInput') as HTMLInputElement;
      if (nicknameInput) {
        if (isProfileOpen) {
          nicknameInput.style.display = 'none'; // Hide initially, will show when clicking nickname
        } else {
          nicknameInput.style.display = 'none';
          // Save nickname if changed
          if (nicknameInput.value.trim()) {
            const newNickname = nicknameInput.value.trim();
            profileManager.setNickname(newNickname);
            // Also save to Supabase if wallet is connected
            const walletState = walletService.getState();
            if (walletState.address) {
              supabaseService.updateNickname(walletState.address, newNickname).catch((error) => {
                console.error('Error updating nickname in Supabase:', error);
              });
            }
          }
        }
      }
    }
    isPressingProfile = false;
  }
  
  // Reset NFT pagination press states
  nftPaginationPressLeft = false;
  nftPaginationPressRight = false;
  
  // PvP Online: Handle Ready button click
  // Removed excessive logging to reduce lag - only log if there's an issue
  // if (gameMode === 'PvP') {
  //   console.log('Mouse up in PvP mode:', {
  //     hasCurrentMatch: !!currentMatch,
  //     waitingForOpponentReady,
  //     isReady,
  //     gameMode,
  //     currentMatchId: currentMatch?.id
  //   });
  // }
  
  if (gameMode === 'PvP' && currentMatch && waitingForOpponentReady && !isReady) {
    const pos = getCanvasMousePos(e);
    const mouseX = pos.x;
    const mouseY = pos.y;
    
    // Calculate button position relative to play area (not full canvas)
    const playAreaX = 240; // Play area starts at x=240
    const playAreaWidth = canvas.width - playAreaX;
    const readyButtonX = playAreaX + playAreaWidth / 2 - 100;
    const readyButtonY = canvas.height / 2 + 60;
    const readyButtonWidth = 200;
    const readyButtonHeight = 50;
    
    // Removed excessive console.log to reduce lag - only log errors
    if (mouseX >= readyButtonX && mouseX <= readyButtonX + readyButtonWidth &&
        mouseY >= readyButtonY && mouseY <= readyButtonY + readyButtonHeight) {
      setPlayerReady().catch((error) => {
        console.error('❌ Error in setPlayerReady():', error);
      });
      return; // Don't process other clicks
    }
  }
  
  // PvP Online: Handle Cancel button click (in Ready screen)
  if (gameMode === 'PvP' && currentMatch && waitingForOpponentReady) {
    const pos = getCanvasMousePos(e);
    const mouseX = pos.x;
    const mouseY = pos.y;
    
    // Calculate button position relative to play area (not full canvas)
    const playAreaX = 240; // Play area starts at x=240
    const playAreaWidth = canvas.width - playAreaX;
    const cancelButtonX = playAreaX + playAreaWidth / 2 - 100;
    const cancelButtonY = canvas.height / 2 + 130;
    const cancelButtonWidth = 200;
    const cancelButtonHeight = 40;
    
    if (mouseX >= cancelButtonX && mouseX <= cancelButtonX + cancelButtonWidth &&
        mouseY >= cancelButtonY && mouseY <= cancelButtonY + cancelButtonHeight) {
      console.log('Cancel button clicked!');
      // Leave lobby and go back to Solo
      leaveLobby();
      gameMode = 'Solo';
      cleanupPvP();
      return; // Don't process other clicks
    }
  }
  
  // PvP Online: Handle Cancel button click (in Lobby screen)
  if (gameMode === 'PvP' && isInLobby && !currentMatch) {
    const pos = getCanvasMousePos(e);
    const mouseX = pos.x;
    const mouseY = pos.y;
    
    const cancelButtonX = canvas.width / 2 - 100;
    const cancelButtonY = canvas.height / 2 + 80;
    const cancelButtonWidth = 200;
    const cancelButtonHeight = 40;
    
    if (mouseX >= cancelButtonX && mouseX <= cancelButtonX + cancelButtonWidth &&
        mouseY >= cancelButtonY && mouseY <= cancelButtonY + cancelButtonHeight) {
      // Leave lobby and go back to Solo
      leaveLobby();
      gameMode = 'Solo';
      cleanupPvP();
      return; // Don't process other clicks
    }
  }
  
  // Handle level button click - Solo mode only
  if (gameMode === 'Solo' && pressedLevel >= 0 && pressedLevel !== currentLevel) {
    const levelDiff = currentLevel - pressedLevel;
    const canAccess = pressedLevel <= maxUnlockedLevel && levelDiff <= 2 && levelDiff >= 0;
    if (canAccess) {
      // Check if can't stay on same level - must progress first
      // If going back, must have progressed beyond that level first
      const wasProgressedBeyond = maxUnlockedLevel > pressedLevel;
      if (wasProgressedBeyond) {
        currentLevel = pressedLevel;
        killsInCurrentLevel = 0; // Reset kills when switching level
        console.log(`Switched to level ${currentLevel}`);
      }
    }
    pressedLevel = -1;
  }
  
  // Handle training button click
  if (isPressingGameMode) {
    const pos = getCanvasMousePos(e);
    const mouseX = pos.x;
    const mouseY = pos.y;
    
    let trainingButtonY = 500;
    try {
      const walletStateForClick = walletService.getState();
      if (walletStateForClick.isConnected && walletStateForClick.address) {
        // Wallet button is at Y=450, height=40, so training button is 60px below
        trainingButtonY = 450 + 40 + 60;
      }
    } catch (error) {
      // Use default position
    }
    const isOverTraining = mouseX >= 20 && mouseX <= 220 && mouseY >= trainingButtonY && mouseY <= trainingButtonY + 40;
    
    if (isOverTraining) {
      // Toggle Training mode
      if (gameMode === 'Training') {
        // Switching from Training to Solo
        gameMode = 'Solo';
        cleanupPvP();
        console.log('Switched to Solo mode');
      } else {
        // Switching to Training (PvP with bot)
        gameMode = 'Training';
        cleanupPvP(); // Cleanup any existing PvP state
        initializePvP();
        console.log('Switched to Training mode');
      }
      
      forceSaveGame(); // Save after mode switch
    }
    isPressingGameMode = false;
  }
  
  // Handle PvP Online button click
  if (isPressingPvPOnline) {
    const pos = getCanvasMousePos(e);
    const mouseX = pos.x;
    const mouseY = pos.y;
    
    let trainingButtonY = 500;
    try {
      const walletStateForClick = walletService.getState();
      if (walletStateForClick.isConnected && walletStateForClick.address) {
        // Wallet button is at Y=450, height=40, so training button is 60px below
        trainingButtonY = 450 + 40 + 60;
      }
    } catch (error) {
      // Use default position
    }
    const pvpOnlineButtonY = trainingButtonY + 50;
    const isOverPvPOnline = mouseX >= 20 && mouseX <= 220 && mouseY >= pvpOnlineButtonY && mouseY <= pvpOnlineButtonY + 40;
    
    if (isOverPvPOnline) {
      // Enter PvP Online (lobby/matchmaking)
      if (gameMode === 'PvP') {
        // Already in PvP Online, leave lobby and go back to Solo
        leaveLobby().catch((error) => {
          console.error('Failed to leave lobby:', error);
        });
        gameMode = 'Solo';
        cleanupPvP();
        console.log('Left PvP Online, switched to Solo mode');
      } else {
        // Enter PvP Online lobby
        const previousMode = gameMode;
        gameMode = 'PvP';
        cleanupPvP(); // Cleanup any existing PvP state
        
        // Check wallet connection before entering lobby
        const walletState = walletService.getState();
        if (!walletState.isConnected || !walletState.address) {
          // Wallet not connected - revert to previous mode and show error
          gameMode = previousMode;
          walletError = 'Connect Ronin Wallet to play PvP Online';
          console.log('Cannot enter PvP Online: Wallet not connected');
        } else {
          // Wallet connected - enter lobby
          enterLobby().catch((error) => {
            // If entering lobby fails, revert to previous mode
            console.error('Failed to enter lobby:', error);
            gameMode = previousMode;
            isInLobby = false;
            isSearchingForMatch = false;
            currentMatch = null;
            walletError = 'Failed to enter lobby';
          });
          console.log('Entered PvP Online lobby');
        }
      }
      
      forceSaveGame(); // Save after mode switch
    }
    isPressingPvPOnline = false;
  }
  
  // Reset new button press state and handle click
  if (isPressingNewButton) {
    // TODO: Add functionality here later
    // For now, just log that button was clicked
    console.log('New button clicked (no functionality yet)');
    isPressingNewButton = false;
  }
  
  // Reset mouse hold tracking when mouse is released
  // (slow-motion is now auto-activated in gameLoop when hold reaches 1 second)
  if (e.button === 0 && mouseHoldStartTime > 0) {
    // Only reset if slow-motion hasn't been activated yet
    // If slow-motion is active, keep tracking until it finishes
    if (!slowMotionActive) {
      mouseHoldStartTime = 0; // Reset only if slow-motion wasn't triggered
    }
  }
  
  // If upgrade animation is running and mouse is released before completion, fail the upgrade
  if (upgradeAnimation && upgradeProgress < upgradeFailAt) {
    upgradeAnimation = false;
    upgradeProgress = 0;
    upgradeParticles = [];
    
    // Refund the cost
    if (upgradeType === 'dmg') {
      dotCurrency += upgradeCost;
    } else if (upgradeType === 'crit') {
      dotCurrency += upgradeCost;
    } else if (upgradeType === 'accuracy') {
      dotCurrency += upgradeCost;
    }
    
    upgradeMessage = 'FAILED!';
    upgradeSuccess = false;
    upgradeMessageX = 20;
    if (upgradeType === 'dmg') upgradeMessageY = 213;
    else if (upgradeType === 'crit') upgradeMessageY = 273;
    else if (upgradeType === 'accuracy') upgradeMessageY = 333;
    upgradeMessageTimer = 2000;
    
    // Profile: Track upgrade failure (mouse released early)
    profileManager.addUpgradeFailure();
    
    console.log('Upgrade failed - mouse released!');
  }
  
  // Only process drawing if right mouse button was released
  if (e.button === 2) {
    // Finish drawing if active
    if (isDrawing) {
      // Only create line if has enough points (at least 2 for a segment)
      if (currentDrawPoints.length >= 2) {
        const newLine = {
          points: [...currentDrawPoints], // Copy the points array
          life: 240, // 4 seconds at 60 FPS
          maxLife: 240,
          hits: 0, // Start with 0 hits
          maxHits: 2, // Line can take 2 hits before disappearing
          ownerId: undefined // My line (undefined = my line)
        };
        drawnLines.push(newLine);
        
        // Send line to opponent via network sync (PvP mode only)
        if (gameMode === 'PvP' && currentMatch) {
          const useColyseus = colyseusService.isConnectedToRoom();
          const isSyncing = useColyseus || pvpSyncService.isSyncing();
          
          if (isSyncing) {
            const lineInput = {
              type: 'line' as const,
              timestamp: Date.now(),
              points: newLine.points
            };
            
            if (useColyseus) {
              colyseusService.sendInput(lineInput);
            } else {
              pvpSyncService.sendInput(lineInput);
            }
          }
        }
        
        // Start cooldown timer when drawing ends
        lastDrawEndTime = Date.now();
      }
      
      isDrawing = false;
      currentDrawPoints = [];
    }
  }
  });
} else {
  console.warn('⚠️ Mouseup listener already added - skipping duplicate (HMR protection)');
}

// Prevent context menu on right click (for drawing)
// CRITICAL: Prevent duplicate event listeners (HMR protection)
if (!(window as any).__contextmenuListenerAdded) {
  (window as any).__contextmenuListenerAdded = true;
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
} else {
  console.warn('⚠️ Contextmenu listener already added - skipping duplicate (HMR protection)');
}

// Keyboard handler for arrow activation (key "1")
// CRITICAL: Prevent duplicate event listeners (HMR protection)
if (!(window as any).__keydownListenerAdded) {
  (window as any).__keydownListenerAdded = true;
  window.addEventListener('keydown', (e) => {
  // Solo mode: Arrow activation
  if (e.key === '1' && gameMode === 'Solo' && gameState === 'Alive' && !arrowFired) {
    // Toggle arrow ready state
    arrowReady = !arrowReady;
    if (arrowReady) {
      console.log('Arrow ready - press left click to fire!');
    } else {
      console.log('Arrow cancelled');
    }
  }
  
  // PvP/Training mode: Arrow activation
  if (e.key === '1' && (gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
    const myPlayer = pvpPlayers[myPlayerId];
    
    // Block input if player is dead
    if (myPlayer.isOut || myPlayer.hp <= 0 || deathAnimations.has(myPlayerId)) {
      return; // Dead - can't use arrow
    }
    
    // Check if paralyzed
    if (myPlayer.paralyzedUntil > Date.now()) {
      return; // Paralyzed - can't activate arrow
    }
    const currentTime = Date.now();
    const timeSinceLastShot = currentTime - pvpArrowLastShotTime;
    
    // Check if cooldown has passed
    if (timeSinceLastShot >= pvpArrowCooldown) {
      // Toggle arrow ready state (only if cooldown passed)
      pvpArrowReady = !pvpArrowReady;
      if (pvpArrowReady) {
        console.log('PvP Arrow ready - press left click to fire!');
      } else {
        console.log('PvP Arrow cancelled');
      }
    } else {
      // Cooldown still active
      const remainingTime = Math.ceil((pvpArrowCooldown - timeSinceLastShot) / 1000);
      console.log(`PvP Arrow on cooldown: ${remainingTime}s remaining`);
    }
  }
  
  // PvP/Training mode: Start charging projectile (key "2")
  // Check projectile cooldown
  const currentTime = Date.now();
  const timeSinceLastProjectileShot = currentTime - projectileLastShotTime;
  const canUseProjectile = timeSinceLastProjectileShot >= projectileCooldown;
  
  if (e.key === '2' && (gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId] && !projectileFlying && !projectileCharging && canUseProjectile) {
    const myPlayer = pvpPlayers[myPlayerId];
    
    // Block input if player is dead
    if (myPlayer.isOut || myPlayer.hp <= 0 || deathAnimations.has(myPlayerId)) {
      return; // Dead - can't use projectile
    }
    // Check if paralyzed
    if (myPlayer.paralyzedUntil > Date.now()) {
      return; // Paralyzed - can't charge projectile
    }
    // Start charging from player position
    projectileCharging = true;
    projectileChargeStartTime = Date.now();
    projectileStartX = myPlayer.x;
    projectileStartY = myPlayer.y;
    console.log('Projectile charging started - release key "2" to fire!');
  }
  
  // PvP/Training mode: Fire bullet (key "3")
  if (e.key === '3' && (gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
    const myPlayer = pvpPlayers[myPlayerId];
    
    // Block input if player is dead
    if (myPlayer.isOut || myPlayer.hp <= 0 || deathAnimations.has(myPlayerId)) {
      return; // Dead - can't fire bullet
    }
    
    // Check if paralyzed
    if (myPlayer.paralyzedUntil > Date.now()) {
      return; // Paralyzed - can't fire bullet
    }
    
    // Check cooldown (5 seconds after every shot)
    const timeSinceLastShot = Date.now() - bulletLastShotTime;
    if (timeSinceLastShot < bulletCooldown) {
      return; // Still on cooldown
    }
    
    // Don't fire if bullet is already flying
    if (bulletFlying) {
      return; // Bullet already in flight
    }
    
    // Calculate direction to mouse position
    const dx = globalMouseX - myPlayer.x;
    const dy = globalMouseY - myPlayer.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      // Normalize direction
      const dirX = dx / distance;
      const dirY = dy / distance;
      
      // Spawn bullet at player position
      bulletFlying = true;
      bulletX = myPlayer.x;
      bulletY = myPlayer.y;
      bulletVx = dirX * bulletSpeed;
      bulletVy = dirY * bulletSpeed;
      bulletSpawnTime = Date.now();
      bulletLastShotTime = Date.now();
      
      // Send to opponent via network sync
      const useColyseus = colyseusService.isConnectedToRoom();
      const isSyncing = useColyseus || pvpSyncService.isSyncing();
      if (currentMatch && isSyncing) {
        const bulletInput = {
          type: 'bullet' as const,
          timestamp: Date.now(),
          x: myPlayer.x,
          y: myPlayer.y,
          vx: bulletVx,
          vy: bulletVy,
        };
        if (useColyseus) {
          colyseusService.sendInput(bulletInput);
        } else {
          pvpSyncService.sendInput(bulletInput);
        }
      }
      
      console.log('Bullet fired!', { x: bulletX, y: bulletY, vx: bulletVx, vy: bulletVy });
    }
  }
  });
} else {
  console.warn('⚠️ Keydown listener already added - skipping duplicate (HMR protection)');
}

// Keyboard handler for projectile firing (key "2" release)
// CRITICAL: Prevent duplicate event listeners (HMR protection)
if (!(window as any).__keyupListenerAdded) {
  (window as any).__keyupListenerAdded = true;
  window.addEventListener('keyup', (e) => {
  // PvP/Training mode: Launch projectile if charging (key "2" released)
  if (e.key === '2' && (gameMode === 'PvP' || gameMode === 'Training') && projectileCharging && !projectileFlying && myPlayerId && pvpPlayers[myPlayerId]) {
    const myPlayer = pvpPlayers[myPlayerId];
    // Check if paralyzed
    if (myPlayer.paralyzedUntil > Date.now()) {
      // Cancel charging if paralyzed
      projectileCharging = false;
      return; // Paralyzed - can't fire projectile
    }
    const chargeTime = Date.now() - projectileChargeStartTime;
    const chargeRatio = Math.min(chargeTime / projectileMaxCharge, 1.0); // 0 to 1
    
    // Get current player position and mouse position for direction
    const dx = globalMouseX - myPlayer.x;
    const dy = globalMouseY - myPlayer.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      // Launch projectile with speed based on charge (15% stronger)
      const speed = projectileBaseSpeed * (0.5 + chargeRatio * 1.5) * 1.15; // 0.5x to 2x base speed + 15% boost
      
      // Calculate direction (normalized)
      const dirX = dx / distance;
      const dirY = dy / distance;
      
      // If fully charged (100%), give player +1 speed bonus in opposite direction (backward boost)
      if (chargeRatio >= 1.0) {
        const boostSpeed = 1; // +1 speed bonus
        myPlayer.vx -= dirX * boostSpeed; // Boost backward (opposite to shot direction)
        myPlayer.vy -= dirY * boostSpeed; // Boost backward (opposite to shot direction)
        console.log('Full charge! +1 speed bonus applied');
      }
      
      // Apply recoil: push player in opposite direction with 3 speed
      const recoilSpeed = 3;
      myPlayer.vx -= dirX * recoilSpeed; // Opposite direction
      myPlayer.vy -= dirY * recoilSpeed; // Opposite direction
      
      // Create shot impact effect (particles and screen shake) - reduced particle count
      // Particle effect at launch position
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8 + Math.atan2(dirY, dirX) + Math.PI; // Particles go opposite to shot
        const particleSpeed = 3 + Math.random() * 4;
        safePushClickParticle({
          x: myPlayer.x,
          y: myPlayer.y,
          vx: Math.cos(angle) * particleSpeed,
          vy: Math.sin(angle) * particleSpeed,
          life: 40,
          maxLife: 40,
          size: 4 + Math.random() * 3
        });
      }
      
      // Screen shake effect
      screenShake = Math.max(screenShake, 8);
      
      projectileFlying = true;
      
      // Start cooldown immediately when projectile is fired (3 seconds)
      projectileLastShotTime = Date.now();
      
      // Spawn projectile slightly away from player to avoid immediate self-collision
      const spawnOffset = 15; // Spawn 15px away from player center
      projectileX = myPlayer.x + dirX * spawnOffset; // Spawn in direction of shot
      projectileY = myPlayer.y + dirY * spawnOffset; // Spawn in direction of shot
      projectileVx = dirX * speed;
      projectileVy = dirY * speed;
      projectileSpawnTime = Date.now(); // Record spawn time for lifetime
      projectileBounceCount = 0; // Reset bounce count
      projectileCharging = false;
      
      // Create explosion animation at launch position
      createProjectileExplosion(projectileX, projectileY);
      
      console.log(`Projectile launched with speed ${speed}, charge: ${(chargeRatio * 100).toFixed(1)}%`);
      
      // Send projectile to opponent via network sync
      const useColyseus = colyseusService.isConnectedToRoom();
      const isSyncing = useColyseus || pvpSyncService.isSyncing();
      if (currentMatch && isSyncing) {
        const chargeTime = Date.now() - projectileChargeStartTime;
        
        // Send explosion animation to opponent
        sendProjectileExplosion(projectileX, projectileY);
        const projectileInput = {
          type: 'projectile' as const,
          timestamp: Date.now(),
          x: projectileX, // Use spawn position (already offset from player)
          y: projectileY, // Use spawn position (already offset from player)
          targetX: globalMouseX,
          targetY: globalMouseY,
          chargeTime: chargeTime,
        };
        if (useColyseus) {
          colyseusService.sendInput(projectileInput);
        } else {
          pvpSyncService.sendInput(projectileInput);
        }
      }
    } else {
      projectileCharging = false; // Cancel if no direction
    }
  }
  });
} else {
  console.warn('⚠️ Keyup listener already added - skipping duplicate (HMR protection)');
}

// Katana slash handler moved to click handler below

// Click handler
// CRITICAL: Prevent duplicate event listeners (HMR protection)
if (!(window as any).__clickListenerAdded) {
  (window as any).__clickListenerAdded = true;
  canvas.addEventListener('click', (e) => {
  const pos = getCanvasMousePos(e);
  const mouseX = pos.x;
  const mouseY = pos.y;

  // Handle match result modal clicks
  if (gameMode === 'PvP' && showingMatchResult && matchResult) {
    const modalX = canvas.width / 2 - 250;
    const modalY = canvas.height / 2 - 200;
    const modalWidth = 500;
    const modalHeight = 400;
    
    // Close button (X) - top right
    const closeButtonX = modalX + modalWidth - 40;
    const closeButtonY = modalY + 10;
    const closeButtonSize = 30;
    
    if (mouseX >= closeButtonX && mouseX <= closeButtonX + closeButtonSize &&
        mouseY >= closeButtonY && mouseY <= closeButtonY + closeButtonSize) {
      // Close result modal
      showingMatchResult = false;
      matchResult = null;
      matchResultEloChange = 0;
      opponentNicknameForResult = null; // Reset opponent nickname
      opponentAddressForResult = null; // Reset opponent address
      savedCurrentMatch = null; // Reset saved match
      opponentWalletAddress = null; // Reset opponent wallet address
      isOpponentProfileOpen = false; // Close opponent profile if open
      opponentProfileData = null; // Clear opponent profile data
      // Return to lobby
      leaveLobby();
      gameMode = 'Solo';
      cleanupPvP();
      return;
    }
    
    // Back to Lobby button
    const backButtonX = canvas.width / 2 - 100;
    const backButtonY = modalY + 320;
    const backButtonWidth = 200;
    const backButtonHeight = 40;
    
    if (mouseX >= backButtonX && mouseX <= backButtonX + backButtonWidth &&
        mouseY >= backButtonY && mouseY <= backButtonY + backButtonHeight) {
      // Close result modal and return to lobby
      showingMatchResult = false;
      matchResult = null;
      matchResultEloChange = 0;
      opponentNicknameForResult = null; // Reset opponent nickname
      opponentAddressForResult = null; // Reset opponent address
      savedCurrentMatch = null; // Reset saved match
      opponentWalletAddress = null; // Reset opponent wallet address
      isOpponentProfileOpen = false; // Close opponent profile if open
      opponentProfileData = null; // Clear opponent profile data
      leaveLobby();
      gameMode = 'Solo';
      cleanupPvP();
      return;
    }
  }

  // Check if clicking UI buttons - don't charge DOT for these
  const isOverUpgrade = mouseX >= 20 && mouseX <= 220 && mouseY >= 160 && mouseY <= 200;
  const isOverCrit = mouseX >= 20 && mouseX <= 220 && mouseY >= 220 && mouseY <= 260;
  const isOverAccuracy = mouseX >= 20 && mouseX <= 220 && mouseY >= 280 && mouseY <= 320;
  const isOnUI = mouseX <= 240; // Left panel
  
  // Solo mode: Charge -1 DOT for every click (except UI buttons and right-click for drawing)
  if (gameMode === 'Solo' && !isOverUpgrade && !isOverCrit && !isOverAccuracy && e.button === 0) {
    // Only charge if have DOT to spend
    if (dotCurrency > 0) {
      dotCurrency -= 1;
    }
    
    // Create click smudge at click position (unless on UI panel)
    if (!isOnUI && gameState === 'Alive') {
      clickSmudges.push({
        x: mouseX,
        y: mouseY,
        life: 300, // 5 seconds at 60 FPS (300 frames)
        maxLife: 300
      });
    }
  }

  // Solo mode: Handle arrow throw - click to launch arrow towards DOT (only if ready and not yet fired)
  if (gameMode === 'Solo' && arrowReady && !arrowFired && mouseX > 240 && gameState === 'Alive' && !katanaFlying && !katanaSlashing && e.button === 0) {
    // Launch arrow from mouse position towards DOT
    katanaFlying = true;
    arrowFired = true; // Mark as fired - can only fire once per DOT lifetime
    arrowReady = false; // Reset ready state
    katanaX = mouseX;
    katanaY = mouseY;
    arrowStartX = mouseX; // Save launch position for impact direction calculation
    arrowStartY = mouseY;
    
    // Calculate direction to DOT and set velocity
    const dx = dotX - mouseX;
    const dy = dotY - mouseY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 0) {
      katanaVx = (dx / distance) * katanaSpeed;
      katanaVy = (dy / distance) * katanaSpeed;
      katanaAngle = Math.atan2(dy, dx);
    }
    
    // Reset hit targets
    katanaHitTargets.clear();
    
    console.log(`Arrow launched from (${mouseX}, ${mouseY}) towards DOT at speed ${katanaSpeed}`);
    return; // Don't process normal click when arrow is launched
  }

  // Solo mode: Check DOT click
  if (gameMode === 'Solo') {
    const dx = mouseX - dotX;
    const dy = mouseY - dotY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= dotRadius && gameState === 'Alive') {
    // Check if have enough DOT to attempt hit (need at least dmg amount)
    if (dotCurrency >= dmg) {
      // Additional cost for actual damage attempt (already deducted -1 above)
      // But we need at least dmg amount total, so subtract (dmg - 1) more
      const additionalCost = dmg - 1;
      dotCurrency -= additionalCost;
      
      // Check for accuracy hit
      const isHit = Math.random() < accuracy / 100;
      
      if (isHit) {
        // Katana damage multiplier (if active and in slash zone, handled in gameLoop)
        const katanaDamageMultiplier = 1; // Normal click damage
        
        // Check for crit hit (only if we hit) - with NFT bonuses
        const nftBonuses = calculateNftBonuses();
        const totalCritChance = critChance + nftBonuses.critChance;
        let isCritHit = Math.random() < totalCritChance / 100;
        // Apply force-crit if available and not expired
        if (nextHitForceCrit && Date.now() <= nextHitForceCritExpiresAt) {
          isCritHit = true;
          nextHitForceCrit = false;
        } else if (Date.now() > nextHitForceCritExpiresAt) {
          nextHitForceCrit = false;
        }
        // Calculate base damage with katana multiplier and crit (with NFT bonuses)
        const totalDmg = dmg + nftBonuses.dmg;
        const baseDamage = totalDmg * katanaDamageMultiplier;
        const damageWithCrit = isCritHit ? baseDamage * 2 : baseDamage;
        // Apply 50% variance (damage ranges from 50% to 100%)
        let totalDamage = applyDamageVariance(damageWithCrit);
        
        // Move DOT opposite to click direction - crit hits give more force
        const clickAngle = Math.atan2(dy, dx);
        const oppositeAngle = clickAngle + Math.PI; // Add 180 degrees for opposite direction
        const force = isCritHit ? 8.625 : 4.6; // Increased by 15% - Crit hits give more force (8.625 vs 4.6)
        dotVx += Math.cos(oppositeAngle) * force;
        dotVy += Math.sin(oppositeAngle) * force;
        
        // Update last hit time to disable gravity temporarily
        lastHitTime = Date.now();
        gravityLocked = false; // enable gravity after the very first successful hit
        
        // Check if combo reached 100% from previous platform/line bounces and trigger bonus
        if (comboProgress >= 100 && !comboActive) {
          const bonusDamage = Math.floor(dmg * 4);
          const absorbedB = Math.min(bonusDamage, dotArmor);
          dotArmor -= absorbedB;
          const remainingB = bonusDamage - absorbedB;
          dotHP = Math.max(0, dotHP - remainingB);
          safePushDamageNumber({
            x: dotX + (Math.random() - 0.5) * 40,
            y: dotY - 28,
            value: bonusDamage,
            life: 60,
            maxLife: 60,
            vx: (Math.random() - 0.5) * 2,
            vy: -2 - Math.random() * 2,
            isCrit: true // render as black with lightning
          });
          screenShake = Math.max(screenShake, 30);
          // Reset combo
          comboProgress = 0;
          comboActive = false;
          comboMultiplier = 1;
          
          // Check death after combo 4x damage
          if (dotHP <= 0) {
            gameState = 'Dying';
            deathAnimation = true;
            deathTimer = 0;
            respawnTimer = 0;
            awaitingRestart = false;
            rewardGranted = false;
            deathStartX = dotX;
            deathStartY = dotY;
            
            // Leveling system: increment kill counter
            killsInCurrentLevel++;
            console.log(`Kills in level ${currentLevel}: ${killsInCurrentLevel}/${killsNeededPerLevel}`);
            
            if (killsInCurrentLevel >= killsNeededPerLevel) {
              killsInCurrentLevel = 0;
              if (maxUnlockedLevel === currentLevel) {
                maxUnlockedLevel = currentLevel + 1;
                console.log(`Level ${maxUnlockedLevel} unlocked!`);
                forceSaveGame(); // Save after level unlock
              }
            }
            
            console.log('DOT is dying! (combo 4x damage)');
          }
        }
        
        // Apply damage - DOT takes exactly the DMG amount
        const absorbed = Math.min(totalDamage, dotArmor);
        dotArmor -= absorbed;
        const remainingDamage = totalDamage - absorbed;
        dotHP = Math.max(0, dotHP - remainingDamage); // Don't go below 0
        
        // Profile: Track damage taken (Solo mode)
        profileManager.addDamageTaken(totalDamage);

        // Add damage number animation
        safePushDamageNumber({
          x: dotX + (Math.random() - 0.5) * 40,
          y: dotY - 20, // Both crit and normal go up
          value: totalDamage,
          life: 60, // 1 second at 60 FPS
          maxLife: 60,
          vx: (Math.random() - 0.5) * 2,
          vy: -2 - Math.random() * 2, // Both crit and normal go up
          isCrit: isCritHit // crit style only for regular crits; 4x bonus above already marked
        });

        console.log(`${isCritHit ? 'CRIT HIT!' : 'Hit!'} DMG: ${totalDamage}, HP: ${dotHP}, Armor: ${dotArmor}`);

        // Check for decay particles when HP is 50% or less
        if (dotHP <= dotMaxHP * 0.5 && dotHP > 0) {
          // Create decay particles occasionally
          if (Math.random() < 0.3) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * dotRadius;
            const particleX = dotX + Math.cos(angle) * distance;
            const particleY = dotY + Math.sin(angle) * distance;
            
            safePushDotDecayParticle({
              x: particleX,
              y: particleY,
              vx: (Math.random() - 0.5) * 3,
              vy: (Math.random() - 0.5) * 3,
              life: 60,
              maxLife: 60,
              size: 2 + Math.random() * 3
            });
          }
        }
        
        // Check death
        if (dotHP <= 0) {
          gameState = 'Dying';
          deathAnimation = true;
          deathTimer = 0;
          respawnTimer = 0; // Reset respawn timer
          awaitingRestart = false; // cancel any pending ground restart
          rewardGranted = false; // Reset reward flag for new death
          deathStartX = dotX; // Save death position
          deathStartY = dotY; // Save death position
          
          // Leveling system: increment kill counter
          killsInCurrentLevel++;
          console.log(`Kills in level ${currentLevel}: ${killsInCurrentLevel}/${killsNeededPerLevel}`);
          
          // If reached kills needed, unlock next level
          if (killsInCurrentLevel >= killsNeededPerLevel) {
            killsInCurrentLevel = 0; // Reset counter
            if (maxUnlockedLevel === currentLevel) {
              maxUnlockedLevel = currentLevel + 1;
              console.log(`Level ${maxUnlockedLevel} unlocked!`);
            }
          }
          
          // Don't grant reward yet - wait for 10% of death animation
          console.log('DOT is dying!');
        }
      } else {
        // Miss - show MISS text (falls down) but don't move DOT
        safePushDamageNumber({
          x: dotX + (Math.random() - 0.5) * 40,
          y: dotY + 20, // Start below DOT
          value: 'MISS',
          life: 60,
          maxLife: 60,
          vx: (Math.random() - 0.5) * 2,
          vy: 0.5 + Math.random() * 0.5, // Falls down slowly
          isCrit: false,
          isMiss: true // Mark as miss
        });
        
        // Create click smudge on miss (no safePush helper for clickSmudges - they have natural limit via life)
        clickSmudges.push({
          x: dotX,
          y: dotY,
          life: 300, // 5 seconds at 60 FPS (300 frames)
          maxLife: 300
        });
        
        console.log('MISS!');
        // DOT doesn't move on miss
      }
    } else {
      console.log(`Not enough Dot! Need ${dmg}, have ${dotCurrency}`);
    }
    } // End if (distance <= dotRadius)
  } // End Solo mode check for DOT click

  // PvP/Training mode: Handle arrow throw - click to launch arrow (only if ready and cooldown passed)
  if ((gameMode === 'PvP' || gameMode === 'Training') && pvpArrowReady && mouseX > 240 && myPlayerId && pvpPlayers[myPlayerId] && !pvpKatanaFlying && e.button === 0) {
    const myPlayer = pvpPlayers[myPlayerId];
    
    // Block input if player is dead
    if (myPlayer.isOut || myPlayer.hp <= 0 || deathAnimations.has(myPlayerId)) {
      return; // Dead - can't fire arrow
    }
    
    // Check if paralyzed
    if (myPlayer.paralyzedUntil > Date.now()) {
      return; // Paralyzed - can't fire arrow
    }
    const currentTime = Date.now();
    const timeSinceLastShot = currentTime - pvpArrowLastShotTime;
    
    // Check if cooldown has passed
    if (timeSinceLastShot >= pvpArrowCooldown) {
      // Launch arrow from player position towards mouse position (like Solo mode)
      pvpKatanaFlying = true;
      pvpArrowFired = true; // Mark as fired
      pvpArrowReady = false; // Reset ready state
      pvpArrowLastShotTime = currentTime; // Update last shot time
      pvpKatanaX = myPlayer.x; // Start from current player position
      pvpKatanaY = myPlayer.y; // Start from current player position
      
      // Calculate direction to mouse (like Solo mode)
      const dx = mouseX - myPlayer.x;
      const dy = mouseY - myPlayer.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 0) {
        pvpKatanaVx = (dx / distance) * pvpKatanaSpeed;
        pvpKatanaVy = (dy / distance) * pvpKatanaSpeed;
        pvpKatanaAngle = Math.atan2(dy, dx);
      }
      
        // Removed console.log to reduce lag
        // console.log(`PvP Arrow launched from player (${myPlayer.x}, ${myPlayer.y}) towards mouse (${mouseX}, ${mouseY}) at speed ${pvpKatanaSpeed}`);
      
      // Send arrow to opponent via network sync
      const useColyseusArrow = colyseusService.isConnectedToRoom();
      const isSyncingArrow = useColyseusArrow || pvpSyncService.isSyncing();
      if (currentMatch && isSyncingArrow) {
        const arrowInput = {
          type: 'arrow' as const,
          timestamp: currentTime,
          x: myPlayer.x,
          y: myPlayer.y,
          targetX: mouseX,
          targetY: mouseY,
        };
        if (useColyseusArrow) {
          colyseusService.sendInput(arrowInput);
        } else {
          pvpSyncService.sendInput(arrowInput);
        }
      }
      
      return; // Don't process normal click when arrow is launched
    } else {
      // Cooldown still active - cancel arrow ready state
      pvpArrowReady = false;
      const remainingTime = Math.ceil((pvpArrowCooldown - timeSinceLastShot) / 1000);
      console.log(`PvP Arrow on cooldown: ${remainingTime}s remaining`);
    }
  }

  // PvP/Training mode: Click handler (same as Solo DOT click system with accuracy/miss)
  if ((gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
    const pos = getCanvasMousePos(e);
    const mouseX = pos.x;
    const mouseY = pos.y;
    
    // Only process clicks in play area
    if (mouseX > 240 && e.button === 0) {
      const myPlayer = pvpPlayers[myPlayerId];
      
      // Check if paralyzed
      if (myPlayer.paralyzedUntil > Date.now()) {
        return; // Paralyzed - can't click
      }
      
      // CRITICAL: Only allow controlling my player, never opponent
      if (myPlayer.id !== myPlayerId) {
        console.warn('Attempted to control wrong player!', { clickedPlayerId: myPlayer.id, myPlayerId });
        return;
      }
      
      // Check if clicking on my player (same as Solo DOT click detection)
      const dx = mouseX - myPlayer.x;
      const dy = mouseY - myPlayer.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= myPlayer.radius) {
        // Check for accuracy hit (same as Solo)
        const isHit = Math.random() < accuracy / 100;
        
        if (isHit) {
          // Clicked on player - move opposite to click direction (same as Solo DOT)
          const clickAngle = Math.atan2(dy, dx);
          const oppositeAngle = clickAngle + Math.PI; // Add 180 degrees for opposite direction
          
          // Check for crit hit (same as Solo) - with NFT bonuses
          const nftBonuses = calculateNftBonuses();
          const totalCritChance = critChance + nftBonuses.critChance;
          let isCritHit = Math.random() < totalCritChance / 100;
          
          // Use same force as Solo DOT - crit hits give more force
          const force = isCritHit ? 8.625 : 4.6; // Crit hits give more force (8.625 vs 4.6)
          
          // Apply force to player velocity (same as Solo DOT)
          myPlayer.vx += Math.cos(oppositeAngle) * force;
          myPlayer.vy += Math.sin(oppositeAngle) * force;
          
          // Update last hit time and unlock gravity (same as Solo)
          myPlayer.lastHitTime = Date.now();
          myPlayer.gravityLocked = false; // Enable gravity after first hit
          
          // Send input to opponent via network sync
          const useColyseusClick = colyseusService.isConnectedToRoom();
          const isSyncingClick = useColyseusClick || pvpSyncService.isSyncing();
          if (currentMatch && isSyncingClick) {
            const clickInput = {
              type: 'click' as const,
              timestamp: Date.now(),
              x: mouseX,
              y: mouseY,
              isCrit: isCritHit,
            };
            if (useColyseusClick) {
              colyseusService.sendInput(clickInput);
            } else {
              pvpSyncService.sendInput(clickInput);
            }
          }
          
          // Create particle effect at click position (PvP hit feedback)
          const clickX = myPlayer.x + Math.cos(clickAngle) * myPlayer.radius;
          const clickY = myPlayer.y + Math.sin(clickAngle) * myPlayer.radius;
          
          if (isCritHit) {
            // Crit hit - create more particles with special effect
            // Create 8-12 particles in a burst (more than normal hit)
            const particleCount = 8 + Math.floor(Math.random() * 5); // 8-12 particles
            for (let i = 0; i < particleCount; i++) {
              const angle = Math.random() * Math.PI * 2; // Random direction
              const speed = 2 + Math.random() * 3; // Faster speed for crit
              safePushClickParticle({
                x: clickX,
                y: clickY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 30 + Math.floor(Math.random() * 30), // 30-60 frames (longer for crit)
                maxLife: 30 + Math.floor(Math.random() * 30),
                size: 3 + Math.random() * 3 // 3-6 pixels (bigger for crit)
              });
            }
            
            // Screen shake for crit hits (same as Solo)
            screenShake = Math.max(screenShake, 30);
            
            console.log(`PvP CRIT HIT! - force applied: (${Math.cos(oppositeAngle) * force}, ${Math.sin(oppositeAngle) * force})`);
          } else {
            // Normal hit - create 4-6 small particles in a burst
            const particleCount = 4 + Math.floor(Math.random() * 3); // 4-6 particles
            for (let i = 0; i < particleCount; i++) {
              const angle = Math.random() * Math.PI * 2; // Random direction
              const speed = 1 + Math.random() * 2; // Random speed
              safePushClickParticle({
                x: clickX,
                y: clickY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 20 + Math.floor(Math.random() * 20), // 20-40 frames
                maxLife: 20 + Math.floor(Math.random() * 20),
                size: 2 + Math.random() * 2 // 2-4 pixels
              });
            }
            
            console.log(`PvP player clicked - force applied: (${Math.cos(oppositeAngle) * force}, ${Math.sin(oppositeAngle) * force})`);
          }
        } else {
          // Miss - show MISS text (falls down) but don't move player (same as Solo)
          safePushDamageNumber({
            x: myPlayer.x + (Math.random() - 0.5) * 40,
            y: myPlayer.y + 20, // Start below player
            value: 'MISS',
            life: 60,
            maxLife: 60,
            vx: (Math.random() - 0.5) * 2,
            vy: 0.5 + Math.random() * 0.5, // Falls down slowly
            isCrit: false,
            isMiss: true // Mark as miss
          });
          
          // Create click smudge on miss (no safePush helper for clickSmudges - they have natural limit via life)
          clickSmudges.push({
            x: myPlayer.x,
            y: myPlayer.y,
            life: 300, // 5 seconds at 60 FPS (300 frames)
            maxLife: 300
          });
          
          console.log('PvP MISS!');
          // Player doesn't move on miss
        }
      }
    }
  }

  // Check upgrade button click (variables already defined above)
  // Only allow upgrade if wallet is connected
  const walletStateForUpgrade = walletService.getState();
  const isWalletConnectedForUpgrade = walletStateForUpgrade.isConnected && walletStateForUpgrade.address;
  
  if (isOverUpgrade && isWalletConnectedForUpgrade) {
    const cost = Math.ceil(10 * Math.pow(1.15, dmg - 1));
    if (dotCurrency >= cost && !upgradeAnimation) {
      // Determine success/fail immediately
      upgradeWillSucceed = Math.random() < 0.4; // 40% chance
      
      // If fail, set random fail point (10%, 25%, 35%, 55%, 70%, 90%, 95%)
      const failPoints = [0.10, 0.25, 0.35, 0.55, 0.70, 0.90, 0.95];
      upgradeFailAt = upgradeWillSucceed ? 1.0 : failPoints[Math.floor(Math.random() * failPoints.length)];
      
      // Clear previous message
      upgradeMessage = '';
      upgradeMessageTimer = 0;
      
      // Start upgrade animation
      upgradeAnimation = true;
      upgradeProgress = 0;
      upgradeType = 'dmg';
      upgradeCost = cost;
      upgradeParticles = [];
      dotCurrency -= cost;
      
      // Profile: Upgrade attempt + XP
      profileManager.addUpgradeAttempt();
      profileManager.addXP(1);
      
      console.log(`Starting DMG upgrade animation... Will succeed: ${upgradeWillSucceed}, Fail at: ${upgradeFailAt}`);
    } else if (dotCurrency < cost) {
      upgradeMessage = 'No Dot!';
      upgradeSuccess = false;
      upgradeMessageX = 20;
      upgradeMessageY = 213; // Below upgrade button (moved down)
      upgradeMessageTimer = 1500; // 1.5 seconds
      console.log('Not enough Dot for upgrade!');
    }
  }

  // Check crit chance upgrade button click (variable already defined above)
  if (isOverCrit && isWalletConnectedForUpgrade) {
    const critUpgradeCost = Math.ceil(20 * Math.pow(1.1, critUpgradeLevel));
    if (dotCurrency >= critUpgradeCost && !upgradeAnimation) {
      // Determine success/fail immediately
      upgradeWillSucceed = Math.random() < 0.4; // 40% chance
      
      // If fail, set random fail point (10%, 25%, 35%, 55%, 70%, 90%, 95%)
      const failPoints = [0.10, 0.25, 0.35, 0.55, 0.70, 0.90, 0.95];
      upgradeFailAt = upgradeWillSucceed ? 1.0 : failPoints[Math.floor(Math.random() * failPoints.length)];
      
      // Clear previous message
      upgradeMessage = '';
      upgradeMessageTimer = 0;
      
      // Start upgrade animation
      upgradeAnimation = true;
      upgradeProgress = 0;
      upgradeType = 'crit';
      upgradeCost = critUpgradeCost;
      upgradeParticles = [];
      dotCurrency -= critUpgradeCost;
      
      // Profile: Upgrade attempt + XP
      profileManager.addUpgradeAttempt();
      profileManager.addXP(1);
      
      console.log(`Starting Crit upgrade animation... Will succeed: ${upgradeWillSucceed}, Fail at: ${upgradeFailAt}`);
    } else if (dotCurrency < critUpgradeCost) {
      upgradeMessage = 'No Dot!';
      upgradeSuccess = false;
      upgradeMessageX = 20;
      upgradeMessageY = 273; // Below crit button (moved down)
      upgradeMessageTimer = 1500; // 1.5 seconds
      console.log('Not enough Dot for crit chance upgrade!');
    }
  }

  // Check accuracy upgrade button click (variable already defined above)
  if (isOverAccuracy && isWalletConnectedForUpgrade) {
    const accuracyUpgradeCost = Math.ceil(20 * Math.pow(1.1, accuracyUpgradeLevel));
    if (dotCurrency >= accuracyUpgradeCost && !upgradeAnimation) {
      // Determine success/fail immediately
      upgradeWillSucceed = Math.random() < 0.4; // 40% chance
      
      // If fail, set random fail point (10%, 25%, 35%, 55%, 70%, 90%, 95%)
      const failPoints = [0.10, 0.25, 0.35, 0.55, 0.70, 0.90, 0.95];
      upgradeFailAt = upgradeWillSucceed ? 1.0 : failPoints[Math.floor(Math.random() * failPoints.length)];
      
      // Clear previous message
      upgradeMessage = '';
      upgradeMessageTimer = 0;
      
      // Start upgrade animation
      upgradeAnimation = true;
      upgradeProgress = 0;
      upgradeType = 'accuracy';
      upgradeCost = accuracyUpgradeCost;
      upgradeParticles = [];
      dotCurrency -= accuracyUpgradeCost;
      
      // Profile: Upgrade attempt + XP
      profileManager.addUpgradeAttempt();
      profileManager.addXP(1);
      
      console.log(`Starting Accuracy upgrade animation... Will succeed: ${upgradeWillSucceed}, Fail at: ${upgradeFailAt}`);
    } else if (dotCurrency < accuracyUpgradeCost) {
      upgradeMessage = 'No Dot!';
      upgradeSuccess = false;
      upgradeMessageX = 20;
      upgradeMessageY = 333; // Below accuracy button (moved down)
      upgradeMessageTimer = 1500; // 1.5 seconds
      console.log('Not enough Dot for accuracy upgrade!');
    }
  }
  });
} else {
  console.warn('⚠️ Click listener already added - skipping duplicate (HMR protection)');
}

// Game loop
// Periodically check wallet DOT balance (non-blocking)
function checkWalletBalance() {
  const walletState = walletService.getState();
  if (walletState.isConnected && walletState.address) {
    const now = Date.now();
    if (now - lastBalanceCheck > BALANCE_CHECK_INTERVAL) {
      lastBalanceCheck = now;
      // Check balance asynchronously (don't await - non-blocking)
      walletService.getTokenBalance(DOT_TOKEN_ADDRESS)
        .then((balance) => {
          if (balance !== null) {
            walletDotBalance = balance;
            console.log('Wallet DOT balance updated:', balance);
          }
        })
        .catch((error) => {
          console.error('Failed to check wallet balance:', error);
        });
    }
  } else {
    walletDotBalance = null;
  }
}

function gameLoop() {
  // Profile: Update max stats periodically
  profileManager.updateMaxStats(dotMaxHP, dotMaxArmor);
  
  // Update death animations
  for (const [playerId, particles] of deathAnimations.entries()) {
    const aliveParticles: DeathParticle[] = [];
    
    for (const particle of particles) {
      // Update particle position
      particle.x += particle.vx;
      particle.y += particle.vy;
      
      // Apply gravity
      particle.vy += 0.1;
      
      // Update rotation
      particle.rotation += particle.rotationSpeed;
      
      // Decrease life
      particle.life -= 16; // ~60 FPS, decrease by ~16ms per frame
      
      // Keep particle if still alive
      if (particle.life > 0) {
        aliveParticles.push(particle);
      }
    }
    
    // Remove animation if all particles are dead
    if (aliveParticles.length === 0) {
      deathAnimations.delete(playerId);
      
      // Remove dead player from game - they will only reappear in a new game
      if (pvpPlayers[playerId]) {
        delete pvpPlayers[playerId];
      }
    } else {
      deathAnimations.set(playerId, aliveParticles);
    }
  }
  
  // Track frame time (to detect frame pacing issues) - measure entire gameLoop
  const frameStartTime = performance.now();
  
  currentFrame++;
  
  // Clean up cached player speeds periodically (every 1000 frames to reduce overhead)
  if (currentFrame % 1000 === 0) {
    cleanupCachedPlayerSpeeds();
  }
  
  // Check wallet balance periodically (non-blocking)
  checkWalletBalance();
  
  // PvP/Training mode: Update bullet physics and collision
  if ((gameMode === 'PvP' || gameMode === 'Training') && bulletFlying) {
    // Update bullet position
    bulletX += bulletVx;
    bulletY += bulletVy;
    
    // Check lifetime
    const bulletAge = Date.now() - bulletSpawnTime;
    if (bulletAge > bulletLifetime) {
      bulletFlying = false;
      bulletX = 0;
      bulletY = 0;
      bulletVx = 0;
      bulletVy = 0;
    }
    
    // Check collision with opponent
    // Make sure we're hitting the opponent, not ourselves
    if (!opponentId || !pvpPlayers[opponentId] || opponentId === myPlayerId) {
      // Skip if no opponent or opponent is ourselves
    } else {
      const opponent = pvpPlayers[opponentId];
      const dx = bulletX - opponent.x;
      const dy = bulletY - opponent.y;
      const distanceSquared = dx * dx + dy * dy;
      const collisionRadius = bulletRadius + opponent.radius;
      const collisionRadiusSquared = collisionRadius * collisionRadius;
      
      if (distanceSquared <= collisionRadiusSquared) {
        // Double check - make sure opponent is not ourselves
        if (opponent.id === myPlayerId) {
          console.error('ERROR: Trying to damage ourselves with bullet!', { opponentId, myPlayerId, opponent: opponent.id });
          return;
        }
        
        // Hit opponent!
        bulletFlying = false;
        bulletX = 0;
        bulletY = 0;
        bulletVx = 0;
        bulletVy = 0;
        
        // Check for crit hit - with NFT bonuses
        const nftBonuses = calculateNftBonuses();
        const totalCritChance = critChance + nftBonuses.critChance;
        const isCritHit = Math.random() < totalCritChance / 100;
        // Damage: 50% of basic damage, 2x crit (using MY stats + NFT bonuses)
        const totalDmg = dmg + nftBonuses.dmg;
        const baseBulletDamage = totalDmg * 0.5; // 50% of base damage
        const bulletDamageWithCrit = isCritHit ? baseBulletDamage * 2 : baseBulletDamage;
        // Apply 50% variance (damage ranges from 50% to 100%)
        const bulletDamage = applyDamageVariance(bulletDamageWithCrit);
        
        // Profile: Track damage dealt (PvP mode - Bullet)
        profileManager.addDamageDealt(bulletDamage);
        
        // Send hit event to opponent with damage (so they see/feel the EXACT same damage)
        // Opponent will apply damage when they receive the hit event
        const useColyseus = colyseusService.isConnectedToRoom();
        const isSyncing = useColyseus || pvpSyncService.isSyncing();
        if (currentMatch && isSyncing && opponentId) {
          const hitInput = {
            type: 'hit' as const,
            timestamp: Date.now(),
            damage: bulletDamage,
            isCrit: isCritHit,
            targetPlayerId: opponentId, // Tell opponent this hit is for them
            isBullet: true, // Indicate this is a bullet hit (for paralysis)
            paralysisDuration: 2000 // 2 seconds paralysis
          };
          
          if (useColyseus) {
            colyseusService.sendInput(hitInput);
          } else {
            pvpSyncService.sendInput(hitInput);
          }
        }
        
        // DON'T apply damage locally - opponent will apply it when they receive hit event
        // This ensures both players see/feel the EXACT same damage
        
        // DON'T apply paralysis locally - opponent will apply it when they receive hit event
        // This ensures both players have the same paralysis timing
        
        // Screen shake for crit hits (we feel it when we hit)
        if (isCritHit) {
          screenShake = Math.max(screenShake, 30);
        }
        
        // Show damage number (we see it when we hit)
        safePushDamageNumber({
          x: opponent.x + (Math.random() - 0.5) * 40,
          y: opponent.y - 20,
          value: bulletDamage,
          life: 60,
          maxLife: 60,
          vx: (Math.random() - 0.5) * 2,
          vy: -2 - Math.random() * 2,
          isCrit: isCritHit
        });
        
        // No push effect - bullet doesn't move target (like arrow/projectile)
        
        console.log(`Bullet hit opponent! Damage: ${bulletDamage}, Crit: ${isCritHit}, Paralyzed for 2s`);
      }
    }
    
    // Check if bullet is out of bounds
    if (bulletX < pvpBounds.left || bulletX > pvpBounds.right || bulletY < pvpBounds.top || bulletY > pvpBounds.bottom) {
      bulletFlying = false;
      bulletX = 0;
      bulletY = 0;
      bulletVx = 0;
      bulletVy = 0;
    }
  }
  
  // PvP mode: Update opponent bullet physics and collision
  if (gameMode === 'PvP' && opponentBulletFlying && myPlayerId && pvpPlayers[myPlayerId]) {
    // Update opponent bullet position
    opponentBulletX += opponentBulletVx;
    opponentBulletY += opponentBulletVy;
    
    // Check lifetime
    const bulletAge = Date.now() - opponentBulletSpawnTime;
    if (bulletAge > bulletLifetime) {
      opponentBulletFlying = false;
      opponentBulletX = 0;
      opponentBulletY = 0;
      opponentBulletVx = 0;
      opponentBulletVy = 0;
    }
    
    // Check collision with my player
    const myPlayer = pvpPlayers[myPlayerId];
    const dx = opponentBulletX - myPlayer.x;
    const dy = opponentBulletY - myPlayer.y;
    const distanceSquared = dx * dx + dy * dy;
    const collisionRadius = bulletRadius + myPlayer.radius;
    const collisionRadiusSquared = collisionRadius * collisionRadius;
    
    if (distanceSquared <= collisionRadiusSquared) {
      // Hit me!
      opponentBulletFlying = false;
      opponentBulletX = 0;
      opponentBulletY = 0;
      opponentBulletVx = 0;
      opponentBulletVy = 0;
      
      // DON'T calculate damage locally - opponent will send hit event with their calculated damage
      // This prevents using wrong stats (our stats instead of opponent's stats)
      // Opponent will send hit event when their bullet hits us
      
      // Just remove the bullet - damage will be applied when we receive hit event
      console.log('Opponent bullet hit me - waiting for hit event from opponent');
    }
    
    // Check if bullet is out of bounds
    if (opponentBulletX < pvpBounds.left || opponentBulletX > pvpBounds.right || opponentBulletY < pvpBounds.top || opponentBulletY > pvpBounds.bottom) {
      opponentBulletFlying = false;
      opponentBulletX = 0;
      opponentBulletY = 0;
      opponentBulletVx = 0;
      opponentBulletVy = 0;
    }
  }
  
  // Update death animation
  if (gameState === 'Dying' && deathAnimation) {
    deathTimer += 16; // Assuming 60 FPS
    
    // Grant reward when death animation reaches 10% (100ms out of 1000ms)
    if (deathTimer >= 100 && !rewardGranted) {
      grantDeathReward();
    }
    
    if (deathTimer >= 1000) { // 1 second death animation (kept original)
      // Death animation finished, start respawn delay
      gameState = 'Dead';
      deathAnimation = false;
      respawnTimer = 0; // Start respawn timer
      rewardGranted = false; // Reset for next death
      console.log('DOT death animation finished, waiting for respawn...');
    }
  }
  
  // Update respawn delay
  if (gameState === 'Dead') {
    respawnTimer += 16; // Assuming 60 FPS
    
    if (respawnTimer >= 2000) { // 2 seconds delay after death animation
      // Respawn
      dotMaxHP = Math.round(dotMaxHP * 1.25);
      dotMaxArmor = Math.round(dotMaxArmor * 1.2);
      dotHP = dotMaxHP;
      dotArmor = dotMaxArmor;
      gameState = 'Alive';
      forceSaveGame(); // Save after respawn (HP/Armor increase)
      respawnTimer = 0;
      // Reset DOT position and physics
      dotX = 240 + (1920 - 240) / 2;
      dotY = 1080 / 2;
      dotVx = 0;
      dotVy = 0;
      lastHitTime = 0; // Reset hit time
      // Reset combo on respawn
      comboProgress = 0;
      comboActive = false;
      comboMultiplier = 1;
      gravityLocked = true; // gravity disabled until first successful hit
      nextHitForceCrit = false; // clear pending force-crit on respawn
      
      // Reset slow-motion on respawn
      slowMotionActive = false;
      mouseHoldStartTime = 0;
      savedDotVx = 0;
      savedDotVy = 0;
      
      // Reset arrow on respawn - arrow becomes available again after DOT dies
      arrowReady = false;
      arrowFired = false;
      
      console.log('DOT respawned!');
    }
  }
  
  // Solo mode: DOT physics (only when alive)
  if (gameMode === 'Solo' && gameState === 'Alive') {
    // Check if mouse has been held for 1 second to auto-activate slow-motion (without releasing)
    if (mouseHoldStartTime > 0 && !slowMotionActive) {
      const holdTime = Date.now() - mouseHoldStartTime;
      if (holdTime >= slowMotionHoldDelay) {
        // Auto-activate slow-motion after 1 second of holding
        slowMotionActive = true;
        slowMotionStartTime = Date.now();
        // Save current velocity before freeze
        savedDotVx = dotVx;
        savedDotVy = dotVy;
        // Freeze DOT (set velocity to 0)
        dotVx = 0;
        dotVy = 0;
        console.log('Slow-motion auto-activated after 1 second hold!');
      }
    }
    
    // Handle slow-motion effect (when mouse is held and reaches 1 second)
    if (slowMotionActive) {
      const now = Date.now();
      const timeSinceSlowMotionStart = now - slowMotionStartTime;
      
      if (timeSinceSlowMotionStart < slowMotionFreezeDuration) {
        // Freeze phase (0.3 seconds) - DOT is completely stopped
        dotVx = 0;
        dotVy = 0;
      } else {
        // Slow-motion finished - immediately restore full speed and normal physics
        dotVx = savedDotVx;
        dotVy = savedDotVy;
        slowMotionActive = false;
        savedDotVx = 0;
        savedDotVy = 0;
        mouseHoldStartTime = 0; // Reset hold tracking when slow-motion ends
      }
    }
    
    // Apply gravity only if not in slow-motion freeze
    if (!slowMotionActive) {
      const timeSinceLastHit = Date.now() - lastHitTime;
      if (!gravityLocked && timeSinceLastHit >= gravityDelay) {
        dotVy += gravity;
      }
    }
    
    // Update position
    dotX += dotVx;
    dotY += dotVy;

    // Drawn lines collision (pencil tool - check all segments)
    {
      for (let i = drawnLines.length - 1; i >= 0; i--) {
        const line = drawnLines[i];
        if (line.points.length < 2) continue; // Skip degenerate lines
        
        let collisionFound = false;
        
        // Check collision with each segment
        for (let j = 0; j < line.points.length - 1; j++) {
          const p1 = line.points[j];
          const p2 = line.points[j + 1];
          
            // Line segment collision detection - OPTIMIZED: Cache len calculation
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const lenSquared = dx * dx + dy * dy;
            if (lenSquared < 0.01) continue; // Skip degenerate segments (0.1^2 = 0.01)
            const len = Math.sqrt(lenSquared);
            
            // Distance from DOT center to line segment - OPTIMIZED: Use squared distance
            const t = Math.max(0, Math.min(1, ((dotX - p1.x) * dx + (dotY - p1.y) * dy) / lenSquared));
            const closestX = p1.x + t * dx;
            const closestY = p1.y + t * dy;
            const distX = dotX - closestX;
            const distY = dotY - closestY;
            const distanceSquared = distX * distX + distY * distY;
            const distance = Math.sqrt(distanceSquared);
          
            // Collision if DOT is close to line and moving towards it - OPTIMIZED: Use squared distance
            const lineThickness = 3;
            const collisionRadius = dotRadius + lineThickness / 2;
            const collisionRadiusSquared = collisionRadius * collisionRadius;
            if (distanceSquared <= collisionRadiusSquared && dotVy > 0) {
            // Calculate normal to line (perpendicular)
            const nx = -dy / len;
            const ny = dx / len;
            
            // Reflect velocity off line
            const dot = dotVx * nx + dotVy * ny;
            dotVx -= 2 * dot * nx;
            dotVy -= 2 * dot * ny;
            
            // Push DOT away from line
            const pushDist = (dotRadius + lineThickness / 2) - distance;
            dotX += nx * pushDist;
            dotY += ny * pushDist;
            
            // Bounce effect
            dotVy = -Math.max(2, Math.abs(dotVy) * 0.6 + 3);
            screenShake = Math.max(screenShake, 6);
            
            collisionFound = true;
            break; // Only handle first collision
          }
        }
        
        if (collisionFound) {
          // Increment hit counter for this line
          line.hits++;
          
          // Remove line only after 2 hits
          if (line.hits >= line.maxHits) {
            drawnLines.splice(i, 1);
          }
          
          // Update combo progress on line bounce
          comboProgress = Math.min(100, comboProgress + 10); // Each line bounce adds 10%
          
          // If combo just reached 100%, immediately deal a one-time 4x bonus damage and reset combo
          if (comboProgress >= 100 && !comboActive) {
            const bonusDamage = Math.floor(dmg * 4);
            const absorbedB = Math.min(bonusDamage, dotArmor);
            dotArmor -= absorbedB;
            const remainingB = bonusDamage - absorbedB;
            dotHP = Math.max(0, dotHP - remainingB);
            safePushDamageNumber({
              x: dotX + (Math.random() - 0.5) * 40,
              y: dotY - 28,
              value: bonusDamage,
              life: 60,
              maxLife: 60,
              vx: (Math.random() - 0.5) * 2,
              vy: -2 - Math.random() * 2,
              isCrit: true
            });
            screenShake = Math.max(screenShake, 30);
            // Reset combo
            comboProgress = 0;
            comboActive = false;
            comboMultiplier = 1;
            
            // Check death after combo 4x damage (line bounce)
            if (dotHP <= 0) {
              gameState = 'Dying';
              deathAnimation = true;
              deathTimer = 0;
              respawnTimer = 0;
              awaitingRestart = false;
              rewardGranted = false;
              deathStartX = dotX;
              deathStartY = dotY;
              
              // Leveling system: increment kill counter
              killsInCurrentLevel++;
              console.log(`Kills in level ${currentLevel}: ${killsInCurrentLevel}/${killsNeededPerLevel}`);
              
              if (killsInCurrentLevel >= killsNeededPerLevel) {
                killsInCurrentLevel = 0;
                if (maxUnlockedLevel === currentLevel) {
                  maxUnlockedLevel = currentLevel + 1;
                  console.log(`Level ${maxUnlockedLevel} unlocked!`);
                  forceSaveGame(); // Save after level unlock
                }
              }
              
              console.log('DOT is dying! (combo 4x damage from line)');
            }
          }
          
          // Speed >= 7 bonus damage (same as platform) - OPTIMIZED: Use cached speed
          if (cachedDotSpeedFrame !== currentFrame) {
            cachedDotSpeedSquared = dotVx * dotVx + dotVy * dotVy;
            cachedDotSpeed = Math.sqrt(cachedDotSpeedSquared);
            cachedDotSpeedFrame = currentFrame;
          }
          if (Math.round(cachedDotSpeed) >= 7) {
            nextHitForceCrit = true;
            nextHitForceCritExpiresAt = Date.now() + 1500;
            const bonusDamage = dmg * 2;
            const absorbed = Math.min(bonusDamage, dotArmor);
            dotArmor -= absorbed;
            const remainingDamage = bonusDamage - absorbed;
            dotHP = Math.max(0, dotHP - remainingDamage);
            safePushDamageNumber({
              x: dotX + (Math.random() - 0.5) * 40,
              y: dotY - 20,
              value: bonusDamage,
              life: 60,
              maxLife: 60,
              vx: (Math.random() - 0.5) * 2,
              vy: -2 - Math.random() * 2,
              isCrit: true
            });
            screenShake = Math.max(screenShake, 14);
              if (dotHP <= 0) {
                gameState = 'Dying';
                deathAnimation = true;
                deathTimer = 0;
                respawnTimer = 0;
                awaitingRestart = false;
                rewardGranted = false; // Reset reward flag for new death
                deathStartX = dotX; // Save death position
                deathStartY = dotY; // Save death position
                
                // Leveling system: increment kill counter
                killsInCurrentLevel++;
                console.log(`Kills in level ${currentLevel}: ${killsInCurrentLevel}/${killsNeededPerLevel}`);
                
                // If reached kills needed, unlock next level
                if (killsInCurrentLevel >= killsNeededPerLevel) {
                  killsInCurrentLevel = 0; // Reset counter
                  if (maxUnlockedLevel === currentLevel) {
                    maxUnlockedLevel = currentLevel + 1;
                    console.log(`Level ${maxUnlockedLevel} unlocked!`);
                  }
                }
                
                // Don't grant reward yet - wait for 10% of death animation
                console.log('DOT is dying! (line bonus dmg)');
              }
          }
        }
      }
    }

    // Moving platform collision (straight platform)
    {
      const halfW = movingPlatformWidth / 2;
      const surfaceY = movingPlatformY; // straight top surface
      if (dotX >= movingPlatformX - halfW - dotRadius && dotX <= movingPlatformX + halfW + dotRadius) {
        if (dotY + dotRadius >= surfaceY && dotVy > 0) {
          dotY = surfaceY - dotRadius;
          dotVy = -Math.max(2, Math.abs(dotVy) * 0.6 + 3);
          // Slight horizontal deflection
          const localX = dotX - movingPlatformX;
          dotVx += (localX / halfW) * 1.2;
          movingPlatformFlashTimer = 6;
          screenShake = Math.max(screenShake, 6);
          
          // Update combo progress on platform bounce
          comboProgress = Math.min(100, comboProgress + 10); // Each platform bounce adds 10%
          
          // If combo just reached 100%, immediately deal a one-time 4x bonus damage and reset combo
          if (comboProgress >= 100 && !comboActive) {
            const bonusDamage = Math.floor(dmg * 4);
            const absorbedB = Math.min(bonusDamage, dotArmor);
            dotArmor -= absorbedB;
            const remainingB = bonusDamage - absorbedB;
            dotHP = Math.max(0, dotHP - remainingB);
            safePushDamageNumber({
              x: dotX + (Math.random() - 0.5) * 40,
              y: dotY - 28,
              value: bonusDamage,
              life: 60,
              maxLife: 60,
              vx: (Math.random() - 0.5) * 2,
              vy: -2 - Math.random() * 2,
              isCrit: true
            });
            screenShake = Math.max(screenShake, 30);
            // Reset combo
            comboProgress = 0;
            comboActive = false;
            comboMultiplier = 1;
            
            // Check death after combo 4x damage (platform bounce)
            if (dotHP <= 0) {
              gameState = 'Dying';
              deathAnimation = true;
              deathTimer = 0;
              respawnTimer = 0;
              awaitingRestart = false;
              rewardGranted = false;
              deathStartX = dotX;
              deathStartY = dotY;
              
              // Leveling system: increment kill counter
              killsInCurrentLevel++;
              console.log(`Kills in level ${currentLevel}: ${killsInCurrentLevel}/${killsNeededPerLevel}`);
              
              if (killsInCurrentLevel >= killsNeededPerLevel) {
                killsInCurrentLevel = 0;
                if (maxUnlockedLevel === currentLevel) {
                  maxUnlockedLevel = currentLevel + 1;
                  console.log(`Level ${maxUnlockedLevel} unlocked!`);
                  forceSaveGame(); // Save after level unlock
                }
              }
              
              console.log('DOT is dying! (combo 4x damage from platform)');
            }
          }
          
          // If current speed is >=7, award a force-crit for next hit and bonus damage - OPTIMIZED: Use cached speed
          if (cachedDotSpeedFrame !== currentFrame) {
            cachedDotSpeedSquared = dotVx * dotVx + dotVy * dotVy;
            cachedDotSpeed = Math.sqrt(cachedDotSpeedSquared);
            cachedDotSpeedFrame = currentFrame;
          }
          if (Math.round(cachedDotSpeed) >= 7) {
            nextHitForceCrit = true;
            nextHitForceCritExpiresAt = Date.now() + 1500;
            // Immediate bonus damage as 2x (crit-like) without clicking
            {
              const bonusDamage = dmg * 2;
              const absorbed = Math.min(bonusDamage, dotArmor);
              dotArmor -= absorbed;
              const remainingDamage = bonusDamage - absorbed;
              dotHP = Math.max(0, dotHP - remainingDamage);
              safePushDamageNumber({
                x: dotX + (Math.random() - 0.5) * 40,
                y: dotY - 20,
                value: bonusDamage,
                life: 60,
                maxLife: 60,
                vx: (Math.random() - 0.5) * 2,
                vy: -2 - Math.random() * 2,
                isCrit: true
              });
              screenShake = Math.max(screenShake, 14);
              if (dotHP <= 0) {
                gameState = 'Dying';
                deathAnimation = true;
                deathTimer = 0;
                respawnTimer = 0;
                awaitingRestart = false;
                rewardGranted = false; // Reset reward flag for new death
                deathStartX = dotX; // Save death position
                deathStartY = dotY; // Save death position
                
                // Leveling system: increment kill counter
                killsInCurrentLevel++;
                console.log(`Kills in level ${currentLevel}: ${killsInCurrentLevel}/${killsNeededPerLevel}`);
                
                // If reached kills needed, unlock next level
                if (killsInCurrentLevel >= killsNeededPerLevel) {
                  killsInCurrentLevel = 0; // Reset counter
                  if (maxUnlockedLevel === currentLevel) {
                    maxUnlockedLevel = currentLevel + 1;
                    console.log(`Level ${maxUnlockedLevel} unlocked!`);
                  }
                }
                
                // Don't grant reward yet - wait for 10% of death animation
                console.log('DOT is dying! (platform bonus dmg)');
              }
            }
          }
        }
      }
    }
    
    // Bottom floor collision (100px below moving platform) - DOT lands but doesn't bounce
    const bottomFloorY = movingPlatformY + 100; // 100px below platform
    if (dotY + dotRadius >= bottomFloorY && dotVy >= 0) {
      // DOT lands on bottom floor - stop falling but allow horizontal movement
      dotY = bottomFloorY - dotRadius;
      dotVy = 0; // Stop falling (no bounce)
      dotVx *= 0.95; // Light friction (can still move horizontally)
    }
    
    // Ground collision (invisible ground at 150px from bottom) - only if not on bottom floor
    if (dotY < bottomFloorY - dotRadius && dotY >= groundY) {
      dotY = groundY;
      dotVy = 0; // Stop falling
      dotVx *= 0.8; // Friction
      
      // Only handle combo reset and restart scheduling if still Alive (not during Dying)
      if (gameState === 'Alive') {
        // Reset combo when DOT hits ground
        if (comboProgress > 0) {
          comboProgress = 0;
          comboActive = false;
          comboMultiplier = 1;
          console.log('Combo reset - DOT hit ground!');
        }
        // Schedule restart after 2 seconds if not already scheduled
        if (!awaitingRestart) {
          awaitingRestart = true;
          scheduledRestartAt = Date.now() + 2000;
          groundShrinkStartAt = Date.now();
          gravityLocked = true; // lock gravity during awaiting restart
        }
      }
    }
    
    // Check if DOT goes out of bounds (without bouncing) - triggers restart without reward
    const isOutOfBounds = dotX < 240 || dotX > 1920 || dotY < 0 || dotY > 1080;
    if (isOutOfBounds && !awaitingRestart) {
      // DOT went out of bounds - restart without reward (no death animation)
      awaitingRestart = true;
      scheduledRestartAt = Date.now() + 500; // Quick restart (0.5 seconds)
      groundShrinkStartAt = Date.now();
      gravityLocked = true;
      
      // Reset arrow when DOT goes out of bounds
      arrowReady = false;
      arrowFired = false;
      katanaFlying = false;
      katanaVx = 0;
      katanaVy = 0;
      katanaSlashing = false;
      
      console.log('DOT out of bounds - restarting without reward');
    }
    
    // Side walls collision (keep DOT in play area) - only if not out of bounds
    if (!isOutOfBounds) {
      if (dotX < 240 + dotRadius) {
        dotX = 240 + dotRadius;
        dotVx = -dotVx * 0.8; // Bounce with friction
      }
      if (dotX > 1920 - dotRadius) {
        dotX = 1920 - dotRadius;
        dotVx = -dotVx * 0.8; // Bounce with friction
      }
      
      // Top wall collision
      if (dotY < dotRadius) {
        dotY = dotRadius;
        dotVy = -dotVy * 0.8; // Bounce with friction
      }
    }
    
    // Apply air resistance
    dotVx *= 0.995;
    dotVy *= 0.995;
  }
  
  // PvP/Training mode: Physics update for all players (copied from Solo DOT physics)
  if (gameMode === 'PvP' || gameMode === 'Training') {
    for (const playerId in pvpPlayers) {
      const player = pvpPlayers[playerId];
      
      // Skip physics update if player is dead (isOut, hp <= 0, or death animation playing)
      const isDead = player.isOut || player.hp <= 0 || deathAnimations.has(playerId);
      if (isDead) {
        // Stop all movement when dead
        player.vx = 0;
        player.vy = 0;
        continue; // Skip physics update for dead player
      }
      
      // Skip movement if paralyzed (stuck on spike)
      const isParalyzed = player.paralyzedUntil > Date.now();
      if (isParalyzed) {
        // Still apply gravity and air resistance, but don't allow movement input
        const timeSinceLastHit = Date.now() - player.lastHitTime;
        if (!player.gravityLocked && timeSinceLastHit >= gravityDelay) {
          player.vy += pvpGravity;
        }
        player.x += player.vx;
        player.y += player.vy;
        // Apply air resistance
        player.vx *= 0.995;
        player.vy *= 0.995;
        continue; // Skip rest of physics update (no input handling)
      }
      
      // Apply gravity only if not locked and after delay (same as Solo)
      const timeSinceLastHit = Date.now() - player.lastHitTime;
      if (!player.gravityLocked && timeSinceLastHit >= gravityDelay) {
        player.vy += pvpGravity;
      }
      
      // Update position
      player.x += player.vx;
      player.y += player.vy;
      
      // Check if player is out of bounds (any side)
      const isOutOfBounds = player.x < pvpBounds.left || 
                            player.x > pvpBounds.right || 
                            player.y < pvpBounds.top || 
                            player.y > pvpBounds.bottom;
      
      const now = Date.now();
      
      if (isOutOfBounds) {
        // Player is out of bounds
        if (player.outOfBoundsStartTime === null) {
          // First time going out of bounds - deal immediate -1 HP damage
          player.outOfBoundsStartTime = now;
          player.lastOutOfBoundsDamageTime = now;
          
          // Deal -1 HP damage
          player.hp = Math.max(0, player.hp - 1);
          
          // Show damage number
          safePushDamageNumber({
            x: player.x + (Math.random() - 0.5) * 40,
            y: player.y - 20,
            value: 1,
            life: 60,
            maxLife: 60,
            vx: (Math.random() - 0.5) * 2,
            vy: -2 - Math.random() * 2,
            isCrit: false
          });
          
          console.log(`PvP: Player ${playerId} went out of bounds - -1 HP. HP: ${player.hp}/${player.maxHP}`);
          
          // Check if player is dead - start death animation
          if (player.hp <= 0 && !player.isOut && !deathAnimations.has(playerId)) {
            player.isOut = true;
            
            // Determine player color for death animation
            let playerColor = '#000000';
            if (playerId === myPlayerId) {
              playerColor = '#000000';
            } else if (playerId === opponentId && opponentId) {
              playerColor = '#000000';
            } else {
              playerColor = player.color;
            }
            
            // Start death animation
            createDeathAnimation(playerId, player.x, player.y, playerColor, player.radius);
          }
        } else {
          // Already out of bounds - check if 1 second has passed since last damage
          const timeSinceLastDamage = now - player.lastOutOfBoundsDamageTime;
          if (timeSinceLastDamage >= 1000) { // 1 second = 1000ms
            // Deal -1 HP damage every second
            player.lastOutOfBoundsDamageTime = now;
            
            // Deal -1 HP damage
            player.hp = Math.max(0, player.hp - 1);
            
            // Show damage number
            safePushDamageNumber({
              x: player.x + (Math.random() - 0.5) * 40,
              y: player.y - 20,
              value: 1,
              life: 60,
              maxLife: 60,
              vx: (Math.random() - 0.5) * 2,
              vy: -2 - Math.random() * 2,
              isCrit: false
            });
            
            console.log(`PvP: Player ${playerId} still out of bounds - -1 HP per second. HP: ${player.hp}/${player.maxHP}`);
            
            // Check if player is dead - start death animation if not already started
            if (player.hp <= 0 && !player.isOut && !deathAnimations.has(playerId)) {
              player.isOut = true;
              
              // Determine player color for death animation
              let playerColor = '#000000';
              if (playerId === myPlayerId) {
                playerColor = '#000000';
              } else if (playerId === opponentId && opponentId) {
                playerColor = '#000000';
              } else {
                playerColor = player.color;
              }
              
              // Start death animation
              createDeathAnimation(playerId, player.x, player.y, playerColor, player.radius);
              
              console.log(`PvP: Player ${playerId} died from water damage - started death animation`);
            } else if (player.hp <= 0) {
              // Already dead, just ensure isOut is set
              player.isOut = true;
            }
          }
        }
      } else {
        // Player is back in safe area - reset out of bounds tracking
        if (player.outOfBoundsStartTime !== null) {
          player.outOfBoundsStartTime = null;
          player.lastOutOfBoundsDamageTime = 0;
          console.log(`PvP: Player ${playerId} returned to safe area`);
        }
      }
      
      // Bottom floor collision (100px below moving platform) - player lands but doesn't bounce
      const bottomFloorY = movingPlatformY + 100; // 100px below platform
      const wallTopY = movingPlatformY; // Start from platform level
      const wallBottomY = bottomFloorY; // End at bottom floor
      
      if (player.y + player.radius >= bottomFloorY && player.vy >= 0) {
        // Player lands on bottom floor - stop falling but allow horizontal movement
        player.y = bottomFloorY - player.radius;
        player.vy = 0; // Stop falling (no bounce)
        player.vx *= 0.95; // Light friction (can still move horizontally)
      }
      
      // Ground collision (same as Solo) - only if in bounds and not on bottom floor
      if (!isOutOfBounds && player.y < bottomFloorY - player.radius && player.y >= pvpBounds.bottom) {
        player.y = pvpBounds.bottom;
        player.vy = 0; // Stop falling
        player.vx *= 0.8; // Friction
      }
      
      // Side walls collision with extended walls (from platform to bottom floor)
      const wallThickness = 5; // Wall thickness
      
      // Check if player is in the wall zone (between platform and bottom floor)
      const isInWallZone = player.y >= wallTopY && player.y <= wallBottomY;
      
      // Track if player is stuck on a spike (for paralysis)
      let isStuckOnSpike = false;
      
      if (isInWallZone) {
        // Check collision with wall spikes first
        for (const spike of wallSpikes) {
          // Only check spikes that are extended or extending
          if (spike.state === 'retracted' || spike.state === 'retracting') continue;
          
          const spikeCurrentLength = spike.length * spike.progress;
          if (spikeCurrentLength <= 0) continue;
          
          // Check if player is touching this spike
          const spikeX = spike.side === 'left' ? playLeft : playRight;
          const spikeTopY = spike.y - spike.width / 2;
          const spikeBottomY = spike.y + spike.width / 2;
          
          // Check if player is in spike's vertical range
          if (player.y + player.radius >= spikeTopY && player.y - player.radius <= spikeBottomY) {
            // Check if player is touching spike horizontally
            if (spike.side === 'left') {
              if (player.x - player.radius <= spikeX + spikeCurrentLength && player.x - player.radius >= spikeX) {
                // Player is touching left spike
                isStuckOnSpike = true;
                
                // Apply paralysis (can't move while stuck)
                player.paralyzedUntil = Date.now() + 1000; // 1 second paralysis
                
                // Apply damage (5% of max HP) with cooldown
                const now = Date.now();
                const lastDamage = spike.lastDamageTime[playerId] || 0;
                if (now - lastDamage >= SPIKE_DAMAGE_COOLDOWN) {
                  const damage = Math.ceil(player.maxHP * (spike.damagePercent / 100));
                  const absorbed = Math.min(damage, player.armor);
                  player.armor -= absorbed;
                  const remainingDamage = damage - absorbed;
                  player.hp = Math.max(0, player.hp - remainingDamage);
                  
                  spike.lastDamageTime[playerId] = now;
                  
                  // Show damage number
                  safePushDamageNumber({
                    x: player.x + (Math.random() - 0.5) * 40,
                    y: player.y - 20,
                    value: damage,
                    life: 60,
                    maxLife: 60,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -2 - Math.random() * 2,
                    isCrit: false
                  });
                  
                  console.log(`PvP: Player ${playerId} hit by left spike - ${damage} damage. HP: ${player.hp}/${player.maxHP}`);
                }
                
                // Push player away from spike
                player.x = spikeX + spikeCurrentLength + player.radius;
                player.vx = 0; // Stop horizontal movement
              }
            } else {
              // Right spike
              if (player.x + player.radius >= spikeX - spikeCurrentLength && player.x + player.radius <= spikeX) {
                // Player is touching right spike
                isStuckOnSpike = true;
                
                // Apply paralysis (can't move while stuck)
                player.paralyzedUntil = Date.now() + 1000; // 1 second paralysis
                
                // Apply damage (5% of max HP) with cooldown
                const now = Date.now();
                const lastDamage = spike.lastDamageTime[playerId] || 0;
                if (now - lastDamage >= SPIKE_DAMAGE_COOLDOWN) {
                  const damage = Math.ceil(player.maxHP * (spike.damagePercent / 100));
                  const absorbed = Math.min(damage, player.armor);
                  player.armor -= absorbed;
                  const remainingDamage = damage - absorbed;
                  player.hp = Math.max(0, player.hp - remainingDamage);
                  
                  spike.lastDamageTime[playerId] = now;
                  
                  // Show damage number
                  safePushDamageNumber({
                    x: player.x + (Math.random() - 0.5) * 40,
                    y: player.y - 20,
                    value: damage,
                    life: 60,
                    maxLife: 60,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -2 - Math.random() * 2,
                    isCrit: false
                  });
                  
                  console.log(`PvP: Player ${playerId} hit by right spike - ${damage} damage. HP: ${player.hp}/${player.maxHP}`);
                }
                
                // Push player away from spike
                player.x = spikeX - spikeCurrentLength - player.radius;
                player.vx = 0; // Stop horizontal movement
              }
            }
          }
        }
        
        // If not stuck on spike, handle normal wall collision
        if (!isStuckOnSpike) {
          // Left wall collision (prevents going through UI panel)
          if (player.x - player.radius < playLeft) {
            player.x = playLeft + player.radius;
            player.vx = -player.vx * 0.8; // Bounce with friction
          }
          // Right wall collision
          if (player.x + player.radius > playRight) {
            player.x = playRight - player.radius;
            player.vx = -player.vx * 0.8; // Bounce with friction
          }
        }
      }
      
      // Side walls collision (same as Solo) - only if in bounds and not in wall zone
      if (!isOutOfBounds && !isInWallZone) {
        if (player.x < pvpBounds.left + player.radius) {
          player.x = pvpBounds.left + player.radius;
          player.vx = -player.vx * 0.8; // Bounce with friction
        }
        if (player.x > pvpBounds.right - player.radius) {
          player.x = pvpBounds.right - player.radius;
          player.vx = -player.vx * 0.8; // Bounce with friction
        }
      }
      
      // Top wall collision (same as Solo) - only if in bounds
      if (!isOutOfBounds) {
        if (player.y < pvpBounds.top + player.radius) {
          player.y = pvpBounds.top + player.radius;
          player.vy = -player.vy * 0.8; // Bounce with friction
        }
      }
      
      // Apply air resistance (same as Solo: 0.995)
      player.vx *= 0.995;
      player.vy *= 0.995;
    }
    
    // Update wall spikes animation (PvP mode only)
    if (gameMode === 'PvP' || gameMode === 'Training') {
      const now = Date.now();
      for (const spike of wallSpikes) {
        const elapsed = now - spike.startTime;
        
        if (spike.state === 'retracted') {
          // Start extending after retracted duration
          if (elapsed >= spike.retractDuration) {
            spike.state = 'extending';
            spike.startTime = now;
            spike.progress = 0;
          }
        } else if (spike.state === 'extending') {
          // Extend over extendDuration
          spike.progress = Math.min(1, elapsed / spike.extendDuration);
          if (spike.progress >= 1) {
            spike.state = 'extended';
            spike.startTime = now;
            spike.progress = 1;
          }
        } else if (spike.state === 'extended') {
          // Stay extended for extendDuration
          if (elapsed >= spike.extendDuration) {
            spike.state = 'retracting';
            spike.startTime = now;
            spike.progress = 1;
          }
        } else if (spike.state === 'retracting') {
          // Retract over retractDuration
          spike.progress = Math.max(0, 1 - (elapsed / spike.retractDuration));
          if (spike.progress <= 0) {
            spike.state = 'retracted';
            spike.startTime = now;
            spike.progress = 0;
            // Clear damage cooldown when spike retracts (player is free)
            spike.lastDamageTime = {};
          }
        }
      }
    }
    
    // PvP/Training mode: Update arrow physics and collision
    if ((gameMode === 'PvP' || gameMode === 'Training') && pvpKatanaFlying && opponentId && pvpPlayers[opponentId]) {
      // Update arrow position
      pvpKatanaX += pvpKatanaVx;
      pvpKatanaY += pvpKatanaVy;
      
      // Check collision with opponent - OPTIMIZED: Use squared distance
      // Make sure we're hitting the opponent, not ourselves
      if (!opponentId || !pvpPlayers[opponentId] || opponentId === myPlayerId) {
        return; // Safety check - don't hit ourselves
      }
      const opponent = pvpPlayers[opponentId];
      const dx = opponent.x - pvpKatanaX;
      const dy = opponent.y - pvpKatanaY;
      const distanceSquared = dx * dx + dy * dy;
      // Reduced hit radius - only arrow head should hit (much smaller collision box)
      const hitRadius = opponent.radius + arrowHeadLength * 0.5; // Only half of arrow head length
      const hitRadiusSquared = hitRadius * hitRadius;
      
      // Hit if arrow tip/body touches opponent
      if (distanceSquared <= hitRadiusSquared) {
        const distance = Math.sqrt(distanceSquared);
        
        // Double check - make sure opponent is not ourselves
        if (opponent.id === myPlayerId) {
          console.error('ERROR: Trying to damage ourselves!', { opponentId, myPlayerId, opponent: opponent.id });
          return;
        }
        
        // Check for crit hit (with NFT bonuses)
        const nftBonuses = calculateNftBonuses();
        const totalCritChance = critChance + nftBonuses.critChance;
        const isCritHit = Math.random() < totalCritChance / 100;
        // Damage: 2x normal, 3x crit (using MY stats + NFT bonuses)
        const totalDmg = dmg + nftBonuses.dmg;
        const baseArrowDamage = isCritHit ? totalDmg * 3 : totalDmg * 2;
        // Apply 50% variance (damage ranges from 50% to 100%)
        const arrowDamage = applyDamageVariance(baseArrowDamage);
        
        // Profile: Track damage dealt (PvP mode - Arrow)
        profileManager.addDamageDealt(arrowDamage);
        
        // Send hit event to opponent with damage (so they see/feel the EXACT same damage)
        // Opponent will apply damage when they receive the hit event
        const useColyseus = colyseusService.isConnectedToRoom();
        const isSyncing = useColyseus || pvpSyncService.isSyncing();
        if (currentMatch && isSyncing && opponentId) {
          const hitInput = {
            type: 'hit' as const,
            timestamp: Date.now(),
            damage: arrowDamage,
            isCrit: isCritHit,
            targetPlayerId: opponentId // Tell opponent this hit is for them
          };
          
          if (useColyseus) {
            colyseusService.sendInput(hitInput);
          } else {
            pvpSyncService.sendInput(hitInput);
          }
        }
        
        // DON'T apply damage locally - opponent will apply it when they receive hit event
        // This ensures both players see/feel the EXACT same damage
        
        // Screen shake for crit hits (we feel it when we hit)
        if (isCritHit) {
          screenShake = Math.max(screenShake, 30);
        }
        
        // Show damage number (we see it when we hit)
        safePushDamageNumber({
          x: opponent.x + (Math.random() - 0.5) * 40,
          y: opponent.y - 20,
          value: arrowDamage,
          life: 60,
          maxLife: 60,
          vx: (Math.random() - 0.5) * 2,
          vy: -2 - Math.random() * 2,
          isCrit: isCritHit
        });
        
        // Create particle effect
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI * 2 * i) / 10;
          const speed = 2 + Math.random() * 3;
          safePushClickParticle({
            x: opponent.x,
            y: opponent.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 30,
            maxLife: 30,
            size: 3 + Math.random() * 2
          });
        }
        
        // Push opponent away with 2 speed in the direction of arrow
        const pushSpeed = 2;
        if (distance > 0) {
          // Normalize direction vector
          const pushDx = dx / distance;
          const pushDy = dy / distance;
          // Apply push force
          opponent.vx += pushDx * pushSpeed;
          opponent.vy += pushDy * pushSpeed;
        }
        
        // Check if opponent is dead - start death animation
        if (opponent.hp <= 0 && !opponent.isOut && !deathAnimations.has(opponentId)) {
          opponent.isOut = true;
          
          // Determine opponent color for death animation
          let opponentColor = '#000000';
          if (opponentId === myPlayerId) {
            opponentColor = '#000000';
          } else if (opponentId === opponentId && opponentId) {
            opponentColor = '#000000';
          } else {
            opponentColor = opponent.color;
          }
          
          // Start death animation
          createDeathAnimation(opponentId, opponent.x, opponent.y, opponentColor, opponent.radius);
        }
        
        // Remove arrow
        pvpKatanaFlying = false;
        pvpArrowFired = false; // Reset fired state after hit
        pvpKatanaX = 0;
        pvpKatanaY = 0;
        pvpKatanaVx = 0;
        pvpKatanaVy = 0;
      }
      
      // Check if arrow is out of bounds
      if (pvpKatanaX < playLeft || pvpKatanaX > playRight || pvpKatanaY < 0 || pvpKatanaY > pvpBounds.bottom) {
        pvpKatanaFlying = false;
        pvpArrowFired = false; // Reset fired state after hit
        pvpKatanaX = 0;
        pvpKatanaY = 0;
        pvpKatanaVx = 0;
        pvpKatanaVy = 0;
      }
    }
    
    // PvP mode: Update opponent arrow physics and collision
    if (gameMode === 'PvP' && opponentArrowFlying && myPlayerId && pvpPlayers[myPlayerId]) {
      // Update opponent arrow position (position is synced from network, but we still update locally for smoothness)
      // Network sync will override this, but this ensures smooth movement between syncs
      opponentArrowX += opponentArrowVx;
      opponentArrowY += opponentArrowVy;
      
      // Check collision with my player - OPTIMIZED: Use squared distance
      const myPlayer = pvpPlayers[myPlayerId];
      const dx = myPlayer.x - opponentArrowX;
      const dy = myPlayer.y - opponentArrowY;
      const distanceSquared = dx * dx + dy * dy;
      // Reduced hit radius - only arrow head should hit (much smaller collision box)
      const hitRadius = myPlayer.radius + arrowHeadLength * 0.5; // Only half of arrow head length
      const hitRadiusSquared = hitRadius * hitRadius;
      
      // Hit if arrow tip/body touches my player
      if (distanceSquared <= hitRadiusSquared) {
        const distance = Math.sqrt(distanceSquared);
        
        // DON'T calculate damage locally - opponent will send hit event with their calculated damage
        // This prevents using wrong stats (our stats instead of opponent's stats)
        // Opponent will send hit event when their arrow hits us
        
        // Create particle effect
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI * 2 * i) / 10;
          const speed = 2 + Math.random() * 3;
          safePushClickParticle({
            x: myPlayer.x,
            y: myPlayer.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 30,
            maxLife: 30,
            size: 3 + Math.random() * 2
          });
        }
        
        // Removed console.log to reduce lag
        // console.log(`Opponent arrow hit me! Damage: ${arrowDamage}, HP: ${myPlayer.hp}/${myPlayer.maxHP}`);
        
        // Push me away with 2 speed in the direction of arrow
        const pushSpeed = 2;
        if (distance > 0) {
          const pushDx = dx / distance;
          const pushDy = dy / distance;
          myPlayer.vx += pushDx * pushSpeed;
          myPlayer.vy += pushDy * pushSpeed;
        }
        
        // Check if I'm dead - start death animation
        if (myPlayer.hp <= 0 && !myPlayer.isOut && !deathAnimations.has(myPlayerId)) {
          myPlayer.isOut = true;
          
          // Determine my player color for death animation
          const myPlayerColor = '#000000'; // Black for my player
          
          // Start death animation
          createDeathAnimation(myPlayerId, myPlayer.x, myPlayer.y, myPlayerColor, myPlayer.radius);
        }
        
        // Remove opponent arrow
        opponentArrowFlying = false;
        opponentArrowX = 0;
        opponentArrowY = 0;
        opponentArrowVx = 0;
        opponentArrowVy = 0;
      }
      
      // Check if opponent arrow is out of bounds
      if (opponentArrowX < playLeft || opponentArrowX > playRight || opponentArrowY < 0 || opponentArrowY > pvpBounds.bottom) {
        opponentArrowFlying = false;
        opponentArrowX = 0;
        opponentArrowY = 0;
        opponentArrowVx = 0;
        opponentArrowVy = 0;
      }
    }
    
    // PvP mode: Update opponent projectile physics (bouncing platform, NOT damage)
    if (gameMode === 'PvP' && opponentProjectileFlying) {
      // Check if opponent projectile lifetime expired (5 seconds)
      const now = Date.now();
      if (now - opponentProjectileSpawnTime >= projectileLifetime) {
        // Opponent projectile expired - remove it (no explosion animation)
        opponentProjectileFlying = false;
        opponentProjectileX = 0;
        opponentProjectileY = 0;
        opponentProjectileVx = 0;
        opponentProjectileVy = 0;
        opponentProjectileBounceCount = 0;
        console.log('Opponent projectile expired after 5 seconds');
      } else if (opponentProjectileBounceCount >= projectileMaxBounces) {
        // Max bounces reached - remove opponent projectile (no explosion animation)
        opponentProjectileFlying = false;
        opponentProjectileX = 0;
        opponentProjectileY = 0;
        opponentProjectileVx = 0;
        opponentProjectileVy = 0;
        opponentProjectileBounceCount = 0;
        console.log('Opponent projectile removed - max bounces reached');
      } else {
        // Update opponent projectile position
        opponentProjectileX += opponentProjectileVx;
        opponentProjectileY += opponentProjectileVy;
        opponentProjectileVy += projectileGravity; // Apply gravity
        
        // Create smoke trail (black smoke particles) - only when falling (positive vy)
        if (opponentProjectileVy > 0) {
          // Add smoke particle from projectile center
          safePushProjectileSmokeParticle({
            x: opponentProjectileX + (Math.random() - 0.5) * 4,
            y: opponentProjectileY + (Math.random() - 0.5) * 4,
            vx: (Math.random() - 0.5) * 0.5, // Slow horizontal drift
            vy: -0.3 - Math.random() * 0.2, // Rises slowly
            life: 30 + Math.random() * 20, // 30-50 frames
            maxLife: 30 + Math.random() * 20,
            size: 4 + Math.random() * 3 // 4-7 pixels
          });
        }
        
        // Opponent projectile collision with players (damage + movement like arrow) - OPTIMIZED: Use squared distance
        // Opponent projectile should only hit me (myPlayerId), not opponent themselves
        if (myPlayerId && pvpPlayers[myPlayerId]) {
          const player = pvpPlayers[myPlayerId];
          const dx = opponentProjectileX - player.x;
          const dy = opponentProjectileY - player.y;
          const distanceSquared = dx * dx + dy * dy;
          const collisionRadius = projectileRadius + player.radius;
          const collisionRadiusSquared = collisionRadius * collisionRadius;
          
          // Check if projectile hits me (damage + push) - only hit myPlayerId, not opponent
          if (distanceSquared <= collisionRadiusSquared) {
            const distance = Math.sqrt(distanceSquared);
            
            // DON'T calculate damage locally - opponent will send hit event with their calculated damage
            // This prevents using wrong stats (our stats instead of opponent's stats)
            // Opponent will send hit event when their projectile hits us
            
            // Push player away with 2 speed in the opposite direction of projectile (projectile hits and pushes back)
            const pushSpeed = 2;
            if (distance > 0) {
              // Normalize direction vector (projectile to player)
              const pushDx = dx / distance;
              const pushDy = dy / distance;
              // Apply push force in OPPOSITE direction (projectile pushes player away)
              player.vx += -pushDx * pushSpeed; // Negative to push away from projectile
              player.vy += -pushDy * pushSpeed; // Negative to push away from projectile
            }
            
            // Remove projectile after hit - damage will be applied when we receive hit event
            opponentProjectileFlying = false;
            opponentProjectileX = 0;
            opponentProjectileY = 0;
            opponentProjectileVx = 0;
            opponentProjectileVy = 0;
            opponentProjectileBounceCount = 0;
            
            console.log('Opponent projectile hit me - waiting for hit event from opponent');
          }
        }
        
        // Check if opponent projectile is out of bounds
        if (opponentProjectileX < playLeft || opponentProjectileX > playRight || opponentProjectileY < 0 || opponentProjectileY > pvpBounds.bottom) {
          // Opponent projectile out of bounds - remove it (no explosion animation)
          opponentProjectileFlying = false;
          opponentProjectileX = 0;
          opponentProjectileY = 0;
          opponentProjectileVx = 0;
          opponentProjectileVy = 0;
          opponentProjectileBounceCount = 0;
        }
      }
    }
    
    // PvP/Training mode: Update projectile physics (bouncing platform, NOT damage)
    if ((gameMode === 'PvP' || gameMode === 'Training') && projectileFlying) {
      // Check if projectile lifetime expired (5 seconds)
      const now = Date.now();
      if (now - projectileSpawnTime >= projectileLifetime) {
        // Projectile expired - remove it (no explosion animation)
        projectileFlying = false;
        projectileX = 0;
        projectileY = 0;
        projectileVx = 0;
        projectileVy = 0;
        projectileBounceCount = 0;
        console.log('Projectile expired after 5 seconds');
      } else if (projectileBounceCount >= projectileMaxBounces) {
        // Max bounces reached - remove projectile (no explosion animation)
        projectileFlying = false;
        projectileX = 0;
        projectileY = 0;
        projectileVx = 0;
        projectileVy = 0;
        projectileBounceCount = 0;
        console.log('Projectile removed - max bounces reached');
      } else {
        // Update projectile position
        projectileX += projectileVx;
        projectileY += projectileVy;
        projectileVy += projectileGravity; // Apply gravity
        
        // Create smoke trail (black smoke particles) - only when falling (positive vy)
        if (projectileVy > 0) {
          // Add smoke particle from projectile center
          safePushProjectileSmokeParticle({
            x: projectileX + (Math.random() - 0.5) * 4,
            y: projectileY + (Math.random() - 0.5) * 4,
            vx: (Math.random() - 0.5) * 0.5, // Slow horizontal drift
            vy: -0.3 - Math.random() * 0.2, // Rises slowly
            life: 30 + Math.random() * 20, // 30-50 frames
            maxLife: 30 + Math.random() * 20,
            size: 4 + Math.random() * 3 // 4-7 pixels
          });
        }
        
        // Projectile collision with players (damage + movement like arrow) - OPTIMIZED: Use squared distance
        for (const playerId in pvpPlayers) {
          const player = pvpPlayers[playerId];
          const dx = projectileX - player.x;
          const dy = projectileY - player.y;
          const distanceSquared = dx * dx + dy * dy;
          const collisionRadius = projectileRadius + player.radius;
          const collisionRadiusSquared = collisionRadius * collisionRadius;
          
          // Check if projectile hits player (damage + push) - only hit opponent, not self
          if (distanceSquared <= collisionRadiusSquared && playerId !== myPlayerId && playerId === opponentId) {
            const distance = Math.sqrt(distanceSquared);
            const opponent = player;
            
            // Check for crit hit - with NFT bonuses
            const nftBonuses = calculateNftBonuses();
            const totalCritChance = critChance + nftBonuses.critChance;
            const isCritHit = Math.random() < totalCritChance / 100;
            // Damage: 2x normal, 3x crit (using MY stats + NFT bonuses)
            const totalDmg = dmg + nftBonuses.dmg;
            const baseProjectileDamage = isCritHit ? totalDmg * 3 : totalDmg * 2;
            // Apply 50% variance (damage ranges from 50% to 100%)
            const projectileDamage = applyDamageVariance(baseProjectileDamage);
            
            // Profile: Track damage dealt (PvP mode - Projectile)
            profileManager.addDamageDealt(projectileDamage);
            
            // Send hit event to opponent with damage (so they see/feel the EXACT same damage)
            // Opponent will apply damage when they receive the hit event
            const useColyseus = colyseusService.isConnectedToRoom();
            const isSyncing = useColyseus || pvpSyncService.isSyncing();
            if (currentMatch && isSyncing && opponentId) {
              const hitInput = {
                type: 'hit' as const,
                timestamp: Date.now(),
                damage: projectileDamage,
                isCrit: isCritHit,
                targetPlayerId: opponentId // Tell opponent this hit is for them
              };
              
              if (useColyseus) {
                colyseusService.sendInput(hitInput);
              } else {
                pvpSyncService.sendInput(hitInput);
              }
            }
            
            // DON'T apply damage locally - opponent will apply it when they receive hit event
            // This ensures both players see/feel the EXACT same damage
            
            // Screen shake for crit hits (we feel it when we hit)
            if (isCritHit) {
              screenShake = Math.max(screenShake, 30);
            }
            
            // Show damage number (we see it when we hit)
            safePushDamageNumber({
              x: opponent.x + (Math.random() - 0.5) * 40,
              y: opponent.y - 20,
              value: projectileDamage,
              life: 60,
              maxLife: 60,
              vx: (Math.random() - 0.5) * 2,
              vy: -2 - Math.random() * 2,
              isCrit: isCritHit
            });
            
            // Create particle effect
            for (let i = 0; i < 10; i++) {
              const angle = (Math.PI * 2 * i) / 10;
              const speed = 2 + Math.random() * 3;
              safePushClickParticle({
                x: opponent.x,
                y: opponent.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 30,
                maxLife: 30,
                size: 3 + Math.random() * 2
              });
            }
            
            // Push player away with 2 speed in the opposite direction of projectile (projectile hits and pushes back)
            const pushSpeed = 2;
            if (distance > 0) {
              // Normalize direction vector (projectile to player)
              const pushDx = dx / distance;
              const pushDy = dy / distance;
              // Apply push force in OPPOSITE direction (projectile pushes player away)
              opponent.vx += -pushDx * pushSpeed; // Negative to push away from projectile
              opponent.vy += -pushDy * pushSpeed; // Negative to push away from projectile
            }
            
            // Remove projectile after hit
            projectileFlying = false;
            projectileX = 0;
            projectileY = 0;
            projectileVx = 0;
            projectileVy = 0;
            projectileBounceCount = 0;
            
            // Cooldown already started when projectile was fired, no need to set again
            console.log(`Projectile hit opponent! Damage: ${projectileDamage}`);
            break; // Only hit one player
          }
        }
        
        // Check if projectile is out of bounds
        if (projectileX < playLeft || projectileX > playRight || projectileY < 0 || projectileY > pvpBounds.bottom) {
          // Projectile out of bounds - remove it (no explosion animation)
          projectileFlying = false;
          projectileX = 0;
          projectileY = 0;
          projectileVx = 0;
          projectileVy = 0;
          projectileBounceCount = 0;
        }
      }
    }
    
    // PvP/Training mode: Update each player's physics (including drawn lines and platform collision)
    if (gameMode === 'PvP' || gameMode === 'Training') {
      for (const playerId in pvpPlayers) {
      const player = pvpPlayers[playerId];
      
      // Drawn lines collision (pencil tool - same as Solo)
      {
        for (let i = drawnLines.length - 1; i >= 0; i--) {
          const line = drawnLines[i];
          if (line.points.length < 2) continue; // Skip degenerate lines
          
          // Only collide with lines that belong to the current player (my lines affect me, opponent's lines affect opponent)
          // If line.ownerId is undefined, it's my line - only affect me
          // If line.ownerId is opponentId, it's opponent's line - only affect opponent
          const isMyLine = line.ownerId === undefined;
          const isOpponentLine = line.ownerId === opponentId;
          
          // Only check collision if this line belongs to the current player being checked
          // My lines only affect me, opponent's lines only affect opponent
          if ((isMyLine && playerId !== myPlayerId) || (isOpponentLine && playerId !== opponentId)) {
            continue; // Skip - this line doesn't belong to the current player
          }
          
          let collisionFound = false;
          
          // Check collision with each segment
          for (let j = 0; j < line.points.length - 1; j++) {
            const p1 = line.points[j];
            const p2 = line.points[j + 1];
            
            // Line segment collision detection - OPTIMIZED: Cache len calculation
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const lenSquared = dx * dx + dy * dy;
            if (lenSquared < 0.01) continue; // Skip degenerate segments (0.1^2 = 0.01)
            const len = Math.sqrt(lenSquared);
            
            // Distance from player center to line segment - OPTIMIZED: Use squared distance
            const t = Math.max(0, Math.min(1, ((player.x - p1.x) * dx + (player.y - p1.y) * dy) / lenSquared));
            const closestX = p1.x + t * dx;
            const closestY = p1.y + t * dy;
            const distX = player.x - closestX;
            const distY = player.y - closestY;
            const distanceSquared = distX * distX + distY * distY;
            const distance = Math.sqrt(distanceSquared);
            
            // Collision if player is close to line and moving towards it - OPTIMIZED: Use squared distance
            const lineThickness = 3;
            const collisionRadius = player.radius + lineThickness / 2;
            const collisionRadiusSquared = collisionRadius * collisionRadius;
            if (distanceSquared <= collisionRadiusSquared && player.vy > 0) {
              // Calculate normal to line (perpendicular)
              const nx = -dy / len;
              const ny = dx / len;
              
              // Reflect velocity off line
              const dot = player.vx * nx + player.vy * ny;
              player.vx -= 2 * dot * nx;
              player.vy -= 2 * dot * ny;
              
              // Push player away from line
              const pushDist = (player.radius + lineThickness / 2) - distance;
              player.x += nx * pushDist;
              player.y += ny * pushDist;
              
              // Bounce effect (same as Solo)
              player.vy = -Math.max(2, Math.abs(player.vy) * 0.6 + 3);
              screenShake = Math.max(screenShake, 6);
              
              collisionFound = true;
              break; // Only handle first collision
            }
          }
          
          if (collisionFound) {
            // Increment hit counter for this line
            line.hits++;
            
            // Remove line only after 2 hits
            if (line.hits >= line.maxHits) {
              drawnLines.splice(i, 1);
            }
          }
        }
      }
      
      // Moving platform collision (same as Solo)
      {
        const halfW = movingPlatformWidth / 2;
        const surfaceY = movingPlatformY; // straight top surface
        if (player.x >= movingPlatformX - halfW - player.radius && player.x <= movingPlatformX + halfW + player.radius) {
          if (player.y + player.radius >= surfaceY && player.vy > 0) {
            player.y = surfaceY - player.radius;
            player.vy = -Math.max(2, Math.abs(player.vy) * 0.6 + 3);
            // Slight horizontal deflection
            const localX = player.x - movingPlatformX;
            player.vx += (localX / halfW) * 1.2;
            movingPlatformFlashTimer = 6;
            screenShake = Math.max(screenShake, 6);
          }
        }
      }
      
      // PvP/Training mode: Collision with left and right platforms
      if (gameMode === 'PvP' || gameMode === 'Training') {
        const surfaceY = movingPlatformY;
        
        // Helper function to check collision with a platform (with custom width)
        const checkPlatformCollision = (platformX: number, width: number) => {
          const halfW = width / 2;
          if (player.x >= platformX - halfW - player.radius && player.x <= platformX + halfW + player.radius) {
            if (player.y + player.radius >= surfaceY && player.vy > 0) {
              player.y = surfaceY - player.radius;
              player.vy = -Math.max(2, Math.abs(player.vy) * 0.6 + 3);
              // Slight horizontal deflection
              const localX = player.x - platformX;
              player.vx += (localX / halfW) * 1.2;
              screenShake = Math.max(screenShake, 6);
            }
          }
        };
        
        // Check collision with left platform (50% width)
        checkPlatformCollision(pvpPlatformLeftX, pvpPlatformSideWidth);
        
        // Check collision with right platform (50% width)
        checkPlatformCollision(pvpPlatformRightX, pvpPlatformSideWidth);
      }
      
      // Update speed trail (supersonic animation - same as Solo) - OPTIMIZED: Cache speed
      let playerSpeed = 0;
      if (!cachedPlayerSpeeds[playerId] || cachedPlayerSpeeds[playerId].frame !== currentFrame) {
        const speedSquared = player.vx * player.vx + player.vy * player.vy;
        playerSpeed = Math.sqrt(speedSquared);
        cachedPlayerSpeeds[playerId] = { speed: playerSpeed, speedSquared, frame: currentFrame };
      } else {
        playerSpeed = cachedPlayerSpeeds[playerId].speed;
      }
      if (Math.round(playerSpeed) >= 7) {
        // Add a new segment at current position
        player.speedTrail.push({
          x: player.x,
          y: player.y,
          vx: 0,
          vy: 0,
          life: 16,
          maxLife: 16,
          size: player.radius * 1.2
        });
        // Limit length
        if (player.speedTrail.length > 8) {
          player.speedTrail.shift();
        }
      }
      
      // Update speed trail particles (fade out)
      for (let i = player.speedTrail.length - 1; i >= 0; i--) {
        player.speedTrail[i].life--;
        if (player.speedTrail[i].life <= 0) {
          player.speedTrail.splice(i, 1);
        }
      }
      
      // Check if player is dead (HP <= 0) - set isOut flag and start death animation
      if (player.hp <= 0 && !player.isOut && !deathAnimations.has(playerId)) {
        player.isOut = true;
        
        // Determine player color for death animation
        let playerColor = '#000000'; // Default black
        if (playerId === myPlayerId) {
          playerColor = '#000000'; // Black for my player
        } else if (playerId === opponentId && opponentId) {
          playerColor = '#000000'; // Black for opponent
        } else {
          playerColor = player.color;
        }
        
        // Start death animation
        createDeathAnimation(playerId, player.x, player.y, playerColor, player.radius);
      }
      
      // Armor regeneration (1 per 5 seconds) - PvP mode
      if (player.armor < player.maxArmor && player.maxArmor > 0) {
        const now = Date.now();
        // Ensure lastArmorRegen is initialized
        if (!player.lastArmorRegen) {
          player.lastArmorRegen = now;
        }
        
        if (now - player.lastArmorRegen >= 5000) { // 5 seconds
          const oldArmor = player.armor;
          player.armor = Math.min(player.maxArmor, player.armor + 1);
          player.lastArmorRegen = now;
          
          // Show "+1" animation in green when armor regenerates
          if (player.armor > oldArmor) {
            safePushDamageNumber({
              x: player.x + (Math.random() - 0.5) * 20,
              y: player.y - player.radius - 20,
              value: '+1',
              life: 60,
              maxLife: 60,
              vx: (Math.random() - 0.5) * 1,
              vy: -2 - Math.random() * 1,
              isCrit: false
            });
            
            // Send stats update after armor regeneration (only for my player)
            if (playerId === myPlayerId) {
              sendStatsUpdate(player.hp, player.armor, player.maxHP, player.maxArmor);
            }
          }
        }
      }
      }
    }
    
    // PvP mode: Sync position with opponent (real-time position updates)
    // Use Colyseus if available, otherwise fallback to Supabase
    const useColyseus = colyseusService.isConnectedToRoom();
    const isSyncing = useColyseus || pvpSyncService.isSyncing();
    
    if (gameMode === 'PvP' && currentMatch && myPlayerId && pvpPlayers[myPlayerId] && isSyncing) {
      const now = Date.now();
      if (now - lastPositionSyncTime >= POSITION_SYNC_INTERVAL) {
        lastPositionSyncTime = now;
        const myPlayer = pvpPlayers[myPlayerId];
        
        const positionInput = {
          type: 'position' as const,
          timestamp: now,
          x: myPlayer.x,
          y: myPlayer.y,
          vx: myPlayer.vx,
          vy: myPlayer.vy,
        };
        
        // Send via Colyseus or Supabase
        if (useColyseus) {
          colyseusService.sendInput(positionInput);
        } else {
          pvpSyncService.sendInput(positionInput);
        }
        
        // Send arrow position if flying
        if (pvpKatanaFlying) {
          const arrowInput = {
            type: 'arrow_position' as const,
            timestamp: now,
            x: pvpKatanaX,
            y: pvpKatanaY,
            vx: pvpKatanaVx,
            vy: pvpKatanaVy,
            angle: pvpKatanaAngle,
          };
          
          if (useColyseus) {
            colyseusService.sendInput(arrowInput);
          } else {
            pvpSyncService.sendInput(arrowInput);
          }
        }
        
        // Send projectile position if flying
        if (projectileFlying) {
          const projectileInput = {
            type: 'projectile_position' as const,
            timestamp: now,
            x: projectileX,
            y: projectileY,
            vx: projectileVx,
            vy: projectileVy,
          };
          
          if (useColyseus) {
            colyseusService.sendInput(projectileInput);
          } else {
            pvpSyncService.sendInput(projectileInput);
          }
        }
      }
    }
    
    // PvP mode: Check win/loss conditions (only for online PvP, not Training)
    if (gameMode === 'PvP' && currentMatch && myPlayerId && opponentId && !showingMatchResult) {
      const myPlayer = pvpPlayers[myPlayerId];
      const opponent = pvpPlayers[opponentId];
      const walletState = walletService.getState();
      
      // CRITICAL: Save currentMatch copy BEFORE checking win/loss conditions
      // This ensures we have match data even if currentMatch is cleared later
      if (currentMatch && !savedCurrentMatch) {
        savedCurrentMatch = { ...currentMatch }; // Deep copy
        console.log('Saved currentMatch copy for result screen:', savedCurrentMatch);
      }
      
      // Check if opponent is dead (removed from game or HP <= 0 or isOut)
      // Wait for death animation to finish before showing result
      const opponentDeathAnimPlaying = deathAnimations.has(opponentId);
      const opponentIsDead = !opponent || opponent.isOut || opponent.hp <= 0;
      
      // Check if I am dead (removed from game or HP <= 0 or isOut)
      const myDeathAnimPlaying = deathAnimations.has(myPlayerId);
      const iAmDead = !myPlayer || myPlayer.isOut || myPlayer.hp <= 0;
      
      // Check if I won (opponent is dead and death animation finished)
      if (opponentIsDead && !opponentDeathAnimPlaying && !iAmDead) {
        console.log('PvP: You won!');
        
        // CRITICAL: Save opponent address BEFORE setting showingMatchResult = true
        // Save opponent address for result screen - ALWAYS save opponent address
        // Logic: If I'm p1 → opponent is p2; If I'm p2 → opponent is p1
        // Use savedCurrentMatch if currentMatch is null (defense against race conditions)
        const matchToUse = currentMatch || savedCurrentMatch;
        if (matchToUse && walletState.address) {
          // Determine opponent: if I'm p1, opponent is p2; if I'm p2, opponent is p1
          const myAddress = walletState.address;
          if (matchToUse.p1 === myAddress) {
            // I'm p1, opponent is p2
            opponentAddressForResult = matchToUse.p2 || opponentWalletAddress || null;
            console.log('Victory: I am p1, opponent is p2:', opponentAddressForResult);
          } else if (matchToUse.p2 === myAddress) {
            // I'm p2, opponent is p1
            opponentAddressForResult = matchToUse.p1 || opponentWalletAddress || null;
            console.log('Victory: I am p2, opponent is p1:', opponentAddressForResult);
          } else {
            // Fallback: use opponentWalletAddress or opponentId
            opponentAddressForResult = opponentWalletAddress || opponentId || null;
            console.warn('Victory: My address does not match p1 or p2, using opponentWalletAddress/opponentId:', opponentAddressForResult, {
              myAddress,
              p1: matchToUse.p1,
              p2: matchToUse.p2,
              opponentWalletAddress
            });
          }
          console.log('Victory: Saved opponent address from match:', opponentAddressForResult, { 
            myAddress: walletState.address, 
            p1: matchToUse.p1, 
            p2: matchToUse.p2,
            opponentId,
            opponentWalletAddress,
            usedSavedMatch: !currentMatch && !!savedCurrentMatch
          });
        } else if (opponentWalletAddress) {
          // CRITICAL: Use opponentWalletAddress for Colyseus mode (where opponentId is session ID)
          opponentAddressForResult = opponentWalletAddress;
          console.log('Victory: Saved opponent address from opponentWalletAddress:', opponentAddressForResult);
        } else if (opponentId) {
          opponentAddressForResult = opponentId;
          console.log('Victory: Saved opponent address from opponentId (fallback):', opponentAddressForResult);
        } else {
          // Last resort: try to get from opponent player object
          if (opponent && opponentId) {
            // opponentId should be the address
            opponentAddressForResult = opponentId;
            console.log('Victory: Saved opponent address from opponentId (last resort):', opponentAddressForResult);
          } else {
            opponentAddressForResult = null;
            console.error('Victory: Could not determine opponent address!', { 
              currentMatch: currentMatch ? { p1: currentMatch.p1, p2: currentMatch.p2 } : null, 
              opponentId, 
              walletAddress: walletState.address,
              opponent: opponent ? 'exists' : 'null',
              myPlayerId
            });
          }
        }
        
        matchResult = 'victory';
        matchResultEloChange = 10; // +10 ELO for win
        showingMatchResult = true;
        
        // Get opponent nickname from profile (async)
        opponentNicknameForResult = null; // Reset first
        if (opponentAddressForResult) {
          supabaseService.getProfile(opponentAddressForResult).then((opponentProfile) => {
            if (opponentProfile && opponentProfile.nickname) {
              opponentNicknameForResult = opponentProfile.nickname;
            } else {
              opponentNicknameForResult = null; // Use address if no nickname
            }
          }).catch(() => {
            opponentNicknameForResult = null;
          });
        }
        
        // Profile: PvP win + XP
        profileManager.addWinPvP();
        profileManager.addXP(3);
        
        // Update match result in Supabase
        if (walletState.address && currentMatch) {
          supabaseService.updateMatchResult(currentMatch.id, walletState.address);
          
          // Update ELO
          if (walletState.address) {
            supabaseService.getProfile(walletState.address).then(async (profile) => {
              if (profile) {
                const newElo = profile.pvp_data.elo + 10;
                const newWins = profile.pvp_data.wins + 1;
                await supabaseService.updatePvpData(walletState.address!, {
                  elo: newElo,
                  wins: newWins,
                  losses: profile.pvp_data.losses,
                });
              }
            });
          }
        }
      }
      
      // Check if I lost (I am dead and death animation finished)
      if (iAmDead && !myDeathAnimPlaying && !opponentIsDead) {
        console.log('PvP: You lost!');
        
        // CRITICAL: Save opponent address BEFORE setting showingMatchResult = true
        // Save opponent address for result screen - ALWAYS save opponent address
        // Logic: If I'm p1 → opponent is p2; If I'm p2 → opponent is p1
        // Use savedCurrentMatch if currentMatch is null (defense against race conditions)
        const matchToUse = currentMatch || savedCurrentMatch;
        if (matchToUse && walletState.address) {
          // Determine opponent: if I'm p1, opponent is p2; if I'm p2, opponent is p1
          const myAddress = walletState.address;
          if (matchToUse.p1 === myAddress) {
            // I'm p1, opponent is p2
            opponentAddressForResult = matchToUse.p2 || opponentWalletAddress || null;
            console.log('Defeat: I am p1, opponent is p2:', opponentAddressForResult);
          } else if (matchToUse.p2 === myAddress) {
            // I'm p2, opponent is p1
            opponentAddressForResult = matchToUse.p1 || opponentWalletAddress || null;
            console.log('Defeat: I am p2, opponent is p1:', opponentAddressForResult);
          } else {
            // Fallback: use opponentWalletAddress or opponentId
            opponentAddressForResult = opponentWalletAddress || opponentId || null;
            console.warn('Defeat: My address does not match p1 or p2, using opponentWalletAddress/opponentId:', opponentAddressForResult, {
              myAddress,
              p1: matchToUse.p1,
              p2: matchToUse.p2,
              opponentWalletAddress
            });
          }
          console.log('Defeat: Saved opponent address from match:', opponentAddressForResult, { 
            myAddress: walletState.address, 
            p1: matchToUse.p1, 
            p2: matchToUse.p2,
            opponentId,
            opponentWalletAddress,
            usedSavedMatch: !currentMatch && !!savedCurrentMatch
          });
        } else if (opponentWalletAddress) {
          // CRITICAL: Use opponentWalletAddress for Colyseus mode (where opponentId is session ID)
          opponentAddressForResult = opponentWalletAddress;
          console.log('Defeat: Saved opponent address from opponentWalletAddress:', opponentAddressForResult);
        } else if (opponentId) {
          opponentAddressForResult = opponentId;
          console.log('Defeat: Saved opponent address from opponentId (fallback):', opponentAddressForResult);
        } else {
          // Last resort: try to get from opponent player object
          if (opponent && opponentId) {
            // opponentId should be the address
            opponentAddressForResult = opponentId;
            console.log('Defeat: Saved opponent address from opponentId (last resort):', opponentAddressForResult);
          } else {
            opponentAddressForResult = null;
            console.error('Defeat: Could not determine opponent address!', { 
              currentMatch: currentMatch ? { p1: currentMatch.p1, p2: currentMatch.p2 } : null, 
              opponentId, 
              walletAddress: walletState.address,
              opponent: opponent ? 'exists' : 'null',
              myPlayerId
            });
          }
        }
        
        matchResult = 'defeat';
        matchResultEloChange = -5; // -5 ELO for loss
        showingMatchResult = true;
        
        // Get opponent nickname from profile (async)
        opponentNicknameForResult = null; // Reset first
        if (opponentAddressForResult) {
          supabaseService.getProfile(opponentAddressForResult).then((opponentProfile) => {
            if (opponentProfile && opponentProfile.nickname) {
              opponentNicknameForResult = opponentProfile.nickname;
            } else {
              opponentNicknameForResult = null; // Use address if no nickname
            }
          }).catch(() => {
            opponentNicknameForResult = null;
          });
        }
        
        // Profile: PvP lose + XP (negative)
        profileManager.addLossPvP();
        profileManager.addXP(-1);
        
        // Update match result in Supabase
        if (walletState.address && currentMatch) {
          supabaseService.updateMatchResult(currentMatch.id, opponentId);
          
          // Update ELO
          if (walletState.address) {
            supabaseService.getProfile(walletState.address).then(async (profile) => {
              if (profile) {
                const newElo = Math.max(0, profile.pvp_data.elo - 5);
                const newLosses = profile.pvp_data.losses + 1;
                await supabaseService.updatePvpData(walletState.address!, {
                  elo: newElo,
                  wins: profile.pvp_data.wins,
                  losses: newLosses,
                });
              }
            });
          }
        }
      }
    }
    
    // Bot AI: Control red player (opponent) only (Training mode only)
    // Blue player (myPlayer) is controlled by player clicks only - bot does NOT click on blue
    if (gameMode === 'Training' && myPlayerId && opponentId && pvpPlayers[myPlayerId] && pvpPlayers[opponentId]) {
      const myPlayer = pvpPlayers[myPlayerId]; // Blue - controlled by player (you) via click handler
      const opponent = pvpPlayers[opponentId]; // Red - controlled by bot
      
      const now = Date.now();
      
      // Bot clicks on red player (itself) to move around and be more active
      const timeSinceLastSelfClick = now - botLastSelfClickTime;
      if (timeSinceLastSelfClick >= botSelfClickCooldown && !opponent.isOut && Math.random() < botSelfClickChance) {
        // Bot clicks on red player (itself) in a random direction to move around
        const selfClickAngle = Math.random() * Math.PI * 2; // Random direction
        const selfClickDistance = opponent.radius * (0.5 + Math.random() * 0.5);
        const selfClickX = opponent.x + Math.cos(selfClickAngle) * selfClickDistance;
        const selfClickY = opponent.y + Math.sin(selfClickAngle) * selfClickDistance;
        
        // Calculate direction from click to red player center
        const selfDx = opponent.x - selfClickX;
        const selfDy = opponent.y - selfClickY;
        const selfDistance = Math.sqrt(selfDx * selfDx + selfDy * selfDy);
        
        if (selfDistance > 0) {
          // Same logic: move opposite to click direction
          const selfClickAngleToPlayer = Math.atan2(selfDy, selfDx);
          const selfOppositeAngle = selfClickAngleToPlayer + Math.PI;
          const selfForce = 4.6; // Same force
          
          // Apply force to red player (bot clicks on itself)
          opponent.vx += Math.cos(selfOppositeAngle) * selfForce;
          opponent.vy += Math.sin(selfOppositeAngle) * selfForce;
          
          // Update last hit time and unlock gravity
          opponent.lastHitTime = Date.now();
          opponent.gravityLocked = false;
          
          botLastSelfClickTime = now;
          console.log('Bot (red) clicked on itself to move!');
        }
      }
    }
    
    // Collision detection between players
    if (myPlayerId && opponentId && pvpPlayers[myPlayerId] && pvpPlayers[opponentId]) {
      const player1 = pvpPlayers[myPlayerId];
      const player2 = pvpPlayers[opponentId];
      
      // Calculate distance between players - OPTIMIZED: Use squared distance
      const dx = player2.x - player1.x;
      const dy = player2.y - player1.y;
      const distanceSquared = dx * dx + dy * dy;
      const minDistance = player1.radius + player2.radius;
      const minDistanceSquared = minDistance * minDistance;
      
      if (distanceSquared < minDistanceSquared && distanceSquared > 0) {
        const distance = Math.sqrt(distanceSquared);
        // Collision detected - calculate collision normal
        const nx = dx / distance;
        const ny = dy / distance;
        
        // Calculate relative velocity
        const relVx = player2.vx - player1.vx;
        const relVy = player2.vy - player1.vy;
        const relSpeed = relVx * nx + relVy * ny;
        
        // Only resolve collision if players are moving towards each other
        // Also check if collision happened (distance < minDistance)
        // Damage is dealt ONLY when players collide
        // The player with higher speed wins and deals damage to opponent
        {
          // Determine which player dominates (faster speed) - OPTIMIZED: Cache speeds
          let speed1 = 0;
          let speed2 = 0;
          if (!cachedPlayerSpeeds[myPlayerId!] || cachedPlayerSpeeds[myPlayerId!].frame !== currentFrame) {
            const speed1Squared = player1.vx * player1.vx + player1.vy * player1.vy;
            speed1 = Math.sqrt(speed1Squared);
            cachedPlayerSpeeds[myPlayerId!] = { speed: speed1, speedSquared: speed1Squared, frame: currentFrame };
          } else {
            speed1 = cachedPlayerSpeeds[myPlayerId!].speed;
          }
          if (!cachedPlayerSpeeds[opponentId!] || cachedPlayerSpeeds[opponentId!].frame !== currentFrame) {
            const speed2Squared = player2.vx * player2.vx + player2.vy * player2.vy;
            speed2 = Math.sqrt(speed2Squared);
            cachedPlayerSpeeds[opponentId!] = { speed: speed2, speedSquared: speed2Squared, frame: currentFrame };
          } else {
            speed2 = cachedPlayerSpeeds[opponentId!].speed;
          }
          
          // Deal damage when players collide - the one with higher speed wins
          // Damage is dealt ONLY ONCE per collision, then requires cooldown and separation
          
          // Create collision key (sorted alphabetically for consistency)
          const collisionKey = [myPlayerId!, opponentId!].sort().join('_');
          const lastDamageTime = lastCollisionDamageTime[collisionKey] || 0;
          const timeSinceLastDamage = Date.now() - lastDamageTime;
          
          // Check if players are separated enough to reset cooldown
          const separationDistance = distance - minDistance; // How far apart they are beyond collision
          const canDealDamage = timeSinceLastDamage >= COLLISION_DAMAGE_COOLDOWN || 
                                separationDistance >= COLLISION_DAMAGE_MIN_DISTANCE;
          
          // Damage is only dealt if speed >= 5
          const MIN_SPEED_FOR_DAMAGE = 5;
          
          if (speed1 > speed2 && canDealDamage && speed1 >= MIN_SPEED_FOR_DAMAGE) {
            // Player 1 has higher speed - deals damage to player 2
            // Use base dmg from Solo stat (not 2x, just base dmg)
            const baseDamage = dmg; // Base damage from Solo dmg stat
            // Apply 50% variance (damage ranges from 50% to 100%)
            const damage = applyDamageVariance(baseDamage);
            const absorbed = Math.min(damage, player2.armor);
            player2.armor -= absorbed;
            const remainingDamage = damage - absorbed;
            player2.hp = Math.max(0, player2.hp - remainingDamage);
            
            // Profile: Track damage dealt (PvP mode - I deal damage if I'm player 1)
            if (myPlayerId && myPlayerId === player1.id) {
              profileManager.addDamageDealt(damage);
            }
            
            // Record damage time
            lastCollisionDamageTime[collisionKey] = Date.now();
            
            // Show damage number
            safePushDamageNumber({
              x: player2.x + (Math.random() - 0.5) * 40,
              y: player2.y - 20,
              value: damage,
              life: 60,
              maxLife: 60,
              vx: (Math.random() - 0.5) * 2,
              vy: -2 - Math.random() * 2,
              isCrit: false
            });
            screenShake = Math.max(screenShake, 6);
            
            console.log(`PvP Collision: Player 1 (speed ${speed1.toFixed(2)}) hits Player 2 (speed ${speed2.toFixed(2)}) for ${damage} damage. Player 2 HP: ${player2.hp}/${player2.maxHP}, Armor: ${player2.armor}/${player2.maxArmor}`);
            
            // Check if player 2 is dead - start death animation
            if (player2.hp <= 0 && !player2.isOut && !deathAnimations.has(opponentId!)) {
              player2.isOut = true;
              
              // Determine player color for death animation
              let playerColor = '#000000';
              if (opponentId === myPlayerId) {
                playerColor = '#000000';
              } else {
                playerColor = player2.color;
              }
              
              // Start death animation
              createDeathAnimation(opponentId!, player2.x, player2.y, playerColor, player2.radius);
            }
          } else if (speed2 > speed1 && canDealDamage && speed2 >= MIN_SPEED_FOR_DAMAGE) {
            // Player 2 has higher speed - deals damage to player 1
            // Use base dmg from Solo stat (not 2x, just base dmg)
            const baseDamage = dmg; // Base damage from Solo dmg stat
            // Apply 50% variance (damage ranges from 50% to 100%)
            const damage = applyDamageVariance(baseDamage);
            const absorbed = Math.min(damage, player1.armor);
            player1.armor -= absorbed;
            const remainingDamage = damage - absorbed;
            player1.hp = Math.max(0, player1.hp - remainingDamage);
            
            // Record damage time
            lastCollisionDamageTime[collisionKey] = Date.now();
            
            // Show damage number
            safePushDamageNumber({
              x: player1.x + (Math.random() - 0.5) * 40,
              y: player1.y - 20,
              value: damage,
              life: 60,
              maxLife: 60,
              vx: (Math.random() - 0.5) * 2,
              vy: -2 - Math.random() * 2,
              isCrit: false
            });
            screenShake = Math.max(screenShake, 6);
            
            console.log(`PvP Collision: Player 2 (speed ${speed2.toFixed(2)}) hits Player 1 (speed ${speed1.toFixed(2)}) for ${damage} damage. Player 1 HP: ${player1.hp}/${player1.maxHP}, Armor: ${player1.armor}/${player1.maxArmor}`);
            
            // Check if player 1 is dead - start death animation
            if (player1.hp <= 0 && !player1.isOut && !deathAnimations.has(myPlayerId!)) {
              player1.isOut = true;
              
              // Determine player color for death animation
              let playerColor = '#000000';
              if (myPlayerId === opponentId) {
                playerColor = '#000000';
              } else {
                playerColor = player1.color;
              }
              
              // Start death animation
              createDeathAnimation(myPlayerId!, player1.x, player1.y, playerColor, player1.radius);
            }
          }
          
          // Physics resolution (separate from damage)
          if (relSpeed < 0) {
            if (speed1 > speed2) {
              // Player 1 dominates - reduce its speed by 50%
              player1.vx *= 0.5;
              player1.vy *= 0.5;
              
              // Push player 2 away
              const pushForce = Math.abs(relSpeed) * 0.5;
              player2.vx += nx * pushForce;
              player2.vy += ny * pushForce;
            } else {
              // Player 2 dominates - reduce its speed by 50%
              player2.vx *= 0.5;
              player2.vy *= 0.5;
              
              // Push player 1 away
              const pushForce = Math.abs(relSpeed) * 0.5;
              player1.vx -= nx * pushForce;
              player1.vy -= ny * pushForce;
            }
            
            // Separate players to prevent overlap
            const overlap = minDistance - distance;
            const separationX = nx * overlap * 0.5;
            const separationY = ny * overlap * 0.5;
            player1.x -= separationX;
            player1.y -= separationY;
            player2.x += separationX;
            player2.y += separationY;
            
            // Update last hit time and unlock gravity (same as Solo)
            const now = Date.now();
            player1.lastHitTime = now;
            player2.lastHitTime = now;
            player1.gravityLocked = false;
            player2.gravityLocked = false;
          }
        }
      }
    }
    
    // Check win condition: opponent is out of bounds
    if (myPlayerId && opponentId && pvpPlayers[myPlayerId] && pvpPlayers[opponentId]) {
      const myPlayer = pvpPlayers[myPlayerId];
      const opponent = pvpPlayers[opponentId];
      
      if (opponent.isOut && !myPlayer.isOut) {
        console.log('You win! Opponent is out of bounds');
        // TODO: Show win screen
      } else if (myPlayer.isOut && !opponent.isOut) {
        console.log('You lose! You are out of bounds');
        // TODO: Show lose screen
      }
    }
  }

  // Armor regeneration (1 per 2 seconds) - Solo mode only
  if (gameMode === 'Solo' && gameState === 'Alive' && dotArmor < dotMaxArmor) {
    const now = Date.now();
    if (now - lastArmorRegen >= 2000) { // 2 seconds
      dotArmor = Math.min(dotMaxArmor, dotArmor + 1);
      lastArmorRegen = now;
    }
  }
  
  // Update screen shake
  if (screenShake > 0) {
    screenShake--;
  }

  // Update moving platform position (Solo mode only - PvP platform is static in center)
  if (gameMode !== 'PvP' && gameMode !== 'Training') {
    movingPlatformX += movingPlatformVx;
    // Bounce off edges
    const halfW = movingPlatformWidth / 2;
    if (movingPlatformX - halfW <= playLeft || movingPlatformX + halfW >= playRight) {
      movingPlatformVx = -movingPlatformVx;
      // Keep within bounds
      movingPlatformX = Math.max(playLeft + halfW, Math.min(playRight - halfW, movingPlatformX));
    }
  } else {
    // PvP/Training mode: Platform is static in center
    movingPlatformX = (playLeft + playRight) / 2; // Center of play area
  }

  // Platform flash timer
  if (movingPlatformFlashTimer > 0) {
    movingPlatformFlashTimer--;
  }

  // Update katana slash animation and check collisions
  // Update arrow slash animation (visual only - damage already applied when arrow hits target during flight)
  if (katanaSlashing && gameState === 'Alive') {
    const now = Date.now();
    const slashProgress = Math.min(1, (now - katanaSlashStartTime) / katanaSlashDuration);
    
    // End slash animation after duration
    if (slashProgress >= 1) {
      katanaSlashing = false;
      katanaHitTargets.clear();
      // Reset arrow after slash - ready for next shot
      katanaFlying = false;
      katanaVx = 0;
      katanaVy = 0;
    }
  }

  // Update katana flying physics
  if (katanaFlying && gameState === 'Alive') {
    // Update position
    katanaX += katanaVx;
    katanaY += katanaVy;
    
    // Check collision with DOT - OPTIMIZED: Use squared distance
    const dx = dotX - katanaX;
    const dy = dotY - katanaY;
    const distanceSquared = dx * dx + dy * dy;
    const hitRadius = dotRadius + (arrowLength - arrowFletchingLength);
    const hitRadiusSquared = hitRadius * hitRadius;
    
    // Hit if arrow tip/body touches DOT
    if (distanceSquared <= hitRadiusSquared) {
      const distance = Math.sqrt(distanceSquared);
      // Impact! Apply damage immediately when arrow hits target
      // 100% hit chance - if arrow hits target, damage is guaranteed
      // Arrow is completely free - no DOT currency cost
      
      // Arrow always hits if it physically hits the target (no accuracy check)
      // Arrow does strong damage (3x for impact strike)
      const arrowDamageMultiplier = 3;
        
        // Check for crit hit - with NFT bonuses
        const nftBonuses = calculateNftBonuses();
        const totalCritChance = critChance + nftBonuses.critChance;
        let isCritHit = Math.random() < totalCritChance / 100;
        if (nextHitForceCrit && Date.now() <= nextHitForceCritExpiresAt) {
          isCritHit = true;
          nextHitForceCrit = false;
        } else if (Date.now() > nextHitForceCritExpiresAt) {
          nextHitForceCrit = false;
        }
        
        // Calculate base damage with arrow multiplier and crit (with NFT bonuses)
        const totalDmg = dmg + nftBonuses.dmg;
        const baseDamage = totalDmg * arrowDamageMultiplier;
        const damageWithCrit = isCritHit ? baseDamage * 2 : baseDamage;
        // Apply 50% variance (damage ranges from 50% to 100%)
        let totalDamage = applyDamageVariance(damageWithCrit);
        
        // Apply damage
        const absorbed = Math.min(totalDamage, dotArmor);
        dotArmor -= absorbed;
        const remainingDamage = totalDamage - absorbed;
        dotHP = Math.max(0, dotHP - remainingDamage);
        
        // Add damage number animation
        safePushDamageNumber({
          x: dotX + (Math.random() - 0.5) * 40,
          y: dotY - 20,
          value: totalDamage,
          life: 60,
          maxLife: 60,
          vx: (Math.random() - 0.5) * 2,
          vy: -2 - Math.random() * 2,
          isCrit: isCritHit
        });
        
        // Push DOT in opposite direction from arrow's origin (like click logic)
        // Arrow was launched from arrowStartX, arrowStartY towards dotX, dotY
        // Click logic: dx = mouseX - dotX, dy = mouseY - dotY, oppositeAngle = clickAngle + Math.PI
        // Arrow logic: dx = arrowStartX - dotX, dy = arrowStartY - dotY, oppositeAngle = arrowAngle + Math.PI
        const clickDx = arrowStartX - dotX; // From DOT to arrow origin (same as click: mouseX - dotX)
        const clickDy = arrowStartY - dotY; // From DOT to arrow origin (same as click: mouseY - dotY)
        const clickAngle = Math.atan2(clickDy, clickDx); // Angle from DOT to arrow origin
        const oppositeAngle = clickAngle + Math.PI; // Opposite direction (same as click logic)
        const force = isCritHit ? 11.5 : 9.2; // Increased by 15% - Very strong bounce from impact
        
        // Move DOT opposite to click direction - same logic as normal click
        dotVx += Math.cos(oppositeAngle) * force;
        dotVy += Math.sin(oppositeAngle) * force;
        
        // Screen shake on impact (stronger than normal hits)
        screenShake = Math.max(screenShake, isCritHit ? 30 : 20);
        
        // Update last hit time to disable gravity temporarily
        lastHitTime = Date.now();
        
        // Check death
        if (dotHP <= 0) {
          gameState = 'Dying';
          deathAnimation = true;
          deathTimer = 0;
          respawnTimer = 0;
          awaitingRestart = false;
          rewardGranted = false;
          deathStartX = dotX;
          deathStartY = dotY;
          
          // Leveling system: increment kill counter
          killsInCurrentLevel++;
          console.log(`Kills in level ${currentLevel}: ${killsInCurrentLevel}/${killsNeededPerLevel}`);
          
          if (killsInCurrentLevel >= killsNeededPerLevel) {
            killsInCurrentLevel = 0;
            if (maxUnlockedLevel === currentLevel) {
              maxUnlockedLevel = currentLevel + 1;
              console.log(`Level ${maxUnlockedLevel} unlocked!`);
            }
          }
          
          console.log('DOT is dying! (arrow hit)');
        }
      
      // Start slash animation after impact
      katanaFlying = false;
      katanaVx = 0;
      katanaVy = 0;
      katanaSlashing = true;
      katanaSlashStartTime = Date.now();
      
      // Keep katana at impact position
      // katanaX and katanaY already set
      katanaAngle = Math.atan2(dy, dx);
      
      // Reset hit targets
      katanaHitTargets.clear();
      
      console.log(`Arrow impact! Starting slash at (${katanaX}, ${katanaY})`);
    }
    
    // Boundary check - allow arrow to fly out of bounds but stop it visually
    // Arrow can fly beyond boundaries but will be reset when DOT restarts
    if (katanaX < 240 || katanaX > 1920 || katanaY < 0 || katanaY > 1080) {
      // Don't stop flying immediately - let it continue but don't render if too far out
      // This allows smooth flight animation even when going out of bounds
    }
  }

  // Damage only happens during slash animation (handled above)

  // Update drawn lines (fade out animation)
  for (let i = drawnLines.length - 1; i >= 0; i--) {
    drawnLines[i].life--;
    if (drawnLines[i].life <= 0) {
      drawnLines.splice(i, 1);
    }
  }

  // Update supersonic shadow tail (comet effect) - OPTIMIZED: Use cached speed
  {
    if (cachedDotSpeedFrame !== currentFrame) {
      cachedDotSpeedSquared = dotVx * dotVx + dotVy * dotVy;
      cachedDotSpeed = Math.sqrt(cachedDotSpeedSquared);
      cachedDotSpeedFrame = currentFrame;
    }
    if (Math.round(cachedDotSpeed) >= 7) {
      // Add a new segment at current position
      speedTrail.push({
        x: dotX,
        y: dotY,
        vx: 0,
        vy: 0,
        life: 16,
        maxLife: 16,
        size: dotRadius * 1.2
      });
      // Limit length
      if (speedTrail.length > 40) speedTrail.shift();
    }
    // Fade out segments
    for (let i = speedTrail.length - 1; i >= 0; i--) {
      speedTrail[i].life--;
      if (speedTrail[i].life <= 0) speedTrail.splice(i, 1);
    }
  }

  // Update click particles
  for (let i = clickParticles.length - 1; i >= 0; i--) {
    const particle = clickParticles[i];
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.life--;
    
    if (particle.life <= 0) {
      clickParticles.splice(i, 1);
    }
  }
  
  // Update projectile smoke particles
  for (let i = projectileSmokeParticles.length - 1; i >= 0; i--) {
    const particle = projectileSmokeParticles[i];
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.life--;
    
    if (particle.life <= 0) {
      projectileSmokeParticles.splice(i, 1);
    }
  }
  
  // Update click smudges
  for (let i = clickSmudges.length - 1; i >= 0; i--) {
    clickSmudges[i].life--;
    if (clickSmudges[i].life <= 0) {
      clickSmudges.splice(i, 1);
    }
  }
  
  // Update DOT decay particles
  for (let i = dotDecayParticles.length - 1; i >= 0; i--) {
    const particle = dotDecayParticles[i];
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.life--;
    
    if (particle.life <= 0) {
      dotDecayParticles.splice(i, 1);
    }
  }
  
  // Update upgrade animation
  if (upgradeAnimation) {
    upgradeProgress += 16 / 2000; // 2 seconds at 60 FPS
    
    // Show FAILED message when reverse animation starts
    if (!upgradeWillSucceed && upgradeProgress >= upgradeFailAt && upgradeMessageTimer === 0) {
      upgradeMessage = 'FAILED!';
      upgradeSuccess = false;
      upgradeMessageX = 20;
      if (upgradeType === 'dmg') upgradeMessageY = 213;
      else if (upgradeType === 'crit') upgradeMessageY = 273;
      else if (upgradeType === 'accuracy') upgradeMessageY = 333;
      upgradeMessageTimer = 1000; // 1 second instead of 2
      console.log('Upgrade failed at', upgradeFailAt);
    }
    
    // Stop animation after reverse effect
    if (!upgradeWillSucceed && upgradeProgress >= upgradeFailAt + 0.25) {
      upgradeAnimation = false;
      upgradeProgress = 0;
      upgradeParticles = [];
      
      // Profile: Track upgrade failure
      profileManager.addUpgradeFailure();
    }
    
    // Add particles during animation
    if (Math.random() < 0.3) {
      const buttonX = 20;
      let buttonY = 160; // Default for dmg (moved down)
      if (upgradeType === 'crit') buttonY = 220;
      else if (upgradeType === 'accuracy') buttonY = 280;
      safePushUpgradeParticle({
        x: buttonX + Math.random() * 200,
        y: buttonY + Math.random() * 40,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 3 - 1,
        life: 30,
        maxLife: 30
      });
    }
    
    // Update particles
    for (let i = upgradeParticles.length - 1; i >= 0; i--) {
      const particle = upgradeParticles[i];
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life--;
      
      if (particle.life <= 0) {
        upgradeParticles.splice(i, 1);
      }
    }
    
    if (upgradeProgress >= 1 && upgradeWillSucceed) {
      // Animation complete - upgrade successful
      upgradeAnimation = false;
      upgradeProgress = 0;
      
      // Profile: Track upgrade success
      profileManager.addUpgradeSuccess();
      
      if (upgradeType === 'dmg') {
        dmg += 1;
        upgradeMessage = `SUCCESS! DMG +1`;
        upgradeSuccess = true;
        upgradeMessageX = 20;
        upgradeMessageY = 213; // Moved down
        forceSaveGame(); // Save after upgrade
      } else if (upgradeType === 'crit') {
        critChance += 1;
        critUpgradeLevel += 1;
        upgradeMessage = `SUCCESS! Crit +1%`;
        upgradeSuccess = true;
        upgradeMessageX = 20;
        upgradeMessageY = 273; // Moved down
        forceSaveGame(); // Save after upgrade
      } else if (upgradeType === 'accuracy') {
        accuracy += 0.5; // 0.5% accuracy increase per upgrade
        accuracyUpgradeLevel += 1;
        upgradeMessage = `SUCCESS! Acc +0.5%`;
        upgradeSuccess = true;
        upgradeMessageX = 20;
        upgradeMessageY = 333; // Moved down
        forceSaveGame(); // Save after upgrade
      }
      
      upgradeMessageTimer = 2000;
      upgradeParticles = [];
    }
  }
  
  // Handle delayed restart after ground touch or out of bounds
  if (awaitingRestart && Date.now() >= scheduledRestartAt) {
    // Full restore and restart from center
    dotHP = dotMaxHP;
    dotArmor = dotMaxArmor;
    dotX = 240 + (1920 - 240) / 2;
    dotY = 1080 / 2;
    dotVx = 0;
    dotVy = 0;
    lastHitTime = 0;
    awaitingRestart = false;
    gravityLocked = true; // keep gravity off until first successful click
    nextHitForceCrit = false; // clear any pending force-crit on restart
    
    // Reset slow-motion on restart
    slowMotionActive = false;
    mouseHoldStartTime = 0;
    savedDotVx = 0;
    savedDotVy = 0;
    
    // Reset arrow on restart (both ground touch and out of bounds)
    arrowReady = false;
    arrowFired = false;
    katanaFlying = false;
    katanaVx = 0;
    katanaVy = 0;
    katanaSlashing = false;
  }

  // Autosave check (every 10 seconds)
  if (saveManager.shouldAutoSave()) {
    saveGame();
  }

  // Update FPS counter (every second)
  fpsFrameCount++;
  const now = Date.now();
  if (now - fpsLastTime >= 1000) {
    currentFPS = fpsFrameCount;
    fpsFrameCount = 0;
    fpsLastTime = now;
    
    // Calculate average frame time
    if (frameTimeHistory.length > 0) {
      const sum = frameTimeHistory.reduce((a, b) => a + b, 0);
      averageFrameTime = sum / frameTimeHistory.length;
      maxFrameTime = Math.max(...frameTimeHistory);
      frameTimeHistory = []; // Reset for next second
    }
  }

  render();
  
  // Track frame time for this frame (measure entire gameLoop including render)
  const frameEndTime = performance.now();
  const frameTime = frameEndTime - frameStartTime;
  frameTimeHistory.push(frameTime);
  if (frameTimeHistory.length > 60) {
    frameTimeHistory.shift(); // Keep last 60 frames
  }
  
  requestAnimationFrame(gameLoop);
}

// Start game
// CRITICAL: Prevent duplicate game loops (HMR protection)
// Use window object to persist flag across HMR updates
if (!(window as any).__gameLoopRunning) {
  (window as any).__gameLoopRunning = true;
  console.log('Starting game loop...');
  loadGame(); // Load saved game state on startup
  gameLoop();
} else {
  console.warn('⚠️ Game loop already running - skipping duplicate start (HMR protection)');
}
