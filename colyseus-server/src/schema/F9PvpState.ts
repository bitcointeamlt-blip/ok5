// F9 PvP — Colyseus synced state schema.
// ISOLATED: brand-new file, no edits to existing schemas. Names are F9Pvp-prefixed
// so they never collide with GameState/UnitsState or the lenta client's _f9*/F12 globals.
//
// Coordinates are in GRID CELLS (float), matching lenta F9 (arena cols×rows, CELL=54px on client).
// Only dynamic gameplay data is synced; sprites/animation live on the client.
import { Schema, MapSchema, type } from "@colyseus/schema";

export class F9PvpPlayer extends Schema {
  @type("string") sessionId: string = "";
  @type("string") address: string = "";     // wallet (lowercase) or "" for test
  @type("int8") team: number = 0;            // 0 = left side, 1 = right side
  @type("boolean") ready: boolean = false;
  @type("boolean") connected: boolean = true;
  @type("uint16") unitsAlive: number = 0;
}

export class F9PvpUnit extends Schema {
  @type("string") id: string = "";
  @type("int8") team: number = 0;
  @type("string") utype: string = "skull";   // skull | archer | harpoon_fish | shaman | pigronke
  @type("uint32") tokenId: number = 0;        // NFT token id (0 = free/test unit)
  @type("uint8") level: number = 0;
  @type("float32") x: number = 0;             // cell coords (float)
  @type("float32") y: number = 0;
  @type("float32") hp: number = 1;
  @type("float32") maxHp: number = 1;
  @type("int8") facing: number = 1;           // -1 = facing left, 1 = facing right
  @type("string") action: string = "idle";    // idle | moving | attacking
}

// Optional per-side objective (base/core). v1: off by default; enabled in a later phase
// so "destroy the enemy core" becomes an alternate win condition alongside unit wipe.
export class F9PvpCore extends Schema {
  @type("int8") team: number = 0;
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("float32") hp: number = 0;
  @type("float32") maxHp: number = 0;
  @type("boolean") active: boolean = false;
}

export class F9PvpState extends Schema {
  @type("string") phase: string = "lobby";    // lobby | ready | playing | gameover
  @type("uint32") seed: number = 0;
  @type("float64") gameTime: number = 0;       // ms since match start
  @type("int8") winnerTeam: number = -1;       // -1 = none yet / draw
  @type("uint8") cols: number = 20;
  @type("uint8") rows: number = 16;

  @type({ map: F9PvpPlayer }) players = new MapSchema<F9PvpPlayer>();
  @type({ map: F9PvpUnit }) units = new MapSchema<F9PvpUnit>();
  @type({ map: F9PvpCore }) cores = new MapSchema<F9PvpCore>();
}
