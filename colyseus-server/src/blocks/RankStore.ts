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

export const LEAGUES = ["POPIERIUS", "MEDIS", "AKMUO", "BRONZE", "SILVER", "AUKSAS", "DEIMANTAS", "GLOBAL"];
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
};

function _shape(b: any): RankState {
  const d = decode(Number(b?.score) || 0);
  return { ...d, wins: Number(b?.wins) || 0, losses: Number(b?.losses) || 0, games: Number(b?.games) || 0, xp: Number(b?.xp) || 0 };
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
async function _apply(c: SupabaseClient, wallet: string, won: boolean, deltaHs: number, xpAdd: number): Promise<RankState | null> {
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
export async function applyResult(winnerAddr: string, loserAddr: string, roomId: string): Promise<{ winner: RankState | null; loser: RankState | null } | null> {
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
  return { winner, loser };
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
