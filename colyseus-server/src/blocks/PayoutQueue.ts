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

export type PayoutKind = "win" | "refund";
export interface PendingPayout {
  id: string;
  to: string;
  amount: number;        // RONKE (žmogiškas skaičius, ne wei)
  kind: PayoutKind;
  roomId: string;
  createdAt: number;
  status: "pending" | "paid";
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
    const items = readAll();
    const dup = items.find((x) => x.roomId === p.roomId && x.to === to && x.kind === p.kind && x.status !== "paid");
    if (dup) return dup;
    const item: PendingPayout = {
      id: `${p.roomId}_${p.kind}_${to.slice(2, 10)}`,
      to, amount: p.amount, kind: p.kind, roomId: p.roomId,
      createdAt: Date.now(), status: "pending", manual: !!p.manual,
      ...(p.note ? { note: p.note } : {}),
    };
    items.push(item);
    writeAll(items);
    sbUpsert(item);   // 🛟 durablus dublis (išgyvena cloud redeploy)
    console.log(`[PayoutQueue] + ${p.kind} ${p.amount} RONKE → ${to} (room ${p.roomId}) — laukia operatoriaus (admin.html)`);
    return item;
  }

  pending(): PendingPayout[] { return readAll().filter((x) => x.status === "pending"); }
  recentPaid(n = 20): PendingPayout[] { return readAll().filter((x) => x.status === "paid").slice(-n).reverse(); }

  markPaid(id: string, tx: string): boolean {
    const items = readAll();
    const it = items.find((x) => x.id === id && x.status === "pending");
    if (!it) return false;
    it.status = "paid"; it.tx = String(tx || ""); it.paidAt = Date.now();
    writeAll(items);
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
      const items = readAll();
      const byId = new Map(items.map((x) => [x.id, x]));
      let restored = 0;
      for (const row of (data || [])) {
        const it = (row as any)?.buildings?.blocksPayout as PendingPayout | undefined;
        if (!it || !it.id) continue;
        const local = byId.get(it.id);
        if (!local) {
          // 🔒 SAUGU: atstatytą LAUKIANČIĄ išmoką žymim `manual` → auto-flush jos NEmokės, kol
          //    neverifikuota on-chain (ar pool jau nesumokėjo prieš redeploy). Išvengiam dvigubo
          //    apmokėjimo, jei „paid" žyma nespėjo pasiekti Supabase. Nieko neprarandama (įrašas durabilus).
          if (it.status === "pending") { it.manual = true; restored++; }
          items.push(it); byId.set(it.id, it);
        }
        else if (it.status === "paid" && local.status !== "paid") { local.status = "paid"; local.tx = it.tx; local.paidAt = it.paidAt; }
      }
      if (restored || (data || []).length) writeAll(items);
      if (restored) console.log(`[PayoutQueue] 🛟 reconcile: atstatytos ${restored} laukianči(os) išmok(os) iš Supabase`);
      return restored;
    } catch (e: any) { console.warn("[PayoutQueue] reconcile fail:", e?.message); return 0; }
  }
}

export const PayoutQueue = new PayoutQueueImpl();
