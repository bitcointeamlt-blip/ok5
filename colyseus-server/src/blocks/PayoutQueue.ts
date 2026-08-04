import * as fs from "fs";
import * as path from "path";

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

class PayoutQueueImpl {
  // Įrašo laukiančią išmoką. Dedupe: tas pats roomId+to+kind (dar nepamokėtas) → negrūdinam antro.
  add(p: { to: string; amount: number; kind: PayoutKind; roomId: string; manual?: boolean }): PendingPayout | null {
    const to = String(p.to || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(to) || !(p.amount > 0)) return null;
    const items = readAll();
    const dup = items.find((x) => x.roomId === p.roomId && x.to === to && x.kind === p.kind && x.status !== "paid");
    if (dup) return dup;
    const item: PendingPayout = {
      id: `${p.roomId}_${p.kind}_${to.slice(2, 10)}`,
      to, amount: p.amount, kind: p.kind, roomId: p.roomId,
      createdAt: Date.now(), status: "pending", manual: !!p.manual,
    };
    items.push(item);
    writeAll(items);
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
    console.log(`[PayoutQueue] ✓ PAID ${it.amount} RONKE → ${it.to} tx ${it.tx}`);
    return true;
  }
}

export const PayoutQueue = new PayoutQueueImpl();
