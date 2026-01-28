import { Schema, type, MapSchema } from "@colyseus/schema";

/**
 * Synced planet state.
 * Static data (x, y, radius, size, color, craters) lives only on the client
 * and is regenerated deterministically from the shared seed.
 * Only dynamic gameplay data is synced here.
 */
export class SyncPlanet extends Schema {
  @type("int16")   ownerId: number    = -1;     // -1=neutral, 0..N=player slot
  @type("float32") units: number      = 0;
  @type("uint16")  maxUnits: number   = 0;
  @type("float32") stability: number  = 50;
  @type("boolean") connected: boolean = false;
  @type("boolean") generating: boolean = false;
  @type("boolean") hasShield: boolean = false;
  @type("string")  deposits: string   = "";     // "carbon:50,water:30"
  @type("string")  buildings: string  = "";     // "turret:0,mine:1,"
  @type("float32") defense: number    = 1;
  @type("float32") growthRate: number = 1;
}

/**
 * Synced player state.
 */
export class SyncPlayer extends Schema {
  @type("string")  sessionId: string = "";
  @type("string")  address: string   = "";      // wallet address
  @type("int16")   playerId: number  = -1;      // slot 0..N
  @type("string")  name: string      = "";
  @type("string")  color: string     = "";
  @type("int16")   homeId: number    = -1;
  @type("boolean") alive: boolean    = true;
  @type("uint16")  planetCount: number = 0;
  @type("uint32")  totalUnits: number  = 0;
}

/**
 * Root state schema for the Units room.
 */
export class UnitsState extends Schema {
  @type("string")  phase: string     = "lobby";  // lobby | playing | gameover
  @type("uint32")  seed: number      = 0;
  @type("float64") gameTime: number  = 0;
  @type("string")  difficulty: string = "medium";
  @type("string")  winnerId: string  = "";       // playerId or "" if no winner

  @type({ map: SyncPlanet }) planets = new MapSchema<SyncPlanet>();
  @type({ map: SyncPlayer }) players = new MapSchema<SyncPlayer>();
}
