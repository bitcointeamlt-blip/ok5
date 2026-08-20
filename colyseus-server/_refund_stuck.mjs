/**
 * 🧱💸 REFUNDAS: statymai, kurie apmokėti, bet mačas neįvyko ir pinigai negrįžo.
 *
 * Kaip veikia: NIEKO nesiunčia pats — įdeda įrašus į serverio IŠMOKŲ EILĘ (`blockspayout_*`),
 * kurią serveris naudoja ir normaliai veikdamas. AUTO režime serveris ją išmoka pats
 * (`StakeService.flushQueue`), MANUAL režime — operatorius pasirašo iš treasury.
 *
 * Naudojimas:
 *   node _refund_stuck.mjs           → DRY-RUN (tik parodo, ką darytų)
 *   node _refund_stuck.mjs --run     → realiai įdeda į eilę
 *
 * Prieš įrašydamas kiekvienam adresui PATIKRINA:
 *   1) ar tikrai buvo mokėjimas į treasury (on-chain kvitas),
 *   2) ar tam pačiam tx dar nėra išmokos eilėje (dedupe — kad nebūtų dvigubo grąžinimo).
 */
import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";
import "dotenv/config";

const RUN = process.argv.includes("--run");
const RONKE = "0xf988f63bf26C3Ed3fBf39922149E3E7b1e5c27cB";
const TREASURY = "0xfF0a2d76E6156Bc1C0c689fe4029f6F1a566E92e".toLowerCase();
const TRANSFER = ethers.id("Transfer(address,address,uint256)");

// Poros, kurių mačai NEĮVYKO (user patvirtino 2026-08-20). tx paimsim iš DB pagal adresą+laiką.
const AFFECTED = [
  "0x8a23f69f9ee498d12a0fd1132023cfc27e9734fd",
  "0x428547063493401820eebad2f00bd719fbd1717a",
  "0x32782d97a180a0fd5b6f775517ac4e3727bb624a",
];
const DAY = "2026-08-20";
const ONLY_AFTER = "17:00";   // rytiniai 25 RONKE (kitas režimas) NEĮTRAUKIAMI
// ⚠️ TIK poros, kurių mačas TIKRAI neįvyko (user patvirtino). Sąmoningai NEĮTRAUKTA:
//    17:26 ir 18:39 — user'io testai su treasury pinigine; 18:39 mačas ĮVYKO, tad grąžinti NEGALIMA
//    (pinigai teisėtai sunaudoti; laimėtojui priklauso prizas, ne refundas).
const ONLY_TIMES = ["17:14", "17:16", "17:53"];

const sb = createClient(
  process.env.SUPABASE_URL || "https://rbkivemouxwcgrpzazxb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const prov = new ethers.JsonRpcProvider("https://ronin.gateway.tenderly.co", 2020, { staticNetwork: true });

// Ar tx REALIAI pervedė `amount` RONKE iš `player` į treasury?
async function confirmPaid(tx, player, amount) {
  const rc = await prov.getTransactionReceipt(tx).catch(() => null);
  if (!rc || rc.status !== 1) return false;
  const need = ethers.parseUnits(String(amount), 18);
  return rc.logs.some((l) => {
    if (String(l.address).toLowerCase() !== RONKE.toLowerCase()) return false;
    if (l.topics[0] !== TRANSFER || l.topics.length < 3) return false;
    const from = ("0x" + l.topics[1].slice(26)).toLowerCase();
    const to = ("0x" + l.topics[2].slice(26)).toLowerCase();
    return from === player.toLowerCase() && to === TREASURY && BigInt(l.data) === need;
  });
}

const { data: entries } = await sb.from("f9_bases")
  .select("ronin_address,buildings,updated_at").ilike("ronin_address", "blocksentry_%")
  .order("updated_at", { ascending: false }).limit(200);

const rows = (entries || [])
  .map((r) => ({ tx: r.ronin_address.replace("blocksentry_", ""), ...(r.buildings?.blocksWager || {}), upd: r.updated_at }))
  .filter((r) => String(r.upd).startsWith(DAY) && String(r.upd).slice(11, 16) >= ONLY_AFTER)
  .filter((r) => ONLY_TIMES.includes(String(r.upd).slice(11, 16)))
  .filter((r) => AFFECTED.includes(String(r.player).toLowerCase()));

// jau esamos išmokos — kad nedubliuotume
const { data: payouts } = await sb.from("f9_bases").select("ronin_address,buildings").ilike("ronin_address", "blockspayout_%");
const doneTx = new Set((payouts || []).map((p) => p.buildings?.blocksPayout?.srcTx).filter(Boolean));

console.log(RUN ? "🔴 REALUS PALEIDIMAS\n" : "🟡 DRY-RUN (nieko nekeičia) — paleisk su --run\n");
let total = 0, n = 0, skipped = 0;

for (const r of rows.sort((a, b) => String(a.upd).localeCompare(String(b.upd)))) {
  const t = String(r.upd).slice(11, 16);
  if (doneTx.has(r.tx)) { console.log(`  ⏭  ${t} ${r.player.slice(0, 12)}… ${r.tier} — JAU eilėje/išmokėta`); skipped++; continue; }
  const paid = await confirmPaid(r.tx, r.player, r.tier);
  if (!paid) { console.log(`  ❌ ${t} ${r.player.slice(0, 12)}… ${r.tier} — on-chain NEPATVIRTINTA, praleidžiam`); skipped++; continue; }
  console.log(`  ✅ ${t} ${r.player} ${r.tier} RONKE  (tx ${r.tx.slice(0, 14)}…)`);
  total += Number(r.tier) || 0; n++;
  if (RUN) {
    const id = "stuckrefund_" + r.tx.slice(2, 18);
    const item = {
      id, to: r.player, amount: Number(r.tier), kind: "refund",
      roomId: "stuck_" + DAY, createdAt: Date.now(), status: "pending", manual: true,
      srcTx: r.tx, note: "match never happened (08-20) — manual reconciliation",
    };
    const { error } = await sb.from("f9_bases")
      .upsert({ ronin_address: "blockspayout_" + id, buildings: { blocksPayout: item } }, { onConflict: "ronin_address" });
    if (error) console.log(`     ⚠️ įrašyti nepavyko: ${error.message}`);
  }
}

console.log(`\nGrąžintina: ${n} įrašai · ${total} RONKE   (praleista: ${skipped})`);
if (!RUN) console.log("Realiam įdėjimui į eilę:  node _refund_stuck.mjs --run");
else console.log("Įdėta į išmokų eilę. AUTO režime serveris išmokės pats; MANUAL — pasirašai iš treasury.");
process.exit(0);
