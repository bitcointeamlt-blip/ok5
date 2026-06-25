import { Room, Client } from "@colyseus/core";
import { F9State, F9Player, F9Unit } from "../schema/F9State";
import { StakeService, Payout, DeathSettle } from "../services/StakeService";
import { permadeathChance, LOCK_DURATION_MS } from "../util/stakes";

// ── F9 PvP room — real-time FFA (iki 4 žaidėjų) RTS squad battle + KotH (authoritative). ──
// FAZA A: lifecycle (join → ready → start → end) + komandų protokolas + judėjimas (30Hz) + KotH zona.
// FAZA B (dabar): pilnas combat/AI port'as iš game.js — detect → engage → position → fire →
//   projektilas → damage → death + win check. Stats = _F9_ALLY_ATTACK/_F9_ALLY_DETECT/_F9_UTYPE_SPEED.
//   AI būsena laikoma atskirame _ai Map'e (neteršia sinchronizuojamo schema). Hit'ai planuojami per
//   sim-laikrodį (_simTime), NE setTimeout → deterministiška + tick-tiksli.
//   Projektilai = lengvi „shot" event'ai klientui (vizualas), žala apskaičiuojama server-authoritative.
// FAZA D (vėliau): įėjimo RONKE fee + self-funding pot payout.
// FAZA E (vėliau): mirties stakes (3d lock / permadeath pagal lvl kreivę — žr. util/stakes.ts).

const ARENA_W = 40;
const ARENA_H = 24;
const SIM_HZ = 30;
const READY_WAIT_MS = 45_000;            // anti-stuck: kiek laukiam ready
const RECONNECT_WINDOW_S = 8;            // disconnect malonės langas
const RETARGET_MS = 300;                  // kas kiek perskaičiuojam taikinius (AI throttle)
const ARRIVE_EPS = 0.05;                  // kada laikom kad pasiekė tx,ty
const SHOT_SPEED_CPS = 10.5;              // projektilo greitis cell/s (=_F9_SHOT_SPEED_CPS game.js)

// ── FFA + KotH ──
const MIN_PLAYERS = 2;                    // mažiausiai start'ui (FFA leidžia 2–4)
const CENTER_X = ARENA_W / 2;             // 20
const CENTER_Y = ARENA_H / 2;             // 12
const CENTER_R = 3.5;                     // KotH zonos spindulys (cells)
const CENTER_RONKE_PER_SEC = 0.5;         // RONKE/sek holderiui (tunable; FAZA D: iš pot)
// 4 kampų spawn zonos (team index 0..3 → {x,y,face}).
// 1v1 duel: team0 kairė-centras, team1 dešinė-centras (head-on, telpa ekrane, kamera kadruoja abu).
// [2]/[3] palikti būsimam 4p FFA (kampai).
const FFA_SPAWNS = [
  { x: 14,          y: CENTER_Y,    face: 1 },
  { x: ARENA_W - 14, y: CENTER_Y,   face: -1 },
  { x: 5,           y: ARENA_H - 5, face: 1 },
  { x: ARENA_W - 6, y: 4,          face: -1 },
];

// Base HP pagal utype — atitinka _F9_BASE_HP game.js.
// PvP BALANSAS (2026-06-24): HP ×~3 — kad nemirtų iš 1-2 hit, kova ilgesnė/intriguojanti.
const BASE_HP: Record<string, number> = {
  skull: 24, archer: 16, harpoon_fish: 20, shaman: 16, pigronke: 40, ghost: 13, ronhood: 20,
};

// Unit-unit separacija (atitinka game.js _F9_SEP_*): kad unitai nesusiliptų į krūvą.
const SEP_RAD: Record<string, number> = { pigronke: 0.46 };
const SEP_DEFAULT = 0.21;   // bazinis personal radius (pora = 0.42)
const SEP_FORCE = 3.2;      // push stiprumas
function sepRad(utype: string): number { return SEP_RAD[utype] || SEP_DEFAULT; }

// Kliūčių (medžiai/akmenys) kolizija — PRIVALO sutapti su f9_pvp_live.js PVP_DECO.
// Medžiai (tree3): rad 0.40, cy = y + 0.39. Akmenys (boulder): rad 0.42, cy = y − 0.20. (game.js _F9_OBSTACLE_CFG)
const UNIT_RAD = 0.22;
// Per-utype kliūčių radius — kad DIDELIO kūno unitai (Hog Rider) nelįstų sprite'u į akmenį/medį.
// Default 0.22 (skull/archer/harpoon/shaman/ronhood/ghost — normalūs sprite). pigronke didesnis (atitinka sep 0.46).
const OBST_RAD: Record<string, number> = { pigronke: 0.40 };
function obstRad(utype: string): number { return OBST_RAD[utype] || UNIT_RAD; }
const PVP_OBSTACLES: { cx: number; cy: number; rad: number }[] = [
  { cx: 4, cy: 3.39, rad: 0.40 },  { cx: 8, cy: 20.39, rad: 0.40 }, { cx: 33, cy: 4.39, rad: 0.40 }, { cx: 36, cy: 19.39, rad: 0.40 },
  { cx: 20, cy: 2.39, rad: 0.40 }, { cx: 19, cy: 22.39, rad: 0.40 }, { cx: 3, cy: 11.39, rad: 0.40 }, { cx: 37, cy: 12.39, rad: 0.40 },
  { cx: 12, cy: 4.80, rad: 0.42 }, { cx: 28, cy: 17.80, rad: 0.42 }, { cx: 13, cy: 18.80, rad: 0.42 }, { cx: 27, cy: 4.80, rad: 0.42 },
  { cx: 20, cy: 6.80, rad: 0.42 }, { cx: 20, cy: 16.80, rad: 0.42 },
];

// ── Combat statai (port'as iš game.js: _F9_ALLY_ATTACK + _F9_ALLY_DETECT + _F9_UTYPE_SPEED). ──
//   range = atakos nuotolis (cells), cd = cooldown (ms), dmgMin/Max = žalos ruožas,
//   detect = aptikimo spindulys, speed = judėjimo greitis (cell/s),
//   fireMs = uždelsimas nuo swing iki hit/fire, melee = ar artimas (range≤1.6).
//   crit = ronhood 1% ×2; shotMul = ghost projektilas lėtesnis (0.45×).
type UStat = {
  range: number; cd: number; dmgMin: number; dmgMax: number;
  detect: number; speed: number; fireMs: number; melee: boolean;
  crit?: number; shotMul?: number;
};
// PvP BALANSAS (2026-06-24): range ↓ (~30%, ranged buvo OP — sniper'ino per visą mapą),
// skull+pigronke speed +20% (judresni melee), detect ↓ proporcingai.
const UTYPE_STATS: Record<string, UStat> = {
  skull:        { range: 0.95, cd: 1500, dmgMin: 2, dmgMax: 2, detect: 3.5, speed: 1.03, fireMs: 250, melee: true },
  archer:       { range: 4.0,  cd: 7000, dmgMin: 3, dmgMax: 3, detect: 5.0, speed: 1.00, fireMs: 450, melee: false },   // range ↓ ronhood; cd ↑ (user: per greit šaudo)
  harpoon_fish: { range: 4.0,  cd: 5000, dmgMin: 3, dmgMax: 3, detect: 5.0, speed: 0.79, fireMs: 450, melee: false },   // cd ↑ (user: per greit šaudo)
  shaman:       { range: 5.0,  cd: 4500, dmgMin: 4, dmgMax: 4, detect: 6.0, speed: 0.72, fireMs: 430, melee: false },   // cd ↑ (user: per greit šaudo)
  ronhood:      { range: 4.0,  cd: 4500, dmgMin: 3, dmgMax: 3, detect: 5.0, speed: 1.00, fireMs: 450, melee: false, crit: 0.01 },
  ghost:        { range: 4.0,  cd: 3000, dmgMin: 3, dmgMax: 5, detect: 5.0, speed: 1.05, fireMs: 393, melee: false, shotMul: 0.45 },  // range ↓ iki ronhood lygio (user); fireMs=GHOST_ATTACK_FIRE_MS (~393, paskutinis atakos kadras)
  pigronke:     { range: 1.18, cd: 2800, dmgMin: 8, dmgMax: 8, detect: 3.8, speed: 1.12, fireMs: 540, melee: true },
};
const MISS_CHANCE = 0.20;   // PvP: 20% miss — kova nebe deterministinė, daugiau intrigos (buvo 0 = visada pataiko)
const statOf = (utype: string): UStat => UTYPE_STATS[utype] || UTYPE_STATS.skull;

// Numatytoji squad'a (free režimas / kai deck nepateiktas) — non-NFT, level 0, be tokenId.
// PO VIENĄ kiekvieno tipo — kad matytųsi visi sprite'ai + animacijos (test/demo).
const DEFAULT_SQUAD = ["skull", "archer", "harpoon_fish", "shaman", "pigronke", "ghost", "ronhood"];
const MAX_DECK = 6;                          // kiek unitų leidžiam iš deko
const VALID_UTYPES = new Set(Object.keys(BASE_HP));
// Žaidėjo deko įrašas (iš join opts.deck).
interface DeckEntry { utype: string; level: number; tokenId: string; }
function sanitizeDeck(raw: any): DeckEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: DeckEntry[] = [];
  for (const e of raw) {
    const utype = String(e && e.utype || "");
    if (!VALID_UTYPES.has(utype)) continue;
    out.push({
      utype,
      level: Math.max(0, Math.min(255, Math.floor(Number(e && e.level) || 0))),
      tokenId: String((e && e.tokenId) || ""),
    });
    if (out.length >= MAX_DECK) break;
  }
  return out;
}

// AI būsena (server-side, NEsinchronizuojama) per unit.
interface AIState {
  order: "move" | "attackmove" | "hold";  // žaidėjo stovinti komanda
  lastAtk: number;                          // paskutinės atakos sim-laikas
  engageId: string;                          // dabartinis taikinys (unit id)
  kills: number;
}

export class F9PvpRoom extends Room<F9State> {
  maxClients = 2;   // 1v1 duel (server-authoritative). 4p FFA = būsimas atskiras režimas.
  private _readyTimer: NodeJS.Timeout | null = null;
  private _uidCounter = 0;
  private _simTime = 0;                                    // monotoninis sim-laikrodis (ms, tik žaidžiant)
  private _lastRetarget = 0;
  private _combatEnabled = true;                            // testų izoliacija: combat:false išjungia kovą
  private _ai = new Map<string, AIState>();
  private _pending: { at: number; fn: () => void }[] = []; // planuoti hit'ai (sim-laikas)
  private _stake = new StakeService();                      // FAZA D/E: on-chain stake/payout/death (NO-OP kol nesukonfig.)
  private _decks = new Map<string, DeckEntry[]>();          // sid → žaidėjo deck (iš join opts.deck)
  private _relay = false;                                    // C3 host-authority: serveris = relay (host kliente sukasi TIKRAS F9)
  private _hostSid = "";                                     // host žaidėjo sessionId (team 0)

  onCreate(options: any) {
    this.setState(new F9State());
    this.state.seed = Math.floor(Math.random() * 1_000_000_000);
    this.state.phase = "lobby";
    this._combatEnabled = options?.combat !== false;       // default ON; testai gali siųsti combat:false
    this._relay = options?.relay === true;                  // C3: host-authority relay režimas (#f9live)
    // #f9live = griežtas 1v1: maxClients=2 → vos 2 viduj, kambarys pilnas/nebejoinable →
    // kitas #f9live atidarymas kuria ŠVIEŽIĄ porą (jokio late-join/zombie-room suporavimo). FFA lieka 4.
    if (this._relay) this.maxClients = 2;
    this.state.entryFee = Math.max(0, Math.min(65535, Math.floor(Number(options?.entryFee) || 0))); // 0 = free
    this.state.pot = 0;
    this.setMetadata({ mode: String(options?.mode || "ffa"), entryFee: this.state.entryFee });

    // ── Komandų protokolas ──
    // Vieninga „cmd" žinutė: { action, ids:[unitId], x, y }.
    this.onMessage("cmd", (client, msg: any) => this._handleCmd(client, msg));
    // Ready toggle.
    this.onMessage("ready", (client) => this._handleReady(client));
    // Ping (klientas matuoja RTT).
    this.onMessage("ping", (client, t: number) => client.send("pong", t));

    // ── C3 host-authority RELAY ──
    // guest komanda → host (host kliente sukasi tikras F9, jis pritaikys).
    this.onMessage("gcmd", (client, msg: any) => {
      if (!this._relay) return;
      const host = this.clients.find((c) => c.sessionId === this._hostSid);
      if (host && host.sessionId !== client.sessionId) host.send("gcmd", { from: client.sessionId, cmd: msg });
    });
    // host būsenos snapshot → visiems guest'ams.
    this.onMessage("hsnap", (client, msg: any) => {
      if (!this._relay || client.sessionId !== this._hostSid) return;
      this.broadcast("hsnap", msg, { except: client });
    });
    // host FX (shot/melee/death) → guest'ams.
    this.onMessage("hfx", (client, msg: any) => {
      if (!this._relay || client.sessionId !== this._hostSid) return;
      this.broadcast("hfx", msg, { except: client });
    });
    // host paskelbia mūšio pabaigą.
    this.onMessage("hend", (client, msg: any) => {
      if (!this._relay || client.sessionId !== this._hostSid) return;
      this._endMatch((msg && msg.winnerSid) || "");
    });

    // 30Hz authoritative simas (game loop).
    this.setSimulationInterval((dt) => this._tick(dt), 1000 / SIM_HZ);
    // patchRate = 50ms (20fps) — Colyseus default; tinka. Klientas PRIVALO interpoliuoti
    // (lerp ~0.2/frame tarp patch'ų), kad judėjimas būtų sklandus prie 60fps render.
    this.setPatchRate(50);
    console.log(`[F9PvpRoom] created (${this.roomId}) seed=${this.state.seed} combat=${this._combatEnabled}`);
  }

  onJoin(client: Client, options: any) {
    const team = this.state.players.size;          // FFA: kiekvienas savo team (0..3)
    const p = new F9Player();
    p.sessionId = client.sessionId;
    p.address = String(options?.address || "");
    p.team = team;
    p.ready = false;
    p.connected = true;
    p.ronkePending = 0;
    this.state.players.set(client.sessionId, p);
    this._decks.set(client.sessionId, sanitizeDeck(options?.deck));   // FAZA E: deck (utype/level/tokenId)
    console.log(`[F9PvpRoom] join ${client.sessionId} team=${team} deck=${this._decks.get(client.sessionId)!.length} (${this.state.players.size}/${this.maxClients})`);

    // FFA: surinkus MIN_PLAYERS — pereinam į ready (žaidėjai ruošiasi) + anti-stuck timeris.
    if (this.state.phase === "lobby" && this.state.players.size >= MIN_PLAYERS) {
      this.state.phase = "ready";
      this.broadcast("enough_joined", { count: this.state.players.size });
      if (this._readyTimer) clearTimeout(this._readyTimer);
      this._readyTimer = setTimeout(() => {
        if (this.state.phase === "ready") this._startMatch();
      }, READY_WAIT_MS);
    }
    if (this.state.players.size === this.maxClients) this.broadcast("room_full", {});
  }

  async onLeave(client: Client, consented: boolean) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;

    // Mūšio metu — leidžiam trumpą reconnect; kitaip žaidėjas iškrinta (forfeit).
    if (this.state.phase === "playing" && !consented) {
      try {
        await this.allowReconnection(client, RECONNECT_WINDOW_S);
        if (p) p.connected = true;
        console.log(`[F9PvpRoom] ${client.sessionId} reconnected`);
        return;
      } catch (_) {
        this._handlePlayerOut(client.sessionId);
        return;
      }
    }
    // Lobby/ready metu — tiesiog pašalinam.
    this.state.players.delete(client.sessionId);
    this._decks.delete(client.sessionId);
    if (this.state.phase === "ready" && this.state.players.size < MIN_PLAYERS) {
      this.state.phase = "lobby";
    }
  }

  onDispose() {
    if (this._readyTimer) clearTimeout(this._readyTimer);
    console.log(`[F9PvpRoom] disposed (${this.roomId})`);
  }

  // ───────────────────────────── lifecycle ─────────────────────────────
  private _handleReady(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (!p || this.state.phase !== "ready") return;
    p.ready = true;
    const all = [...this.state.players.values()];
    if (all.length >= MIN_PLAYERS && all.every((x) => x.ready)) this._startMatch();
  }

  private _startMatch() {
    if (this.state.phase === "playing") return;
    if (this._readyTimer) { clearTimeout(this._readyTimer); this._readyTimer = null; }

    // ── C3 host-authority RELAY: serveris NEspawnina schema unitų — host kliente sukasi tikras F9.
    //    Tik paskelbiam start su host'u + abiejų žaidėjų squad'ais (host spawnins abu lokaliai). ──
    if (this._relay) {
      const players: any[] = [];
      let hostSid = "";
      this.state.players.forEach((p) => {
        if (p.team === 0) hostSid = p.sessionId;
        const deck = this._decks.get(p.sessionId) || [];
        const squad = deck.length ? deck.map((d) => ({ utype: d.utype, level: d.level, tokenId: d.tokenId }))
                                   : DEFAULT_SQUAD.map((u) => ({ utype: u, level: 0, tokenId: "" }));
        players.push({ sessionId: p.sessionId, team: p.team, address: p.address, squad });
      });
      this._hostSid = hostSid || (this.state.players.size ? [...this.state.players.values()][0].sessionId : "");
      try { this.lock(); } catch (_) {}   // užrakinam: jokių vėlyvų prisijungimų į žaidžiantį 1v1 (zombie-room fix)
      this.state.phase = "playing";
      this.state.gameStarted = true;
      this.state.startedAt = Date.now();
      this.broadcast("match_start", { relay: true, host: this._hostSid, players, seed: this.state.seed });
      console.log(`[F9PvpRoom] RELAY match_start host=${this._hostSid} players=${players.length}`);
      return;
    }

    this._simTime = 0;
    this._lastRetarget = 0;
    this._pending = [];
    this._ai.clear();
    // FAZA D: įėjimo mokestis → self-funding pot (off-chain apskaita; on-chain charge per StakeService).
    const fee = this.state.entryFee;
    this.state.pot = 0;
    if (fee > 0) {
      for (const p of this.state.players.values()) {
        p.contributed = fee;
        this.state.pot += fee;
        this._stake.chargeEntry(p.address, fee);   // NO-OP kol nesukonfig.
      }
      console.log(`[F9PvpRoom] staked match: ${this.state.players.size}×${fee} = pot ${this.state.pot} RONKE`);
    }
    // FFA spawn'inam squad'as į kampus pagal team index, vertikaliai išdėstyti.
    // Squad = žaidėjo deck (utype/level/tokenId) arba DEFAULT_SQUAD (non-NFT, level 0).
    for (const p of this.state.players.values()) {
      const sp = FFA_SPAWNS[p.team % FFA_SPAWNS.length];
      const deck = this._decks.get(p.sessionId) || [];
      const squad: DeckEntry[] = deck.length
        ? deck
        : DEFAULT_SQUAD.map((utype) => ({ utype, level: 0, tokenId: "" }));
      const n = squad.length;
      squad.forEach((entry, i) => {
        const u = new F9Unit();
        u.id = `u${++this._uidCounter}`;
        u.owner = p.sessionId;
        u.team = p.team;
        u.utype = entry.utype;
        u.level = entry.level;
        u.tokenId = entry.tokenId;
        const gap = 1.3;
        u.x = sp.x;
        u.y = Math.max(1, Math.min(ARENA_H - 1, sp.y - (n - 1) * gap / 2 + i * gap));
        u.tx = u.x; u.ty = u.y;
        u.hp = u.maxHp = BASE_HP[entry.utype] || 8;   // TODO(polish): level stat scaling (+5%/lvl, žr. ALLY_STATS)
        u.faceDx = sp.face;
        u.alive = true;
        u.cmd = "idle";
        this.state.units.set(u.id, u);
        this._ai.set(u.id, { order: "hold", lastAtk: 0, engageId: "", kills: 0 });
      });
    }
    try { this.lock(); } catch (_) {}   // 1v1 prasidėjo → jokių vėlyvų prisijungimų (švarus pairing)
    this.state.phase = "playing";
    this.state.gameStarted = true;
    this.state.startedAt = Date.now();
    this.broadcast("match_start", { startedAt: this.state.startedAt, seed: this.state.seed });
    console.log(`[F9PvpRoom] match_start (server-auth) — ${this.state.players.size}p, ${this.state.units.size} units`);
  }

  // Žaidėjas iškrito (disconnect/forfeit). FFA: jo unitai miršta; jei lieka ≤1 žaidėjas — mūšis baigtas.
  private _handlePlayerOut(sid: string) {
    // C3 relay: nėra schema unitų — likęs žaidėjas laimi (forfeit).
    if (this._relay) {
      let winnerSid = "";
      this.state.players.forEach((p) => { if (p.sessionId !== sid) winnerSid = p.sessionId; });
      this._endMatch(winnerSid);
      return;
    }
    // FAZA E: čia mirusiems unitams eis lock/permadeath settlement.
    this.state.units.forEach((u) => { if (u.owner === sid) u.alive = false; });
    this._checkWin();
  }

  // FFA win: lieka tik vienas team su gyvais unitais → jis laimi (arba 0 → lygiosios).
  private _checkWin() {
    if (this.state.phase !== "playing") return;
    const aliveTeams = new Set<number>();
    this.state.units.forEach((u) => { if (u.alive) aliveTeams.add(u.team); });
    if (aliveTeams.size <= 1) {
      const winTeam = aliveTeams.size === 1 ? [...aliveTeams][0] : -1;
      let winnerSid = "";
      if (winTeam >= 0) this.state.players.forEach((p) => { if (p.team === winTeam) winnerSid = p.sessionId; });
      this._endMatch(winnerSid);
    }
  }

  private _endMatch(winnerSid: string) {
    if (this.state.phase === "ended") return;
    this.state.phase = "ended";
    this.state.gameStarted = false;
    this.state.winnerSid = winnerSid;

    // FAZA D settlement: staked režime nugalėtojas pasiima likusį pot (KotH drip jau išdalintas play metu).
    if (this.state.entryFee > 0 && winnerSid) {
      const w = this.state.players.get(winnerSid);
      if (w) { w.ronkePending += this.state.pot; this.state.pot = 0; }
    }

    // Payout summary (ronkePending = KotH drip + pergalės likutis) + on-chain settle (NO-OP kol nesukonfig.).
    const payouts: Payout[] = [];
    const players: any[] = [];
    let winnerTeam = -1;
    this.state.players.forEach((p) => {
      if (p.sessionId === winnerSid) winnerTeam = p.team;
      const survivors = [...this.state.units.values()].filter((u) => u.owner === p.sessionId && u.alive).length;
      let kills = 0;
      this._ai.forEach((ai, id) => { const u = this.state.units.get(id); if (u && u.owner === p.sessionId) kills += ai.kills; });
      if (p.ronkePending > 0) payouts.push({ address: p.address, amount: p.ronkePending, sessionId: p.sessionId });
      players.push({ sessionId: p.sessionId, team: p.team, address: p.address,
                     contributed: p.contributed, earned: p.ronkePending, kills, survivors });
    });
    if (this.state.entryFee > 0) this._stake.settle(payouts);

    // ── FAZA E: mirties stakes — tik staked režime, tik realiems NFT (tokenId set). ──
    // Kiekvienam mirusiam NFT: permadeathChance(level) → burn (visam) arba 3d lock.
    // OFF-CHAIN sprendimas + summary; realus on-chain burn/lock = _stake.settleDeaths (NO-OP kol nesukonfig.).
    const deaths: DeathSettle[] = [];
    if (this.state.entryFee > 0) {
      const nowMs = Date.now();
      this.state.units.forEach((u) => {
        if (u.alive || !u.tokenId) return;                 // tik mirę realūs NFT
        const burned = Math.random() < permadeathChance(u.level);
        deaths.push({
          tokenId: u.tokenId, owner: u.owner, utype: u.utype, level: u.level,
          outcome: burned ? "burn" : "lock",
          lockUntil: burned ? 0 : nowMs + LOCK_DURATION_MS,
        });
      });
      if (deaths.length) this._stake.settleDeaths(deaths);
    }

    this.broadcast("match_end", { winnerSid, winnerTeam });
    this.broadcast("match_result", { winnerSid, winnerTeam, entryFee: this.state.entryFee, players, deaths, reason: "wipe" });
    console.log(`[F9PvpRoom] match_end winner=${winnerSid || "(draw)"} pot_left=${this.state.pot.toFixed(2)} payouts=${payouts.length} deaths=${deaths.length}`);
  }

  // ───────────────────────────── commands ─────────────────────────────
  private _handleCmd(client: Client, msg: any) {
    if (this.state.phase !== "playing") return;
    const action = String(msg?.action || "");
    const ids: string[] = Array.isArray(msg?.ids) ? msg.ids.map(String) : [];
    const x = Math.max(0, Math.min(ARENA_W, Number(msg?.x)));
    const y = Math.max(0, Math.min(ARENA_H, Number(msg?.y)));
    const targetId = String(msg?.targetId || "");

    // Surenkam galiojančius (savo gyvus) unitus.
    const valid: { u: F9Unit; ai: AIState }[] = [];
    for (const id of ids) {
      const u = this.state.units.get(id);
      const ai = this._ai.get(id);
      if (!u || !ai || !u.alive || u.owner !== client.sessionId) continue;   // tik savo gyvus unitus
      valid.push({ u, ai });
    }
    if (!valid.length) return;

    // FORMACIJA (move/attackmove): grupė juda IŠLAIKYDAMA formą — kiekvienas į taikinį + offset nuo
    // grupės centroido (RTS standartas; kitaip visi suplaukia į vieną tašką ir susigrūda į krūvą).
    let cX = 0, cY = 0;
    for (const v of valid) { cX += v.u.x; cY += v.u.y; }
    cX /= valid.length; cY /= valid.length;

    for (const { u, ai } of valid) {
      if (action === "move" || action === "attackmove") {
        const utx = Math.max(0.2, Math.min(ARENA_W - 1.2, x + (u.x - cX)));
        const uty = Math.max(0.2, Math.min(ARENA_H - 1.2, y + (u.y - cY)));
        u.tx = utx; u.ty = uty; u.cmd = action; u.targetId = "";
        ai.order = action; ai.engageId = "";
      } else if (action === "attack") {
        // FOCUS-FIRE: pulti SPECIFINĮ priešo unitą (sticky engageId — vejamasi kol taikinys gyvas).
        const tgt = targetId ? this.state.units.get(targetId) : undefined;
        if (tgt && tgt.alive && tgt.team !== u.team) {
          u.cmd = "attackmove"; u.targetId = targetId;
          u.tx = tgt.x; u.ty = tgt.y;
          ai.order = "attackmove"; ai.engageId = targetId;
        }
      } else if (action === "stop") {
        u.tx = u.x; u.ty = u.y; u.cmd = "idle"; u.targetId = "";
        ai.order = "hold"; ai.engageId = "";
      }
    }
  }

  // ───────────────────────────── simulation ─────────────────────────────
  private _tick(dtMs: number) {
    if (this._relay) return;          // host-authority: simą sukasi host kliente, serveris tik relay'ina
    if (this.state.phase !== "playing") return;
    this._simTime += dtMs;
    this.state.serverTime = Date.now();   // tik žaidžiant — wall-clock interpoliacijai
    const dt = dtMs / 1000;

    // 1. Taikinių perskaičiavimas (throttled).
    if (this._combatEnabled && this._simTime - this._lastRetarget >= RETARGET_MS) {
      this._lastRetarget = this._simTime;
      this._retargetAll();
    }
    // 2. Pozicionavimas + judėjimas + ataka (kiekvienam unitui).
    this.state.units.forEach((u) => { if (u.alive) this._stepUnit(u, dt); });
    // 2b. Unit-unit separacija — kad unitai NEsusiliptų į vieną krūvą (port iš game.js _applyF9Separation).
    this._separate(dt);
    // 2c. Kliūčių (medžiai/akmenys) push-out — unitai neperaina kiaurai (port iš game.js _f9PushOutObstacles).
    this.state.units.forEach((u) => { if (u.alive) this._pushOutObstacles(u); });
    // 3. Planuoti hit'ai (žala apskaičiuojama suplanuotu sim-laiku).
    this._processPending();
    // 4. KotH centras.
    this._updateCenter(dt);
  }

  // Unit-unit separacija: poromis stumiam persidengiančius (port iš game.js _applyF9Separation).
  // Ghost praeina kiaurai. Kovoje (cmd=attack) silpniau (×0.5), kad nestutter'intų.
  private _separate(dtSec: number) {
    const units: F9Unit[] = [];
    this.state.units.forEach((u) => { if (u.alive && u.utype !== "ghost") units.push(u); });
    const n = units.length;
    if (n < 2) return;
    const px = new Array<number>(n).fill(0);
    const py = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      const a = units[i];
      for (let j = i + 1; j < n; j++) {
        const b = units[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        const minD = sepRad(a.utype) + sepRad(b.utype);
        if (dist >= minD) continue;
        if (dist < 0.001) { const ang = Math.random() * Math.PI * 2; dx = Math.cos(ang); dy = Math.sin(ang); dist = 1; }
        const overlap = (minD - dist) / minD;
        const nx = dx / dist, ny = dy / dist;
        px[i] += nx * overlap; py[i] += ny * overlap;
        px[j] -= nx * overlap; py[j] -= ny * overlap;
      }
    }
    for (let i = 0; i < n; i++) {
      if (px[i] === 0 && py[i] === 0) continue;
      const a = units[i];
      const scale = a.cmd === "attack" ? 0.5 : 1;
      a.x = Math.max(0.2, Math.min(ARENA_W - 1.2, a.x + px[i] * SEP_FORCE * dtSec * scale));
      a.y = Math.max(0.2, Math.min(ARENA_H - 1.2, a.y + py[i] * SEP_FORCE * dtSec * scale));
    }
  }

  // Kliūčių push-out: radialiai išstumia unitą iš medžių/akmenų apskritimų (port iš game.js _f9PushOutObstacles).
  private _pushOutObstacles(u: F9Unit) {
    for (const o of PVP_OBSTACLES) {
      let dx = u.x - o.cx, dy = u.y - o.cy;
      let d = Math.sqrt(dx * dx + dy * dy);
      const minD = o.rad + obstRad(u.utype);
      if (d < minD) {
        if (d < 0.0001) { dx = 0; dy = -1; d = 1; }
        u.x = o.cx + (dx / d) * minD;
        u.y = o.cy + (dy / d) * minD;
      }
    }
  }

  // Priešų aptikimas — artimiausias gyvas kito team unitas spinduliu r.
  private _findEnemyNear(u: F9Unit, r: number): F9Unit | null {
    let best: F9Unit | null = null, bestD = r;
    this.state.units.forEach((e) => {
      if (!e.alive || e.team === u.team || e.id === u.id) return;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }

  // Kiekvienam unitui — įsigyti/atnaujinti taikinį pagal komandą.
  private _retargetAll() {
    this.state.units.forEach((u) => {
      if (!u.alive) return;
      const ai = this._ai.get(u.id);
      if (!ai) return;
      if (ai.order === "move") { ai.engageId = ""; return; }   // grynas move ignoruoja priešus
      // Laikom galiojantį taikinį (sticky kol gyvas).
      const cur = ai.engageId ? this.state.units.get(ai.engageId) : undefined;
      if (cur && cur.alive && cur.team !== u.team) return;
      // Įsigyjam artimiausią priešą detect spinduliu.
      const st = statOf(u.utype);
      const e = this._findEnemyNear(u, st.detect);
      ai.engageId = e ? e.id : "";
    });
  }

  private _stepUnit(u: F9Unit, dt: number) {
    const ai = this._ai.get(u.id);
    if (!ai) return;
    const st = statOf(u.utype);

    // Aktyvus taikinys?
    let tgt: F9Unit | undefined = ai.engageId ? this.state.units.get(ai.engageId) : undefined;
    if (tgt && (!tgt.alive || tgt.team === u.team)) { tgt = undefined; ai.engageId = ""; }

    if (this._combatEnabled && tgt) {
      const dx = tgt.x - u.x, dy = tgt.y - u.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      if (dist <= st.range) {
        // Nuotolyje: stovim, žiūrim į taikinį, atakuojam.
        u.cmd = "attack"; u.targetId = tgt.id;
        u.faceDx = dx >= 0 ? 1 : -1;
        this._tryAttack(u, tgt, st);
      } else {
        // Per toli: einam į poziciją (melee — arti; ranged — laikom nuotolį).
        const desired = st.melee ? Math.max(0.6, st.range * 0.85) : Math.max(0.5, st.range - 0.5);
        const gx = tgt.x - (dx / dist) * desired;
        const gy = tgt.y - (dy / dist) * desired;
        this._moveToward(u, gx, gy, st.speed, dt);
        u.cmd = "attackmove"; u.targetId = tgt.id;
      }
      return;
    }

    // Be taikinio — vykdom komandą.
    if (ai.order === "move" || ai.order === "attackmove") {
      const dx = u.tx - u.x, dy = u.ty - u.y;
      if (Math.hypot(dx, dy) < ARRIVE_EPS) {
        u.x = u.tx; u.y = u.ty; u.cmd = "idle"; u.targetId = "";
        ai.order = "hold";
      } else {
        this._moveToward(u, u.tx, u.ty, st.speed, dt);
        u.cmd = ai.order;
      }
    } else {
      u.cmd = "idle"; u.targetId = "";
    }
  }

  // Judėjimas link (gx,gy) per dt su greičiu speed (cell/s). Keičia tik x/y (NE tx/ty —
  // kad po taikinio mirties attack-move tęstų į pradinę destinaciją).
  private _moveToward(u: F9Unit, gx: number, gy: number, speed: number, dt: number) {
    const dx = gx - u.x, dy = gy - u.y;
    const d = Math.hypot(dx, dy);
    const step = speed * dt;
    if (d <= step || d < 0.001) { u.x = gx; u.y = gy; }
    else {
      u.x += (dx / d) * step;
      u.y += (dy / d) * step;
      u.faceDx = dx >= 0 ? 1 : -1;
    }
    if (u.x < 0) u.x = 0; else if (u.x > ARENA_W) u.x = ARENA_W;
    if (u.y < 0) u.y = 0; else if (u.y > ARENA_H) u.y = ARENA_H;
  }

  // Atakos paleidimas (cooldown gated). Melee → hit po fireMs; ranged → fire po fireMs, tada
  // projektilas keliauja dist/SHOT_SPEED, impact metu — žala. Žala server-authoritative;
  // klientui siunčiam lengvą „melee"/„shot" event'ą vizualui.
  private _tryAttack(u: F9Unit, tgt: F9Unit, st: UStat) {
    const ai = this._ai.get(u.id);
    if (!ai) return;
    if (this._simTime - ai.lastAtk < st.cd) return;
    ai.lastAtk = this._simTime;
    const attackerId = u.id;

    if (st.melee) {
      this.broadcast("melee", { id: u.id, utype: u.utype, toId: tgt.id, fireMs: st.fireMs });
      if (u.utype === "pigronke") {
        // HOG RIDER AOE — žala VISIEMS priešams priekiniame kūgyje (ellipse + fallback circle).
        // Port iš game.js _pigronkeSpearAttack (aoeRange=range+0.15, aoeWidthY=0.65, zone RX/RY ×0.65/0.95).
        const faceDx = u.faceDx >= 0 ? 1 : -1;
        this._schedule(this._simTime + st.fireMs, () => {
          const a = this.state.units.get(attackerId);
          if (!a || !a.alive) return;
          const sx = a.x, sy = a.y;
          const aoeRange = st.range + 0.15, aoeWidthY = 0.65;
          const zoneCx = sx + faceDx * aoeRange * 0.5;
          const zoneRX = aoeRange * 0.65, zoneRY = aoeWidthY * 0.95, fallbackR = aoeRange * 0.65;
          this.state.units.forEach((en) => {
            if (!en.alive || en.team === a.team) return;   // tik priešai (ne savi)
            const ndx = (en.x - zoneCx) / zoneRX, ndy = (en.y - sy) / zoneRY;
            const inEllipse = (ndx * ndx + ndy * ndy <= 1.0);
            const fwd = (en.x - sx) * faceDx;
            const inCircle = fwd > -0.12 && (Math.hypot(en.x - sx, en.y - sy) <= fallbackR);
            if (!inEllipse && !inCircle) return;
            if (Math.random() < MISS_CHANCE) { this.broadcast("miss", { id: en.id, x: en.x, y: en.y }); return; }
            this._dealDmg(en, this._rollDmg(st), a);
          });
        });
        return;
      }
      const dmg = this._rollDmg(st);
      this._schedule(this._simTime + st.fireMs, () => {
        const a = this.state.units.get(attackerId);
        const t = this.state.units.get(tgt.id);
        if (!a || !a.alive || !t || !t.alive) return;
        if (Math.hypot(t.x - a.x, t.y - a.y) > st.range + 0.3) return;
        if (Math.random() < MISS_CHANCE) { this.broadcast("miss", { id: t.id, x: t.x, y: t.y }); return; }
        this._dealDmg(t, dmg, a);
      });
    } else {
      // RANGED: 'shot' broadcast IŠŠOVIMO PRADŽIOJ (t0) su fireMs+travel → klientas daro pilną seką
      // (windup anim → po fireMs projektilas → travel), kad ETAPAI būtų sklandūs IR projektilas nukristų
      // BŪTENT kai serveris pritaiko žalą (fireMs+travel). (Anksčiau shot ėjo po fireMs → windup/iššovimo tarpas.)
      const shotId = tgt.id;
      const dist = Math.hypot(tgt.x - u.x, tgt.y - u.y);
      const cps = SHOT_SPEED_CPS * (st.shotMul || 1);
      const travel = Math.max(150, (dist / cps) * 1000);
      const dmg = this._rollDmg(st);
      this.broadcast("shot", { fromId: u.id, toId: shotId, utype: u.utype, fireMs: st.fireMs, durMs: Math.round(travel) });
      this._schedule(this._simTime + st.fireMs + travel, () => {
        const t2 = this.state.units.get(shotId);
        const a2 = this.state.units.get(attackerId);
        if (!t2 || !t2.alive) return;
        if (Math.random() < MISS_CHANCE) { this.broadcast("miss", { id: t2.id, x: t2.x, y: t2.y }); return; }
        this._dealDmg(t2, dmg, a2 || undefined);
      });
    }
  }

  private _rollDmg(st: UStat): number {
    let d = st.dmgMin + Math.floor(Math.random() * (st.dmgMax - st.dmgMin + 1));
    if (st.crit && Math.random() < st.crit) d *= 2;   // ronhood 1% ×2
    return Math.max(1, d);
  }

  private _dealDmg(tgt: F9Unit, dmg: number, attacker?: F9Unit) {
    if (!tgt.alive) return;
    tgt.hp = Math.max(0, tgt.hp - dmg);
    this.broadcast("hit", { id: tgt.id, dmg, by: attacker ? attacker.id : "" });
    // Atsakomoji ugnis: jei taikinys be taikinio ir laikosi/idle — atsisuka į puolėją.
    const tai = this._ai.get(tgt.id);
    if (tgt.hp > 0 && attacker && attacker.alive && tai && tai.order !== "move" && !tai.engageId) {
      tai.engageId = attacker.id;
    }
    if (tgt.hp <= 0) {
      tgt.alive = false;
      tgt.cmd = "idle"; tgt.targetId = "";
      if (attacker) { const aai = this._ai.get(attacker.id); if (aai) aai.kills++; }
      this.broadcast("died", { id: tgt.id, by: attacker ? attacker.id : "" });
      this._checkWin();
    }
  }

  private _schedule(at: number, fn: () => void) { this._pending.push({ at, fn }); }
  private _processPending() {
    if (this._pending.length === 0) return;
    const now = this._simTime;
    const ready = this._pending.filter((p) => p.at <= now);
    if (ready.length === 0) return;
    this._pending = this._pending.filter((p) => p.at > now);
    for (const p of ready) { try { p.fn(); } catch (_) { /* swallow */ } }
  }

  // KotH: jei vienintelis team turi gyvą unitą centro zonoje — tam žaidėjui laša RONKE.
  // Jei 2+ team viduj — ginčijama, niekam neskaičiuoja. Jei tuščia — niekas nevaldo.
  private _updateCenter(dt: number) {
    let mask = 0, lastTeam = -1;
    this.state.units.forEach((u) => {
      if (!u.alive) return;
      const dx = u.x - CENTER_X, dy = u.y - CENTER_Y;
      if (dx * dx + dy * dy <= CENTER_R * CENTER_R) { mask |= (1 << u.team); lastTeam = u.team; }
    });
    const inside = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
    const contested = inside > 1;
    if (this.state.centerContested !== contested) this.state.centerContested = contested;

    let holderSid = "";
    if (inside === 1) {
      this.state.players.forEach((p) => { if (p.team === lastTeam) holderSid = p.sessionId; });
      const holder = holderSid ? this.state.players.get(holderSid) : undefined;
      if (holder) {
        let drip = CENTER_RONKE_PER_SEC * dt;
        if (this.state.entryFee > 0) {           // staked: laša IŠ pot (zero inflation)
          drip = Math.min(this.state.pot, drip);
          this.state.pot -= drip;
        }
        holder.ronkePending += drip;             // free režime drip = inflacinis (kaip anksčiau)
      }
    }
    if (this.state.centerHolderSid !== holderSid) this.state.centerHolderSid = holderSid;
  }
}
