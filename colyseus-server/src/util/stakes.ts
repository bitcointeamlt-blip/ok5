// ── F9 KotH FFA — mirties stakes (LOCKED design 2026-06-23). ──
// Naudojama FAZĖJE E (settlement). Žr. memory/project_f9_koth_ffa_mode.md.

// 3 dienų užrakinimas (ms) — kai unitas miršta, bet NEpermadie.
export const LOCK_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Permadeath tikimybė (0..1) pagal unito lygį.
 * LOCKED kreivė: lvl 0–5 = 10%, tada −1% kas 2 lygiai, floor 1% (pasiekiamas @ lvl 22+).
 *   lvl  0–5: 10% | 6–7: 9% | 8–9: 8% | 10–11: 7% | 12–13: 6%
 *   lvl 14–15: 5% | 16–17: 4% | 18–19: 3% | 20–21: 2% | 22+: 1%
 */
export function permadeathChance(lvl: number): number {
  const pct = Math.min(10, Math.max(1, 10 - Math.floor((lvl - 4) / 2)));
  return pct / 100;
}
