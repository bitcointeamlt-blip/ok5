import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* 🔥📜 PILIES BURN AUTORIZACIJŲ SANDĖLIS (2026-08-21, user: „tokiu pat principu kaip ir ball žaidime").
 *
 * BALL ŽAIDIME (F12) mirtis tikra: prieš mūšį žaidėjas pasirašo EIP-712 `BurnAuth`, o po mūšio relayer
 * kviečia `PewPewBarracks.burnAuthorized(...)` ir NFT sudega. Todėl ten nėra jokio išsisukinėjimo —
 * token'o tiesiog nebelieka.
 *
 * PILYJE PROBLEMA KITA: gynėją puola, kai jis MIEGA — jo parašo tuo momentu gauti neįmanoma.
 * SPRENDIMAS: parašai imami IŠ ANKSTO, dedant būrį į pilies lauką. Žaidėjas pasirašo kelias
 * autorizacijas (kiekviena su savo `nonce`, ilgu `deadline`, tam pačiam būrio sąrašui). Jos guli čia,
 * o mirties momentu serveris paima vieną ir sudegina — nesvarbu, ar savininkas prisijungęs.
 *
 * ⚠️ Kontraktas turi `usedBurnNonces` — **vienas parašas = vienas burn TX**. Todėl laikom BASEINĄ
 *    (keli parašai) ir papildom, kai žaidėjas kitą kartą atidaro pilį.
 *
 * Saugykla: `f9_bases` eilutė `<addr>#burnauth` → buildings = { auths: [...], used: [...], ver }
 *   auths[i] = { battleId, nonce, deadline, sig, tokens: string[] }
 * CAS per `ver` (kaip BlessShield) — du kambariai vienu metu nepaims to paties parašo.
 */

const CAS_RETRIES = 4;
const MAX_POOL = 24;                     // sveiko proto riba vienai piniginei
export const BURN_AUTH_TARGET = 6;       // kiek parašų laikom „pilname" baseine
export const BURN_AUTH_DAYS = 7;         // kiek galioja (deadline) — pilyje raidas gali ateiti po parų

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
const _key = (a: string) => _norm(a) + "#burnauth";

export type BurnAuth = { battleId: string; nonce: string; deadline: number; sig: string; tokens: string[] };
type Row = { auths: BurnAuth[]; used: string[]; ver: number; fresh: boolean; noVer: boolean };

const _sane = (a: any): BurnAuth | null => {
  if (!a) return null;
  const battleId = String(a.battleId || ""), nonce = String(a.nonce || ""), sig = String(a.sig || a.signature || "");
  const deadline = Number(a.deadline) || 0;
  const tokens = Array.isArray(a.tokens) ? a.tokens.map((t: any) => String(t)).filter(Boolean) : [];
  if (!/^[0-9]{1,78}$/.test(battleId) || !/^[0-9]{1,78}$/.test(nonce)) return null;
  if (!/^0x[0-9a-fA-F]{100,}$/.test(sig)) return null;
  if (!deadline || !tokens.length) return null;
  return { battleId, nonce, deadline, sig, tokens };
};

async function _read(addr: string): Promise<Row> {
  const c = sb(); if (!c) return { auths: [], used: [], ver: 0, fresh: true, noVer: true };
  const { data, error } = await c.from("f9_bases").select("buildings").eq("ronin_address", _key(addr)).maybeSingle();
  if (error) throw new Error("[F9BurnAuth] read: " + (error.message || "db error"));
  const b = (data as any)?.buildings || {};
  const auths = (Array.isArray(b.auths) ? b.auths : []).map(_sane).filter(Boolean) as BurnAuth[];
  const used = (Array.isArray(b.used) ? b.used : []).map((x: any) => String(x));
  return { auths, used, ver: Number(b.ver) || 0, fresh: !data, noVer: b.ver == null };
}

async function _write(addr: string, r: Row): Promise<boolean> {
  const c = sb(); if (!c) return true;
  const body = { auths: r.auths.slice(0, MAX_POOL), used: r.used.slice(-200), ver: (r.ver || 0) + 1 };
  if (r.fresh) {
    const { error } = await c.from("f9_bases").insert({ ronin_address: _key(addr), units: [], buildings: body, updated_at: new Date().toISOString() });
    if (!error) return true;
    if (/duplicate|unique|conflict/i.test(error.message || "")) return false;
    throw new Error("[F9BurnAuth] write: " + (error.message || "db error"));
  }
  let q = c.from("f9_bases")
    .update({ units: [], buildings: body, updated_at: new Date().toISOString() })
    .eq("ronin_address", _key(addr));
  q = r.noVer ? q.filter("buildings->>ver", "is", null) : q.filter("buildings->>ver", "eq", String(r.ver || 0));
  const { data, error } = await q.select("ronin_address");
  if (error) throw new Error("[F9BurnAuth] write: " + (error.message || "db error"));
  return !!(data && data.length);
}

// Kiek galiojančių parašų turi (klientui — ar prašyti pasirašyti daugiau).
export async function burnAuthCount(addr: string): Promise<number> {
  try {
    const now = Math.floor(Date.now() / 1000);
    return (await _read(_norm(addr))).auths.filter((a) => a.deadline > now).length;
  } catch (_) { return 0; }
}

// Prideda naujus parašus (dedant būrį į lauką). Grąžina, kiek dabar baseine.
export async function burnAuthAdd(addr: string, list: any[]): Promise<number> {
  const a = _norm(addr);
  const fresh = (Array.isArray(list) ? list : []).map(_sane).filter(Boolean) as BurnAuth[];
  if (!a || !fresh.length || !sb()) return 0;
  for (let i = 0; i < CAS_RETRIES; i++) {
    try {
      const row = await _read(a);
      const have = new Set(row.auths.map((x) => x.nonce));
      const usedSet = new Set(row.used);
      for (const f of fresh) {
        if (have.has(f.nonce) || usedSet.has(f.nonce)) continue;   // dublis / jau sunaudotas
        if (row.auths.length >= MAX_POOL) break;
        row.auths.push(f); have.add(f.nonce);
      }
      if (await _write(a, row)) {
        console.log(`[F9BurnAuth] 📜 ${a.slice(0, 10)}… baseinas: ${row.auths.length} parašų`);
        return row.auths.length;
      }
    } catch (e: any) { console.warn("[F9BurnAuth] add fail:", e?.message); return 0; }
  }
  return 0;
}

/* 🔥 Paima VIENĄ galiojantį parašą, apimantį VISUS nurodytus tokenId, ir iškart pažymi sunaudotą (CAS).
 *
 * Kodėl masyvas, o ne vienas tokenas: `burnAuthorized` priima tokenų MASYVĄ, tad vienas parašas gali
 * sudeginti visą mačo auką. Anksčiau degindavom po vieną ⇒ 3 žuvę unitai suvalgydavo 3 parašus ir
 * baseino tekdavo prašyti po kiekvienos kovos. Dabar 1 parašas = 1 mūšis.
 *
 * Grąžina null, jei tinkamo nėra. Jei nė vienas parašas neapima VISŲ, imam tą, kuris apima daugiausia —
 * skambintojas likusius sudegins kitu parašu (žr. burnDeadUnits). */
export async function burnAuthTake(addr: string, tokenIds: string | string[]): Promise<BurnAuth | null> {
  const a = _norm(addr);
  const ids = (Array.isArray(tokenIds) ? tokenIds : [tokenIds]).map((t) => String(t || "")).filter(Boolean);
  if (!a || !ids.length || !sb()) return null;
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < CAS_RETRIES; i++) {
    try {
      const row = await _read(a);
      const valid = row.auths.map((x, idx) => ({ x, idx })).filter((e) => e.x.deadline > now);
      if (!valid.length) return null;
      const covered = (e: { x: BurnAuth }) => ids.filter((id) => e.x.tokens.includes(id)).length;
      let best = valid[0], bestN = covered(valid[0]);
      for (const e of valid) { const n = covered(e); if (n > bestN) { best = e; bestN = n; } }
      if (bestN === 0) return null;                       // nė vienas iš prašomų tokenų neautorizuotas
      const auth = row.auths[best.idx];
      row.auths.splice(best.idx, 1);
      row.used.push(auth.nonce);
      if (await _write(a, row)) return auth;
    } catch (e: any) { console.warn("[F9BurnAuth] take fail:", e?.message); return null; }
  }
  return null;
}

// 🔙 Grąžina parašą į baseiną (jei burn TX nepavyko — parašas dar galioja, nonce nesunaudotas grandinėje).
export async function burnAuthReturn(addr: string, auth: BurnAuth): Promise<void> {
  const a = _norm(addr);
  if (!a || !auth || !sb()) return;
  for (let i = 0; i < CAS_RETRIES; i++) {
    try {
      const row = await _read(a);
      if (row.auths.some((x) => x.nonce === auth.nonce)) return;
      row.auths.push(auth);
      row.used = row.used.filter((n) => n !== auth.nonce);
      if (await _write(a, row)) { console.log(`[F9BurnAuth] 🔙 parašas grąžintas į baseiną (${a.slice(0, 10)}…)`); return; }
    } catch (_) { return; }
  }
}
