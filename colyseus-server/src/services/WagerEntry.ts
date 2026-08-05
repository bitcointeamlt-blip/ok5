import { ethers } from "ethers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 🧱💰 BLOCKS WAGER — įėjimo mokėjimo VERIFIKACIJA (RaidFee šablonas, žr. [[RaidFee.ts]]).
//
// Žaidėjas PATS pasirašo `PewPewPlayV2.payAndPlay(stake, true, 'blocks_<tier>')` → viduje daroma
// `transferFrom(player → treasury, stake)` → RONKE Transfer log (from=player, to=treasury, value=stake).
// Serveris on-chain patikrina KVITĄ (kaip RaidFee/MintReward): status OK, RONKE Transfer from=player
// to=treasury value **LYGI tier** (EXACT — kad negalėtų susidaryti 69-vs-800 rungtynių), tx amžius
// < replay langas, + DEDUPE (vienas tx = vienas įėjimas; unikalus insert). Fail-closed be DB.
//
// ⚠️ tx.to = PewPewPlayV2 (registruotas PoD #68) IR pasirašo ŽAIDĖJAS → PoD užsikabina TAME PAČIAME tx.
// Įjungimas: BLOCKS_WAGER_TREASURY (privaloma — TURI sutapti su PewPewPlayV2.treasury()!) + RPC + Supabase.
//   Kol nesukonfigūruota → wagerEnabled()=false → serveris rungtynes laiko NEMOKAMOMIS (jokio charge/payout).

const RONKE = (process.env.RONKE_TOKEN_ADDR || "0xf988f63bf26C3Ed3fBf39922149E3E7b1e5c27cB").toLowerCase();   // ⚠️ mainnet RONKE (0xf988f63…, NE 0xf988f5aa)
const TREASURY = (process.env.BLOCKS_WAGER_TREASURY || "").toLowerCase();   // = PewPewPlayV2.treasury() (kur payAndPlay siunčia). Be jo → wager OFF.
const MAX_TX_AGE_MS = Number(process.env.BLOCKS_WAGER_TX_AGE_MS || 60 * 60 * 1000);   // TX ne senesnis nei 1h (replay langas)
// Keli RPC su FALLBACK (jei vienas 429/nukrenta → kitas aptarnauja). Sumažina „game didn't start" dėl RPC.
// Eiliškumas: tenderly PIRMAS (patikimas ~155ms) — drpc periodiškai meta „Temporary internal error"/429,
//   tad nebe pirmas; api.roninchain paskutinis (svyruoja iki 4+s). RONKE_RPCS env perrašo viską
//   (pvz. Sky Mavis private raktas → pirmas), kad realiam krūviui būtų dedikuotas RPC.
const RPCS = [...new Set((process.env.RONKE_RPCS || ["https://ronin.gateway.tenderly.co", "https://ronin.drpc.org", process.env.RONKE_RPC_URL, process.env.RONIN_MAINNET_RPC, "https://api.roninchain.com/rpc"].filter(Boolean).join(",")).split(",").map((s) => s.trim()).filter(Boolean))];
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

// wager verifikacija „gyva" tik kai turim treasury adresą (kur tikrinti mokėjimą) — kitaip nemokamas režimas.
export function wagerEnabled(): boolean { return /^0x[0-9a-f]{40}$/.test(TREASURY); }

let _prov: ethers.AbstractProvider | null = null;
function prov(): ethers.AbstractProvider {
  if (_prov) return _prov;
  _prov = RPCS.length > 1
    ? new ethers.FallbackProvider(RPCS.map((u, i) => ({ provider: new ethers.JsonRpcProvider(u, 2020, { staticNetwork: true, batchMaxCount: 1 }), priority: i + 1, stallTimeout: 2500, weight: 1 })), 2020, { quorum: 1 })
    : new ethers.JsonRpcProvider(RPCS[0] || "https://api.roninchain.com/rpc", 2020, { staticNetwork: true, batchMaxCount: 1 });
  console.log(`[WagerEntry] RPC: ${RPCS.length} endpoint(s) (fallback)`);
  return _prov;
}

let _sb: SupabaseClient | null = null; let _sbTried = false;
function sb(): SupabaseClient | null {
  if (_sbTried) return _sb;
  _sbTried = true;
  const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}

// Verifikuoja IR sunaudoja (dedupe) wager įėjimo TX. Kviesti PRIEŠ rungtynių startą (po abiejų sutikimo).
//   EXACT tier: value TURI būti lygi tierRonke (ne >=) → apsauga nuo 69-vs-800 nelygių rungtynių.
//   ok:false NIEKO nesunaudoja (išskyrus fee_used = tx jau panaudotas). reason: bad_tx | tx_not_found |
//   wrong_amount | wrong_to | tx_expired | fee_used | db_off | rpc | disabled
export async function verifyWagerEntry(player: string, txHash: string, tierRonke: number): Promise<{ ok: boolean; reason?: string }> {
  if (!wagerEnabled()) return { ok: false, reason: "disabled" };
  player = (player || "").trim().toLowerCase();
  txHash = (txHash || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(player) || !/^0x[0-9a-f]{64}$/.test(txHash)) return { ok: false, reason: "bad_tx" };
  if (!(tierRonke > 0)) return { ok: false, reason: "bad_tx" };
  try {
    // ⚡ ATSPARUMAS: šviežias tx dar gali būti neindeksuotas + RPC gali laikinai 429'inti → RETRY su backoff,
    //    kad mačas nenutrūktų dėl laikino RPC glitch'o. ~6 bandymai per ~15s.
    let rc: any = null;
    for (let i = 0; i < 6 && !rc; i++) {
      try { rc = await prov().getTransactionReceipt(txHash); } catch (_) { /* 429/timeout → bandom vėl */ }
      if (!rc) await new Promise((r) => setTimeout(r, 2500));
    }
    if (!rc) return { ok: false, reason: "tx_not_found" };
    if (rc.status !== 1) return { ok: false, reason: "tx_failed" };
    const need = ethers.parseUnits(String(tierRonke), 18);
    let sawPlayerTransfer = false, exactToTreasury = false;
    for (const lg of rc.logs) {
      if (String(lg.address).toLowerCase() !== RONKE) continue;
      if (lg.topics[0] !== TRANSFER_TOPIC || lg.topics.length < 3) continue;
      const from = ("0x" + lg.topics[1].slice(26)).toLowerCase();
      const to = ("0x" + lg.topics[2].slice(26)).toLowerCase();
      if (from !== player) continue;
      sawPlayerTransfer = true;
      // EXACT suma į MŪSŲ treasury (kur galėsim išmokėti/refundinti). Nelygu → atmetam.
      if (to === TREASURY && BigInt(lg.data) === need) { exactToTreasury = true; break; }
    }
    if (!exactToTreasury) return { ok: false, reason: sawPlayerTransfer ? "wrong_amount" : "wrong_to" };
    let blk: any = null;
    for (let i = 0; i < 3 && !blk; i++) { try { blk = await prov().getBlock(rc.blockNumber); } catch (_) {} if (!blk) await new Promise((r) => setTimeout(r, 1500)); }
    // jei blk gautas ir tx per senas → atmetam; jei RPC neatidavė blk (glitch) → praleidžiam amžių (replay vis tiek uždaro DB dedupe).
    if (blk && Date.now() - Number(blk.timestamp) * 1000 > MAX_TX_AGE_MS) return { ok: false, reason: "tx_expired" };
    // DEDUPE: unikalus insert — konfliktas = TX jau panaudotas kitoms rungtynėms (fail-closed be DB).
    const c = sb();
    if (!c) return { ok: false, reason: "db_off" };
    const { error } = await c.from("f9_bases").insert({ ronin_address: "blocksentry_" + txHash, buildings: { blocksWager: { player, at: Date.now(), tier: tierRonke } } });
    if (error) return { ok: false, reason: "fee_used" };
    console.log(`[WagerEntry] ✅ ${tierRonke} RONKE entry verified (${player.slice(0, 10)}…, tx ${txHash.slice(0, 14)}…)`);
    return { ok: true };
  } catch (e: any) {
    console.warn("[WagerEntry] verify fail:", e?.message);
    return { ok: false, reason: "rpc" };
  }
}
