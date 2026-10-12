import * as fs from "fs";
import * as path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 🧱💰 PAYOUT QUEUE — operatoriaus-patvirtinamos išmokos (raktas NELAIKOMAS serveryje).
// Kai wager rungtynės baigiasi (arba refund), serveris NEpasirašo pats — įrašo LAUKIANČIĄ išmoką čia
// (bendras JSON failas). Atskiras admin serveris (blocks_admin_server.mjs, port 6610) skaito tą patį failą,
// operatorius per admin.html prisijungia treasury piniginę (0xfF0a2d76…) ir PATS pasirašo RONKE transfer'į.
//
// ⚠️ Bendras failas TARP procesų (colyseus + admin) → kiekviena operacija skaito ŠVIEŽIAI iš disko, mutuoja,
//    įrašo (be in-memory cache) → admin „paid" žymos ir colyseus „add" nesitrina. Payout'ai reti → I/O nykstamas.

export type PayoutKind = "win" | "refund" | "referral";   // 🎁 referral = referrer'io claim išmoka
export interface PendingPayout {
  id: string;
  to: string;
  amount: number;        // RONKE (žmogiškas skaičius, ne wei)
  kind: PayoutKind;
  roomId: string;
  createdAt: number;
  status: "pending" | "sending" | "paid";   // 10-12: "sending" = paimta mokėjimui (kita flush kilpa/procesas jos NEbeima)
  manual?: boolean;               // true = reikia OPERATORIAUS patikros prieš mokant (neverifikuotas) → auto-flush PRALEIDŽIA
  note?: string;                  // 🛡️ sulaikymo priežastis operatoriui (pvz. anti-cheat: pps_15.3,pieces_decrease)
  tx?: string;
  paidAt?: number;
}

export const PAYOUTS_FILE = path.join(process.cwd(), "blocks_payouts.json");

function readAll(): PendingPayout[] {
  try { if (fs.existsSync(PAYOUTS_FILE)) return JSON.parse(fs.readFileSync(PAYOUTS_FILE, "utf8")) || []; }
  catch (e: any) { console.error("[PayoutQueue] read fail:", e?.message); }
  return [];
}
function writeAll(items: PendingPayout[]): void {
  try { fs.writeFileSync(PAYOUTS_FILE, JSON.stringify(items, null, 2)); }
  catch (e: any) { console.error("[PayoutQueue] write fail:", e?.message); }
}

// 🔒 10-12: prode veikia DU procesai (pm2 colyseus-server-1/-2) su TUO PAČIU failu. Kiekvienas
//   skaityk→keisk→rašyk eina per išimtinį užrakto failą (atomiškas `wx` sukūrimas), kad du procesai
//   neperrašytų vienas kito ir to paties įrašo nepaimtų mokėti abu. Užstrigęs (>5 s) užraktas nuimamas.
//   strict=true (claim): užrakto negavus — NEMOKAM (grąžinam null). Kitur — vykdom vis tiek, kad įrašas nepradingtų.
const LOCK_FILE = PAYOUTS_FILE + ".lock";
const _sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function withLock<T>(fn: () => T, strict = false): T | null {
  const t0 = Date.now();
  let locked = false;
  while (!locked) {
    try { fs.closeSync(fs.openSync(LOCK_FILE, "wx")); locked = true; }
    catch (e: any) {
      if (e?.code !== "EEXIST") { if (strict) return null; return fn(); }
      try { if (Date.now() - fs.statSync(LOCK_FILE).mtimeMs > 5000) { fs.unlinkSync(LOCK_FILE); continue; } } catch { /* kitas jau nuėmė */ }
      if (Date.now() - t0 > 3000) { console.warn("[PayoutQueue] lock timeout"); if (strict) return null; return fn(); }
      _sleep(5);
    }
  }
  try { return fn(); } finally { try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ } }
}

// ── 🛟 DURABLUS SLUOKSNIS (Supabase) ─────────────────────────────────────────
// Cloud'e `blocks_payouts.json` gyvena EFEMERIŠKAME instance diske → dingsta per redeploy/restart,
// tad laukiantis prizas galėjo pradingti. Dubliuojam eilę į Supabase (f9_bases, raktas
// `blockspayout_<id>`) → per startą reconcile() atstato laukiančius į failą, flushQueue juos išmoka.
// Best-effort: jei nėra Supabase kredencialų arba tinklas krinta — NIEKADA nemeta (failas lieka primary).
let _sb: SupabaseClient | null = null; let _sbTried = false;
function sb(): SupabaseClient | null {
  if (_sbTried) return _sb;
  _sbTried = true;
  const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (url && key) _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}
const _SB_KEY = (id: string) => "blockspayout_" + id;
function sbUpsert(it: PendingPayout): void {
  const c = sb(); if (!c) return;
  c.from("f9_bases").upsert({ ronin_address: _SB_KEY(it.id), buildings: { blocksPayout: it } }, { onConflict: "ronin_address" })
    .then(({ error }: any) => { if (error) console.warn("[PayoutQueue] sb upsert fail:", error.message); }, () => {});
}

class PayoutQueueImpl {
  // Įrašo laukiančią išmoką. Dedupe: tas pats roomId+to+kind (dar nepamokėtas) → negrūdinam antro.
  add(p: { to: string; amount: number; kind: PayoutKind; roomId: string; manual?: boolean; note?: string }): PendingPayout | null {
    const to = String(p.to || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(to) || !(p.amount > 0)) return null;
    let fresh = false;
    const item = withLock(() => {
      const items = readAll();
      const dup = items.find((x) => x.roomId === p.roomId && x.to === to && x.kind === p.kind && x.status !== "paid");
      if (dup) return dup;
      const it: PendingPayout = {
        id: `${p.roomId}_${p.kind}_${to.slice(2, 10)}`,
        to, amount: p.amount, kind: p.kind, roomId: p.roomId,
        createdAt: Date.now(), status: "pending", manual: !!p.manual,
        ...(p.note ? { note: p.note } : {}),
      };
      items.push(it);
      writeAll(items);
      fresh = true;
      return it;
    })!;
    if (!fresh) return item;
    sbUpsert(item);   // 🛟 durablus dublis (išgyvena cloud redeploy)
    console.log(`[PayoutQueue] + ${p.kind} ${p.amount} RONKE → ${to} (room ${p.roomId}) — laukia operatoriaus (admin.html)`);
    return item;
  }

  pending(): PendingPayout[] { return readAll().filter((x) => x.status === "pending"); }
  recentPaid(n = 20): PendingPayout[] { return readAll().filter((x) => x.status === "paid").slice(-n).reverse(); }

  // 🔒 10-12 DVIGUBO MOKĖJIMO FIKSAS: prieš siunčiant įrašas pažymimas "sending" (failas + Supabase).
  //   pending() jo nebegrąžina ⇒ kita flush kilpa / kitas procesas tos pačios išmokos antrą kartą NEima.
  //   Grąžina false, jei įrašas jau nebe "pending" (kažkas kitas jį jau paėmė).
  claim(id: string): boolean {
    const it = withLock(() => {
      const items = readAll();
      const x = items.find((y) => y.id === id && y.status === "pending");
      if (!x) return null;
      x.status = "sending";
      writeAll(items);
      return x;
    }, true);
    if (!it) return false;
    sbUpsert(it);
    return true;
  }
  // Grąžina į "pending" TIK kai tikrai žinome, kad pervedimas NEišsiųstas (klaida prieš broadcast).
  release(id: string): void {
    const it = withLock(() => {
      const items = readAll();
      const x = items.find((y) => y.id === id && y.status === "sending");
      if (!x) return null;
      x.status = "pending";
      writeAll(items);
      return x;
    });
    if (it) sbUpsert(it);
  }

  markPaid(id: string, tx: string): boolean {
    const it = withLock(() => {
      const items = readAll();
      const x = items.find((y) => y.id === id && (y.status === "pending" || y.status === "sending"));
      if (!x) return null;
      x.status = "paid"; x.tx = String(tx || ""); x.paidAt = Date.now();
      writeAll(items);
      return x;
    });
    if (!it) return false;
    sbUpsert(it);   // 🛟 durablus dublis — pažymim „paid" ir Supabase'e (kad reconcile antrą kartą nemokėtų)
    console.log(`[PayoutQueue] ✓ PAID ${it.amount} RONKE → ${it.to} tx ${it.tx}`);
    return true;
  }

  // 🛟 Startuojant: atstato Supabase LAUKIANČIAS išmokas į vietinį failą (po cloud redeploy failas tuščias).
  //   Dedupe pagal id; „paid" Supabase įrašai perrašo vietinius „pending" (kad flush antrą kartą nemokėtų).
  async reconcile(): Promise<number> {
    const c = sb(); if (!c) return 0;
    try {
      const { data, error } = await c.from("f9_bases").select("ronin_address,buildings").ilike("ronin_address", "blockspayout_%");
      if (error) { console.warn("[PayoutQueue] reconcile query fail:", error.message); return 0; }
      let restored = 0;
      withLock(() => {
      const items = readAll();
      const byId = new Map(items.map((x) => [x.id, x]));
      for (const row of (data || [])) {
        const it = (row as any)?.buildings?.blocksPayout as PendingPayout | undefined;
        if (!it || !it.id) continue;
        const local = byId.get(it.id);
        if (!local) {
          // 🔒 SAUGU: atstatytą LAUKIANČIĄ išmoką žymim `manual` → auto-flush jos NEmokės, kol
          //    neverifikuota on-chain (ar pool jau nesumokėjo prieš redeploy). Išvengiam dvigubo
          //    apmokėjimo, jei „paid" žyma nespėjo pasiekti Supabase. Nieko neprarandama (įrašas durabilus).
          // 🛟 08-20 IŠIMTIS: įrašai su `autopay: true` — tai RANKINIAI sutikrinimai (`_refund_stuck.mjs`),
          //    kur mokėjimas JAU patvirtintas on-chain IR patikrinta, kad grąžinimo dar nebuvo.
          //    Be šios išimties jie amžinai likdavo `manual`, o `admin.html` (vienintelis manual kelias)
          //    repozitorijoje NEEGZISTUOJA ⇒ pinigai kabodavo eilėje ir žaidėjas jų NIEKADA negaudavo.
          if (it.status === "pending") { if (!(it as any).autopay) { it.manual = true; } restored++; }
          items.push(it); byId.set(it.id, it);
        }
        else if (it.status === "paid" && local.status !== "paid") { local.status = "paid"; local.tx = it.tx; local.paidAt = it.paidAt; }
        else if (it.status === "sending" && local.status === "pending") { local.status = "sending"; }   // kitas procesas jau paėmė
      }
      if (restored || (data || []).length) writeAll(items);
      });
      if (restored) console.log(`[PayoutQueue] 🛟 reconcile: atstatytos ${restored} laukianči(os) išmok(os) iš Supabase`);
      return restored;
    } catch (e: any) { console.warn("[PayoutQueue] reconcile fail:", e?.message); return 0; }
  }
}

export const PayoutQueue = new PayoutQueueImpl();
