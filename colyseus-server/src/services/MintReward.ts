import { ethers } from "ethers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { addBones, boneBankOp } from "./BaseStore";

// 🦴🎫 RONKEVERSE HOLDER MINT-BONUS (2026-07-05, user):
//   Kai piniginėj yra ≥1 Ronkeverse NFT ir žaidėjas NUKALA (istrenina) naujus NFT unitus →
//   į kaulų banką prisideda bonusas pagal partijos dydį. Per-batch, PASIKARTOJANTIS (mint cost +
//   70/24h rate-limit natūraliai riboja). Server-authoritative + on-chain verifikuota:
//     • klientas atsiunčia mint TX hash → serveris skaito `UnitMinted(tokenId,owner,utype)` logus
//     • n = TIK NAUJI (dar neapdovanoti) tokenId'ai, kurių owner == autentiškas sesijos wallet
//     • dedupe pagal tokenId (`<addr>#minted` eilutė) → replay/spoof neįmanomas
//     • gate: mainnet Ronkeverse balanceOf ≥1 (tas pats, ką mato kapinės — NE Saigon swap gate)
//   Lentelė (cumulative už n vienu metu nukaltų): 1→10 2→21 3→33 4→44 5→55 6→66 7→77 8→88 9→99 10→110.
//   Cap 10 unitų = 110 kaulų per mintą (11n−1 pattern su +12 ties 3, kaip user surašė).

const RPC = process.env.RONIN_MAINNET_RPC || process.env.RONIN_RPC || "https://ronin.drpc.org";
const BARRACKS = (process.env.F9_BARRACKS_ADDR || "0xccf604511c5d2b5c3fd61adfba3950d0d2890862").toLowerCase();
const RONKEVERSE = "0x810B6d1374ac7BA0E83612E7d49F49A13f1de019";   // mainnet Ronkeverse (== kapinių gate)

const REWARD_TABLE = [0, 10, 21, 33, 44, 55, 66, 77, 88, 99, 110];   // [n] → kaulai (n=0..10)
export function mintRewardFor(n: number): number {
  if (n <= 0) return 0;
  return REWARD_TABLE[Math.min(n, 10)];
}

let _prov: ethers.JsonRpcProvider | null = null;
function prov(): ethers.JsonRpcProvider {
  if (!_prov) _prov = new ethers.JsonRpcProvider(RPC, 2020, { staticNetwork: true });
  return _prov;
}
const _iface = new ethers.Interface(["event UnitMinted(uint256 indexed tokenId, address indexed owner, uint8 utype)"]);

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
const _mintKey = (a: string) => _norm(a) + "#minted";

// Apdovanotų tokenId aibė (persistuota `<addr>#minted` eilutėj — dedupe/replay apsauga).
async function loadRewarded(addr: string): Promise<Set<string>> {
  const c = sb(); if (!c) return new Set();
  try {
    const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", _mintKey(addr)).maybeSingle();
    const arr = (data as any)?.buildings?.rewarded;
    return new Set(Array.isArray(arr) ? arr.map((x: any) => String(x)) : []);
  } catch { return new Set(); }
}
async function saveRewarded(addr: string, set: Set<string>): Promise<void> {
  const c = sb(); if (!c) return;
  try {
    await c.from("f9_bases").upsert(
      { ronin_address: _mintKey(addr), units: [], buildings: { rewarded: [...set] }, updated_at: new Date().toISOString() },
      { onConflict: "ronin_address" },
    );
  } catch { /* persist fail → tolerantiška; kitas mintas bandys vėl */ }
}

// 🎫 Gate: mainnet Ronkeverse ≥1. RPC fail → false (award TIK patvirtinus turėjimą).
async function hasRonkeverse(addr: string): Promise<boolean> {
  try {
    const c = new ethers.Contract(RONKEVERSE, ["function balanceOf(address) view returns (uint256)"], prov());
    return Number(await c.balanceOf(addr)) >= 1;
  } catch { return false; }
}

// TX receipt su retry (ką tik atsiųstas mintas gali dar nebūti indeksuotas).
async function getReceipt(txHash: string): Promise<ethers.TransactionReceipt | null> {
  for (let i = 0; i < 4; i++) {
    try { const r = await prov().getTransactionReceipt(txHash); if (r) return r; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return null;
}

// Iš TX receipt'o ištraukia tokenId'us, nukaltus ŠIAM adresui (UnitMinted, owner==addr).
function mintedTokenIds(receipt: ethers.TransactionReceipt, addr: string): Set<string> {
  const out = new Set<string>();
  for (const log of receipt.logs || []) {
    if ((log.address || "").toLowerCase() !== BARRACKS) continue;
    let parsed: any = null;
    try { parsed = _iface.parseLog({ topics: log.topics as string[], data: log.data }); } catch { continue; }
    if (!parsed || parsed.name !== "UnitMinted") continue;
    if (String(parsed.args.owner).toLowerCase() !== addr) continue;
    out.add(String(parsed.args.tokenId));
  }
  return out;
}

export type MintRewardResult = { ok: boolean; amount: number; n: number; total?: number; reason?: string };

// Pagrindinė. address = AUTENTIŠKAS sesijos wallet (F9Player.address, NE kliento teiginys) → spoof neįmanomas.
export async function claimMintReward(address: string, txHash: string): Promise<MintRewardResult> {
  const addr = _norm(address);
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return { ok: false, amount: 0, n: 0, reason: "bad_addr" };
  if (!/^0x[0-9a-f]{64}$/i.test(txHash)) return { ok: false, amount: 0, n: 0, reason: "bad_tx" };

  const receipt = await getReceipt(txHash);
  if (!receipt) return { ok: false, amount: 0, n: 0, reason: "no_receipt" };   // transient → klientas gali bandyt vėl
  if (Number((receipt as any).status) === 0) return { ok: false, amount: 0, n: 0, reason: "tx_failed" };

  const minted = mintedTokenIds(receipt, addr);
  if (!minted.size) return { ok: false, amount: 0, n: 0, reason: "no_mint" };   // ne šio wallet mintas / ne barracks

  if (!(await hasRonkeverse(addr))) return { ok: false, amount: 0, n: 0, reason: "no_ronkeverse" };

  // serializuota dedupe + award (atskiras raktas `#minted` → nesikerta su banko `#bones` op'ais)
  return boneBankOp(addr + "#minted", async (): Promise<MintRewardResult> => {
    const rewarded = await loadRewarded(addr);
    const fresh = [...minted].filter((t) => !rewarded.has(t));
    if (!fresh.length) return { ok: false, amount: 0, n: 0, reason: "already" };
    const n = fresh.length;
    const amount = mintRewardFor(n);
    if (amount <= 0) return { ok: false, amount: 0, n, reason: "zero" };
    fresh.forEach((t) => rewarded.add(t));
    await saveRewarded(addr, rewarded);
    const total = await addBones(addr, amount);   // addBones → boneBankOp(addr) (kitas raktas, jokio deadlock)
    console.log(`[MintReward] ${addr.slice(0, 10)}… +${amount}🦴 už ${n} nukaltų (viso banke ${total ?? "?"})`);
    return { ok: true, amount, n, total: total ?? undefined };
  });
}
