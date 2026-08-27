import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { deathProtected, deathGuardNote } from "./DeathGuard";   // 💀🛡 lokalus procesas nemarina TIKRŲ NFT

/* 💀🌍 GLOBALUS MIRUSIŲ UNITŲ REGISTRAS (2026-08-21, user: „jeigu miršta, tai miršta — paprasta
 * taisyklė… kad nebūtų jokių išsisukinėjimo atvejų nuo mirties pabėgti").
 *
 * KODĖL REIKĖJO: iki šiol mirtis buvo saugoma PER ADRESĄ (`f9_bases.<addr>.buildings.deadUnits`).
 * Tai reiškė, kad tas pats tokenId mirdavo tik SAVININKUI — pardavus/perdavus NFT naujam adresui
 * unitas atgydavo. Tas pats galiojo bet kokiam adreso pakeitimui. Dabar mirtis rišama prie TOKENO,
 * ne prie piniginės: kartą miręs tokenId negrįžta į žaidimą NIEKAM ir NIEKADA.
 *
 * Saugykla (be naujų lentelių — ta pati `f9_bases`): eilutės `__f9dead__#<0..9>`, skaidymas pagal
 * PASKUTINĮ tokenId skaitmenį, kad viena eilutė neaugtų be ribų ir CAS konkurencija būtų mažesnė.
 *   buildings = { ids: { "<tokenId>": mirties_laikas }, ver }
 *
 * ⚠️ Registras tik AUGA. Ištrinti įrašą galima tik ranka DB (sąmoningas admin veiksmas).
 */

const CAS_RETRIES = 5;
const SHARDS = 10;
const CACHE_MS = 30_000;   // kiek laiko in-memory kopija laikoma šviežia (mirtys papildo ją iškart)

let _sb: SupabaseClient | null = null; let _sbTried = false;
function sb(): SupabaseClient | null {
  if (_sbTried) return _sb;
  _sbTried = true;
  const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}

const _t = (x: any) => String(x ?? "").trim();
// Dev/testiniai tokenai ('dev0'…) į registrą nepatenka — jie nėra tikri NFT.
export const isRealToken = (t: any) => { const s = _t(t); return !!s && !/^dev/i.test(s); };
function _shard(tokenId: string): string {
  const m = tokenId.match(/(\d)(?!.*\d)/);   // paskutinis skaitmuo
  return "__f9dead__#" + (m ? m[1] : "0");
}

type Row = { ids: Record<string, number>; ver: number; fresh: boolean; noVer: boolean };

async function _read(key: string): Promise<Row> {
  const c = sb(); if (!c) return { ids: {}, ver: 0, fresh: true, noVer: true };
  const { data, error } = await c.from("f9_bases").select("buildings").eq("ronin_address", key).maybeSingle();
  if (error) throw new Error("[DeadRegistry] read: " + (error.message || "db error"));
  const b = (data as any)?.buildings || {};
  const ids: Record<string, number> = {};
  for (const k of Object.keys(b.ids || {})) ids[String(k)] = Number(b.ids[k]) || 0;
  return { ids, ver: Number(b.ver) || 0, fresh: !data, noVer: b.ver == null };
}

async function _write(key: string, r: Row): Promise<boolean> {
  const c = sb(); if (!c) return true;
  const body = { ids: r.ids, ver: (r.ver || 0) + 1 };
  if (r.fresh) {
    const { error } = await c.from("f9_bases").insert({ ronin_address: key, units: [], buildings: body, updated_at: new Date().toISOString() });
    if (!error) return true;
    if (/duplicate|unique|conflict/i.test(error.message || "")) return false;   // kitas procesas aplenkė → retry
    throw new Error("[DeadRegistry] write: " + (error.message || "db error"));
  }
  let q = c.from("f9_bases")
    .update({ units: [], buildings: body, updated_at: new Date().toISOString() })
    .eq("ronin_address", key);
  q = r.noVer ? q.filter("buildings->>ver", "is", null) : q.filter("buildings->>ver", "eq", String(r.ver || 0));
  const { data, error } = await q.select("ronin_address");
  if (error) throw new Error("[DeadRegistry] write: " + (error.message || "db error"));
  return !!(data && data.length);
}

/* ── in-memory kopija ────────────────────────────────────────────────────────────────────────
 * `_mem` yra TIESA šiam procesui: mirtis įrašoma čia IŠKART (dar prieš DB), tad net nukritus DB
 * miręs unitas nebeatsistos tame pačiame kambaryje. `_loadedAt` valdo tik perskaitymo dažnį. */
const _mem = new Set<string>();
let _loadedAt = 0;
let _loading: Promise<void> | null = null;

async function _refresh(): Promise<void> {
  const c = sb(); if (!c) return;
  const keys = Array.from({ length: SHARDS }, (_, i) => "__f9dead__#" + i);
  const { data, error } = await c.from("f9_bases").select("ronin_address,buildings").in("ronin_address", keys);
  if (error) throw new Error("[DeadRegistry] refresh: " + (error.message || "db error"));
  for (const row of (data || []) as any[]) {
    for (const k of Object.keys(((row.buildings || {}).ids) || {})) _mem.add(String(k));
  }
  _loadedAt = Date.now();
}

/* Užtikrina, kad kopija šviežia. FAIL-OPEN skaitymui: jei DB nepasiekiama, grąžinam ką turim —
 * geriau žinoti apie dalį mirusių, nei nulūžti ir įleisti visus. Įrašymas fail-open NĖRA (žr. add). */
export async function deadEnsure(): Promise<Set<string>> {
  if (!sb()) return _mem;
  if (Date.now() - _loadedAt < CACHE_MS) return _mem;
  if (!_loading) {
    _loading = _refresh()
      .catch((e: any) => { console.warn("[DeadRegistry] ⚠️ refresh fail (naudojam turimą kopiją):", e?.message); })
      .finally(() => { _loading = null; });
  }
  await _loading;
  if (_pending.size) void deadFlushPending();   // proga pabaigti tai, kas neįsirašė
  return _mem;
}

// Sinchroninis patikrinimas jau užkrautai kopijai (karštuose mūšio keliuose — be await).
export function deadHas(tokenId: any): boolean {
  const t = _t(tokenId);
  return !!t && _mem.has(t);
}

// Visa kopija (skaitymui/filtrams). Nekopijuojam — skambintojas NEMODIFIKUOJA.
export function deadAll(): Set<string> { return _mem; }

/* Įrašo mirtį GLOBALIAI. In-memory — iškart; DB — su CAS ir kartojimais.
 * Grąžina true, jei DB įrašas pavyko (false = liko tik šiame procese; kviečiantysis gali pakartoti). */
export async function deadAdd(tokenIds: any[]): Promise<boolean> {
  const all = (tokenIds || []).map(_t).filter(isRealToken);
  /* 💀🛡 Trečias saugiklio sluoksnis (2026-08-21): registras negrįžtamas, tad į jį iš lokalaus
   * proceso patenka TIK testiniai tokenai. Filtruojam čia, kad jokia nauja iškvietimo vieta
   * negalėtų apeiti apsaugos (žr. DeathGuard.ts). */
  const list = all.filter((t) => {
    if (!deathProtected(t)) return true;
    console.warn(deathGuardNote(t) + " (registras nepapildytas)");
    return false;
  });
  if (!list.length) return true;
  for (const t of list) _mem.add(t);   // 🔒 procese mirtis galioja NEDELSIANT
  const c = sb(); if (!c) return false;

  const byShard = new Map<string, string[]>();
  for (const t of list) {
    const k = _shard(t);
    const arr = byShard.get(k);
    if (arr) arr.push(t); else byShard.set(k, [t]);
  }
  let allOk = true;
  for (const [key, ids] of byShard) {
    let done = false;
    for (let i = 0; i < CAS_RETRIES && !done; i++) {
      try {
        const row = await _read(key);
        let changed = false;
        const now = Date.now();
        for (const t of ids) if (!row.ids[t]) { row.ids[t] = now; changed = true; }
        if (!changed) { done = true; break; }   // jau įrašyti
        if (await _write(key, row)) done = true;
      } catch (e: any) {
        console.warn("[DeadRegistry] add fail (" + key + "):", e?.message);
        break;
      }
    }
    if (done) for (const t of ids) _pending.delete(t);
    else { allOk = false; for (const t of ids) _pending.add(t); }
  }
  if (allOk) console.log(`[DeadRegistry] 💀 globaliai užfiksuota: ${list.join(",")}`);
  else console.warn(`[DeadRegistry] ⚠️ DB įrašas nepavyko: ${list.join(",")} — kartosim automatiškai`);
  return allOk;
}

/* 🔁 Neįrašytos mirtys. Be šito DB triktis reikštų, kad mirtis lieka tik šio proceso atmintyje ir
 * po restarto unitas „atgyja" — būtent tokia išsisukinėjimo spraga, kurios negalima palikti. */
const _pending = new Set<string>();
export function deadPendingCount(): number { return _pending.size; }
export async function deadFlushPending(): Promise<void> {
  if (!_pending.size || !sb()) return;
  const list = Array.from(_pending);
  console.log(`[DeadRegistry] 🔁 kartojam ${list.length} neįrašytą mirtį`);
  await deadAdd(list);
}
