import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { boneBankOp } from "./BaseStore";

// ⚡🎒 RONKE BLESS ITEMAI (2026-08-13, user): bless nebe efemeriški charge'ai, o KAUPIAMI in-game itemai
//   („kaip kaulai" — off-chain balansas, JOKIO NFT/kontrakto). Viena valiuta dviem panaudojimams:
//   (1) instant heal sužalotam unitui, (2) apsauga nuo mirties sveikam unitui (1 mačas; F3).
//   CLAIM = retention mechanika: žaidėjas turi GRĮŽTI į žaidimą pasiimti paros emisijos;
//   neužclaim'inta para DINGSTA (nesikaupia). Jau claim'inti itemai balanse lieka amžinai + tradable (F4 market).
//   Emisija per rolling 24h langą: nuo 2026-08-18 ją lemia RONKE SCORE pakopa (žr. SCORE_TIERS žemiau).
//   Iki tol buvo „1 už kiekvieną Ronkeverse NFT (max 20/parą) + 1/1 ×5" — pakeista user'io sprendimu.
//   Persist: `<addr>#bless` eilutė f9_bases (buildings = {bal, claimed, windowStart}), serializuota per
//   boneBankOp — jokio double-spend/double-claim. 🛡 Fail-closed kaip InstantHeal (S-M5): DB triktis →
//   jokio kredito ir jokio nemokamo nurašymo-be-įrašo.

const WINDOW_MS = 24 * 60 * 60 * 1000;

/* 🏆 EMISIJA PAGAL RONKE SCORE (2026-08-18, user) — pakeitė seną „1 už NFT, max 20/parą + 1/1 ×5".
 * Dabar paros kiekį lemia TAVO vieta bendruomenės reitinge (ta pati percentilė kaip kasimo bonusui):
 *   top 1% → 20 · top 5% → 15 · top 10% → 10 · top 25% → 6 · top 50% → 3 · žemiau → 0.
 * Score API neatsakius pakopos NĖRA ⇒ cap 0, BET nieko neįrašom ⇒ para NEprarandama: pavyks vėliau. */
const SCORE_TIERS: Array<[number, number]> = [
  [99, Number(process.env.F9_BLESS_P99 || 20)],
  [95, Number(process.env.F9_BLESS_P95 || 15)],
  [90, Number(process.env.F9_BLESS_P90 || 10)],
  [75, Number(process.env.F9_BLESS_P75 || 6)],
  [50, Number(process.env.F9_BLESS_P50 || 3)],
];

let _sb: SupabaseClient | null = null; let _sbTried = false;
function sb(): SupabaseClient | null {
  if (_sbTried) return _sb;
  _sbTried = true;
  const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}
const _norm = (a: string) => (a || "").trim().toLowerCase();
const _key = (a: string) => _norm(a) + "#bless";

// Kiek galima claim'inti per parą pagal Ronke Score percentilę (0 = žemiau top 50% arba nėra score).
/* ⚡🏭 BLESS GENERATORIUS (2026-08-22, user): žaidėjams, kurių Ronke Score nesiekia pakopų (arba
 * ir siekia — generatorius PRIDEDAMAS, ne pakeičia). Perkamas už kaulus pilyje, lygis 1..5 =
 * +1..+5 BLESS į paros emisiją. Emisijos mechanika ta pati (rolling 24h langas, neclaim'inta para
 * dingsta), tad jokio atskiro laikmačio nereikia — tik pakyla paros lubos. */
export const BLESS_GEN_MAX_LVL = 5;
export function blessClaimCap(percentile: number, genLevel: number = 0): number {
  const p = Number(percentile) || 0;
  const gen = Math.max(0, Math.min(BLESS_GEN_MAX_LVL, Math.floor(Number(genLevel) || 0)));
  let tier = 0;
  for (const [minP, n] of SCORE_TIERS) if (p >= minP) { tier = Math.max(0, Math.floor(n)); break; }
  return tier + gen;
}
// Etiketė UI'ui („TOP 5%") — kad žaidėjas matytų, KODĖL gauna tiek.
export function blessTierLabel(percentile: number): string {
  const p = Number(percentile) || 0;
  const names = ["TOP 1%", "TOP 5%", "TOP 10%", "TOP 25%", "TOP 50%"];
  for (let i = 0; i < SCORE_TIERS.length; i++) if (p >= SCORE_TIERS[i][0]) return names[i];
  return "";
}

type BlessRow = { bal: number; claimed: number; windowStart: number; ver: number; fresh: boolean; noVer: boolean };

/* 🔐 CAS (compare-and-swap, 2026-08-18): `boneBankOp` eilė serializuoja tik VIENO proceso viduje.
 * Jei žaidėjas atsidaro dvi kortas / serveris suka kelis procesus, du „read → modify → write" galėtų
 * persidengti ir tas pats claim'as (ar tų pačių itemų pardavimas) užsiskaitytų du kartus.
 * Todėl kiekviena eilutė turi `ver`, o rašymas praeina TIK jei DB'e tebėra ta pati versija —
 * pralaimėjęs bandymas nieko nesugadina, jis tiesiog pakartojamas su šviežiais duomenimis. */
const CAS_RETRIES = 4;

// Read + rolling reset (langas pasibaigęs → claimed=0 nuo dabar). Read-only reset'o NEpersistina.
// DB KLAIDĄ metam (ne tuščią row) — caller'iai atskiria „triktis" nuo „nauja eilutė" (fail-closed).
async function _read(addr: string, now: number): Promise<BlessRow> {
  const c = sb(); if (!c) return { bal: 0, claimed: 0, windowStart: now, ver: 0, fresh: true, noVer: true };   // dev be Supabase → be persistencijos
  const { data, error } = await c.from("f9_bases").select("buildings").eq("ronin_address", _key(addr)).maybeSingle();
  if (error) throw new Error("[BlessBank] read: " + (error.message || "db error"));
  const b = (data as any)?.buildings || {};
  let bal = Number.isFinite(+b.bal) ? Math.max(0, Math.floor(+b.bal)) : 0;
  let claimed = Number.isFinite(+b.claimed) ? Math.max(0, Math.floor(+b.claimed)) : 0;
  let windowStart = Number.isFinite(+b.windowStart) ? +b.windowStart : now;
  if (now - windowStart >= WINDOW_MS) { claimed = 0; windowStart = now; }   // rolling reset
  return { bal, claimed, windowStart, ver: Number(b.ver) || 0, fresh: !data, noVer: b.ver == null };
}
// Rašo TIK jei eilutės versija nepasikeitė nuo skaitymo. false = kažkas aplenkė → caller'is kartoja.
async function _write(addr: string, r: BlessRow): Promise<boolean> {
  const c = sb(); if (!c) return true;
  const body = { bal: r.bal, claimed: r.claimed, windowStart: r.windowStart, ver: (r.ver || 0) + 1 };
  if (r.fresh) {
    // naujos eilutės: unikalus PK — jei kitas procesas spėjo pirmas, insert'as krenta → kartojam
    const { error } = await c.from("f9_bases").insert({ ronin_address: _key(addr), units: [], buildings: body, updated_at: new Date().toISOString() });
    if (!error) return true;
    if (/duplicate|unique|conflict/i.test(error.message || "")) return false;
    throw new Error("[BlessBank] write: " + (error.message || "db error"));
  }
  // ⚠️ SENOS eilutės `ver` lauko neturi (JSONB → NULL, o NULL ≠ '0') — joms sąlyga „ver YRA NULL",
  //    kitaip pirmas rašymas po atnaujinimo niekada nepraeitų ir bless „nustotų veikti".
  let q = c.from("f9_bases")
    .update({ units: [], buildings: body, updated_at: new Date().toISOString() })
    .eq("ronin_address", _key(addr));
  q = r.noVer ? q.filter("buildings->>ver", "is", null) : q.filter("buildings->>ver", "eq", String(r.ver || 0));
  const { data, error } = await q.select("ronin_address");
  if (error) throw new Error("[BlessBank] write: " + (error.message || "db error"));
  return !!(data && data.length);   // 0 eilučių = versija pasikeitė (kitas rašė) → kartojam
}

export type BlessStatus = { bal: number; cap: number; claimable: number; resetAt: number; supply?: number };

// ── 🌐 GLOBALUS BLESS SUPPLY (2026-08-21, user) ─────────────────────────────
// Rodo, kiek BLESS realiai yra ŽAIDĖJŲ rankose. Dev/owner piniginė(s) IŠSKAIČIUOJAMOS —
// 08-21 jose gulėjo 10 036 iš 10 362 (97%), tad be išskaičiavimo skaičius nieko nesako
// apie ekonomiką (atrodytų „10k BLESS apyvartoje", nors žaidėjai turi ~321).
// Sąrašas per env `BLESS_SUPPLY_EXCLUDE` (kableliais), default = žinoma dev piniginė.
const _EXCLUDE = new Set(
  (process.env.BLESS_SUPPLY_EXCLUDE || "0x32782d97a180a0fd5b6f775517ac4e3727bb624a")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean),
);
const SUPPLY_TTL_MS = 60_000;   // skaičiavimas skenuoja visas eilutes → kešuojam minutei
let _supplyCache = { at: 0, val: 0 };

export async function blessSupply(): Promise<number> {
  const now = Date.now();
  if (now - _supplyCache.at < SUPPLY_TTL_MS) return _supplyCache.val;
  const c = sb();
  if (!c) return _supplyCache.val;
  try {
    // 1) balansai piniginėse
    const { data: bal } = await c.from("f9_bases").select("ronin_address,buildings").ilike("ronin_address", "%#bless");
    let total = 0;
    for (const r of (bal || [])) {
      const addr = String((r as any).ronin_address || "").replace("#bless", "").toLowerCase();
      if (_EXCLUDE.has(addr)) continue;
      total += Math.max(0, Number((r as any).buildings?.bal) || 0);
    }
    // 2) + itemai, kurie guli TURGUJE (escrow) — jie irgi egzistuoja, tik nurašyti iš balanso
    const { data: mk } = await c.from("f9_bases").select("ronin_address,buildings").like("ronin_address", "blessmkt\_%");
    for (const r of (mk || [])) {
      const b: any = (r as any).buildings || {};
      if (b.status !== "active") continue;                       // nupirkti/atšaukti lotai NEskaičiuojami
      if (_EXCLUDE.has(String(b.seller || "").toLowerCase())) continue;
      total += Math.max(0, Number(b.qty) || 0);
    }
    _supplyCache = { at: now, val: total };
    return total;
  } catch (e: any) {
    console.warn("[BlessBank] supply skaičiavimas nepavyko:", e?.message);
    return _supplyCache.val;
  }
}
// Statusas panelei: balansas + kiek DAR galima claim'inti šiam lange. DB triktis → konservatyvu (0/0).
export async function blessStatus(addr: string, percentile: number, genLevel: number = 0): Promise<BlessStatus> {
  const cap = blessClaimCap(percentile, genLevel);
  const now = Date.now();
  try {
    const r = await _read(_norm(addr), now);
    const supply = await blessSupply();   // 🌐 globalus kiekis žaidėjų rankose (be dev piniginės)
    return { bal: r.bal, cap, claimable: Math.max(0, cap - r.claimed), resetAt: r.windowStart + WINDOW_MS, supply };
  } catch {
    return { bal: 0, cap, claimable: 0, resetAt: now + WINDOW_MS };
  }
}

// CLAIM — įskaito VISĄ likusią šio lango emisiją į balansą. ok=false kai nebėra ko (arba DB triktis).
export async function blessClaim(addr: string, percentile: number, genLevel: number = 0): Promise<{ ok: boolean; credited: number; bal: number; claimable: number }> {
  const a = _norm(addr);
  const cap = blessClaimCap(percentile, genLevel);
  if (cap <= 0) return { ok: false, credited: 0, bal: 0, claimable: 0 };
  return boneBankOp(a + "#bless", async () => {
    for (let i = 0; i < CAS_RETRIES; i++) {
      try {
        const now = Date.now();
        const r = await _read(a, now);
        const avail = Math.max(0, cap - r.claimed);
        if (avail <= 0) return { ok: false, credited: 0, bal: r.bal, claimable: 0 };
        const nr = { ...r, bal: r.bal + avail, claimed: r.claimed + avail };
        // 🔐 CAS: kitas procesas spėjo pirmas → skaitom iš naujo (jo claim'as jau užskaitytas → avail=0 → ok:false).
        //    Taip TAS PATS paros claim'as niekada neužsiskaito du kartus.
        if (!(await _write(a, nr))) continue;
        return { ok: true, credited: avail, bal: nr.bal, claimable: 0 };
      } catch { return { ok: false, credited: 0, bal: 0, claimable: 0 }; }
    }
    return { ok: false, credited: 0, bal: 0, claimable: 0 };
  });
}

// Nurašo n itemų (heal / apsauga / market escrow). ok=false jei neužtenka arba DB triktis (fail-closed).
export async function blessConsume(addr: string, n: number = 1): Promise<{ ok: boolean; bal: number }> {
  const a = _norm(addr);
  const take = Math.max(1, Math.floor(n));
  return boneBankOp(a + "#bless", async () => {
    for (let i = 0; i < CAS_RETRIES; i++) {
      try {
        const now = Date.now();
        const r = await _read(a, now);
        if (r.bal < take) return { ok: false, bal: r.bal };
        const nr = { ...r, bal: r.bal - take };
        if (!(await _write(a, nr))) continue;   // 🔐 CAS — dviguba tų pačių itemų išleistis neįmanoma
        return { ok: true, bal: nr.bal };
      } catch { return { ok: false, bal: 0 }; }
    }
    return { ok: false, bal: 0 };
  });
}

// Grąžina n itemų (heal race refund / market unlock). Best-effort kaip refundInstantHeal —
//   prarastas itemas (retas) geriau nei dublis; langų skaitliuko (claimed) NEliečia.
export async function blessCredit(addr: string, n: number = 1): Promise<void> {
  const a = _norm(addr);
  const give = Math.max(1, Math.floor(n));
  await boneBankOp(a + "#bless", async () => {
    try {
      for (let i = 0; i < CAS_RETRIES; i++) {
        const now = Date.now();
        const r = await _read(a, now);
        if (await _write(a, { ...r, bal: r.bal + give })) return;   // 🔐 CAS — kredito niekada neperrašo svetimas rašymas
      }
    } catch { /* best-effort */ }
  });
}
