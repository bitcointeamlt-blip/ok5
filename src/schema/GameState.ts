import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") sessionId: string = "";
  @type("string") address: string = ""; // Ronin wallet address (nullable handled as empty string)
  @type("number") x: number = 960;
  @type("number") y: number = 540;
  @type("number") vx: number = 0;
  @type("number") vy: number = 0;
  @type("number") hp: number = 100;
  @type("number") maxHP: number = 100;
  @type("number") armor: number = 50;
  @type("number") maxArmor: number = 50;
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
  @type("number") seed: number = Math.floor(Math.random() * 1000000);
}

