// Arrow range limiting (performance + clarity)
const PVP_ARROW_RANGE_PX = 700;
const PVP_ARROW_FADE_PX = 50; // after range, fade out over this distance

// Simple version without complex imports
// Force rebuild - wallet button fix (v2)
import { SaveManagerV2 } from './persistence/SaveManagerV2';
import { SaveDataV2, createInitialSaveDataV2 } from './persistence/SaveDataV2';
import { walletService, type WalletProviderType } from './services/WalletService';
import { supabaseService } from './services/SupabaseService';
import { matchmakingService } from './services/MatchmakingService';
import { pvpSyncService } from './services/PvPSyncService';
import { colyseusService } from './services/ColyseusService';
import type { Match } from './services/SupabaseService';
import { ProfileManager } from './profile/ProfileManager';
import { nftService } from './services/NftService';
import type { NftItem } from './types/nft';
import { AudioManager } from './audio/AudioManager';

type PvpServerPreset = {
  id: string;
  name: string;
  region: string;
  endpoint: string;
  description?: string;
};

type PvpServerStatus = PvpServerPreset & {
  status: 'checking' | 'online' | 'offline';
  pingMs: number | null;
  waitingPlayers: number | null;
  waitingRooms: number | null;
  activeRooms: number | null;
  totalPlayers: number | null;
  lastUpdated: number | null;
  error?: string;
};

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const defaultLocalColyseusHttp = 'http://localhost:2567';
const defaultCloudColyseusHttp = 'https://de-fra-f8820c12.colyseus.cloud';

// Prefer local endpoint when running locally. Production should use Cloud (or explicit env var).
const fallbackColyseusEndpoint =
  import.meta.env.VITE_COLYSEUS_ENDPOINT || (isLocalhost ? defaultLocalColyseusHttp : defaultCloudColyseusHttp);

const serverPresets: PvpServerPreset[] = isLocalhost
  ? [
      {
        id: 'local',
        name: 'Localhost',
        region: 'LOCAL',
        endpoint: defaultLocalColyseusHttp,
        description: 'Local Colyseus server'
      },
      {
        id: 'eu-central',
        name: 'Europe - Frankfurt',
        region: 'EU',
        endpoint: defaultCloudColyseusHttp,
        description: 'Primary Colyseus Cloud server'
      }
    ]
  : [
      {
        id: 'eu-central',
        name: 'Europe - Frankfurt',
        region: 'EU',
        endpoint: fallbackColyseusEndpoint,
        description: 'Primary Colyseus Cloud server'
      }
    ];

const PVP_SERVER_PRESETS: PvpServerPreset[] = serverPresets.filter(
  (preset, index, array) =>
    !!preset.endpoint &&
    index === array.findIndex((other) => other.id === preset.id)
);

let serverStatuses: PvpServerStatus[] = PVP_SERVER_PRESETS.map((preset) => ({
  ...preset,
  status: 'checking',
  pingMs: null,
  waitingPlayers: null,
  waitingRooms: null,
  activeRooms: null,
  totalPlayers: null,
  lastUpdated: null
}));

const storedServerId = (() => {
  try {
    return localStorage.getItem('pvp_server_id');
  } catch (error) {
    return null;
  }
})();

let selectedServerId: string | null =
  (storedServerId && serverStatuses.some((server) => server.id === storedServerId) && storedServerId) ||
  serverStatuses[0]?.id ||
  null;

let isServerBrowserOpen = false;
let serverBrowserError = '';
let serverBrowserHoverId: string | null = null;
let serverBrowserHoverClose = false;
let serverStatusLoading = false;
let serverBrowserHitRegions: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
let serverBrowserCloseRegion = { x: 0, y: 0, width: 0, height: 0 };
let serverBrowserModalRegion = { x: 0, y: 0, width: 0, height: 0 };
let serverStatusInterval: number | null = null;

// Verbose logging control (prevents spam in production and lowers frame stutter)
const originalConsoleLog = console.log.bind(console);
let verboseLogsEnabled = (window as any).__ENABLE_VERBOSE_LOGS;
if (typeof verboseLogsEnabled !== 'boolean') {
  const host = window.location.hostname;
  verboseLogsEnabled = host === 'localhost' || host === '127.0.0.1';
}

(window as any).__ENABLE_VERBOSE_LOGS = verboseLogsEnabled;

function setGameLogVerbosity(enabled: boolean) {
  verboseLogsEnabled = enabled;
  (window as any).__ENABLE_VERBOSE_LOGS = enabled;
  originalConsoleLog(`[Game] Verbose logs ${enabled ? 'enabled' : 'muted'}`);
}

console.log = (...args: any[]) => {
  if (verboseLogsEnabled) {
    originalConsoleLog(...args);
  }
};

(window as any).setGameLogVerbosity = setGameLogVerbosity;

console.info('Starting simple game...');

function normalizeServerEndpoint(endpoint: string): string {
  if (!endpoint) return endpoint;
  const trimmed = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
  // Health/status endpoints are HTTP(S). If a WS endpoint is provided, convert it for fetch().
  return trimmed
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://');
}

function getSelectedServer(): PvpServerStatus | undefined {
  if (!selectedServerId) {
    return serverStatuses[0];
  }
  return serverStatuses.find((server) => server.id === selectedServerId) || serverStatuses[0];
}

function getSelectedServerEndpoint(): string | null {
  const server = getSelectedServer();
  return server?.endpoint || null;
}

function setSelectedServer(serverId: string): void {
  selectedServerId = serverId;
  try {
    localStorage.setItem('pvp_server_id', serverId);
  } catch (error) {
    // Ignore storage errors (private mode, etc.)
  }
}

async function fetchWithTimeout(url: string, timeoutMs = 4000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      mode: 'cors',
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function checkServerStatus(server: PvpServerPreset | PvpServerStatus): Promise<PvpServerStatus> {
  const normalizedEndpoint = normalizeServerEndpoint(server.endpoint);
  const baseStatus: PvpServerStatus = {
    ...server,
    status: 'checking',
    pingMs: null,
    waitingPlayers: null,
    waitingRooms: null,
    activeRooms: null,
    totalPlayers: null,
    lastUpdated: null,
    error: undefined
  };

  if (!normalizedEndpoint) {
    return {
      ...baseStatus,
      status: 'offline',
      error: 'No endpoint configured',
      lastUpdated: Date.now()
    };
  }

  try {
    const healthUrl = `${normalizedEndpoint}/health?ts=${Date.now()}`;
    const startTime = performance.now();
    const healthResponse = await fetchWithTimeout(healthUrl, 4000);

    if (!healthResponse.ok) {
      throw new Error(`Health check failed (${healthResponse.status})`);
    }

    // Some deployments might return non-JSON. Ignore parsing errors.
    try {
      await healthResponse.json();
    } catch (error) {
      // ignore
    }

    const pingMs = Math.max(1, Math.round(performance.now() - startTime));

    let waitingPlayers: number | null = null;
    let waitingRooms: number | null = null;
    let activeRooms: number | null = null;
    let totalPlayers: number | null = null;

    try {
      const statusResponse = await fetchWithTimeout(`${normalizedEndpoint}/status?ts=${Date.now()}`, 4000);
      if (statusResponse.ok) {
        const data = await statusResponse.json();
        waitingPlayers = typeof data.waitingPlayers === 'number' ? data.waitingPlayers : null;
        waitingRooms = typeof data.waitingRooms === 'number' ? data.waitingRooms : null;
        activeRooms = typeof data.activeRooms === 'number' ? data.activeRooms : null;
        totalPlayers = typeof data.totalPlayers === 'number' ? data.totalPlayers : null;
      }
    } catch (error) {
      // Older server versions may not have /status - ignore
    }

    return {
      ...server,
      status: 'online',
      pingMs,
      waitingPlayers,
      waitingRooms,
      activeRooms,
      totalPlayers,
      lastUpdated: Date.now(),
      error: undefined
    };
  } catch (error: any) {
    return {
      ...server,
      status: 'offline',
      pingMs: null,
      waitingPlayers: null,
      waitingRooms: null,
      activeRooms: null,
      totalPlayers: null,
      lastUpdated: Date.now(),
      error: error?.message || 'Unavailable'
    };
  }
}

async function refreshServerStatuses(): Promise<void> {
  if (serverStatuses.length === 0 || serverStatusLoading) {
    return;
  }
  if (!isServerBrowserOpen) {
    return;
  }

  serverStatusLoading = true;
  try {
    const results = await Promise.all(serverStatuses.map((server) => checkServerStatus(server)));
    if (isServerBrowserOpen) {
      serverStatuses = results;
    }
  } finally {
    serverStatusLoading = false;
  }
}

function startServerStatusAutoRefresh(): void {
  if (serverStatusInterval !== null) {
    return;
  }
  serverStatusInterval = window.setInterval(() => {
    if (!isServerBrowserOpen) {
      return;
    }
    refreshServerStatuses().catch(() => {
      serverBrowserError = 'Failed to refresh server status';
    });
  }, 5000);
}

function stopServerStatusAutoRefresh(): void {
  if (serverStatusInterval !== null) {
    clearInterval(serverStatusInterval);
    serverStatusInterval = null;
  }
}

function openServerBrowser(): void {
  serverBrowserError = '';
  serverBrowserHoverId = null;
  serverBrowserHoverClose = false;
  isServerBrowserOpen = true;
  startServerStatusAutoRefresh();
  refreshServerStatuses().catch(() => {
    serverBrowserError = 'Failed to refresh server status';
  });
}

function closeServerBrowser(): void {
  isServerBrowserOpen = false;
  serverBrowserHoverId = null;
  serverBrowserHoverClose = false;
  stopServerStatusAutoRefresh();
  serverStatusLoading = false;
}

// PvP identity:
// - If wallet connected, use wallet address
// - Otherwise, use an ephemeral guest id (sessionStorage), so guests can play PvP but never save progression.
let authUserId: string | null = null;
let authEmail: string | null = null;
let authConnecting = false;
let emailLoginModalOpen = false;
let emailLoginStatus: string | null = null;

function openEmailLoginModal(): void {
  emailLoginModalOpen = true;
  emailLoginStatus = null;
  let inp = document.getElementById('emailLoginInput') as HTMLInputElement | null;
  if (!inp) {
    inp = document.createElement('input');
    inp.id = 'emailLoginInput';
    inp.type = 'email';
    inp.placeholder = 'email@example.com';
    inp.autocomplete = 'email';
    inp.style.position = 'absolute';
    inp.style.fontFamily = '"Press Start 2P", monospace';
    inp.style.fontSize = '10px';
    inp.style.padding = '6px';
    inp.style.border = '2px solid #000000';
    inp.style.backgroundColor = '#ffffff';
    inp.style.color = '#000000';
    inp.style.zIndex = '9999';
    document.body.appendChild(inp);
  }
  // Position roughly above wallet button (UI panel area)
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  const x = 20;
  const y = 450 - 10 - 56;
  inp.style.left = `${rect.left + x * scaleX}px`;
  inp.style.top = `${rect.top + y * scaleY}px`;
  inp.style.width = `${200 * scaleX}px`;
  inp.style.display = 'block';
  inp.focus();
  inp.select();
}

function closeEmailLoginModal(): void {
  emailLoginModalOpen = false;
  const inp = document.getElementById('emailLoginInput') as HTMLInputElement | null;
  if (inp) inp.style.display = 'none';
}

function getAuthIdentityForGame(): string | null {
  return authUserId ? `auth_${authUserId}` : null;
}

function getPersistenceIdentity(): string | null {
  try {
    const walletAddr = walletService.getState().address;
    if (walletAddr) return walletAddr;
  } catch {}
  const authId = getAuthIdentityForGame();
  if (authId) return authId;
  return null;
}

function isPersistenceConnected(): boolean {
  return !!getPersistenceIdentity();
}

function getMyPvpAddress(): string {
  const walletState = walletService.getState();
  // Some flows restore address asynchronously; prefer a real Ronin address whenever present.
  if (walletState.address) return walletState.address;
  const authId = getAuthIdentityForGame();
  if (authId) return authId;
  try {
    const stored = localStorage.getItem('ronin_address');
    if (stored) return stored;
  } catch {}
  try {
    const existing = sessionStorage.getItem('guest_pvp_id');
    if (existing) return existing;
    const id = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('guest_pvp_id', id);
    return id;
  } catch {
    return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getRoninAddressForPersistence(): string | null {
  // Legacy name: returns the "persistent identity" for saving profile/progress.
  // Wallet address wins; if not present, use Supabase auth identity (auth_<userId>).
  const id = getPersistenceIdentity();
  if (id) return id;
    return null;
}

function handleServerSelection(serverId: string): void {
  const server = serverStatuses.find((item) => item.id === serverId);
  if (!server) {
    return;
  }

  setSelectedServer(serverId);
  closeServerBrowser();
  startPvPMatchOnServer(server.endpoint);
}

function startPvPMatchOnServer(serverEndpoint?: string): void {
  // Allow guests to play PvP (no wallet). Progress is not saved for guests.
  walletError = null;

  const endpointToUse = serverEndpoint || getSelectedServerEndpoint();
  // Preserve desired PvP mode across cleanupPvP()
  const desiredTurnMode = TURN_BASED_PVP_ENABLED;
  const desiredRoomName = pvpOnlineRoomName;
  const previousMode = gameMode;
  gameMode = 'PvP';
  cleanupPvP();
  TURN_BASED_PVP_ENABLED = desiredTurnMode;
  pvpOnlineRoomName = desiredRoomName;

  if (!endpointToUse) {
    walletError = 'No PvP server available';
    gameMode = previousMode;
    return;
  }

  enterLobby(endpointToUse).catch((error) => {
    console.error('Failed to enter lobby:', error);
    gameMode = previousMode;
    isInLobby = false;
    isSearchingForMatch = false;
    currentMatch = null;
    walletError = 'Failed to enter lobby';
  });

  console.log('Entered PvP Online lobby via server:', endpointToUse);
  forceSaveGame();
}

function updateServerBrowserHover(mouseX: number, mouseY: number): void {
  serverBrowserHoverId = null;
  serverBrowserHoverClose = false;

  for (const region of serverBrowserHitRegions) {
    if (mouseX >= region.x && mouseX <= region.x + region.width &&
        mouseY >= region.y && mouseY <= region.y + region.height) {
      serverBrowserHoverId = region.id;
      break;
    }
  }

  serverBrowserHoverClose =
    mouseX >= serverBrowserCloseRegion.x && mouseX <= serverBrowserCloseRegion.x + serverBrowserCloseRegion.width &&
    mouseY >= serverBrowserCloseRegion.y && mouseY <= serverBrowserCloseRegion.y + serverBrowserCloseRegion.height;

  if (serverBrowserHoverId || serverBrowserHoverClose) {
    canvas.style.cursor = 'pointer';
  } else {
    canvas.style.cursor = 'default';
  }
}

function isPointInsideRegion(
  mouseX: number,
  mouseY: number,
  region: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    mouseX >= region.x &&
    mouseX <= region.x + region.width &&
    mouseY >= region.y &&
    mouseY <= region.y + region.height
  );
}

function getServerDisplayHost(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return url.host;
  } catch (error) {
    return endpoint;
  }
}

function getServerStatusColor(status: PvpServerStatus): string {
  if (status.status === 'online') {
    if (typeof status.pingMs === 'number' && status.pingMs <= 80) {
      return '#00aa00';
    }
    if (typeof status.pingMs === 'number' && status.pingMs <= 140) {
      return '#ffaa00';
    }
    return '#ff5500';
  }
  if (status.status === 'checking') {
    return '#ffaa00';
  }
  return '#ff1e1e';
}

function getServerPingText(status: PvpServerStatus): string {
  if (status.status === 'online' && typeof status.pingMs === 'number') {
    return `${status.pingMs}ms`;
  }
  if (status.status === 'offline') {
    return 'offline';
  }
  return 'checking...';
}

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
    // If the user connects after startup, restore local save immediately (old behavior).
    try {
      if ((state.isConnected && state.address) && !(window as any).__saveLoadedAfterWalletConnect) {
        (window as any).__saveLoadedAfterWalletConnect = true;
        const saveData = saveManager.load();
        if (saveData) loadGameState(saveData);
      }
    } catch {}
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

// Initialize Supabase Auth session (Email/OAuth) on startup
try {
  if (supabaseService.isConfigured()) {
    supabaseService.getAuthSession().then(({ userId, email }) => {
      authUserId = userId;
      authEmail = email;
      if (authUserId) {
        // Keep compatibility with existing code that reads ronin_address from localStorage.
        const ident = `auth_${authUserId}`;
        try {
          localStorage.setItem('ronin_address', ident);
        } catch {}
        // Load profile (saved progress) for this identity
        supabaseService.getProfile(ident).catch(() => {});
      }
    }).catch(() => {});

    supabaseService.onAuthStateChange((userId, email) => {
      authUserId = userId;
      authEmail = email;
      if (authUserId) {
        const ident = `auth_${authUserId}`;
        try {
          localStorage.setItem('ronin_address', ident);
        } catch {}
      } else {
        // If user signed out and no wallet is connected, clear legacy address key.
        try {
          const walletAddr = walletService.getState().address;
          if (!walletAddr) localStorage.removeItem('ronin_address');
        } catch {
          try { localStorage.removeItem('ronin_address'); } catch {}
        }
      }
    });
  }
} catch (e) {
  console.warn('Supabase auth init failed:', e);
}

// Profile Manager
const profileManager = new ProfileManager();

// Audio Manager
const audioManager = new AudioManager();

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

function lerpAngle(a: number, b: number, t: number): number {
  // Interpolate angles along the shortest arc.
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Frame-rate independent smoothing factor (same feel at 60fps and 30fps)
function smoothT(perFrameTAt60: number, dtMs: number): number {
  const dtFrames = clamp(dtMs / (1000 / 60), 0, 6);
  // Convert "per-frame lerp t" into an equivalent over dtFrames
  // t_eff = 1 - (1 - t)^dtFrames
  const t = clamp(perFrameTAt60, 0, 1);
  return 1 - Math.pow(1 - t, dtFrames);
}

// Frame time tracking (to detect frame pacing issues)
let frameTimeHistory: number[] = [];
let averageFrameTime = 16.67; // 60 FPS = 16.67ms per frame
let maxFrameTime = 16.67;

// Network latency tracking (for PvP mode)
let networkLatencyHistory: number[] = [];
let averageNetworkLatency = 0;
let lastNetworkUpdateTime = 0;

// --- Opponent render interpolation (arrow-like smoothness) ---
// We keep a short history of opponent positions (post-correction) and render slightly "in the past"
// using interpolation between snapshots. This removes visible snap/jitter without changing gameplay physics.
type OpponentPosSample = { t: number; x: number; y: number; vx: number; vy: number };
let opponentPosSamples: OpponentPosSample[] = [];
function resetOpponentInterpolation(): void {
  opponentPosSamples = [];
}
function pushOpponentSample(now: number, p: PvPPlayer): void {
  opponentPosSamples.push({ t: now, x: p.x, y: p.y, vx: p.vx, vy: p.vy });
  // Keep only recent samples (2s is plenty)
  const cutoff = now - 2000;
  while (opponentPosSamples.length > 0 && opponentPosSamples[0].t < cutoff) {
    opponentPosSamples.shift();
  }
  // Bound size to avoid growth in weird cases
  if (opponentPosSamples.length > 120) {
    opponentPosSamples.splice(0, opponentPosSamples.length - 120);
  }
}
function getOpponentInterpolatedPos(now: number): { x: number; y: number } | null {
  if (!opponentId || opponentPosSamples.length === 0) return null;

  // Small adaptive delay: enough to always have two samples to interpolate, but still feels "instant".
  const delayMs = Math.max(70, Math.min(160, Math.round((averageNetworkLatency || 0) * 0.35)));
  const targetT = now - delayMs;

  // Ensure samples sorted by time (they should be, but be safe on out-of-order)
  // (Tiny O(n) check avoided; assume ordered.)
  const samples = opponentPosSamples;

  // If target is before first sample, just use first.
  if (targetT <= samples[0].t) {
    return { x: samples[0].x, y: samples[0].y };
  }

  // Find the bracketing samples
  for (let i = samples.length - 1; i >= 1; i--) {
    const b = samples[i];
    const a = samples[i - 1];
    if (targetT >= a.t && targetT <= b.t) {
      const span = Math.max(1, b.t - a.t);
      const u = Math.max(0, Math.min(1, (targetT - a.t) / span));
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u;
      return { x, y };
    }
  }

  // Target is after the latest sample -> extrapolate a bit using last velocity.
  const last = samples[samples.length - 1];
  const dtMs = Math.max(0, Math.min(200, targetT - last.t)); // cap extrapolation to 200ms
  const dtFrames = dtMs / (1000 / 60);
  return { x: last.x + last.vx * dtFrames, y: last.y + last.vy * dtFrames };
}

function getOpponentInterpolatedState(now: number): { x: number; y: number; vx: number; vy: number } | null {
  if (!opponentId || opponentPosSamples.length === 0) return null;
  const delayMs = Math.max(70, Math.min(160, Math.round((averageNetworkLatency || 0) * 0.35)));
  const targetT = now - delayMs;
  const samples = opponentPosSamples;

  if (targetT <= samples[0].t) {
    const s = samples[0];
    return { x: s.x, y: s.y, vx: s.vx, vy: s.vy };
  }

  for (let i = samples.length - 1; i >= 1; i--) {
    const b = samples[i];
    const a = samples[i - 1];
    if (targetT >= a.t && targetT <= b.t) {
      const span = Math.max(1, b.t - a.t);
      const u = Math.max(0, Math.min(1, (targetT - a.t) / span));
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        // Interpolate velocity too so rotation uses the same "render time" signal.
        vx: a.vx + (b.vx - a.vx) * u,
        vy: a.vy + (b.vy - a.vy) * u,
      };
    }
  }

  const last = samples[samples.length - 1];
  const dtMs = Math.max(0, Math.min(200, targetT - last.t));
  const dtFrames = dtMs / (1000 / 60);
  return { x: last.x + last.vx * dtFrames, y: last.y + last.vy * dtFrames, vx: last.vx, vy: last.vy };
}

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
  color?: string; // optional rgba()/css color override (default: black)
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

// Arrow air-resistance particles (subtle streaks while flying)
let arrowAirParticles: Particle[] = [];
// Keep this low: it's purely visual and can get expensive on weaker machines / high-latency stutter frames.
const MAX_ARROW_AIR_PARTICLES = 80;
function safePushArrowAirParticle(particle: Particle): void {
  if (arrowAirParticles.length >= MAX_ARROW_AIR_PARTICLES) {
    arrowAirParticles.shift();
  }
  arrowAirParticles.push(particle);
}

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

// Perf toggle: disable PvP UFO shadow tail (speed>=2) if it causes perceived stutter on remote clients.
// (Dash trail uses the same buffer; keep disabled for consistency.)
const PVP_UFO_SPEED_TRAIL_ENABLED = true;

// Perf toggle: disable agent debug logs that post to localhost (can cause micro-stutters in production).
const AGENT_DEBUG_LOGS_ENABLED = false;

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
// UFO tilt/sway effect for Solo mode
let soloUfoTilt = 0; // Current tilt angle (for balancing effect)
let soloLastVx = 0; // Previous velocity X (for acceleration calculation)
let soloLastVy = 0; // Previous velocity Y (for acceleration calculation)
const gravity = 0.05; // Reduced gravity (was 0.1)
const groundY = 1080 - 220; // Invisible ground 220px from bottom
// Former toxic-water band bottom floor: keep as a normal playable area.
// movingPlatformY = groundY - 2, bottomFloorY = movingPlatformY + 100 => groundY + 98
const PVP_BOTTOM_FLOOR_Y = groundY + 98;
let lastHitTime = 0; // Track when DOT was last hit
const gravityDelay = 1000; // 1 second delay before gravity starts (moved up another 60px)
let awaitingRestart = false;
let scheduledRestartAt = 0;
let groundShrinkStartAt = 0;
let gravityLocked = true; // Disable gravity until first successful DMG click
let gravityActiveUntil = 0; // When gravity should stop being active (0 = inactive)
const gravityActiveDuration = 5000; // Gravity active for 5 seconds after damage
const DAMAGE_GRAVITY_ENABLED = false; // Disable knockdown gravity after taking damage
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
  gravityActiveUntil: number; // When gravity should stop being active (0 = inactive)
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
  // Jetpack fuel system
  fuel: number; // Current fuel (0-maxFuel)
  maxFuel: number; // Maximum fuel
  isUsingJetpack: boolean; // Whether jetpack is currently active
  jetpackStartTime: number; // When jetpack was started (for fuel consumption)
  jetpackLastFuelTickTime: number; // Last timestamp when fuel was consumed (for dt-based consumption)
  lastFuelRegenTime: number; // When fuel was last regenerated
  // Overheat system
  isOverheated: boolean; // Whether jetpack is overheated
  overheatStartTime: number; // When overheat started (for 3 second duration)
  // Toxic water system removed
  // Profile picture (NFT image URL)
  profilePicture?: string; // NFT image URL for profile picture
  // UFO tilt/sway effect
  ufoTilt: number; // Current tilt angle (for balancing effect)
  lastVx: number; // Previous velocity X (for acceleration calculation)
  lastVy: number; // Previous velocity Y (for acceleration calculation)
  // UFO render smoothing (prevents flicker when vx crosses ~0 while drifting to neutral)
  facingLeft: boolean; // Stable facing direction (with hysteresis)
  renderAngle: number; // Smoothed render rotation angle
};

function setDamageGravity(player: PvPPlayer, now: number = Date.now()): void {
  player.gravityActiveUntil = DAMAGE_GRAVITY_ENABLED ? now + gravityActiveDuration : 0;
}

let pvpPlayers: { [playerId: string]: PvPPlayer } = {};
let myPlayerId: string | null = null; // My player ID
let opponentId: string | null = null; // Opponent player ID

// PvP/Training: global action rate limit (reduces spam + network load).
// "One action per 1 second": dash/shot/mine/click-hit are gated, but movement position sync continues.
const PVP_ACTION_COOLDOWN_MS = 1000;
const PVP_ACTION_PENALTY_MS = 2000;
const PVP_ACTION_DENIED_SFX_COOLDOWN_MS = 120;
const PVP_ACTION_INDICATOR_SHAKE_MS = 150;
const PVP_ACTION_INDICATOR_SHAKE_PX = 2.5;
let pvpNextActionAtById: { [playerId: string]: number } = {};
let pvpActionWindowMsById: { [playerId: string]: number } = {};
let pvpLastActionDeniedSfxAt = 0;
let pvpActionIndicatorShakeUntil = 0;
function canPerformPvpAction(playerId: string, now: number = Date.now()): boolean {
  const nextAt = pvpNextActionAtById[playerId] || 0;
  return now >= nextAt;
}
function commitPvpAction(playerId: string, now: number = Date.now()): void {
  pvpNextActionAtById[playerId] = now + PVP_ACTION_COOLDOWN_MS;
  pvpActionWindowMsById[playerId] = PVP_ACTION_COOLDOWN_MS;
}
function applyPvpActionPenalty(playerId: string, now: number = Date.now()): void {
  // Local feedback (sound + tiny indicator shake) when you attempt an action too early.
  if (playerId === myPlayerId) {
    if (now - pvpLastActionDeniedSfxAt >= PVP_ACTION_DENIED_SFX_COOLDOWN_MS) {
      pvpLastActionDeniedSfxAt = now;
      pvpActionIndicatorShakeUntil = Math.max(pvpActionIndicatorShakeUntil, now + PVP_ACTION_INDICATOR_SHAKE_MS);
      try {
        void audioManager.resumeContext();
        // Prefer a dedicated short "denied" blip, fall back to an existing fail sound.
        (audioManager as any).playActionDenied?.() ?? audioManager.playUpgradeFail();
      } catch {}
    } else {
      pvpActionIndicatorShakeUntil = Math.max(pvpActionIndicatorShakeUntil, now + Math.floor(PVP_ACTION_INDICATOR_SHAKE_MS * 0.6));
    }
  }

  const prevNextAt = pvpNextActionAtById[playerId] || 0;
  const penaltyNextAt = now + PVP_ACTION_PENALTY_MS;
  // Never reduce an existing longer lockout; only extend.
  if (penaltyNextAt > prevNextAt) {
    pvpNextActionAtById[playerId] = penaltyNextAt;
    pvpActionWindowMsById[playerId] = PVP_ACTION_PENALTY_MS;
  }
}

// PvP Dash (Space): short burst "blink" movement for snappier gameplay with minimal network spam.
const PVP_DASH_DISTANCE = 152; // px (instant displacement) (20% shorter)
const PVP_DASH_COOLDOWN_MS = 900; // ms
const PVP_DASH_FUEL_COST = 22; // fuel per dash (reuses existing fuel bar)
const PVP_DASH_EXIT_IMPULSE = 3.8; // additional velocity kick (px/frame)
let pvpDashCooldownUntilById: { [playerId: string]: number } = {};

function clampPvpPosForPlayer(playerId: string, x: number, y: number, radius: number): { x: number; y: number } {
  // Use mid-wall side constraints + arena bounds (or full width when mid-wall disabled)
  if (!PVP_MID_WALL_ENABLED) {
    let nx = Math.max(pvpBounds.left + radius, Math.min(pvpBounds.right - radius, x));
    let ny = Math.max(pvpBounds.top + radius, Math.min(pvpBounds.bottom - radius, y));
    // Keep dashes/teleports from landing inside the center obstacle.
    if (PVP_CENTER_OBSTACLE_ENABLED && (gameMode === 'PvP' || gameMode === 'Training')) {
      const hit = collideCircleWithStone(nx, ny, radius);
      if (hit) {
        nx += hit.nx * (hit.depth + 0.25);
        ny += hit.ny * (hit.depth + 0.25);
      }
    }
    return { x: nx, y: ny };
  }
  const midX = getPvpMidWallX();
  const half = PVP_MID_WALL_THICKNESS / 2;
  const side = ensurePvpSide(playerId, x);
  const minX = side === 'left' ? pvpBounds.left + radius : midX + half + radius;
  const maxX = side === 'left' ? midX - half - radius : pvpBounds.right - radius;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(pvpBounds.top + radius, Math.min(pvpBounds.bottom - radius, y))
  };
}

function tryDashPlayer(playerId: string, player: PvPPlayer, aimX: number, aimY: number, send: (input: any) => void): void {
  const now = Date.now();
  if (player.isOut || player.hp <= 0 || deathAnimations.has(playerId)) return;
  if (player.paralyzedUntil > now) return;

  // Global action limit: dash counts as an action.
  if (!canPerformPvpAction(playerId, now)) {
    applyPvpActionPenalty(playerId, now);
    return;
  }

  const cdUntil = pvpDashCooldownUntilById[playerId] || 0;
  if (now < cdUntil) return;
  if (player.fuel < PVP_DASH_FUEL_COST) return;

  // Direction: towards cursor; fallback to current velocity direction.
  let dx = aimX - player.x;
  let dy = aimY - player.y;
  let dist = Math.sqrt(dx * dx + dy * dy);
  if (!(dist > 0.5)) {
    const v = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (v > 0.5) {
      dx = player.vx;
      dy = player.vy;
      dist = v;
    } else {
      // No direction information -> do nothing (prevents random blink)
      return;
    }
  }
  const dirX = dx / dist;
  const dirY = dy / dist;

  const fromX = player.x;
  const fromY = player.y;
  const target = clampPvpPosForPlayer(playerId, player.x + dirX * PVP_DASH_DISTANCE, player.y + dirY * PVP_DASH_DISTANCE, player.radius);
  player.x = target.x;
  player.y = target.y;
  // Small exit impulse so it feels like a burst, not a teleport.
  player.vx += dirX * PVP_DASH_EXIT_IMPULSE;
  player.vy += dirY * PVP_DASH_EXIT_IMPULSE;
  if (PVP_MID_WALL_ENABLED) enforcePvpMidWall(playerId, player);

  // Consume fuel and set cooldown (reuses existing fuel UI).
  player.fuel = Math.max(0, player.fuel - PVP_DASH_FUEL_COST);
  pvpDashCooldownUntilById[playerId] = now + PVP_DASH_COOLDOWN_MS;
  commitPvpAction(playerId, now);

  if (PVP_UFO_SPEED_TRAIL_ENABLED) {
    // Visual: inject a denser speed trail along the dash path (no new renderer needed).
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      player.speedTrail.push({
        x: fromX + (player.x - fromX) * t,
        y: fromY + (player.y - fromY) * t,
        vx: 0,
        vy: 0,
        life: 22,
        maxLife: 22,
        size: player.radius * 1.8
      });
    }
    while (player.speedTrail.length > 18) player.speedTrail.shift();
  } else if (player.speedTrail.length) {
    player.speedTrail.length = 0;
  }

  // Audio: reuse an existing short "burst" sound (keeps changes minimal).
  try {
    void audioManager.resumeContext();
    audioManager.playBounce();
  } catch {}

  // Network: broadcast discrete dash event so opponent sees it instantly (not waiting for position stream).
  send({
    type: 'dash',
    timestamp: now,
    x: player.x,
    y: player.y,
    vx: player.vx,
    vy: player.vy
  });
}

// Jetpack fuel carryover between PvP rounds/resets (no auto-refill)
const PVP_DEFAULT_MAX_FUEL = 150; // Increased fuel capacity for longer travel
let pvpFuelCarryoverById: { [playerId: string]: number } = {};
function snapshotPvpFuelCarryover(): void {
  try {
    for (const id of Object.keys(pvpPlayers || {})) {
      const f: any = (pvpPlayers as any)?.[id]?.fuel;
      const mf: any = (pvpPlayers as any)?.[id]?.maxFuel;
      const maxFuel = (typeof mf === 'number' && Number.isFinite(mf) && mf > 0) ? mf : PVP_DEFAULT_MAX_FUEL;
      if (typeof f === 'number' && Number.isFinite(f)) {
        pvpFuelCarryoverById[id] = Math.max(0, Math.min(maxFuel, f));
      }
    }
  } catch {}
}
function getCarryoverFuel(playerId: string, fallback: number = PVP_DEFAULT_MAX_FUEL, maxFuel: number = PVP_DEFAULT_MAX_FUEL): number {
  const f = pvpFuelCarryoverById[playerId];
  const mf = (typeof maxFuel === 'number' && Number.isFinite(maxFuel) && maxFuel > 0) ? maxFuel : PVP_DEFAULT_MAX_FUEL;
  const fb = (typeof fallback === 'number' && Number.isFinite(fallback)) ? fallback : mf;
  return (typeof f === 'number' && Number.isFinite(f)) ? Math.max(0, Math.min(mf, f)) : Math.max(0, Math.min(mf, fb));
}

// PvP mid-wall: split arena into left/right halves (players cannot cross; projectiles can).
// NOTE: User requested to remove the middle wall (full arena movement). Keep the code gated so it can be re-enabled later.
type PvPSide = 'left' | 'right';
let pvpSideById: { [playerId: string]: PvPSide } = {};
const PVP_MID_WALL_ENABLED = false;
const PVP_MID_WALL_THICKNESS = 12; // Visual + collision thickness (px)

// Center obstacle (replaces the old mid-wall): stone sprite + compound collision (matches silhouette).
const PVP_CENTER_OBSTACLE_ENABLED = true;
const PVP_CENTER_OBSTACLE_RENDER_RADIUS = 132; // px (visual size)
const PVP_CENTER_OBSTACLE_SOFT_PUSH = 0.22; // how much velocity to damp along normal when colliding
// Visual: halo/rim-light around stone (like an eclipse, as if a bright light source is behind the stone).
const PVP_STONE_HALO_ENABLED = true;
const PVP_STONE_HALO_COLOR = 'rgba(210, 235, 255, 0.55)';
const PVP_STONE_HALO_COLOR_INNER = 'rgba(255, 255, 255, 0.22)';
const PVP_STONE_HALO_BLUR_PX = 22;
const PVP_STONE_HALO_BLUR_INNER_PX = 10;
// Stone sprite is 1536x1024 => aspect = 0.6667 (height/width).
const PVP_STONE_ASPECT = 0.6667;
// Compound hitbox circles in normalized space:
// - u, v are relative to stone half-width/half-height
// - r is relative to stone base radius (= half-height)
const PVP_STONE_HITBOX: Array<{ u: number; v: number; r: number }> = [
  { u: 0.02, v: 0.06, r: 0.92 },  // main mass
  { u: -0.44, v: 0.10, r: 0.62 }, // left bulge
  { u: 0.46, v: -0.02, r: 0.62 }, // right bulge
  { u: -0.06, v: 0.58, r: 0.56 }, // bottom mass
  // Top was sticking out too much; make it tighter so arrows don't "hit air" above the sprite.
  { u: -0.10, v: -0.36, r: 0.32 }, // top mass (reduced)
  { u: 0.18, v: -0.26, r: 0.28 }   // top-right bump (reduced)
];

// Debug: visualize stone compound hitbox circles (numbered) to tune collision fairness.
// Keep OFF by default (hitboxes are meant to be invisible in gameplay).
const PVP_STONE_HITBOX_DEBUG = false;

function getPvpCenterObstacle(): { x: number; y: number; renderR: number; halfW: number; halfH: number; baseR: number } {
  const x = (pvpBounds.left + pvpBounds.right) / 2;
  // Place slightly above vertical center so it feels like an arena centerpiece.
  const y = pvpBounds.top + (PVP_BOTTOM_FLOOR_Y - pvpBounds.top) * 0.50;
  return {
    x,
    y,
    renderR: PVP_CENTER_OBSTACLE_RENDER_RADIUS,
    // Match render sizing used in draw: worldW = renderR * 2.05 => halfW = renderR * 1.025
    halfW: PVP_CENTER_OBSTACLE_RENDER_RADIUS * 1.025,
    halfH: PVP_CENTER_OBSTACLE_RENDER_RADIUS * 1.025 * PVP_STONE_ASPECT,
    baseR: PVP_CENTER_OBSTACLE_RENDER_RADIUS * 1.025 * PVP_STONE_ASPECT
  };
}

function collideCircleWithStone(cx: number, cy: number, cr: number): null | { nx: number; ny: number; depth: number } {
  if (!PVP_CENTER_OBSTACLE_ENABLED) return null;
  if (gameMode !== 'PvP' && gameMode !== 'Training') return null;
  const o = getPvpCenterObstacle();
  // Quick reject: bounding circle
  const br = Math.max(o.halfW, o.halfH) + cr + 4;
  const qx = cx - o.x;
  const qy = cy - o.y;
  if (qx * qx + qy * qy > br * br) return null;

  let best: null | { nx: number; ny: number; depth: number } = null;
  for (const c of PVP_STONE_HITBOX) {
    const sx = o.x + c.u * o.halfW;
    const sy = o.y + c.v * o.halfH;
    const rr = c.r * o.baseR;
    const dx = cx - sx;
    const dy = cy - sy;
    const minDist = cr + rr;
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

function enforcePvpCenterObstacle(player: PvPPlayer): void {
  if (!PVP_CENTER_OBSTACLE_ENABLED) return;
  if (gameMode !== 'PvP' && gameMode !== 'Training') return;
  const hit = collideCircleWithStone(player.x, player.y, player.radius);
  if (!hit) return;
  player.x += hit.nx * (hit.depth + 0.25);
  player.y += hit.ny * (hit.depth + 0.25);
  const vn = player.vx * hit.nx + player.vy * hit.ny;
  if (vn < 0) {
    player.vx -= vn * hit.nx * (1 + PVP_CENTER_OBSTACLE_SOFT_PUSH);
    player.vy -= vn * hit.ny * (1 + PVP_CENTER_OBSTACLE_SOFT_PUSH);
  }
}

function getPvpMidWallX(): number {
  return (pvpBounds.left + pvpBounds.right) / 2;
}

function ensurePvpSide(playerId: string, fallbackX: number): PvPSide {
  const existing = pvpSideById[playerId];
  if (existing === 'left' || existing === 'right') return existing;
  const side: PvPSide = fallbackX < getPvpMidWallX() ? 'left' : 'right';
  pvpSideById[playerId] = side;
  return side;
}

function enforcePvpMidWall(playerId: string, player: PvPPlayer): void {
  if (gameMode !== 'PvP' && gameMode !== 'Training') return;
  if (!PVP_MID_WALL_ENABLED) return;
  const midX = getPvpMidWallX();
  const half = PVP_MID_WALL_THICKNESS / 2;
  const side = ensurePvpSide(playerId, player.x);

  if (side === 'left') {
    const maxX = midX - half - player.radius;
    if (player.x > maxX) {
      player.x = maxX;
      if (player.vx > 0) player.vx = 0;
    }
  } else {
    const minX = midX + half + player.radius;
    if (player.x < minX) {
      player.x = minX;
      if (player.vx < 0) player.vx = 0;
    }
  }
}

// --- Turn-based PvP (micro-turn) ---
// This is enabled only when player chooses "5SEC PVP" mode.
let TURN_BASED_PVP_ENABLED = false;
type TurnPhase = 'lobby' | 'planning' | 'execute';
type TurnShotType = 'arrow' | 'bullet' | 'projectile';
type TurnShotPlan = { tMs: number; type: TurnShotType; aimX: number; aimY: number };
type TurnPlan = { track: Array<{ tMs: number; x: number; y: number }>; spawns: Array<{ tMs: number; projType: TurnShotType; x: number; y: number; vx: number; vy: number }>; stats?: { dmg?: number; critChance?: number } };
type DefendDir = 'up' | 'down' | 'stay';

let turnPhase: TurnPhase = 'lobby';
let turnRoundId = 0;
let turnPhaseEndsAt = 0;
let turnExecuteStartAt = 0;
let turnExecuteDurationMs = 5000;
let turnMoveSpeed = 900; // px/s (server authoritative)
let turnWindupMs = 200;
let turnWeapon: TurnShotType = 'bullet';
let turnLocked = false;
let turnServerSynced = false; // becomes true only after seeing server phase/execute payload
let turnWaitStartAt = 0; // used to detect outdated server (no phase messages)
let autoReadySent = false;
let turnServerClockOffsetMs = 0; // serverNow - clientNow

// (attacker/defender model state removed; 5SEC PvP uses planning + replay)
let turnAttackerId: string | null = null;
let turnDefenderId: string | null = null;
let turnDefendOptions: DefendDir[] = [];
let turnDefendChoice: DefendDir | null = null;
let turnDefendChoiceSentForRound = 0;
let turnDefendOptionsRoundId = 0;
let turnDefendUiRects: Array<{ x: number; y: number; w: number; h: number; choice: DefendDir }> = [];
let turnAttackClickMarker: { x: number; y: number; untilMs: number } | null = null;
let turnDefendMs = 3000;
let turnSyncMs = 1000;
let turnAttackMs = 4000;
let turnResolveMs = 2000;
let turnDefenderMoveSpeed = 900;
let turnPlanStartServerTs = 0;
let turnPlanDurationMs = 5000;
let turnLastTrackSampleServerTs = 0;
let turnLastPlanSendServerTs = 0;
let turnLocalTrack: Array<{ tMs: number; x: number; y: number }> = [];
let turnLocalSpawns: Array<{ tMs: number; projType: TurnShotType; x: number; y: number; vx: number; vy: number }> = [];
let turnPlanSendFailCount = 0;

// Payload from server for current execute phase
let turnPlansById: Record<string, TurnPlan> = {};
let turnEvents: any[] = [];
let turnExecuteSeed = 0;
let turnFinalPlayers: Record<string, { x: number; y: number; hp: number; armor: number }> = {};
let turnLastRoundExecuteAt = 0;
let turnExecuteLoggedRound = 0;

// Local playback state
let turnStartPosById: Record<string, { x: number; y: number }> = {};
let turnSpawnedProjectiles: Set<string> = new Set();
let turnProcessedHits: Set<string> = new Set();
let turnProjectiles: Array<{ id: string; shooterId: string; projType: TurnShotType; x: number; y: number; vx: number; vy: number }> = [];
let turnNextEventIndex = 0;

const TURN_MAX_SHOTS = 3;
const TURN_SHOT_TIMES_MS = [1000, 2500, 4000]; // 3 shots per execute

function isTurnBasedPvP(): boolean {
  // Don't depend on currentMatch (it can be null during transitions); Colyseus connection is enough.
  return TURN_BASED_PVP_ENABLED && gameMode === 'PvP' && colyseusService.isConnectedToRoom() && turnServerSynced && turnPhase !== 'lobby';
}

function isTurnBasedPvPDesired(): boolean {
  // Used to disable legacy realtime simulation *only during EXECUTE replay* for 5SEC PVP.
  return is5SecPvPMode() && turnPhase === 'execute' && turnServerSynced;
}

function isMyTurnDefender(): boolean {
  return !!myPlayerId && !!turnDefenderId && myPlayerId === turnDefenderId;
}

function isMyTurnAttacker(): boolean {
  return !!myPlayerId && !!turnAttackerId && myPlayerId === turnAttackerId;
}

function resetTurnBasedPlayback(): void {
  turnSpawnedProjectiles = new Set();
  turnProcessedHits = new Set();
  turnProjectiles = [];
  turnNextEventIndex = 0;
  turnStartPosById = {};
  turnLastTrackSampleServerTs = 0;
  turnLastPlanSendServerTs = 0;
  turnLocalTrack = [];
  turnLocalSpawns = [];
  turnPlanSendFailCount = 0;
  // IMPORTANT: do NOT wipe `turnDefendOptions` here.
  // Server may deliver `defend_options` before the `phase` message; if we clear here, defender can't pick a direction.
  turnDefendChoice = null;
  turnDefendChoiceSentForRound = 0;
  turnDefendUiRects = [];
  turnAttackClickMarker = null;
}

function clampTurnDestForMySide(x: number, y: number): { x: number; y: number } {
  if (!myPlayerId || !pvpPlayers[myPlayerId]) return { x, y };
  const p = pvpPlayers[myPlayerId];
  // If mid-wall is disabled, clamp only to arena bounds (full width movement).
  if (!PVP_MID_WALL_ENABLED) {
    let nx = Math.max(pvpBounds.left + p.radius, Math.min(pvpBounds.right - p.radius, x));
    let ny = Math.max(pvpBounds.top + p.radius, Math.min(pvpBounds.bottom - p.radius, y));
    if (PVP_CENTER_OBSTACLE_ENABLED && (gameMode === 'PvP' || gameMode === 'Training')) {
      const hit = collideCircleWithStone(nx, ny, p.radius);
      if (hit) {
        nx += hit.nx * (hit.depth + 0.25);
        ny += hit.ny * (hit.depth + 0.25);
      }
    }
    return { x: nx, y: ny };
  }
  // Otherwise reuse mid-wall side constraints
  const midX = getPvpMidWallX();
  const half = PVP_MID_WALL_THICKNESS / 2;
  const side = ensurePvpSide(myPlayerId, p.x);
  const minX = side === 'left' ? pvpBounds.left + p.radius : midX + half + p.radius;
  const maxX = side === 'left' ? midX - half - p.radius : pvpBounds.right - p.radius;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(pvpBounds.top + p.radius, Math.min(pvpBounds.bottom - p.radius, y))
  };
}

function getMyTurnPlan(): TurnPlan {
  // Legacy helper (old turn-based prototype). 5SEC PVP uses shadow recording (track+spawns).
  const existing = (myPlayerId && turnPlansById[myPlayerId]) ? turnPlansById[myPlayerId] : null;
  return existing || ({ track: [], spawns: [], stats: { dmg, critChance } } as any);
}

function setMyTurnDest(x: number, y: number): void {
  // Deprecated (old prototype)
  void x; void y;
}

function addMyTurnShot(aimX: number, aimY: number): void {
  // Deprecated (old prototype)
  void aimX; void aimY;
}

function clearMyTurnShots(): void {
  // Deprecated (old prototype)
}

function is5SecPvPMode(): boolean {
  return TURN_BASED_PVP_ENABLED && gameMode === 'PvP' && colyseusService.isConnectedToRoom() && pvpOnlineRoomName === 'pvp_5sec_room';
}

function ensure5SecPvPPlayersFromRoom(): void {
  if (!is5SecPvPMode()) return;
  const room: any = colyseusService.getRoom();
  const state: any = room?.state;
  if (!room || !state?.players) return;
  const keys: string[] = Array.from(state.players.keys ? state.players.keys() : []) as string[];
  if (keys.length < 2) return;
  const mySid: string | null = typeof room.sessionId === 'string' ? room.sessionId : null;
  const oppSid: string | null = (mySid ? (keys.find((k) => k !== mySid) || null) : null);
  if (!mySid || !oppSid) return;
  if (!myPlayerId || !pvpPlayers[mySid] || !opponentId || !pvpPlayers[oppSid]) {
    // Ensure side assignment + player objects exist as early as possible (phase may arrive before game_start handler runs)
    initializePvPWithColyseus(room, mySid, oppSid);
  }
}

function getServerNowMs(): number {
  return Date.now() + (turnServerClockOffsetMs || 0);
}

function recordTurnTrackAndMaybeSend(): void {
  if (!is5SecPvPMode() || turnPhase !== 'planning' || !myPlayerId || !pvpPlayers[myPlayerId] || !turnPlanStartServerTs) return;
  const nowServer = getServerNowMs();
  const duration = turnExecuteDurationMs || 5000;
  const tMs = Math.max(0, Math.min(duration, Math.round(nowServer - turnPlanStartServerTs)));
  if (turnLocalTrack.length === 0) {
    const me0 = pvpPlayers[myPlayerId];
    turnLocalTrack.push({ tMs: 0, x: me0.x, y: me0.y });
  }
  if (nowServer - turnLastTrackSampleServerTs >= 100) {
    turnLastTrackSampleServerTs = nowServer;
    const me = pvpPlayers[myPlayerId];
    // Mid-wall can be disabled (full arena movement)
    if (PVP_MID_WALL_ENABLED) enforcePvpMidWall(myPlayerId, me);
    turnLocalTrack.push({ tMs, x: me.x, y: me.y });
    if (turnLocalTrack.length > 90) {
      turnLocalTrack.shift();
    }
  }

  // Periodically send plan updates to server (keeps latest shadow recording)
  if (nowServer - turnLastPlanSendServerTs >= 250) {
    turnLastPlanSendServerTs = nowServer;
    const me = pvpPlayers[myPlayerId];
    // IMPORTANT: Server computes EXECUTE damage from plan.stats.dmg/critChance.
    // Include Ronkeverse NFT bonuses here so EXECUTE matches what you see during planning.
    const nftBonuses = calculateNftBonuses();
    const totalDmg = dmg + (nftBonuses?.dmg || 0);
    const totalCritChance = critChance + (nftBonuses?.critChance || 0);
    const ok = colyseusService.sendPlan({
      track: turnLocalTrack,
      spawns: turnLocalSpawns,
      // Share limited live intel during planning: fuel usage.
      stats: { dmg: totalDmg, critChance: totalCritChance, fuel: me?.fuel, maxFuel: me?.maxFuel }
    });
    if (!ok) turnPlanSendFailCount++;
  }
}

function recordTurnSpawn(projType: TurnShotType, x: number, y: number, vxPerFrame: number, vyPerFrame: number): void {
  if (!is5SecPvPMode() || turnPhase !== 'planning' || !turnPlanStartServerTs) return;
  const nowServer = getServerNowMs();
  const duration = turnExecuteDurationMs || 5000;
  const tMs = Math.max(0, Math.min(duration, Math.round(nowServer - turnPlanStartServerTs)));
  // Convert px/frame -> px/sec (game uses ~60fps units for velocities)
  const vx = vxPerFrame * 60;
  const vy = vyPerFrame * 60;
  turnLocalSpawns.push({ tMs, projType, x, y, vx, vy });
  if (turnLocalSpawns.length > 60) {
    turnLocalSpawns.shift();
  }
  // Send immediately on spawn for responsiveness
  // Include NFT bonuses so server uses correct damage/crit for EXECUTE.
  const nftBonuses = calculateNftBonuses();
  const totalDmg = dmg + (nftBonuses?.dmg || 0);
  const totalCritChance = critChance + (nftBonuses?.critChance || 0);
  const ok = colyseusService.sendPlan({
    track: turnLocalTrack,
    spawns: turnLocalSpawns,
    stats: { dmg: totalDmg, critChance: totalCritChance }
  });
  if (!ok) turnPlanSendFailCount++;
}

function updateTurnBasedPvP(nowMs: number): void {
  // If turn-based is desired but server hasn't started sending phase yet, freeze legacy controls
  // and show "waiting" overlay (render does that).
  if (isTurnBasedPvPDesired() && !turnServerSynced) {
    for (const pid in pvpPlayers) {
      pvpPlayers[pid].vx = 0;
      pvpPlayers[pid].vy = 0;
    }
    return;
  }
  if (!isTurnBasedPvP()) return;
  const dtSec = 1 / 60; // This codebase runs most physics in "per-frame" terms

  // 5SEC PvP: planning is "shadow play" (do not freeze). Execute uses deterministic replay.
  if (turnPhase === 'planning') {
    return;
  }

  if (turnPhase !== 'execute' || !turnExecuteStartAt || nowMs < turnExecuteStartAt) {
    return; // waiting for execute start
  }

  const tMs = Math.max(0, Math.min(turnExecuteDurationMs, nowMs - turnExecuteStartAt));
  const sampleTrack = (track: Array<{ tMs: number; x: number; y: number }>, atMs: number): { x: number; y: number } | null => {
    if (!track || track.length === 0) return null;
    if (atMs <= track[0].tMs) return { x: track[0].x, y: track[0].y };
    for (let i = 0; i < track.length - 1; i++) {
      const a = track[i];
      const b = track[i + 1];
      if (atMs >= a.tMs && atMs <= b.tMs) {
        const span = Math.max(1, b.tMs - a.tMs);
        const t = (atMs - a.tMs) / span;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    const last = track[track.length - 1];
    return { x: last.x, y: last.y };
  };

  // Move players along their recorded tracks
  for (const pid of Object.keys(turnPlansById || {})) {
    const pl = pvpPlayers[pid];
    const plan = turnPlansById[pid];
    if (!pl || !plan) continue;

    const pos = sampleTrack(plan.track, tMs) || { x: pl.x, y: pl.y };
    pl.vx = (pos.x - pl.x); // approx px/frame
    pl.vy = (pos.y - pl.y);
    pl.x = pos.x;
    pl.y = pos.y;
    enforcePvpMidWall(pid, pl);
  }

  // EXECUTE replay: generate the same UFO speed shadow tail based on replay velocity.
  // (Legacy realtime physics is disabled during execute, so without this the tail never appears.)
  for (const pid of Object.keys(turnPlansById || {})) {
    const pl = pvpPlayers[pid];
    if (!pl) continue;
    const speedSquared = pl.vx * pl.vx + pl.vy * pl.vy;
    const speed = Math.sqrt(speedSquared);
    if (PVP_UFO_SPEED_TRAIL_ENABLED && speed >= 2) {
      pl.speedTrail.push({
        x: pl.x,
        y: pl.y,
        vx: 0,
        vy: 0,
        life: 16,
        maxLife: 16,
        size: pl.radius * 1.2
      });
      if (pl.speedTrail.length > 8) pl.speedTrail.shift();
    } else if (!PVP_UFO_SPEED_TRAIL_ENABLED && pl.speedTrail.length) {
      pl.speedTrail.length = 0;
    }
    for (let i = pl.speedTrail.length - 1; i >= 0; i--) {
      pl.speedTrail[i].life--;
      if (pl.speedTrail[i].life <= 0) pl.speedTrail.splice(i, 1);
    }
  }

  // Process events up to current time (projectile spawns + hits)
  const mySid: string | null = (() => {
    try { return (colyseusService.getRoom() as any)?.sessionId ?? null; } catch { return null; }
  })();
  while (turnNextEventIndex < turnEvents.length) {
    const evt = turnEvents[turnNextEventIndex];
    if (!evt || typeof evt.tMs !== 'number') {
      turnNextEventIndex++;
      continue;
    }
    if (evt.tMs > tMs) break;

    if (evt.type === 'projectile_spawn') {
      const projId = String(evt.projectileId);
      if (!turnSpawnedProjectiles.has(projId)) {
        turnSpawnedProjectiles.add(projId);
        const projType = (evt.projType === 'arrow' || evt.projType === 'bullet' || evt.projType === 'projectile') ? evt.projType : 'bullet';
        try {
          void audioManager.resumeContext();
          if (projType === 'bullet') audioManager.playBulletShot();
          else if (projType === 'arrow') audioManager.playArrowShot();
          else audioManager.playProjectileLaunch();
        } catch {}
        const spawnX = Number(evt.x);
        const spawnY = Number(evt.y);
        const spawnVx = Number(evt.vx);
        const spawnVy = Number(evt.vy);
        const elapsedSec = Math.max(0, (tMs - evt.tMs) / 1000);
        const g = projType === 'projectile' ? (0.32 * 60 * 60) : 0;
        const x = spawnX + spawnVx * elapsedSec;
        const y = spawnY + spawnVy * elapsedSec + 0.5 * g * elapsedSec * elapsedSec;
        const vy = spawnVy + g * elapsedSec;
        turnProjectiles.push({ id: projId, shooterId: String(evt.shooterId), projType, x, y, vx: spawnVx, vy });
      }
    }

    if (evt.type === 'hit') {
      const targetId = String(evt.targetId);
      const dmgAmount = Number(evt.damage) || 0;
      const isCritHit = !!evt.isCrit;
      const shooterId = String(evt.shooterId);

      try {
        const hitKey = `${String(evt.projectileId)}:${shooterId}:${targetId}:${String(evt.tMs)}`;
        if (!turnProcessedHits.has(hitKey)) {
          turnProcessedHits.add(hitKey);
          void audioManager.resumeContext();
          if (mySid && shooterId === mySid) audioManager.playDamageDealt(isCritHit);
          else if (mySid && targetId === mySid) audioManager.playDamageReceived(isCritHit);
          else audioManager.playDotHit();
        }
      } catch {}

      const target = pvpPlayers[targetId];
      if (target && dmgAmount > 0) {
        const absorbed = Math.min(dmgAmount, target.armor);
        target.armor -= absorbed;
        const remaining = dmgAmount - absorbed;
        target.hp = Math.max(0, target.hp - remaining);

        safePushDamageNumber({
          x: target.x + (Math.random() - 0.5) * 40,
          y: target.y - 20,
          value: dmgAmount,
          life: 60,
          maxLife: 60,
          vx: (Math.random() - 0.5) * 2,
          vy: -2 - Math.random() * 2,
          isCrit: isCritHit
        });
      }

      const projId = String(evt.projectileId);
      turnProjectiles = turnProjectiles.filter(p => p.id !== projId);
    }

    turnNextEventIndex++;
  }

  // Update projectiles forward (visual only)
  const g = 0.32 * 60 * 60;
  for (let i = turnProjectiles.length - 1; i >= 0; i--) {
    const p = turnProjectiles[i];
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
    if (p.projType === 'projectile') {
      p.vy += g * dtSec;
      if (p.vy > 0) {
        safePushProjectileSmokeParticle({
          x: p.x + (Math.random() - 0.5) * 4,
          y: p.y + (Math.random() - 0.5) * 4,
          vx: (Math.random() - 0.5) * 0.5,
          vy: -0.3 - Math.random() * 0.2,
          life: 30 + Math.random() * 20,
          maxLife: 30 + Math.random() * 20,
          size: 4 + Math.random() * 3
        });
      }
      // Keep stone as solid cover in turn-based visuals too.
      if (PVP_CENTER_OBSTACLE_ENABLED) {
        const hit = collideCircleWithStone(p.x, p.y, projectileRadius);
        if (hit) {
          triggerStoneShake(p.x, p.y, 1.2);
          createProjectileExplosion(p.x, p.y);
          createStoneImpactParticles(p.x, p.y);
          turnProjectiles.splice(i, 1);
          continue;
        }
      }
    }
    if (p.x < pvpBounds.left - 200 || p.x > pvpBounds.right + 200 || p.y < pvpBounds.top - 200 || p.y > pvpBounds.bottom + 200) {
      turnProjectiles.splice(i, 1);
    }
  }

  // End of execute: snap to server final state (prevents drift)
  if (tMs >= turnExecuteDurationMs && turnFinalPlayers && typeof turnFinalPlayers === 'object') {
    for (const pid of Object.keys(turnFinalPlayers)) {
      const fp = turnFinalPlayers[pid];
      const pl = pvpPlayers[pid];
      if (!fp || !pl) continue;
      pl.x = fp.x;
      pl.y = fp.y;
      pl.hp = fp.hp;
      pl.armor = fp.armor;
      pl.vx = 0;
      pl.vy = 0;
      if (PVP_MID_WALL_ENABLED) enforcePvpMidWall(pid, pl);
      if (PVP_MID_WALL_ENABLED) enforcePvpMidWall(pid, pl);
    }
  }
}

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
  bottom: PVP_BOTTOM_FLOOR_Y, // Use the true bottom floor so projectiles don't vanish in the former toxic-water band
};

// PvP physics constants
// Velocity damping (air resistance). Lower = more friction / less inertia.
const pvpFriction = 0.985; // baseline damping (applied every frame)
const pvpFrictionCoast = 0.97; // stronger damping when coasting (helps stop jetpack inertia)
const pvpGravity = 0.05; // Same as Solo gravity

// PvP movement feel: reducing impulse reduces perceived jitter under network correction.
const PVP_CLICK_FORCE = 3.9; // was ~4.6
const PVP_CLICK_FORCE_CRIT = 7.35; // was ~8.625

// PvP Bot AI
let botLastClickTime = 0;
let botLastSelfClickTime = 0;
const botClickCooldown = 500; // Minimum 500ms between bot clicks on blue player (less frequent)
const botSelfClickCooldown = 400; // Minimum 400ms between bot clicks on itself
const botClickChance = 0.25; // 25% chance to click on blue player (reduced to make it clear blue is player-controlled)
const botSelfClickChance = 0.3; // 30% chance to click on itself (to move around)

// PvP Heavy projectile (instant fire with arcing trajectory)
let projectileAiming = false; // Whether heavy shot is armed/aiming
let projectileFlying = false; // Whether projectile is flying
let projectileX = 0; // Current projectile position
let projectileY = 0;
let projectileVx = 0; // Projectile velocity X
let projectileVy = 0; // Projectile velocity Y
let projectileSpawnTime = 0; // When projectile was spawned (for 5 second lifetime)
let projectileBounceCount = 0; // How many times players have bounced on this projectile
let projectileLastShotTime = 0; // When projectile was last fired (for cooldown after hit)
let projectileLastUpdateAt = 0; // For time-based stepping (reduces FPS drift)
const projectileGravity = 0.32; // Stronger gravity for heavier arc
const projectileLaunchSpeed = 14.5; // Fixed launch speed (longer range)
const projectileRadius = 16; // Projectile size (doubled)
const projectileLifetime = 4500; // Projectile lifetime in milliseconds
const projectileMaxBounces = 2; // Maximum number of bounces allowed on projectile
const projectileCooldown = 3000; // Cooldown between shots (3 seconds)

// Bullet system (simple projectile, faster than arrow, smaller than projectile)
// Changed to array to support multiple bullets (burst fire)
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spawnTime: number;
}
let bullets: Bullet[] = []; // Array of flying bullets
let bulletLastShotTime = 0; // When bullet was last fired (for cooldown)
let shotsInBurst = 0; // Number of shots fired in current burst (0-2)
let lastBurstShotTime = 0; // When last shot in burst was fired
const bulletSpeed = 18; // Bullet speed (20% faster than arrow: 15 * 1.2 = 18)
const bulletRadius = 8; // Bullet size (doubled for heavier look)
const bulletCooldown = 5000; // Cooldown after burst (5 seconds after 2 shots)
const bulletBurstDelay = 200; // Delay between shots in burst (0.2 seconds)
const bulletLifetime = 3000; // Bullet lifetime in milliseconds (3 seconds)

// Mine/Trap system
interface Mine {
  x: number;
  y: number;
  spawnTime: number;
  exploded: boolean;
}
interface Spike {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spawnTime: number;
}
let mines: Mine[] = []; // Array of placed mines
let spikes: Spike[] = []; // Array of flying spikes from exploded mines
let mineLastPlaceTime = 0; // When mine was last placed (for cooldown)
const mineCooldown = 8000; // Cooldown between placing mines (8 seconds)
const mineLifetime = 10000; // Mine lifetime before auto-explosion (10 seconds)
const mineRadius = 12; // Mine collision radius (restored to original size)
const spikeSpeed = 12; // Spike speed after explosion
const spikeRadius = 4; // Spike collision radius (reduced from 6 to 4 for smaller spikes)
const spikeLifetime = 800; // Spike lifetime in milliseconds (reduced from 1.2s to 0.8s for even shorter flight distance)
const mineDamageMultiplier = 2.0; // Damage multiplier when stepping on mine (2x)
const spikeDamageMultiplier = 0.5; // Damage multiplier for spikes (50% of basic damage)

// Health pack system (HP pakai) - only one at a time, fixed positions
const HEALTH_PACKS_ENABLED = false; // Fully disable HP packs in PvP
interface HealthPack {
  x: number;
  y: number;
  spawnTime: number;
  id: string; // Unique ID for network sync
  positionIndex: number; // Which position in the cycle (0=center, 1=left, 2=right)
}
let healthPack: HealthPack | null = null; // Only one health pack at a time
let lastHealthPackPickupTime = 0; // When last health pack was picked up
let healthPackPositionIndex = 0; // Current position index in cycle (0=center, 1=left, 2=right)
let pvpGameStartTime = 0; // When PvP game started (for initial spawn delay)
const healthPackSpawnDelay = 25000; // Spawn 25 seconds after pickup or game start
const healthPackRadius = 15; // Health pack collision radius
const healthPackMinHeal = 10; // Minimum HP restored
const healthPackMaxHeal = 15; // Maximum HP restored

// Fixed health pack positions (always same locations)
const healthPackPositions = [
  { x: (pvpBounds.left + pvpBounds.right) / 2, y: (pvpBounds.top + pvpBounds.bottom) / 2 }, // Center
  { x: pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.25, y: (pvpBounds.top + pvpBounds.bottom) / 2 }, // Left quarter
  { x: pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.75, y: (pvpBounds.top + pvpBounds.bottom) / 2 }, // Right quarter
];

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
const POSITION_HEARTBEAT_INTERVAL = 500; // Always send at least every 500ms to avoid timeouts
const POSITION_DISTANCE_EPSILON = 8; // Only send if moved at least 8px (was 4px)
const VELOCITY_EPSILON = 1.0; // Only send if speed changed significantly (was 0.5)
const ARROW_ANGLE_EPSILON = 0.12; // Minimal radian change before sending arrow rotation (was 0.08)
// Heavy projectile is simulated locally; we only need rare corrections to avoid long-term drift.
// IMPORTANT: do NOT use velocityEpsilon here (gravity changes vy every frame, which would spam packets).
const PROJECTILE_DISTANCE_EPSILON = 24; // Larger threshold to reduce network traffic
const PROJECTILE_HEARTBEAT_INTERVAL = 900; // Rare correction ~1/s
interface MovementSnapshot {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  angle?: number;
  timestamp: number;
}
let lastSentPositionSnapshot: MovementSnapshot | null = null;
let lastSentArrowSnapshot: MovementSnapshot | null = null;
let lastSentProjectileSnapshot: MovementSnapshot | null = null;

function shouldSendSnapshot(
  current: MovementSnapshot,
  last: MovementSnapshot | null,
  options: {
    distanceEpsilon: number;
    velocityEpsilon?: number;
    angleEpsilon?: number;
    heartbeatInterval: number;
  }
): boolean {
  if (!last) {
    return true;
  }

  const dx = current.x - last.x;
  const dy = current.y - last.y;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared >= options.distanceEpsilon * options.distanceEpsilon) {
    return true;
  }

  if (typeof options.velocityEpsilon === 'number') {
    const dvx = Math.abs((current.vx || 0) - (last.vx || 0));
    const dvy = Math.abs((current.vy || 0) - (last.vy || 0));
    if (dvx > options.velocityEpsilon || dvy > options.velocityEpsilon) {
      return true;
    }
  }

  if (
    typeof options.angleEpsilon === 'number' &&
    typeof current.angle === 'number' &&
    typeof last.angle === 'number'
  ) {
    if (Math.abs(current.angle - last.angle) > options.angleEpsilon) {
      return true;
    }
  }

  return current.timestamp - last.timestamp >= options.heartbeatInterval;
}
let pvpKatanaVx = 0; // Arrow velocity X
let pvpKatanaVy = 0; // Arrow velocity Y
let pvpKatanaAngle = 0; // Arrow rotation angle
const pvpKatanaSpeed = 15; // Arrow flying speed
let pvpKatanaLastUpdateAt = 0;
let pvpKatanaTravelPx = 0;
let pvpArrowStoneBounceCount = 0;
let pvpArrowMaxTravelPx = PVP_ARROW_RANGE_PX + PVP_ARROW_FADE_PX;
let pvpArrowExpireAt = 0;
let pvpArrowLastShotTime = 0; // When arrow was last shot (for cooldown)
const pvpArrowCooldown = 10000; // Arrow cooldown in milliseconds (10 seconds)

// PvP arrow charge (delayed fire)
const PVP_ARROW_CHARGE_MS = 300;
const PVP_ARROW_SPAWN_OFFSET_Y = 55; // Spawn arrow lower than player center (matches sprite feel)
const PVP_ARROW_SPRITE_LENGTH_FACTOR = 2.4; // world length = player.radius * factor (tuned for visibility)
const PVP_ARROW_COLLISION_RADIUS = 7; // px (tighter vs stone so it doesn't look like it hits "from distance")
let pvpArrowCharging = false;
let pvpArrowChargeFireAt = 0;
let pvpArrowChargeAimX = 0;
let pvpArrowChargeAimY = 0;

// Opponent arrow/projectile state (synced from network)
let opponentArrowFlying = false;
let opponentArrowX = 0;
let opponentArrowY = 0;
let opponentArrowVx = 0;
let opponentArrowVy = 0;
let opponentArrowAngle = 0;
let opponentArrowLastUpdateAt = 0;
let opponentArrowTravelPx = 0;
let opponentArrowStoneBounceCount = 0;
let opponentArrowMaxTravelPx = PVP_ARROW_RANGE_PX + PVP_ARROW_FADE_PX;
let opponentArrowExpireAt = 0;

let opponentProjectileFlying = false;
let opponentProjectileX = 0;
let opponentProjectileY = 0;
let opponentProjectileVx = 0;
let opponentProjectileVy = 0;
let opponentProjectileSpawnTime = 0; // When opponent projectile was spawned
let opponentProjectileBounceCount = 0; // How many times players have bounced on opponent projectile
let opponentProjectileLastUpdateAt = 0; // For time-based stepping (reduces FPS drift)

// Opponent bullet state (synced from network)
let opponentBulletFlying = false;
let opponentBulletX = 0;
let opponentBulletY = 0;
let opponentBulletVx = 0;
let opponentBulletVy = 0;
let opponentBulletSpawnTime = 0;

// Opponent mines state (synced from network)
let opponentMines: Mine[] = []; // Array of opponent's mines
let opponentSpikes: Spike[] = []; // Array of opponent's spikes from exploded mines


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

// 5SEC PvP button state
let isHoveringNewButton = false;
let isPressingNewButton = false;
let pvpOnlineRoomName: 'pvp_room' | 'pvp_5sec_room' = 'pvp_room';

// Wallet connection button state
let isHoveringWallet = false;
let isPressingWallet = false;
let walletConnecting = false;
let walletError: string | null = null;
let walletProviderModalOpen = false;

function connectWalletWithProvider(providerType: WalletProviderType): void {
  walletConnecting = true;
  walletError = null;
  walletProviderModalOpen = false;
  walletService.connect(providerType).then((result) => {
    if (result) {
      console.log('Wallet connected:', result.address);
      walletError = null;

      // Check DOT token balance after connection
      if (result.address) {
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
  }).catch((error: any) => {
    console.error('Wallet connect() error:', error);
    walletError = error.message || 'Connection error';
    walletConnecting = false;
  });
}

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

// UFO sprite cache
let ufoSprite: HTMLImageElement | null = null;
const ufoSpritePath = '/ufo_sprite.png';

// Arrow sprite cache (weapon 1)
let arrowSprite: HTMLImageElement | null = null;
let arrowSpriteProcessed: HTMLCanvasElement | null = null;
const arrowSpritePath = '/sprite.arrow.png';

// Boom sprite cache (weapon 2 - heavy projectile)
let boomSprite: HTMLImageElement | null = null;
let boomSpriteProcessed: HTMLCanvasElement | null = null;
const boomSpritePath = '/sprite.boom.png';

// Center stone sprite (arena obstacle)
let stoneSprite: HTMLImageElement | null = null;
let stoneSpriteProcessed: HTMLCanvasElement | null = null;
const stoneSpritePath = '/sprite.stone.png';

// Stone shake (visual only)
let pvpStoneShakeUntil = 0;
let pvpStoneShakeDirX = 0;
let pvpStoneShakeDirY = 0;
let pvpStoneShakeMag = 0;
function triggerStoneShake(impactX?: number, impactY?: number, strength: number = 1): void {
  if (!PVP_CENTER_OBSTACLE_ENABLED) return;
  const now = Date.now();
  const o = getPvpCenterObstacle();
  const ix = (typeof impactX === 'number' && Number.isFinite(impactX)) ? impactX : o.x;
  const iy = (typeof impactY === 'number' && Number.isFinite(impactY)) ? impactY : o.y;
  const dx = ix - o.x;
  const dy = iy - o.y;
  const d = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy));
  pvpStoneShakeDirX = dx / d;
  pvpStoneShakeDirY = dy / d;
  // Stronger & longer so it is clearly visible (still cheap).
  pvpStoneShakeMag = Math.max(pvpStoneShakeMag, 10 * strength);
  pvpStoneShakeUntil = Math.max(pvpStoneShakeUntil, now + 260);
}
function getStoneShakeOffset(now: number): { x: number; y: number } {
  if (now >= pvpStoneShakeUntil || pvpStoneShakeMag <= 0.01) return { x: 0, y: 0 };
  const t = (pvpStoneShakeUntil - now) / 260; // 1..0
  const amp = pvpStoneShakeMag * (t * t);
  const ph = now * 0.06; // fast oscillation
  const s = Math.sin(ph) * 0.85 + Math.sin(ph * 1.9) * 0.35;
  // Shake mostly along impact normal, with slight perpendicular jitter
  const nx = pvpStoneShakeDirX;
  const ny = pvpStoneShakeDirY;
  const px = -ny;
  const py = nx;
  return {
    x: (nx * s + px * Math.sin(ph * 1.3) * 0.25) * amp,
    y: (ny * s + py * Math.sin(ph * 1.3) * 0.25) * amp
  };
}

// Arena background sprite (play area background)
let arenaBgSprite: HTMLImageElement | null = null;
const arenaBgSpritePath = '/sprite.background.png';

// Nebula / depth layer (parallax overlay)
let nebulaBgSprite: HTMLImageElement | null = null;
const nebulaBgSpritePath = '/sprite.nebula.png';

// Light band / atmosphere layer (very subtle polish)
let lightBandSprite: HTMLImageElement | null = null;
const lightBandSpritePath = '/sprite.lightband.png';

// Very distant galaxy layer (tiny, slowest parallax)
let galaxySprite: HTMLImageElement | null = null;
let galaxySpriteProcessed: HTMLCanvasElement | null = null;
const galaxySpritePath = '/sprite.galaxy.png';
// Second galaxy layer (optional) - lets us show two galaxies at once
let galaxySprite2: HTMLImageElement | null = null;
let galaxySprite2Processed: HTMLCanvasElement | null = null;
const galaxySprite2Path = '/sprite.galaxy2.png';

function processGalaxySpriteToTransparent(img: HTMLImageElement): HTMLCanvasElement {
  // Key out corner background color (usually black) and crop to visible bounds.
  const c = document.createElement('canvas');
  const w = img.naturalWidth || img.width || 1024;
  const h = img.naturalHeight || img.height || 1024;
  c.width = w;
  c.height = h;
  const ctx2 = c.getContext('2d', { willReadFrequently: true })!;
  ctx2.clearRect(0, 0, w, h);
  ctx2.drawImage(img, 0, 0, w, h);

  try {
    const imageData = ctx2.getImageData(0, 0, w, h);
    const d = imageData.data;
    // Sample top-left as background key color
    const br = d[0], bg = d[1], bb = d[2];
    const thr = 42; // tolerance (slightly tighter than arrow to preserve dark details)
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const dr = r - br;
      const dg = g - bg;
      const db = b - bb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < thr) d[i + 3] = 0;
    }
    ctx2.putImageData(imageData, 0, 0);

    // Crop to non-transparent bounds
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4 + 3; // alpha
        if (d[idx] > 12) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0 && maxY >= 0) {
      const pad = 4;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(w - 1, maxX + pad);
      maxY = Math.min(h - 1, maxY + pad);
      const cw = Math.max(1, maxX - minX + 1);
      const ch = Math.max(1, maxY - minY + 1);
      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      const octx = out.getContext('2d')!;
      octx.clearRect(0, 0, cw, ch);
      octx.drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
      return out;
    }
  } catch {
    // keep original if getImageData fails
  }
  return c;
}

function processArrowSpriteToTransparent(img: HTMLImageElement): HTMLCanvasElement {
  // Remove the baked-in gray background by keying out the corner color.
  const c = document.createElement('canvas');
  const w = img.naturalWidth || img.width || 1024;
  const h = img.naturalHeight || img.height || 1024;
  c.width = w;
  c.height = h;
  const ctx2 = c.getContext('2d', { willReadFrequently: true })!;
  ctx2.clearRect(0, 0, w, h);
  ctx2.drawImage(img, 0, 0, w, h);

  try {
    const imageData = ctx2.getImageData(0, 0, w, h);
    const d = imageData.data;
    // Sample top-left as background key color
    const br = d[0], bg = d[1], bb = d[2];
    const thr = 48; // tolerance
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const dr = r - br;
      const dg = g - bg;
      const db = b - bb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < thr) {
        d[i + 3] = 0; // transparent
      }
    }
    ctx2.putImageData(imageData, 0, 0);

    // Crop to non-transparent bounds so rotation pivot stays stable (prevents vertical bobbing).
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4 + 3; // alpha
        if (d[idx] > 12) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0 && maxY >= 0) {
      const pad = 6;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(w - 1, maxX + pad);
      maxY = Math.min(h - 1, maxY + pad);
      const cw = Math.max(1, maxX - minX + 1);
      const ch = Math.max(1, maxY - minY + 1);
      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      const octx = out.getContext('2d')!;
      octx.clearRect(0, 0, cw, ch);
      octx.drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
      return out;
    }
  } catch {
    // If getImageData fails (tainted canvas), keep original.
  }
  return c;
}

function processBoomSpriteToTransparent(img: HTMLImageElement): HTMLCanvasElement {
  // Same pipeline as arrow: key out corner background + crop to non-transparent bounds.
  const c = document.createElement('canvas');
  const w = img.naturalWidth || img.width || 1024;
  const h = img.naturalHeight || img.height || 1024;
  c.width = w;
  c.height = h;
  const ctx2 = c.getContext('2d', { willReadFrequently: true })!;
  ctx2.clearRect(0, 0, w, h);
  ctx2.drawImage(img, 0, 0, w, h);

  try {
    const imageData = ctx2.getImageData(0, 0, w, h);
    const d = imageData.data;
    const br = d[0], bg = d[1], bb = d[2];
    const thr = 48;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const dr = r - br;
      const dg = g - bg;
      const db = b - bb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < thr) d[i + 3] = 0;
    }
    ctx2.putImageData(imageData, 0, 0);

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4 + 3;
        if (d[idx] > 12) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0 && maxY >= 0) {
      const pad = 6;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(w - 1, maxX + pad);
      maxY = Math.min(h - 1, maxY + pad);
      const cw = Math.max(1, maxX - minX + 1);
      const ch = Math.max(1, maxY - minY + 1);
      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      const octx = out.getContext('2d')!;
      octx.clearRect(0, 0, cw, ch);
      octx.drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
      return out;
    }
  } catch {
    // keep original if getImageData fails
  }
  return c;
}

function processStoneSpriteToCropped(img: HTMLImageElement): HTMLCanvasElement {
  // Some images come with a checkerboard baked in (not real transparency).
  // We key out the corner background colors (can be 2 tones) and then crop.
  const c = document.createElement('canvas');
  const w = img.naturalWidth || img.width || 1024;
  const h = img.naturalHeight || img.height || 1024;
  c.width = w;
  c.height = h;
  const ctx2 = c.getContext('2d', { willReadFrequently: true })!;
  ctx2.clearRect(0, 0, w, h);
  ctx2.drawImage(img, 0, 0, w, h);

  try {
    const imageData = ctx2.getImageData(0, 0, w, h);
    const d = imageData.data;

    // Collect a small palette of "background" colors from corners/near-corners.
    const sample = (x: number, y: number) => {
      const ix = Math.max(0, Math.min(w - 1, x));
      const iy = Math.max(0, Math.min(h - 1, y));
      const idx = (iy * w + ix) * 4;
      return { r: d[idx], g: d[idx + 1], b: d[idx + 2] };
    };
    const bg = [
      sample(0, 0),
      sample(1, 0),
      sample(0, 1),
      sample(1, 1),
      sample(w - 1, 0),
      sample(0, h - 1),
      sample(w - 1, h - 1)
    ];
    const thr = 34; // tolerance for checkerboard tones
    const closeTo = (r: number, g: number, b: number, c0: { r: number; g: number; b: number }) => {
      const dr = r - c0.r;
      const dg = g - c0.g;
      const db = b - c0.b;
      return Math.sqrt(dr * dr + dg * dg + db * db) < thr;
    };
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      // If pixel matches ANY of sampled background colors, make it transparent.
      let isBg = false;
      for (let k = 0; k < bg.length; k++) {
        if (closeTo(r, g, b, bg[k])) { isBg = true; break; }
      }
      if (isBg) d[i + 3] = 0;
    }
    ctx2.putImageData(imageData, 0, 0);

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4 + 3;
        if (d[idx] > 12) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0 && maxY >= 0) {
      const pad = 4;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(w - 1, maxX + pad);
      maxY = Math.min(h - 1, maxY + pad);
      const cw = Math.max(1, maxX - minX + 1);
      const ch = Math.max(1, maxY - minY + 1);
      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      const octx = out.getContext('2d')!;
      octx.clearRect(0, 0, cw, ch);
      octx.drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
      return out;
    }
  } catch {
    // keep original if getImageData fails
  }
  return c;
}

// Load UFO sprite
function loadUfoSprite(): void {
  if (ufoSprite) return; // Already loaded
  
  const img = new Image();
  img.onload = () => {
    ufoSprite = img;
    console.log('✅ UFO sprite loaded successfully');
  };
  img.onerror = () => {
    console.error('❌ Failed to load UFO sprite');
  };
  img.src = ufoSpritePath;
}

// Load arrow sprite on initialization
function loadArrowSprite(): void {
  if (arrowSprite) return;
  const img = new Image();
  img.onload = () => {
    arrowSprite = img;
    arrowSpriteProcessed = processArrowSpriteToTransparent(img);
    console.log('✅ Arrow sprite loaded successfully');
  };
  img.onerror = () => {
    console.error('❌ Failed to load arrow sprite:', arrowSpritePath);
  };
  img.src = arrowSpritePath;
}

function loadBoomSprite(): void {
  if (boomSprite) return;
  const img = new Image();
  img.onload = () => {
    boomSprite = img;
    boomSpriteProcessed = processBoomSpriteToTransparent(img);
    console.log('✅ Boom sprite loaded successfully');
  };
  img.onerror = () => {
    console.error('❌ Failed to load boom sprite:', boomSpritePath);
  };
  img.src = boomSpritePath;
}

function loadStoneSprite(): void {
  if (stoneSprite) return;
  const img = new Image();
  img.onload = () => {
    stoneSprite = img;
    stoneSpriteProcessed = processStoneSpriteToCropped(img);
    console.log('✅ Stone sprite loaded successfully');
  };
  img.onerror = () => {
    console.error('❌ Failed to load stone sprite:', stoneSpritePath);
  };
  img.src = stoneSpritePath;
}

function loadArenaBackgroundSprite(): void {
  if (arenaBgSprite) return;
  const img = new Image();
  img.onload = () => {
    arenaBgSprite = img;
    console.log('✅ Arena background sprite loaded successfully');
  };
  img.onerror = () => {
    console.error('❌ Failed to load arena background sprite:', arenaBgSpritePath);
  };
  img.src = arenaBgSpritePath;
}

function loadNebulaBackgroundSprite(): void {
  if (nebulaBgSprite) return;
  const img = new Image();
  img.onload = () => {
    nebulaBgSprite = img;
    console.log('✅ Nebula background sprite loaded successfully');
  };
  img.onerror = () => {
    console.error('❌ Failed to load nebula background sprite:', nebulaBgSpritePath);
  };
  img.src = nebulaBgSpritePath;
}

function loadLightBandSprite(): void {
  if (lightBandSprite) return;
  const img = new Image();
  img.onload = () => {
    lightBandSprite = img;
    console.log('✅ Light-band sprite loaded successfully');
  };
  img.onerror = () => {
    console.error('❌ Failed to load light-band sprite:', lightBandSpritePath);
  };
  img.src = lightBandSpritePath;
}

function loadGalaxySprite(): void {
  if (galaxySprite) return;
  const img = new Image();
  img.onload = () => {
    galaxySprite = img;
    // Ensure no gray/black rectangle background even if the PNG isn't transparent.
    galaxySpriteProcessed = processGalaxySpriteToTransparent(img);
    console.log('✅ Galaxy sprite loaded successfully');
  };
  img.onerror = () => {
    console.error('❌ Failed to load galaxy sprite:', galaxySpritePath);
  };
  img.src = galaxySpritePath;
}

function loadGalaxySprite2(): void {
  if (galaxySprite2) return;
  const img = new Image();
  img.onload = () => {
    galaxySprite2 = img;
    galaxySprite2Processed = processGalaxySpriteToTransparent(img);
    console.log('✅ Galaxy2 sprite loaded successfully');
  };
  img.onerror = () => {
    // optional layer; don't spam errors if missing
    console.warn('⚠️ Galaxy2 sprite not found:', galaxySprite2Path);
  };
  img.src = galaxySprite2Path;
}

// Load UFO sprite on initialization
loadUfoSprite();
loadArrowSprite();
loadBoomSprite();
loadStoneSprite();
loadArenaBackgroundSprite();
loadNebulaBackgroundSprite();
loadLightBandSprite();
loadGalaxySprite();
loadGalaxySprite2();

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
const arrowLength = 56; // Arrow total length (+10% from 51; still shorter than original 85)
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
  // Guest mode: allow play without wallet, but NEVER save progress.
  // For returning Ronin users, allow loading if we can identify a Ronin address (connected or stored).
  const roninAddr = getRoninAddressForPersistence();
  if (!roninAddr) {
    console.log('Guest mode: skipping load (no Ronin address). Progress will not be saved.');
    return;
  }

  const saveData = saveManager.load();
  if (saveData) {
    loadGameState(saveData);
  } else {
    console.log('No save data found, starting fresh game');
  }
}

// Save game (only if wallet is connected)
function saveGame(): void {
  // Only save if user has a Ronin address (connected or previously stored).
  if (!getRoninAddressForPersistence()) {
    // Wallet not connected - don't save (game continues but progress is not saved)
    return;
  }
  
  const saveData = getCurrentSaveData();
  saveManager.save(saveData);
}

// Force save (call after important events) - only if wallet is connected
function forceSaveGame(): void {
  // Only save if user has a Ronin address (connected or previously stored).
  if (!getRoninAddressForPersistence()) {
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
  // Preserve jetpack fuel between PvP "rounds" (when PvP is re-initialized)
  snapshotPvpFuelCarryover();
  // Clear any existing players first
  pvpPlayers = {};
  pvpSideById = {};
  
  // Clear death animations when starting new game
  deathAnimations.clear();
  
  // Reset health packs when starting new PvP game
  healthPack = null;
  lastHealthPackPickupTime = 0;
  healthPackPositionIndex = 0; // Reset to center position
  
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
    gravityActiveUntil: 0, // Gravity inactive initially
    speedTrail: [], // Supersonic shadow tail
    hp: totalMaxHP, // Use Solo max HP + NFT bonus
    maxHP: totalMaxHP, // Use Solo max HP + NFT bonus
    armor: dotMaxArmor, // Use Solo max Armor
    maxArmor: dotMaxArmor, // Use Solo max Armor
    outOfBoundsStartTime: null, // Track when player goes out of bounds
    lastOutOfBoundsDamageTime: 0, // Track last damage time for out of bounds
    lastArmorRegen: Date.now(), // When armor was last regenerated
    paralyzedUntil: 0, // Not paralyzed initially
    fuel: getCarryoverFuel(myPlayerId), // Carry over fuel from previous round
    maxFuel: PVP_DEFAULT_MAX_FUEL, // Maximum fuel
    isUsingJetpack: false, // Not using jetpack initially
    jetpackStartTime: 0, // When jetpack was started
    jetpackLastFuelTickTime: 0, // Fuel consumption tick
    lastFuelRegenTime: 0, // Fuel regeneration disabled (no auto-refill)
    isOverheated: false, // Not overheated initially
    overheatStartTime: 0, // When overheat started
    // Toxic water removed
    ufoTilt: 0, // Initial tilt angle
    lastVx: 0, // Previous velocity X
    lastVy: 0, // Previous velocity Y
    facingLeft: false,
    renderAngle: 0,
  };
  
  pvpPlayers[myPlayerId] = myPlayer;
  pvpSideById[myPlayerId] = 'left';
  
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
    gravityActiveUntil: 0, // Gravity inactive initially
    speedTrail: [],
    hp: dotMaxHP, // Use Solo max HP (same as my player for now)
    maxHP: dotMaxHP, // Use Solo max HP
    armor: dotMaxArmor, // Use Solo max Armor (same as my player for now)
    maxArmor: dotMaxArmor, // Use Solo max Armor
    outOfBoundsStartTime: null, // Track when player goes out of bounds
    lastOutOfBoundsDamageTime: 0, // Track last damage time for out of bounds
    lastArmorRegen: Date.now(),
    paralyzedUntil: 0, // Not paralyzed initially
    fuel: getCarryoverFuel(opponentId), // Carry over fuel from previous round (local fallback)
    maxFuel: PVP_DEFAULT_MAX_FUEL, // Maximum fuel
    isUsingJetpack: false, // Not using jetpack initially
    jetpackStartTime: 0, // When jetpack was started
    jetpackLastFuelTickTime: 0, // Fuel consumption tick
    lastFuelRegenTime: 0, // Fuel regeneration disabled (no auto-refill)
    isOverheated: false, // Not overheated initially
    overheatStartTime: 0, // When overheat started
    // Toxic water removed
    ufoTilt: 0, // Initial tilt angle
    lastVx: 0, // Previous velocity X
    lastVy: 0, // Previous velocity Y
    profilePicture: undefined, // Will be synced from opponent
    facingLeft: false,
    renderAngle: 0,
  };
  
  pvpPlayers[opponentId] = opponent;
  pvpSideById[opponentId] = 'right';
  resetOpponentInterpolation();
  pushOpponentSample(Date.now(), opponent);
  
  console.log('PvP initialized', { myPlayerId, opponentId });
}

// PvP cleanup (when switching back to Solo)
function cleanupPvP(): void {
  pvpPlayers = {};
  pvpSideById = {};
  myPlayerId = null;
  opponentId = null;
  isInLobby = false;
  isSearchingForMatch = false;
  currentMatch = null;
  // Reset selected PvP mode back to legacy
  TURN_BASED_PVP_ENABLED = false;
  pvpOnlineRoomName = 'pvp_room';
  // Reset turn-based PvP state
  turnPhase = 'lobby';
  turnRoundId = 0;
  turnPhaseEndsAt = 0;
  turnExecuteStartAt = 0;
  turnPlansById = {};
  turnEvents = [];
  turnFinalPlayers = {};
  turnLocked = false;
  turnServerSynced = false;
  autoReadySent = false;
  resetTurnBasedPlayback();
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

function syncReadyStateFromRoom(room: any): void {
  if (!room || !room.state || !room.state.players) {
    return;
  }

  // Sync cosmetic data (e.g. NFT profile picture) from authoritative room state.
  try {
    room.state.players.forEach((player: any) => {
      const sid = String(player?.sessionId || '');
      if (!sid || !pvpPlayers[sid]) return;
      if (typeof player.profilePicture === 'string') {
        const url = player.profilePicture || undefined;
        if (pvpPlayers[sid].profilePicture !== url) {
          pvpPlayers[sid].profilePicture = url;
          if (url && !nftImageCache.has(url)) {
            loadNftImage(url, `profile_${sid}`);
          }
        }
      }
    });
  } catch {}

  // Turn-based PvP phase sync via state patches (fallback if onMessage ordering drops/arrives early)
  if (TURN_BASED_PVP_ENABLED && colyseusService.isConnectedToRoom()) {
    const phase = (room.state as any)?.phase;
    if (phase === 'planning' || phase === 'execute' || phase === 'lobby') {
      turnPhase = phase as TurnPhase;
      turnServerSynced = true;
    } else if ((room.state as any)?.gameStarted && turnPhase === 'lobby') {
      // If game started but phase isn't present yet, do NOT assume planning (would cause fake overlay).
    }
    const endsAt = (room.state as any)?.phaseEndsAt;
    if (typeof endsAt === 'number') turnPhaseEndsAt = endsAt;
    const executeStartAt = (room.state as any)?.executeStartAt;
    if (typeof executeStartAt === 'number') turnExecuteStartAt = executeStartAt;
    const roundId = (room.state as any)?.roundId;
    if (typeof roundId === 'number') turnRoundId = roundId;
  }

  // If currentMatch is missing (transitions), still keep basic flags consistent.
  // (We only write into currentMatch when it exists.)
  const myAddress = getMyPvpAddress();
  const mySessionId = room.sessionId;

  const orderedPlayers: any[] = [];
  room.state.players.forEach((player: any) => {
    orderedPlayers.push(player);
  });

  if (orderedPlayers.length === 0) {
    return;
  }

  // If 2 players are present but the server didn't start yet, ensure we send ready at least once.
  // This avoids "I pressed ready but it didn't start" cases due to UI/state transitions.
  if (TURN_BASED_PVP_ENABLED && colyseusService.isConnectedToRoom()) {
    const playersCount = orderedPlayers.length;
    const started = !!room.state.gameStarted;
    if (playersCount >= 2 && !started && !autoReadySent) {
      autoReadySent = true;
      isReady = true;
      colyseusService.sendReady(true);
    }
    if (started) {
      autoReadySent = false;
    }
  }

  if (currentMatch) {
    if (orderedPlayers[0]?.address) {
      currentMatch.p1 = orderedPlayers[0].address;
    }
    if (orderedPlayers[1]?.address) {
      currentMatch.p2 = orderedPlayers[1].address;
    }
  }

  const myPlayer =
    orderedPlayers.find((p) => p.sessionId === mySessionId) ||
    orderedPlayers.find((p) => p.address === myAddress);

  const opponent =
    orderedPlayers.find((p) => p.sessionId !== (myPlayer?.sessionId || '')) ||
    orderedPlayers.find((p) => p.address && p.address !== myPlayer?.address);

  if (!myPlayer) {
    return;
  }

  if (opponent?.address) {
    opponentWalletAddress = opponent.address;
  }

  const amPlayer1 =
    (myAddress && currentMatch && currentMatch.p1 === myAddress) ||
    (orderedPlayers[0] && orderedPlayers[0].sessionId === myPlayer.sessionId);

  if (currentMatch) {
    if (amPlayer1) {
      currentMatch.p1Ready = myPlayer.ready;
      currentMatch.p2Ready = opponent ? opponent.ready : false;
    } else {
      currentMatch.p1Ready = opponent ? opponent.ready : false;
      currentMatch.p2Ready = myPlayer.ready;
    }
  }

  isReady = myPlayer.ready;
  waitingForOpponentReady = !room.state.gameStarted && orderedPlayers.length >= 2;
  if (orderedPlayers.length >= 2) {
    isInLobby = false;
    isSearchingForMatch = false;
  }
}

// Enter PvP lobby (Colyseus primary, Supabase fallback)
async function enterLobby(forcedEndpoint?: string): Promise<void> {
  const myAddress = getMyPvpAddress();
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
  
  const selectedServerEndpoint = forcedEndpoint || getSelectedServerEndpoint();
  if (selectedServerEndpoint) {
    colyseusEndpoint = selectedServerEndpoint;
  }

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
    
    // Calculate player stats (prevents 100/61 mismatches - server uses these on join)
    const nftBonuses = calculateNftBonuses();
    const totalMaxHP = dotMaxHP + nftBonuses.hp;
    const playerStats = {
      hp: dotHP, // Current HP (not maxHP, use actual current)
      maxHP: totalMaxHP,
      armor: dotArmor,
      maxArmor: dotMaxArmor,
      profilePicture: profileManager.getProfilePicture()
    };
    
    // Join or create room (Colyseus handles matchmaking automatically)
    const room = await colyseusService.joinOrCreateRoom(pvpOnlineRoomName, myAddress, handleOpponentInput, playerStats);
    
    if (!room) {
      throw new Error('Failed to join Colyseus room - room is null');
    }

    console.log('✅ Successfully joined Colyseus room:', room.id);
    console.log('✅ Using Colyseus as primary PvP system');
    
    // Turn-based PvP (micro-turn) handlers
    room.onMessage("phase", (msg: any) => {
      if (!TURN_BASED_PVP_ENABLED) return;
      turnServerSynced = true;
      turnWaitStartAt = 0;
      if (typeof msg?.serverNow === 'number') {
        turnServerClockOffsetMs = msg.serverNow - Date.now();
      }
      if (typeof msg?.planMs === 'number') {
        turnPlanDurationMs = Math.max(1000, Math.min(60000, msg.planMs));
      }
      if (typeof msg?.executeMs === 'number') {
        turnExecuteDurationMs = Math.max(1000, Math.min(60000, msg.executeMs));
      }
      // #region agent log
      try {
        if (AGENT_DEBUG_LOGS_ENABLED) {
        fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/simple-main.ts:phase:onMessage',message:'client received phase',data:{phase:msg?.phase,roundId:msg?.roundId,endsAt:msg?.endsAt,planMs:msg?.planMs??null,executeMs:msg?.executeMs??null,serverNow:msg?.serverNow??null,clockOffset:turnServerClockOffsetMs},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'E2'})}).catch(()=>{});
        }
      } catch {}
      // #endregion
      const phase = msg?.phase as TurnPhase;
      turnPhase = (phase === 'planning' || phase === 'execute' || phase === 'lobby') ? phase : turnPhase;
      if (typeof msg?.roundId === 'number') turnRoundId = msg.roundId;
      if (typeof msg?.endsAt === 'number') turnPhaseEndsAt = msg.endsAt;
      turnLocked = false;

      if (turnPhase === 'planning') {
        // Reset local playback state at the start of each planning phase.
        resetTurnBasedPlayback();
        // Ensure player objects exist even if game_start handler ordering was weird
        ensure5SecPvPPlayersFromRoom();
        // Shadow plan recording timebase (server-aligned)
        if (typeof msg?.endsAt === 'number') {
          turnPlanStartServerTs = msg.endsAt - (turnPlanDurationMs || 5000);
        }
        // Ensure we have a default plan (stand still) so server always has something.
        if (myPlayerId && pvpPlayers[myPlayerId]) {
          const p = pvpPlayers[myPlayerId];
          turnLocalTrack = [{ tMs: 0, x: p.x, y: p.y }];
          turnLocalSpawns = [];
          const nftBonuses = calculateNftBonuses();
          const totalDmg = dmg + (nftBonuses?.dmg || 0);
          const totalCritChance = critChance + (nftBonuses?.critChance || 0);
          colyseusService.sendPlan({ track: turnLocalTrack, spawns: turnLocalSpawns, stats: { dmg: totalDmg, critChance: totalCritChance } });
        }
      }
    });

    room.onMessage("plan_ack", (msg: any) => {
      if (!TURN_BASED_PVP_ENABLED) return;
      if (typeof msg?.locked === 'boolean') {
        turnLocked = msg.locked;
      }
    });

    room.onMessage("round_execute", (payload: any) => {
      if (!TURN_BASED_PVP_ENABLED) return;
      turnServerSynced = true;
      turnWaitStartAt = 0;
      turnLastRoundExecuteAt = Date.now();
      turnPhase = 'execute';
      if (typeof payload?.roundId === 'number') turnRoundId = payload.roundId;
      if (typeof payload?.startAt === 'number') turnExecuteStartAt = payload.startAt;
      if (typeof payload?.durationMs === 'number') turnExecuteDurationMs = payload.durationMs;
      if (typeof payload?.moveSpeed === 'number') turnMoveSpeed = payload.moveSpeed;
      if (typeof payload?.windupMs === 'number') turnWindupMs = payload.windupMs;
      if (typeof payload?.seed === 'number') turnExecuteSeed = payload.seed;
      turnEvents = Array.isArray(payload?.events) ? payload.events : [];
      turnPlansById = (payload?.plans && typeof payload.plans === 'object') ? payload.plans : turnPlansById;
      turnFinalPlayers = (payload?.finalState?.players && typeof payload.finalState.players === 'object') ? payload.finalState.players : {};

      // Capture start positions for deterministic local playback.
      resetTurnBasedPlayback();
      // Clear legacy realtime projectile state to avoid double-simulation.
      bullets = [];
      opponentBulletFlying = false;
      projectileFlying = false;
      pvpKatanaFlying = false;
      opponentArrowFlying = false;
      opponentProjectileFlying = false;
      for (const pid of Object.keys(turnPlansById || {})) {
        const pl = pvpPlayers[pid];
        if (pl) {
          turnStartPosById[pid] = { x: pl.x, y: pl.y };
        }
      }
    });

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
        
        syncReadyStateFromRoom(room);
      }
    });

    // Listen to room state changes for ready status
    room.onStateChange((state) => {
      if (state && state.players) {
        syncReadyStateFromRoom(room);
      }
    });

    room.onMessage("game_start", (message: any) => {
      console.log('Game started!', message);
      waitingForOpponentReady = false;
      isInLobby = false; // Exit lobby when game starts
      gameMode = 'PvP'; // Ensure game mode is set to PvP
      if (TURN_BASED_PVP_ENABLED && colyseusService.isConnectedToRoom()) {
        // Start "waiting for turn loop" timer (detect outdated server / wrong endpoint)
        turnWaitStartAt = Date.now();
      }
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

    // Ensure ready UI syncs with current room state (handles joining second)
    syncReadyStateFromRoom(room);

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
    console.warn('⚠️ Colyseus failed - no fallback. Please fix Colyseus server.');
  }
}

// Leave PvP lobby
async function leaveLobby(): Promise<void> {
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
  // 5SEC PvP is Colyseus-only. Never start the legacy Supabase match flow here,
  // otherwise we can re-initialize players using wallet-address IDs and break EXECUTE replay
  // (server sends turn plans keyed by sessionId).
  if (TURN_BASED_PVP_ENABLED || pvpOnlineRoomName === 'pvp_5sec_room') {
    return;
  }
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
          // Guard: 5SEC PvP uses Colyseus sessionIds; never re-init via Supabase match IDs.
          if (TURN_BASED_PVP_ENABLED || pvpOnlineRoomName === 'pvp_5sec_room') return;
          initializePvPWithMatch(match, isPlayer1);
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

  // Restore legacy behavior: require currentMatch (keeps old UI/flow consistent)
  if (!currentMatch) {
    console.error('Cannot set ready: no current match');
    return;
  }
  const myAddress = getMyPvpAddress();

  // Use Colyseus only
  isReady = !isReady; // Toggle ready state
  const success = colyseusService.sendReady(isReady);
  
  if (success) {
    console.log('✅ Player ready status sent to Colyseus:', isReady);
    
    // Update local match state (will be synced via onStateChange)
    if (currentMatch) {
      const isPlayer1 = currentMatch.p1 === myAddress;
      if (isPlayer1) {
        currentMatch.p1Ready = isReady;
      } else {
        currentMatch.p2Ready = isReady;
      }
    }
  } else {
    console.error('❌ Failed to send ready to Colyseus');
    isReady = false;
  }
  
  console.log('=== setPlayerReady() completed ===');
}

// Initialize PvP with Colyseus room
function initializePvPWithColyseus(room: any, mySessionId: string, opponentSessionId: string): void {
  // Preserve jetpack fuel between PvP "rounds" (when PvP is re-initialized)
  snapshotPvpFuelCarryover();
  // Clear any existing players first
  pvpPlayers = {};
  pvpSideById = {};
  
  // Clear death animations when starting new game
  deathAnimations.clear();
  
  // Reset health packs when starting new PvP game
  healthPack = null;
  lastHealthPackPickupTime = 0;
  healthPackPositionIndex = 0; // Reset to center position
  pvpGameStartTime = Date.now(); // Record game start time for initial spawn delay
  
  const myAddress = getMyPvpAddress();
  
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

  // Prefer authoritative spawn positions from Colyseus room state (server decides sides).
  // This avoids "roles swapped" / mirrored mid-wall issues when clients derive sides differently.
  const midX = getPvpMidWallX();
  const meState: any = (() => {
    try { return roomState?.players?.get ? roomState.players.get(mySessionId) : null; } catch { return null; }
  })();
  const oppState: any = (() => {
    try { return roomState?.players?.get ? roomState.players.get(opponentSessionId) : null; } catch { return null; }
  })();
  const serverMeX = (typeof meState?.x === 'number') ? meState.x : null;
  const serverMeY = (typeof meState?.y === 'number') ? meState.y : null;
  const serverOppX = (typeof oppState?.x === 'number') ? oppState.x : null;
  const serverOppY = (typeof oppState?.y === 'number') ? oppState.y : null;
  // Legacy fallback (only used if state missing x/y)
  const sessionIds = [mySessionId, opponentSessionId].sort();
  const isMePlayer1 = mySessionId === sessionIds[0];
  const fallbackMeX = isMePlayer1
    ? pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.25
    : pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.75;
  const fallbackOppX = isMePlayer1
    ? pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.75
    : pvpBounds.left + (pvpBounds.right - pvpBounds.left) * 0.25;
  const meX = serverMeX ?? fallbackMeX;
  const meY = serverMeY ?? (pvpBounds.bottom / 2);
  const oppX = serverOppX ?? fallbackOppX;
  const oppY = serverOppY ?? (pvpBounds.bottom / 2);
  const meSide: PvPSide = meX < midX ? 'left' : 'right';
  const oppSide: PvPSide = oppX < midX ? 'left' : 'right';
  // #region agent log
  try {
    if (AGENT_DEBUG_LOGS_ENABLED) {
    fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/simple-main.ts:initializePvPWithColyseus',message:'spawn/side mapping',data:{mySessionId,opponentSessionId,serverMeX,serverMeY,serverOppX,serverOppY,fallbackMeX,fallbackOppX,meX,meY,oppX,oppY,meSide,oppSide,midX},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H8'})}).catch(()=>{});
    }
  } catch {}
  // #endregion
  
  // Initialize my player
  const myPlayer: PvPPlayer = {
    id: myPlayerId,
    x: meX,
    y: meY,
    vx: 0,
    vy: 0,
    mass: pvpMass,
    radius: dotRadius,
    isOut: false,
    color: '#000000', // Black - ALWAYS black for my player
    lastHitTime: 0,
    gravityLocked: true,
    gravityActiveUntil: 0, // Gravity inactive initially
    speedTrail: [],
    hp: totalMaxHP,
    maxHP: totalMaxHP,
    armor: dotMaxArmor,
    maxArmor: dotMaxArmor,
    outOfBoundsStartTime: null,
    lastOutOfBoundsDamageTime: 0,
    lastArmorRegen: Date.now(),
    paralyzedUntil: 0, // Not paralyzed initially
    fuel: getCarryoverFuel(myPlayerId), // Carry over fuel from previous round
    maxFuel: PVP_DEFAULT_MAX_FUEL, // Maximum fuel
    isUsingJetpack: false, // Not using jetpack initially
    jetpackStartTime: 0, // When jetpack was started
    jetpackLastFuelTickTime: 0, // Fuel consumption tick
    lastFuelRegenTime: 0, // Fuel regeneration disabled (no auto-refill)
    isOverheated: false, // Not overheated initially
    overheatStartTime: 0, // When overheat started
    // Toxic water removed
    profilePicture: profileManager.getProfilePicture(), // Set my profile picture
    ufoTilt: 0, // Initial tilt angle
    lastVx: 0, // Previous velocity X
    lastVy: 0, // Previous velocity Y
    facingLeft: false,
    renderAngle: 0,
  };

  pvpPlayers[myPlayerId] = myPlayer;
  pvpSideById[myPlayerId] = meSide;
  
  // Send initial profile picture to opponent
  if (myPlayer.profilePicture) {
    sendStatsUpdate(myPlayer.hp, myPlayer.armor, myPlayer.maxHP, myPlayer.maxArmor);
  }

  // Initialize opponent (use server state HP/armor to prevent 100/61 mismatches)
  const serverOppHP = (typeof oppState?.hp === 'number') ? oppState.hp : null;
  const serverOppMaxHP = (typeof oppState?.maxHP === 'number') ? oppState.maxHP : null;
  const serverOppArmor = (typeof oppState?.armor === 'number') ? oppState.armor : null;
  const serverOppMaxArmor = (typeof oppState?.maxArmor === 'number') ? oppState.maxArmor : null;
  const opponent: PvPPlayer = {
    id: opponentId,
    x: oppX,
    y: oppY,
    vx: 0,
    vy: 0,
    mass: 1.0, // Will be synced from network
    radius: dotRadius,
    isOut: false,
    color: '#000000', // Black - ALWAYS black for opponent
    lastHitTime: 0,
    gravityLocked: true,
    gravityActiveUntil: 0, // Gravity inactive initially
    speedTrail: [],
    hp: serverOppHP ?? dotMaxHP, // Use server state HP (prevents 100/61 mismatch)
    maxHP: serverOppMaxHP ?? dotMaxHP,
    armor: serverOppArmor ?? dotMaxArmor,
    maxArmor: serverOppMaxArmor ?? dotMaxArmor,
    outOfBoundsStartTime: null,
    lastOutOfBoundsDamageTime: 0,
    lastArmorRegen: Date.now(),
    paralyzedUntil: 0, // Not paralyzed initially
    fuel: getCarryoverFuel(opponentId), // Carry over fuel from previous round (local fallback)
    maxFuel: PVP_DEFAULT_MAX_FUEL, // Maximum fuel
    isUsingJetpack: false, // Not using jetpack initially
    jetpackStartTime: 0, // When jetpack was started
    jetpackLastFuelTickTime: 0, // Fuel consumption tick
    lastFuelRegenTime: 0, // Fuel regeneration disabled (no auto-refill)
    isOverheated: false, // Not overheated initially
    overheatStartTime: 0, // When overheat started
    // Toxic water removed
    profilePicture: (typeof oppState?.profilePicture === 'string' && oppState.profilePicture) ? oppState.profilePicture : undefined,
    ufoTilt: 0, // Initial tilt angle
    lastVx: 0, // Previous velocity X
    lastVy: 0, // Previous velocity Y
    facingLeft: false,
    renderAngle: 0,
  };

  // Preload opponent profile picture if available
  if (opponent.profilePicture && !nftImageCache.has(opponent.profilePicture)) {
    loadNftImage(opponent.profilePicture, 'opponent_profile');
  }

  pvpPlayers[opponentId] = opponent;
  pvpSideById[opponentId] = oppSide;

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
  // Preserve jetpack fuel between PvP "rounds" (when PvP is re-initialized)
  snapshotPvpFuelCarryover();
  // Clear any existing players first
  pvpPlayers = {};
  pvpSideById = {};
  
  // Clear death animations when starting new game
  deathAnimations.clear();
  
  // Set player IDs based on match and our identity (wallet/email/guest)
  const myAddress = getMyPvpAddress();
  
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
    gravityActiveUntil: 0, // Gravity inactive initially
    speedTrail: [],
    hp: totalMaxHP,
    maxHP: totalMaxHP,
    armor: dotMaxArmor,
    maxArmor: dotMaxArmor,
    outOfBoundsStartTime: null,
    lastOutOfBoundsDamageTime: 0,
    lastArmorRegen: Date.now(),
    paralyzedUntil: 0, // Not paralyzed initially
    fuel: getCarryoverFuel(myPlayerId), // Carry over fuel from previous round
    maxFuel: PVP_DEFAULT_MAX_FUEL, // Maximum fuel
    isUsingJetpack: false, // Not using jetpack initially
    jetpackStartTime: 0, // When jetpack was started
    jetpackLastFuelTickTime: 0, // Fuel consumption tick
    lastFuelRegenTime: 0, // Fuel regeneration disabled (no auto-refill)
    isOverheated: false, // Not overheated initially
    overheatStartTime: 0, // When overheat started
    // Toxic water removed
    profilePicture: profileManager.getProfilePicture(), // Set my profile picture
    ufoTilt: 0, // Initial tilt angle
    lastVx: 0, // Previous velocity X
    lastVy: 0, // Previous velocity Y
    facingLeft: false,
    renderAngle: 0,
  };

  pvpPlayers[myPlayerId] = myPlayer;
  pvpSideById[myPlayerId] = isMePlayer1 ? 'left' : 'right';
  
  // Send initial profile picture to opponent
  if (myPlayer.profilePicture) {
    sendStatsUpdate(myPlayer.hp, myPlayer.armor, myPlayer.maxHP, myPlayer.maxArmor);
  }

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
    gravityActiveUntil: 0, // Gravity inactive initially
    speedTrail: [],
    hp: dotMaxHP, // Will be synced from network
    maxHP: dotMaxHP,
    armor: dotMaxArmor,
    maxArmor: dotMaxArmor,
    outOfBoundsStartTime: null,
    lastOutOfBoundsDamageTime: 0,
    lastArmorRegen: Date.now(),
    paralyzedUntil: 0, // Not paralyzed initially
    fuel: getCarryoverFuel(opponentId), // Carry over fuel from previous round (local fallback)
    maxFuel: PVP_DEFAULT_MAX_FUEL, // Maximum fuel
    isUsingJetpack: false, // Not using jetpack initially
    jetpackStartTime: 0, // When jetpack was started
    jetpackLastFuelTickTime: 0, // Fuel consumption tick
    lastFuelRegenTime: 0, // Fuel regeneration disabled (no auto-refill)
    isOverheated: false, // Not overheated initially
    overheatStartTime: 0, // When overheat started
    // Toxic water removed
    profilePicture: undefined, // Will be synced from opponent
    ufoTilt: 0, // Initial tilt angle
    lastVx: 0, // Previous velocity X
    lastVy: 0, // Previous velocity Y
    facingLeft: false,
    renderAngle: 0,
  };

  pvpPlayers[opponentId] = opponent;
  pvpSideById[opponentId] = isMePlayer1 ? 'right' : 'left';

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
  // #region agent log
  const __agentOppT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const __agentOppType = input?.type ?? 'unknown';
  // #endregion
  try {
    // 5SEC PvP now uses attacker/defender phases (not replay), so we DO process realtime messages.
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
      const timestampSource = input.serverTimestamp ?? input.timestamp;
      if (timestampSource) {
        const latency = Math.max(0, Date.now() - timestampSource);
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
      // #region agent log
      try {
        const win: any = (typeof window !== 'undefined') ? window : {};
        const now = Date.now();
        const ss = win.__agentSnapStats || (win.__agentSnapStats = { lastTs: 0 });
        if (now - ss.lastTs > 500) {
          ss.lastTs = now;
          if (AGENT_DEBUG_LOGS_ENABLED) fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/simple-main.ts:handleOpponentInput',message:'opponent position snap correction',data:{dx,dy,distanceSquared,maxCorrectionDistance,correctionFactor,averageNetworkLatency,serverTimestamp:input.serverTimestamp??null,timestamp:input.timestamp??null},timestamp:Date.now(),sessionId:'debug-session',runId:'baseline',hypothesisId:'H10'})}).catch(()=>{});
        }
      } catch {}
      // #endregion
        opponent.x += dx * correctionFactor;
        opponent.y += dy * correctionFactor;
      } else {
        // Small difference - trust client-side prediction (opponent moves via physics)
        // Only apply small correction to prevent drift
        const smallCorrectionFactor = 0.1; // Very small correction to prevent drift
        opponent.x += dx * smallCorrectionFactor;
        opponent.y += dy * smallCorrectionFactor;
      }

      // Keep opponent on their side of the mid-wall (prevents network correction pushing through wall).
      if (PVP_MID_WALL_ENABLED) enforcePvpMidWall(opponentId, opponent);
      
      // Always update velocity from network (critical for physics prediction)
      // This ensures client-side prediction is accurate
      if (input.vx !== undefined) opponent.vx = input.vx;
      if (input.vy !== undefined) opponent.vy = input.vy;

      // Feed render interpolation buffer (use local receive time; post-correction state).
      pushOpponentSample(Date.now(), opponent);
      
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
        const force = input.isCrit ? PVP_CLICK_FORCE_CRIT : PVP_CLICK_FORCE; // Use crit flag from input
        
        opponent.vx += Math.cos(oppositeAngle) * force;
        opponent.vy += Math.sin(oppositeAngle) * force;
        opponent.lastHitTime = input.timestamp;
        opponent.gravityLocked = false;
      }
    }

    // Dash (Space): discrete blink movement, applied instantly for snappy feel.
    if (input.type === 'dash' && typeof input.x === 'number' && typeof input.y === 'number') {
      const fromX = opponent.x;
      const fromY = opponent.y;
      opponent.x = input.x;
      opponent.y = input.y;
      if (typeof input.vx === 'number') opponent.vx = input.vx;
      if (typeof input.vy === 'number') opponent.vy = input.vy;
      if (PVP_MID_WALL_ENABLED) enforcePvpMidWall(opponentId, opponent);
      // Teleport-like movement: reset interpolation so we don't draw a long lerp trail.
      resetOpponentInterpolation();
      pushOpponentSample(Date.now(), opponent);

      if (PVP_UFO_SPEED_TRAIL_ENABLED) {
        // Visual: dense trail between old and new position
        const steps = 8;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          opponent.speedTrail.push({
            x: fromX + (opponent.x - fromX) * t,
            y: fromY + (opponent.y - fromY) * t,
            vx: 0,
            vy: 0,
            life: 22,
            maxLife: 22,
            size: opponent.radius * 1.8
          });
        }
        while (opponent.speedTrail.length > 18) opponent.speedTrail.shift();
      } else if (opponent.speedTrail.length) {
        opponent.speedTrail.length = 0;
      }
      return;
    }
    
    // Handle arrow input from opponent (launch event)
    if (input.type === 'arrow' && input.x !== undefined && input.y !== undefined) {
    opponentArrowFlying = true;
    // If opponent UFO is rendered with interpolation, their "visual" position is slightly delayed.
    // To keep the arrow visually attached to the UFO on THIS client, shift the spawn point by the current render offset.
    // (Hit is server-authoritative, so this is safe as a pure visual tweak.)
    const now = Date.now();
    let sx = 0;
    let sy = 0;
    const ip = getOpponentInterpolatedPos(now);
    if (ip) {
      sx = ip.x - opponent.x;
      sy = ip.y - opponent.y;
    }
    opponentArrowX = input.x + sx;
    opponentArrowY = input.y + sy;
    opponentArrowLastUpdateAt = Date.now();
    opponentArrowTravelPx = 0;
    opponentArrowStoneBounceCount = 0;
    opponentArrowMaxTravelPx = PVP_ARROW_RANGE_PX + PVP_ARROW_FADE_PX;
    opponentArrowExpireAt = 0;
    if (input.targetX !== undefined && input.targetY !== undefined) {
      const dx = input.targetX - (input.x + sx);
      const dy = input.targetY - (input.y + sy);
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 0) {
        opponentArrowVx = (dx / distance) * pvpKatanaSpeed;
        opponentArrowVy = (dy / distance) * pvpKatanaSpeed;
        opponentArrowAngle = Math.atan2(dy, dx);
      }
    }
    console.log('Opponent arrow launched', { x: input.x, y: input.y, targetX: input.targetX, targetY: input.targetY });
  }
  
  // Arrow position sync disabled (bandwidth optimization). We simulate from launch event only.
  // (If we ever re-enable, do it as a rare correction/heartbeat.)
  
  // Handle projectile input from opponent (launch event)
  if (input.type === 'projectile' && input.x !== undefined && input.y !== undefined) {
    opponentProjectileFlying = true;
    opponentProjectileX = input.x;
    opponentProjectileY = input.y;
    opponentProjectileLastUpdateAt = Date.now();
    // IMPORTANT: Use local clock for lifetime to avoid clock-skew making projectile instantly disappear on some clients.
    opponentProjectileSpawnTime = Date.now();
    opponentProjectileBounceCount = 0; // Reset bounce count
    
    // Create explosion animation at opponent's launch position
    createProjectileExplosion(opponentProjectileX, opponentProjectileY);
    
    if (typeof input.vx === 'number' && typeof input.vy === 'number') {
      opponentProjectileVx = input.vx;
      opponentProjectileVy = input.vy;
    } else if (input.targetX !== undefined && input.targetY !== undefined) {
      const dx = input.targetX - input.x;
      const dy = input.targetY - input.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 0) {
        const fallbackSpeed = projectileLaunchSpeed;
        opponentProjectileVx = (dx / distance) * fallbackSpeed;
        opponentProjectileVy = (dy / distance) * fallbackSpeed;
      }
    }
    console.log('Opponent projectile launched', { x: input.x, y: input.y, targetX: input.targetX, targetY: input.targetY });
  }
  
  // Handle projectile position sync from opponent (real-time position updates)
  if (input.type === 'projectile_position' && input.x !== undefined && input.y !== undefined) {
    if (!opponentProjectileFlying) {
      // Projectile was launched but we missed the launch event - initialize it
      opponentProjectileFlying = true;
      // IMPORTANT: Use local clock for lifetime to avoid clock-skew issues.
      opponentProjectileSpawnTime = Date.now();
      opponentProjectileBounceCount = 0;
    }
    opponentProjectileX = input.x;
    opponentProjectileY = input.y;
    if (input.vx !== undefined) opponentProjectileVx = input.vx;
    if (input.vy !== undefined) opponentProjectileVy = input.vy;
    opponentProjectileLastUpdateAt = Date.now();
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

  // Stone bounce event (server-authoritative): bounce arrow + shake stone for both players.
  if (input.type === 'stone_bounce') {
    const shooterId = (typeof input.shooterId === 'string') ? input.shooterId : null;
    const projType = (input.projType === 'arrow' || input.projType === 'bullet' || input.projType === 'projectile') ? input.projType : 'arrow';
    if (projType === 'arrow') {
      // Apply bounce to the correct arrow simulation (my arrow or opponent arrow).
      if (shooterId && myPlayerId && shooterId === myPlayerId && pvpKatanaFlying && pvpArrowStoneBounceCount === 0) {
        const hit = collideCircleWithStone(pvpKatanaX, pvpKatanaY, PVP_ARROW_COLLISION_RADIUS);
        if (hit) {
          pvpKatanaX += hit.nx * (hit.depth + 0.5);
          pvpKatanaY += hit.ny * (hit.depth + 0.5);
          const vn = pvpKatanaVx * hit.nx + pvpKatanaVy * hit.ny;
          if (vn < 0) {
            pvpKatanaVx = (pvpKatanaVx - 2 * vn * hit.nx) * 0.55;
            pvpKatanaVy = (pvpKatanaVy - 2 * vn * hit.ny) * 0.55;
            pvpKatanaAngle = Math.atan2(pvpKatanaVy, pvpKatanaVx);
          }
          pvpArrowStoneBounceCount = 1;
          pvpArrowMaxTravelPx = Math.min(pvpArrowMaxTravelPx, pvpKatanaTravelPx + 140);
          pvpArrowExpireAt = Date.now() + 100;
        }
      } else if (opponentId && shooterId && shooterId === opponentId && opponentArrowFlying && opponentArrowStoneBounceCount === 0) {
        const hit = collideCircleWithStone(opponentArrowX, opponentArrowY, PVP_ARROW_COLLISION_RADIUS);
        if (hit) {
          opponentArrowX += hit.nx * (hit.depth + 0.5);
          opponentArrowY += hit.ny * (hit.depth + 0.5);
          const vn = opponentArrowVx * hit.nx + opponentArrowVy * hit.ny;
          if (vn < 0) {
            opponentArrowVx = (opponentArrowVx - 2 * vn * hit.nx) * 0.55;
            opponentArrowVy = (opponentArrowVy - 2 * vn * hit.ny) * 0.55;
            opponentArrowAngle = Math.atan2(opponentArrowVy, opponentArrowVx);
          }
          opponentArrowStoneBounceCount = 1;
          opponentArrowMaxTravelPx = Math.min(opponentArrowMaxTravelPx, opponentArrowTravelPx + 140);
          opponentArrowExpireAt = Date.now() + 100;
        }
      }
      triggerStoneShake(input.impactX, input.impactY, 1);
    }
  }

  // Stone collision event (server-authoritative): destroy arrow + shake stone for both players.
  if (input.type === 'stone_hit') {
    const shooterId = (typeof input.shooterId === 'string') ? input.shooterId : null;
    const projType = (input.projType === 'arrow' || input.projType === 'bullet' || input.projType === 'projectile') ? input.projType : 'arrow';
    if (projType === 'arrow') {
      if (shooterId && myPlayerId && shooterId === myPlayerId) {
        // My arrow hit the stone -> remove locally
        pvpKatanaFlying = false;
        pvpArrowFired = false;
        pvpKatanaX = 0;
        pvpKatanaY = 0;
        pvpKatanaVx = 0;
        pvpKatanaVy = 0;
        pvpKatanaAngle = 0;
        pvpKatanaLastUpdateAt = 0;
        pvpKatanaTravelPx = 0;
        pvpArrowStoneBounceCount = 0;
        pvpArrowExpireAt = 0;
      } else if (opponentId && shooterId && shooterId === opponentId) {
        opponentArrowFlying = false;
        opponentArrowX = 0;
        opponentArrowY = 0;
        opponentArrowVx = 0;
        opponentArrowVy = 0;
        opponentArrowAngle = 0;
        opponentArrowLastUpdateAt = 0;
        opponentArrowTravelPx = 0;
        opponentArrowStoneBounceCount = 0;
        opponentArrowExpireAt = 0;
      } else {
        // Fallback: if we can't identify, remove both (rare)
        opponentArrowFlying = false;
        pvpKatanaFlying = false;
      }
      triggerStoneShake(input.impactX, input.impactY, 1);
      try {
        void audioManager.resumeContext();
        audioManager.playBounce();
      } catch {}
    } else if (projType === 'projectile') {
      // Heavy projectile hits the stone: explode + remove projectile on the owning side.
      if (shooterId && myPlayerId && shooterId === myPlayerId) {
        if (projectileFlying) {
          createProjectileExplosion(projectileX, projectileY);
          createStoneImpactParticles(projectileX, projectileY);
          projectileFlying = false;
          projectileX = 0;
          projectileY = 0;
          projectileVx = 0;
          projectileVy = 0;
          projectileBounceCount = 0;
          projectileLastUpdateAt = 0;
        }
      } else if (opponentId && shooterId && shooterId === opponentId) {
        if (opponentProjectileFlying) {
          createProjectileExplosion(opponentProjectileX, opponentProjectileY);
          createStoneImpactParticles(opponentProjectileX, opponentProjectileY);
          opponentProjectileFlying = false;
          opponentProjectileX = 0;
          opponentProjectileY = 0;
          opponentProjectileVx = 0;
          opponentProjectileVy = 0;
          opponentProjectileBounceCount = 0;
          opponentProjectileLastUpdateAt = 0;
        }
      } else {
        // Fallback: remove both (rare desync)
        if (projectileFlying) {
          createProjectileExplosion(projectileX, projectileY);
          createStoneImpactParticles(projectileX, projectileY);
        }
        if (opponentProjectileFlying) {
          createProjectileExplosion(opponentProjectileX, opponentProjectileY);
          createStoneImpactParticles(opponentProjectileX, opponentProjectileY);
        }
        projectileFlying = false;
        opponentProjectileFlying = false;
        projectileX = projectileY = projectileVx = projectileVy = 0;
        opponentProjectileX = opponentProjectileY = opponentProjectileVx = opponentProjectileVy = 0;
        projectileBounceCount = 0;
        opponentProjectileBounceCount = 0;
        projectileLastUpdateAt = 0;
        opponentProjectileLastUpdateAt = 0;
      }
      triggerStoneShake(input.impactX, input.impactY, 1.2);
      try {
        void audioManager.resumeContext();
        audioManager.playMineExplosion();
      } catch {}
    }
  }
  
  // Handle mine input from opponent (placement event)
  if (input.type === 'mine' && input.x !== undefined && input.y !== undefined) {
    // Spawn opponent mine
    const opponentMine: Mine = {
      x: input.x,
      y: input.y,
      spawnTime: input.timestamp || Date.now(),
      exploded: false,
    };
    opponentMines.push(opponentMine);
    
    // Play mine placement sound effect
    audioManager.resumeContext().then(() => {
      audioManager.playMinePlacement();
    });
    
    console.log('Opponent mine placed', { x: input.x, y: input.y });
  }
  
  // Handle health pack spawn from opponent (using fixed positions)
  if (HEALTH_PACKS_ENABLED && input.type === 'healthpack' && input.positionIndex !== undefined && input.id !== undefined) {
    // Check if health pack already exists (avoid duplicates)
    if (!healthPack || healthPack.id !== input.id) {
      // Use same position index as opponent
      const position = healthPackPositions[input.positionIndex];
      
      healthPack = {
        x: position.x,
        y: position.y,
        spawnTime: input.timestamp || Date.now(),
        id: input.id,
        positionIndex: input.positionIndex,
      };
      
      // Update our position index to match opponent's cycle
      healthPackPositionIndex = (input.positionIndex + 1) % healthPackPositions.length;
      
      // Play spawn sound effect
      audioManager.resumeContext().then(() => {
        audioManager.playHealthPackSpawn();
      });
      
      console.log('Health pack spawned (from opponent)', { x: position.x, y: position.y, positionIndex: input.positionIndex, id: input.id });
    }
  }
  
  // Handle health pack pickup from opponent
  if (HEALTH_PACKS_ENABLED && input.type === 'healthpack_pickup' && input.healthPackId !== undefined) {
    // Remove health pack that opponent picked up (always remove if we have a pack, even if ID doesn't match)
    if (healthPack) {
      // Check if ID matches, or if it's the only pack (force remove to prevent desync)
      if (healthPack.id === input.healthPackId || healthPack.id === undefined) {
        const pickupTime = input.timestamp || Date.now();
        lastHealthPackPickupTime = pickupTime;
        healthPack = null;
        
        // Play pickup sound effect (opponent picked it up)
        audioManager.resumeContext().then(() => {
          audioManager.playHealthPackPickup();
        });
        
        // Show pickup notification for opponent (if we have opponent player data)
        if (opponentId && pvpPlayers[opponentId]) {
          const opponent = pvpPlayers[opponentId];
          const healAmount = input.healAmount || 0;
          
          // Show only HP amount (armor is ignored)
          if (healAmount > 0) {
            safePushDamageNumber({
              x: opponent.x + (Math.random() - 0.5) * 20,
              y: opponent.y - opponent.radius - 20,
              value: `+${healAmount}`,
              life: 60,
              maxLife: 60,
              vx: (Math.random() - 0.5) * 1,
              vy: -2 - Math.random() * 1,
              isCrit: false
            });
          }
        }
        
        console.log('Health pack picked up by opponent', { id: input.healthPackId, healAmount: input.healAmount });
      } else {
        // ID doesn't match but we have a pack - log warning and remove anyway to prevent desync
        console.warn('Health pack ID mismatch, removing anyway to prevent desync', { 
          localId: healthPack.id, 
          remoteId: input.healthPackId 
        });
        lastHealthPackPickupTime = input.timestamp || Date.now();
        healthPack = null;
      }
    }
  }
  
  // Handle hit event from opponent (damage sync)
  // When opponent hits us, they send their calculated damage, and we apply it
  // This ensures both players see/feel the EXACT same damage
  if (input.type === 'hit' && input.damage !== undefined && input.isCrit !== undefined && input.targetPlayerId !== undefined) {
    // If this was our own hit (server-authoritative), show attacker-side feedback.
    // (Target will apply damage in the branch below.)
    if (input.shooterId && input.shooterId === myPlayerId && opponentId && input.targetPlayerId === opponentId) {
      const hitDamage = input.damage;
      const isCritHit = input.isCrit;
      // Stop our local arrow on confirmed hit (keeps visuals consistent).
      if (pvpKatanaFlying) {
        pvpKatanaFlying = false;
        pvpArrowFired = false;
        pvpKatanaX = 0;
        pvpKatanaY = 0;
        pvpKatanaVx = 0;
        pvpKatanaVy = 0;
        pvpKatanaAngle = 0;
        pvpKatanaLastUpdateAt = 0;
      }
      // Attacker feedback
      if (isCritHit) {
        screenShake = Math.max(screenShake, 30);
      }
      audioManager.resumeContext().then(() => {
        audioManager.playDamageDealt(isCritHit);
      });
      if (opponentId && pvpPlayers[opponentId]) {
        const opp = pvpPlayers[opponentId];
        safePushDamageNumber({
          x: opp.x + (Math.random() - 0.5) * 40,
          y: opp.y - 20,
          value: hitDamage,
          life: 60,
          maxLife: 60,
          vx: (Math.random() - 0.5) * 2,
          vy: -2 - Math.random() * 2,
          isCrit: isCritHit
        });
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI * 2 * i) / 10;
          const speed = 2 + Math.random() * 3;
          safePushClickParticle({
            x: opp.x,
            y: opp.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 30,
            maxLife: 30,
            size: 3 + Math.random() * 2
          });
        }
      }
      // Profile: track damage dealt (now that server confirmed hit)
      profileManager.addDamageDealt(hitDamage);
    }

    // Only process if this hit is targeting us (myPlayerId)
    if (input.targetPlayerId === myPlayerId && myPlayerId && pvpPlayers[myPlayerId]) {
      // Stop opponent arrow visuals on confirmed server hit
      if (input.shooterId && opponentId && input.shooterId === opponentId) {
        opponentArrowFlying = false;
        opponentArrowX = 0;
        opponentArrowY = 0;
        opponentArrowVx = 0;
        opponentArrowVy = 0;
        opponentArrowAngle = 0;
        opponentArrowLastUpdateAt = 0;
        opponentArrowTravelPx = 0;
      }
      const myPlayer = pvpPlayers[myPlayerId];
      const hitDamage = input.damage;
      const isCritHit = input.isCrit;
      
      // Apply damage (armor first, then HP) - using EXACT damage from opponent
      const absorbed = Math.min(hitDamage, myPlayer.armor);
      myPlayer.armor -= absorbed;
      const remainingDamage = hitDamage - absorbed;
      myPlayer.hp = Math.max(0, myPlayer.hp - remainingDamage);
      
      // Activate gravity for 5 seconds after damage (disabled via DAMAGE_GRAVITY_ENABLED)
      setDamageGravity(myPlayer);
      
      // Play damage received sound effect (pain/impact sound when receiving damage)
      audioManager.resumeContext().then(() => {
        audioManager.playDamageReceived(isCritHit);
      });
      
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
      
      // Sync profile picture
      if (input.profilePicture !== undefined) {
        opponent.profilePicture = input.profilePicture;
        // Preload opponent's profile picture image if not already cached
        if (input.profilePicture && !nftImageCache.has(input.profilePicture)) {
          loadNftImage(input.profilePicture, 'opponent_profile');
        }
      }
      
      console.log('Received opponent stats update', { hp: input.hp, armor: input.armor, paralyzedUntil: input.paralyzedUntil, profilePicture: input.profilePicture });
      
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
  } finally {
    // #region agent log
    try {
      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const dtMs = Math.max(0, t1 - __agentOppT0);
      const win: any = (typeof window !== 'undefined') ? window : {};
      const s = win.__agentOpponentStats || (win.__agentOpponentStats = { lastFlushTs: 0, count: 0, msTotal: 0, byType: {} as Record<string, number> });
      s.count += 1;
      s.msTotal += dtMs;
      s.byType[__agentOppType] = (s.byType[__agentOppType] || 0) + 1;
      const now = Date.now();
      if (now - s.lastFlushTs >= 1000) {
        s.lastFlushTs = now;
        if (AGENT_DEBUG_LOGS_ENABLED) fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/simple-main.ts:handleOpponentInput',message:'opponent input processing cost (1s window)',data:{count:s.count,msAvg:s.count?Math.round((s.msTotal/s.count)*1000)/1000:0,byType:s.byType},timestamp:Date.now(),sessionId:'debug-session',runId:'baseline',hypothesisId:'H5'})}).catch(()=>{});
        if (AGENT_DEBUG_LOGS_ENABLED) fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/simple-main.ts:netLatency',message:'client measured network latency (1s window)',data:{averageNetworkLatency,ageSinceLastNetworkUpdateMs:Math.max(0,Date.now()-lastNetworkUpdateTime)},timestamp:Date.now(),sessionId:'debug-session',runId:'baseline',hypothesisId:'H6'})}).catch(()=>{});
        s.count = 0;
        s.msTotal = 0;
        s.byType = {};
      }
    } catch {}
    // #endregion
  }
}

// Send stats update to opponent
function sendStatsUpdate(hp: number, armor: number, maxHP: number, maxArmor: number, paralyzedUntil?: number): void {
  if (gameMode === 'PvP' && currentMatch) {
    const useColyseus = colyseusService.isConnectedToRoom();
    const useSupabaseFallback = !useColyseus && pvpSyncService.isSyncing();
    const isSyncing = useColyseus || useSupabaseFallback;
    
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
      
      // Include profile picture if available
      const myProfilePicture = profileManager.getProfilePicture();
      if (myProfilePicture) {
        statsInput.profilePicture = myProfilePicture;
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
  
  // Add 10 red particles on top for better visual effect
  const redParticleCount = 10;
  for (let i = 0; i < redParticleCount; i++) {
    // Random position within the player circle (slightly above center)
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius * 0.8; // Slightly closer to center
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance - radius * 0.3; // Slightly above center
    
    // Random velocity - particles fly outward and upward
    const speed = 4 + Math.random() * 6; // Faster than regular particles
    const vAngle = angle + (Math.random() - 0.5) * 1.0; // More spread
    const vx = Math.cos(vAngle) * speed;
    const vy = Math.sin(vAngle) * speed - 3; // More upward bias
    
    // Random particle size within range (slightly larger)
    const particleSize = minParticleSize + Math.random() * (maxParticleSize - minParticleSize + 2);
    
    particles.push({
      x: px,
      y: py,
      vx: vx,
      vy: vy,
      life: deathAnimationDuration,
      maxLife: deathAnimationDuration,
      size: particleSize,
      color: '#ff0000', // Red color
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2 // Faster rotation
    });
  }
  
  deathAnimations.set(playerId, particles);
}

// Create projectile explosion animation (particles)
function createProjectileExplosion(x: number, y: number): void {
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI * 2 * i) / 4;
    const speed = 1.5 + Math.random() * 2.5;
    safePushClickParticle({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 24 + Math.floor(Math.random() * 10),
      maxLife: 24 + Math.floor(Math.random() * 10),
      size: 2.5 + Math.random() * 2.5
    });
  }
  screenShake = Math.max(screenShake, 5);
}

// Extra tiny particles for stone impact (weapon 2): subtle "chips/dust" burst.
// IMPORTANT: keep separate from createProjectileExplosion(), because that is also used at projectile launch.
function createStoneImpactParticles(x: number, y: number): void {
  const count = 12;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.8 + Math.random() * 2.0;
    const spread = 0.35 + Math.random() * 0.65;
    const vx = Math.cos(angle) * speed * spread;
    const vy = Math.sin(angle) * speed * spread - (Math.random() * 0.4); // slight upward bias
    safePushClickParticle({
      x: x + (Math.random() - 0.5) * 4,
      y: y + (Math.random() - 0.5) * 4,
      vx,
      vy,
      life: 10 + Math.floor(Math.random() * 10),
      maxLife: 10 + Math.floor(Math.random() * 10),
      size: 1.2 + Math.random() * 1.4,
      // Light gray chips so they read on dark arena background
      color: 'rgba(210, 220, 235, 0.95)'
    });
  }
  screenShake = Math.max(screenShake, 2);
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
const TOXIC_PLATFORMS_ENABLED = false; // Legacy toggle (toxic water system removed)
const TOXIC_WATER_ENABLED = false; // Toxic water removed (kept as a hard-off safety gate)
const WALL_DEATH_PADDING = 10; // Extra padding so UFO sprite also triggers wall death
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

function drawPerimeterHighlight(ctx: CanvasRenderingContext2D): void {
  const borderColor = '#000000';
  const lineWidth = 4;

  ctx.save();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';

  // Left border
  ctx.beginPath();
  ctx.moveTo(playLeft, pvpBounds.top);
  ctx.lineTo(playLeft, pvpBounds.bottom);
  ctx.stroke();

  // Right border
  ctx.beginPath();
  ctx.moveTo(playRight, pvpBounds.top);
  ctx.lineTo(playRight, pvpBounds.bottom);
  ctx.stroke();

  // Top border
  ctx.beginPath();
  ctx.moveTo(playLeft, pvpBounds.top);
  ctx.lineTo(playRight, pvpBounds.top);
  ctx.stroke();

  ctx.restore();
}


function killPlayerByWall(playerId: string, player: PvPPlayer, reason: 'left_wall' | 'right_wall' | 'top_wall'): void {
  if (player.isOut || deathAnimations.has(playerId)) {
    return;
  }

  player.hp = 0;
  player.isOut = true;
  player.vx = 0;
  player.vy = 0;

  let playerColor = player.color;
  if (playerId === myPlayerId || playerId === opponentId) {
    playerColor = '#000000';
  }

  createDeathAnimation(playerId, player.x, player.y, playerColor, player.radius);
  console.log(`Player ${playerId} died by wall contact (${reason}).`);

  if (playerId === myPlayerId) {
    sendStatsUpdate(player.hp, player.armor, player.maxHP, player.maxArmor);
  }
}

function shouldKillByWall(player: PvPPlayer): { hit: boolean; reason: 'left_wall' | 'right_wall' | 'top_wall' } | null {
  if (player.isOut) {
    return null;
  }

  if (player.x - player.radius - WALL_DEATH_PADDING <= playLeft) {
    return { hit: true, reason: 'left_wall' };
  }
  if (player.x + player.radius + WALL_DEATH_PADDING >= playRight) {
    return { hit: true, reason: 'right_wall' };
  }
  if (player.y - player.radius - WALL_DEATH_PADDING <= pvpBounds.top) {
    return { hit: true, reason: 'top_wall' };
  }

  return null;
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

  // Arena background (draw only in play area; keep UI panel area white)
  if (arenaBgSprite && arenaBgSprite.complete) {
    const targetX = playLeft;
    const targetY = 0;
    const targetW = playRight - playLeft;
    const targetH = canvas.height;
    const iw = arenaBgSprite.naturalWidth || arenaBgSprite.width || 1;
    const ih = arenaBgSprite.naturalHeight || arenaBgSprite.height || 1;
    const scale = Math.max(targetW / iw, targetH / ih); // cover (no stretching)
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = targetX + (targetW - dw) * 0.5;
    const dy = targetY + (targetH - dh) * 0.5;
    ctx.save();
    // Keep pixel art crisp if scaled
    (ctx as any).imageSmoothingEnabled = false;
    ctx.drawImage(arenaBgSprite, dx, dy, dw, dh);
    ctx.restore();
  }

  // If both galaxies are visible, we'll add small pulsating light sources between their centers.
  // (Purely visual, pixel-art style; no blur; negligible cost.)
  let galaxy1Core: { x: number; y: number } | null = null;
  let galaxy2Core: { x: number; y: number } | null = null;

  // Very distant galaxy (small, slow parallax, subtle pulse at core)
  // Z-order: above base, below nebula/light band.
  if (galaxySpriteProcessed && galaxySprite && galaxySprite.complete) {
    const targetX = playLeft;
    const targetY = 0;
    const targetW = playRight - playLeft;
    const targetH = canvas.height;

    const GALAXY_SCREEN_FRACTION = 0.077; // ~10% bigger than before
    const GALAXY_PARALLAX = 0.035; // 0.02..0.05
    // Move galaxy to a different corner (top-right area of playfield)
    const GALAXY_POS_X = 0.82;
    const GALAXY_POS_Y = 0.10;

    const PULSE_PERIOD_MS = 6000; // 4..8 seconds
    const PULSE_MIN_A = 0.30;
    const PULSE_MAX_A = 0.60;

    const iw = galaxySpriteProcessed.width || (galaxySprite.naturalWidth || galaxySprite.width || 1);
    const ih = galaxySpriteProcessed.height || (galaxySprite.naturalHeight || galaxySprite.height || 1);
    const worldW = targetW * GALAXY_SCREEN_FRACTION;
    const worldH = worldW * (ih / iw);

    const cx = targetX + targetW / 2;
    const cy = targetY + targetH / 2;
    let px = cx;
    let py = cy;
    if ((gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
      px = pvpPlayers[myPlayerId].x;
      py = pvpPlayers[myPlayerId].y;
    }

    const baseX = targetX + targetW * GALAXY_POS_X - 100; // move 100px to the left
    const baseY = targetY + targetH * GALAXY_POS_Y;
    const offX = clamp(-(px - cx) * GALAXY_PARALLAX, -18, 18);
    const offY = clamp(-(py - cy) * (GALAXY_PARALLAX * 0.7), -12, 12);

    const dx = baseX + offX;
    const dy = baseY + offY;

    // Smooth pulse (opacity only)
    const phase = ((Date.now() % PULSE_PERIOD_MS) / PULSE_PERIOD_MS) * Math.PI * 2;
    const t = (Math.sin(phase) + 1) * 0.5;
    const ease = t * t * (3 - 2 * t);
    const pulseA = PULSE_MIN_A + (PULSE_MAX_A - PULSE_MIN_A) * ease;

    ctx.save();
    (ctx as any).imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.40;
    ctx.drawImage(galaxySpriteProcessed, dx, dy, worldW, worldH);

    // Core pulse dot (pixel-art, no gradient/blur)
    ctx.globalAlpha = pulseA;
    ctx.fillStyle = 'rgba(170, 195, 255, 1)';
    const coreX = Math.floor(dx + worldW * 0.52);
    const coreY = Math.floor(dy + worldH * 0.50);
    ctx.fillRect(coreX, coreY, 2, 2);
    galaxy1Core = { x: coreX + 1, y: coreY + 1 };
    ctx.restore();
  }

  // Second distant galaxy (optional) - lets us keep the "old" galaxy visible too
  if (galaxySprite2Processed && galaxySprite2) {
    const targetX = playLeft;
    const targetY = 0;
    const targetW = playRight - playLeft;
    const targetH = canvas.height;

    const GALAXY2_SCREEN_FRACTION = 0.058; // smaller left galaxy
    const GALAXY2_PARALLAX = 0.030;
    // Different location (top-left-ish) so both galaxies are visible
    const GALAXY2_POS_X = 0.10;
    const GALAXY2_POS_Y = 0.18;

    const PULSE_PERIOD_MS = 7200;
    const PULSE_MIN_A = 0.22;
    const PULSE_MAX_A = 0.50;

    const iw = galaxySprite2Processed.width || (galaxySprite2.naturalWidth || galaxySprite2.width || 1);
    const ih = galaxySprite2Processed.height || (galaxySprite2.naturalHeight || galaxySprite2.height || 1);
    const worldW = targetW * GALAXY2_SCREEN_FRACTION;
    const worldH = worldW * (ih / iw);

    const cx = targetX + targetW / 2;
    const cy = targetY + targetH / 2;
    let px = cx;
    let py = cy;
    if ((gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
      px = pvpPlayers[myPlayerId].x;
      py = pvpPlayers[myPlayerId].y;
    }

    const baseX = targetX + targetW * GALAXY2_POS_X;
    const baseY = targetY + targetH * GALAXY2_POS_Y;
    const offX = clamp(-(px - cx) * GALAXY2_PARALLAX, -14, 14);
    const offY = clamp(-(py - cy) * (GALAXY2_PARALLAX * 0.7), -10, 10);

    const dx = baseX + offX;
    const dy = baseY + offY;

    const phase = ((Date.now() % PULSE_PERIOD_MS) / PULSE_PERIOD_MS) * Math.PI * 2;
    const t = (Math.sin(phase) + 1) * 0.5;
    const ease = t * t * (3 - 2 * t);
    const pulseA = PULSE_MIN_A + (PULSE_MAX_A - PULSE_MIN_A) * ease;

    ctx.save();
    (ctx as any).imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.42;
    ctx.drawImage(galaxySprite2Processed, dx, dy, worldW, worldH);

    // Slight core pulse
    ctx.globalAlpha = pulseA;
    ctx.fillStyle = 'rgba(170, 195, 255, 1)';
    const coreX = Math.floor(dx + worldW * 0.50);
    const coreY = Math.floor(dy + worldH * 0.50);
    ctx.fillRect(coreX, coreY, 2, 2);
    galaxy2Core = { x: coreX + 1, y: coreY + 1 };
    ctx.restore();
  }

  // Nebula / depth layer (must NOT replace base background)
  // Subtle opacity + gentle parallax so it adds depth without drawing attention.
  if (nebulaBgSprite && nebulaBgSprite.complete) {
    const targetX = playLeft;
    const targetY = 0;
    const targetW = playRight - playLeft;
    const targetH = canvas.height;

    // Config: keep in requested range (8%..20%)
    const NEBULA_ALPHA = 0.12;
    const NEBULA_PARALLAX = 0.20; // ~0.15..0.25
    const NEBULA_MAX_SHIFT_X = 60;
    const NEBULA_MAX_SHIFT_Y = 40;
    const NEBULA_AUTO_DRIFT_PX = 6; // very subtle

    const niw = nebulaBgSprite.naturalWidth || nebulaBgSprite.width || 1;
    const nih = nebulaBgSprite.naturalHeight || nebulaBgSprite.height || 1;
    const baseScale = Math.max(targetW / niw, targetH / nih);
    const scale = baseScale * 1.15; // extra margin so parallax doesn't reveal edges
    const dw = niw * scale;
    const dh = nih * scale;

    const cx = targetX + targetW / 2;
    const cy = targetY + targetH / 2;

    let px = cx;
    let py = cy;
    if ((gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
      px = pvpPlayers[myPlayerId].x;
      py = pvpPlayers[myPlayerId].y;
    }
    // Parallax offset based on player position relative to arena center (clamped)
    const offX = clamp(-(px - cx) * NEBULA_PARALLAX, -NEBULA_MAX_SHIFT_X, NEBULA_MAX_SHIFT_X);
    const offY = clamp(-(py - cy) * (NEBULA_PARALLAX * 0.7), -NEBULA_MAX_SHIFT_Y, NEBULA_MAX_SHIFT_Y);
    const drift = Math.sin(Date.now() * 0.00006) * NEBULA_AUTO_DRIFT_PX;

    const dx = targetX + (targetW - dw) * 0.5 + offX + drift;
    const dy = targetY + (targetH - dh) * 0.5 + offY;

    ctx.save();
    (ctx as any).imageSmoothingEnabled = false;
    ctx.globalAlpha = Math.max(0.08, Math.min(0.20, NEBULA_ALPHA));
    // Normal blend keeps it subtle; can be changed to 'screen' later if needed.
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(nebulaBgSprite, dx, dy, dw, dh);
    ctx.restore();
  }

  // Light band / atmosphere layer (Z=2): barely noticeable composition polish
  if (lightBandSprite && lightBandSprite.complete) {
    const targetX = playLeft;
    const targetY = 0;
    const targetW = playRight - playLeft;
    const targetH = canvas.height;

    const BAND_ALPHA = 0.09; // 6%..15%
    const BAND_PARALLAX = 0.14; // 0.1..0.2
    const BAND_MAX_SHIFT_X = 42;
    const BAND_MAX_SHIFT_Y = 26;
    const BAND_DRIFT_PX = 4; // extremely slow/subtle

    const iw = lightBandSprite.naturalWidth || lightBandSprite.width || 1;
    const ih = lightBandSprite.naturalHeight || lightBandSprite.height || 1;
    const baseScale = Math.max(targetW / iw, targetH / ih);
    const scale = baseScale * 1.10; // margin to avoid edges when shifting
    const dw = iw * scale;
    const dh = ih * scale;

    const cx = targetX + targetW / 2;
    const cy = targetY + targetH / 2;
    let px = cx;
    let py = cy;
    if ((gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
      px = pvpPlayers[myPlayerId].x;
      py = pvpPlayers[myPlayerId].y;
    }

    const offX = clamp(-(px - cx) * BAND_PARALLAX, -BAND_MAX_SHIFT_X, BAND_MAX_SHIFT_X);
    const offY = clamp(-(py - cy) * (BAND_PARALLAX * 0.7), -BAND_MAX_SHIFT_Y, BAND_MAX_SHIFT_Y);
    const drift = Math.sin(Date.now() * 0.000035) * BAND_DRIFT_PX;

    const dx = targetX + (targetW - dw) * 0.5 + offX + drift;
    const dy = targetY + (targetH - dh) * 0.5 + offY;

    ctx.save();
    (ctx as any).imageSmoothingEnabled = false;
    ctx.globalAlpha = Math.max(0.06, Math.min(0.15, BAND_ALPHA));
    // Slight "screen" helps the band feel like light without becoming dominant.
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(lightBandSprite, dx, dy, dw, dh);
    ctx.restore();
  }

  // Draw small pulsating light sources between galaxy centers (adds depth/connection).
  // The points are scattered (not a perfect line) but still mostly live in the "space between" galaxies.
  // Draw AFTER nebula/light-band so it stays visible.
  if (galaxy1Core && galaxy2Core) {
    const now = Date.now();
    const ax = galaxy1Core.x;
    const ay = galaxy1Core.y;
    const bx = galaxy2Core.x;
    const by = galaxy2Core.y;

    const segDx = bx - ax;
    const segDy = by - ay;
    const segLen = Math.max(1, Math.sqrt(segDx * segDx + segDy * segDy));
    const nx = -segDy / segLen;
    const ny = segDx / segLen;

    // Small deterministic PRNG so the scatter is stable (doesn't jump each frame)
    const mulberry32 = (seed: number) => () => {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rnd = mulberry32(0xA1B2C3D4);

    // More points, irregularly scattered
    const lights = 22;
    const targetX = playLeft;
    const targetW = playRight - playLeft;
    const targetH = canvas.height;

    ctx.save();
    (ctx as any).imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < lights; i++) {
      // 75% of lights: inside a "capsule" around the segment between galaxies.
      // 25%: anywhere in arena (subtle) so it feels more organic.
      const inBridge = i < Math.floor(lights * 0.75);

      let x = 0;
      let y = 0;

      if (inBridge) {
        // Random t along the segment (avoid super-close to the galaxy cores)
        const t = 0.12 + rnd() * 0.76;
        // Width is bigger near the middle, smaller near the ends
        const mid = 1 - Math.abs(t - 0.5) * 2; // 0..1
        const maxW = 130; // pixels
        const w = 18 + maxW * (mid * mid);
        const perp = (rnd() * 2 - 1) * w;
        const along = (rnd() * 2 - 1) * 10;
        x = ax + segDx * t + nx * perp + (segDx / segLen) * along;
        y = ay + segDy * t + ny * perp + (segDy / segLen) * along;
      } else {
        // Subtle "ambient" points across arena
        const u = rnd();
        const v = rnd();
        x = targetX + u * targetW;
        y = v * targetH;
      }

      // Tiny drift so it feels alive, but keeps the overall scatter shape
      const drift = Math.sin(now * (0.00022 + i * 0.00001) + i * 1.9) * 2.0;
      x += nx * drift;
      y += ny * drift;

      const period = 3200 + i * 420;
      const phase = ((now + i * 913) % period) / period * Math.PI * 2;
      const s = (Math.sin(phase) + 1) * 0.5;
      const ease = s * s * (3 - 2 * s);

      // Bridge points are brighter; ambient are fainter
      const a = inBridge ? (0.18 + 0.72 * ease) : (0.06 + 0.24 * ease);
      const c = i % 3 === 0 ? 'rgba(200, 225, 255, 1)' : (i % 3 === 1 ? 'rgba(215, 195, 255, 1)' : 'rgba(180, 210, 255, 1)');

      const px = Math.floor(x);
      const py = Math.floor(y);

      ctx.fillStyle = c;
      ctx.globalAlpha = a * 0.16;
      ctx.fillRect(px - 2, py - 2, 7, 7);

      ctx.globalAlpha = a * 0.55;
      ctx.fillRect(px - 1, py - 1, 5, 5);

      ctx.globalAlpha = a;
      ctx.fillRect(px, py, 3, 3);

      if (a > (inBridge ? 0.55 : 0.22)) {
        ctx.globalAlpha = a * 0.70;
        ctx.fillRect(px - 2, py + 1, 2, 1);
        ctx.fillRect(px + 3, py + 1, 2, 1);
        ctx.fillRect(px + 1, py - 2, 1, 2);
        ctx.fillRect(px + 1, py + 3, 1, 2);
      }
    }

    ctx.restore();
  }
  
  // Speed display at top (PvP/Training mode only) - render before shake so it's always visible
  if ((gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
    const myPlayer = pvpPlayers[myPlayerId];
    // Calculate current speed
    const speedSquared = myPlayer.vx * myPlayer.vx + myPlayer.vy * myPlayer.vy;
    const currentSpeed = Math.sqrt(speedSquared);
    
    // Speed text (centered) - readable on dark arena background
    ctx.font = 'bold 12px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(`SPEED: ${currentSpeed.toFixed(2)}`, canvas.width / 2, 18);
    ctx.fillText(`SPEED: ${currentSpeed.toFixed(2)}`, canvas.width / 2, 18);
    
    // Fuel bar display (below speed)
    const fuelBarWidth = 220;
    const fuelBarHeight = 10;
    const fuelBarY = 30;
    const midX = (pvpBounds.left + pvpBounds.right) / 2;
    const leftCenterX = (pvpBounds.left + midX) / 2;
    const rightCenterX = (midX + pvpBounds.right) / 2;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    // In 5SEC PvP (turn-based), show BOTH fuel bars (YOU + OPP) and keep them visible
    // across planning + execute (fuel value is last-known from planning, unless updated).
    const showBothFuel =
      TURN_BASED_PVP_ENABLED &&
      gameMode === 'PvP' &&
      colyseusService.isConnectedToRoom() &&
      pvpOnlineRoomName === 'pvp_5sec_room' &&
      (turnPhase !== 'lobby');

    const drawFuelBar = (label: string, fuel: number, maxFuel: number, x: number, y: number, color: string) => {
      const pct = maxFuel > 0 ? Math.max(0, Math.min(1, fuel / maxFuel)) : 0;
      const barX = clamp(x, pvpBounds.left + 8, pvpBounds.right - fuelBarWidth - 8);
      ctx.fillStyle = '#cccccc';
      ctx.fillRect(barX, y, fuelBarWidth, fuelBarHeight);
      ctx.fillStyle = color;
      ctx.fillRect(barX, y, fuelBarWidth * pct, fuelBarHeight);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(barX, y, fuelBarWidth, fuelBarHeight);
      ctx.font = 'bold 9px "Press Start 2P"';
      ctx.textAlign = 'left';
      // Label readable on dark arena background
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillStyle = '#ffffff';
      ctx.strokeText(label, barX - 52, y + fuelBarHeight);
      ctx.fillText(label, barX - 52, y + fuelBarHeight);
    };

    if (showBothFuel) {
      const room: any = colyseusService.getRoom();
      const players: any = room?.state?.players;
      const mySid: string | null = typeof room?.sessionId === 'string' ? room.sessionId : null;
      const keys: string[] = players?.keys ? Array.from(players.keys()) : [];
      const oppSid: string | null = (mySid ? (keys.find((k) => k !== mySid) || null) : null);
      const meState: any = (mySid && players?.get) ? players.get(mySid) : null;
      const oppState: any = (oppSid && players?.get) ? players.get(oppSid) : null;
      const meFuel = (typeof meState?.fuel === 'number') ? meState.fuel : myPlayer.fuel;
      const meMaxFuel = (typeof meState?.maxFuel === 'number') ? meState.maxFuel : myPlayer.maxFuel;
      const oppFuel = (typeof oppState?.fuel === 'number') ? oppState.fuel : PVP_DEFAULT_MAX_FUEL;
      const oppMaxFuel = (typeof oppState?.maxFuel === 'number') ? oppState.maxFuel : PVP_DEFAULT_MAX_FUEL;

      const meX = (typeof meState?.x === 'number') ? meState.x : (pvpPlayers[myPlayerId!]?.x ?? leftCenterX);
      const oppX = (typeof oppState?.x === 'number') ? oppState.x : rightCenterX;
      const meIsLeft = meX < midX;
      const oppIsLeft = oppX < midX;
      const meBarX = (meIsLeft ? leftCenterX : rightCenterX) - fuelBarWidth / 2;
      const oppBarX = (oppIsLeft ? leftCenterX : rightCenterX) - fuelBarWidth / 2;

      // Both bars are green (match the old look you liked)
      // Align them on the same horizontal line (each on its own side)
      drawFuelBar('YOU', meFuel, meMaxFuel, meBarX, fuelBarY, '#00ff00');
      drawFuelBar('OPP', oppFuel, oppMaxFuel, oppBarX, fuelBarY, '#00ff00');
      ctx.textAlign = 'left';
    } else {
      // Default (single) fuel bar
      const fuelPercent = myPlayer.fuel / myPlayer.maxFuel;
      const fuelBarX = canvas.width / 2 - fuelBarWidth / 2;
      ctx.fillStyle = '#cccccc';
      ctx.fillRect(fuelBarX, fuelBarY, fuelBarWidth, fuelBarHeight);
      let fuelBarColor = '#00ff00';
      if (myPlayer.isOverheated) fuelBarColor = '#ff0000';
      else if (myPlayer.isUsingJetpack) fuelBarColor = '#ff6600';
      ctx.fillStyle = fuelBarColor;
      ctx.fillRect(fuelBarX, fuelBarY, fuelBarWidth * fuelPercent, fuelBarHeight);
      ctx.strokeStyle = myPlayer.isOverheated ? '#ff0000' : '#000000';
      ctx.lineWidth = myPlayer.isOverheated ? 3 : 2;
      ctx.strokeRect(fuelBarX, fuelBarY, fuelBarWidth, fuelBarHeight);
      ctx.textAlign = 'center';
      ctx.font = 'bold 10px "Press Start 2P"';
      // FUEL text readable on dark arena background
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillStyle = myPlayer.isOverheated ? '#ff4040' : '#ffffff';
      ctx.strokeText(`FUEL: ${Math.floor(myPlayer.fuel)}%`, canvas.width / 2, fuelBarY + fuelBarHeight + 14);
      ctx.fillText(`FUEL: ${Math.floor(myPlayer.fuel)}%`, canvas.width / 2, fuelBarY + fuelBarHeight + 14);
    }
    
    // Jetpack status text
    if (myPlayer.isUsingJetpack) {
      const jetpackUseTime = (Date.now() - myPlayer.jetpackStartTime) / 1000;
      const jetpackRampTime = 1.5; // seconds to reach max boost
      const t = jetpackRampTime > 0 ? Math.max(0, Math.min(1, jetpackUseTime / jetpackRampTime)) : 1;
      const speedBoost = 1 + t * 4; // 1..5
      ctx.fillStyle = '#ff6600';
      ctx.fillText(`JETPACK: +${speedBoost.toFixed(1)} SPEED`, canvas.width / 2, fuelBarY + fuelBarHeight + 28);
    } else if (myPlayer.isOverheated) {
      const overheatDuration = (Date.now() - myPlayer.overheatStartTime) / 1000;
      const remainingTime = Math.max(0, 4 - overheatDuration); // 4 seconds overheat
      ctx.fillStyle = '#ff0000';
      ctx.fillText(`OVERHEAT: ${remainingTime.toFixed(1)}s`, canvas.width / 2, fuelBarY + fuelBarHeight + 28);
    }
    
    ctx.textAlign = 'left'; // Reset alignment
  }

  // Cursor-following action cooldown indicator (client-side UI only; no network cost).
  // Shows when the next "action" is available (1 action / 1 sec).
  if ((gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId] && !isServerBrowserOpen) {
    const now = Date.now();
    const nextAt = pvpNextActionAtById[myPlayerId] || 0;
    const remainingMs = Math.max(0, nextAt - now);
    const windowMs = Math.max(1, pvpActionWindowMsById[myPlayerId] || PVP_ACTION_COOLDOWN_MS);
    const pct = 1 - Math.max(0, Math.min(1, remainingMs / windowMs));

    // Only draw in play area (avoid clutter over left UI panel)
    if (globalMouseX > 240) {
      const baseX = globalMouseX + 18 + 10;
      const baseY = globalMouseY + 18 - 25 - 5;
      const isShaking = now < pvpActionIndicatorShakeUntil;
      const sx = isShaking ? (Math.random() - 0.5) * 2 * PVP_ACTION_INDICATOR_SHAKE_PX : 0;
      const sy = isShaking ? (Math.random() - 0.5) * 2 * PVP_ACTION_INDICATOR_SHAKE_PX : 0;
      const x = baseX + sx;
      const y = baseY + sy;
      const r = 12;
      const lw = 3;
      const start = -Math.PI / 2;
      const end = start + Math.PI * 2 * pct;
      const ready = remainingMs <= 0;

      ctx.save();
      ctx.globalAlpha = 0.92;

      // Background ring
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.lineWidth = lw;
      ctx.stroke();

      // Progress ring
      ctx.beginPath();
      ctx.arc(x, y, r, start, end);
      ctx.strokeStyle = ready ? 'rgba(0, 200, 0, 0.9)' : 'rgba(255, 120, 0, 0.9)';
      ctx.lineWidth = lw;
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = ready ? 'rgba(0, 200, 0, 0.95)' : 'rgba(255, 120, 0, 0.95)';
      ctx.fill();

      // Small time text when cooling down
      if (!ready) {
        // Readable on dark arena background
        ctx.font = 'bold 7px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillStyle = '#ffffff';
        const t = `${(remainingMs / 1000).toFixed(1)}s`;
        ctx.strokeText(t, x, y + 22);
        ctx.fillText(t, x, y + 22);
      }

      ctx.restore();
      ctx.textAlign = 'left';
    }
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
      const anyConnected = (walletState.isConnected && !!walletState.address) || !!authUserId;
      ctx.fillStyle = anyConnected ? '#00ff00' : '#ff8800'; // Green if connected, ORANGE if not
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
    } else if (authUserId) {
      // Email/OAuth session connected via Supabase
      const label = authEmail
        ? (authEmail.length > 16 ? `${authEmail.substring(0, 13)}...` : authEmail)
        : 'EMAIL LOGIN';
      ctx.font = 'bold 6px "Press Start 2P"';
      ctx.fillText(label, walletButtonX + walletButtonWidth/2, walletButtonY + walletButtonHeight/2 - 5);
      ctx.fillText('LOGOUT', walletButtonX + walletButtonWidth/2, walletButtonY + walletButtonHeight/2 + 8);
    } else {
      ctx.fillText('CONNECT WALLET', walletButtonX + walletButtonWidth/2, walletButtonY + walletButtonHeight/2);
    }
  } catch (error) {
    console.error('Error rendering wallet button text:', error);
    ctx.fillText('CONNECT WALLET', walletButtonX + walletButtonWidth/2, walletButtonY + walletButtonHeight/2);
  }

  // Wallet/Auth picker (Ronin / MetaMask / Email)
  if (walletProviderModalOpen) {
    const uiPanelW = 240;
    const modalW = 190; // narrower (better proportions)
    const modalH = 150;
    const modalX = Math.floor((uiPanelW - modalW) / 2);
    const modalY = walletButtonY - 10 - modalH;
    ctx.save();
    // Panel
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(modalX, modalY, modalW, modalH);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(modalX, modalY, modalW, modalH);
    // Title
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('SELECT WALLET', modalX + 10, modalY + 8);
    // Close X
    ctx.textAlign = 'right';
    ctx.fillText('X', modalX + modalW - 10, modalY + 8);

    const canEmail = supabaseService.isConfigured();
    const available = walletService.getAvailableWallets();

    // Buttons
    const btnX = modalX + 10;
    const btnW = modalW - 20;
    const btnH = 30;
    const roninY = modalY + 34;
    const mmY = roninY + btnH + 8;
    const emailY = mmY + btnH + 8;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 9px "Press Start 2P"';
    // Ronin
    ctx.fillStyle = available.ronin ? '#4aa3ff' : '#cfcfcf';
    ctx.fillRect(btnX, roninY, btnW, btnH);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(btnX, roninY, btnW, btnH);
    ctx.fillStyle = '#000000';
    ctx.fillText(available.ronin ? 'RONIN' : 'RONIN (NO)', btnX + btnW / 2, roninY + btnH / 2);
    // MetaMask
    ctx.fillStyle = available.metamask ? '#ffaa00' : '#cfcfcf';
    ctx.fillRect(btnX, mmY, btnW, btnH);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(btnX, mmY, btnW, btnH);
    ctx.fillStyle = '#000000';
    ctx.fillText(available.metamask ? 'METAMASK' : 'METAMASK (NO)', btnX + btnW / 2, mmY + btnH / 2);

    // Email (Supabase Auth)
    ctx.fillStyle = canEmail ? '#b0ffb0' : '#cfcfcf';
    ctx.fillRect(btnX, emailY, btnW, btnH);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(btnX, emailY, btnW, btnH);
    ctx.fillStyle = '#000000';
    ctx.fillText(canEmail ? 'EMAIL' : 'EMAIL (NO)', btnX + btnW / 2, emailY + btnH / 2);

    ctx.restore();
  }

  // Email login modal (input is an HTML element; this draws the buttons/status)
  if (emailLoginModalOpen) {
    const boxX = 20;
    const boxY = 450 - 10 - 90;
    const boxW = 200;
    const boxH = 86;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 7px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('EMAIL LOGIN', boxX + 10, boxY + 8);
    if (emailLoginStatus) {
      ctx.font = 'bold 6px "Press Start 2P"';
      ctx.fillText(emailLoginStatus.substring(0, 18), boxX + 10, boxY + 28);
    }

    const btnW = 92;
    const btnH = 24;
    const btnY = 450 - 10 - 26;
    // SEND
    ctx.fillStyle = '#b0ffb0';
    ctx.fillRect(boxX, btnY, btnW, btnH);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(boxX, btnY, btnW, btnH);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 7px "Press Start 2P"';
    ctx.fillText('SEND', boxX + btnW / 2, btnY + btnH / 2);
    // CANCEL
    const cancelX = boxX + btnW + 10;
    ctx.fillStyle = '#ffcccc';
    ctx.fillRect(cancelX, btnY, btnW, btnH);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(cancelX, btnY, btnW, btnH);
    ctx.fillStyle = '#000000';
    ctx.fillText('CANCEL', cancelX + btnW / 2, btnY + btnH / 2);
    ctx.restore();
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

  const selectedServer = getSelectedServer();
  if (selectedServer) {
    const statusColor = getServerStatusColor(selectedServer);
    ctx.font = '8px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#000000';
    ctx.fillText(`Server: ${selectedServer.name}`, pvpOnlineButtonX, pvpOnlineButtonY + pvpOnlineButtonHeight + 14);
    ctx.fillStyle = statusColor;
    ctx.fillText(`Ping: ${getServerPingText(selectedServer)}`, pvpOnlineButtonX, pvpOnlineButtonY + pvpOnlineButtonHeight + 26);
    if (typeof selectedServer.waitingPlayers === 'number') {
      ctx.fillStyle = '#000000';
      ctx.fillText(`${selectedServer.waitingPlayers} waiting`, pvpOnlineButtonX + 120, pvpOnlineButtonY + pvpOnlineButtonHeight + 26);
    }
    ctx.fillStyle = '#444444';
    ctx.fillText('Click to change server', pvpOnlineButtonX, pvpOnlineButtonY + pvpOnlineButtonHeight + 38);
  }

  // 5SEC PvP button (turn-based online)
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
  ctx.fillText(`5SEC PVP`, newButtonX + newButtonWidth/2, newButtonY + newButtonHeight/2);

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
  if (gameMode === 'PvP') {
    ctx.font = 'bold 8px "Press Start 2P"';
    const rttMs = colyseusService.getAgentRttMs?.() ?? null;
    const rttColor = rttMs === null ? '#000000' : (rttMs < 60 ? '#00ff00' : rttMs < 120 ? '#ffff00' : '#ff0000');
    ctx.fillStyle = rttColor;
    ctx.fillText(`Ping: ${rttMs === null ? '--' : rttMs}ms`, fpsFrameX + 10, fpsFrameY + 36);
    ctx.fillStyle = '#000000';
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
      
      // Solo mode: Draw UFO sprite with profile picture inside
      if (gameMode === 'Solo') {
        const profilePicture = profileManager.getProfilePicture();
        
        // Calculate movement direction angle (where DOT is moving)
        const speed = Math.sqrt(dotVx * dotVx + dotVy * dotVy);
        let rotationAngle = 0; // Default rotation (right)
        let isMovingLeft = false; // Track if moving left for mirror effect
        
        if (speed > 0.1) {
          // DOT is moving - check horizontal direction
          if (Math.abs(dotVx) > 0.1) {
            // Moving horizontally - determine left/right
            isMovingLeft = dotVx < 0;
            // Use vertical component for rotation angle (up/down movement)
            rotationAngle = Math.atan2(dotVy, Math.abs(dotVx)); // Use absolute vx to prevent upside down
          } else {
            // Moving only vertically - use last horizontal direction from speed trail
            if (speedTrail.length > 0) {
              const lastTrail = speedTrail[speedTrail.length - 1];
              const secondLastTrail = speedTrail[speedTrail.length - 2];
              if (secondLastTrail) {
                const dx = lastTrail.x - secondLastTrail.x;
                if (Math.abs(dx) > 0.1) {
                  isMovingLeft = dx < 0;
                }
              }
            }
            rotationAngle = Math.atan2(dotVy, 1); // Use positive x for angle calculation
          }
        }
        
        ctx.save();
        
        // Translate to DOT position and rotate
        ctx.translate(dotX, dotY);
        ctx.rotate(rotationAngle + soloUfoTilt); // Add tilt effect for balancing/sway
        
        // Apply horizontal flip (mirror effect) if moving left
        if (isMovingLeft) {
          ctx.scale(-1, 1); // Flip horizontally
        }
        
        // Draw UFO sprite (base layer)
        if (ufoSprite && ufoSprite.complete) {
          try {
            // Draw UFO sprite scaled to fit dot radius
            const spriteSize = dotRadius * 5.0; // Even larger sprite size
            ctx.drawImage(ufoSprite, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
          } catch (error) {
            console.error('Error drawing UFO sprite:', error);
            // Fallback to black circle
            ctx.fillStyle = '#000000'; // Black
            ctx.beginPath();
            ctx.arc(0, 0, dotRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // UFO sprite not loaded - show black circle
          ctx.fillStyle = '#000000'; // Black
          ctx.beginPath();
          ctx.arc(0, 0, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
        
        // Draw profile picture inside UFO sprite (if available)
        if (profilePicture) {
          const cachedImage = nftImageCache.get(profilePicture);
          if (cachedImage && cachedImage.complete) {
            try {
            // Create clipping path for profile picture (smaller circle inside UFO)
            ctx.beginPath();
            const profileRadius = dotRadius * 1.2 - 8; // Profile picture, smaller (8px less radius)
            ctx.arc(0, -dotRadius * 0.2, profileRadius, 0, Math.PI * 2); // Slightly above center for dome position
              ctx.clip();
              
              // Calculate aspect ratio to fit image in circle
              const imgAspect = cachedImage.width / cachedImage.height;
              let drawWidth = profileRadius * 2;
              let drawHeight = profileRadius * 2;
              let drawX = -profileRadius;
              let drawY = -dotRadius * 0.2 - profileRadius; // Position in dome area
              
              if (imgAspect > 1) {
                // Image is wider - fit to height
                drawWidth = profileRadius * 2 * imgAspect;
                drawX = -drawWidth / 2;
              } else {
                // Image is taller - fit to width
                drawHeight = profileRadius * 2 / imgAspect;
                drawY = -dotRadius * 0.2 - drawHeight / 2;
              }
              
              ctx.drawImage(cachedImage, drawX, drawY, drawWidth, drawHeight);
            } catch (error) {
              console.error('Error drawing profile picture inside UFO:', error);
            }
          }
        }
        
        ctx.restore();
        
        // Draw magnetic wave animation when gravity is active (Solo mode)
        const now = Date.now();
        if (gravityActiveUntil > now) {
          const timeRemaining = gravityActiveUntil - now;
          const waveProgress = 1 - (timeRemaining / gravityActiveDuration); // 0 to 1
          const waveSpeed = 0.02; // Speed of wave animation
          const waveTime = Date.now() * waveSpeed;
          
          // Draw multiple concentric waves
          for (let i = 0; i < 3; i++) {
            const waveOffset = (waveTime + i * 0.5) % (Math.PI * 2);
            const waveRadius = dotRadius + 10 + Math.sin(waveOffset) * 5 + i * 8;
            const waveAlpha = 0.3 * (1 - waveProgress) * (1 - i * 0.3); // Fade out as gravity ends
            
            ctx.strokeStyle = `rgba(100, 100, 100, ${waveAlpha})`; // Gray magnetic waves
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(dotX, dotY, waveRadius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        
        // Draw cooldown timer in center of dot (visual indicator only)
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
  if (TOXIC_PLATFORMS_ENABLED) {
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
  if (TOXIC_PLATFORMS_ENABLED && (gameMode === 'PvP' || gameMode === 'Training')) {
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
  
  // Bottom floor (former toxic-water band). Keep gameplay floor, but remove extra visuals.
  const bottomFloorY = PVP_BOTTOM_FLOOR_Y;
  
  // Toxic water visuals removed (kept behind a hard-off flag for safety).
  if (TOXIC_WATER_ENABLED && (gameMode === 'PvP' || gameMode === 'Training')) {
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
  
  // Removed the bottom-floor line so the area looks like normal white space.

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
  for (const particle of clickParticles) {
    const alpha = particle.life / particle.maxLife;
    if (particle.color) {
      // If a specific color is provided, trust it (it may already include alpha).
      // We still fade out by multiplying global alpha to keep behavior consistent.
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * alpha;
      ctx.fillStyle = particle.color;
      const s = particle.size ?? 2;
      ctx.fillRect(particle.x, particle.y, s, s);
      ctx.restore();
      continue;
    }
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    const s = particle.size ?? 2;
    ctx.fillRect(particle.x, particle.y, s, s);
  }
  
  // Projectile smoke particles (black smoke trail)
  for (const particle of projectileSmokeParticles) {
    const alpha = particle.life / particle.maxLife;
    // Lighter "pixel smoke" so it reads on the dark arena background.
    ctx.fillStyle = `rgba(210, 220, 235, ${alpha * 0.75})`;
    const s = particle.size ?? 4;
    ctx.fillRect(particle.x, particle.y, s, s);
  }

  // Arrow air-resistance particles (subtle streaks) - draw before arrow so it feels like a trail
  if (arrowAirParticles.length > 0) {
    ctx.save();
    // Arena background is dark; use screen blend so streaks are visible but not overpowering.
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    for (const particle of arrowAirParticles) {
      const a = Math.max(0, Math.min(1, particle.life / particle.maxLife));
      const len = (particle.size ?? 3) * 3.2;
      ctx.strokeStyle = `rgba(210, 235, 255, ${a * 0.55})`;
      ctx.lineWidth = Math.max(1, (particle.size ?? 3) * 0.75);
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x - particle.vx * len, particle.y - particle.vy * len);
      ctx.stroke();
    }
    ctx.restore();
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
    
    // Arrow shaft - high-contrast (more visible against UFO)
    const shaftLength = arrowLength - arrowHeadLength - arrowFletchingLength;
    const shaftStartX = arrowFletchingLength;
    // Outer stroke (black) + inner neon (cyan)
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.9})`;
    ctx.fillRect(shaftStartX, -arrowShaftWidth / 2 - 1.3, shaftLength, arrowShaftWidth + 2.6);
    ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`; // Neon cyan
    ctx.fillRect(shaftStartX, -arrowShaftWidth / 2, shaftLength, arrowShaftWidth);
    
    // New arrowhead design - elegant, sharp, multi-layered (pointing forward)
    const headStartX = arrowLength - arrowHeadLength;
    
    // Base arrowhead layer - high contrast (black outline)
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.9})`;
    ctx.beginPath();
    ctx.moveTo(headStartX, -arrowShaftWidth * 2.7); // Top of base (left point)
    ctx.lineTo(arrowLength, 0); // Sharp tip (forward, center)
    ctx.lineTo(headStartX, arrowShaftWidth * 2.7); // Bottom of base (right point)
    ctx.closePath();
    ctx.fill();
    
    // Middle layer (neon cyan) - smaller triangle inside
    ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(headStartX + arrowHeadLength * 0.3, -arrowShaftWidth * 1.8); // Top
    ctx.lineTo(arrowLength, 0); // Sharp tip
    ctx.lineTo(headStartX + arrowHeadLength * 0.3, arrowShaftWidth * 1.8); // Bottom
    ctx.closePath();
    ctx.fill();
    
    // Top highlight layer (white) - left edge
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
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
    
    // Extra sharp tip accent (hot pink) - easiest to see on dark/green UFO
    ctx.fillStyle = `rgba(255, 0, 180, ${alpha * 0.95})`;
    ctx.beginPath();
    ctx.moveTo(arrowLength - 2, -arrowShaftWidth * 0.8); // Top
    ctx.lineTo(arrowLength, 0); // Sharp tip
    ctx.lineTo(arrowLength - 2, arrowShaftWidth * 0.8); // Bottom
    ctx.closePath();
    ctx.fill();

    // Subtle glow around arrow for readability
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(0, 240, 255, ${alpha * 0.35})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(shaftStartX, 0);
    ctx.lineTo(arrowLength, 0);
    ctx.stroke();
    ctx.restore();
    
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
    ctx.fillStyle = `rgba(0, 200, 0, ${slashAlpha * 0.9})`; // Green tip
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
      
      // Lightning bolt - bright yellow
      ctx.fillStyle = `rgba(255, 235, 80, ${alpha})`;
      ctx.fillRect(lightningX, lightningY, 2, 2);
      ctx.fillRect(lightningX - 2, lightningY + 2, 2, 2);
      ctx.fillRect(lightningX - 4, lightningY + 4, 2, 2);
      ctx.fillRect(lightningX - 2, lightningY + 6, 2, 2);
      ctx.fillRect(lightningX - 4, lightningY + 8, 2, 2);
      ctx.fillRect(lightningX - 6, lightningY + 10, 2, 2);
      
      // Crit damage number - yellow with dark outline
      ctx.fillStyle = `rgba(255, 235, 80, ${alpha})`;
      ctx.strokeStyle = `rgba(0, 0, 0, ${Math.min(0.9, alpha * 0.9)})`;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
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
    if (dmgNum.isCrit) {
      ctx.strokeText(`${dmgNum.value}`, dmgNum.x, dmgNum.y);
    }
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
    
    if (TOXIC_PLATFORMS_ENABLED) {
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
    } else {
      ctx.setLineDash([]); // Ensure solid lines when platforms disabled
    }
    
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

    // Center obstacle (replaces mid-wall): stone sprite that blocks players (and bullets).
    if (PVP_CENTER_OBSTACLE_ENABLED && (gameMode === 'PvP' || gameMode === 'Training')) {
      const o0 = getPvpCenterObstacle();
      const shake = getStoneShakeOffset(Date.now());
      // Render-only shake: collision uses stable center in physics.
      const o = { ...o0, x: o0.x + shake.x, y: o0.y + shake.y };

      // Draw sprite if available (fallback: keep a simple circle so obstacle is still visible)
      if (stoneSpriteProcessed) {
        const iw = stoneSpriteProcessed.width || 1;
        const ih = stoneSpriteProcessed.height || 1;
        // Fit sprite to the collider radius (slightly larger so visuals match collision)
        const worldW = o.renderR * 2.05; // render size independent from collision
        const worldH = worldW * (ih / iw);
        const dx = Math.round(o.x - worldW / 2);
        const dy = Math.round(o.y - worldH / 2);

        // Halo/rim-light behind the stone: draw the sprite with drop-shadow(s),
        // then draw the sprite normally on top (so the glow is only around the contour).
        if (PVP_STONE_HALO_ENABLED) {
          ctx.save();
          (ctx as any).imageSmoothingEnabled = false;
          ctx.globalCompositeOperation = 'source-over';
          // Two-layer halo: soft colored glow + tighter white inner ring.
          ctx.filter = `drop-shadow(0 0 ${PVP_STONE_HALO_BLUR_PX}px ${PVP_STONE_HALO_COLOR}) drop-shadow(0 0 ${PVP_STONE_HALO_BLUR_INNER_PX}px ${PVP_STONE_HALO_COLOR_INNER})`;
          ctx.globalAlpha = 1;
          ctx.drawImage(stoneSpriteProcessed, dx, dy, worldW, worldH);
          ctx.restore();
        }

        ctx.save();
        (ctx as any).imageSmoothingEnabled = false;
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(stoneSpriteProcessed, dx, dy, worldW, worldH);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = 0.9;
        // Fallback stone circle + halo so it still reads like an eclipse.
        if (PVP_STONE_HALO_ENABLED) {
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = PVP_STONE_HALO_COLOR;
          ctx.lineWidth = 10;
          ctx.shadowColor = PVP_STONE_HALO_COLOR;
          ctx.shadowBlur = PVP_STONE_HALO_BLUR_PX;
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.renderR + 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.renderR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Debug overlay: draw compound hit circles + numbers
      if (PVP_STONE_HITBOX_DEBUG) {
        const halfW = o0.halfW; // use stable geometry (no shake) so it matches collision exactly
        const halfH = o0.halfH;
        const baseR = o0.baseR;
        ctx.save();
        (ctx as any).imageSmoothingEnabled = false;
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 2;
        ctx.font = 'bold 12px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < PVP_STONE_HITBOX.length; i++) {
          const c = PVP_STONE_HITBOX[i];
          const cx = o0.x + c.u * halfW;
          const cy = o0.y + c.v * halfH;
          const rr = c.r * baseR;
          ctx.strokeStyle = 'rgba(0, 255, 80, 0.95)';
          ctx.beginPath();
          ctx.arc(cx, cy, rr, 0, Math.PI * 2);
          ctx.stroke();

          // center dot
          ctx.fillStyle = 'rgba(0, 255, 80, 0.95)';
          ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 3, 3);

          // label
          const label = String(i);
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.strokeText(label, cx, cy);
          ctx.lineWidth = 2;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, cx, cy);
        }
        ctx.restore();
      }
    }

    // Mid-wall rendering disabled (we keep the code gated for potential future modes).
    if (PVP_MID_WALL_ENABLED && (gameMode === 'PvP' || gameMode === 'Training')) {
      const midX = (pvpBounds.left + pvpBounds.right) / 2;
      const half = PVP_MID_WALL_THICKNESS / 2;
      ctx.fillStyle = '#000000';
      ctx.fillRect(midX - half, pvpBounds.top, PVP_MID_WALL_THICKNESS, wallBottomY - pvpBounds.top);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(midX - half, pvpBounds.top, PVP_MID_WALL_THICKNESS, wallBottomY - pvpBounds.top);

      // Mid-wall "timer body": rises bottom->top over a full 10s (planning+execute) cycle.
      // Visible to players. Only for 5SEC PvP mode when connected.
      try {
        if (TURN_BASED_PVP_ENABLED && gameMode === 'PvP' && colyseusService.isConnectedToRoom()) {
          const room: any = colyseusService.getRoom();
          const started = !!room?.state?.gameStarted;
          if (started && (turnPhase !== 'lobby')) {
            const nowServer = getServerNowMs();
            const planDur = (typeof turnPlanDurationMs === 'number' && turnPlanDurationMs > 0) ? turnPlanDurationMs : 5000;
            const execDur = (typeof turnExecuteDurationMs === 'number' && turnExecuteDurationMs > 0) ? turnExecuteDurationMs : 5000;
            const total = Math.max(1, planDur + execDur); // ~10s
            const planStart =
              (typeof turnPlanStartServerTs === 'number' && turnPlanStartServerTs > 0)
                ? turnPlanStartServerTs
                : ((typeof turnExecuteStartAt === 'number' && turnExecuteStartAt > 0) ? (turnExecuteStartAt - planDur) : nowServer);

            const topY = pvpBounds.top;
            const bottomY = wallBottomY;

            // Movement rule:
            // - PLANNING: body rises bottom -> top
            // - EXECUTE:  body descends top -> bottom
            const elapsedInPlan = Math.max(0, Math.min(planDur, nowServer - planStart));
            const execStart =
              (typeof turnExecuteStartAt === 'number' && turnExecuteStartAt > 0)
                ? turnExecuteStartAt
                : (planStart + planDur);
            const elapsedInExec = Math.max(0, Math.min(execDur, nowServer - execStart));

            let y: number;
            if (turnPhase === 'planning') {
              const tUp = Math.max(0, Math.min(1, elapsedInPlan / planDur));
              y = bottomY - tUp * (bottomY - topY);
            } else {
              const tDown = Math.max(0, Math.min(1, elapsedInExec / execDur));
              y = topY + tDown * (bottomY - topY);
            }

            // Draw a small "body" on the wall (pixel-friendly)
            const bodyW = 18;
            const bodyH = 18;
            const bodyX = Math.round(midX - bodyW / 2);
            const bodyY = Math.round(y - bodyH / 2);

            ctx.save();
            // subtle background plate so it pops on black wall
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.strokeRect(bodyX + 1, bodyY + 1, bodyW - 2, bodyH - 2);
            // center dot (gives "body" feel)
            ctx.fillStyle = '#000000';
            ctx.fillRect(bodyX + Math.floor(bodyW / 2) - 2, bodyY + Math.floor(bodyH / 2) - 2, 4, 4);
            ctx.restore();

            // Phase timer text: countdown + "PLANNING"/"REPLAY" label.
            // Use server-synced timestamps so both players see consistent time.
            try {
              const phaseEndsAt = (typeof turnPhaseEndsAt === 'number' && turnPhaseEndsAt > 0) ? turnPhaseEndsAt : 0;
              let remainingMs = 0;
              if (phaseEndsAt > 0) {
                remainingMs = Math.max(0, phaseEndsAt - nowServer);
              } else if (turnPhase === 'planning') {
                remainingMs = Math.max(0, planDur - (nowServer - planStart));
              } else {
                remainingMs = Math.max(0, execDur - (nowServer - execStart));
              }
              const remainingSec = (remainingMs / 1000);
              const label = (turnPhase === 'planning') ? 'PLANNING' : 'REPLAY';
              const text = `${label} ${remainingSec.toFixed(1)}s`;
              ctx.save();
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.font = 'bold 18px "Press Start 2P"';
              // outline for readability
              ctx.lineWidth = 4;
              ctx.strokeStyle = '#000000';
              ctx.strokeText(text, midX, pvpBounds.top + 8);
              ctx.fillStyle = '#ffffff';
              ctx.fillText(text, midX, pvpBounds.top + 8);
              ctx.restore();
            } catch {}
          }
        }
      } catch {}
    }
    
    // Highlight borders (top, left, right)
    drawPerimeterHighlight(ctx);

    // Turn-based PvP: show time via mid-wall + timer text.
    
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
    const shadowPlanning = false;
    for (const playerId in pvpPlayers) {
      const player = pvpPlayers[playerId];
      
      // Skip drawing player if death animation is playing
      if (deathAnimations.has(playerId)) {
        continue; // Don't draw player during death animation
      }

      // Turn-based role tint: defender slightly darker, attacker stays original
      ctx.save();
      if (isTurnBasedPvP() && turnDefenderId && playerId === turnDefenderId) {
        ctx.globalAlpha = 0.75;
      }
      
      // Draw fading trail (behind the player)
      if (PVP_UFO_SPEED_TRAIL_ENABLED) {
        // IMPORTANT: Opponent UFO is rendered with interpolation (a slight visual delay),
        // while physics state (player.x/y) is "now". To keep the shadow tail visually attached,
        // shift tail segments by the same render offset we apply to the opponent UFO.
        let offX = 0;
        let offY = 0;
        if (playerId === opponentId) {
          const ip = getOpponentInterpolatedPos(Date.now());
          if (ip) {
            offX = ip.x - player.x;
            offY = ip.y - player.y;
          }
        }
        ctx.save();
        // Arena background is now dark; use a lighter (almost "starlight") trail so it stays visible.
        const SHADOW_TAIL_ALPHA = 0.22;
        for (const seg of player.speedTrail) {
          const alpha = (seg.life / seg.maxLife) * SHADOW_TAIL_ALPHA;
          const radius = (seg.size ?? (player.radius * 1.2)) * (seg.life / seg.maxLife);
          ctx.fillStyle = `rgba(200, 225, 255, ${alpha})`;
          ctx.beginPath();
          ctx.arc(seg.x + offX, seg.y + offY, radius, 0, Math.PI * 2);
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
      
      // Draw player with UFO sprite and profile picture inside
      const profilePicture = playerId === myPlayerId 
        ? profileManager.getProfilePicture() 
        : player.profilePicture;
      
      // UFO render direction + rotation smoothing (prevents flicker when vx crosses ~0 while drifting to neutral)
      const nowForRender = Date.now();
      const ipState = (playerId === opponentId) ? getOpponentInterpolatedState(nowForRender) : null;
      const rvx = ipState ? ipState.vx : player.vx;
      const rvy = ipState ? ipState.vy : player.vy;
      const speed = Math.sqrt(rvx * rvx + rvy * rvy);

      // Stable facing with hysteresis
      const VX_FACE_ON = 0.35;
      if (player.facingLeft) {
        if (rvx > VX_FACE_ON) player.facingLeft = false;
        } else {
        if (rvx < -VX_FACE_ON) player.facingLeft = true;
      }

      // Continuous target angle: remove the hard branch on |vx| and smoothly return to neutral
      const absVx = Math.abs(rvx);
      const denom = absVx + 0.9; // bias removes snap when absVx -> 0
      // IMPORTANT: no hard "speed < threshold => 0" snap.
      // Instead, fade rotation towards neutral as speed approaches 0.
      const baseAngle = Math.atan2(rvy, denom);
      const fade = clamp((speed - 0.03) / 0.55, 0, 1);
      const targetAngle = baseAngle * fade;

      // Smooth it (visual only)
      const tAngle = smoothT(0.18, averageFrameTime);
      player.renderAngle = lerpAngle(player.renderAngle || 0, targetAngle, tAngle);

      const rotationAngle = player.renderAngle;
      const isMovingLeft = player.facingLeft;
      
      ctx.save();
      
      // Translate to player position and rotate
      let px = player.x;
      let py = player.y;
      if (playerId === opponentId) {
        if (ipState) {
          px = ipState.x;
          py = ipState.y;
        } else {
          const ip = getOpponentInterpolatedPos(nowForRender);
          if (ip) {
            px = ip.x;
            py = ip.y;
          }
        }
      }
      ctx.translate(px, py);
      ctx.rotate(rotationAngle + player.ufoTilt); // Add tilt effect for balancing/sway
      
      // Apply horizontal flip (mirror effect) if moving left
      if (isMovingLeft) {
        ctx.scale(-1, 1); // Flip horizontally
      }
      
      // Draw UFO sprite (base layer)
      if (ufoSprite && ufoSprite.complete) {
        try {
          // Draw UFO sprite scaled to fit player radius
          const spriteSize = player.radius * 5.0; // Even larger sprite size
          ctx.drawImage(ufoSprite, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
        } catch (error) {
          console.error('Error drawing UFO sprite:', error);
          // Fallback to black circle
          ctx.fillStyle = dotColor;
          ctx.beginPath();
          ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // UFO sprite not loaded - show black circle
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Draw profile picture inside UFO sprite (if available)
      if (profilePicture) {
        const cachedImage = nftImageCache.get(profilePicture);
        if (cachedImage && cachedImage.complete) {
          try {
            // Create clipping path for profile picture (smaller circle inside UFO)
            ctx.beginPath();
            const profileRadius = player.radius * 1.2 - 8; // Profile picture, smaller (8px less radius)
            ctx.arc(0, -player.radius * 0.2, profileRadius, 0, Math.PI * 2); // Slightly above center for dome position
            ctx.clip();
            
            // Calculate aspect ratio to fit image in circle
            const imgAspect = cachedImage.width / cachedImage.height;
            let drawWidth = profileRadius * 2;
            let drawHeight = profileRadius * 2;
            let drawX = -profileRadius;
            let drawY = -player.radius * 0.2 - profileRadius; // Position in dome area
            
            if (imgAspect > 1) {
              // Image is wider - fit to height
              drawWidth = profileRadius * 2 * imgAspect;
              drawX = -drawWidth / 2;
            } else {
              // Image is taller - fit to width
              drawHeight = profileRadius * 2 / imgAspect;
              drawY = -player.radius * 0.2 - drawHeight / 2;
            }
            
            ctx.drawImage(cachedImage, drawX, drawY, drawWidth, drawHeight);
          } catch (error) {
            console.error('Error drawing profile picture inside UFO:', error);
          }
        }
      }
      
      ctx.restore();
      // NOTE: Do NOT call ctx.stroke() here without a fresh path.
      // It would stroke the last arc path (often the speedTrail segment) and create an ugly black outline.
      
      // Draw magnetic wave animation when gravity is active
      const now = Date.now();
      if (player.gravityActiveUntil > now) {
        const timeRemaining = player.gravityActiveUntil - now;
        const waveProgress = 1 - (timeRemaining / gravityActiveDuration); // 0 to 1
        const waveSpeed = 0.02; // Speed of wave animation
        const waveTime = Date.now() * waveSpeed;
        
        // Draw multiple concentric waves
        for (let i = 0; i < 3; i++) {
          const waveOffset = (waveTime + i * 0.5) % (Math.PI * 2);
          const waveRadius = player.radius + 10 + Math.sin(waveOffset) * 5 + i * 8;
          const waveAlpha = 0.3 * (1 - waveProgress) * (1 - i * 0.3); // Fade out as gravity ends
          
          ctx.strokeStyle = `rgba(100, 100, 100, ${waveAlpha})`; // Gray magnetic waves
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(player.x, player.y, waveRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      
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
          const isAiming = projectileAiming;
          const currentTime = Date.now();
          const timeSinceLastShot = currentTime - projectileLastShotTime;
          const remainingCooldown = Math.max(0, projectileCooldown - timeSinceLastShot);
          const isOnCooldown = remainingCooldown > 0;
          
          // Frame background
          ctx.fillStyle = isFlying ? '#ffff00' : (isAiming ? '#ffcc00' : (isOnCooldown ? '#ffcccc' : '#ccffcc'));
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
          } else if (isAiming) {
            ctx.fillStyle = '#ffaa00';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText('AIMING', weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
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
        
        // Mine/Trap weapon panel
        {
          const weaponPanelY = 340;
          const currentTime = Date.now();
          const timeSinceLastPlace = currentTime - mineLastPlaceTime;
          const remainingCooldown = Math.max(0, mineCooldown - timeSinceLastPlace);
          const isOnCooldown = remainingCooldown > 0;
          const hasMines = mines.length > 0 && mines.some(m => !m.exploded);
          
          // Frame background
          ctx.fillStyle = hasMines ? '#ffff00' : (isOnCooldown ? '#ffcccc' : '#ccffcc'); // Yellow if mines active, light red if cooldown, light green if ready
          ctx.fillRect(weaponPanelX, weaponPanelY, weaponPanelWidth, weaponPanelHeight);
          
          // Frame border
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.strokeRect(weaponPanelX, weaponPanelY, weaponPanelWidth, weaponPanelHeight);
          
          // Weapon name
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 10px "Press Start 2P"';
          ctx.textAlign = 'left';
          ctx.fillText('MINE', weaponPanelX + 10, weaponPanelY + 15);
          
          // Key hint (always black, left side)
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 7px "Press Start 2P"';
          ctx.fillText('Press 4', weaponPanelX + 10, weaponPanelY + 30);
          
          // Status text (right side)
          ctx.textAlign = 'right';
          if (hasMines) {
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText('ACTIVE', weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
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
            const cooldownProgress = remainingCooldown / mineCooldown;
            const barWidth = (weaponPanelWidth - 20) * (1 - cooldownProgress);
            const barX = weaponPanelX + 10;
            const barY = weaponPanelY + weaponPanelHeight - 8;
            const barHeight = 4;
            
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(barX, barY, barWidth, barHeight);
          }
        }
        
        // Bullet weapon panel
        {
          const weaponPanelY = 280;
          const currentTime = Date.now();
          const timeSinceLastShot = currentTime - bulletLastShotTime;
          const remainingCooldown = Math.max(0, bulletCooldown - timeSinceLastShot);
          const isOnCooldown = remainingCooldown > 0;
          const isFlying = bullets.length > 0;
          const canFireNext = shotsInBurst < 2 && (shotsInBurst === 0 || (currentTime - lastBurstShotTime >= bulletBurstDelay));
          
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
          } else if (shotsInBurst === 1 && !canFireNext) {
            // Waiting for burst delay
            const timeUntilNext = bulletBurstDelay - (currentTime - lastBurstShotTime);
            ctx.fillStyle = '#ffaa00';
            ctx.font = 'bold 7px "Press Start 2P"';
            ctx.fillText(`${(timeUntilNext / 1000).toFixed(1)}s`, weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
          } else {
            ctx.fillStyle = '#00ff00';
            ctx.font = 'bold 8px "Press Start 2P"';
            ctx.fillText(`READY (${shotsInBurst}/2)`, weaponPanelX + weaponPanelWidth - 10, weaponPanelY + 30);
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
        const barX = px - barWidth / 2;
        const barY = py - player.radius - 8; // Bar position
        
        // Draw "You" text above HP bar (only for my player)
        if (myPlayerId && playerId === myPlayerId) {
          ctx.font = 'bold 8px "Press Start 2P"';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          // Readable on dark arena background
          ctx.lineJoin = 'round';
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillStyle = '#ffffff';
          ctx.strokeText('You', px, barY - 3);
          ctx.fillText('You', px, barY - 3);
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

      ctx.restore();
    }
    
    // PvP mode: Draw projectile trajectory (dotted line) when aiming
    if (projectileAiming && myPlayerId && pvpPlayers[myPlayerId]) {
      const myPlayer = pvpPlayers[myPlayerId];
      
      // Always use current player position (not the initial charging position)
      const currentStartX = myPlayer.x;
      const currentStartY = myPlayer.y;
      
      // Calculate direction to mouse position (player controls trajectory with mouse)
      const dx = globalMouseX - currentStartX;
      const dy = globalMouseY - currentStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0) {
        const vx = (dx / distance) * projectileLaunchSpeed;
        const vy = (dy / distance) * projectileLaunchSpeed;
        
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
        const trajectoryGravity = projectileGravity;
        for (let i = 0; i < 40; i++) {
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
    
    // PvP mode: Draw flying bullets (my bullets) - doubled size for heavier look
    for (const bullet of bullets) {
      ctx.save();
      if (shadowPlanning) ctx.globalAlpha = 0.75;
      ctx.translate(bullet.x, bullet.y);
      
      // Calculate angle from velocity
      const bulletAngle = Math.atan2(bullet.vy, bullet.vx);
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

    // Turn-based PvP: draw server-driven projectiles
    if (isTurnBasedPvP() && turnProjectiles.length > 0) {
      for (const p of turnProjectiles) {
        ctx.save();
        ctx.translate(p.x, p.y);
        const angle = Math.atan2(p.vy, p.vx);
        ctx.rotate(angle);
        if (p.projType === 'bullet') {
          // Match realtime bullet art (so PLANNING and EXECUTE look the same)
          const bulletLength = 24;
          const bulletWidth = 4;
          const tipLength = 8;

          // Body
          ctx.fillStyle = '#666666';
          ctx.fillRect(-bulletLength / 2, -bulletWidth / 2, bulletLength - tipLength, bulletWidth);

          // Tip
          ctx.fillStyle = '#00ff00';
          ctx.beginPath();
          ctx.moveTo(bulletLength / 2 - tipLength, -bulletWidth / 2);
          ctx.lineTo(bulletLength / 2, 0);
          ctx.lineTo(bulletLength / 2 - tipLength, bulletWidth / 2);
          ctx.closePath();
          ctx.fill();

          // Outline
          ctx.strokeStyle = '#444444';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-bulletLength / 2, -bulletWidth / 2, bulletLength - tipLength, bulletWidth);
          ctx.strokeStyle = '#00aa00';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(bulletLength / 2 - tipLength, -bulletWidth / 2);
          ctx.lineTo(bulletLength / 2, 0);
          ctx.lineTo(bulletLength / 2 - tipLength, bulletWidth / 2);
          ctx.closePath();
          ctx.stroke();
        } else if (p.projType === 'arrow') {
          // Match realtime PvP arrow art (same as the regular arrow render)
          const shaftLength = arrowLength - arrowHeadLength - arrowFletchingLength;
          const shaftStartX = arrowFletchingLength;
          ctx.fillStyle = 'rgba(101, 67, 33, 1)'; // Brown wood color
          ctx.fillRect(shaftStartX, -arrowShaftWidth / 2, shaftLength, arrowShaftWidth);

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
          ctx.fillStyle = 'rgba(0, 200, 0, 0.9)'; // Green tip
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
        } else {
          // Weapon 2 sprite (boom) - fallback to simple shape if sprite not loaded.
          if (boomSpriteProcessed) {
            const iw = boomSpriteProcessed.width || 1;
            const ih = boomSpriteProcessed.height || 1;
            const aspect = ih / iw;
            const worldW = projectileRadius * 2.3;
            const worldH = worldW * aspect;
            const pivotX = 0.5;
            const pivotY = 0.5;
            // Sprite is authored facing the opposite direction; rotate 180deg so tip faces velocity.
            ctx.save();
            ctx.rotate(Math.PI);
            ctx.drawImage(boomSpriteProcessed, -pivotX * worldW, -pivotY * worldH, worldW, worldH);
            ctx.restore();
        } else {
          // Match realtime heavy projectile art (cannonball + pointed tip)
          const length = 24;
          const width = 12;
          const tipLength = 8;
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(-length / 2, -width / 2, length - tipLength, width);
          ctx.beginPath();
          ctx.moveTo(length / 2 - tipLength, -width / 2);
          ctx.lineTo(length / 2, 0);
          ctx.lineTo(length / 2 - tipLength, width / 2);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#654321';
          ctx.lineWidth = 3;
          ctx.strokeRect(-length / 2, -width / 2, length - tipLength, width);
          ctx.beginPath();
          ctx.moveTo(length / 2 - tipLength, -width / 2);
          ctx.lineTo(length / 2, 0);
          ctx.lineTo(length / 2 - tipLength, width / 2);
          ctx.closePath();
          ctx.stroke();
          }
        }
        ctx.restore();
      }
    }
    
    // PvP mode: Draw mines/traps (bomb-like appearance)
    for (const mine of mines) {
      if (mine.exploded) continue; // Skip exploded mines
      
      const now = Date.now();
      const mineAge = now - mine.spawnTime;
      const timeUntilExplosion = mineLifetime - mineAge;
      const explosionProgress = mineAge / mineLifetime; // 0 to 1
      
      ctx.save();
      ctx.translate(mine.x, mine.y);
      
      // Smaller pulsing effect - subtle pulse
      const pulse = Math.sin(explosionProgress * Math.PI * 8) * 0.1 + 0.95; // Reduced from 0.3 to 0.1, slower pulse
      const mineSize = mineRadius * pulse;
      
      // Draw mine body (dark bomb-like circle)
      ctx.fillStyle = explosionProgress > 0.8 ? '#440000' : '#220000'; // Dark red/black bomb color
      ctx.beginPath();
      ctx.arc(0, 0, mineSize, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw mine outline (thicker for bomb look)
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw burning fuse (klanas) - shrinks as explosion approaches
      const fuseHeight = Math.max(2, (1 - explosionProgress) * 12); // Shrinks from 12px to 2px
      const fuseWidth = 3;
      const fuseY = -mineSize - fuseHeight / 2; // Above the mine
      
      // Draw fuse body (brown/black)
      ctx.fillStyle = '#331100'; // Dark brown fuse color
      ctx.fillRect(-fuseWidth / 2, fuseY, fuseWidth, fuseHeight);
      
      // Draw burning flame at top of fuse (shrinks as fuse burns)
      const flameSize = Math.max(1, fuseHeight * 0.6); // Flame size relative to fuse
      const flameColors = ['#ff6600', '#ff9900', '#ffff00']; // Orange to yellow gradient
      
      // Draw flame layers (from outer to inner)
      for (let i = 0; i < flameColors.length; i++) {
        const layerSize = flameSize * (1 - i * 0.3);
        ctx.fillStyle = flameColors[i];
        ctx.beginPath();
        // Draw flame shape (teardrop/triangle pointing up)
        ctx.moveTo(0, fuseY - fuseHeight / 2); // Top center
        ctx.lineTo(-layerSize / 2, fuseY - fuseHeight / 2 - layerSize); // Top left
        ctx.lineTo(0, fuseY - fuseHeight / 2 - layerSize * 1.2); // Top point
        ctx.lineTo(layerSize / 2, fuseY - fuseHeight / 2 - layerSize); // Top right
        ctx.closePath();
        ctx.fill();
      }
      
      ctx.restore();
    }
    
    // PvP mode: Draw spikes (from exploded mines)
    for (const spike of spikes) {
      ctx.save();
      if (shadowPlanning) ctx.globalAlpha = 0.75;
      ctx.translate(spike.x, spike.y);
      
      // Calculate angle from velocity
      const spikeAngle = Math.atan2(spike.vy, spike.vx);
      ctx.rotate(spikeAngle);
      
      // Draw spike as a small red triangle (smaller size)
      ctx.fillStyle = '#ff0000'; // Red color
      ctx.beginPath();
      ctx.moveTo(spikeRadius * 1.5, 0); // Point forward (reduced from 2x to 1.5x)
      ctx.lineTo(-spikeRadius * 0.8, -spikeRadius * 0.8); // Smaller base
      ctx.lineTo(-spikeRadius * 0.8, spikeRadius * 0.8);
      ctx.closePath();
      ctx.fill();
      
      // Draw outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      ctx.restore();
    }
    
    // PvP mode: Draw opponent bullet - doubled size for heavier look
    if (opponentBulletFlying && gameMode === 'PvP') {
      ctx.save();
      if (shadowPlanning) ctx.globalAlpha = 0.75;
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
      if (shadowPlanning) ctx.globalAlpha = 0.75;
      ctx.translate(projectileX, projectileY);
      
      // Calculate angle from velocity
      const angle = Math.atan2(projectileVy, projectileVx);
      ctx.rotate(angle);
      
      if (boomSpriteProcessed) {
        const iw = boomSpriteProcessed.width || 1;
        const ih = boomSpriteProcessed.height || 1;
        const aspect = ih / iw;
        // Scale from physics radius so it stays consistent with hitbox/feel.
        const worldW = projectileRadius * 2.3;
        const worldH = worldW * aspect;
        ctx.save();
        ctx.rotate(Math.PI);
        ctx.drawImage(boomSpriteProcessed, -worldW * 0.5, -worldH * 0.5, worldW, worldH);
        ctx.restore();
      } else {
        // Fallback: old cannonball+tip
      const length = 24; // Short projectile (doubled from 12)
      const width = 12; // Width of projectile (doubled from 6)
      const tipLength = 8; // Pointed tip length (doubled from 4)
      ctx.fillStyle = '#8B4513'; // Brown cannonball color
      ctx.beginPath();
      ctx.fillRect(-length / 2, -width / 2, length - tipLength, width);
      ctx.beginPath();
      ctx.moveTo(length / 2 - tipLength, -width / 2);
        ctx.lineTo(length / 2, 0);
      ctx.lineTo(length / 2 - tipLength, width / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#654321';
        ctx.lineWidth = 3;
      ctx.strokeRect(-length / 2, -width / 2, length - tipLength, width);
      ctx.beginPath();
      ctx.moveTo(length / 2 - tipLength, -width / 2);
      ctx.lineTo(length / 2, 0);
      ctx.lineTo(length / 2 - tipLength, width / 2);
      ctx.closePath();
      ctx.stroke();
      }
      
      ctx.restore();
    }
    
    // PvP mode: Draw opponent's flying projectile - cannonball shape with pointed tip
    if (opponentProjectileFlying && gameMode === 'PvP') {
      ctx.save();
      if (shadowPlanning) ctx.globalAlpha = 0.75;
      ctx.translate(opponentProjectileX, opponentProjectileY);
      
      // Calculate angle from velocity
      const angle = Math.atan2(opponentProjectileVy, opponentProjectileVx);
      ctx.rotate(angle);
      
      if (boomSpriteProcessed) {
        const iw = boomSpriteProcessed.width || 1;
        const ih = boomSpriteProcessed.height || 1;
        const aspect = ih / iw;
        const worldW = projectileRadius * 2.3;
        const worldH = worldW * aspect;
        // Slight tint so you can still distinguish opponent projectile.
        ctx.save();
        ctx.save();
        ctx.rotate(Math.PI);
        ctx.drawImage(boomSpriteProcessed, -worldW * 0.5, -worldH * 0.5, worldW, worldH);
        ctx.restore();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(255, 190, 120, 0.25)';
        ctx.fillRect(-worldW * 0.5, -worldH * 0.5, worldW, worldH);
        ctx.restore();
      } else {
        // Fallback: old cannonball+tip
        const length = 24;
        const width = 12;
        const tipLength = 8;
        ctx.fillStyle = '#CD853F';
      ctx.beginPath();
      ctx.fillRect(-length / 2, -width / 2, length - tipLength, width);
      ctx.beginPath();
      ctx.moveTo(length / 2 - tipLength, -width / 2);
        ctx.lineTo(length / 2, 0);
      ctx.lineTo(length / 2 - tipLength, width / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 3;
      ctx.strokeRect(-length / 2, -width / 2, length - tipLength, width);
      ctx.beginPath();
      ctx.moveTo(length / 2 - tipLength, -width / 2);
      ctx.lineTo(length / 2, 0);
      ctx.lineTo(length / 2 - tipLength, width / 2);
      ctx.closePath();
      ctx.stroke();
      }
      
      ctx.restore();
    }
    
    // PvP mode: Draw health pack (only one at a time) - beautiful medical cross
    if (HEALTH_PACKS_ENABLED && healthPack) {
      ctx.save();
      ctx.translate(healthPack.x, healthPack.y);
      
      const size = healthPackRadius;
      const timeSinceSpawn = Date.now() - healthPack.spawnTime;
      const pulse = Math.sin(timeSinceSpawn / 400) * 0.1 + 0.9; // Gentle pulsing effect
      const pulseSize = size * pulse;
      
      // Draw outer glow circle (subtle green glow)
      ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
      ctx.beginPath();
      ctx.arc(0, 0, pulseSize * 1.4, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw main circle background (bright green)
      ctx.fillStyle = '#00ff00'; // Bright green
      ctx.beginPath();
      ctx.arc(0, 0, pulseSize, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw white plus sign (+) - clean and elegant
      ctx.fillStyle = '#ffffff'; // White color
      const plusLength = pulseSize * 0.6; // Length of plus bars
      const plusThickness = pulseSize * 0.2; // Thickness of plus bars
      
      // Helper function to draw rounded rectangle using quadratic curves
      const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
      };
      
      // Draw horizontal bar of plus sign with rounded corners
      drawRoundedRect(-plusLength / 2, -plusThickness / 2, plusLength, plusThickness, plusThickness / 2);
      
      // Draw vertical bar of plus sign with rounded corners
      drawRoundedRect(-plusThickness / 2, -plusLength / 2, plusThickness, plusLength, plusThickness / 2);
      
      // Draw outline for better visibility
      ctx.strokeStyle = '#00cc00'; // Darker green outline
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, pulseSize, 0, Math.PI * 2);
      ctx.stroke();
      
      // Draw inner highlight for depth (subtle shine effect)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(0, -pulseSize * 0.3, pulseSize * 0.4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    }
    
    // PvP mode: Draw opponent mines/traps (bomb-like appearance)
    for (const mine of opponentMines) {
      if (mine.exploded) continue; // Skip exploded mines
      
      const now = Date.now();
      const mineAge = now - mine.spawnTime;
      const timeUntilExplosion = mineLifetime - mineAge;
      const explosionProgress = mineAge / mineLifetime; // 0 to 1
      
      ctx.save();
      ctx.translate(mine.x, mine.y);
      
      // Smaller pulsing effect - subtle pulse
      const pulse = Math.sin(explosionProgress * Math.PI * 8) * 0.1 + 0.95; // Reduced from 0.3 to 0.1, slower pulse
      const mineSize = mineRadius * pulse;
      
      // Draw mine body (dark bomb-like circle)
      ctx.fillStyle = explosionProgress > 0.8 ? '#440000' : '#220000'; // Dark red/black bomb color
      ctx.beginPath();
      ctx.arc(0, 0, mineSize, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw mine outline (thicker for bomb look)
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw burning fuse (klanas) - shrinks as explosion approaches
      const fuseHeight = Math.max(2, (1 - explosionProgress) * 12); // Shrinks from 12px to 2px
      const fuseWidth = 3;
      const fuseY = -mineSize - fuseHeight / 2; // Above the mine
      
      // Draw fuse body (brown/black)
      ctx.fillStyle = '#331100'; // Dark brown fuse color
      ctx.fillRect(-fuseWidth / 2, fuseY, fuseWidth, fuseHeight);
      
      // Draw burning flame at top of fuse (shrinks as fuse burns)
      const flameSize = Math.max(1, fuseHeight * 0.6); // Flame size relative to fuse
      const flameColors = ['#ff6600', '#ff9900', '#ffff00']; // Orange to yellow gradient
      
      // Draw flame layers (from outer to inner)
      for (let i = 0; i < flameColors.length; i++) {
        const layerSize = flameSize * (1 - i * 0.3);
        ctx.fillStyle = flameColors[i];
        ctx.beginPath();
        // Draw flame shape (teardrop/triangle pointing up)
        ctx.moveTo(0, fuseY - fuseHeight / 2); // Top center
        ctx.lineTo(-layerSize / 2, fuseY - fuseHeight / 2 - layerSize); // Top left
        ctx.lineTo(0, fuseY - fuseHeight / 2 - layerSize * 1.2); // Top point
        ctx.lineTo(layerSize / 2, fuseY - fuseHeight / 2 - layerSize); // Top right
        ctx.closePath();
        ctx.fill();
      }
      
      ctx.restore();
    }
    
    // PvP mode: Draw opponent spikes (from exploded mines)
    for (const spike of opponentSpikes) {
      ctx.save();
      ctx.translate(spike.x, spike.y);
      
      // Calculate angle from velocity
      const spikeAngle = Math.atan2(spike.vy, spike.vx);
      ctx.rotate(spikeAngle);
      
      // Draw spike as a small red triangle (smaller size)
      ctx.fillStyle = '#ff0000'; // Red color
      ctx.beginPath();
      ctx.moveTo(spikeRadius * 1.5, 0); // Point forward (reduced from 2x to 1.5x)
      ctx.lineTo(-spikeRadius * 0.8, -spikeRadius * 0.8); // Smaller base
      ctx.lineTo(-spikeRadius * 0.8, spikeRadius * 0.8);
      ctx.closePath();
      ctx.fill();
      
      // Draw outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      ctx.restore();
    }
    
    // PvP mode: Draw arrow (ready, charging, or flying)
    if (
      ((pvpArrowReady && !pvpArrowFired && myPlayerId && pvpPlayers[myPlayerId]) ||
        (pvpArrowCharging && myPlayerId && pvpPlayers[myPlayerId]) ||
        (pvpKatanaFlying && myPlayerId && pvpPlayers[myPlayerId]))
    ) {
      ctx.save();
      
      if (!myPlayerId || !pvpPlayers[myPlayerId]) {
        ctx.restore();
        return;
      }
      const myPlayer = pvpPlayers[myPlayerId];

      // Visual: small blue "energy emitter" under the UFO when arrow is ready/charging.
      // This makes the arrow feel "held" by energy rather than floating.
      if (!pvpKatanaFlying) {
        const emitterX = myPlayer.x;
        const emitterY = myPlayer.y + myPlayer.radius * 1.35; // near UFO bottom
        const glowR = Math.max(10, myPlayer.radius * 0.55);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(emitterX, emitterY, 0, emitterX, emitterY, glowR * 2.4);
        g.addColorStop(0, 'rgba(80, 180, 255, 0.55)');
        g.addColorStop(0.35, 'rgba(40, 140, 255, 0.28)');
        g.addColorStop(1, 'rgba(40, 140, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(emitterX, emitterY, glowR * 2.4, 0, Math.PI * 2);
        ctx.fill();
        // Core light
        ctx.fillStyle = 'rgba(120, 220, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(emitterX, emitterY, glowR * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Always use current player position (arrow stays near player, like trajectory line)
      const arrowPosX = pvpKatanaFlying ? pvpKatanaX : myPlayer.x;
      const arrowPosY = pvpKatanaFlying ? pvpKatanaY : (myPlayer.y + PVP_ARROW_SPAWN_OFFSET_Y);
      
      // Calculate angle - arrow follows player position but points towards mouse (like Solo mode)
      let currentArrowAngle;
      if (pvpKatanaFlying) {
        // Flying - use stored angle
        currentArrowAngle = pvpKatanaAngle;
      } else if (pvpArrowCharging) {
        // Charging - point towards stored aim point (captured on click)
        const dx = pvpArrowChargeAimX - myPlayer.x;
        const dy = pvpArrowChargeAimY - (myPlayer.y + PVP_ARROW_SPAWN_OFFSET_Y);
        currentArrowAngle = Math.atan2(dy, dx);
      } else {
        // Ready state - point arrow towards mouse (arrow stays at player position, but aims at mouse)
        const dx = globalMouseX - myPlayer.x;
        const dy = globalMouseY - (myPlayer.y + PVP_ARROW_SPAWN_OFFSET_Y);
        currentArrowAngle = Math.atan2(dy, dx);
      }
      
      ctx.translate(arrowPosX, arrowPosY);
      ctx.rotate(currentArrowAngle);
      
      // Fade out when exceeding range (only when flying)
      if (pvpKatanaFlying) {
        const fadeT = Math.max(0, Math.min(1, (pvpKatanaTravelPx - PVP_ARROW_RANGE_PX) / Math.max(1, PVP_ARROW_FADE_PX)));
        ctx.globalAlpha *= (1 - fadeT);
      }

      // Charge animation: "tension" effect before release (pull back + stretch)
      if (pvpArrowCharging) {
        const now = Date.now();
        const chargeT = Math.max(0, Math.min(1, 1 - ((pvpArrowChargeFireAt - now) / Math.max(1, PVP_ARROW_CHARGE_MS))));
        // Pull back then snap forward as it reaches full charge
        const pullBackPx = (1 - chargeT) * 18;
        const stretchX = 0.8 + 0.2 * chargeT; // 80% -> 100%
        ctx.translate(-pullBackPx, 0);
        ctx.scale(stretchX, 1);
        ctx.globalAlpha *= (0.65 + 0.35 * chargeT);

        // Simple "string/tension" line behind the arrow
        ctx.save();
        ctx.strokeStyle = `rgba(0, 0, 0, ${0.15 + 0.35 * chargeT})`;
        ctx.lineWidth = 1.5;
      ctx.beginPath();
        ctx.moveTo(-10, -6);
        ctx.lineTo(-10 - pullBackPx * 0.8, 0);
        ctx.lineTo(-10, 6);
        ctx.stroke();
        ctx.restore();
      }

      // Draw arrow sprite (fallback to vector if sprite not loaded)
      if (arrowSpriteProcessed) {
        const iw = arrowSpriteProcessed.width || 1;
        const ih = arrowSpriteProcessed.height || 1;
        const worldW = myPlayer.radius * PVP_ARROW_SPRITE_LENGTH_FACTOR;
        const worldH = worldW * (ih / iw); // preserve aspect ratio
        const pivotX = 0.5; // center pivot
        const pivotY = 0.5;
        const prevSmooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(arrowSpriteProcessed, -pivotX * worldW, -pivotY * worldH, worldW, worldH);
        ctx.imageSmoothingEnabled = prevSmooth;
      } else {
        // Fallback: old vector arrow
        const shaftLength = arrowLength - arrowHeadLength - arrowFletchingLength;
        const shaftStartX = arrowFletchingLength;
        ctx.fillStyle = 'rgba(101, 67, 33, 1)';
        ctx.fillRect(shaftStartX, -arrowShaftWidth / 2, shaftLength, arrowShaftWidth);
      }
      
      ctx.restore();
    }
    
    // PvP mode: Draw opponent's flying arrow
    if (opponentArrowFlying && gameMode === 'PvP' && opponentId) {
      ctx.save();

      const fadeT = Math.max(0, Math.min(1, (opponentArrowTravelPx - PVP_ARROW_RANGE_PX) / Math.max(1, PVP_ARROW_FADE_PX)));
      ctx.globalAlpha *= (1 - fadeT);
      
      ctx.translate(opponentArrowX, opponentArrowY);
      ctx.rotate(opponentArrowAngle);
      
      if (arrowSpriteProcessed) {
        // Use local player's radius as a stable scale reference
        const myR = (myPlayerId && pvpPlayers[myPlayerId]) ? pvpPlayers[myPlayerId].radius : 25;
        const iw = arrowSpriteProcessed.width || 1;
        const ih = arrowSpriteProcessed.height || 1;
        const worldW = myR * PVP_ARROW_SPRITE_LENGTH_FACTOR;
        const worldH = worldW * (ih / iw);
        const pivotX = 0.5;
        const pivotY = 0.5;
        const prevSmooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(arrowSpriteProcessed, -pivotX * worldW, -pivotY * worldH, worldW, worldH);
        ctx.imageSmoothingEnabled = prevSmooth;
      } else {
        // Minimal fallback
      const shaftLength = arrowLength - arrowHeadLength - arrowFletchingLength;
      const shaftStartX = arrowFletchingLength;
        ctx.fillStyle = 'rgba(101, 67, 33, 1)';
      ctx.fillRect(shaftStartX, -arrowShaftWidth / 2, shaftLength, arrowShaftWidth);
      }
      
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
      const myAddress = getMyPvpAddress();
      
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
  const isWalletConnectedForProfile = isPersistenceConnected();
  
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
    
    // NFT Content Area (reduced height to make room for profile picture selection)
    const nftContentY = nftSectionY + 35;
    const nftContentHeight = nftSectionHeight - 180; // Leave space for pagination and profile picture selection
    
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
          
          // Highlight if this NFT is selected as profile picture
          const currentProfilePicture = profileManager.getProfilePicture();
          if (currentProfilePicture === nft.image) {
            // Draw green border to indicate selected
            ctx.strokeStyle = '#00aa00';
            ctx.lineWidth = 3;
            ctx.strokeRect(cardX - 2, cardY - 2, cardWidth + 4, cardHeight + 4);
          }
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
    
    // Profile Picture Selection Section (below NFT collection)
    const profilePictureSectionY = nftSectionY + nftSectionHeight - 140;
    const profilePictureSectionHeight = 120;
    
    // Profile Picture Section Background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(nftSectionX, profilePictureSectionY, nftSectionWidth, profilePictureSectionHeight);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.strokeRect(nftSectionX, profilePictureSectionY, nftSectionWidth, profilePictureSectionHeight);
    
    // Profile Picture Section Title
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 10px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT PROFILE PICTURE', nftSectionX + nftSectionWidth / 2, profilePictureSectionY + 18);
    
    // Current Profile Picture Preview
    const previewSize = 60;
    const previewX = nftSectionX + 20;
    const previewY = profilePictureSectionY + 30;
    const previewCenterX = previewX + previewSize / 2;
    const previewCenterY = previewY + previewSize / 2;
    
    const currentProfilePicture = profileManager.getProfilePicture();
    if (currentProfilePicture) {
      const cachedImage = nftImageCache.get(currentProfilePicture);
      if (cachedImage && cachedImage.complete) {
        try {
          // Draw profile picture preview
          ctx.save();
          ctx.beginPath();
          ctx.arc(previewCenterX, previewCenterY, previewSize / 2, 0, Math.PI * 2);
          ctx.clip();
          
          // Calculate aspect ratio to fit image in circle
          const imgAspect = cachedImage.width / cachedImage.height;
          let drawWidth = previewSize;
          let drawHeight = previewSize;
          let drawX = previewX;
          let drawY = previewY;
          
          if (imgAspect > 1) {
            // Image is wider - fit to height
            drawWidth = previewSize * imgAspect;
            drawX = previewX - (drawWidth - previewSize) / 2;
          } else {
            // Image is taller - fit to width
            drawHeight = previewSize / imgAspect;
            drawY = previewY - (drawHeight - previewSize) / 2;
          }
          
          ctx.drawImage(cachedImage, drawX, drawY, drawWidth, drawHeight);
          ctx.restore();
        } catch (error) {
          console.error('Error drawing profile picture:', error);
          // Fallback to black circle
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.arc(previewCenterX, previewCenterY, previewSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Loading - show black circle
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(previewCenterX, previewCenterY, previewSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // No profile picture - show black circle (default)
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(previewCenterX, previewCenterY, previewSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Preview border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(previewCenterX, previewCenterY, previewSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // Instructions text
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 7px "Press Start 2P"';
    ctx.textAlign = 'left';
    const instructionText = 'Click on any NFT above to set it as your profile picture';
    const instructionX = previewX + previewSize + 15;
    const instructionY = profilePictureSectionY + 50;
    ctx.fillText(instructionText, instructionX, instructionY);
    
    // Current selection indicator
    if (currentProfilePicture) {
      ctx.fillStyle = '#00aa00';
      ctx.font = 'bold 8px "Press Start 2P"';
      ctx.fillText('ACTIVE', instructionX, instructionY + 20);
    } else {
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 7px "Press Start 2P"';
      ctx.fillText('(Default: Black)', instructionX, instructionY + 20);
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
  
  if (isServerBrowserOpen) {
    updateServerBrowserHover(mouseX, mouseY);
    return;
  }
  
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
  } else if (((gameMode === 'Solo' && (isHoveringUpgrade || isHoveringCrit || isHoveringAccuracy || hoveredLevel >= 0)) || isOverProfile || isOverWallet || isHoveringGameMode || isHoveringPvPOnline || isHoveringNewButton || isHoveringReady || isHoveringCancel) && !upgradeAnimation && !isDrawing) {
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
  
  if (isServerBrowserOpen) {
    if (isPointInsideRegion(mouseX, mouseY, serverBrowserCloseRegion)) {
      closeServerBrowser();
      return;
    }

    if (isPointInsideRegion(mouseX, mouseY, serverBrowserModalRegion)) {
      const targetRegion = serverBrowserHitRegions.find(
        (region) =>
          mouseX >= region.x && mouseX <= region.x + region.width &&
          mouseY >= region.y && mouseY <= region.y + region.height
      );

      if (targetRegion) {
        handleServerSelection(targetRegion.id);
      }
    } else {
      closeServerBrowser();
    }
    return;
  }
  
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

  // Turn-based PvP: block legacy realtime PvP mouse controls in play area
  if (isTurnBasedPvPDesired() && mouseX > 240) {
    return;
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
  // Only allow closing if persistence identity is connected (wallet or email auth)
  const isWalletConnectedForClose = isPersistenceConnected();
  
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
          // Also save to Supabase if persistence identity is connected
          const pid = getRoninAddressForPersistence();
          if (pid) {
            supabaseService.updateNickname(pid, newNickname).catch((error) => {
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
      
      // NFT card click handler (select as profile picture)
      const nftContentY = dataStartY + 35;
      const nftContentHeight = nftSectionHeight - 180; // Match render function
      const cardWidth = 200;
      const cardHeight = 200;
      const cardSpacing = 15;
      const gridStartX = nftSectionX + (rightColumnWidth - (cardWidth * 2 + cardSpacing)) / 2;
      const gridStartY = nftContentY + 10;
      
      const startIndex = nftCurrentPage * nftsPerPage;
      const endIndex = Math.min(startIndex + nftsPerPage, nftList.length);
      const currentNfts = nftList.slice(startIndex, endIndex);
      
      for (let i = 0; i < currentNfts.length; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const cardX = gridStartX + col * (cardWidth + cardSpacing);
        const cardY = gridStartY + row * (cardHeight + cardSpacing);
        
        // Check if click is within NFT card bounds
        if (mouseX >= cardX && mouseX <= cardX + cardWidth &&
            mouseY >= cardY && mouseY <= cardY + cardHeight) {
          const nft = currentNfts[i];
          if (nft.image) {
            // Set this NFT as profile picture
            profileManager.setProfilePicture(nft.image);
            
            // Update my player's profile picture
            if (myPlayerId && pvpPlayers[myPlayerId]) {
              pvpPlayers[myPlayerId].profilePicture = nft.image;
              // Send profile picture update to opponent
              sendStatsUpdate(
                pvpPlayers[myPlayerId].hp,
                pvpPlayers[myPlayerId].armor,
                pvpPlayers[myPlayerId].maxHP,
                pvpPlayers[myPlayerId].maxArmor
              );
            }
            
            console.log('Profile picture set to:', nft.name, nft.image);
            return; // Don't process other clicks
          }
        }
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
  // Turn-based PvP: block legacy realtime mouse actions in play area.
  // (A lot of the old PvP logic is handled on mouseup, so we must stop it here too.)
  try {
    const posTB = getCanvasMousePos(e);
    if (isTurnBasedPvPDesired() && posTB.x > 240) {
      // In planning we already handle click on mousedown; ignore mouseup to prevent "mode switching" feel.
      return;
    }
  } catch {}

  // PvP mode: Projectile firing is now handled by keyboard (key "2"), not mouse
  
  // Bullet firing is now handled by keyboard (key "3"), not mouse
  
  // Handle upgrade buttons (works with any button)
  isPressingUpgrade = false;
  isPressingCrit = false;
  isPressingAccuracy = false;
  isPressingReady = false;
  isPressingCancel = false;

  // Wallet provider picker click handling (works even if wallet button isn't pressed)
  if (walletProviderModalOpen) {
    const pos = getCanvasMousePos(e);
    const mouseX = pos.x;
    const mouseY = pos.y;
    const uiPanelW = 240;
    const modalW = 190;
    const modalH = 150;
    const modalX = Math.floor((uiPanelW - modalW) / 2);
    const modalY = 450 - 10 - modalH;
    const btnX = modalX + 10;
    const btnW = modalW - 20;
    const btnH = 30;
    const roninY = modalY + 34;
    const mmY = roninY + btnH + 8;
    const emailY = mmY + btnH + 8;
    const closeX = modalX + modalW - 20;
    const closeY = modalY + 6;

    const canEmail = supabaseService.isConfigured();
    const available = walletService.getAvailableWallets();

    const isInModal = mouseX >= modalX && mouseX <= modalX + modalW && mouseY >= modalY && mouseY <= modalY + modalH;
    const isOnClose = mouseX >= closeX && mouseX <= closeX + 14 && mouseY >= closeY && mouseY <= closeY + 14;
    const isOnRonin = mouseX >= btnX && mouseX <= btnX + btnW && mouseY >= roninY && mouseY <= roninY + btnH;
    const isOnMetaMask = mouseX >= btnX && mouseX <= btnX + btnW && mouseY >= mmY && mouseY <= mmY + btnH;
    const isOnEmail = mouseX >= btnX && mouseX <= btnX + btnW && mouseY >= emailY && mouseY <= emailY + btnH;

    if (isOnClose || !isInModal) {
      walletProviderModalOpen = false;
    } else if (isOnRonin) {
      if (!available.ronin) {
        walletError = 'Ronin not installed';
        walletProviderModalOpen = false;
      } else {
      connectWalletWithProvider('ronin');
      }
    } else if (isOnMetaMask) {
      if (!available.metamask) {
        walletError = 'MetaMask not installed';
        walletProviderModalOpen = false;
      } else {
      connectWalletWithProvider('metamask');
      }
    } else if (isOnEmail) {
      walletProviderModalOpen = false;
      if (!canEmail) {
        walletError = 'Supabase not configured for email login';
      } else {
        walletError = 'Enter email and press SEND';
        openEmailLoginModal();
      }
    }
    isPressingWallet = false;
    return;
  }

  // Email login modal click handling (SEND / CANCEL)
  if (emailLoginModalOpen) {
    const pos = getCanvasMousePos(e);
    const mouseX = pos.x;
    const mouseY = pos.y;
    // Buttons are in UI panel area
    const btnW = 92;
    const btnH = 24;
    const btnY = 450 - 10 - 26;
    const sendX = 20;
    const cancelX = 20 + btnW + 10;
    const isOnSend = mouseX >= sendX && mouseX <= sendX + btnW && mouseY >= btnY && mouseY <= btnY + btnH;
    const isOnCancel = mouseX >= cancelX && mouseX <= cancelX + btnW && mouseY >= btnY && mouseY <= btnY + btnH;

    if (isOnCancel) {
      closeEmailLoginModal();
      isPressingWallet = false;
      return;
    }
    if (isOnSend) {
      const inp = document.getElementById('emailLoginInput') as HTMLInputElement | null;
      const email = (inp?.value || '').trim();
      if (!email) {
        emailLoginStatus = 'Enter email';
        isPressingWallet = false;
        return;
      }
      authConnecting = true;
      emailLoginStatus = 'Sending...';
      supabaseService.signInWithEmailMagicLink(email, `${window.location.origin}/`)
        .then((res) => {
          authConnecting = false;
          if (res.success) {
            emailLoginStatus = 'Check email link';
            walletError = 'Check your email for the login link';
            closeEmailLoginModal();
          } else {
            emailLoginStatus = res.error || 'Email login failed';
            walletError = emailLoginStatus;
          }
        })
        .catch((err: any) => {
          authConnecting = false;
          emailLoginStatus = err?.message || 'Email login failed';
          walletError = emailLoginStatus;
        });
      isPressingWallet = false;
      return;
    }
  }
  
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
        // If email auth is active, wallet button acts as logout.
        if (authUserId) {
          authConnecting = true;
          supabaseService.signOutAuth().finally(() => {
            authConnecting = false;
            authUserId = null;
            authEmail = null;
            try { localStorage.removeItem('ronin_address'); } catch {}
          });
        walletError = null;
                  } else {
          // Open picker modal (wallets + email)
          const available = walletService.getAvailableWallets();
          const canEmail = supabaseService.isConfigured();
          if (!available.ronin && !available.metamask && !canEmail) {
            walletError = 'Install Ronin/MetaMask or configure email login';
          } else {
            walletProviderModalOpen = true;
            walletError = null;
          }
        }
      }
    }
    isPressingWallet = false;
  }
  
  // Handle profile button click (only if wallet is connected)
  if (isPressingProfile) {
    // Check if wallet is connected - only allow profile if connected
    const isWalletConnected = isPersistenceConnected();
    
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
            // Also save to Supabase if persistence identity is connected
            const pid = getRoninAddressForPersistence();
            if (pid) {
              supabaseService.updateNickname(pid, newNickname).catch((error) => {
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
      if (gameMode === 'PvP') {
        // Leaving PvP (realtime)
        TURN_BASED_PVP_ENABLED = false;
        pvpOnlineRoomName = 'pvp_room';
        leaveLobby().catch((error) => {
          console.error('Failed to leave lobby:', error);
        });
        gameMode = 'Solo';
        cleanupPvP();
        console.log('Left PvP Online, switched to Solo mode');
      } else {
        // Start realtime PvP (guests allowed)
        TURN_BASED_PVP_ENABLED = false;
        pvpOnlineRoomName = 'pvp_room';
        openServerBrowser();
      }
    }
    isPressingPvPOnline = false;
  }
  
  // 5SEC PvP button press state and handle click
  if (isPressingNewButton) {
    const pos = getCanvasMousePos(e);
    const mouseX = pos.x;
    const mouseY = pos.y;

    let trainingButtonY = 500;
    try {
      const walletStateForClick = walletService.getState();
      if (walletStateForClick.isConnected && walletStateForClick.address) {
        trainingButtonY = 450 + 40 + 60;
      }
    } catch {}
    const pvpOnlineButtonY = trainingButtonY + 50;
    const newButtonY = pvpOnlineButtonY + 50;
    const isOverNewButton = mouseX >= 20 && mouseX <= 220 && mouseY >= newButtonY && mouseY <= newButtonY + 40;

    if (isOverNewButton) {
      if (gameMode === 'PvP') {
        // Leaving PvP (5sec/turn-based)
        TURN_BASED_PVP_ENABLED = false;
        pvpOnlineRoomName = 'pvp_room';
        leaveLobby().catch((error) => {
          console.error('Failed to leave lobby:', error);
        });
        gameMode = 'Solo';
        cleanupPvP();
        console.log('Left 5SEC PvP, switched to Solo mode');
      } else {
        const walletState = walletService.getState();
        if (!walletState.isConnected || !walletState.address) {
          walletError = 'Connect Wallet to play 5SEC PvP';
          console.log('Cannot open 5SEC PvP server list: Wallet not connected');
        } else {
          // Start 5SEC PvP (LIVE) - replay/turn loop removed; this is realtime gameplay in a separate matchmaking pool.
          TURN_BASED_PVP_ENABLED = false;
          pvpOnlineRoomName = 'pvp_5sec_room';
          // Local dev: allow direct localhost connect
          const isLocalHost =
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';
          if (isLocalHost) {
            startPvPMatchOnServer('ws://localhost:2567');
          } else {
            openServerBrowser();
          }
        }
      }
    }
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
  // Turn-based PvP: ignore realtime gameplay hotkeys during execute replay.
  if (isTurnBasedPvPDesired()) {
    return;
  }

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
  
  // PvP/Training mode: Toggle heavy projectile aiming (key "2")
  if (e.key === '2' && (gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
    const myPlayer = pvpPlayers[myPlayerId];
    if (myPlayer.isOut || myPlayer.hp <= 0 || deathAnimations.has(myPlayerId)) {
      return;
    }
    if (myPlayer.paralyzedUntil > Date.now()) {
      return;
    }
    if (projectileFlying) {
      console.log('Projectile already in flight');
      return;
    }
    const now = Date.now();
    const timeSinceLastProjectileShot = now - projectileLastShotTime;
    if (timeSinceLastProjectileShot < projectileCooldown) {
      const remaining = Math.ceil((projectileCooldown - timeSinceLastProjectileShot) / 1000);
      console.log(`Projectile on cooldown: ${remaining}s remaining`);
      projectileAiming = false;
      return;
    }
    projectileAiming = !projectileAiming;
    if (projectileAiming) {
      console.log('Heavy shot armed - left click to fire!');
    } else {
      console.log('Heavy shot cancelled');
    }
  }
  
  // PvP/Training mode: Dash / Blink (Space) - instant burst movement towards cursor.
  if (e.key === ' ' && (gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
    const myPlayer = pvpPlayers[myPlayerId];
    
    // 5SEC PvP: during EXECUTE replay, inputs must be frozen (dash would desync replay).
    if (isTurnBasedPvPDesired()) {
      return;
    }

    // Ensure we never leave jetpack sound running (Space no longer toggles jetpack in PvP)
    if (myPlayer.isUsingJetpack) {
      myPlayer.isUsingJetpack = false;
      try { audioManager.stopJetpackSound(); } catch {}
    }

    const useColyseus = colyseusService.isConnectedToRoom();
    const useSupabaseFallback = !useColyseus && pvpSyncService.isSyncing();
    const isSyncing = useColyseus || useSupabaseFallback;
    // In PvP we require a match connection to broadcast to opponent.
    if (gameMode === 'PvP' && (!currentMatch || !isSyncing)) return;

    const send =
      (gameMode === 'PvP' && isSyncing)
        ? (useColyseus ? (input: any) => colyseusService.sendInput(input) : (input: any) => pvpSyncService.sendInput(input))
        : (_input: any) => {};

    tryDashPlayer(myPlayerId, myPlayer, globalMouseX, globalMouseY, send);
  }
  
  // PvP/Training mode: Fire bullet (key "3") - Burst fire: 2 shots with 0.2s delay, then cooldown
  if (e.key === '3' && (gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
    const myPlayer = pvpPlayers[myPlayerId];
    const now = Date.now();
    
    // Block input if player is dead
    if (myPlayer.isOut || myPlayer.hp <= 0 || deathAnimations.has(myPlayerId)) {
      return; // Dead - can't fire bullet
    }
    
    // Check if paralyzed
    if (myPlayer.paralyzedUntil > now) {
      return; // Paralyzed - can't fire bullet
    }

    // Global action limit (1 action per second)
    if (!canPerformPvpAction(myPlayerId, now)) {
      applyPvpActionPenalty(myPlayerId, now);
      return;
    }

    // Disable old burst-fire behavior: enforce 1 bullet action per second.
    shotsInBurst = 0;
    
    // Check if we can fire (burst system: 2 shots with 0.2s delay, then cooldown)
    if (shotsInBurst === 0) {
      // First shot in burst - check cooldown from last burst
      const timeSinceLastBurst = now - bulletLastShotTime;
      if (timeSinceLastBurst < bulletCooldown) {
        return; // Still on cooldown from last burst
      }
    } else if (shotsInBurst === 1) {
      // Second shot in burst - check delay between shots (0.2s)
      const timeSinceLastShot = now - lastBurstShotTime;
      if (timeSinceLastShot < bulletBurstDelay) {
        return; // Too soon, wait for 0.2s delay
      }
    } else {
      // Already fired 2 shots, need to wait for cooldown
      return;
    }
    
    // Calculate direction to mouse position
    const dx = globalMouseX - myPlayer.x;
    const dy = globalMouseY - myPlayer.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      // Normalize direction
      const dirX = dx / distance;
      const dirY = dy / distance;
      
      // Create new bullet
      const newBullet: Bullet = {
        x: myPlayer.x,
        y: myPlayer.y,
        vx: dirX * bulletSpeed,
        vy: dirY * bulletSpeed,
        spawnTime: now,
      };
      
      // Add bullet to array
      bullets.push(newBullet);
      // 5SEC PVP shadow recording: record this projectile spawn (hidden until EXECUTE)
      if (is5SecPvPMode() && turnPhase === 'planning') {
        recordTurnSpawn('bullet', newBullet.x, newBullet.y, newBullet.vx, newBullet.vy);
      }
      
      // Update burst tracking
      shotsInBurst = 0;
      lastBurstShotTime = now;
        bulletLastShotTime = now;
      commitPvpAction(myPlayerId, now);
      
      // Play bullet shot sound effect (like gunshot from barrel)
      audioManager.resumeContext().then(() => {
        audioManager.playBulletShot();
      });
      
      // Send to opponent via network sync
      const useColyseus = colyseusService.isConnectedToRoom();
      const isSyncing = useColyseus || pvpSyncService.isSyncing();
      if (currentMatch && isSyncing) {
        const bulletInput = {
          type: 'bullet' as const,
          timestamp: now,
          x: myPlayer.x,
          y: myPlayer.y,
          vx: newBullet.vx,
          vy: newBullet.vy,
        };
        if (useColyseus) {
          colyseusService.sendInput(bulletInput);
        } else {
          pvpSyncService.sendInput(bulletInput);
        }
      }
      
      console.log(`Bullet fired! (${shotsInBurst === 0 ? '2nd' : '1st'} in burst)`, { x: newBullet.x, y: newBullet.y, vx: newBullet.vx, vy: newBullet.vy });
    }
  }
  
  // PvP/Training mode: Place mine/trap (key "4")
  if (e.key === '4' && (gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
    const myPlayer = pvpPlayers[myPlayerId];
    const now = Date.now();
    
    // Block input if player is dead
    if (myPlayer.isOut || myPlayer.hp <= 0 || deathAnimations.has(myPlayerId)) {
      return; // Dead - can't place mine
    }
    
    // Check if paralyzed
    if (myPlayer.paralyzedUntil > now) {
      return; // Paralyzed - can't place mine
    }

    // Global action limit (1 action per second)
    if (!canPerformPvpAction(myPlayerId, now)) {
      applyPvpActionPenalty(myPlayerId, now);
      return;
    }
    
    // Check cooldown
    const timeSinceLastPlace = now - mineLastPlaceTime;
    if (timeSinceLastPlace < mineCooldown) {
      return; // Still on cooldown
    }
    
    // Place mine at player position
    const newMine: Mine = {
      x: myPlayer.x,
      y: myPlayer.y,
      spawnTime: now,
      exploded: false,
    };
    
    mines.push(newMine);
    mineLastPlaceTime = now;
    commitPvpAction(myPlayerId, now);
    
    // Play mine placement sound effect
    audioManager.resumeContext().then(() => {
      audioManager.playMinePlacement();
    });
    
    console.log('Mine placed!', { x: newMine.x, y: newMine.y });
    
    // Send to opponent via network sync
    const useColyseus = colyseusService.isConnectedToRoom();
    const useSupabaseFallback = !useColyseus && pvpSyncService.isSyncing();
    const isSyncing = useColyseus || useSupabaseFallback;
    if (currentMatch && isSyncing) {
      const mineInput = {
        type: 'mine' as const,
        timestamp: now,
        x: myPlayer.x,
        y: myPlayer.y,
      };
      if (useColyseus) {
        colyseusService.sendInput(mineInput);
      } else {
        pvpSyncService.sendInput(mineInput);
      }
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
  // PvP/Training: Space is dash on keydown; nothing to do on keyup.
  // (Keep this block intentionally empty for Space to avoid HMR duplication changes.)
  
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

  // (5SEC PvP micro-turn: no special click UI; replay-only gating happens elsewhere)

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
    
    // Play arrow shot sound effect (like arrow flying through air - fffiiiit)
    audioManager.resumeContext().then(() => {
      audioManager.playArrowShot();
    });
    
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
        const force = isCritHit ? PVP_CLICK_FORCE_CRIT : PVP_CLICK_FORCE;
        dotVx += Math.cos(oppositeAngle) * force;
        dotVy += Math.sin(oppositeAngle) * force;
        
        // Play dot hit sound effect (like hammer hitting a nail)
        audioManager.resumeContext().then(() => {
          audioManager.playDotHit();
        });
        
        // Update last hit time and unlock gravity (but don't activate gravity on self-click)
        lastHitTime = Date.now();
        gravityLocked = false; // enable gravity after the very first successful hit
        // Note: Gravity is NOT activated on self-click - only on damage from opponent
        
        // Check if combo reached 100% from previous platform/line bounces and trigger bonus
        if (comboProgress >= 100 && !comboActive) {
          const bonusDamage = Math.floor(dmg * 4);
          const absorbedB = Math.min(bonusDamage, dotArmor);
          dotArmor -= absorbedB;
          const remainingB = bonusDamage - absorbedB;
          dotHP = Math.max(0, dotHP - remainingB);
          
          // Play damage received sound effect (pain/impact sound when receiving damage)
          audioManager.resumeContext().then(() => {
            audioManager.playDamageReceived(false);
          });
          
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
        
        // Play damage received sound effect (pain/impact sound when receiving damage)
        audioManager.resumeContext().then(() => {
          audioManager.playDamageReceived(isCritHit);
        });
        
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
    if (isTurnBasedPvPDesired()) {
      return;
    }
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
    // Global action limit (1 action per second)
    if (!canPerformPvpAction(myPlayerId, currentTime)) {
      applyPvpActionPenalty(myPlayerId, currentTime);
      return;
    }
    const timeSinceLastShot = currentTime - pvpArrowLastShotTime;
    
    // Check if cooldown has passed
    if (timeSinceLastShot >= pvpArrowCooldown) {
      // Start charge: arrow fires after a short delay (reduces “instant spam” feel, gives more sync time).
      if (!pvpArrowCharging) {
        pvpArrowCharging = true;
        pvpArrowChargeFireAt = currentTime + PVP_ARROW_CHARGE_MS;
        pvpArrowChargeAimX = mouseX;
        pvpArrowChargeAimY = mouseY;
        pvpArrowReady = false; // consume ready state immediately
        // Global 1-action-per-second limit: lock the action at charge start.
        commitPvpAction(myPlayerId, currentTime);
      }
      return;
    } else {
      // Cooldown still active - cancel arrow ready state
      pvpArrowReady = false;
      const remainingTime = Math.ceil((pvpArrowCooldown - timeSinceLastShot) / 1000);
      console.log(`PvP Arrow on cooldown: ${remainingTime}s remaining`);
    }
  }

  // PvP/Training mode: fire heavy projectile when aiming
  if ((gameMode === 'PvP' || gameMode === 'Training') && projectileAiming && mouseX > 240 && myPlayerId && pvpPlayers[myPlayerId] && !projectileFlying && e.button === 0) {
    if (isTurnBasedPvPDesired()) {
      projectileAiming = false;
      return;
    }
    const myPlayer = pvpPlayers[myPlayerId];
    if (myPlayer.isOut || myPlayer.hp <= 0 || deathAnimations.has(myPlayerId)) {
      projectileAiming = false;
      return;
    }
    if (myPlayer.paralyzedUntil > Date.now()) {
      return;
    }
    const now = Date.now();
    // Global action limit (1 action per second)
    if (!canPerformPvpAction(myPlayerId, now)) {
      applyPvpActionPenalty(myPlayerId, now);
      projectileAiming = false;
      return;
    }
    const timeSinceLastShot = now - projectileLastShotTime;
    if (timeSinceLastShot < projectileCooldown) {
      projectileAiming = false;
      const remaining = Math.ceil((projectileCooldown - timeSinceLastShot) / 1000);
      console.log(`Projectile on cooldown: ${remaining}s remaining`);
      return;
    }

    const dx = mouseX - myPlayer.x;
    const dy = mouseY - myPlayer.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= 0) {
      return;
    }

    const dirX = dx / distance;
    const dirY = dy / distance;
    const spawnOffset = 18;

    projectileFlying = true;
    projectileAiming = false;
    projectileLastShotTime = now;
    projectileSpawnTime = now;
    projectileLastUpdateAt = now;
    projectileBounceCount = 0;
    projectileX = myPlayer.x + dirX * spawnOffset;
    projectileY = myPlayer.y + dirY * spawnOffset;
    projectileVx = dirX * projectileLaunchSpeed;
    projectileVy = dirY * projectileLaunchSpeed;

    // 5SEC PVP shadow recording: record heavy projectile spawn at launch
    if (is5SecPvPMode() && turnPhase === 'planning') {
      recordTurnSpawn('projectile', projectileX, projectileY, projectileVx, projectileVy);
    }

    // Heavy shell no longer pushes the player back (removed recoil)

    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI * 2 * i) / 8 + Math.atan2(dirY, dirX) + Math.PI;
      const particleSpeed = 2 + Math.random() * 3;
      safePushClickParticle({
        x: myPlayer.x,
        y: myPlayer.y,
        vx: Math.cos(angle) * particleSpeed,
        vy: Math.sin(angle) * particleSpeed,
        life: 28,
        maxLife: 28,
        size: 3 + Math.random() * 2
      });
    }
    screenShake = Math.max(screenShake, 8);

    createProjectileExplosion(projectileX, projectileY);
    audioManager.playProjectileLaunch();
    commitPvpAction(myPlayerId, now);

    const useColyseusProjectile = colyseusService.isConnectedToRoom();
    const isSyncingProjectile = useColyseusProjectile || pvpSyncService.isSyncing();
    if (currentMatch && isSyncingProjectile) {
      const projectileInput = {
        type: 'projectile' as const,
        timestamp: now,
        x: projectileX,
        y: projectileY,
        vx: projectileVx,
        vy: projectileVy,
        targetX: mouseX,
        targetY: mouseY,
      };
      if (useColyseusProjectile) {
        colyseusService.sendInput(projectileInput);
      } else {
        pvpSyncService.sendInput(projectileInput);
      }
    }

    return;
  }

  // PvP/Training mode: Click handler (same as Solo DOT click system with accuracy/miss)
  if ((gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
    const pos = getCanvasMousePos(e);
    const mouseX = pos.x;
    const mouseY = pos.y;
    
    // Only process clicks in play area
    if (mouseX > 240 && e.button === 0) {
      if (isTurnBasedPvPDesired()) {
        return;
      }
      const myPlayer = pvpPlayers[myPlayerId];
      
      // Check if paralyzed
      if (myPlayer.paralyzedUntil > Date.now()) {
        return; // Paralyzed - can't click
      }

      // Global action limit (1 action per second) for click-hit (prevents spam knockback).
      const now = Date.now();
      if (!canPerformPvpAction(myPlayerId, now)) {
        applyPvpActionPenalty(myPlayerId, now);
        return;
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
        // Self-click counts as an action (even if MISS) to keep a clear "1 action / 1 sec" rule.
        commitPvpAction(myPlayerId, now);

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
          const force = isCritHit ? PVP_CLICK_FORCE_CRIT : PVP_CLICK_FORCE;
          
          // Apply force to player velocity (same as Solo DOT)
          myPlayer.vx += Math.cos(oppositeAngle) * force;
          myPlayer.vy += Math.sin(oppositeAngle) * force;
          
          // Play dot hit sound effect (like hammer hitting a nail)
          audioManager.resumeContext().then(() => {
            audioManager.playDotHit();
          });
          
          // Update last hit time and unlock gravity (but don't activate gravity on self-click)
          myPlayer.lastHitTime = Date.now();
          myPlayer.gravityLocked = false; // Enable gravity after first hit
          // Note: Gravity is NOT activated on self-click - only on damage from opponent
          
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
  const isWalletConnectedForUpgrade = isPersistenceConnected();
  
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

function drawServerBrowserOverlay() {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const modalWidth = Math.min(900, canvas.width - 80);
  const modalHeight = Math.min(520, canvas.height - 80);
  const modalX = (canvas.width - modalWidth) / 2;
  const modalY = (canvas.height - modalHeight) / 2;

  serverBrowserModalRegion = { x: modalX, y: modalY, width: modalWidth, height: modalHeight };
  serverBrowserHitRegions = [];

  ctx.fillStyle = '#f3f3f3';
  ctx.fillRect(modalX, modalY, modalWidth, modalHeight);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(modalX, modalY, modalWidth, modalHeight);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 18px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.fillText('SELECT PvP SERVER', modalX + 30, modalY + 45);


  if (serverStatusLoading) {
    ctx.fillStyle = '#666666';
    ctx.fillText('Refreshing status...', modalX + 30, modalY + 95);
  } else if (serverBrowserError) {
    ctx.fillStyle = '#ff2222';
    ctx.fillText(serverBrowserError, modalX + 30, modalY + 95);
  }

  // Close button
  serverBrowserCloseRegion = { x: modalX + modalWidth - 50, y: modalY + 20, width: 30, height: 30 };
  ctx.fillStyle = serverBrowserHoverClose ? '#ff6666' : '#ff9999';
  ctx.fillRect(serverBrowserCloseRegion.x, serverBrowserCloseRegion.y, serverBrowserCloseRegion.width, serverBrowserCloseRegion.height);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(serverBrowserCloseRegion.x, serverBrowserCloseRegion.y, serverBrowserCloseRegion.width, serverBrowserCloseRegion.height);
  ctx.beginPath();
  ctx.moveTo(serverBrowserCloseRegion.x + 6, serverBrowserCloseRegion.y + 6);
  ctx.lineTo(serverBrowserCloseRegion.x + serverBrowserCloseRegion.width - 6, serverBrowserCloseRegion.y + serverBrowserCloseRegion.height - 6);
  ctx.moveTo(serverBrowserCloseRegion.x + serverBrowserCloseRegion.width - 6, serverBrowserCloseRegion.y + 6);
  ctx.lineTo(serverBrowserCloseRegion.x + 6, serverBrowserCloseRegion.y + serverBrowserCloseRegion.height - 6);
  ctx.stroke();

  const listStartY = modalY + 120;
  const rowHeight = 90;
  const rowGap = 12;
  const rowWidth = modalWidth - 60;

  if (serverStatuses.length === 0) {
    ctx.fillStyle = '#000000';
    ctx.font = '12px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('No servers configured', modalX + modalWidth / 2, listStartY + 40);
  } else {
    ctx.textAlign = 'left';
    serverStatuses.forEach((server, index) => {
      const rowY = listStartY + index * (rowHeight + rowGap);
      if (rowY + rowHeight > modalY + modalHeight - 30) {
        return;
      }

      const isSelected = server.id === selectedServerId;
      const isHovered = serverBrowserHoverId === server.id;

      ctx.fillStyle = isHovered ? '#e7f7ff' : isSelected ? '#d6f1ff' : '#ffffff';
      ctx.fillRect(modalX + 30, rowY, rowWidth, rowHeight);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(modalX + 30, rowY, rowWidth, rowHeight);

      serverBrowserHitRegions.push({
        id: server.id,
        x: modalX + 30,
        y: rowY,
        width: rowWidth,
        height: rowHeight
      });

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px "Press Start 2P"';
      ctx.textAlign = 'left';
      ctx.fillText(server.name, modalX + 50, rowY + 26);

      const joinWidth = 150;
      const joinHeight = 32;
      const joinX = modalX + 30 + rowWidth - joinWidth - 30;
      const joinY = rowY + rowHeight - joinHeight - 32;
      const statusAreaRight = joinX - 40;

      const statusColor = getServerStatusColor(server);
      ctx.textAlign = 'right';
      ctx.fillStyle = statusColor;
      ctx.font = 'bold 10px "Press Start 2P"';
      ctx.fillText(`${server.status.toUpperCase()} • ${getServerPingText(server)}`, statusAreaRight, rowY + 26);

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 8px "Press Start 2P"';
      const queueText = typeof server.waitingPlayers === 'number'
        ? `${server.waitingPlayers} player${server.waitingPlayers === 1 ? '' : 's'} waiting`
        : 'Queue: n/a';
      ctx.fillText(queueText, statusAreaRight, rowY + 46);

      if (typeof server.activeRooms === 'number' || typeof server.totalPlayers === 'number') {
        const roomsText = typeof server.activeRooms === 'number'
          ? `Matches: ${server.activeRooms}`
          : '';
        const playersText = typeof server.totalPlayers === 'number'
          ? `Players: ${server.totalPlayers}`
          : '';
        ctx.fillText(`${roomsText}${roomsText && playersText ? ' • ' : ''}${playersText}`, statusAreaRight, rowY + 62);
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = isHovered ? '#9cf19c' : '#c8f7c5';
      ctx.fillRect(joinX, joinY, joinWidth, joinHeight);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(joinX, joinY, joinWidth, joinHeight);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 10px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText(isHovered ? 'CLICK TO JOIN' : 'JOIN', joinX + joinWidth / 2, joinY + joinHeight / 2 + 4);
      ctx.textAlign = 'left';

      // removed "CURRENT" label to avoid clutter
    });
  }

  ctx.fillStyle = '#333333';
  ctx.font = '8px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillText('Tip: pick the server with the lowest ping (ms) for smoother matches', modalX + modalWidth / 2, modalY + modalHeight - 20);

  ctx.restore();
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
  const frameStartTime = performance.now();
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
  currentFrame++;
  
  // Clean up cached player speeds periodically (every 1000 frames to reduce overhead)
  if (currentFrame % 1000 === 0) {
    cleanupCachedPlayerSpeeds();
  }
  
  // Check wallet balance periodically (non-blocking)
  checkWalletBalance();

  // Turn-based PvP update (freeze planning / deterministic execute playback)
  updateTurnBasedPvP(Date.now());
  // 5SEC PVP: during planning we allow realtime control, but record shadow actions for commit.
  recordTurnTrackAndMaybeSend();
  
  // PvP/Training mode: Reset burst counter if too much time passed since last shot
  if (!isTurnBasedPvPDesired() && (gameMode === 'PvP' || gameMode === 'Training') && shotsInBurst > 0) {
    const now = Date.now();
    const timeSinceLastShot = now - lastBurstShotTime;
    // If more than cooldown time passed, reset burst counter (allows new burst)
    if (timeSinceLastShot > bulletCooldown) {
      shotsInBurst = 0;
    }
  }
  
  // PvP/Training mode: Update bullet physics and collision
  if (!isTurnBasedPvPDesired() && (gameMode === 'PvP' || gameMode === 'Training') && bullets.length > 0) {
    const now = Date.now();
    // Players can stand on the "bottom floor" (below pvpBounds.bottom). Don't cull bullets until that floor.
    const pvpBulletBottomY = PVP_BOTTOM_FLOOR_Y;
    const bulletsToRemove: number[] = []; // Indices of bullets to remove
    
    // Process each bullet
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      
      // Update bullet position
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;

      // Bounce off center stone obstacle (solid)
      if (PVP_CENTER_OBSTACLE_ENABLED) {
        const hit = collideCircleWithStone(bullet.x, bullet.y, bulletRadius);
        if (hit) {
          bullet.x += hit.nx * (hit.depth + 0.5);
          bullet.y += hit.ny * (hit.depth + 0.5);
          const vn = bullet.vx * hit.nx + bullet.vy * hit.ny;
          if (vn < 0) {
            bullet.vx = (bullet.vx - 2 * vn * hit.nx) * 0.78;
            bullet.vy = (bullet.vy - 2 * vn * hit.ny) * 0.78;
          }
        }
      }
      
      // Check lifetime
      const bulletAge = now - bullet.spawnTime;
      if (bulletAge > bulletLifetime) {
        bulletsToRemove.push(i);
        continue;
      }
      
      // Check collision with opponent
      // Make sure we're hitting the opponent, not ourselves
      if (!opponentId || !pvpPlayers[opponentId] || opponentId === myPlayerId) {
        // Skip if no opponent or opponent is ourselves
      } else {
        const opponent = pvpPlayers[opponentId];
        const dx = bullet.x - opponent.x;
        const dy = bullet.y - opponent.y;
        const distanceSquared = dx * dx + dy * dy;
        const collisionRadius = bulletRadius + opponent.radius;
        const collisionRadiusSquared = collisionRadius * collisionRadius;
        
        if (distanceSquared <= collisionRadiusSquared) {
          // Double check - make sure opponent is not ourselves
          if (opponent.id === myPlayerId) {
            console.error('ERROR: Trying to damage ourselves with bullet!', { opponentId, myPlayerId, opponent: opponent.id });
            bulletsToRemove.push(i);
            continue;
          }
          
          // Hit opponent! Remove bullet
          bulletsToRemove.push(i);
          
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
              timestamp: now,
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
          
          // Play damage dealt sound effect (satisfying hit sound when dealing damage)
          audioManager.resumeContext().then(() => {
            audioManager.playDamageDealt(isCritHit);
          });
        
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
          continue; // Skip bounds check since we're removing this bullet
        }
      }
      
      // Check if bullet is out of bounds
      if (bullet.x < pvpBounds.left || bullet.x > pvpBounds.right || bullet.y < pvpBounds.top || bullet.y > pvpBulletBottomY) {
        bulletsToRemove.push(i);
      }
    }
    
    // Remove bullets that hit or expired (remove from end to preserve indices)
    bulletsToRemove.sort((a, b) => b - a); // Sort descending
    for (const index of bulletsToRemove) {
      bullets.splice(index, 1);
    }
  }
  
  // PvP mode: Update opponent bullet physics and collision
  if (gameMode === 'PvP' && opponentBulletFlying && myPlayerId && pvpPlayers[myPlayerId]) {
    // Players can stand on the "bottom floor" (below pvpBounds.bottom). Don't cull bullets until that floor.
    const pvpBulletBottomY = PVP_BOTTOM_FLOOR_Y;
    // Update opponent bullet position
    opponentBulletX += opponentBulletVx;
    opponentBulletY += opponentBulletVy;

    // Bounce off center stone obstacle (visual + avoids "going through rock")
    if (PVP_CENTER_OBSTACLE_ENABLED) {
      const hit = collideCircleWithStone(opponentBulletX, opponentBulletY, bulletRadius);
      if (hit) {
        opponentBulletX += hit.nx * (hit.depth + 0.5);
        opponentBulletY += hit.ny * (hit.depth + 0.5);
        const vn = opponentBulletVx * hit.nx + opponentBulletVy * hit.ny;
        if (vn < 0) {
          opponentBulletVx = (opponentBulletVx - 2 * vn * hit.nx) * 0.78;
          opponentBulletVy = (opponentBulletVy - 2 * vn * hit.ny) * 0.78;
        }
      }
    }
    
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
    if (opponentBulletX < pvpBounds.left || opponentBulletX > pvpBounds.right || opponentBulletY < pvpBounds.top || opponentBulletY > pvpBulletBottomY) {
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
  
  // PvP/Training mode: Update mines and spikes
  if ((gameMode === 'PvP' || gameMode === 'Training')) {
    const now = Date.now();
    const minesToRemove: number[] = [];
    const spikesToRemove: number[] = [];
    
    // Process mines
    for (let i = mines.length - 1; i >= 0; i--) {
      const mine = mines[i];
      
      if (mine.exploded) {
        minesToRemove.push(i);
        continue;
      }
      
      const mineAge = now - mine.spawnTime;
      
      // Check if mine lifetime expired (auto-explode after 10 seconds)
      if (mineAge >= mineLifetime) {
        // Play explosion sound effect
        audioManager.resumeContext().then(() => {
          audioManager.playMineExplosion();
        });
        
        // Explode mine - spawn 8 spikes in 8 directions (4 cardinal + 4 diagonal)
        const directions = [
          { x: 1, y: 0 },      // Right
          { x: 0.707, y: 0.707 },  // Down-Right (diagonal)
          { x: 0, y: 1 },      // Down
          { x: -0.707, y: 0.707 }, // Down-Left (diagonal)
          { x: -1, y: 0 },     // Left
          { x: -0.707, y: -0.707 }, // Up-Left (diagonal)
          { x: 0, y: -1 },     // Up
          { x: 0.707, y: -0.707 },  // Up-Right (diagonal)
        ];
        
        for (const dir of directions) {
          const spike: Spike = {
            x: mine.x,
            y: mine.y,
            vx: dir.x * spikeSpeed,
            vy: dir.y * spikeSpeed,
            spawnTime: now,
          };
          spikes.push(spike);
        }
        
        mine.exploded = true;
        minesToRemove.push(i);
        console.log('Mine auto-exploded!', { x: mine.x, y: mine.y });
        continue;
      }
      
      // Check collision with opponent (stepping on mine)
      if (!opponentId || !pvpPlayers[opponentId] || opponentId === myPlayerId) {
        // Skip if no opponent
      } else {
        const opponent = pvpPlayers[opponentId];
        const dx = mine.x - opponent.x;
        const dy = mine.y - opponent.y;
        const distanceSquared = dx * dx + dy * dy;
        const collisionRadius = mineRadius + opponent.radius;
        const collisionRadiusSquared = collisionRadius * collisionRadius;
        
        if (distanceSquared <= collisionRadiusSquared) {
          // Opponent stepped on mine - explode and deal 2x damage
          if (!myPlayerId || !pvpPlayers[myPlayerId]) {
            // Skip if no my player
            continue;
          }
          const myPlayer = pvpPlayers[myPlayerId];
          const nftBonuses = calculateNftBonuses();
          const totalDmg = dmg + nftBonuses.dmg;
          const mineDamage = totalDmg * mineDamageMultiplier; // 2x damage
          const mineDamageWithVariance = applyDamageVariance(mineDamage);
          
          // Profile: Track damage dealt (PvP mode - Mine)
          profileManager.addDamageDealt(mineDamageWithVariance);
          
          // Send hit event to opponent
          const useColyseus = colyseusService.isConnectedToRoom();
          const isSyncing = useColyseus || pvpSyncService.isSyncing();
          if (currentMatch && isSyncing && opponentId) {
            const hitInput = {
              type: 'hit' as const,
              timestamp: now,
              damage: mineDamageWithVariance,
              isCrit: false,
              targetPlayerId: opponentId,
              isMine: true, // Indicate this is a mine hit
            };
            
            if (useColyseus) {
              colyseusService.sendInput(hitInput);
            } else {
              pvpSyncService.sendInput(hitInput);
            }
          }
          
          // Show damage number
          safePushDamageNumber({
            x: opponent.x + (Math.random() - 0.5) * 40,
            y: opponent.y - 20,
            value: mineDamageWithVariance,
            life: 60,
            maxLife: 60,
            vx: (Math.random() - 0.5) * 2,
            vy: -2 - Math.random() * 2,
            isCrit: false
          });
          
          // Play explosion sound effect
          audioManager.resumeContext().then(() => {
            audioManager.playMineExplosion();
          });
          
          // Explode mine - spawn 8 spikes in 8 directions (4 cardinal + 4 diagonal)
          const directions = [
            { x: 1, y: 0 },      // Right
            { x: 0.707, y: 0.707 },  // Down-Right (diagonal)
            { x: 0, y: 1 },      // Down
            { x: -0.707, y: 0.707 }, // Down-Left (diagonal)
            { x: -1, y: 0 },     // Left
            { x: -0.707, y: -0.707 }, // Up-Left (diagonal)
            { x: 0, y: -1 },     // Up
            { x: 0.707, y: -0.707 },  // Up-Right (diagonal)
          ];
          
          for (const dir of directions) {
            const spike: Spike = {
              x: mine.x,
              y: mine.y,
              vx: dir.x * spikeSpeed,
              vy: dir.y * spikeSpeed,
              spawnTime: now,
            };
            spikes.push(spike);
          }
          
          mine.exploded = true;
          minesToRemove.push(i);
          console.log('Mine exploded on contact!', { x: mine.x, y: mine.y, damage: mineDamageWithVariance });
        }
      }
    }
    
    // Remove exploded mines
    minesToRemove.sort((a, b) => b - a);
    for (const index of minesToRemove) {
      mines.splice(index, 1);
    }
    
    // Process spikes
    for (let i = spikes.length - 1; i >= 0; i--) {
      const spike = spikes[i];
      
      // Update spike position
      spike.x += spike.vx;
      spike.y += spike.vy;
      
      // Check lifetime
      const spikeAge = now - spike.spawnTime;
      if (spikeAge > spikeLifetime) {
        spikesToRemove.push(i);
        continue;
      }
      
      // Check collision with opponent
      if (!opponentId || !pvpPlayers[opponentId] || opponentId === myPlayerId) {
        // Skip if no opponent
      } else {
        const opponent = pvpPlayers[opponentId];
        const dx = spike.x - opponent.x;
        const dy = spike.y - opponent.y;
        const distanceSquared = dx * dx + dy * dy;
        const collisionRadius = spikeRadius + opponent.radius;
        const collisionRadiusSquared = collisionRadius * collisionRadius;
        
        if (distanceSquared <= collisionRadiusSquared) {
          // Spike hit opponent - deal 50% basic damage
          if (!myPlayerId || !pvpPlayers[myPlayerId]) {
            // Skip if no my player
            continue;
          }
          const myPlayer = pvpPlayers[myPlayerId];
          const nftBonuses = calculateNftBonuses();
          const totalDmg = dmg + nftBonuses.dmg;
          const spikeDamage = totalDmg * spikeDamageMultiplier; // 50% damage
          const spikeDamageWithVariance = applyDamageVariance(spikeDamage);
          
          // Profile: Track damage dealt (PvP mode - Spike)
          profileManager.addDamageDealt(spikeDamageWithVariance);
          
          // Send hit event to opponent
          const useColyseus = colyseusService.isConnectedToRoom();
          const isSyncing = useColyseus || pvpSyncService.isSyncing();
          if (currentMatch && isSyncing && opponentId) {
            const hitInput = {
              type: 'hit' as const,
              timestamp: now,
              damage: spikeDamageWithVariance,
              isCrit: false,
              targetPlayerId: opponentId,
              isSpike: true, // Indicate this is a spike hit
            };
            
            if (useColyseus) {
              colyseusService.sendInput(hitInput);
            } else {
              pvpSyncService.sendInput(hitInput);
            }
          }
          
          // Show damage number
          safePushDamageNumber({
            x: opponent.x + (Math.random() - 0.5) * 40,
            y: opponent.y - 20,
            value: spikeDamageWithVariance,
            life: 60,
            maxLife: 60,
            vx: (Math.random() - 0.5) * 2,
            vy: -2 - Math.random() * 2,
            isCrit: false
          });
          
          spikesToRemove.push(i);
          console.log('Spike hit opponent!', { x: spike.x, y: spike.y, damage: spikeDamageWithVariance });
          continue;
        }
      }
      
      // Check if spike is out of bounds
      if (spike.x < pvpBounds.left || spike.x > pvpBounds.right || spike.y < pvpBounds.top || spike.y > pvpBounds.bottom) {
        spikesToRemove.push(i);
      }
    }
    
    // Remove expired or hit spikes
    spikesToRemove.sort((a, b) => b - a);
    for (const index of spikesToRemove) {
      spikes.splice(index, 1);
    }
    
    // Process opponent mines
    const opponentMinesToRemove: number[] = [];
    const opponentSpikesToRemove: number[] = [];
    
    // Process opponent mines
    for (let i = opponentMines.length - 1; i >= 0; i--) {
      const mine = opponentMines[i];
      
      if (mine.exploded) {
        opponentMinesToRemove.push(i);
        continue;
      }
      
      const mineAge = now - mine.spawnTime;
      
      // Check if mine lifetime expired (auto-explode after 10 seconds)
      if (mineAge >= mineLifetime) {
        // Explode opponent mine - spawn 8 spikes in 8 directions
        const directions = [
          { x: 1, y: 0 },      // Right
          { x: 0.707, y: 0.707 },  // Down-Right (diagonal)
          { x: 0, y: 1 },      // Down
          { x: -0.707, y: 0.707 }, // Down-Left (diagonal)
          { x: -1, y: 0 },     // Left
          { x: -0.707, y: -0.707 }, // Up-Left (diagonal)
          { x: 0, y: -1 },     // Up
          { x: 0.707, y: -0.707 },  // Up-Right (diagonal)
        ];
        
        for (const dir of directions) {
          const spike: Spike = {
            x: mine.x,
            y: mine.y,
            vx: dir.x * spikeSpeed,
            vy: dir.y * spikeSpeed,
            spawnTime: now,
          };
          opponentSpikes.push(spike);
        }
        
        // Play explosion sound effect
        audioManager.resumeContext().then(() => {
          audioManager.playMineExplosion();
        });
        
        mine.exploded = true;
        opponentMinesToRemove.push(i);
        console.log('Opponent mine auto-exploded!', { x: mine.x, y: mine.y });
        continue;
      }
      
      // Check collision with my player (stepping on opponent mine)
      if (!myPlayerId || !pvpPlayers[myPlayerId]) {
        // Skip if no my player
      } else {
        const myPlayer = pvpPlayers[myPlayerId];
        const dx = mine.x - myPlayer.x;
        const dy = mine.y - myPlayer.y;
        const distanceSquared = dx * dx + dy * dy;
        const collisionRadius = mineRadius + myPlayer.radius;
        const collisionRadiusSquared = collisionRadius * collisionRadius;
        
        if (distanceSquared <= collisionRadiusSquared) {
          // My player stepped on opponent mine - explode and deal 2x damage
          // Damage is handled by opponent via network sync (they send hit event)
          // We just explode the mine locally
          
          // Explode opponent mine - spawn 8 spikes in 8 directions
          const directions = [
            { x: 1, y: 0 },      // Right
            { x: 0.707, y: 0.707 },  // Down-Right (diagonal)
            { x: 0, y: 1 },      // Down
            { x: -0.707, y: 0.707 }, // Down-Left (diagonal)
            { x: -1, y: 0 },     // Left
            { x: -0.707, y: -0.707 }, // Up-Left (diagonal)
            { x: 0, y: -1 },     // Up
            { x: 0.707, y: -0.707 },  // Up-Right (diagonal)
          ];
          
          for (const dir of directions) {
            const spike: Spike = {
              x: mine.x,
              y: mine.y,
              vx: dir.x * spikeSpeed,
              vy: dir.y * spikeSpeed,
              spawnTime: now,
            };
            opponentSpikes.push(spike);
          }
          
          // Play explosion sound effect
          audioManager.resumeContext().then(() => {
            audioManager.playMineExplosion();
          });
          
          mine.exploded = true;
          opponentMinesToRemove.push(i);
          console.log('Opponent mine exploded on contact!', { x: mine.x, y: mine.y });
        }
      }
    }
    
    // Remove exploded opponent mines
    opponentMinesToRemove.sort((a, b) => b - a);
    for (const index of opponentMinesToRemove) {
      opponentMines.splice(index, 1);
    }
    
    // Process opponent spikes
    for (let i = opponentSpikes.length - 1; i >= 0; i--) {
      const spike = opponentSpikes[i];
      
      // Update spike position
      spike.x += spike.vx;
      spike.y += spike.vy;
      
      // Check lifetime
      const spikeAge = now - spike.spawnTime;
      if (spikeAge > spikeLifetime) {
        opponentSpikesToRemove.push(i);
        continue;
      }
      
      // Check collision with my player
      if (!myPlayerId || !pvpPlayers[myPlayerId]) {
        // Skip if no my player
      } else {
        const myPlayer = pvpPlayers[myPlayerId];
        const dx = spike.x - myPlayer.x;
        const dy = spike.y - myPlayer.y;
        const distanceSquared = dx * dx + dy * dy;
        const collisionRadius = spikeRadius + myPlayer.radius;
        const collisionRadiusSquared = collisionRadius * collisionRadius;
        
        if (distanceSquared <= collisionRadiusSquared) {
          // Opponent spike hit my player - damage is handled by opponent via network sync
          opponentSpikesToRemove.push(i);
          console.log('Opponent spike hit me!', { x: spike.x, y: spike.y });
          continue;
        }
      }
      
      // Check if spike is out of bounds
      if (spike.x < pvpBounds.left || spike.x > pvpBounds.right || spike.y < pvpBounds.top || spike.y > pvpBounds.bottom) {
        opponentSpikesToRemove.push(i);
      }
    }
    
    // Remove expired or hit opponent spikes
    opponentSpikesToRemove.sort((a, b) => b - a);
    for (const index of opponentSpikesToRemove) {
      opponentSpikes.splice(index, 1);
    }
    
    if (HEALTH_PACKS_ENABLED) {
      // Health pack spawn system - only one at a time, spawns 25 seconds after pickup or game start
      // Spawn new health pack if none exists and enough time has passed
      const timeSinceLastPickup = lastHealthPackPickupTime === 0 
        ? (pvpGameStartTime === 0 ? now : now - pvpGameStartTime) 
        : now - lastHealthPackPickupTime;
      if (!healthPack && timeSinceLastPickup >= healthPackSpawnDelay) {
        // Get fixed position based on cycle (center -> left -> right -> center -> ...)
        const position = healthPackPositions[healthPackPositionIndex];
        
        healthPack = {
          x: position.x,
          y: position.y,
          spawnTime: now,
          id: `hp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          positionIndex: healthPackPositionIndex,
        };
        
        // Move to next position in cycle
        healthPackPositionIndex = (healthPackPositionIndex + 1) % healthPackPositions.length;
        
        // Play spawn sound effect
        audioManager.resumeContext().then(() => {
          audioManager.playHealthPackSpawn();
        });
        
        // Send to opponent via network sync (only position index, not coordinates)
        const useColyseus = colyseusService.isConnectedToRoom();
        const isSyncing = useColyseus || pvpSyncService.isSyncing();
        if (currentMatch && isSyncing) {
          const healthPackInput = {
            type: 'healthpack' as const,
            timestamp: now,
            positionIndex: healthPack.positionIndex, // The position index we just used
            id: healthPack.id,
          };
          if (useColyseus) {
            colyseusService.sendInput(healthPackInput);
          } else {
            pvpSyncService.sendInput(healthPackInput);
          }
        }
        
        console.log('Health pack spawned!', { x: position.x, y: position.y, positionIndex: healthPack.positionIndex, id: healthPack.id });
      }
      
      // Process health pack - check collision with players (only one at a time)
      if (healthPack) {
        // Check collision with my player
        if (myPlayerId && pvpPlayers[myPlayerId]) {
          const myPlayer = pvpPlayers[myPlayerId];
          const dx = healthPack.x - myPlayer.x;
          const dy = healthPack.y - myPlayer.y;
          const distanceSquared = dx * dx + dy * dy;
          const collisionRadius = healthPackRadius + myPlayer.radius;
          const collisionRadiusSquared = collisionRadius * collisionRadius;
          
          if (distanceSquared <= collisionRadiusSquared) {
            // My player picked up health pack - restore ONLY HP, armor is ignored
            const healAmount = Math.floor(Math.random() * (healthPackMaxHeal - healthPackMinHeal + 1)) + healthPackMinHeal; // 10-15 HP
            
            const oldHP = myPlayer.hp;
            
            // Restore HP only (armor is not touched)
            myPlayer.hp = Math.min(myPlayer.maxHP, myPlayer.hp + healAmount);
            
            const actualHealAmount = myPlayer.hp - oldHP;
            
            // Play pickup sound effect
            audioManager.resumeContext().then(() => {
              audioManager.playHealthPackPickup();
            });
            
            // Show healing number animation (only HP amount)
            if (actualHealAmount > 0) {
              safePushDamageNumber({
                x: myPlayer.x + (Math.random() - 0.5) * 20,
                y: myPlayer.y - myPlayer.radius - 20,
                value: `+${actualHealAmount}`,
                life: 60,
                maxLife: 60,
                vx: (Math.random() - 0.5) * 1,
                vy: -2 - Math.random() * 1,
                isCrit: false
              });
            }
            
            // Send stats update
            sendStatsUpdate(myPlayer.hp, myPlayer.armor, myPlayer.maxHP, myPlayer.maxArmor);
            
            // Remove health pack FIRST (before sending network event to prevent double pickup)
            const pickedUpHealthPackId = healthPack.id;
            lastHealthPackPickupTime = now;
            healthPack = null;
            
            // Send pickup event to opponent (with heal amount for display)
            const useColyseus = colyseusService.isConnectedToRoom();
            const isSyncing = useColyseus || pvpSyncService.isSyncing();
            if (currentMatch && isSyncing) {
              const pickupInput = {
                type: 'healthpack_pickup' as const,
                timestamp: now,
                healthPackId: pickedUpHealthPackId,
                playerId: myPlayerId,
                healAmount: actualHealAmount,
              };
              if (useColyseus) {
                colyseusService.sendInput(pickupInput);
              } else {
                pvpSyncService.sendInput(pickupInput);
              }
            }
            
            console.log(`Health pack picked up! +${actualHealAmount} HP (armor ignored)`, { id: pickedUpHealthPackId });
          }
        }
        
        // Note: Opponent pickup is handled via network sync (healthpack_pickup event)
        // We don't check collision with opponent here to avoid conflicts
      }
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
      gravityActiveUntil = 0; // Reset gravity active timer
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
    
    // Apply gravity only if active (after damage) and not in slow-motion freeze
    if (!slowMotionActive) {
      const now = Date.now();
      // Gravity is active only if gravityActiveUntil > now (gravity was triggered by damage)
      if (DAMAGE_GRAVITY_ENABLED && gravityActiveUntil > now) {
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
            
            // Play bounce sound effect (like spring or trampoline)
            audioManager.resumeContext().then(() => {
              audioManager.playBounce();
            });
            
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
            
          // Play damage received sound effect (pain/impact sound when receiving damage)
          audioManager.resumeContext().then(() => {
            audioManager.playDamageReceived(true); // Combo bonus is crit-like
          });
          
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
            
          // Play damage received sound effect (pain/impact sound when receiving damage)
          audioManager.resumeContext().then(() => {
            audioManager.playDamageReceived(true); // Speed bonus is crit-like
          });
          
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
    if (TOXIC_PLATFORMS_ENABLED) {
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
          
          // Play bounce sound effect (like spring or trampoline)
          audioManager.resumeContext().then(() => {
            audioManager.playBounce();
          });
          
          // Update combo progress on platform bounce
          comboProgress = Math.min(100, comboProgress + 10); // Each platform bounce adds 10%
          
          // If combo just reached 100%, immediately deal a one-time 4x bonus damage and reset combo
          if (comboProgress >= 100 && !comboActive) {
            const bonusDamage = Math.floor(dmg * 4);
            const absorbedB = Math.min(bonusDamage, dotArmor);
            dotArmor -= absorbedB;
            const remainingB = bonusDamage - absorbedB;
            dotHP = Math.max(0, dotHP - remainingB);
            
          // Play damage received sound effect (pain/impact sound when receiving damage)
          audioManager.resumeContext().then(() => {
            audioManager.playDamageReceived(true); // Combo bonus is crit-like
          });
          
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
    const bottomFloorY = PVP_BOTTOM_FLOOR_Y;
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
    
    // Update UFO tilt/sway effect for Solo mode
    const accelX = dotVx - soloLastVx;
    const accelY = dotVy - soloLastVy;
    const acceleration = Math.sqrt(accelX * accelX + accelY * accelY);
    
    // Add tilt based on acceleration (stronger acceleration = more tilt)
    const tiltAmount = acceleration * 0.15; // Adjust sensitivity
    const tiltDirection = Math.atan2(accelY, accelX);
    soloUfoTilt += Math.sin(tiltDirection) * tiltAmount;
    
    // Damping - slowly return to neutral position
    soloUfoTilt *= 0.92; // Damping factor (0.92 = 8% reduction per frame)
    
    // Limit maximum tilt
    soloUfoTilt = Math.max(-0.3, Math.min(0.3, soloUfoTilt));
    
    // Update last velocities
    soloLastVx = dotVx;
    soloLastVy = dotVy;
  }
  
  // PvP/Training mode: Physics update for all players (copied from Solo DOT physics)
  // NOTE: Disabled for turn-based PvP (we drive movement from server plans/events instead).
  if ((gameMode === 'PvP' || gameMode === 'Training') && !isTurnBasedPvPDesired()) {
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
        const now = Date.now();
        // Gravity is active only if gravityActiveUntil > now (gravity was triggered by damage)
        if (DAMAGE_GRAVITY_ENABLED && player.gravityActiveUntil > now) {
          player.vy += pvpGravity;
        }
        player.x += player.vx;
        player.y += player.vy;
        if (PVP_MID_WALL_ENABLED) enforcePvpMidWall(playerId, player);
        enforcePvpCenterObstacle(player);
        // Apply air resistance
        player.vx *= pvpFriction;
        player.vy *= pvpFriction;
        continue; // Skip rest of physics update (no input handling)
      }
      
      // Apply gravity only if active (after damage) - gravity is triggered by damage, not always active
      const now = Date.now(); // Declare once for entire scope
      // Gravity is active only if gravityActiveUntil > now (gravity was triggered by damage)
      if (DAMAGE_GRAVITY_ENABLED && player.gravityActiveUntil > now) {
        player.vy += pvpGravity;
      }
      
      // Jetpack system - only for my player
      if (playerId === myPlayerId && player.isUsingJetpack && player.fuel > 0 && !player.isOverheated) {
        const jetpackUseTime = (now - player.jetpackStartTime) / 1000; // Time in seconds
        const jetpackRampTime = 1.5; // seconds to reach max boost (then stays max)
        
        // Calculate fuel percent for sound effect
        const fuelPercent = player.fuel / player.maxFuel;
        
        // Start/update jetpack sound effect only after 25% fuel is used (fuel <= 75%)
        const FUEL_THRESHOLD_FOR_SOUND = 0.75; // Start sound when fuel <= 75% (25% used)
        if (fuelPercent <= FUEL_THRESHOLD_FOR_SOUND) {
          // Calculate adjusted fuel percent for sound (0.0 = 75% fuel, 1.0 = 0% fuel)
          const adjustedFuelPercent = fuelPercent / FUEL_THRESHOLD_FOR_SOUND; // 0.0 to 1.0 range
          
          audioManager.resumeContext().then(() => {
            if (!(audioManager as any).jetpackOscillator) {
              // Start jetpack sound if not already playing
              audioManager.startJetpackSound(adjustedFuelPercent);
            } else {
              // Update jetpack sound based on adjusted fuel level
              audioManager.updateJetpackSound(adjustedFuelPercent);
            }
          });
        } else {
          // Stop sound if fuel is above threshold (above 75%)
          audioManager.stopJetpackSound();
        }
        
        {
          // Calculate speed boost (ramps up, then stays at max)
          const t = jetpackRampTime > 0 ? Math.max(0, Math.min(1, jetpackUseTime / jetpackRampTime)) : 1;
          const speedBoost = 1 + t * 4; // 1..5
          
          // Move towards mouse cursor position
          // Use global mouse position (updated in mousemove event)
          if (typeof globalMouseX !== 'undefined' && typeof globalMouseY !== 'undefined') {
            // Calculate direction to mouse cursor
            const dx = globalMouseX - player.x;
            const dy = globalMouseY - player.y;
            const distanceToMouse = Math.sqrt(dx * dx + dy * dy);
            
            if (distanceToMouse > 0.1) {
              // Normalize direction to mouse
              const dirX = dx / distanceToMouse;
              const dirY = dy / distanceToMouse;
              // Apply speed boost towards mouse cursor
              player.vx += dirX * speedBoost * 0.2; // Increased from 0.15 to 0.2 for stronger effect
              player.vy += dirY * speedBoost * 0.2;
            }
          } else {
            // Fallback: if mouse position not available, use current movement direction
            const currentSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
            if (currentSpeed > 0.1) {
              // Apply speed boost in current direction - increased multiplier for better feel
              const dirX = player.vx / currentSpeed;
              const dirY = player.vy / currentSpeed;
              player.vx += dirX * speedBoost * 0.2; // Increased from 0.15 to 0.2 for stronger effect
              player.vy += dirY * speedBoost * 0.2;
            }
          }
          
          // Consume fuel using dt (so bigger maxFuel actually extends travel).
          const lastTick = (typeof player.jetpackLastFuelTickTime === 'number' && player.jetpackLastFuelTickTime > 0)
            ? player.jetpackLastFuelTickTime
            : now;
          const dtSec = Math.max(0, Math.min(0.1, (now - lastTick) / 1000));
          player.jetpackLastFuelTickTime = now;
          const fuelConsumptionRate = 20; // fuel per second (100 fuel ~= 5s, 150 fuel ~= 7.5s)
          player.fuel = Math.max(0, player.fuel - fuelConsumptionRate * dtSec);
          
          // If fuel runs out, start overheat
          if (player.fuel <= 0) {
            player.isUsingJetpack = false;
            player.fuel = 0;
            player.isOverheated = true;
            player.overheatStartTime = now;
            player.lastFuelRegenTime = 0; // Fuel regeneration disabled (no auto-refill)
            audioManager.stopJetpackSound();
            console.log('Jetpack fuel depleted! Overheat started.');
          }
        }
      } else if (playerId === myPlayerId && !player.isUsingJetpack) {
        // Stop jetpack sound when not using
        audioManager['stopJetpackSound']();
      }
      
      // Overheat system - only for my player
      if (playerId === myPlayerId && player.isOverheated) {
        const overheatDuration = (now - player.overheatStartTime) / 1000; // Time in seconds
        const overheatTime = 4; // 4 seconds overheat (increased from 3 to 4 seconds)
        
        // Check if overheat duration passed (4 seconds)
        if (overheatDuration >= overheatTime) {
          // Overheat finished (fuel does NOT regenerate)
          player.isOverheated = false;
          player.overheatStartTime = 0;
          player.lastFuelRegenTime = 0;
          console.log('Overheat finished!');
        }
        // During overheat, fuel regeneration is blocked (handled below)
      }
      
      // Fuel regeneration intentionally disabled:
      // Fuel only decreases when used and carries over between PvP rounds.
      
      // Update position
      player.x += player.vx;
      player.y += player.vy;
      if (PVP_MID_WALL_ENABLED) enforcePvpMidWall(playerId, player);
      enforcePvpCenterObstacle(player);

      // Apply friction every frame to reduce inertia.
      // Make coasting (not using jetpack) slow down faster for the local player.
      const friction = (playerId === myPlayerId && !player.isUsingJetpack) ? pvpFrictionCoast : pvpFriction;
      player.vx *= friction;
      player.vy *= friction;
      
      // Check if player is out of bounds (any side) - no damage, just tracking for death animation
      const isOutOfBounds = player.x < pvpBounds.left || 
                            player.x > pvpBounds.right || 
                            player.y < pvpBounds.top || 
                            player.y > pvpBounds.bottom;
      
      // Out of bounds tracking (no damage)
      // Note: 'now' is already declared above in this scope
      if (isOutOfBounds) {
        if (player.outOfBoundsStartTime === null) {
          player.outOfBoundsStartTime = now;
        }
      } else {
        // Player is back in safe area - reset out of bounds tracking
        if (player.outOfBoundsStartTime !== null) {
          player.outOfBoundsStartTime = null;
          player.lastOutOfBoundsDamageTime = 0;
        }
      }
      
      // Toxic water system removed
      const bottomFloorY = PVP_BOTTOM_FLOOR_Y;
      
      // Bottom floor collision (100px below moving platform) - player lands but doesn't bounce
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
                  
                  // Activate gravity for 5 seconds after damage
                  const now = Date.now();
                  setDamageGravity(player, now);
                  
                  // Play damage received sound effect (pain/impact sound when receiving damage)
                  audioManager.resumeContext().then(() => {
                    audioManager.playDamageReceived(false);
                  });
                  
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
                  
                  // Activate gravity for 5 seconds after damage
                  const now = Date.now();
                  setDamageGravity(player, now);
                  
                  // Play damage received sound effect (pain/impact sound when receiving damage)
                  audioManager.resumeContext().then(() => {
                    audioManager.playDamageReceived(false);
                  });
                  
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
      
      // Update UFO tilt/sway effect for PvP players
      const accelX = player.vx - player.lastVx;
      const accelY = player.vy - player.lastVy;
      const acceleration = Math.sqrt(accelX * accelX + accelY * accelY);
      
      // Add tilt based on acceleration (stronger acceleration = more tilt)
      const tiltAmount = acceleration * 0.15; // Adjust sensitivity
      const tiltDirection = Math.atan2(accelY, accelX);
      player.ufoTilt += Math.sin(tiltDirection) * tiltAmount;
      
      // Damping - slowly return to neutral position
      player.ufoTilt *= 0.92; // Damping factor (0.92 = 8% reduction per frame)
      
      // Limit maximum tilt
      player.ufoTilt = Math.max(-0.3, Math.min(0.3, player.ufoTilt));
      
      // Update last velocities
      player.lastVx = player.vx;
      player.lastVy = player.vy;
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
    
    // PvP/Training mode: Update arrow physics (time-based). Hit is server-authoritative.
    if ((gameMode === 'PvP' || gameMode === 'Training') && pvpKatanaFlying) {
      const now = Date.now();
      if (!pvpKatanaLastUpdateAt) pvpKatanaLastUpdateAt = now;
      // After stone bounce, arrow should disappear quickly.
      if (pvpArrowExpireAt && now >= pvpArrowExpireAt) {
        pvpKatanaFlying = false;
        pvpArrowFired = false;
        pvpKatanaX = 0;
        pvpKatanaY = 0;
        pvpKatanaVx = 0;
        pvpKatanaVy = 0;
        pvpKatanaAngle = 0;
        pvpKatanaLastUpdateAt = 0;
        pvpKatanaTravelPx = 0;
        pvpArrowStoneBounceCount = 0;
        pvpArrowMaxTravelPx = PVP_ARROW_RANGE_PX + PVP_ARROW_FADE_PX;
        pvpArrowExpireAt = 0;
      } else {
      // Clamp dt to avoid visible "jumps" on occasional slow frames / tab throttling.
      const dtFrames = Math.max(0, Math.min(6, (now - pvpKatanaLastUpdateAt) / (1000 / 60)));
      pvpKatanaLastUpdateAt = now;

      // vx/vy are in px per 60fps frame (legacy), so scale by dtFrames
      const stepX = pvpKatanaVx * dtFrames;
      const stepY = pvpKatanaVy * dtFrames;
      pvpKatanaX += stepX;
      pvpKatanaY += stepY;
      const stepDist = Math.sqrt(stepX * stepX + stepY * stepY);
      pvpKatanaTravelPx += stepDist;

      // If arrow hits the center stone, destroy it immediately (visual) and shake stone.
      // Server will also send a 'stone_hit' event to sync both clients.
      if (PVP_CENTER_OBSTACLE_ENABLED) {
        const hit = collideCircleWithStone(pvpKatanaX, pvpKatanaY, PVP_ARROW_COLLISION_RADIUS);
        if (hit) {
          triggerStoneShake(pvpKatanaX, pvpKatanaY, 1);
          if (pvpArrowStoneBounceCount <= 0) {
            // 1st impact: bounce
            pvpKatanaX += hit.nx * (hit.depth + 0.5);
            pvpKatanaY += hit.ny * (hit.depth + 0.5);
            const vn = pvpKatanaVx * hit.nx + pvpKatanaVy * hit.ny;
            if (vn < 0) {
              // After stone bounce, arrow should not travel far.
              pvpKatanaVx = (pvpKatanaVx - 2 * vn * hit.nx) * 0.55;
              pvpKatanaVy = (pvpKatanaVy - 2 * vn * hit.ny) * 0.55;
              pvpKatanaAngle = Math.atan2(pvpKatanaVy, pvpKatanaVx);
            }
            pvpArrowStoneBounceCount = 1;
            pvpArrowMaxTravelPx = Math.min(pvpArrowMaxTravelPx, pvpKatanaTravelPx + 140);
            pvpArrowExpireAt = now + 100;
          } else {
            // 2nd impact: destroy
            pvpKatanaFlying = false;
            pvpArrowFired = false;
            pvpKatanaX = 0;
            pvpKatanaY = 0;
            pvpKatanaVx = 0;
            pvpKatanaVy = 0;
            pvpKatanaAngle = 0;
            pvpKatanaLastUpdateAt = 0;
            pvpKatanaTravelPx = 0;
            pvpArrowStoneBounceCount = 0;
            pvpArrowMaxTravelPx = PVP_ARROW_RANGE_PX + PVP_ARROW_FADE_PX;
            pvpArrowExpireAt = 0;
          }
        }
      }

      // Air resistance trail: small streaks behind the arrow while flying (purely visual).
      {
        const vmag = Math.sqrt(pvpKatanaVx * pvpKatanaVx + pvpKatanaVy * pvpKatanaVy);
        if (vmag > 0.001 && stepDist > 0.5) {
          const dirX = pvpKatanaVx / vmag;
          const dirY = pvpKatanaVy / vmag;
          const n = Math.max(1, Math.min(2, Math.floor(stepDist / 12)));
          for (let i = 0; i < n; i++) {
            const back = 10 + Math.random() * 14;
            safePushArrowAirParticle({
              x: pvpKatanaX - dirX * back + (Math.random() - 0.5) * 8,
              y: pvpKatanaY - dirY * back + (Math.random() - 0.5) * 8,
              vx: -dirX * (0.6 + Math.random() * 0.4) + (Math.random() - 0.5) * 0.15,
              vy: -dirY * (0.6 + Math.random() * 0.4) + (Math.random() - 0.5) * 0.15,
              life: 18 + Math.floor(Math.random() * 10),
              maxLife: 18 + Math.floor(Math.random() * 10),
              size: 2.6 + Math.random() * 1.2
            });
          }
        }
      }

      // Range limit: fade after range and remove at max travel (can be shortened after stone bounce)
      if (pvpKatanaTravelPx >= pvpArrowMaxTravelPx) {
        pvpKatanaFlying = false;
        pvpArrowFired = false;
        pvpKatanaX = 0;
        pvpKatanaY = 0;
        pvpKatanaVx = 0;
        pvpKatanaVy = 0;
        pvpKatanaAngle = 0;
        pvpKatanaLastUpdateAt = 0;
        pvpKatanaTravelPx = 0;
        pvpArrowStoneBounceCount = 0;
        pvpArrowMaxTravelPx = PVP_ARROW_RANGE_PX + PVP_ARROW_FADE_PX;
      }
      
      // Check if arrow is out of bounds
      if (pvpKatanaX < playLeft || pvpKatanaX > playRight || pvpKatanaY < 0 || pvpKatanaY > pvpBounds.bottom) {
        pvpKatanaFlying = false;
        pvpArrowFired = false;
        pvpKatanaX = 0;
        pvpKatanaY = 0;
        pvpKatanaVx = 0;
        pvpKatanaVy = 0;
        pvpKatanaAngle = 0;
        pvpKatanaLastUpdateAt = 0;
        pvpKatanaTravelPx = 0;
      }
      } // end else (not expired)
    }

    // PvP/Training mode: Arrow charge -> delayed fire
    if ((gameMode === 'PvP' || gameMode === 'Training') && pvpArrowCharging && myPlayerId && pvpPlayers[myPlayerId]) {
      const now = Date.now();
      if (now >= pvpArrowChargeFireAt) {
        const me = pvpPlayers[myPlayerId];
        // Cancel if dead/paralyzed at fire time
        if (me.isOut || me.hp <= 0 || deathAnimations.has(myPlayerId) || me.paralyzedUntil > now) {
          pvpArrowCharging = false;
        } else {
          // Fire arrow from current position towards stored aim
          pvpKatanaFlying = true;
          pvpArrowFired = true;
          pvpArrowLastShotTime = now;
          pvpKatanaX = me.x;
          pvpKatanaY = me.y + PVP_ARROW_SPAWN_OFFSET_Y;
          pvpKatanaLastUpdateAt = now;
          pvpKatanaTravelPx = 0;
          pvpArrowStoneBounceCount = 0;
          pvpArrowMaxTravelPx = PVP_ARROW_RANGE_PX + PVP_ARROW_FADE_PX;
          pvpArrowExpireAt = 0;

          const dx = pvpArrowChargeAimX - me.x;
          const dy = pvpArrowChargeAimY - (me.y + PVP_ARROW_SPAWN_OFFSET_Y);
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 0) {
            pvpKatanaVx = (dx / distance) * pvpKatanaSpeed;
            pvpKatanaVy = (dy / distance) * pvpKatanaSpeed;
            pvpKatanaAngle = Math.atan2(dy, dx);
          }

          // 5SEC PVP shadow recording (legacy hook; harmless in LIVE)
          if (is5SecPvPMode() && turnPhase === 'planning') {
            recordTurnSpawn('arrow', pvpKatanaX, pvpKatanaY, pvpKatanaVx, pvpKatanaVy);
          }

          // Audio
          audioManager.resumeContext().then(() => {
            audioManager.playArrowShot();
          });

          // Send arrow to opponent (at fire time, not charge start)
          const useColyseusArrow = colyseusService.isConnectedToRoom();
          const isSyncingArrow = useColyseusArrow || pvpSyncService.isSyncing();
          if (currentMatch && isSyncingArrow) {
            const nftBonuses = calculateNftBonuses();
            const totalDmg = dmg + (nftBonuses?.dmg || 0);
            const totalCritChance = critChance + (nftBonuses?.critChance || 0);
            const arrowInput = {
              type: 'arrow' as const,
              timestamp: now,
              x: me.x,
              y: me.y + PVP_ARROW_SPAWN_OFFSET_Y,
              targetX: pvpArrowChargeAimX,
              targetY: pvpArrowChargeAimY,
              dmg: totalDmg,
              critChance: totalCritChance,
            };
            if (useColyseusArrow) {
              colyseusService.sendInput(arrowInput);
            } else {
              pvpSyncService.sendInput(arrowInput);
            }
          }

          pvpArrowCharging = false;
        }
      }
    }
    
    // PvP mode: Update opponent arrow physics (time-based). Hit is server-authoritative.
    if (gameMode === 'PvP' && opponentArrowFlying) {
      const now = Date.now();
      if (!opponentArrowLastUpdateAt) opponentArrowLastUpdateAt = now;
      if (opponentArrowExpireAt && now >= opponentArrowExpireAt) {
        opponentArrowFlying = false;
        opponentArrowX = 0;
        opponentArrowY = 0;
        opponentArrowVx = 0;
        opponentArrowVy = 0;
        opponentArrowAngle = 0;
        opponentArrowLastUpdateAt = 0;
        opponentArrowTravelPx = 0;
        opponentArrowStoneBounceCount = 0;
        opponentArrowMaxTravelPx = PVP_ARROW_RANGE_PX + PVP_ARROW_FADE_PX;
        opponentArrowExpireAt = 0;
      } else {
      // Clamp dt to avoid visible "jumps" on occasional slow frames / tab throttling.
      const dtFrames = Math.max(0, Math.min(6, (now - opponentArrowLastUpdateAt) / (1000 / 60)));
      opponentArrowLastUpdateAt = now;
      const stepX = opponentArrowVx * dtFrames;
      const stepY = opponentArrowVy * dtFrames;
      opponentArrowX += stepX;
      opponentArrowY += stepY;
      const stepDist = Math.sqrt(stepX * stepX + stepY * stepY);
      opponentArrowTravelPx += stepDist;

      // Visual: remove opponent arrow if it hits the stone (server will also broadcast stone_hit).
      if (PVP_CENTER_OBSTACLE_ENABLED) {
        const hit = collideCircleWithStone(opponentArrowX, opponentArrowY, PVP_ARROW_COLLISION_RADIUS);
        if (hit) {
          triggerStoneShake(opponentArrowX, opponentArrowY, 1);
          if (opponentArrowStoneBounceCount <= 0) {
            // 1st impact: bounce
            opponentArrowX += hit.nx * (hit.depth + 0.5);
            opponentArrowY += hit.ny * (hit.depth + 0.5);
            const vn = opponentArrowVx * hit.nx + opponentArrowVy * hit.ny;
            if (vn < 0) {
              opponentArrowVx = (opponentArrowVx - 2 * vn * hit.nx) * 0.55;
              opponentArrowVy = (opponentArrowVy - 2 * vn * hit.ny) * 0.55;
              opponentArrowAngle = Math.atan2(opponentArrowVy, opponentArrowVx);
            }
            opponentArrowStoneBounceCount = 1;
            opponentArrowMaxTravelPx = Math.min(opponentArrowMaxTravelPx, opponentArrowTravelPx + 140);
            opponentArrowExpireAt = now + 100;
          } else {
            // 2nd impact: destroy
            opponentArrowFlying = false;
            opponentArrowX = 0;
            opponentArrowY = 0;
            opponentArrowVx = 0;
            opponentArrowVy = 0;
            opponentArrowAngle = 0;
            opponentArrowLastUpdateAt = 0;
            opponentArrowTravelPx = 0;
            opponentArrowStoneBounceCount = 0;
            opponentArrowMaxTravelPx = PVP_ARROW_RANGE_PX + PVP_ARROW_FADE_PX;
            opponentArrowExpireAt = 0;
          }
        }
      }

      // Air resistance trail for opponent arrow as well (keeps visuals consistent).
      {
        const vmag = Math.sqrt(opponentArrowVx * opponentArrowVx + opponentArrowVy * opponentArrowVy);
        if (vmag > 0.001 && stepDist > 0.5) {
          const dirX = opponentArrowVx / vmag;
          const dirY = opponentArrowVy / vmag;
          const n = Math.max(1, Math.min(3, Math.floor(stepDist / 10)));
          for (let i = 0; i < n; i++) {
            const back = 10 + Math.random() * 14;
            safePushArrowAirParticle({
              x: opponentArrowX - dirX * back + (Math.random() - 0.5) * 8,
              y: opponentArrowY - dirY * back + (Math.random() - 0.5) * 8,
              vx: -dirX * (0.6 + Math.random() * 0.4) + (Math.random() - 0.5) * 0.15,
              vy: -dirY * (0.6 + Math.random() * 0.4) + (Math.random() - 0.5) * 0.15,
              life: 18 + Math.floor(Math.random() * 10),
              maxLife: 18 + Math.floor(Math.random() * 10),
              size: 2.6 + Math.random() * 1.2
            });
          }
        }
      }

      if (opponentArrowTravelPx >= opponentArrowMaxTravelPx) {
        opponentArrowFlying = false;
        opponentArrowX = 0;
        opponentArrowY = 0;
        opponentArrowVx = 0;
        opponentArrowVy = 0;
        opponentArrowAngle = 0;
        opponentArrowLastUpdateAt = 0;
        opponentArrowTravelPx = 0;
        opponentArrowStoneBounceCount = 0;
        opponentArrowMaxTravelPx = PVP_ARROW_RANGE_PX + PVP_ARROW_FADE_PX;
      }
      
      // Check if opponent arrow is out of bounds
      if (opponentArrowX < playLeft || opponentArrowX > playRight || opponentArrowY < 0 || opponentArrowY > pvpBounds.bottom) {
        opponentArrowFlying = false;
        opponentArrowX = 0;
        opponentArrowY = 0;
        opponentArrowVx = 0;
        opponentArrowVy = 0;
        opponentArrowAngle = 0;
        opponentArrowLastUpdateAt = 0;
        opponentArrowTravelPx = 0;
      }
      } // end else (not expired)
    }
    
    // PvP mode: Update opponent projectile physics (bouncing platform, NOT damage) - time-based (reduces FPS drift)
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
        opponentProjectileLastUpdateAt = 0;
        console.log('Opponent projectile expired after 5 seconds');
      } else if (opponentProjectileBounceCount >= projectileMaxBounces) {
        // Max bounces reached - remove opponent projectile (no explosion animation)
        opponentProjectileFlying = false;
        opponentProjectileX = 0;
        opponentProjectileY = 0;
        opponentProjectileVx = 0;
        opponentProjectileVy = 0;
        opponentProjectileBounceCount = 0;
        opponentProjectileLastUpdateAt = 0;
        console.log('Opponent projectile removed - max bounces reached');
      } else {
        if (!opponentProjectileLastUpdateAt) opponentProjectileLastUpdateAt = now;
        const dtFramesTotal = Math.max(0, Math.min(6, (now - opponentProjectileLastUpdateAt) / (1000 / 60)));
        opponentProjectileLastUpdateAt = now;

        let framesLeft = dtFramesTotal;
        while (framesLeft > 0 && opponentProjectileFlying) {
          const step = Math.min(1, framesLeft);
          framesLeft -= step;

        // Update opponent projectile position
          opponentProjectileX += opponentProjectileVx * step;
          opponentProjectileY += opponentProjectileVy * step;
          opponentProjectileVy += projectileGravity * step; // Apply gravity (scaled)

          // Projectile vs stone: heavy projectile detonates on first impact (stone acts as cover).
          if (PVP_CENTER_OBSTACLE_ENABLED) {
            const hit = collideCircleWithStone(opponentProjectileX, opponentProjectileY, projectileRadius);
            if (hit) {
              triggerStoneShake(opponentProjectileX, opponentProjectileY, 1.2);
              createProjectileExplosion(opponentProjectileX, opponentProjectileY);
              createStoneImpactParticles(opponentProjectileX, opponentProjectileY);
              try { void audioManager.resumeContext(); audioManager.playMineExplosion(); } catch {}
              opponentProjectileFlying = false;
              opponentProjectileX = 0;
              opponentProjectileY = 0;
              opponentProjectileVx = 0;
              opponentProjectileVy = 0;
              opponentProjectileBounceCount = 0;
              opponentProjectileLastUpdateAt = 0;
              break;
            }
          }

          // Smoke trail scaled by time-step
          if (opponentProjectileVy > 0 && Math.random() < step) {
          safePushProjectileSmokeParticle({
            x: opponentProjectileX + (Math.random() - 0.5) * 4,
            y: opponentProjectileY + (Math.random() - 0.5) * 4,
              vx: (Math.random() - 0.5) * 0.5,
              vy: -0.3 - Math.random() * 0.2,
              life: 30 + Math.random() * 20,
            maxLife: 30 + Math.random() * 20,
              size: 4 + Math.random() * 3
          });
        }
        
          // Opponent projectile collision: it should only hit me (myPlayerId)
        if (myPlayerId && pvpPlayers[myPlayerId]) {
          const player = pvpPlayers[myPlayerId];
          const dx = opponentProjectileX - player.x;
          const dy = opponentProjectileY - player.y;
          const distanceSquared = dx * dx + dy * dy;
          const collisionRadius = projectileRadius + player.radius;
          const collisionRadiusSquared = collisionRadius * collisionRadius;
          
          if (distanceSquared <= collisionRadiusSquared) {
            opponentProjectileFlying = false;
            opponentProjectileX = 0;
            opponentProjectileY = 0;
            opponentProjectileVx = 0;
            opponentProjectileVy = 0;
            opponentProjectileBounceCount = 0;
              opponentProjectileLastUpdateAt = 0;
            console.log('Opponent projectile hit me - waiting for hit event from opponent');
              break;
          }
        }
        
          // Out of bounds
        if (opponentProjectileX < playLeft || opponentProjectileX > playRight || opponentProjectileY < 0 || opponentProjectileY > pvpBounds.bottom) {
          opponentProjectileFlying = false;
          opponentProjectileX = 0;
          opponentProjectileY = 0;
          opponentProjectileVx = 0;
          opponentProjectileVy = 0;
          opponentProjectileBounceCount = 0;
            opponentProjectileLastUpdateAt = 0;
            break;
          }
        }
      }
    }
    
    // PvP/Training mode: Update projectile physics (bouncing platform, NOT damage) - time-based (reduces FPS drift)
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
        projectileLastUpdateAt = 0;
        console.log('Projectile expired after 5 seconds');
      } else if (projectileBounceCount >= projectileMaxBounces) {
        // Max bounces reached - remove projectile (no explosion animation)
        projectileFlying = false;
        projectileX = 0;
        projectileY = 0;
        projectileVx = 0;
        projectileVy = 0;
        projectileBounceCount = 0;
        projectileLastUpdateAt = 0;
        console.log('Projectile removed - max bounces reached');
      } else {
        if (!projectileLastUpdateAt) projectileLastUpdateAt = now;
        const dtFramesTotal = Math.max(0, Math.min(6, (now - projectileLastUpdateAt) / (1000 / 60)));
        projectileLastUpdateAt = now;

        let framesLeft = dtFramesTotal;
        while (framesLeft > 0 && projectileFlying) {
          const step = Math.min(1, framesLeft);
          framesLeft -= step;

        // Update projectile position
          projectileX += projectileVx * step;
          projectileY += projectileVy * step;
          projectileVy += projectileGravity * step; // Apply gravity (scaled)

          // Projectile vs stone: heavy projectile detonates on first impact (stone acts as cover).
          if (PVP_CENTER_OBSTACLE_ENABLED) {
            const hit = collideCircleWithStone(projectileX, projectileY, projectileRadius);
            if (hit) {
              triggerStoneShake(projectileX, projectileY, 1.2);
              createProjectileExplosion(projectileX, projectileY);
              createStoneImpactParticles(projectileX, projectileY);
              try { void audioManager.resumeContext(); audioManager.playMineExplosion(); } catch {}
              projectileFlying = false;
              projectileX = 0;
              projectileY = 0;
              projectileVx = 0;
              projectileVy = 0;
              projectileBounceCount = 0;
              projectileLastUpdateAt = 0;
              break;
            }
          }

          // Smoke trail scaled by time-step
          if (projectileVy > 0 && Math.random() < step) {
          safePushProjectileSmokeParticle({
            x: projectileX + (Math.random() - 0.5) * 4,
            y: projectileY + (Math.random() - 0.5) * 4,
              vx: (Math.random() - 0.5) * 0.5,
              vy: -0.3 - Math.random() * 0.2,
              life: 30 + Math.random() * 20,
            maxLife: 30 + Math.random() * 20,
              size: 4 + Math.random() * 3
          });
        }
        
          // Projectile collision with opponent only (damage event)
        for (const playerId in pvpPlayers) {
          const player = pvpPlayers[playerId];
          const dx = projectileX - player.x;
          const dy = projectileY - player.y;
          const distanceSquared = dx * dx + dy * dy;
          const collisionRadius = projectileRadius + player.radius;
          const collisionRadiusSquared = collisionRadius * collisionRadius;
          
          if (distanceSquared <= collisionRadiusSquared && playerId !== myPlayerId && playerId === opponentId) {
            const opponent = player;
            
            // Check for crit hit - with NFT bonuses
            const nftBonuses = calculateNftBonuses();
            const totalCritChance = critChance + nftBonuses.critChance;
            const isCritHit = Math.random() < totalCritChance / 100;
            // Damage: 2x normal, 3x crit (using MY stats + NFT bonuses)
            const totalDmg = dmg + nftBonuses.dmg;
            const baseProjectileDamage = isCritHit ? totalDmg * 3 : totalDmg * 2;
            const projectileDamage = applyDamageVariance(baseProjectileDamage);
            
            audioManager.resumeContext().then(() => {
              audioManager.playDamageDealt(isCritHit);
            });
            
            profileManager.addDamageDealt(projectileDamage);
            
              // Send hit event to opponent
            const useColyseus = colyseusService.isConnectedToRoom();
            const isSyncing = useColyseus || pvpSyncService.isSyncing();
            if (currentMatch && isSyncing && opponentId) {
              const hitInput = {
                type: 'hit' as const,
                timestamp: Date.now(),
                damage: projectileDamage,
                isCrit: isCritHit,
                  targetPlayerId: opponentId
              };
              if (useColyseus) {
                colyseusService.sendInput(hitInput);
              } else {
                pvpSyncService.sendInput(hitInput);
              }
            }
            
            if (isCritHit) {
              screenShake = Math.max(screenShake, 30);
            }
            
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
            
            // Remove projectile after hit
            projectileFlying = false;
            projectileX = 0;
            projectileY = 0;
            projectileVx = 0;
            projectileVy = 0;
            projectileBounceCount = 0;
              projectileLastUpdateAt = 0;
            console.log(`Projectile hit opponent! Damage: ${projectileDamage}`);
              break;
          }
        }
        
        // Check if projectile is out of bounds
          if (projectileFlying && (projectileX < playLeft || projectileX > playRight || projectileY < 0 || projectileY > pvpBounds.bottom)) {
          projectileFlying = false;
          projectileX = 0;
          projectileY = 0;
          projectileVx = 0;
          projectileVy = 0;
          projectileBounceCount = 0;
            projectileLastUpdateAt = 0;
            break;
          }
        }
      }
    }
    
    // PvP/Training mode: Update each player's physics (including drawn lines and platform collision)
    if (gameMode === 'PvP' || gameMode === 'Training') {
      for (const playerId in pvpPlayers) {
      const player = pvpPlayers[playerId];
      
      const initialWallCheck = shouldKillByWall(player);
      if (initialWallCheck) {
        killPlayerByWall(playerId, player, initialWallCheck.reason);
        continue;
      }
      
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
              
              // Play bounce sound effect (like spring or trampoline)
              audioManager.resumeContext().then(() => {
                audioManager.playBounce();
              });
              
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
      
      if (TOXIC_PLATFORMS_ENABLED) {
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
              
              // Play bounce sound effect (like spring or trampoline)
              audioManager.resumeContext().then(() => {
                audioManager.playBounce();
              });
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
                
                // Play bounce sound effect (like spring or trampoline)
                audioManager.resumeContext().then(() => {
                  audioManager.playBounce();
                });
              }
            }
          };
          
          // Check collision with left platform (50% width)
          checkPlatformCollision(pvpPlatformLeftX, pvpPlatformSideWidth);
          
          // Check collision with right platform (50% width)
          checkPlatformCollision(pvpPlatformRightX, pvpPlatformSideWidth);
        }

      const postPhysicsWallCheck = shouldKillByWall(player);
      if (postPhysicsWallCheck) {
        killPlayerByWall(playerId, player, postPhysicsWallCheck.reason);
        continue;
      }
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
      // Start showing UFO "shadow tail" earlier since inertia/friction is higher now
      if (PVP_UFO_SPEED_TRAIL_ENABLED && playerSpeed >= 2) {
        player.speedTrail.push({
          x: player.x,
          y: player.y,
          vx: 0,
          vy: 0,
          life: 16,
          maxLife: 16,
          size: player.radius * 1.2
        });
        if (player.speedTrail.length > 8) {
          player.speedTrail.shift();
        }
      } else if (!PVP_UFO_SPEED_TRAIL_ENABLED && player.speedTrail.length) {
        // Keep buffer empty when feature disabled
        player.speedTrail.length = 0;
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
    const useSupabaseFallback = !useColyseus && pvpSyncService.isSyncing();
    const isSyncing = useColyseus || useSupabaseFallback;
    
    if (gameMode === 'PvP' && currentMatch && myPlayerId && pvpPlayers[myPlayerId] && isSyncing) {
      const now = Date.now();
      if (now - lastPositionSyncTime >= POSITION_SYNC_INTERVAL) {
        lastPositionSyncTime = now;
        const myPlayer = pvpPlayers[myPlayerId];
        const sendNetworkInput = useColyseus
          ? (input: any) => colyseusService.sendInput(input)
          : (input: any) => pvpSyncService.sendInput(input);

        const positionSnapshot: MovementSnapshot = {
          x: myPlayer.x,
          y: myPlayer.y,
          vx: myPlayer.vx,
          vy: myPlayer.vy,
          timestamp: now
        };

        if (
          shouldSendSnapshot(positionSnapshot, lastSentPositionSnapshot, {
            distanceEpsilon: POSITION_DISTANCE_EPSILON,
            velocityEpsilon: VELOCITY_EPSILON,
            heartbeatInterval: POSITION_HEARTBEAT_INTERVAL
          })
        ) {
          const positionInput = {
            type: 'position' as const,
            timestamp: now,
            x: myPlayer.x,
            y: myPlayer.y,
            vx: myPlayer.vx,
            vy: myPlayer.vy
          };
          sendNetworkInput(positionInput);
          lastSentPositionSnapshot = positionSnapshot;
        }
        
        // Arrow position streaming disabled: both clients simulate arrow locally from the launch event.
        // (Lower bandwidth; server-authoritative hit decides outcome.)
        if (pvpKatanaFlying) {
          // keep lastSentArrowSnapshot unused
        } else if (lastSentArrowSnapshot) {
          lastSentArrowSnapshot = null;
        }
        
        if (projectileFlying) {
          const projectileSnapshot: MovementSnapshot = {
            x: projectileX,
            y: projectileY,
            vx: projectileVx,
            vy: projectileVy,
            timestamp: now
          };
          
          if (
            shouldSendSnapshot(projectileSnapshot, lastSentProjectileSnapshot, {
              distanceEpsilon: PROJECTILE_DISTANCE_EPSILON,
              heartbeatInterval: PROJECTILE_HEARTBEAT_INTERVAL
            })
          ) {
            const projectileInput = {
              type: 'projectile_position' as const,
              timestamp: now,
              x: projectileX,
              y: projectileY,
              vx: projectileVx,
              vy: projectileVy,
            };
            sendNetworkInput(projectileInput);
            lastSentProjectileSnapshot = projectileSnapshot;
          }
        } else if (lastSentProjectileSnapshot) {
          lastSentProjectileSnapshot = null;
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
        const myAddress = getMyPvpAddress();
        if (matchToUse && myAddress) {
          // Determine opponent: if I'm p1, opponent is p2; if I'm p2, opponent is p1
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
            myAddress, 
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
        
        // Update match result in Supabase (only for persistent identities)
        const persistId = getRoninAddressForPersistence();
        if (persistId && currentMatch) {
          supabaseService.updateMatchResult(currentMatch.id, persistId);
          supabaseService.getProfile(persistId).then(async (profile) => {
              if (profile) {
                const newElo = profile.pvp_data.elo + 10;
                const newWins = profile.pvp_data.wins + 1;
              await supabaseService.updatePvpData(persistId, {
                  elo: newElo,
                  wins: newWins,
                  losses: profile.pvp_data.losses,
                });
              }
            });
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
        const myAddress = getMyPvpAddress();
        if (matchToUse && myAddress) {
          // Determine opponent: if I'm p1, opponent is p2; if I'm p2, opponent is p1
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
            myAddress, 
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
        
        // Update match result in Supabase (only for persistent identities)
        const persistId = getRoninAddressForPersistence();
        if (persistId && currentMatch) {
          supabaseService.updateMatchResult(currentMatch.id, opponentId);
          supabaseService.getProfile(persistId).then(async (profile) => {
              if (profile) {
                const newElo = Math.max(0, profile.pvp_data.elo - 5);
                const newLosses = profile.pvp_data.losses + 1;
              await supabaseService.updatePvpData(persistId, {
                  elo: newElo,
                  wins: profile.pvp_data.wins,
                  losses: newLosses,
                });
              }
            });
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
          const selfForce = PVP_CLICK_FORCE;
          
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
    
    // Collision detection between players (disabled for turn-based PvP)
    if (!isTurnBasedPvPDesired() && myPlayerId && opponentId && pvpPlayers[myPlayerId] && pvpPlayers[opponentId]) {
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
            
            // Activate gravity for 5 seconds after damage
            const now = Date.now();
            setDamageGravity(player2, now);
            
            // Play damage dealt sound effect (satisfying hit sound when dealing damage)
            audioManager.resumeContext().then(() => {
              audioManager.playDamageDealt(false);
            });
            
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
            
            // Activate gravity for 5 seconds after damage
            const now = Date.now();
            setDamageGravity(player1, now);
            
            // Play damage received sound effect (pain/impact sound when receiving damage)
            audioManager.resumeContext().then(() => {
              audioManager.playDamageReceived(false);
            });
            
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
              const pushForce = Math.abs(relSpeed) * 0.2;
              player2.vx += nx * pushForce;
              player2.vy += ny * pushForce;
            } else {
              // Player 2 dominates - reduce its speed by 50%
              player2.vx *= 0.5;
              player2.vy *= 0.5;
              
              // Push player 1 away
              const pushForce = Math.abs(relSpeed) * 0.2;
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
  if (TOXIC_PLATFORMS_ENABLED) {
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
  } else {
    // Keep coordinates centered when platforms are disabled
    movingPlatformX = (playLeft + playRight) / 2;
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
        
        // Play damage received sound effect (pain/impact sound when receiving damage)
        audioManager.resumeContext().then(() => {
          audioManager.playDamageReceived(isCritHit);
        });
        
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
        
        // Play dot hit sound effect (like hammer hitting a nail)
        audioManager.resumeContext().then(() => {
          audioManager.playDotHit();
        });
        
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
    // Start showing UFO "shadow tail" earlier since inertia/friction is higher now
    if (cachedDotSpeed >= 2) {
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

  // Update arrow air-resistance particles
  for (let i = arrowAirParticles.length - 1; i >= 0; i--) {
    const particle = arrowAirParticles[i];
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.life--;
    if (particle.life <= 0) {
      arrowAirParticles.splice(i, 1);
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

    // #region agent log
    try {
      if (AGENT_DEBUG_LOGS_ENABLED) {
      fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/simple-main.ts:gameLoop',message:'fps + frametime (1s window)',data:{gameMode,currentFPS,averageFrameTime, maxFrameTime},timestamp:Date.now(),sessionId:'debug-session',runId:'baseline',hypothesisId:'H7'})}).catch(()=>{});
      }
    } catch {}
    // #endregion
  }

  render();
  
  if (isServerBrowserOpen) {
    drawServerBrowserOverlay();
  }
  
  // Track frame time for this frame (measure entire gameLoop including render)
  const frameEndTime = performance.now();
  const frameTime = frameEndTime - frameStartTime;
  frameTimeHistory.push(frameTime);
  if (frameTimeHistory.length > 60) {
    frameTimeHistory.shift(); // Keep last 60 frames
  }

  // #region agent log
  try {
    // Only log big stutters (jank). Rate-limited.
    if (frameTime > 25) {
      const win: any = (typeof window !== 'undefined') ? window : {};
      const s = win.__agentFrameSpike || (win.__agentFrameSpike = { lastTs: 0 });
      const now = Date.now();
      if (now - s.lastTs > 500) {
        s.lastTs = now;
        let speedTrailTotal = 0;
        let speedTrailMax = 0;
        if (typeof pvpPlayers === 'object' && pvpPlayers) {
          for (const pid in pvpPlayers) {
            const st = (pvpPlayers as any)[pid]?.speedTrail;
            const len = Array.isArray(st) ? st.length : 0;
            speedTrailTotal += len;
            speedTrailMax = Math.max(speedTrailMax, len);
          }
        }
        const rttMs = colyseusService.getAgentRttMs?.() ?? null;
        if (AGENT_DEBUG_LOGS_ENABLED) fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/simple-main.ts:gameLoop',message:'FRAME_SPIKE',data:{gameMode,frameTimeMs:Math.round(frameTime*10)/10,currentFPS,averageFrameTime,maxFrameTime,rttMs,counts:{clickParticles:(typeof clickParticles!=='undefined'&&Array.isArray(clickParticles))?clickParticles.length:null,damageNumbers:(typeof damageNumbers!=='undefined'&&Array.isArray(damageNumbers))?damageNumbers.length:null,clickSmudges:(typeof clickSmudges!=='undefined'&&Array.isArray(clickSmudges))?clickSmudges.length:null,drawnLines:(typeof drawnLines!=='undefined'&&Array.isArray(drawnLines))?drawnLines.length:null,deathAnimations:(typeof deathAnimations!=='undefined'&&deathAnimations&&typeof deathAnimations.size==='number')?deathAnimations.size:null,speedTrailTotal,speedTrailMax}},timestamp:Date.now(),sessionId:'debug-session',runId:'baseline',hypothesisId:'H9'})}).catch(()=>{});
      }
    }
  } catch {}
  // #endregion
  
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
