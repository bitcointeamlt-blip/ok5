// F9 PvP — real-time 1v1 RTS room (server-authoritative).
// ISOLATED: brand-new room. The ONLY change to existing code is one additive
// gameServer.define("f9pvp_room", F9PvpRoom) line in app.config.ts.
//
// Flow: 2 players join (one per team/side) → both ready (or 2s auto-start) → server spawns
// each deck → 30Hz authoritative sim → win when one team's units are wiped → match_end.
import { Room, Client } from "@colyseus/core";
import { F9PvpState, F9PvpPlayer, F9PvpUnit, F9PvpCore } from "../schema/F9PvpState";
import { F9PvpRtsLogic, isValidUtype, type F9PvpDeckEntry, type ServerUnit, type ServerCore, type F9CmdType } from "../game/F9PvpRtsLogic";
import { buildMatchResult, postSettlement, verifyDeckOnChain, type F9PvpPlayerMeta } from "../game/F9PvpSettlement";

const SIM_HZ = 30;
const SIM_MS = Math.floor(1000 / SIM_HZ);
const AUTO_START_MS = 2000;     // start anyway 2s after 2nd join (testing convenience)
const MAX_DECK = 30;
const GAMEOVER_DISPOSE_MS = 8000;

export class F9PvpRoom extends Room<F9PvpState> {
  maxClients = 2;

  private logic!: F9PvpRtsLogic;
  private decks = new Map<string, F9PvpDeckEntry[]>();
  private deckVerified = new Map<string, boolean>();   // sessionId -> on-chain deck verified? (Phase 5)
  private started = false;
  private ended = false;
  private coresEnabled = true;
  private startTimer: { clear: () => void } | null = null;

  onCreate(options: any): void {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    this.coresEnabled = options?.cores !== false;   // cores/objective on by default
    const state = new F9PvpState();
    state.seed = seed;
    state.phase = "lobby";
    this.setState(state);

    this.logic = new F9PvpRtsLogic(seed);
    this.logic.cols = state.cols;
    this.logic.rows = state.rows;
    this.logic.events.onDeath = (u) => this.onUnitDeath(u);
    this.logic.events.onCoreDeath = (c) => this.onCoreDeath(c);

    this.onMessage("f9pvp_ready", (client) => this.handleReady(client));
    this.onMessage("f9pvp_cmd", (client, msg) => this.handleCommand(client, msg));

    this.setPatchRate(SIM_MS);
    this.setSimulationInterval(() => this.tick(), SIM_MS);
    console.log(`[F9PvpRoom] created ${this.roomId} seed=${seed}`);
  }

  onJoin(client: Client, options: any): void {
    if (this.state.players.size >= 2) { client.leave(); return; }
    const team = this.state.players.size === 0 ? 0 : 1;

    const p = new F9PvpPlayer();
    p.sessionId = client.sessionId;
    p.address = String(options?.address || "").toLowerCase();
    p.team = team;
    p.ready = false;
    p.connected = true;
    this.state.players.set(client.sessionId, p);

    const deck = this.sanitizeDeck(options?.deck);
    this.decks.set(client.sessionId, deck);
    this.deckVerified.set(client.sessionId, false);
    // Phase 5 anti-cheat: optional on-chain deck verification. Non-blocking — a match never
    // waits on it, and with no verifier configured it stays the v1 trust-client behaviour.
    void verifyDeckOnChain(p.address, deck).then((v) => {
      this.deckVerified.set(client.sessionId, v.verified);
      if (v.error) console.log(`[F9PvpRoom] deck verify ${client.sessionId}: ${v.error}`);
    }).catch(() => { /* never throws, but be safe */ });
    console.log(`[F9PvpRoom] join ${client.sessionId} team=${team}`);

    if (this.state.players.size === 2) {
      this.state.phase = "ready";
      this.broadcast("f9pvp_match_ready", {});
      this.startTimer = this.clock.setTimeout(() => this.startMatch(), AUTO_START_MS);
    }
  }

  onLeave(client: Client, _consented: boolean): void {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;
    this.broadcast("f9pvp_player_left", { sessionId: client.sessionId });

    // If a match is in progress, the remaining player wins by forfeit.
    if (this.started && !this.ended) {
      let remaining = -1;
      for (const [sid, pl] of this.state.players) {
        if (sid !== client.sessionId && pl.connected) remaining = pl.team;
      }
      this.endMatch(remaining, "player_left");
    }
    this.state.players.delete(client.sessionId);
    this.decks.delete(client.sessionId);
    this.deckVerified.delete(client.sessionId);
  }

  // ── lobby / start ─────────────────────────────────────────────
  private handleReady(client: Client): void {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.ready = true;
    let allReady = this.state.players.size === 2;
    for (const [, pl] of this.state.players) if (!pl.ready) allReady = false;
    if (allReady) this.startMatch();
  }

  private startMatch(): void {
    if (this.started) return;
    this.started = true;
    if (this.startTimer) { this.startTimer.clear(); this.startTimer = null; }

    for (const [sid, p] of this.state.players) {
      const deck = this.decks.get(sid);
      const useDeck = deck && deck.length ? deck : this.defaultDeck();
      const spawned = this.logic.spawnDeck(p.team, useDeck);
      for (const u of spawned) this.addUnitSchema(u);
    }
    if (this.coresEnabled) {
      const cores = this.logic.spawnCores();
      for (const c of cores) this.addCoreSchema(c);
    }
    this.state.phase = "playing";
    this.broadcast("f9pvp_game_start", { seed: this.state.seed });
    this.lock();
    console.log(`[F9PvpRoom] match started units=${this.logic.units.length}`);
  }

  // ── sim tick + state sync ─────────────────────────────────────
  private tick(): void {
    if (this.state.phase !== "playing" || this.ended) return;
    this.logic.tick(1 / SIM_HZ);
    this.state.gameTime = this.logic.gameTime;

    const liveIds = new Set<string>();
    for (const u of this.logic.units) {
      liveIds.add(u.id);
      let su = this.state.units.get(u.id);
      if (!su) { this.addUnitSchema(u); su = this.state.units.get(u.id)!; }
      su.x = u.x; su.y = u.y; su.hp = u.hp; su.facing = u.facing; su.action = u.action;
    }
    for (const id of Array.from(this.state.units.keys())) {
      if (!liveIds.has(id)) this.state.units.delete(id);
    }

    // sync cores
    for (const c of this.logic.cores) {
      const sc = this.state.cores.get("core" + c.team);
      if (sc) { sc.hp = c.hp; sc.active = !c.dead; }
    }

    const alive = [0, 0];
    for (const u of this.logic.units) alive[u.team] = (alive[u.team] || 0) + 1;
    for (const [, p] of this.state.players) p.unitsAlive = alive[p.team] || 0;

    const res = this.logic.checkWin();
    if (res.over) this.endMatch(res.winner, "wipe");
  }

  private addUnitSchema(u: ServerUnit): void {
    const su = new F9PvpUnit();
    su.id = u.id;
    su.team = u.team;
    su.utype = u.utype;
    su.tokenId = u.tokenId;
    su.level = u.level;
    su.x = u.x; su.y = u.y;
    su.hp = u.hp; su.maxHp = u.maxHp;
    su.facing = u.facing;
    su.action = u.action;
    this.state.units.set(u.id, su);
  }

  private addCoreSchema(c: ServerCore): void {
    const sc = new F9PvpCore();
    sc.team = c.team;
    sc.x = c.x; sc.y = c.y;
    sc.hp = c.hp; sc.maxHp = c.maxHp;
    sc.active = !c.dead;
    this.state.cores.set("core" + c.team, sc);
  }

  private onUnitDeath(u: ServerUnit): void {
    this.broadcast("f9pvp_unit_died", { id: u.id, x: u.x, y: u.y, team: u.team, utype: u.utype });
  }

  private onCoreDeath(c: ServerCore): void {
    this.broadcast("f9pvp_core_destroyed", { team: c.team, x: c.x, y: c.y });
  }

  private endMatch(winnerTeam: number, reason: string): void {
    if (this.ended) return;
    this.ended = true;
    this.state.phase = "gameover";
    this.state.winnerTeam = winnerTeam;
    this.broadcast("f9pvp_match_end", { winnerTeam, reason });
    console.log(`[F9PvpRoom] match end winner=${winnerTeam} reason=${reason}`);

    // ── Phase 5: settlement summary (XP preview / provisional ELO / survivors) ──
    // Server-authoritative, built from the sim's own kill/damage accounting. Broadcast to
    // both clients for the result screen; best-effort POST to an optional settlement backend.
    try {
      const teamBySession = new Map<string, number>();
      for (const [sid, p] of this.state.players) teamBySession.set(sid, p.team);
      const players: F9PvpPlayerMeta[] = [];
      for (const [sid, p] of this.state.players) {
        players.push({ team: p.team, address: p.address, eloBefore: 1000, deckVerified: !!this.deckVerified.get(sid) });
      }
      // Ensure both teams represented even if a player already left (forfeit).
      for (const team of [0, 1]) {
        if (!players.some((pl) => pl.team === team)) players.push({ team, address: "", eloBefore: 1000, deckVerified: false });
      }
      const result = buildMatchResult({
        seed: this.state.seed,
        winnerTeam, reason,
        durationMs: Math.round(this.logic.gameTime),
        endedAt: Date.now(),
        cols: this.state.cols, rows: this.state.rows,
        teamStats: this.logic.matchStats(),
        players,
      });
      this.broadcast("f9pvp_match_result", result);
      void postSettlement(result).then((r) => {
        if (r.ok) console.log(`[F9PvpRoom] settlement posted match=${result.matchId} status=${r.status}`);
        else if (r.error !== "no_settle_url") console.log(`[F9PvpRoom] settlement post failed: ${r.error}`);
      }).catch(() => { /* never throws */ });
    } catch (e: any) {
      console.log(`[F9PvpRoom] settlement build failed (non-fatal): ${String(e?.message || e).slice(0, 160)}`);
    }

    this.clock.setTimeout(() => { try { this.disconnect(); } catch (_) { /* noop */ } }, GAMEOVER_DISPOSE_MS);
  }

  // ── command input (server validates ownership) ────────────────
  private handleCommand(client: Client, msg: any): void {
    if (this.state.phase !== "playing") return;
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const type = msg?.type as F9CmdType;
    if (type !== "move" && type !== "amove" && type !== "stop") return;
    const ids = Array.isArray(msg?.unitIds) ? msg.unitIds.map(String) : [];
    if (!ids.length) return;
    // Ownership: only command your own team's units.
    const owned = ids.filter((id: string) => {
      const u = this.logic.getUnit(id);
      return !!u && u.team === p.team;
    });
    if (!owned.length) return;
    const x = Math.max(0, Math.min(this.state.cols, Number(msg?.x) || 0));
    const y = Math.max(0, Math.min(this.state.rows, Number(msg?.y) || 0));
    this.logic.setCommand(owned, type, x, y);
  }

  // ── deck helpers ──────────────────────────────────────────────
  private sanitizeDeck(raw: any): F9PvpDeckEntry[] {
    if (!Array.isArray(raw)) return [];
    const out: F9PvpDeckEntry[] = [];
    for (const e of raw) {
      if (out.length >= MAX_DECK) break;
      const utype = String(e?.utype || "");
      if (!isValidUtype(utype)) continue;
      out.push({ utype, level: Math.max(0, Math.min(255, Number(e?.level) || 0)), tokenId: Math.max(0, Number(e?.tokenId) || 0) });
    }
    // TODO (anti-cheat, later phase): verify deck on-chain (ownerOf + getDeck) like ronke-power,
    // instead of trusting client-supplied utype/level.
    return out;
  }

  private defaultDeck(): F9PvpDeckEntry[] {
    return [
      { utype: "skull", level: 1, tokenId: 0 },
      { utype: "skull", level: 1, tokenId: 0 },
      { utype: "skull", level: 1, tokenId: 0 },
      { utype: "archer", level: 1, tokenId: 0 },
      { utype: "archer", level: 1, tokenId: 0 },
    ];
  }
}
