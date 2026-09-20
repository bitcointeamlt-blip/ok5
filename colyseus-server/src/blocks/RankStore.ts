import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 🏅 RANK STORE — tetris PvP reitingo (lygos + žvaigždutės) + deko-unitų XP sistema.
//   Server-authoritative, Supabase f9_bases (kaip ReferralStore). Raktai:
//     rank_<wallet>          = { score, wins, losses, games, xp, at }  — score 0..48
//     rankcredited_<roomId>  = { at }                                   — dedupe (settle-retry nedvigubina)
//
// LYGOS (8): POPIERIUS→MEDIS→AKMUO→BRONZE→SILVER→AUKSAS→DEIMANTAS→GLOBAL. Kiekviena 3★.
//   score = lyga*6 + pusžvaigždės (0..6). Startas POPIERIUS 0★ (score 0).
//   🛡️ ZERO-SUM pagal lygų skirtumą (žr. _winDelta): laimi prieš lygų +1★ / pralaimi −1★;
//   prieš aukštesnį iki +2★; prieš 2+ lygos ŽEMESNĮ → 0 (anti-treidingas). Pralaimėtojas praranda
//   tiek, kiek laimėtojas gauna → susitarę draugai reitingo iš nieko nesukuria. Clamp [0,48].
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

// 🛡️ ANTI-TREIDINGAS (2026-08-12): laimėtojo score pokytis (pusžvaigždėmis) pagal lygų skirtumą
//   gap = laimėtojo_lyga − pralaimėtojo_lyga (PRIEŠ mačą). Pralaimėtojas praranda TIKSLIAI −dWin
//   (zero-sum) → du susitarę draugai gali reitingą PERSKIRSTYTI, bet NE sukurti iš nieko keisdamiesi.
//     gap ≥ 2 (laimi prieš 2+ lygos ŽEMESNĮ) → 0 → draugas, nusileidęs į dugną, TAVĘS NEBEMAITINA.
//     gap = 0 (lygus lygis) → +1★ laimi / −1★ pralaimi (buvo +1★/−½★ = pozityvi suma → pumpuojama).
//   ⚠️ Prieš tai: pergalė VISADA +1★ nepriklausomai nuo oponento → draugas dugne maitino iki GLOBAL.
function _winDelta(gap: number): number {
  if (gap <= -2) return 4;   // laimi prieš 2+ lygos AUKŠTESNĮ → +2★ (didelis, bet legit upset)
  if (gap === -1) return 3;  // laimi prieš 1 lygą aukštesnį → +1½★
  if (gap === 0) return 2;   // lygus lygis → +1★
  if (gap === 1) return 1;   // laimi prieš 1 lygą žemesnį → +½★
  return 0;                  // gap ≥ 2 → 0 reitingo (anti-treidingas)
}

// ── APPLY RESULT: mačo rezultatas → reitingas + XP. Idempotentiška per roomId. Grąžina naujus būsenas.
//   winnerAddr/loserAddr — bent vienas gali būti "" (nemokamas mačas be piniginės) → atnaujinam tik esantį.
//   🛡️ Reitingas juda TIK kai ABI pusės su pinigine (cross); anoniminis oponentas (be piniginės —
//   pvz. draugas 2-am įrenginy be prisijungimo) NEBEGALI maitinti ★ (be jo — tik XP+statistika).
//   XP nuo žaidėjo PRIEŠ-mačo lygos (kur „žaidė").
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
  // gap ir zero-sum dWin — TIK kai abi pusės su pinigine; kitaip 0 (score nejuda, tik XP+statistika).
  const dWin = cross ? _winDelta(wPre!.league - lPre!.league) : 0;
  let winner: RankState | null = null, loser: RankState | null = null;
  if (wPre) winner = await _apply(c, wA, true, dWin, rateOf(wPre.score));
  if (lPre) loser = await _apply(c, lA, false, -dWin, rateOf(lPre.score));
  if (wPre || lPre) console.log(`[RankStore] 🏅 room=${roomId} gap=${cross ? wPre!.league - lPre!.league : "—"} d=${dWin / 2}★ W=${wA.slice(0, 8)}…(${winner ? winner.name + " " + winner.stars + "★ +" + rateOf(wPre!.score) + "xp" : "—"}) L=${lA.slice(0, 8)}…(${loser ? loser.name + " " + loser.stars + "★" : "—"})`);
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
/* 🛟 PATVARUS ĮRAŠYMAS (2026-09-20, user: „žmonės sužaidė teterį, o XP neatsiranda").
 *
 * KAS BUVO NE TAIP. Abu XP/trofėjų skaitikliai darė read-modify-write per supabase-js, bet
 * NEI SKAITYMO, NEI RAŠYMO klaidos netikrino — `const { data } = await …` klaidą tyliai praleidžia:
 *   • skaitymas krito ⇒ `data === null` atrodo kaip „eilutės dar nėra" ⇒ upsert perrašo
 *     seną sukauptą reikšmę NAUJU mačo prieaugiu. Žaidėjui tai atrodo kaip „pool DINGO".
 *   • rašymas krito ⇒ funkcija vis tiek grąžindavo naują sumą, t. y. MELAVO, kad įrašė,
 *     ir to mačo XP dingdavo negrįžtamai.
 * Išmatuota 09-20: iš 18 realių mačų 2 liko be XP, nors `rank_` eilutė užsirašė tą pačią
 * sekundę (vadinasi mačo pabaiga tikrai įvyko ir XP funkcija buvo iškviesta).
 *
 * DABAR: klaidos metamos, 3 bandymai su atsitraukimu, o galutinai nepavykus — prieaugis guli
 * atmintyje ir kartojamas kas 30 s, kol pavyks. Prarasti galima tik perkrovus serverį per tą
 * langą — nepalyginamai siauriau nei „vienas DB trūkčiojimas = XP nebėra".
 * 🔑 Svarbiausia: NIEKADA nerašom naujos reikšmės, jei senos perskaityti NEPAVYKO. */
const RETRY_MS = [250, 1000, 3000];
const PEND_FLUSH_MS = 30000;
const PEND_MAX_TRIES = 40;          // ~20 min kartojimo, tada pasiduodam ir garsiai pasakom
const _sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type BumpField = "pool" | "n";
type Bump = { key: string; field: BumpField; amount: number; tries: number; at: number };
const _pend: Bump[] = [];
let _pendTimer: ReturnType<typeof setInterval> | null = null;

/** Eilutės skaitymas, kuris SKIRIA „nėra eilutės" nuo „nepavyko perskaityti". */
async function _readBuildings(c: SupabaseClient, key: string): Promise<any> {
  const { data, error } = await c.from("f9_bases").select("buildings").eq("ronin_address", key).maybeSingle();
  if (error) throw new Error("read " + key + ": " + (error.message || "db error"));
  return (data as any)?.buildings || {};
}
async function _writeBuildings(c: SupabaseClient, key: string, rec: any): Promise<void> {
  const { error } = await c.from("f9_bases").upsert({ ronin_address: key, buildings: rec }, { onConflict: "ronin_address" });
  if (error) throw new Error("write " + key + ": " + (error.message || "db error"));
}
/** Vienas bandymas: perskaityk → pridėk → įrašyk. Bet kuri klaida METAMA. */
async function _bumpOnce(key: string, field: BumpField, amount: number): Promise<number> {
  const c = sb(); if (!c) throw new Error("no supabase");
  const b = await _readBuildings(c, key);
  const add = Math.floor(amount);
  const rec: any = field === "pool"
    ? { pool: (Number(b.pool) || 0) + add, units: b.units || {}, at: Date.now() }
    : { n: (Number(b.n) || 0) + add, at: Date.now() };
  await _writeBuildings(c, key, rec);
  return field === "pool" ? rec.pool : rec.n;
}
function _pendPush(key: string, field: BumpField, amount: number) {
  _pend.push({ key, field, amount, tries: 0, at: Date.now() });
  if (_pendTimer) return;
  _pendTimer = setInterval(() => { void _pendFlush(); }, PEND_FLUSH_MS);
  if (typeof (_pendTimer as any).unref === "function") (_pendTimer as any).unref();   // netrukdo procesui baigtis
}
async function _pendFlush(): Promise<void> {
  const batch = _pend.splice(0, _pend.length);
  for (const it of batch) {
    try {
      const v = await _op(it.key, () => _bumpOnce(it.key, it.field, it.amount));
      console.log(`[XpUnits] 🛟 atkartota +${it.amount} → ${it.key} (dabar ${v})`);
    } catch (e: any) {
      it.tries++;
      if (it.tries < PEND_MAX_TRIES) _pend.push(it);
      else console.error(`[XpUnits] 💀 PRARASTA +${it.amount} → ${it.key} po ${PEND_MAX_TRIES} bandymų: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  if (!_pend.length && _pendTimer) { clearInterval(_pendTimer); _pendTimer = null; }
}
/** 3 bandymai; nepavykus — į kartojimo eilę (prieaugis NEPRARANDAMAS). */
async function _bumpRetry(key: string, field: BumpField, amount: number, label: string): Promise<number | null> {
  let last: any = null;
  for (let i = 0; i <= RETRY_MS.length; i++) {
    try { return await _bumpOnce(key, field, amount); }
    catch (e) { last = e; if (i < RETRY_MS.length) await _sleep(RETRY_MS[i]); }
  }
  _pendPush(key, field, amount);
  console.error(`[${label}] ❌ +${amount} neįrašyta po ${RETRY_MS.length + 1} bandymų (${key}) — į kartojimo eilę. ${String(last?.message || last).slice(0, 140)}`);
  return null;
}
/** Skaitymas su pakartojimais — kad vienas trūkčiojimas UI nerodytų „pool = 0". */
async function _readRetry(key: string): Promise<any | null> {
  const c = sb(); if (!c) return null;
  for (let i = 0; i <= 1; i++) {
    try { return await _readBuildings(c, key); }
    catch (e: any) { if (i === 0) await _sleep(300); else console.warn(`[XpUnits] skaitymas nepavyko (${key}): ${String(e?.message || e).slice(0, 120)}`); }
  }
  return null;   // null = NEŽINOMA (ne „tuščia")
}
/** Testams/diagnostikai: kiek prieaugių dar laukia kartojimo eilėje. */
export function xpPendingCount(): number { return _pend.length; }
export function xpPendingFlushNow(): Promise<void> { return _pendFlush(); }

// ── 🎖️ UNITŲ XP FONDAS ───────────────────────────────────────────────────────
export async function xpPoolAdd(wallet: string, amount: number): Promise<number | null> {
  const c = sb(); const w = _norm(wallet);
  if (!c || !_isAddr(w) || !(amount > 0)) return null;
  return _op("xpu_" + w, () => _bumpRetry("xpunits_" + w, "pool", amount, "XpUnits"));
}

/* 🧱🏆 TETRISŲ (4 linijų vienu metu) skaitiklis — trofėjų misijai „30 → 69 → 169 tetrisų".
 * ATSKIRA `f9_bases` eilutė `tetris_<wallet>` — kad `applyResult` (rašo visą rank įrašą) jo neperrašytų.
 * Rašom VIENĄ kartą mačo pabaigoje (ne po kiekvieno tetriso) — mažiau DB rašymų. Serverio tiesa. */
export async function tetrisAdd(wallet: string, count: number): Promise<number | null> {
  const c = sb(); const w = _norm(wallet);
  if (!c || !_isAddr(w) || !(count > 0)) return null;
  return _op("tet_" + w, () => _bumpRetry("tetris_" + w, "n", count, "TetrisCount"));
}
export async function tetrisGet(wallet: string): Promise<number> {
  const w = _norm(wallet);
  if (!sb() || !_isAddr(w)) return 0;
  const b = await _readRetry("tetris_" + w);
  return b ? (Number(b.n) || 0) : 0;
}

export async function xpUnitsGet(wallet: string): Promise<{ pool: number; units: Record<string, number> }> {
  const w = _norm(wallet);
  const empty = { pool: 0, units: {} as Record<string, number> };
  if (!sb() || !_isAddr(w)) return empty;
  const b = await _readRetry("xpunits_" + w);
  if (!b) return empty;
  const units: Record<string, number> = {};
  for (const k of Object.keys(b.units || {})) units[k] = Number(b.units[k]) || 0;
  return { pool: Number(b.pool) || 0, units };
}

// VISAS pool'as → pasirinktam unitui (tokenId jau patikrintas prieš deką kvietėjo pusėje).
export async function xpAssign(wallet: string, tokenId: string): Promise<{ ok: boolean; unitXp?: number; pool?: number }> {
  const c = sb(); const w = _norm(wallet);
  if (!c || !_isAddr(w) || !tokenId) return { ok: false };
  return _op("xpu_" + w, async () => {
    try {
      /* 🔑 Skaitymo klaida dabar METAMA — anksčiau ji atrodydavo kaip tuščias pool'as, o tolesnis
       * upsert būtų perrašęs eilutę nuliais ir sunaikinęs žaidėjo XP. */
      const b = await _readBuildings(c, "xpunits_" + w);
      const pool = Number(b.pool) || 0;
      if (pool <= 0) return { ok: false, pool: 0 };
      const units = b.units || {};
      units[tokenId] = (Number(units[tokenId]) || 0) + pool;
      const rec = { pool: 0, units, at: Date.now() };
      await _writeBuildings(c, "xpunits_" + w, rec);
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
