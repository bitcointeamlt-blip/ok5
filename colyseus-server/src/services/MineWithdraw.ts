import { Wallet, JsonRpcProvider, Contract } from "ethers";

// ⛏️💸 MINING withdrawal voucher'iai (EIP-712) — RONKE→wallet. Serveris = vienintelis mining pot autoritetas:
//   nurašo pot IŠDUODAMAS voucher'į, žaidėjas PATS siunčia TX (moka gas → PoD). Kontraktas = RonkeReward
//   (TAS PATS faucet pool — 07-11 user: „naudok faucet pool, nereikia naujo"). Verifikuoja signer parašą +
//   msg.sender==player + on-chain lubas (maxSingleClaim/maxClaimsPerDay/dailyBudget). Signer = 0x9FFF (RONKE_REWARD_SIGNER_KEY).

// RonkeReward.signer() on-chain == 0x9FFF739f… == BONE_SIGNER_KEY address (patikrinta 07-11). Tas pats
// autorizuotas signer'is faucet'ui/bones/mining, todėl fallback į BONE_SIGNER_KEY → veikia be naujo env.
const SIGNER_KEY = process.env.RONKE_REWARD_SIGNER_KEY || process.env.MINE_SIGNER_KEY || process.env.BONE_SIGNER_KEY || "";
const REWARD_ADDR = process.env.RONKE_REWARD_CONTRACT_ADDRESS || "0xc59e860e2115ccdab499f619a67bedf71ee26007";   // RonkeReward MAINNET (faucet pool — reuse)
const CHAIN_ID = Number(process.env.RONKE_REWARD_CHAIN_ID || 2020);   // Ronin mainnet
// 🔴 2026-08-14: drpc default MIRĘS (500) → nonce patikra amžinai grąžindavo null → minePend
// niekada neišsivalydavo → „Previous withdrawal still pending" blokavo žaidėjus VISAM (4 užstrigo).
// FIX kaip bless'o chainCounts (81eb34e): RPC sąrašas su rotacija per bandymus — net jei env miręs,
// kitas bandymas pasiekia gyvą endpointą.
const RPC_URLS = [
  process.env.RONKE_REWARD_RPC || "",
  "https://rpc-ronin-mainnet-bfz9fadqzl.t.conduit.xyz",   // Conduit — dosniausias limitas
  "https://api.roninchain.com/rpc",
  "https://ronin.gateway.tenderly.co",
].filter(Boolean);
export const MINE_MAX_SINGLE = Number(process.env.MINE_MAX_SINGLE || 1000);   // == RonkeReward maxSingleClaim (vienas withdraw ≤ tiek)
const VOUCHER_TTL_MS = 30 * 60 * 1000;   // 30 min galiojimas (== kontrakto deadline langas)

const _provs = new Map<string, JsonRpcProvider>();
function getProv(i = 0): JsonRpcProvider {
  const url = RPC_URLS[Math.min(i, RPC_URLS.length - 1)];
  let p = _provs.get(url);
  if (!p) { p = new JsonRpcProvider(url, CHAIN_ID, { staticNetwork: true }); _provs.set(url, p); }
  return p;
}

let _wallet: Wallet | null = null;
function getSigner(): Wallet | null {
  if (_wallet) return _wallet;
  if (!SIGNER_KEY) return null;
  try { _wallet = new Wallet(SIGNER_KEY); } catch (e: any) { console.warn("[MineWithdraw] bad SIGNER_KEY:", e?.message); return null; }
  return _wallet;
}
export function mineWithdrawEnabled(): boolean { return !!getSigner(); }

export type MineVoucher = { player: string; amount: string; deadline: number; nonce: string; signature: string; contract: string; chainId: number };

// Pasirašo claimReward voucher'į. Kviesti TIK po pot rezervavimo/nurašymo (server-auth). ronke = SVEIKAS RONKE kiekis.
export async function signMineVoucher(player: string, ronke: number): Promise<MineVoucher | null> {
  const w = getSigner();
  if (!w) return null;
  const amt = Math.max(0, Math.min(MINE_MAX_SINGLE, Math.floor(ronke)));
  if (amt <= 0) return null;
  const amount = (BigInt(amt) * (10n ** 18n)).toString();   // RONKE wei
  const deadline = Math.floor((Date.now() + VOUCHER_TTL_MS) / 1000);
  const nonce = (BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000))).toString();
  const domain = { name: "RonkeReward", version: "1", chainId: CHAIN_ID, verifyingContract: REWARD_ADDR };
  const types = { ClaimReward: [
    { name: "player", type: "address" }, { name: "amount", type: "uint256" },
    { name: "deadline", type: "uint256" }, { name: "nonce", type: "uint256" },
  ] };
  try {
    const sig = await w.signTypedData(domain, types, { player, amount, deadline, nonce });
    return { player, amount, deadline, nonce, signature: sig, contract: REWARD_ADDR, chainId: CHAIN_ID };
  } catch (e: any) { console.warn("[MineWithdraw] sign fail:", e?.message); return null; }
}

// Ar nonce panaudotas on-chain? (deduct/re-credit sprendimui). null = VISI RPC nepavyko (saugom pending, bandom vėliau).
// Kiekvienas bandymas per KITĄ endpointą — vienas miręs RPC nebeužrakina žaidėjų (08-14 fix).
export async function isMineNonceUsed(nonce: string): Promise<boolean | null> {
  for (let i = 0; i < RPC_URLS.length; i++) {
    try {
      const c = new Contract(REWARD_ADDR, ["function usedNonces(uint256) view returns (bool)"], getProv(i));
      return Boolean(await c.usedNonces(nonce));
    } catch (e: any) {
      if (i === RPC_URLS.length - 1) { console.warn("[MineWithdraw] nonce check fail (visi RPC):", e?.message); return null; }
    }
  }
  return null;
}
