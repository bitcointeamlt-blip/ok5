import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 🏰 Castle persistencija — žaidėjo pilies snapshot'as (gynėjų unitai: pozicija/HP/tipas) į `f9_bases`.
//    Server-authoritative (service-role raktas) → klientas negali klastoti. Tas PATS įrašas vėliau
//    bus skaitomas raid'uose → puolikas matys IDENTIŠKAS pozicijas, kurias paliko savininkas.

export type SnapshotUnit = {
  tokenId: string;
  utype: string;
  level: number;
  x: number;
  y: number;
  hp: number;
};

let _client: SupabaseClient | null = null;
let _tried = false;

function getClient(): SupabaseClient | null {
  if (_tried) return _client;
  _tried = true;
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    console.warn("[BaseStore] SUPABASE_URL / SERVICE_ROLE_KEY nenustatyti — pilies persistencija IŠJUNGTA");
    return null;
  }
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log("[BaseStore] supabase klientas paruoštas (persistencija ĮJUNGTA)");
  return _client;
}

const _norm = (a: string) => (a || "").trim().toLowerCase();

// Užkrauna išsaugotą pilies layout'ą (gynėjų pozicijas). null jei nėra įrašo / persistencija išjungta.
export async function loadBaseUnits(address: string): Promise<SnapshotUnit[] | null> {
  const addr = _norm(address);
  if (!addr) return null;
  const c = getClient();
  if (!c) return null;
  try {
    const { data, error } = await c.from("f9_bases").select("units").eq("ronin_address", addr).maybeSingle();
    if (error) { console.warn("[BaseStore] load error:", error.message); return null; }
    const u = (data as any)?.units;
    if (!Array.isArray(u)) return null;
    // sanitizuojam (gynyba nuo šiukšlių DB)
    const out: SnapshotUnit[] = [];
    for (const e of u) {
      if (!e || typeof e !== "object") continue;
      const tokenId = String(e.tokenId || "");
      const utype = String(e.utype || "");
      if (!utype) continue;
      out.push({
        tokenId,
        utype,
        level: Number.isFinite(+e.level) ? +e.level : 0,
        x: Number.isFinite(+e.x) ? +e.x : 0,
        y: Number.isFinite(+e.y) ? +e.y : 0,
        hp: Number.isFinite(+e.hp) ? +e.hp : 0,
      });
    }
    return out.length ? out : null;
  } catch (e: any) {
    console.warn("[BaseStore] load exc:", e?.message);
    return null;
  }
}

// 🏥 Sužalotas unitas ligoninėje. EILĖS MODELIS (2026-07-03 v2): gydosi TIK eilės galva (1h),
//    kiti LAUKIA; tvarka = masyvo tvarka; `hospStart` = kada galva pradėjo gydytis. `until` legacy (nebenaudojamas).
export type InjuredUnit = { tokenId: string; utype: string; level: number; until?: number };

// 🏗️ Pastatų konfigūracija (upgrade sistema): sienos lygis + pastatyti bokštai.
//    + 🏥 injured (eilė) + hospStart — ligoninė laikoma ČIA (buildings jsonb — atskiros DB kolonos NEreikia,
//    nes Supabase mgmt token miręs → DDL negalimas; service-role upsert veikia).
export type BaseBuildings = { wallLevel: number; towerLevel?: number; towers: { y: number; level: number }[]; injured?: InjuredUnit[]; hospStart?: number; hospStarts?: number[]; hospDurs?: number[]; hospLevel?: number; deadUnits?: string[];
  cemPot?: number; cemTick?: number; cemPower?: number; cemNft?: number; cemRv?: number; cemWallet?: number; cemRamp?: number;   // ⚰️ kapinės (pot=nesurinkti; rv=RonkeVerse NFT, wallet=Barracks unitų piniginėj — full-player gating)
  minePot?: number;   // ⛏️💰 iškastas RONKE (server-authoritative mining pot; tick=cemTick bendras) — DUTY: raiders vagia 50%
  mineCheckpoint?: number;  // ⛏️🗡 kito „siege checkpoint" lygis: pot kaupiasi iki čia → kasimas STOJA kol atliks PvP mūšį (+200 kas mūšis). Withdraw @500.
  mineField?: number; mineReserve?: number;  // ⛏️ paskutiniai ŽINOMI lauko/rezervo unitų count'ai — offline rate
  //   perskaičiuojamas iš PIRMINIŲ persistintų duomenų (ne įsiminta galutinė rate → mažesnė exploit skylė)
  dutyMode?: "online" | "safe"; mineGated?: boolean;  // ⚔️🛡 duty režimas + ar safe kasimas užrakintas (lubos→siege)
  mineStolenAt?: number;   // (legacy — client steal signal; nebenaudojamas po server-side steal)
  ownerSeenAt?: number;    // 🫀 07-14: savininko heartbeat (online kas 60s) — async-raid GRACE guard (online gynėjas turi matyti kovą!)
  shieldUntil?: number };   // 🛡 pilis nepuolama iki šio ts (1h po pralaimėtos gynybos)

// Užkrauna pilies pastatų konfigūraciją (`buildings` jsonb). null jei nėra.
export async function loadBaseBuildings(address: string): Promise<BaseBuildings | null> {
  const addr = _norm(address);
  if (!addr) return null;
  const c = getClient();
  if (!c) return null;
  try {
    const { data, error } = await c.from("f9_bases").select("buildings").eq("ronin_address", addr).maybeSingle();
    // 🛡 S-M5: DB KLAIDĄ metam (ne null), kad kvietėjai (_loadInjured/_loadCem/_buildingsOp) NEsupainiotų
    //   „laikina triktis" su „nėra eilutės" ir neperrašytų realių injured/deadUnits/cem tuščiais reikšmėmis.
    if (error) throw new Error("[BaseStore] loadBaseBuildings db: " + (error.message || "error"));
    if (!data) return null;   // null = TIKRAI nėra eilutės (dar nesukurta pilis)
    const b = (data as any).buildings;
    if (!b || typeof b !== "object") return null;
    const wallLevel = Number.isFinite(+b.wallLevel) ? Math.max(1, Math.min(5, Math.round(+b.wallLevel))) : 1;
    const towerLevel = Number.isFinite(+b.towerLevel) ? Math.max(1, Math.min(5, Math.round(+b.towerLevel))) : 1;
    const hospLevel = Number.isFinite(+b.hospLevel) ? Math.max(1, Math.min(5, Math.round(+b.hospLevel))) : 1;
    const hospStarts: number[] = Array.isArray(b.hospStarts) ? b.hospStarts.filter((x: any) => Number.isFinite(+x)).map((x: any) => +x) : [];
    const hospDurs: number[] = Array.isArray(b.hospDurs) ? b.hospDurs.filter((x: any) => Number.isFinite(+x)).map((x: any) => +x) : [];
    const deadUnits: string[] = Array.isArray(b.deadUnits) ? b.deadUnits.filter((x: any) => x != null).map((x: any) => String(x)) : [];
    const towers: { y: number; level: number }[] = [];
    if (Array.isArray(b.towers)) {
      for (const t of b.towers) {
        if (!t || typeof t !== "object") continue;
        if (!Number.isFinite(+t.y)) continue;
        towers.push({ y: Math.round(+t.y), level: Number.isFinite(+t.level) ? Math.max(1, Math.min(5, Math.round(+t.level))) : 1 });
      }
    }
    // 🏥 ligoninės EILĖ — sanitizuojam (tvarka = eilės tvarka; pasveikimą sprendžia room pagal hospStart)
    const injured: InjuredUnit[] = [];
    if (Array.isArray(b.injured)) {
      for (const e of b.injured) {
        if (!e || typeof e !== "object") continue;
        const tokenId = String(e.tokenId || ""); const utype = String(e.utype || "");
        if (!tokenId || !utype) continue;
        injured.push({ tokenId, utype, level: Number.isFinite(+e.level) ? +e.level : 0 });
      }
    }
    const hospStart = Number.isFinite(+b.hospStart) ? +b.hospStart : 0;
    // ⚰️ kapinės — PRIVALO būti parsinama, kitaip injured/cem load-modify-write clobberintų vienas kitą
    const cemPot = Number.isFinite(+b.cemPot) ? Math.max(0, +b.cemPot) : 0;
    const cemTick = Number.isFinite(+b.cemTick) ? +b.cemTick : 0;
    const cemPower = Number.isFinite(+b.cemPower) ? Math.max(0, +b.cemPower) : 0;
    const cemNft = Number.isFinite(+b.cemNft) ? Math.max(0, Math.round(+b.cemNft)) : 0;
    const cemRv = Number.isFinite(+b.cemRv) ? Math.max(0, Math.round(+b.cemRv)) : 0;
    const cemWallet = Number.isFinite(+b.cemWallet) ? Math.max(0, Math.round(+b.cemWallet)) : 0;
    const cemRamp = Number.isFinite(+b.cemRamp) ? Math.max(0, +b.cemRamp) : 0;
    const minePot = Number.isFinite(+b.minePot) ? Math.max(0, +b.minePot) : 0;   // ⛏️💰 iškastas RONKE
    const mineCheckpoint = Number.isFinite(+b.mineCheckpoint) ? Math.max(200, +b.mineCheckpoint) : 200;   // ⛏️🗡 kitas siege checkpoint (min 200)
    const mineField = Number.isFinite(+b.mineField) ? Math.max(0, Math.round(+b.mineField)) : 0;   // ⛏️ lauke
    const mineReserve = Number.isFinite(+b.mineReserve) ? Math.max(0, Math.round(+b.mineReserve)) : 0;   // ⛏️ rezerve
    const dutyMode: "online" | "safe" = b.dutyMode === "safe" ? "safe" : "online";   // ⚔️🛡 default online
    const mineGated = !!b.mineGated;   // 🛡 safe kasimas užrakintas iki siege
    const shieldUntil = Number.isFinite(+b.shieldUntil) ? Math.max(0, +b.shieldUntil) : 0;   // 🛡
    const ownerSeenAt = Number.isFinite(+b.ownerSeenAt) ? Math.max(0, +b.ownerSeenAt) : 0;   // 🫀 grace guard
    return { wallLevel, towerLevel, towers, injured, hospStart, hospStarts, hospDurs, hospLevel, deadUnits, cemPot, cemTick, cemPower, cemNft, cemRv, cemWallet, cemRamp, minePot, mineCheckpoint, mineField, mineReserve, dutyMode, mineGated, ownerSeenAt, shieldUntil };
  } catch (e) { throw (e instanceof Error ? e : new Error("[BaseStore] loadBaseBuildings failed")); }   // 🛡 S-M5: tinklo išimtis = triktis (metam, ne null)
}

// Išsaugo (upsert) pilies layout'ą. units + (opcionaliai) buildings KARTU → nesusiklobbina.
export async function saveBaseUnits(address: string, units: SnapshotUnit[], buildings?: BaseBuildings): Promise<boolean> {
  const addr = _norm(address);
  if (!addr) return false;
  const c = getClient();
  if (!c) return false;
  try {
    const row: any = {
      ronin_address: addr,
      units: units,
      updated_at: new Date().toISOString(),
    };
    if (buildings) row.buildings = buildings;
    const { error } = await c.from("f9_bases").upsert(row, { onConflict: "ronin_address" });
    if (error) { console.warn("[BaseStore] save error:", error.message); return false; }
    return true;
  } catch (e: any) {
    console.warn("[BaseStore] save exc:", e?.message);
    return false;
  }
}

// ─── 🦴 KAULŲ BANKAS ────────────────────────────────────────────────────────
// Persistuojamas kaulų balansas + pending swap voucher'is. ATSKIRA f9_bases eilutė
// (`<addr>#bones`) — kambarių units/buildings save'ai jos NIEKADA neliečia (jokio clobber;
// DDL negalimas — mgmt token miręs, todėl ne atskira lentelė). Vieninteliai rašytojai:
// addBones (match pabaiga/leave) ir swap deduct — abu čia, read-modify-write.

export type BoneSwapPending = { deciBones: number; nonce: string; deadline: number; sig: string; createdAt: number; rr?: boolean; voucher?: any };   // rr=RonkeReward režimas (voucher=re-send'ui)
export type BoneBank = { bones: number; pending: BoneSwapPending | null };

const _boneKey = (a: string) => _norm(a) + "#bones";
const _r1 = (n: number) => Math.round(n * 10) / 10;   // 0.1 tikslumas

export async function loadBoneBank(address: string): Promise<BoneBank> {
  const empty: BoneBank = { bones: 0, pending: null };
  const addr = _norm(address);
  if (!addr) return empty;
  const c = getClient();
  if (!c) return empty;
  try {
    const { data, error } = await c.from("f9_bases").select("buildings").eq("ronin_address", _boneKey(addr)).maybeSingle();
    if (error || !data) return empty;
    const b = (data as any).buildings;
    if (!b || typeof b !== "object") return empty;
    const bones = Number.isFinite(+b.bones) ? Math.max(0, _r1(+b.bones)) : 0;
    let pending: BoneSwapPending | null = null;
    const ps = b.boneSwap;
    if (ps && typeof ps === "object" && Number.isFinite(+ps.deciBones) && ps.sig && ps.nonce) {
      pending = { deciBones: Math.round(+ps.deciBones), nonce: String(ps.nonce), deadline: Number.isFinite(+ps.deadline) ? +ps.deadline : 0,
                  sig: String(ps.sig), createdAt: Number.isFinite(+ps.createdAt) ? +ps.createdAt : 0 };
      if (ps.rr) { pending.rr = true; pending.voucher = ps.voucher || null; }   // 🦴 RonkeReward režimas — išsaugom re-send voucherį
    }
    return { bones, pending };
  } catch { return empty; }
}

export async function saveBoneBank(address: string, bank: BoneBank): Promise<boolean> {
  const addr = _norm(address);
  if (!addr) return false;
  const c = getClient();
  if (!c) return false;
  try {
    const row = { ronin_address: _boneKey(addr), units: [], buildings: { bones: _r1(bank.bones), boneSwap: bank.pending }, updated_at: new Date().toISOString() };
    const { error } = await c.from("f9_bases").upsert(row, { onConflict: "ronin_address" });
    if (error) { console.warn("[BaseStore] bone save error:", error.message); return false; }
    return true;
  } catch (e: any) { console.warn("[BaseStore] bone save exc:", e?.message); return false; }
}

// 🔒 PER-ADRESO operacijų eilė — banko read-modify-write'ai NEGALI persidengti.
//   07-04 BUG (log įrodė): kapinių grobis (+10.8) ir sesijos flush (+41.5) _endMatch'e bėgo
//   lygiagrečiai → abu perskaitė bank=0, flush save užrašė ANT grobio save → 41.5 vietoj 52.3 (grobis DINGO).
const _boneOpQueue = new Map<string, Promise<any>>();
export function boneBankOp<T>(address: string, fn: () => Promise<T>): Promise<T> {
  const key = _norm(address);
  const prev = _boneOpQueue.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);   // bėga PO ankstesnės op (net jei ta failino)
  _boneOpQueue.set(key, next.catch(() => {}));
  return next;
}

// ─── 🗡️📜 RAID ATASKAITOS (offline raid consequences) ──────────────────────────
// Atskira f9_bases eilutė `<addr>#raidlog` (buildings.raids = paskutinių įvykių masyvas, cap 10).
// Rašo _appendRaidReport (raido pabaiga); skaito+valo loadRaidReports (savininkui grįžus namo).
export type RaidReport = {
  at: number; attacker: string; result: string;   // 'defended' | 'lost' | 'retreat'
  atkArmy: { utype: string; level: number; count: number }[];
  killed: string[]; injured: string[]; bonesStolen: number;
  defUnits?: { tokenId: string; utype: string; level: number; fate: string }[];
};
const _raidKey = (a: string) => _norm(a) + "#raidlog";
export async function appendRaidReport(address: string, rep: RaidReport): Promise<boolean> {
  const addr = _norm(address); if (!addr) return false;
  return boneBankOp(addr + "#raidlog", async () => {   // atskira eilė (nesikerta su bank op)
    const c = getClient(); if (!c) return false;
    try {
      const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", _raidKey(addr)).maybeSingle();
      const b = (data && (data as any).buildings) || {};
      const raids: RaidReport[] = Array.isArray(b.raids) ? b.raids : [];
      raids.unshift(rep);                       // naujausias priekyje
      const trimmed = raids.slice(0, 10);       // cap 10
      // 📜 07-14: IŠSAUGOM ir `seen` istoriją (kitaip upsert'as ją numestų) — kas puolė matosi ir vėliau
      const seen: RaidReport[] = Array.isArray((b as any).seen) ? (b as any).seen : [];
      const { error } = await c.from("f9_bases").upsert({ ronin_address: _raidKey(addr), units: [], buildings: { raids: trimmed, seen: seen.slice(0, 20) }, updated_at: new Date().toISOString() }, { onConflict: "ronin_address" });
      return !error;
    } catch { return false; }
  });
}
// Grąžina laukiančias ataskaitas ir perkelia jas į `seen` ISTORIJĄ (žaidėjas jas pamatė).
// 📜 07-14 fix: anksčiau ištrindavo visam (raids:[]) → neįmanoma vėliau sužinoti kas puolė
// (user atvejis: puolimas async, grįžęs praleido popup'ą — istorijos nebeliko). Dabar seen cap 20.
export async function loadRaidReports(address: string): Promise<RaidReport[]> {
  const addr = _norm(address); if (!addr) return [];
  return boneBankOp(addr + "#raidlog", async () => {
    const c = getClient(); if (!c) return [];
    try {
      const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", _raidKey(addr)).maybeSingle();
      const b = (data && (data as any).buildings) || {};
      const raids: RaidReport[] = Array.isArray(b.raids) ? b.raids : [];
      if (raids.length) {
        const seenOld: RaidReport[] = Array.isArray((b as any).seen) ? (b as any).seen : [];
        const seen = [...raids, ...seenOld].slice(0, 20);   // suvartotos → istorija (naujausios priekyje)
        await c.from("f9_bases").upsert({ ronin_address: _raidKey(addr), units: [], buildings: { raids: [], seen }, updated_at: new Date().toISOString() }, { onConflict: "ronin_address" });
      }
      return raids;
    } catch { return []; }
  });
}

// Kredituoja kaulus į banką (match pabaiga / leave / grobis). Grąžina naują balansą (null = persist fail).
export async function addBones(address: string, delta: number): Promise<number | null> {
  if (!Number.isFinite(delta) || delta <= 0) return null;
  return boneBankOp(address, async () => {
    const bank = await loadBoneBank(address);
    bank.bones = _r1(bank.bones + delta);
    const ok = await saveBoneBank(address, bank);
    return ok ? bank.bones : null;
  });
}

// Išsaugo TIK pastatus (upgrade momentu, kai units nesvarbu). Partial upsert (units nepaliečiam).
export async function saveBaseBuildings(address: string, buildings: BaseBuildings): Promise<boolean> {
  const addr = _norm(address);
  if (!addr) return false;
  const c = getClient();
  if (!c) return false;
  try {
    const { error } = await c.from("f9_bases").upsert({ ronin_address: addr, buildings, updated_at: new Date().toISOString() }, { onConflict: "ronin_address" });
    if (error) { console.warn("[BaseStore] save buildings error:", error.message); return false; }
    return true;
  } catch (e: any) {
    console.warn("[BaseStore] save buildings exc:", e?.message);
    return false;
  }
}
