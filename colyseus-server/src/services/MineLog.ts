import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ⛏️📜 KASIMO ŽURNALAS (2026-08-21) — kas, kada ir KOKIU BŪDU uždirbo RONKE.
//
// KODĖL atsirado: audituojant žaidėją, kuris išsiėmė 1000 RONKE, paaiškėjo, kad serveris
// laiko TIK dabartinę būseną (`minePot`, `mineMined`, `dutyMode`). Istorijos nėra jokios:
// neįmanoma pasakyti nei kiek PvP mūšių jis atliko, nei kiek laiko kasė DUTY vs SAFE.
// Todėl į klausimą „ar viskas pagal taisykles" atsakymo NEBUVO — tik skaičiavimai.
//
// KĄ FIKSUOJAM (tik ĮVYKIUS, ne kiekvieną tiką — kitaip DB užsikimštų):
//   duty    — režimo perjungimas (kas ir kodėl: rankinis / auto po raido)
//   siege   — kvalifikuotas PvP (≥50% aukų) → kasimo ciklas atrakintas
//   gate    — kasimas SUSTOJO pasiekus 200 ribą (laukia mūšio)
//   withdraw— išėmimas į piniginę (kiek, koks nonce)
//   steal   — grobis iš pralaimėto raido (ateina į balansą, bet NE į 200 skalę)
//
// SAUGOJIMAS: atskira `f9_bases` eilutė `<addr>#minelog` (kaip #raidlog / #bones) —
// DDL negalimas (mgmt token miręs), tad be naujų lentelių. Cap 200 įrašų/žaidėjui.

/* `burn` (2026-08-30): po raido dalis gynėjo pot'o dingsta NIEKAM (MINE_BURN_PCT). Būtina atskira rūšis —
 * iki tol galiojo invariantas „gynėjo praradimas == puoliko `steal`", o dabar skirtumą sudaro būtent burn. */
export type MineEventKind = "duty" | "siege" | "gate" | "withdraw" | "steal" | "burn";

export interface MineEvent {
  t: number;              // laikas (epoch ms)
  k: MineEventKind;
  pot?: number;           // balansas įvykio metu
  mined?: number;         // 200-ciklo skaitiklis įvykio metu
  duty?: string;          // "safe" | "online"
  amt?: number;           // withdraw/steal suma
  by?: string;            // siege: oponento adresas (sutrumpintas)
  why?: string;           // trumpas kontekstas
}

const CAP = 200;
let _sb: SupabaseClient | null = null; let _tried = false;
function sb(): SupabaseClient | null {
  if (_tried) return _sb;
  _tried = true;
  const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (url && key) _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}
const _norm = (a: string) => (a || "").trim().toLowerCase();
const _key = (a: string) => _norm(a) + "#minelog";

// ⚡ Rašom SUKAUPTAI: įvykiai kaupiasi atmintyje ir nuplaunami kas ~10 s vienu upsert'u.
//   Be to raidas su keliais įvykiais duotų kelis DB rašymus iš eilės.
const _pending = new Map<string, MineEvent[]>();
let _timer: NodeJS.Timeout | null = null;

async function _flushOne(addr: string, evs: MineEvent[]): Promise<void> {
  const c = sb(); if (!c) return;
  try {
    const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", _key(addr)).maybeSingle();
    const prev: MineEvent[] = Array.isArray((data as any)?.buildings?.events) ? (data as any).buildings.events : [];
    const all = prev.concat(evs).slice(-CAP);
    await c.from("f9_bases").upsert(
      { ronin_address: _key(addr), units: [], buildings: { events: all }, updated_at: new Date().toISOString() },
      { onConflict: "ronin_address" },
    );
  } catch (e: any) { console.warn("[MineLog] flush fail:", e?.message); }
}

function _schedule(): void {
  if (_timer) return;
  _timer = setTimeout(() => {
    _timer = null;
    const batch = new Map(_pending); _pending.clear();
    batch.forEach((evs, addr) => { void _flushOne(addr, evs); });
  }, 10_000);
  if (typeof (_timer as any).unref === "function") (_timer as any).unref();
}

export const MineLog = {
  // Best-effort: NIEKADA nemeta ir nelaukia — kasimo/mūšio kelias neturi lėtėti dėl žurnalo.
  add(addr: string, ev: Omit<MineEvent, "t"> & { t?: number }): void {
    const a = _norm(addr);
    if (!/^0x[0-9a-f]{40}$/.test(a)) return;
    const e: MineEvent = { t: ev.t || Date.now(), ...ev } as MineEvent;
    const arr = _pending.get(a) || [];
    arr.push(e);
    _pending.set(a, arr);
    _schedule();
  },
  async read(addr: string): Promise<MineEvent[]> {
    const c = sb(); if (!c) return [];
    try {
      const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", _key(addr)).maybeSingle();
      return Array.isArray((data as any)?.buildings?.events) ? (data as any).buildings.events : [];
    } catch { return []; }
  },
};
