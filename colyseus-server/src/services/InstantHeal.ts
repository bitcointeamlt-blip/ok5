import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { boneBankOp } from "./BaseStore";

// ⚡🔵 RONKE BLESS — instant-heal charges (2026-07-05, user):
//   Kiekvienas piniginėj laikomas Ronkeverse NFT = 1 momentinis sužaloto unito pagydymas per ROLLING 24h.
//   Cap 30/parą. 0 NFT → 0 charge'ų. Serializuota (`<addr>#instaheal` eilutė) — jokio double-spend.
//   Ronkeverse skaičius paduodamas iš išorės (F9PvpRoom chainCounts(addr).rv — jau kešuojamas 10min).

const DAILY_CAP = 30;
const WINDOW_MS = 24 * 60 * 60 * 1000;

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
const _key = (a: string) => _norm(a) + "#instaheal";

export function instantHealCap(ronkeverseCount: number): number {
  return Math.max(0, Math.min(DAILY_CAP, Math.floor(ronkeverseCount || 0)));
}

// {used, windowStart} + rolling reset (jei langas pasibaigęs → used=0, langas nuo dabar). Read-only nepersistina reset'o.
// 🛡 S-M5 konvencija (07-06 fix): DB KLAIDĄ metam (ne used=0), kad consume atskirtų „triktis" nuo „nauja eilutė"
//   ir per outage'ą NEduotų nemokamų neriboto heal'ų (fail-OPEN buvo kritinis anti-cheat pažeidimas).
async function _read(addr: string, now: number): Promise<{ used: number; windowStart: number }> {
  const c = sb(); if (!c) return { used: 0, windowStart: now };   // nėra kliento (dev) → be persistencijos (heal'as vis tiek neįrašomas)
  const { data, error } = await c.from("f9_bases").select("buildings").eq("ronin_address", _key(addr)).maybeSingle();
  if (error) throw new Error("[InstantHeal] read: " + (error.message || "db error"));   // triktis → mesti (fail-closed)
  const b = (data as any)?.buildings || {};   // data===null = TIKRAI nėra eilutės (pirmas naudojimas) → used=0
  let used = Number.isFinite(+b.used) ? Math.max(0, Math.floor(+b.used)) : 0;
  let windowStart = Number.isFinite(+b.windowStart) ? +b.windowStart : now;
  if (now - windowStart >= WINDOW_MS) { used = 0; windowStart = now; }   // rolling reset
  return { used, windowStart };
}
async function _write(addr: string, used: number, windowStart: number): Promise<void> {
  const c = sb(); if (!c) return;
  const { error } = await c.from("f9_bases").upsert(
    { ronin_address: _key(addr), units: [], buildings: { used, windowStart }, updated_at: new Date().toISOString() },
    { onConflict: "ronin_address" },
  );
  if (error) throw new Error("[InstantHeal] write: " + (error.message || "db error"));   // 🛡 rašymas nepavyko → consume laikys FAIL (jokio nemokamo heal)
}

export type InstaStatus = { cap: number; used: number; remaining: number; resetAt: number };
export async function instantHealStatus(addr: string, ronkeverseCount: number): Promise<InstaStatus> {
  const cap = instantHealCap(ronkeverseCount);
  const now = Date.now();
  try {
    const { used, windowStart } = await _read(_norm(addr), now);
    const u = Math.min(used, cap);
    return { cap, used: u, remaining: Math.max(0, cap - u), resetAt: windowStart + WINDOW_MS };
  } catch {
    // 🛡 DB triktis → konservatyvu: remaining=0 (kaip consume fail-closed); NEmetam, kad nesugriūtų hospital_get.
    return { cap, used: cap, remaining: 0, resetAt: now + WINDOW_MS };
  }
}

// Bando panaudoti 1 charge'ą (serializuota per `<addr>#instaheal`). ok=false jei nebeliko / 0 NFT.
export async function consumeInstantHeal(addr: string, ronkeverseCount: number): Promise<{ ok: boolean; remaining: number; cap: number }> {
  const a = _norm(addr);
  const cap = instantHealCap(ronkeverseCount);
  if (cap <= 0) return { ok: false, remaining: 0, cap: 0 };
  return boneBankOp(a + "#instaheal", async () => {
    try {
      const now = Date.now();
      const { used, windowStart } = await _read(a, now);
      if (used >= cap) return { ok: false, remaining: 0, cap };
      const nu = used + 1;
      await _write(a, nu, windowStart);   // jei rašymas nepavyko → throw → catch → ok:false (heal NEduodamas)
      return { ok: true, remaining: Math.max(0, cap - nu), cap };
    } catch { return { ok: false, remaining: 0, cap }; }   // 🛡 FAIL-CLOSED: DB triktis → jokio nemokamo heal
  });
}

// Grąžina 1 charge'ą (serializuota) — kai charge suvartotas, bet heal galiausiai NEĮVYKO
//   (pvz. unitas pasveiko natūraliai per async langą tarp consume ir splice). windowStart NEliečiam.
export async function refundInstantHeal(addr: string): Promise<void> {
  const a = _norm(addr);
  await boneBankOp(a + "#instaheal", async () => {
    try {
      const now = Date.now();
      const { used, windowStart } = await _read(a, now);
      if (used > 0) await _write(a, used - 1, windowStart);
    } catch { /* refund best-effort — prarastas charge (retas) geriau nei nemokamas heal; ne-exploituojama */ }
  });
}
