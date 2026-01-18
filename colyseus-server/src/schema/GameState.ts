import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") sessionId: string = "";
  @type("string") address: string = ""; // Ronin wallet address (nullable handled as empty string)
  // NFT profile picture URL to render inside UFO (synced to opponent)
  @type("string") profilePicture: string = "";
  @type("number") x: number = 960;
  @type("number") y: number = 540;
  @type("number") vx: number = 0;
  @type("number") vy: number = 0;
  @type("number") hp: number = 100;
  @type("number") maxHP: number = 100;
  @type("number") armor: number = 50;
  @type("number") maxArmor: number = 50;
  // Offensive stats (server-authoritative; synced so clients feel the same damage/balance).
  @type("number") dmg: number = 1;
  @type("number") critChance: number = 4; // %
  @type("number") accuracy: number = 60; // %
  // Ronkeverse NFT count snapshot (server-side check on join; used for fair bonuses / regen limit)
  @type("number") nftCount: number = 0;
  // Jetpack fuel (shared info during PLANNING)
  @type("number") fuel: number = 150;
  @type("number") maxFuel: number = 150;
  @type("boolean") ready: boolean = false;

  // Arrow state
  @type("number") arrowX: number = 0;
  @type("number") arrowY: number = 0;
  @type("number") arrowVx: number = 0;
  @type("number") arrowVy: number = 0;

  // Projectile state
  @type("number") projectileX: number = 0;
  @type("number") projectileY: number = 0;
  @type("number") projectileVx: number = 0;
  @type("number") projectileVy: number = 0;

  // Last click
  @type("number") lastClickX: number = 0;
  @type("number") lastClickY: number = 0;
  @type("number") lastClickTime: number = 0;
}

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type("boolean") gameStarted: boolean = false;
  @type("number") seed: number = 0;
  // Turn-based PvP phase state (used by pvp_5sec_room)
  @type("string") phase: string = "lobby"; // lobby | planning | execute
  @type("number") roundId: number = 0;
  @type("number") phaseEndsAt: number = 0; // server timestamp (ms)
  @type("number") executeStartAt: number = 0; // server timestamp (ms)
}

