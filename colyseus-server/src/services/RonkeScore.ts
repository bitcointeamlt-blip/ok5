// 🏆⛏️ RONKE SCORE → kasimo lojalumo daugiklis (2026-08-13, user).
//   Score šaltinis: ronke-analytics.vercel.app viešas API (be auth, dieninis snapshot 07:00 UTC).
//   Idėja: Ronke Power = kovinė galia iš deko, Ronke Score = bendruomenės lojalumas (RONKE holding trukmė,
//   diamond hands, NFT rarity) → premijuojam KASIMĄ, ne kovą (nedubliuoja Power, nekelia pay-to-win).
//   Tier'ai pagal API `percentile` (pats normalizuojasi augant holderių populiacijai; user 08-13):
//     top 1% ×1.5 · top 5% ×1.25 · top 10% ×1.15 · top 25% ×1.10 · top 50% ×1.05 · kiti ×1.0.
//   🔑 FAIL-OPEN: API triktis / nėra score → ×1.0 (kasimas NIEKADA nelūžta dėl išorinio servizo).
//   Sync accessor + fono refresh (kaip chainDeckCached) — _mineRateFrom yra sinchroninis.

const API_BASE = process.env.RONKE_SCORE_API || "https://ronke-analytics.vercel.app/api/v1";
const TTL_MS = 60 * 60 * 1000;        // sėkmingo fetch kešas 1 h (duomenys vis tiek dieniniai)
const FAIL_TTL_MS = 10 * 60 * 1000;   // nepavykusio fetch kešas 10 min (nespamminam mirusio API)

export type ScoreTier = { mult: number; label: string; score: number; pct: number };
const NO_TIER: ScoreTier = { mult: 1, label: "", score: 0, pct: 0 };

// [min percentilė, daugiklis, etiketė] — nuo aukščiausio žemyn.
const TIERS: Array<[number, number, string]> = [
  [99, Number(process.env.F9_SCORE_MULT_P99 || 1.5), "TOP 1%"],
  [95, Number(process.env.F9_SCORE_MULT_P95 || 1.25), "TOP 5%"],
  [90, Number(process.env.F9_SCORE_MULT_P90 || 1.15), "TOP 10%"],
  [75, Number(process.env.F9_SCORE_MULT_P75 || 1.1), "TOP 25%"],
  [50, Number(process.env.F9_SCORE_MULT_P50 || 1.05), "TOP 50%"],
];

export function tierFor(percentile: number, score: number): ScoreTier {
  for (const [minP, mult, label] of TIERS) {
    if (percentile >= minP) return { mult, label, score, pct: percentile };
  }
  return { ...NO_TIER, score, pct: percentile };
}

const _cache = new Map<string, { tier: ScoreTier; at: number; ok: boolean }>();
const _inflight = new Set<string>();

async function _fetchTier(addr: string): Promise<void> {
  try {
    const f: any = (globalThis as any).fetch;
    if (!f) { _cache.set(addr, { tier: NO_TIER, at: Date.now(), ok: false }); return; }
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const res = await f(`${API_BASE}/score/${addr}`, { signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) {   // 404 = piniginė be score → legit ×1.0 su pilnu TTL; kiti kodai = triktis (trumpas TTL)
      _cache.set(addr, { tier: NO_TIER, at: Date.now(), ok: res.status === 404 });
      return;
    }
    const j: any = await res.json();
    const pct = Number(j?.data?.percentile) || 0;
    const score = Number(j?.data?.score) || 0;
    const t = tierFor(pct, score);
    _cache.set(addr, { tier: t, at: Date.now(), ok: true });
    if (t.mult > 1) console.log(`[RonkeScore] ${addr.slice(0, 10)}… score ${score} (${t.label}) → kasimas ×${t.mult}`);
  } catch (e: any) {
    _cache.set(addr, { tier: NO_TIER, at: Date.now(), ok: false });
    console.warn(`[RonkeScore] fetch fail ${addr.slice(0, 10)}…:`, e?.message);
  }
}

/* ⏳ ASYNC: palaukia realaus atsakymo (kešas tas pats). Reikalinga ten, kur tiksli pakopa svarbesnė
 * už greitį ir kur galima palaukti — pvz. ⚡ BLESS paros claim'as (vienas mygtuko paspaudimas). */
export async function scoreTierNow(address: string): Promise<ScoreTier> {
  const addr = (address || "").trim().toLowerCase();
  if (!addr) return NO_TIER;
  const hit = _cache.get(addr);
  const ttl = hit && hit.ok ? TTL_MS : FAIL_TTL_MS;
  if (hit && Date.now() - hit.at < ttl) return hit.tier;
  await _fetchTier(addr);
  const now = _cache.get(addr);
  return now ? now.tier : NO_TIER;
}

// Sync: grąžina kešuotą tier (nesant — ×1.0) ir fone atsišviežina jei pasenęs. Kasimo keliui saugu visada.
export function scoreTierCached(address: string): ScoreTier {
  const addr = (address || "").trim().toLowerCase();
  if (!addr) return NO_TIER;
  const hit = _cache.get(addr);
  const ttl = hit && hit.ok ? TTL_MS : FAIL_TTL_MS;
  if (!hit || Date.now() - hit.at >= ttl) {
    if (!_inflight.has(addr)) {
      _inflight.add(addr);
      _fetchTier(addr).finally(() => _inflight.delete(addr));
    }
  }
  return hit ? hit.tier : NO_TIER;
}
