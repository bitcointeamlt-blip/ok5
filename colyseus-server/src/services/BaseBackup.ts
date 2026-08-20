import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BaseBuildings } from "./BaseStore";

/* 🏰💾 PILIES PROGRESO ATSARGINĖ KOPIJA + SAVIGYDA (2026-08-20, user: „daryk sistemą, kad progresai
 * kažkaip išsisaugotų — sienų, zip bokštų lygiai ir POZICIJOS, ligoninė").
 *
 * KODĖL: sienos / bokštų lygis+pozicijos / ligoninės lygis yra VIENINTELIAI laukai, kurių niekas
 * neperrašo kasdien — jie rašomi TIK tada, kai žaidėjas ką nors nusiperka už kaulus. Todėl bet koks
 * vienkartinis `buildings` sugadinimas juos praranda AMŽINAI (08-20 taip dingo žaidėjo siena ir
 * zip bokštai), o kapinių/kasimo laukus jų pačių saugotojai atstato per kelias sekundes.
 *
 * KAIP: atskira eilutė `<addr>#bak` (tas pats vardų erdvės triukas kaip #bones/#bless — DDL negalimas):
 *   {
 *     hi:    { wl, tl, hl, tow: [{y,l}], at },   // 🔝 AUKŠČIAUSIAS kada nors matytas statinių taškas
 *     snaps: [ { at, b: {…visas buildings…} } ], // 📸 iki SNAP_KEEP pilnų kopijų (throttle 1/val.)
 *     ver
 *   }
 *
 * SAVIGYDA: `healStructures()` palygina ką tik užkrautą pilį su `hi`. Jei DB reikšmės ŽEMESNĖS —
 * grąžina pataisytą objektą. Žaidime statiniai NIEKADA nekrenta (downgrade'o nėra, bokštai
 * negriaunami visam laikui), tad „žemiau nei buvo" = duomenų praradimas, ne teisėtas pokytis.
 *
 * Visos klaidos tyliai praryjamos ir grąžinama „nieko nedaryti" — atsarginė kopija NIEKADA neturi
 * sugriauti žaidimo, jei Supabase striginėja. */

const SNAP_KEEP = 8;                       // kiek pilnų kopijų laikom
const SNAP_MIN_GAP_MS = 60 * 60 * 1000;    // nauja pilna kopija ne dažniau kaip kartą per valandą
const CAS_RETRIES = 3;

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
const _key = (a: string) => _norm(a) + "#bak";

export type StructHigh = { wl: number; tl: number; hl: number; tow: { y: number; l: number }[]; at: number };
type BakRow = { hi: StructHigh | null; snaps: { at: number; b: any }[]; ver: number; fresh: boolean; noVer: boolean };

const _emptyHi = (): StructHigh => ({ wl: 1, tl: 1, hl: 1, tow: [], at: 0 });

// Statinių „pirštų atspaudas" iš buildings objekto (tik tai, ko niekas kitas neperrašo).
export function structOf(b: Partial<BaseBuildings> | null | undefined): StructHigh {
  const s = _emptyHi();
  if (!b) return s;
  s.wl = Math.max(1, Math.round(Number((b as any).wallLevel) || 1));
  s.tl = Math.max(1, Math.round(Number((b as any).towerLevel) || 1));
  s.hl = Math.max(1, Math.round(Number((b as any).hospLevel) || 1));
  const tow = Array.isArray((b as any).towers) ? (b as any).towers : [];
  for (const t of tow) {
    if (!t || !Number.isFinite(+t.y)) continue;
    s.tow.push({ y: Math.round(+t.y), l: Math.max(1, Math.round(Number(t.level) || 1)) });
  }
  s.tow.sort((a, c) => a.y - c.y);
  return s;
}

// Dviejų taškų SĄJUNGA: kiekvienas lygis = didesnysis, bokštai = pozicijų sąjunga (aukštesnis lygis laimi).
export function mergeHigh(a: StructHigh | null, b: StructHigh | null): StructHigh {
  const x = a || _emptyHi(), y = b || _emptyHi();
  const byY = new Map<number, number>();
  for (const t of [...x.tow, ...y.tow]) byY.set(t.y, Math.max(byY.get(t.y) || 1, t.l));
  return {
    wl: Math.max(x.wl, y.wl), tl: Math.max(x.tl, y.tl), hl: Math.max(x.hl, y.hl),
    tow: Array.from(byY.entries()).map(([y2, l]) => ({ y: y2, l })).sort((p, q) => p.y - q.y),
    at: Math.max(x.at, y.at),
  };
}

async function _read(addr: string): Promise<BakRow> {
  const c = sb(); if (!c) return { hi: null, snaps: [], ver: 0, fresh: true, noVer: true };
  const { data, error } = await c.from("f9_bases").select("buildings").eq("ronin_address", _key(addr)).maybeSingle();
  if (error) throw new Error("[BaseBackup] read: " + (error.message || "db error"));
  const b = (data as any)?.buildings || {};
  const hi = b.hi ? { wl: Number(b.hi.wl) || 1, tl: Number(b.hi.tl) || 1, hl: Number(b.hi.hl) || 1, at: Number(b.hi.at) || 0,
    tow: Array.isArray(b.hi.tow) ? b.hi.tow.filter((t: any) => t && Number.isFinite(+t.y)).map((t: any) => ({ y: Math.round(+t.y), l: Math.max(1, Math.round(Number(t.l) || 1)) })) : [] } : null;
  const snaps = Array.isArray(b.snaps) ? b.snaps.filter((s: any) => s && Number.isFinite(+s.at)).map((s: any) => ({ at: +s.at, b: s.b })) : [];
  return { hi, snaps, ver: Number(b.ver) || 0, fresh: !data, noVer: b.ver == null };
}

async function _write(addr: string, r: BakRow): Promise<boolean> {
  const c = sb(); if (!c) return true;
  const body = { hi: r.hi, snaps: r.snaps.slice(-SNAP_KEEP), ver: (r.ver || 0) + 1 };
  if (r.fresh) {
    const { error } = await c.from("f9_bases").insert({ ronin_address: _key(addr), units: [], buildings: body, updated_at: new Date().toISOString() });
    if (!error) return true;
    if (/duplicate|unique|conflict/i.test(error.message || "")) return false;   // kitas procesas suspėjo → perskaitom iš naujo
    throw new Error("[BaseBackup] write: " + (error.message || "db error"));
  }
  let q = c.from("f9_bases")
    .update({ units: [], buildings: body, updated_at: new Date().toISOString() })
    .eq("ronin_address", _key(addr));
  q = r.noVer ? q.filter("buildings->>ver", "is", null) : q.filter("buildings->>ver", "eq", String(r.ver || 0));
  const { data, error } = await q.select("ronin_address");
  if (error) throw new Error("[BaseBackup] write: " + (error.message || "db error"));
  return !!(data && data.length);
}

/* 📸 Įrašo pilies būklę į kopiją. Grąžina AUKŠČIAUSIĄ žinomą tašką (jau sujungtą su ką tik matytu).
 * `full` = ar leisti pilną snapshot'ą (throttlinamas valandai). Klaida → grąžinam ką matėm (fail-safe). */
export async function bakRecord(addr: string, b: Partial<BaseBuildings> | null): Promise<StructHigh> {
  const a = _norm(addr);
  const seen = structOf(b);
  if (!a || !sb()) return seen;
  for (let i = 0; i < CAS_RETRIES; i++) {
    try {
      const row = await _read(a);
      const merged = mergeHigh(row.hi, { ...seen, at: Date.now() });
      const grew = !row.hi || merged.wl > row.hi.wl || merged.tl > row.hi.tl || merged.hl > row.hi.hl || merged.tow.length > row.hi.tow.length;
      const last = row.snaps.length ? row.snaps[row.snaps.length - 1].at : 0;
      const wantSnap = !!b && (grew || Date.now() - last > SNAP_MIN_GAP_MS);
      if (!grew && !wantSnap) return merged;
      row.hi = merged;
      if (wantSnap) row.snaps = [...row.snaps, { at: Date.now(), b }].slice(-SNAP_KEEP);
      if (await _write(a, row)) {
        if (grew) console.log(`[BaseBackup] 💾 ${a.slice(0, 10)}… statinių taškas: siena ${merged.wl} · bokštai L${merged.tl} ×${merged.tow.length} · ligoninė ${merged.hl}`);
        return merged;
      }
    } catch (_) { return seen; }   // DB triktis → nieko nedarom, žaidimas nenukenčia
  }
  return seen;
}

/* 🩺 SAVIGYDA: jei ką tik užkrauta pilis ŽEMESNĖ nei aukščiausias žinomas taškas — grąžinam pataisytą
 * objektą (ir `healed` sąrašą, ką atstatėm). null = viskas gerai, taisyti nereikia. */
export async function healStructures(addr: string, b: BaseBuildings | null): Promise<{ b: BaseBuildings; healed: string[] } | null> {
  const a = _norm(addr);
  if (!a || !b || !sb()) return null;
  let hi: StructHigh | null = null;
  try { hi = (await _read(a)).hi; } catch (_) { return null; }
  if (!hi) return null;
  const cur = structOf(b);
  const healed: string[] = [];
  const out: BaseBuildings = { ...b };
  if (hi.wl > cur.wl) { out.wallLevel = hi.wl; healed.push(`siena ${cur.wl}→${hi.wl}`); }
  if (hi.tl > cur.tl) { out.towerLevel = hi.tl; healed.push(`bokštų lygis ${cur.tl}→${hi.tl}`); }
  if (hi.hl > cur.hl) { out.hospLevel = hi.hl; healed.push(`ligoninė ${cur.hl}→${hi.hl}`); }
  if (hi.tow.length > cur.tow.length) {
    const byY = new Map<number, number>();
    for (const t of cur.tow) byY.set(t.y, t.l);
    for (const t of hi.tow) byY.set(t.y, Math.max(byY.get(t.y) || 1, t.l));   // pozicijos atkuriamos TIKSLIAI (y)
    out.towers = Array.from(byY.entries()).map(([y, level]) => ({ y, level })).sort((p, q) => p.y - q.y);
    healed.push(`bokštai ${cur.tow.length}→${out.towers.length}`);
  }
  if (!healed.length) return null;
  console.log(`[BaseBackup] 🩺 ATSTATYTA ${a.slice(0, 10)}…: ${healed.join(" · ")}`);
  return { b: out, healed };
}

// 🔎 OPS: pilnas kopijos turinys (atstatymo pultui / rankiniam tyrimui).
export async function bakDump(addr: string): Promise<{ hi: StructHigh | null; snaps: { at: number; b: any }[] } | null> {
  try { const r = await _read(_norm(addr)); return { hi: r.hi, snaps: r.snaps }; } catch (_) { return null; }
}

/* 🛠 OPS: rankinis aukščiausio taško nustatymas (kai žaidėjas prarado progresą DAR neturėdamas kopijos).
 * Po jo pirmas prisijungimas savaime atstatys pilį per healStructures. */
export async function bakSetHigh(addr: string, s: Partial<StructHigh>): Promise<StructHigh | null> {
  const a = _norm(addr);
  if (!a || !sb()) return null;
  for (let i = 0; i < CAS_RETRIES; i++) {
    try {
      const row = await _read(a);
      row.hi = mergeHigh(row.hi, { wl: Math.max(1, Number(s.wl) || 1), tl: Math.max(1, Number(s.tl) || 1), hl: Math.max(1, Number(s.hl) || 1),
        tow: (s.tow || []).map((t) => ({ y: Math.round(+t.y), l: Math.max(1, Math.round(Number(t.l) || 1)) })), at: Date.now() });
      if (await _write(a, row)) return row.hi;
    } catch (_) { return null; }
  }
  return null;
}
