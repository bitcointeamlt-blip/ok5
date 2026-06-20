// F9 PvP — settlement (Phase 5). ISOLATED + dependency-light (uses global fetch only).
//
// Responsibilities:
//   1. buildMatchResult()  — assemble a deterministic, server-authoritative match summary
//      (winner, reason, duration, per-player kills/dmg/survivors, provisional ELO + XP).
//      This is what the client shows and what a settlement backend would sign/persist.
//   2. computeEloDelta()   — standard Elo, used for a provisional rating delta in the summary.
//   3. estimateXp()        — mirrors the submit-battle-result XP formula so the PvP result
//      screen can preview XP before any on-chain claim (the real claim still goes through the
//      existing signed submit-battle-result flow on the player's wallet).
//   4. postSettlement()    — BEST-EFFORT POST to an optional settlement endpoint
//      (env F9PVP_SETTLE_URL). Wrapped so it can NEVER throw into the room / crash a match.
//   5. verifyDeckOnChain() — env-gated anti-cheat hook (env F9PVP_DECK_VERIFY_URL). When unset
//      it returns { verified:false, trusted:true } — i.e. current behaviour (trust client deck),
//      so local testing and the default deploy keep working unchanged.
//
// NOTHING here runs unless a match ends. NOTHING here is required for a match to play.

import type { F9PvpDeckEntry } from "./F9PvpRtsLogic";

export interface F9PvpTeamStat {
  team: number;
  kills: number; dmgDealt: number; dmgTaken: number;
  unitsTotal: number; unitsAlive: number;
  survivors: { tokenId: number; utype: string; level: number; kills: number; dmgDealt: number; dmgTaken: number; hp: number; maxHp: number }[];
  deadTokenIds: number[];
}

export interface F9PvpPlayerResult {
  team: number;
  address: string;
  won: boolean;
  kills: number;
  dmgDealt: number;
  dmgTaken: number;
  unitsLost: number;
  survivors: number;
  deadTokenIds: number[];
  eloBefore: number;
  eloDelta: number;
  eloAfter: number;
  xpPreview: number;          // total previewed XP across this player's surviving deck
  deckVerified: boolean;      // did we confirm the deck on-chain? (false = trusted)
}

export interface F9PvpMatchResult {
  matchId: string;            // deterministic: seed + addresses
  seed: number;
  winnerTeam: number;         // -1 = draw
  reason: string;             // "wipe" | "core" | "player_left" | ...
  durationMs: number;
  endedAt: number;            // ms epoch (passed in — logic is clock-free)
  cols: number; rows: number;
  players: F9PvpPlayerResult[];
}

// ── Elo ──────────────────────────────────────────────────────────────────
const DEFAULT_ELO = 1000;
const ELO_K = 24;

export function computeEloDelta(rating: number, oppRating: number, score: number, k = ELO_K): number {
  // score: 1 win, 0 loss, 0.5 draw. Returns rounded integer delta.
  const expected = 1 / (1 + Math.pow(10, (oppRating - rating) / 400));
  return Math.round(k * (score - expected));
}

// ── XP preview (mirrors submit-battle-result formula; preview only, not authoritative) ──
const XP_PARTICIPATION = 10;
const XP_PER_KILL = 20;
const XP_PER_DMG_DEALT = 1;
const XP_PER_DMG_TAKEN = 1;
const MAX_XP_PER_UNIT = 20000;

export function estimateXp(kills: number, dmgDealt: number, dmgTaken: number, won: boolean): number {
  let xp = XP_PARTICIPATION + (won ? 50 : 0);
  xp += Math.max(0, kills) * XP_PER_KILL;
  xp += Math.max(0, dmgDealt) * XP_PER_DMG_DEALT;
  xp += Math.max(0, dmgTaken) * XP_PER_DMG_TAKEN;
  return Math.min(Math.round(xp), MAX_XP_PER_UNIT);
}

// ── Result assembly ──────────────────────────────────────────────────────
export interface F9PvpPlayerMeta {
  team: number;
  address: string;
  eloBefore: number;
  deckVerified: boolean;
}

export function buildMatchResult(args: {
  seed: number;
  winnerTeam: number;
  reason: string;
  durationMs: number;
  endedAt: number;
  cols: number; rows: number;
  teamStats: F9PvpTeamStat[];
  players: F9PvpPlayerMeta[];
}): F9PvpMatchResult {
  const statByTeam = new Map<number, F9PvpTeamStat>();
  for (const s of args.teamStats) statByTeam.set(s.team, s);

  const ratingByTeam = new Map<number, number>();
  for (const p of args.players) ratingByTeam.set(p.team, p.eloBefore || DEFAULT_ELO);

  const players: F9PvpPlayerResult[] = args.players.map((p) => {
    const s = statByTeam.get(p.team);
    const won = args.winnerTeam === p.team;
    const oppTeam = p.team === 0 ? 1 : 0;
    const oppRating = ratingByTeam.get(oppTeam) ?? DEFAULT_ELO;
    const score = args.winnerTeam < 0 ? 0.5 : (won ? 1 : 0);
    const eloBefore = p.eloBefore || DEFAULT_ELO;
    const eloDelta = computeEloDelta(eloBefore, oppRating, score);
    const kills = s ? s.kills : 0;
    const dmgDealt = s ? s.dmgDealt : 0;
    const dmgTaken = s ? s.dmgTaken : 0;
    // XP preview: per surviving unit, summed (dead units are burned, no XP — matches submit flow).
    let xpPreview = 0;
    if (s) for (const sv of s.survivors) xpPreview += estimateXp(sv.kills, sv.dmgDealt, sv.dmgTaken, won);
    return {
      team: p.team,
      address: p.address,
      won,
      kills, dmgDealt, dmgTaken,
      unitsLost: s ? (s.unitsTotal - s.unitsAlive) : 0,
      survivors: s ? s.unitsAlive : 0,
      deadTokenIds: s ? s.deadTokenIds : [],
      eloBefore,
      eloDelta,
      eloAfter: eloBefore + eloDelta,
      xpPreview,
      deckVerified: p.deckVerified,
    };
  });

  const addrKey = args.players.map((p) => `${p.team}:${p.address || "anon"}`).sort().join("|");
  return {
    matchId: `f9pvp-${args.seed.toString(36)}-${hashStr(addrKey).toString(36)}`,
    seed: args.seed,
    winnerTeam: args.winnerTeam,
    reason: args.reason,
    durationMs: args.durationMs,
    endedAt: args.endedAt,
    cols: args.cols, rows: args.rows,
    players,
  };
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ── Best-effort outbound settlement (never throws) ───────────────────────
export async function postSettlement(result: F9PvpMatchResult): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = process.env.F9PVP_SETTLE_URL;
  if (!url) return { ok: false, error: "no_settle_url" };   // not configured → no-op (default)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.F9PVP_SETTLE_KEY) headers["Authorization"] = `Bearer ${process.env.F9PVP_SETTLE_KEY}`;
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(result), signal: ctrl.signal });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

// ── Optional on-chain deck verification (anti-cheat hook; safe default) ───
// Returns { verified, trusted }. verified=true only when an external verifier confirms the
// supplied (address, deck/tokenIds) really belong to the wallet on-chain (ownerOf + getDeck,
// like the ronke-power edge fn). When no verifier is configured we keep the v1 behaviour:
// trust the client-supplied deck so local testing & the current deploy keep working.
export async function verifyDeckOnChain(address: string, deck: F9PvpDeckEntry[]): Promise<{ verified: boolean; trusted: boolean; error?: string }> {
  const url = process.env.F9PVP_DECK_VERIFY_URL;
  if (!url || !address) return { verified: false, trusted: true };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, tokenIds: deck.map((d) => d.tokenId).filter((t) => t > 0) }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { verified: false, trusted: true, error: `verify_http_${res.status}` };
    const j: any = await res.json().catch(() => ({}));
    return { verified: !!j?.verified, trusted: !j?.verified };
  } catch (e: any) {
    // Verifier unreachable → fall back to trusting (don't block the match), but flag unverified.
    return { verified: false, trusted: true, error: String(e?.message || e).slice(0, 160) };
  }
}
