import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 🏅 RANK STORE — tetris PvP reitingo (lygos + žvaigždutės) + deko-unitų XP sistema.
//   Server-authoritative, Supabase f9_bases (kaip ReferralStore). Raktai:
//     rank_<wallet>          = { score, wins, losses, games, xp, at }  — score 0..48
//     rankcredited_<roomId>  = { at }                                   — dedupe (settle-retry nedvigubina)
//
// LYGOS (8): POPIERIUS→MEDIS→AKMUO→BRONZE→SILVER→AUKSAS→DEIMANTAS→GLOBAL. Kiekviena 3★.
//   score = lyga*6 + pusžvaigždės (0..6). Startas POPIERIUS 0★ (score 0).
//   Pergalė +1★ (+2 score) · Pralaimėjimas −½★ (−1) · Laimi prieš AUKŠTESNĘ lygą +2★ (+4) ·
//   Pralaimi prieš ŽEMESNĘ lygą −2★ (−4). Clamp [0,48].
//
// XP (deko NFT unitams, OFF-CHAIN — kaupiama čia, taikoma F9 pusėj vėliau):
//   POPIERIUS = 50/mačą; nuo MEDIS +10 už kiekvieną PILNĄ žvaigždę (kaupiasi per lygas).
//   rate = 50 + 10×((lyga−1)*3 + pilnos_žvaigždės);  POPIERIUS=50 … GLOBAL 3★=260.
//   XP užsiskaito KIEKVIENĄ PvP mačą (win ar lose) pagal žaidėjo PRIEŠ-mačo lygą.

export const LEAGUES = ["PAPER", "WOOD", "STONE", "BRONZE", "SILVER", "GOLD", "DIAMOND", "GLOBAL"];
export const LEAGUE_ICON = ["📄", "🌳", "🪨", "🥉", "🥈", "🥇", "💎", "🌐"];
const MAX_SCORE = 48;             // GLOBAL 3★
const XP_BASE = 50, XP_STEP = 10;

let _client: SupabaseClient | null = null; let _tried = false;
function sb(): SupabaseClient | null {
  if (_tried) return _client; _tried = true;
  const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (url && key) _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}
const _norm = (a: string) => (a || "").trim().toLowerCase();
const _isAddr = (a: string) => /^0x[0-9a-f]{40}$/.test(a);

// 🔒 PER-WALLET operacijų eilė — rank read-modify-write NEGALI persidengti (kaip ReferralStore._op).
const _opQueue = new Map<string, Promise<any>>();
function _op<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = _opQueue.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  _opQueue.set(key, next.catch(() => {}));
  return next;
}

export function rankEnabled(): boolean { return !!sb(); }

// score → lyga(0..7), pusžvaigždės(0..6), žvaigždės(0..3), pavadinimas, ikona
export function decode(score: number) {
  const s = Math.max(0, Math.min(MAX_SCORE, Math.round(Number(score)) || 0));
  const league = Math.min(7, Math.floor(s / 6));
  const hs = s - league * 6;                 // 0..6 pusžvaigždžių
  return { score: s, league, hs, stars: hs / 2, name: LEAGUES[league], icon: LEAGUE_ICON[league] };
}

// XP rate (per mačą, vienam deko unitui) pagal score
export function rateOf(score: number): number {
  const { league, hs } = decode(score);
  if (league <= 0) return XP_BASE;           // POPIERIUS = 50 flat
  const fullStars = Math.floor(hs / 2);      // 0..3
  return XP_BASE + XP_STEP * ((league - 1) * 3 + fullStars);
}

export type RankState = {
  score: number; league: number; hs: number; stars: number; name: string; icon: string;
  wins: number; losses: number; games: number; xp: number;
  aiWins: number; aiLosses: number;   // 🤖 vs AI dalis (PvP = wins−aiWins / losses−aiLosses)
};

function _shape(b: any): RankState {
  const d = decode(Number(b?.score) || 0);
  return {
    ...d, wins: Number(b?.wins) || 0, losses: Number(b?.losses) || 0, games: Number(b?.games) || 0, xp: Number(b?.xp) || 0,
    aiWins: Number(b?.aiWins) || 0, aiLosses: Number(b?.aiLosses) || 0,
  };
}

export async function get(wallet: string): Promise<RankState> {
  const w = _norm(wallet); const empty = _shape({});
  const c = sb(); if (!c || !_isAddr(w)) return empty;
  try {
    const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", "rank_" + w).maybeSingle();
    return _shape((data as any)?.buildings || {});
  } catch { return empty; }
}

// vidinis: pritaiko delta vienam žaidėjui (score + statistika + XP), op-serialized per wallet
async function _apply(c: SupabaseClient, wallet: string, won: boolean, deltaHs: number, xpAdd: number, vsAI = false): Promise<RankState | null> {
  const w = _norm(wallet);
  return _op("rank_" + w, async () => {
    try {
      const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", "rank_" + w).maybeSingle();
      const b = (data as any)?.buildings || {};
      const score = Math.max(0, Math.min(MAX_SCORE, (Number(b.score) || 0) + deltaHs));
      const rec = {
        score,
        wins: (Number(b.wins) || 0) + (won ? 1 : 0),
        losses: (Number(b.losses) || 0) + (won ? 0 : 1),
        games: (Number(b.games) || 0) + 1,
        // 🤖 vs AI dalis atskirai — mačo badge'ams (PvP = wins−aiWins)
        aiWins: (Number(b.aiWins) || 0) + (vsAI && won ? 1 : 0),
        aiLosses: (Number(b.aiLosses) || 0) + (vsAI && !won ? 1 : 0),
        xp: Math.round(((Number(b.xp) || 0) + Math.max(0, xpAdd)) * 1e6) / 1e6,
        at: Date.now(),
      };
      await c.from("f9_bases").upsert({ ronin_address: "rank_" + w, buildings: rec }, { onConflict: "ronin_address" });
      return _shape(rec);
    } catch (e: any) { console.warn("[RankStore] apply fail:", e?.message); return null; }
  });
}

// ── APPLY RESULT: mačo rezultatas → reitingas + XP. Idempotentiška per roomId. Grąžina naujus būsenas.
//   winnerAddr/loserAddr — bent vienas gali būti "" (nemokamas mačas be piniginės) → atnaujinam tik esantį.
//   Cross-league bonusas taikomas TIK jei abu adresai. XP nuo žaidėjo PRIEŠ-mačo lygos (kur „žaidė").
export async function applyResult(winnerAddr: string, loserAddr: string, roomId: string): Promise<{ winner: { before: RankState; after: RankState } | null; loser: { before: RankState; after: RankState } | null } | null> {
  const c = sb(); if (!c || !roomId) return null;
  try {
    const { error } = await c.from("f9_bases").insert({ ronin_address: "rankcredited_" + roomId, buildings: { at: Date.now() } });
    if (error) return null;   // jau kredituota šiam mačui → stop (settle-retry apsauga)
  } catch { return null; }
  const wA = _norm(winnerAddr), lA = _norm(loserAddr);
  const wOk = _isAddr(wA), lOk = _isAddr(lA) && lA !== wA;   // self-match → traktuojam kaip vieną žaidėją
  const wPre = wOk ? await get(wA) : null;
  const lPre = lOk ? await get(lA) : null;
  const cross = !!(wPre && lPre);
  let winner: RankState | null = null, loser: RankState | null = null;
  if (wPre) {
    const dHs = (cross && lPre && wPre.league < lPre.league) ? 4 : 2;   // laimi prieš AUKŠTESNĘ → +2★
    winner = await _apply(c, wA, true, dHs, rateOf(wPre.score));
  }
  if (lPre) {
    const dHs = (cross && wPre && lPre.league > wPre.league) ? -4 : -1; // pralaimi prieš ŽEMESNĘ → −2★
    loser = await _apply(c, lA, false, dHs, rateOf(lPre.score));
  }
  if (wPre || lPre) console.log(`[RankStore] 🏅 room=${roomId} W=${wA.slice(0, 8)}…(${winner ? winner.name + " " + winner.stars + "★ +" + rateOf(wPre!.score) + "xp" : "—"}) L=${lA.slice(0, 8)}…(${loser ? loser.name + " " + loser.stars + "★" : "—"})`);
  // 🎬 before/after — kliento rank animacijai (žvaigždučių pokytis, promotion/demotion)
  return {
    winner: (winner && wPre) ? { before: wPre, after: winner } : null,
    loser: (loser && lPre) ? { before: lPre, after: loser } : null,
  };
}

// ── 🤖 APPLY RESULT vs AI: RANKED vs AI mačo rezultatas → TAS PATS reitingas kaip PvP.
//   AI visada žaidėjo lygio → jokio cross-league bonuso: pergalė +1★ (+2), pralaimėjimas −½★ (−1).
//   XP NEduodamas (25 RONKE fee ≠ XP farmas; XP lieka tik PvP mačams). Idempotentiška per roomId.
export async function applyResultVsAI(playerAddr: string, won: boolean, roomId: string): Promise<{ before: RankState; after: RankState } | null> {
  const c = sb(); if (!c || !roomId) return null;
  const w = _norm(playerAddr);
  if (!_isAddr(w)) return null;
  try {
    const { error } = await c.from("f9_bases").insert({ ronin_address: "rankcredited_" + roomId, buildings: { at: Date.now(), vsAI: true } });
    if (error) return null;   // jau kredituota šiam mačui → stop
  } catch { return null; }
  const before = await get(w);   // 🎬 PRIEŠ-mačo būsena — kliento rank animacijai (žvaigždučių pokytis)
  const after = await _apply(c, w, won, won ? 2 : -1, 0, true);   // vsAI=true → aiWins/aiLosses
  console.log(`[RankStore] 🤖 vsAI room=${roomId} ${w.slice(0, 8)}… ${won ? "WIN +1★" : "LOSS −½★"} → ${after ? after.name + " " + after.stars + "★" : "?"}`);
  return after ? { before, after } : null;
}

// ── 🎖️ UNITŲ XP FONDAS: linijų XP (lines × (lyga+1)) kaupiasi žaidėjo pool'e; po mačo žaidėjas
//   PATS paskiria visą pool'ą pasirinktam ĮREGISTRUOTAM deko unitui (on-chain deck tiesa — DeckChain).
//   Supabase: xpunits_<wallet> = { pool: number, units: { "<tokenId>": xp } }. Op-queue per wallet.
export async function xpPoolAdd(wallet: string, amount: number): Promise<number | null> {
  const c = sb(); const w = _norm(wallet);
  if (!c || !_isAddr(w) || !(amount > 0)) return null;
  return _op("xpu_" + w, async () => {
    try {
      const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", "xpunits_" + w).maybeSingle();
      const b = (data as any)?.buildings || {};
      const rec = { pool: (Number(b.pool) || 0) + Math.floor(amount), units: b.units || {}, at: Date.now() };
      await c.from("f9_bases").upsert({ ronin_address: "xpunits_" + w, buildings: rec }, { onConflict: "ronin_address" });
      return rec.pool;
    } catch (e: any) { console.warn("[XpUnits] add fail:", e?.message); return null; }
  });
}

export async function xpUnitsGet(wallet: string): Promise<{ pool: number; units: Record<string, number> }> {
  const c = sb(); const w = _norm(wallet);
  const empty = { pool: 0, units: {} as Record<string, number> };
  if (!c || !_isAddr(w)) return empty;
  try {
    const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", "xpunits_" + w).maybeSingle();
    const b = (data as any)?.buildings || {};
    const units: Record<string, number> = {};
    for (const k of Object.keys(b.units || {})) units[k] = Number(b.units[k]) || 0;
    return { pool: Number(b.pool) || 0, units };
  } catch { return empty; }
}

// VISAS pool'as → pasirinktam unitui (tokenId jau patikrintas prieš deką kvietėjo pusėje).
export async function xpAssign(wallet: string, tokenId: string): Promise<{ ok: boolean; unitXp?: number; pool?: number }> {
  const c = sb(); const w = _norm(wallet);
  if (!c || !_isAddr(w) || !tokenId) return { ok: false };
  return _op("xpu_" + w, async () => {
    try {
      const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", "xpunits_" + w).maybeSingle();
      const b = (data as any)?.buildings || {};
      const pool = Number(b.pool) || 0;
      if (pool <= 0) return { ok: false, pool: 0 };
      const units = b.units || {};
      units[tokenId] = (Number(units[tokenId]) || 0) + pool;
      const rec = { pool: 0, units, at: Date.now() };
      await c.from("f9_bases").upsert({ ronin_address: "xpunits_" + w, buildings: rec }, { onConflict: "ronin_address" });
      console.log(`[XpUnits] 🎖️ ${w.slice(0, 8)}… unit #${tokenId} += ${pool} XP (viso ${units[tokenId]})`);
      return { ok: true, unitXp: units[tokenId], pool: 0 };
    } catch (e: any) { console.warn("[XpUnits] assign fail:", e?.message); return { ok: false }; }
  });
}

// ── LEADERBOARD: top N pagal score (mažai įrašų → JS rikiavimas).
export async function leaderboard(limit = 50): Promise<Array<{ addr: string } & RankState>> {
  const c = sb(); if (!c) return [];
  try {
    const { data } = await c.from("f9_bases").select("ronin_address,buildings").like("ronin_address", "rank\\_0x%").limit(2000);
    const rows = (data || [])
      .map((r: any) => ({ addr: String(r.ronin_address).replace(/^rank_/, ""), b: r.buildings || {} }))
      .filter((r: any) => _isAddr(r.addr))
      .map((r: any) => ({ addr: r.addr, ..._shape(r.b) }));
    rows.sort((a: any, b: any) => b.score - a.score || b.wins - a.wins || a.games - b.games);
    return rows.slice(0, Math.max(1, Math.min(200, limit)));
  } catch (e: any) { console.warn("[RankStore] leaderboard fail:", e?.message); return []; }
}

export { _norm as normAddr, _isAddr as isAddr };
