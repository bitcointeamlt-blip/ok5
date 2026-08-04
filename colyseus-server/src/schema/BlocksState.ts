import { Schema, MapSchema, type } from "@colyseus/schema";

/* RONKE BLOCKS — 1v1 online būsena. Lentos sinchronizuojamos ŽINUTĖMIS (snap relay),
 * o šitame schema state — tik rungtynių kontrolė (seed, fazė, žaidėjai, rezultatas). */
export class BlocksPlayer extends Schema {
  @type("string") side: string = "";        // "p1" | "p2"
  @type("string") name: string = "Player";
  @type("boolean") ready: boolean = false;
  @type("boolean") topped: boolean = false;
  @type("uint16") lines: number = 0;
}

export class BlocksState extends Schema {
  @type("uint32") seed: number = 0;
  @type("string") phase: string = "lobby";  // lobby | countdown | playing | over
  @type("int32") countdown: number = 0;      // ms iki starto (fazėje countdown)
  @type("string") winner: string = "";       // "" | "p1" | "p2"
  @type({ map: BlocksPlayer }) players = new MapSchema<BlocksPlayer>();
}
