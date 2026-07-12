import { Schema, MapSchema, type } from "@colyseus/schema";

// ── F9 PvP schema — real-time FFA (iki 4 žaidėjų) RTS squad battle + KotH. ──
// Vienetai (units) gyvena GLOBALIAME map'e (ne per-player), su `team` lauku — taip serveris
// authoritative valdo visą mūšio lauką, klientas tik renderina + siunčia komandas.
// Koordinatės = CELL erdvė (float), arena 40×24 (atitinka CUSTOM_MAP9 game.js).
//
// BANDWIDTH: naudojam tikslius primityvus (uint8/uint16/float32/int8) vietoj bendro "number",
// kad serializacija būtų mažesnė ir greitesnė (Colyseus best practice, daug entity).

export class F9Unit extends Schema {
  @type("string") id: string = "";
  @type("string") owner: string = "";          // owning player sessionId
  @type("uint8") team: number = 0;             // FFA: 0..3 (po vieną kiekvienam žaidėjui)
  @type("string") utype: string = "skull";      // skull|archer|harpoon_fish|shaman|pigronke|ghost|ronhood
  @type("float32") x: number = 0;              // cell coords (float, smooth)
  @type("float32") y: number = 0;
  @type("uint16") hp: number = 8;
  @type("uint16") maxHp: number = 8;
  @type("float32") tx: number = 0;             // move/attack-move destinacija
  @type("float32") ty: number = 0;
  @type("string") cmd: string = "idle";         // idle | move | attackmove | attack
  @type("string") targetId: string = "";        // priešo unit id kai cmd=attack
  @type("int8") faceDx: number = 1;            // -1 kairė / 1 dešinė
  @type("boolean") alive: boolean = true;
  @type("boolean") holding: boolean = false;    // 🛡 HOLD POSITION — užrakintas poste (skydas), ignoruoja komandas
  @type("boolean") patrolling: boolean = false; // 🚩 PATROL — užrakintas maršrute, ignoruoja komandas iki unpatrol
  @type("uint8") level: number = 0;            // NFT lygis (permadeath kreivei + stat scaling)
  @type("string") tokenId: string = "";          // NFT token id ("" = free/non-NFT unitas)
}

export class F9Player extends Schema {
  @type("string") sessionId: string = "";
  @type("string") address: string = "";         // Ronin wallet (gali būti tuščia)
  @type("uint8") team: number = 0;             // FFA team index 0..3
  @type("boolean") ready: boolean = false;
  @type("boolean") connected: boolean = true;
  @type("float32") ronkePending: number = 0;   // sukauptas RONKE payout (KotH drip + pergalės likutis)
  @type("float32") contributed: number = 0;     // kiek RONKE žaidėjas įnešė į pot (FAZA D stake)
  @type("float32") bones: number = 0;           // 🦴 GYVAI kaupiami kaulai (kill × boneMult) — HUD counter
  @type("float32") boneMult: number = 1;        // 🦴 žaidėjo kaulų daugiklis (baseMult + RonkePower bonusas)
}

// 🏰 Castle wall segment — destructible. Serveris authoritative (kolizija + HP + collapse).
export class F9Wall extends Schema {
  @type("uint8") x: number = 0;              // cell col
  @type("uint8") y: number = 0;              // cell row
  @type("uint16") hp: number = 40;
  @type("uint16") maxHp: number = 40;
  @type("boolean") alive: boolean = true;
  @type("boolean") tower: boolean = false;   // 🗼 zip ginybos bokštas (šauna attackerius) — flank segmentai
  @type("uint8") level: number = 1;          // 🏰 sienos lygis: 1 = medinė (palisade), ≥2 = akmeninė (upgrade)
}

export class F9State extends Schema {
  @type({ map: F9Player }) players = new MapSchema<F9Player>();
  @type({ map: F9Unit }) units = new MapSchema<F9Unit>();
  @type({ map: F9Wall }) walls = new MapSchema<F9Wall>();   // 🏰 castle sienos segmentai ("x,y" → F9Wall)
  @type("string") phase: string = "lobby";      // lobby | ready | playing | ended
  @type("boolean") gameStarted: boolean = false;
  @type("uint32") seed: number = 0;            // deterministinis RNG (Faza 3 simui)
  @type("string") winnerSid: string = "";       // paskutinio likusio gyvo žaidėjo sessionId
  @type("number") startedAt: number = 0;        // match start (epoch ms — didelis, paliekam number/float64)
  @type("number") serverTime: number = 0;       // sinchr. laikrodis interpoliacijai (epoch ms)
  @type("string") centerHolderSid: string = ""; // KotH: kas valdo centrą dabar ("" = niekas)
  @type("boolean") centerContested: boolean = false; // KotH: centras ginčijamas (2+ team viduj)
  @type("uint16") entryFee: number = 0;        // RONKE įėjimo mokestis / žaidėją (0 = free režimas)
  @type("float32") pot: number = 0;            // self-funding prizų puodas (= Σ entryFee, laša į holderį)
  // 🏰 Castle capture (KotH za sienos): laikyk zoną → užimi pilį, ginčijama → užšaldyta.
  @type("int8") capOwner: number = -1;          // pilies valdytojas (-1 neutralus, 0..3 = team). Hold→RONKE (FAZA D)
  @type("uint8") capPct: number = 0;            // capture progresas 0-100 (iššūkėjo, kol užims)
  @type("int8") capTeam: number = -1;           // kas dabar progresuoja zonoj (-1 = niekas / ginčas)
  @type("boolean") capContested: boolean = false; // 2+ team zonoj → progresas užšaldytas
  @type("uint8") capCount: number = 0;          // kiek iššūkėjo unitų zonoj (greičio daugiklis vizualui)
}
