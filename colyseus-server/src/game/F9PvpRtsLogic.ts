// F9 PvP — server-authoritative RTS combat simulation.
// ISOLATED: no Colyseus / DOM imports. Pure logic so it is unit-testable and reusable.
//
// Ported from the lenta game.js F9 spec (cells, fixed unit stats, NFT level scaling).
// v1 deliberately simplified vs single-player F9: NO tree/boulder collision, unit
// separation, bush cover, or projectile arcs yet (those are render/feel polish added in a
// later phase). Core loop = move toward target, auto-engage in detect radius, attack on
// cooldown, apply damage, die. This is enough for a playable 1v1.

export interface F9PvpDeckEntry { utype: string; level: number; tokenId: number; }

export type F9CmdType = "move" | "amove" | "stop";

export interface ServerCore {
  team: number;
  x: number; y: number;
  hp: number; maxHp: number;
  dead: boolean;
}

export interface ServerUnit {
  id: string;
  team: number;
  utype: string;
  tokenId: number;
  level: number;
  x: number; y: number;
  hp: number; maxHp: number;
  dmg: number;
  range: number;        // attack range (cells)
  detect: number;       // auto-acquire radius (cells)
  speed: number;        // cells / second
  cdMs: number;         // attack cooldown (ms)
  facing: number;       // -1 / 1
  dead: boolean;
  // runtime control
  targetId: string | null;
  lastAttackAt: number; // gameTime ms of last hit
  mode: "hold" | "move" | "amove";
  cmdX: number | null;
  cmdY: number | null;
  action: string;       // idle | moving | attacking
  // settlement accounting (Phase 5) — totals survive death (kept in allUnits)
  kills: number;
  dmgDealt: number;
  dmgTaken: number;
}

// ── F9 unit stat tables (exact values from game.js spec) ─────────────────
// _F9_ALLY_ATTACK: range (cells), cd (ms), dmg
const ATTACK: Record<string, { range: number; cd: number; dmg: number }> = {
  skull:        { range: 0.95, cd: 1500, dmg: 2 },
  shaman:       { range: 7.0,  cd: 3000, dmg: 4 },
  archer:       { range: 6.5,  cd: 5000, dmg: 3 },
  harpoon_fish: { range: 5.5,  cd: 3600, dmg: 3 },
  pigronke:     { range: 1.18, cd: 2800, dmg: 8 },
};
// _F9_BASE_HP
const BASE_HP: Record<string, number> = { skull: 8, archer: 5, harpoon_fish: 7, shaman: 5, pigronke: 14 };
// _F9_ALLY_DETECT
const DETECT: Record<string, number> = { skull: 3.5, shaman: 7.5, archer: 7.0, harpoon_fish: 6.0, pigronke: 3.8 };
// _F9_MOVE_SPEED base × per-utype multiplier
const BASE_SPEED = 0.86;
const SPEED_MUL: Record<string, number> = { skull: 0.86, shaman: 0.72, archer: 1.0, harpoon_fish: 0.79, pigronke: 0.93 };

const VALID_UTYPES = Object.keys(ATTACK);

// _f9NftStatMul(level): lv0-1 → 1.0×, then +5% every 2 levels from lv2. Caps near 2.0× at lv42+.
function nftStatMul(level: number): number {
  const lv = Math.max(0, level | 0);
  return 1 + Math.floor(Math.max(0, lv - 2) / 2) * 0.05;
}

// Deterministic seeded PRNG (mulberry32) so the sim is reproducible for replays / audits.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isValidUtype(u: string): boolean { return VALID_UTYPES.indexOf(u) !== -1; }

export interface F9WinResult { over: boolean; winner: number; }

export class F9PvpRtsLogic {
  gameTime = 0;
  units: ServerUnit[] = [];
  // Every unit ever spawned (alive + dead), for settlement stats after death (Phase 5).
  allUnits: ServerUnit[] = [];
  cores: ServerCore[] = [];
  coresEnabled = false;
  cols = 20;
  rows = 16;
  events: { onDeath?: (u: ServerUnit) => void; onCoreDeath?: (c: ServerCore) => void } = {};

  private rng: () => number;
  private idCounter = 0;

  constructor(seed: number) { this.rng = mulberry32(seed || 1); }

  // Spawn a player's deck as a vertical column formation on their side of the arena.
  spawnDeck(team: number, deck: F9PvpDeckEntry[]): ServerUnit[] {
    const spawned: ServerUnit[] = [];
    const n = Math.max(1, deck.length);
    const colX = team === 0 ? 2.5 : this.cols - 3.5;
    const span = Math.max(1, this.rows - 3);
    const gap = Math.min(1.2, span / Math.max(1, n));
    const startY = (this.rows - (n - 1) * gap) / 2;
    for (let i = 0; i < deck.length; i++) {
      const e = deck[i];
      const u = this.makeUnit(team, e.utype, e.level | 0, e.tokenId | 0, colX, startY + i * gap);
      this.units.push(u);
      this.allUnits.push(u);
      spawned.push(u);
    }
    return spawned;
  }

  private makeUnit(team: number, utypeRaw: string, level: number, tokenId: number, x: number, y: number): ServerUnit {
    const utype = isValidUtype(utypeRaw) ? utypeRaw : "skull";
    const atk = ATTACK[utype];
    const mul = nftStatMul(level);
    const hp = Math.max(1, Math.round((BASE_HP[utype] || 8) * mul));
    return {
      id: "u" + (++this.idCounter),
      team, utype, tokenId, level,
      x, y, hp, maxHp: hp,
      dmg: Math.max(1, Math.round(atk.dmg * mul)),
      range: atk.range,
      detect: DETECT[utype] || 4,
      speed: BASE_SPEED * (SPEED_MUL[utype] || 1),
      cdMs: atk.cd,
      facing: team === 0 ? 1 : -1,
      dead: false,
      targetId: null,
      lastAttackAt: -1e9,
      mode: "hold",
      cmdX: null, cmdY: null,
      action: "idle",
      kills: 0, dmgDealt: 0, dmgTaken: 0,
    };
  }

  getUnit(id: string): ServerUnit | null {
    for (const u of this.units) if (u.id === id && !u.dead) return u;
    return null;
  }

  // Spawn a destructible core/base for each side (back-center). Win = destroy enemy core.
  spawnCores(hp = 60): ServerCore[] {
    this.coresEnabled = true;
    this.cores = [
      { team: 0, x: 1.0, y: this.rows / 2, hp, maxHp: hp, dead: false },
      { team: 1, x: this.cols - 1.0, y: this.rows / 2, hp, maxHp: hp, dead: false },
    ];
    return this.cores;
  }

  private enemyCore(team: number): ServerCore | null {
    if (!this.coresEnabled) return null;
    for (const c of this.cores) if (c.team !== team && !c.dead) return c;
    return null;
  }

  setCommand(unitIds: string[], type: F9CmdType, x: number, y: number): void {
    for (const id of unitIds) {
      const u = this.getUnit(id);
      if (!u) continue;
      if (type === "stop") { u.mode = "hold"; u.cmdX = null; u.cmdY = null; u.targetId = null; }
      else if (type === "move") { u.mode = "move"; u.cmdX = x; u.cmdY = y; u.targetId = null; }
      else if (type === "amove") { u.mode = "amove"; u.cmdX = x; u.cmdY = y; u.targetId = null; }
    }
  }

  tick(dtSec: number): void {
    this.gameTime += dtSec * 1000;
    this.acquireTargets();
    this.moveAndAttack(dtSec);
    this.cleanupDead();
  }

  private dist(a: ServerUnit, bx: number, by: number): number {
    const dx = bx - a.x, dy = by - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private nearestEnemy(u: ServerUnit, maxRange: number): ServerUnit | null {
    let best: ServerUnit | null = null;
    let bestD = maxRange;
    for (const o of this.units) {
      if (o.dead || o.team === u.team) continue;
      const d = this.dist(u, o.x, o.y);
      if (d <= bestD) { bestD = d; best = o; }
    }
    return best;
  }

  private acquireTargets(): void {
    for (const u of this.units) {
      if (u.dead) continue;
      // "move" mode ignores enemies (pure relocation). hold/amove auto-acquire.
      if (u.mode === "move") { u.targetId = null; continue; }
      // keep current target if still valid (alive + within detect)
      if (u.targetId) {
        const t = this.getUnit(u.targetId);
        if (t && this.dist(u, t.x, t.y) <= u.detect) continue;
        u.targetId = null;
      }
      const enemy = this.nearestEnemy(u, u.detect);
      u.targetId = enemy ? enemy.id : null;
    }
  }

  private moveAndAttack(dtSec: number): void {
    const step = (u: ServerUnit, tx: number, ty: number): boolean => {
      const dx = tx - u.x, dy = ty - u.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const move = u.speed * dtSec;
      if (d <= move || d < 1e-4) { u.x = tx; u.y = ty; return true; }
      u.x += (dx / d) * move;
      u.y += (dy / d) * move;
      if (Math.abs(dx) > 1e-3) u.facing = dx >= 0 ? 1 : -1;
      // clamp to arena
      if (u.x < 0.5) u.x = 0.5; else if (u.x > this.cols - 0.5) u.x = this.cols - 0.5;
      if (u.y < 0.5) u.y = 0.5; else if (u.y > this.rows - 0.5) u.y = this.rows - 0.5;
      return false;
    };

    for (const u of this.units) {
      if (u.dead) continue;
      const target = u.targetId ? this.getUnit(u.targetId) : null;
      if (target) {
        const d = this.dist(u, target.x, target.y);
        u.facing = target.x >= u.x ? 1 : -1;
        if (d <= u.range) {
          u.action = "attacking";
          if (this.gameTime - u.lastAttackAt >= u.cdMs) {
            u.lastAttackAt = this.gameTime;
            this.applyDamage(u, target);
          }
        } else {
          u.action = "moving";
          step(u, target.x, target.y);
        }
        continue;
      }
      // No enemy-unit target. Resolve in priority order:
      // 1) pure "move": relocate to commanded point, ignoring everything else.
      if (u.mode === "move" && u.cmdX != null && u.cmdY != null) {
        const arrived = step(u, u.cmdX, u.cmdY);
        u.action = "moving";
        if (arrived) { u.cmdX = null; u.cmdY = null; u.mode = "hold"; u.action = "idle"; }
        continue;
      }
      // 2) hold / amove: push toward the enemy core (the objective) and attack it.
      const core = this.enemyCore(u.team);
      if (core) {
        const d = Math.sqrt((core.x - u.x) * (core.x - u.x) + (core.y - u.y) * (core.y - u.y));
        u.facing = core.x >= u.x ? 1 : -1;
        if (d <= u.range) {
          u.action = "attacking";
          if (this.gameTime - u.lastAttackAt >= u.cdMs) { u.lastAttackAt = this.gameTime; this.applyCoreDamage(u, core); }
        } else {
          u.action = "moving";
          step(u, core.x, core.y);
        }
        continue;
      }
      // 3) amove with a pending point but no enemy/core left: finish relocating.
      if (u.mode === "amove" && u.cmdX != null && u.cmdY != null) {
        const arrived = step(u, u.cmdX, u.cmdY);
        u.action = "moving";
        if (arrived) { u.cmdX = null; u.cmdY = null; u.action = "idle"; }
        continue;
      }
      u.action = "idle";
    }
  }

  private applyDamage(attacker: ServerUnit, target: ServerUnit): void {
    // v1: fixed damage (dmgMin == dmgMax in F9 tables). rng reserved for future variance/crit.
    const dmg = Math.min(attacker.dmg, target.hp);   // overkill doesn't inflate dmg stats
    target.hp = Math.max(0, target.hp - attacker.dmg);
    attacker.dmgDealt += dmg;
    target.dmgTaken += dmg;
    if (target.hp <= 0 && !target.dead) {
      target.dead = true;
      attacker.kills += 1;
      if (this.events.onDeath) this.events.onDeath(target);
    }
  }

  private applyCoreDamage(attacker: ServerUnit, core: ServerCore): void {
    attacker.dmgDealt += Math.min(attacker.dmg, core.hp);
    core.hp = Math.max(0, core.hp - attacker.dmg);
    if (core.hp <= 0 && !core.dead) {
      core.dead = true;
      if (this.events.onCoreDeath) this.events.onCoreDeath(core);
    }
  }

  private cleanupDead(): void {
    if (this.units.some((u) => u.dead)) {
      this.units = this.units.filter((u) => !u.dead);
    }
  }

  // Per-team + per-unit settlement aggregates (Phase 5). Includes dead units (allUnits).
  matchStats(): {
    team: number;
    kills: number; dmgDealt: number; dmgTaken: number;
    unitsTotal: number; unitsAlive: number;
    survivors: { tokenId: number; utype: string; level: number; kills: number; dmgDealt: number; dmgTaken: number; hp: number; maxHp: number }[];
    deadTokenIds: number[];
  }[] {
    const out = [0, 1].map((team) => ({
      team, kills: 0, dmgDealt: 0, dmgTaken: 0, unitsTotal: 0, unitsAlive: 0,
      survivors: [] as { tokenId: number; utype: string; level: number; kills: number; dmgDealt: number; dmgTaken: number; hp: number; maxHp: number }[],
      deadTokenIds: [] as number[],
    }));
    for (const u of this.allUnits) {
      const t = out[u.team];
      if (!t) continue;
      t.kills += u.kills;
      t.dmgDealt += u.dmgDealt;
      t.dmgTaken += u.dmgTaken;
      t.unitsTotal += 1;
      if (!u.dead) {
        t.unitsAlive += 1;
        t.survivors.push({ tokenId: u.tokenId, utype: u.utype, level: u.level, kills: u.kills, dmgDealt: u.dmgDealt, dmgTaken: u.dmgTaken, hp: u.hp, maxHp: u.maxHp });
      } else if (u.tokenId > 0) {
        t.deadTokenIds.push(u.tokenId);
      }
    }
    return out;
  }

  checkWin(): F9WinResult {
    let t0 = 0, t1 = 0;
    for (const u of this.units) { if (u.team === 0) t0++; else if (u.team === 1) t1++; }
    if (this.units.length === 0 && !this.coresEnabled) return { over: false, winner: -1 };
    // A team is defeated if all its units are dead OR (cores on) its core is destroyed.
    const core0dead = this.coresEnabled && !!this.cores.find((c) => c.team === 0 && c.dead);
    const core1dead = this.coresEnabled && !!this.cores.find((c) => c.team === 1 && c.dead);
    const def0 = t0 === 0 || core0dead;
    const def1 = t1 === 0 || core1dead;
    if (def0 && def1) return { over: true, winner: -1 };
    if (def1) return { over: true, winner: 0 };
    if (def0) return { over: true, winner: 1 };
    return { over: false, winner: -1 };
  }
}
