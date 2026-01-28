// ========== UNITS GAME PERSISTENCE ==========
// Save/load galaxy state to JSON files.

import * as fs from "fs";
import * as path from "path";
import type { UnitsGameLogic, ServerPlanet, ServerPlayer } from "../game/UnitsGameLogic";

const DATA_DIR = path.resolve(__dirname, "../../data/galaxies");

// Ensure data directory exists
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export interface GalaxySaveData {
  version: number;
  galaxyId: string;
  seed: number;
  gameTime: number;
  difficulty: string;
  savedAt: number;
  planets: {
    id: number;
    ownerId: number;
    units: number;
    maxUnits: number;
    defense: number;
    growthRate: number;
    stability: number;
    connected: boolean;
    generating: boolean;
    hasShield: boolean;
    deposits: { type: string; amount: number }[];
    buildings: ({ type: string; slot: number } | null)[];
  }[];
  players: {
    id: number;
    address: string;
    name: string;
    color: string;
    homeId: number;
    alive: boolean;
    isAI: boolean;
  }[];
}

export function saveGalaxy(galaxyId: string, seed: number, logic: UnitsGameLogic): void {
  ensureDataDir();

  const data: GalaxySaveData = {
    version: 1,
    galaxyId,
    seed,
    gameTime: logic.gameTime,
    difficulty: logic.difficulty,
    savedAt: Date.now(),
    planets: logic.planets.map(p => ({
      id: p.id,
      ownerId: p.ownerId,
      units: Math.floor(p.units),
      maxUnits: p.maxUnits,
      defense: p.defense,
      growthRate: p.growthRate,
      stability: p.stability,
      connected: p.connected,
      generating: p.generating,
      hasShield: p.hasShield,
      deposits: p.deposits.map(d => ({ type: d.type, amount: d.amount })),
      buildings: p.buildings.map(b => b ? { type: b.type, slot: b.slot } : null),
    })),
    players: logic.players.map(p => ({
      id: p.id,
      address: p.address,
      name: p.name,
      color: p.color,
      homeId: p.homeId,
      alive: p.alive,
      isAI: p.isAI,
    })),
  };

  const filePath = path.join(DATA_DIR, `${galaxyId}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`[UnitsPersistence] Saved galaxy ${galaxyId} (${data.planets.length} planets, ${data.players.length} players)`);
  } catch (e) {
    console.error(`[UnitsPersistence] Failed to save galaxy ${galaxyId}:`, e);
  }
}

export function loadGalaxy(galaxyId: string): GalaxySaveData | null {
  const filePath = path.join(DATA_DIR, `${galaxyId}.json`);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const data: GalaxySaveData = JSON.parse(raw);
    if (data.version !== 1) return null;
    console.log(`[UnitsPersistence] Loaded galaxy ${galaxyId} (${data.planets.length} planets, ${data.players.length} players)`);
    return data;
  } catch (e) {
    console.error(`[UnitsPersistence] Failed to load galaxy ${galaxyId}:`, e);
    return null;
  }
}

/**
 * Apply saved data onto a game logic instance that was initialized from a generated galaxy.
 * This overwrites dynamic state (ownership, units, etc.) while keeping positions/sizes from generation.
 */
export function applySaveToLogic(save: GalaxySaveData, logic: UnitsGameLogic): void {
  logic.gameTime = save.gameTime;
  logic.difficulty = save.difficulty;

  for (const sp of save.planets) {
    const planet = logic.planetMap.get(sp.id);
    if (!planet) continue;
    planet.ownerId = sp.ownerId;
    planet.units = sp.units;
    planet.maxUnits = sp.maxUnits;
    planet.defense = sp.defense;
    planet.growthRate = sp.growthRate;
    planet.stability = sp.stability;
    planet.connected = sp.connected;
    planet.generating = sp.generating;
    planet.hasShield = sp.hasShield;
    if (sp.deposits && sp.deposits.length === planet.deposits.length) {
      for (let i = 0; i < sp.deposits.length; i++) {
        planet.deposits[i].amount = sp.deposits[i].amount;
      }
    }
    if (sp.buildings) {
      planet.buildings = sp.buildings.map(b =>
        b ? { type: b.type as any, slot: b.slot } : null
      );
    }
  }

  // Restore players
  for (const sp of save.players) {
    if (logic.players[sp.id]) {
      logic.players[sp.id].address = sp.address;
      logic.players[sp.id].name = sp.name;
      logic.players[sp.id].alive = sp.alive;
      logic.players[sp.id].homeId = sp.homeId;
    }
  }
}

export function deleteGalaxy(galaxyId: string): void {
  const filePath = path.join(DATA_DIR, `${galaxyId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[UnitsPersistence] Deleted galaxy ${galaxyId}`);
    }
  } catch (e) {
    console.error(`[UnitsPersistence] Failed to delete galaxy ${galaxyId}:`, e);
  }
}
