import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { boneBankOp } from "./BaseStore";
import { blessConsume } from "./BlessBank";

// 🪽🛡 BLESS SKYDAS ANT UNITO (2026-08-19, user vizija):
//   „uždedi BLESS ant unito → jei jis TURĖTŲ MIRTI, vietoj mirties keliauja į ligoninę".
//   Panaudojimas VIENKARTINIS: vienas mačas = vienas BLESS, sudega nesvarbu ar prireikė.
//
//   Persist: `<addr>#blessprot` eilutė f9_bases → buildings = { ids: { "<tokenId>": at }, ver }.
//   Ta pati CAS apsauga kaip BlessBank (dvi kortos / keli procesai neperrašo vienas kito).
//   ⚠️ Mirtis F9 PvP šiuo metu IŠJUNGTA (INJURY_CHANCE=1.0) → skydas nesuveiks, kol user jos negrąžins.
//      Mechanika ir UI paruošti; įjungimas = vienas skaičius F9PvpRoom.ts.

const CAS_RETRIES = 4;
const MAX_SHIELDS = 60;   // sveiko proto riba vienai piniginei

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
const _key = (a: string) => _norm(a) + "#blessprot";

type ShieldRow = { ids: Record<string, number>; ver: number; fresh: boolean; noVer: boolean };

async function _read(addr: string): Promise<ShieldRow> {
  const c = sb(); if (!c) return { ids: {}, ver: 0, fresh: true, noVer: true };
  const { data, error } = await c.from("f9_bases").select("buildings").eq("ronin_address", _key(addr)).maybeSingle();
  if (error) throw new Error("[BlessShield] read: " + (error.message || "db error"));
  const b = (data as any)?.buildings || {};
  const ids: Record<string, number> = {};
  for (const k of Object.keys(b.ids || {})) ids[String(k)] = Number(b.ids[k]) || 0;
  return { ids, ver: Number(b.ver) || 0, fresh: !data, noVer: b.ver == null };
}
async function _write(addr: string, r: ShieldRow): Promise<boolean> {
  const c = sb(); if (!c) return true;
  const body = { ids: r.ids, ver: (r.ver || 0) + 1 };
  if (r.fresh) {
    const { error } = await c.from("f9_bases").insert({ ronin_address: _key(addr), units: [], buildings: body, updated_at: new Date().toISOString() });
    if (!error) return true;
    if (/duplicate|unique|conflict/i.test(error.message || "")) return false;
    throw new Error("[BlessShield] write: " + (error.message || "db error"));
  }
  let q = c.from("f9_bases")
    .update({ units: [], buildings: body, updated_at: new Date().toISOString() })
    .eq("ronin_address", _key(addr));
  q = r.noVer ? q.filter("buildings->>ver", "is", null) : q.filter("buildings->>ver", "eq", String(r.ver || 0));
  const { data, error } = await q.select("ronin_address");
  if (error) throw new Error("[BlessShield] write: " + (error.message || "db error"));
  return !!(data && data.length);
}

// Kurie unitai šiuo metu apsaugoti (tokenId sąrašas).
export async function shieldList(addr: string): Promise<string[]> {
  try { return Object.keys((await _read(_norm(addr))).ids); } catch { return []; }
}

/* UŽDĖJIMAS: nurašom po 1 BLESS už kiekvieną NAUJAI apsaugotą unitą (jau apsaugoti praleidžiami,
 * antrą kartą neapmokestinami). Fail-closed: nepavykus įrašyti — itemai GRĄŽINAMI. */
export async function shieldAdd(addr: string, tokenIds: string[]): Promise<{ ok: boolean; added: string[]; skipped: string[]; reason?: string }> {
  const a = _norm(addr);
  const want = [...new Set((tokenIds || []).map((t) => String(t || "").trim()).filter(Boolean))];
  if (!want.length) return { ok: false, added: [], skipped: [], reason: "no_units" };
  return boneBankOp(a + "#blessprot", async () => {
    let cur: ShieldRow;
    try { cur = await _read(a); } catch { return { ok: false, added: [], skipped: [], reason: "db" }; }
    const fresh = want.filter((t) => !cur.ids[t]);
    const skipped = want.filter((t) => !!cur.ids[t]);
    if (!fresh.length) return { ok: true, added: [], skipped, reason: "already" };
    if (Object.keys(cur.ids).length + fresh.length > MAX_SHIELDS) return { ok: false, added: [], skipped, reason: "too_many" };

    const paid = await blessConsume(a, fresh.length);   // 💸 po 1 BLESS už unitą
    if (!paid.ok) return { ok: false, added: [], skipped, reason: "not_enough" };

    for (let i = 0; i < CAS_RETRIES; i++) {
      try {
        const r = i === 0 ? cur : await _read(a);
        const ids = { ...r.ids };
        const now = Date.now();
        for (const t of fresh) ids[t] = now;
        if (!(await _write(a, { ...r, ids }))) continue;
        console.log(`[BlessShield] 🪽 +${fresh.length} skydai (${a.slice(0, 10)}…) → viso ${Object.keys(ids).length}`);
        return { ok: true, added: fresh, skipped };
      } catch { break; }
    }
    // įrašyti nepavyko → grąžinam nurašytus itemus (geriau grąžinti, nei praryti)
    try { const { blessCredit } = await import("./BlessBank"); await blessCredit(a, fresh.length); } catch (_) {}
    return { ok: false, added: [], skipped, reason: "db" };
  });
}

/* SUDEGINIMAS: po mačo (nesvarbu ar prireikė) arba kai skydas suveikė. Itemai NEgrąžinami. */
export async function shieldBurn(addr: string, tokenIds: string[]): Promise<number> {
  const a = _norm(addr);
  const list = [...new Set((tokenIds || []).map((t) => String(t || "").trim()).filter(Boolean))];
  if (!list.length) return 0;
  return boneBankOp(a + "#blessprot", async () => {
    for (let i = 0; i < CAS_RETRIES; i++) {
      try {
        const r = await _read(a);
        const ids = { ...r.ids };
        let n = 0;
        for (const t of list) if (ids[t]) { delete ids[t]; n++; }
        if (!n) return 0;
        if (!(await _write(a, { ...r, ids }))) continue;
        console.log(`[BlessShield] 🔥 -${n} skydai sudegė (${a.slice(0, 10)}…)`);
        return n;
      } catch { return 0; }
    }
    return 0;
  });
}
