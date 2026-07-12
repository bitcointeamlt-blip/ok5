import { ethers } from "ethers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ⚔️💰 RAID FEE (2026-07-12 user): už KIEKVIENĄ raidą (live + async) PUOLIKAS sumoka RAID_FEE_RONKE
//   RONKE → VISKAS į TREASURY (jokio burn / gynėjo split — user sprendimas; gynėjas nieko negauna,
//   moka TIK puolėjas). Be naujo kontrakto: klientas daro paprastą ERC20 transfer į treasury, serveris
//   on-chain verifikuoja TX hash (MintReward šablonas: receipt → Transfer log → suma/kryptis/amžius)
//   + DEDUPE per unikalų f9_bases insert'ą (vienas TX = vienas raidas; veikia ir tarp pm2 instancų).
//   Consume TIK raid'ui realiai praėjus visus gate'us — atmestas join (SHIELDED/CD/NO_DEFENDERS)
//   TX NEsudegina, klientas jį panaudos kitam bandymui.
//   Įjungimas per env: RAID_FEE_RONKE>0 (prod dashboard). Lokaliai default 0 = išjungta (testai/dev nepaveikti).

const RONKE = (process.env.RONKE_TOKEN_ADDR || "0xf988f63bf26C3Ed3fBf39922149E3E7b1e5c27cB").toLowerCase();   // ⚠️ mainnet RONKE (0xf988f63…, NE 0xf988f5aa — dažna painiava!)
const TREASURY = (process.env.RAID_TREASURY || "0xfF0a2d76E6156Bc1C0c689fe4029f6F1a566E92e").toLowerCase();   // Barracks/market treasury
export const RAID_FEE_RONKE = Number(process.env.RAID_FEE_RONKE || 0);   // 0 = fee IŠJUNGTAS
const MAX_TX_AGE_MS = Number(process.env.RAID_FEE_TX_AGE_MS || 60 * 60 * 1000);   // TX ne senesnis nei 1h (replay langas)
const RPC = process.env.RONIN_MAINNET_RPC || process.env.RONIN_RPC || "https://ronin.drpc.org";
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

export function raidFeeEnabled(): boolean { return RAID_FEE_RONKE > 0; }

let _prov: ethers.JsonRpcProvider | null = null;
function prov(): ethers.JsonRpcProvider {
  if (!_prov) _prov = new ethers.JsonRpcProvider(RPC, 2020, { staticNetwork: true });
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

// Verifikuoja IR sunaudoja raid fee TX. Kviesti PASKUTINIU gate'u (po shield/CD/defenders) —
// ok:false NIEKO nesunaudoja. reason: bad_tx | tx_not_found | no_payment | tx_expired | fee_used | db_off | rpc
export async function verifyAndConsumeRaidFee(attacker: string, txHash: string): Promise<{ ok: boolean; reason?: string }> {
  if (!raidFeeEnabled()) return { ok: true };
  attacker = (attacker || "").trim().toLowerCase();
  txHash = (txHash || "").trim().toLowerCase();
  if (!attacker || !/^0x[0-9a-f]{64}$/.test(txHash)) return { ok: false, reason: "bad_tx" };
  try {
    const rc = await prov().getTransactionReceipt(txHash);
    if (!rc || rc.status !== 1) return { ok: false, reason: "tx_not_found" };
    const need = ethers.parseUnits(String(RAID_FEE_RONKE), 18);
    let paid = false;
    for (const lg of rc.logs) {
      if (String(lg.address).toLowerCase() !== RONKE) continue;
      if (lg.topics[0] !== TRANSFER_TOPIC || lg.topics.length < 3) continue;
      const from = ("0x" + lg.topics[1].slice(26)).toLowerCase();
      const to = ("0x" + lg.topics[2].slice(26)).toLowerCase();
      if (from !== attacker || to !== TREASURY) continue;
      if (BigInt(lg.data) >= need) { paid = true; break; }
    }
    if (!paid) return { ok: false, reason: "no_payment" };
    const blk = await prov().getBlock(rc.blockNumber);
    if (!blk || Date.now() - Number(blk.timestamp) * 1000 > MAX_TX_AGE_MS) return { ok: false, reason: "tx_expired" };
    // DEDUPE: unikalus insert (ronin_address UNIQUE) — konfliktas = TX jau panaudotas kitam raidui.
    const c = sb();
    if (!c) return { ok: false, reason: "db_off" };   // be DB negarantuojam vienkartinumo → fail-closed
    const { error } = await c.from("f9_bases").insert({ ronin_address: "fee_" + txHash, buildings: { raidFee: { attacker, at: Date.now(), ronke: RAID_FEE_RONKE } } });
    if (error) return { ok: false, reason: "fee_used" };
    console.log(`[RaidFee] ✅ ${RAID_FEE_RONKE} RONKE → treasury (${attacker.slice(0, 10)}…, tx ${txHash.slice(0, 14)}…)`);
    return { ok: true };
  } catch (e: any) {
    console.warn("[RaidFee] verify fail:", e?.message);
    return { ok: false, reason: "rpc" };
  }
}
