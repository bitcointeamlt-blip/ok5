import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PayoutQueue } from "./PayoutQueue";   // claim payout → durabli eilė → StakeService.flushQueue išmoka iš pool

// 🎁 REFERRAL STORE — tetris wager referalų sistema (server-authoritative, Supabase f9_bases).
// Raktai (ronin_address kaip namespaced key, kaip WagerEntry `blocksentry_<tx>`):
//   ref_<wallet>         = { referrer, boundAt }        — kas atvedė šį žaidėją (IMMUTABLE po nustatymo)
//   tetrisseen_<wallet>  = { at }                        — jau žaidė tetris wager (užkerta VĖLYVĄ bind)
//   refearn_<referrer>   = { accrued, claimed, games }   — kaupiamas uždarbis (MUTABLE → op-queue)
//   refcredited_<roomId> = { at, tier }                  — dedupe (unique insert) settle-retry apsaugai
//
// MODELIS A (user patvirtino): referrer'is gauna 5% NUO to žaidėjo STATYMO (tier). Uždarbis TIK iš
// wager mačų. Prisirišimas — prie PIRMO wager mačo (proven wallet), tik jei „niekada nežaidė tetris".
// Anti-abuse: self-ref blokuotas; server-only write (klientas negali klastoti kito referrer'io).

const REF_BPS = 500;   // 5.00% nuo statymo
const REF_CLAIM_SANITY = 100000;   // 🛡️ vieno claim'o sanity luba (RONKE) — viršijus → MANUAL peržiūra (gynyba į gylį; ledgeris jau RLS-apsaugotas)

let _client: SupabaseClient | null = null; let _tried = false;
function sb(): SupabaseClient | null {
  if (_tried) return _client; _tried = true;
  const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (url && key) _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}
const _norm = (a: string) => (a || "").trim().toLowerCase();
const _isAddr = (a: string) => /^0x[0-9a-f]{40}$/.test(a);

// 🔒 PER-REFERRER operacijų eilė — refearn read-modify-write NEGALI persidengti (kaip BaseStore.boneBankOp).
const _opQueue = new Map<string, Promise<any>>();
function _op<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = _opQueue.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  _opQueue.set(key, next.catch(() => {}));
  return next;
}

export function referralEnabled(): boolean { return !!sb(); }

// ── BIND: prisiriša wallet prie ref (jei ref_ nėra IR tetrisseen_ nėra IR ref≠wallet). Grąžina true jei prisirišo.
//   Kviečiama PO to, kai wallet adresas ĮRODYTAS (verifikuotas wager įėjimas) → negalima klastoti kito referrer'io.
export async function bind(wallet: string, ref: string): Promise<boolean> {
  const w = _norm(wallet), r = _norm(ref);
  if (!_isAddr(w) || !_isAddr(r) || w === r) return false;   // self-ref / bad addr → NE
  const c = sb(); if (!c) return false;
  return _op("bind_" + w, async () => {
    try {
      const { data: ex } = await c.from("f9_bases").select("ronin_address").eq("ronin_address", "ref_" + w).maybeSingle();
      if (ex) return false;   // jau prisirišęs
      const { data: seen } = await c.from("f9_bases").select("ronin_address").eq("ronin_address", "tetrisseen_" + w).maybeSingle();
      if (seen) return false;   // jau žaidė tetris anksčiau → tik „niekada nežaidę" prisiriša
      const { error } = await c.from("f9_bases").insert({ ronin_address: "ref_" + w, buildings: { referrer: r, boundAt: Date.now() } });
      if (error) return false;   // konfliktas = race, kitas jau prisirišo
      // referrer'io referalų skaitiklis (read-merge, op-serialized ant earn_<r>)
      await _op("earn_" + r, async () => {
        const { data: e } = await c.from("f9_bases").select("buildings").eq("ronin_address", "refearn_" + r).maybeSingle();
        const b = (e as any)?.buildings || {};
        await c.from("f9_bases").upsert({ ronin_address: "refearn_" + r, buildings: {
          accrued: Number(b.accrued) || 0, claimed: Number(b.claimed) || 0, games: Number(b.games) || 0, referrals: (Number(b.referrals) || 0) + 1,
        } }, { onConflict: "ronin_address" });
      });
      console.log(`[ReferralStore] 🎁 bind ${w.slice(0, 10)}… → referrer ${r.slice(0, 10)}…`);
      return true;
    } catch (e: any) { console.warn("[ReferralStore] bind fail:", e?.message); return false; }
  });
}

// ── MARK SEEN: pažymi kad wallet žaidė tetris wager (užkerta vėlyvą bind). Kviečiama kiekvieno mačo.
export async function markSeen(wallet: string): Promise<void> {
  const w = _norm(wallet); if (!_isAddr(w)) return;
  const c = sb(); if (!c) return;
  try { await c.from("f9_bases").upsert({ ronin_address: "tetrisseen_" + w, buildings: { at: Date.now() } }, { onConflict: "ronin_address" }); }
  catch (e: any) { console.warn("[ReferralStore] markSeen fail:", e?.message); }
}

async function _referrerOf(c: SupabaseClient, wallet: string): Promise<string | null> {
  try {
    const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", "ref_" + _norm(wallet)).maybeSingle();
    const r = _norm(String((data as any)?.buildings?.referrer || ""));
    return _isAddr(r) ? r : null;
  } catch { return null; }
}

async function _addEarnings(c: SupabaseClient, referrer: string, amount: number): Promise<void> {
  const R = _norm(referrer);
  await _op("earn_" + R, async () => {
    try {
      const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", "refearn_" + R).maybeSingle();
      const b = (data as any)?.buildings || {};
      const accrued = (Number(b.accrued) || 0) + amount;
      const claimed = Number(b.claimed) || 0;
      const games = (Number(b.games) || 0) + 1;
      const referrals = Number(b.referrals) || 0;   // išsaugom (kad bind skaitiklio neperrašytume)
      await c.from("f9_bases").upsert({ ronin_address: "refearn_" + R, buildings: { accrued, claimed, games, referrals } }, { onConflict: "ronin_address" });
      console.log(`[ReferralStore] 💰 +${amount} RONKE → referrer ${R.slice(0, 10)}… (accrued ${accrued})`);
    } catch (e: any) { console.warn("[ReferralStore] addEarnings fail:", e?.message); }
  });
}

// ── CREDIT: mačui pasibaigus — kiekvienam žaidėjui suranda referrer'į ir prideda 5% nuo tier.
//   Idempotentiška per roomId (refcredited_ unique insert → settle-retry nedvigubina). tier = RONKE.
export async function creditReferrers(p1: string, p2: string, tier: number, roomId: string): Promise<void> {
  const c = sb(); if (!c || !(tier > 0) || !roomId) return;
  try {
    const { error } = await c.from("f9_bases").insert({ ronin_address: "refcredited_" + roomId, buildings: { at: Date.now(), tier } });
    if (error) return;   // jau kredituota šiam mačui (konfliktas) → stop
  } catch { return; }
  const cut = Math.round((tier * REF_BPS) / 10000 * 1e6) / 1e6;   // 5% nuo tier (Modelis A)
  for (const p of [p1, p2]) {
    const pn = _norm(p);
    if (!_isAddr(pn)) continue;
    const R = await _referrerOf(c, pn);
    if (R && R !== pn) await _addEarnings(c, R, cut);
  }
}

// ── STATS: referrer'io statistika (referalų sk. + games + accrued/claimed/claimable).
export async function stats(referrer: string): Promise<{ referrals: number; games: number; accrued: number; claimed: number; claimable: number }> {
  const R = _norm(referrer);
  const empty = { referrals: 0, games: 0, accrued: 0, claimed: 0, claimable: 0 };
  const c = sb(); if (!c || !_isAddr(R)) return empty;
  try {
    const { data: earn } = await c.from("f9_bases").select("buildings").eq("ronin_address", "refearn_" + R).maybeSingle();
    const b = (earn as any)?.buildings || {};
    const accrued = Number(b.accrued) || 0, claimed = Number(b.claimed) || 0, games = Number(b.games) || 0, referrals = Number(b.referrals) || 0;
    return { referrals, games, accrued, claimed, claimable: Math.max(0, accrued - claimed) };
  } catch (e: any) { console.warn("[ReferralStore] stats fail:", e?.message); return empty; }
}

// ── CLAIM (reserve): referrer'iui apskaičiuoja claimable, ENQUEUE'ina payout (durabli eilė) IR pažymi
//   claimed. Op-serialized su credit'u (`earn_<R>`) → jokio race. Crash-safe: enqueue PIRMA su
//   DETERMINISTINIU id (`refclaim_<R>_<accrued>`) → PayoutQueue dedupe; markClaimed po to (payment per
//   flushQueue = minutės vėliau, tad window saugus). flushQueue faktiškai išmoka iš pool. Grąžina išmokamą X.
export async function reserveClaim(referrer: string): Promise<number> {
  const R = _norm(referrer);
  if (!_isAddr(R)) return 0;
  const c = sb(); if (!c) return 0;
  return _op("earn_" + R, async () => {
    try {
      const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", "refearn_" + R).maybeSingle();
      const b = (data as any)?.buildings || {};
      const accrued = Number(b.accrued) || 0, claimed = Number(b.claimed) || 0, games = Number(b.games) || 0, referrals = Number(b.referrals) || 0;
      const X = Math.round((accrued - claimed) * 1e6) / 1e6;
      if (!(X > 0)) return 0;
      // 🛡️ Sanity: absurdi suma (neturėtų atsitikti — ledgeris RLS-apsaugotas) → MANUAL peržiūra, ne auto-pay.
      const manual = X > REF_CLAIM_SANITY;
      if (manual) console.warn(`[ReferralStore] ⚠️ CLAIM ${X} RONKE → ${R.slice(0, 10)}… viršija sanity ${REF_CLAIM_SANITY} → MANUAL peržiūra`);
      // ENQUEUE PIRMA (durable + deterministinis id → idempotentiška; flushQueue išmokės iš pool):
      PayoutQueue.add({ to: R, amount: X, kind: "referral", roomId: "refclaim_" + R + "_" + Math.round(accrued * 1e6), manual });
      // tada markClaimed (window iki flushQueue payment = minutės → saugu nuo dvigubo):
      await c.from("f9_bases").upsert({ ronin_address: "refearn_" + R, buildings: { accrued, claimed: accrued, games, referrals } }, { onConflict: "ronin_address" });
      console.log(`[ReferralStore] 🎁 CLAIM ${X} RONKE → ${R.slice(0, 10)}… (enqueued; flushQueue išmokės iš pool)`);
      return X;
    } catch (e: any) { console.warn("[ReferralStore] reserveClaim fail:", e?.message); return 0; }
  });
}

// ── DRAIN: colyseus periodiškai apdoroja klientų claim-request'us (`refclaimreq_<R>`, rašo klientas anon).
//   Kiekvienam → reserveClaim → payout eilė; tada request trinamas. Pool raktas lieka TIK colyseus'e.
//   Saugu net be auth: claim moka TIK į R (rightful owner) → jokios vagystės; ledger = luba.
export async function drainClaimRequests(): Promise<number> {
  const c = sb(); if (!c) return 0;
  try {
    const { data } = await c.from("f9_bases").select("ronin_address,buildings").like("ronin_address", "refclaimreq\\_%").limit(50);
    let n = 0;
    for (const row of (data || [])) {
      const key = String((row as any).ronin_address || "");
      const R = _norm(String((row as any)?.buildings?.addr || key.replace(/^refclaimreq_/, "")));
      if (_isAddr(R)) { const x = await reserveClaim(R); if (x > 0) n++; }
      try { await c.from("f9_bases").delete().eq("ronin_address", key); } catch {}   // apdorotas → trinam
    }
    if (n) console.log(`[ReferralStore] drain: apdorota ${n} claim'ų`);
    return n;
  } catch (e: any) { console.warn("[ReferralStore] drain fail:", e?.message); return 0; }
}

export { _norm as normAddr, _isAddr as isAddr, REF_BPS };
