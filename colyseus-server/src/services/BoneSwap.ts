import { Wallet, JsonRpcProvider, Contract } from "ethers";

// 🦴→RONKE swap voucher'iai (EIP-712). Serveris = vienintelis kaulų apskaitos šaltinis:
//   nurašo kaulus iš banko IŠDUODAMAS voucher'į, žaidėjas PATS siunčia TX (pats moka gas).
//   Kontraktas BoneExchange verifikuoja parašą + min 100 kaulų + msg.sender == player.
//   Saigon test deploy: BoneExchange.deployed.json (lenta workspace). Mainnet — laukia „go".

const SIGNER_KEY = process.env.BONE_SIGNER_KEY || "";
const XCHG_ADDR = process.env.BONE_XCHG_ADDR || "";
const CHAIN_ID = Number(process.env.BONE_CHAIN_ID || 202601);          // Saigon default
const RPC_URL = process.env.BONE_RPC || "https://saigon-testnet.roninchain.com/rpc";
export const RONKE_PER_BONE = Number(process.env.BONE_RONKE_PER_BONE || 5);   // == kontrakto ronkePerBone
export const MIN_BONES = Number(process.env.BONE_MIN || 100);                 // == kontrakto minDeciBones/10
export const MAX_SWAP_BONES = Number(process.env.BONE_MAX_SWAP || 1000);      // == kontrakto maxSingleSwap/10
const NFT_ADDR = process.env.BONE_NFT_ADDR || "";                             // 🎫 Ronkeverse gate kolekcija
export const NFT_REQUIRED = Number(process.env.BONE_NFT_REQUIRED || 1);       // == kontrakto minNftRequired
const VOUCHER_TTL_MS = 60 * 60 * 1000;   // 1h galiojimas

let _prov: JsonRpcProvider | null = null;
function getProv(): JsonRpcProvider {
  if (!_prov) _prov = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
  return _prov;
}

let _wallet: Wallet | null = null;
function getSigner(): Wallet | null {
  if (_wallet) return _wallet;
  if (!SIGNER_KEY) return null;
  try { _wallet = new Wallet(SIGNER_KEY); } catch (e: any) { console.warn("[BoneSwap] bad BONE_SIGNER_KEY:", e?.message); return null; }
  return _wallet;
}

export function boneSwapEnabled(): boolean { return !!(getSigner() && XCHG_ADDR); }

// Kliento UI konfigas (rodyti kursą/min/kontraktą; klientas TX siunčia pats).
export function boneSwapCfg() {
  return { enabled: boneSwapEnabled(), contract: XCHG_ADDR, chainId: CHAIN_ID, rpc: RPC_URL,
           ratePerBone: RONKE_PER_BONE, minBones: MIN_BONES, maxSwapBones: MAX_SWAP_BONES,
           nftRequired: NFT_ADDR ? NFT_REQUIRED : 0 };   // 🎫 0 = gate išjungtas
}

// 🎫 Ar žaidėjas turi reikiamus Ronkeverse NFT? true/false; null = RPC nepavyko (kontraktas vis tiek enforce'ins).
//    Cache asimetrinis: turi → 5 min (retai keičiasi), NEturi → 30 s (ką tik nusipirkęs neturi laukt 5 min).
// ⚠️ 07-12 FIX: tikrinam MAINNET Ronkeverse (tas pats šaltinis kaip kapinės/mining/mint-bonus gate) —
//    anksčiau ėjo per BONE_RPC (Saigon testnet) su testiniu NFT_ADDR → tikras holdingas nesimatė ir UI
//    amžinai rodė ✗. On-chain BoneExchange savo gate'ą vis tiek enforce'ina pats TX metu.
const RV_MAINNET = process.env.RONKEVERSE_ADDR || "0x810B6d1374ac7BA0E83612E7d49F49A13f1de019";
const RV_RPC = process.env.RONIN_MAINNET_RPC || process.env.RONIN_RPC || "https://ronin.drpc.org";
let _rvProv: JsonRpcProvider | null = null;
function getRvProv(): JsonRpcProvider {
  if (!_rvProv) _rvProv = new JsonRpcProvider(RV_RPC, 2020, { staticNetwork: true });
  return _rvProv;
}
const _nftCache = new Map<string, { has: boolean; t: number }>();
export async function hasRequiredNft(address: string): Promise<boolean | null> {
  if (!NFT_ADDR || NFT_REQUIRED <= 0) return true;   // gate išjungtas
  const key = address.toLowerCase();
  const c = _nftCache.get(key);
  if (c && Date.now() - c.t < (c.has ? 5 * 60 * 1000 : 30 * 1000)) return c.has;
  try {
    const nft = new Contract(RV_MAINNET, ["function balanceOf(address) view returns (uint256)"], getRvProv());
    const has = Number(await nft.balanceOf(key)) >= NFT_REQUIRED;
    _nftCache.set(key, { has, t: Date.now() });
    return has;
  } catch (e: any) { console.warn("[BoneSwap] nft check fail:", e?.message); return null; }
}

export type SwapVoucher = { deciBones: number; nonce: string; deadline: number; sig: string; contract: string; chainId: number; rpc: string; createdAt: number };

// Pasirašo swap voucher'į. Kviesti TIK po sėkmingo kaulų nurašymo iš banko (server-auth).
export async function signSwapVoucher(player: string, deciBones: number): Promise<SwapVoucher | null> {
  const w = getSigner();
  if (!w || !XCHG_ADDR) return null;
  const deadline = Math.floor((Date.now() + VOUCHER_TTL_MS) / 1000);
  // unikalus uint256 nonce: ms laikas × 1e6 + random (kolizijos tikimybė ~0)
  const nonce = (BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000))).toString();
  const domain = { name: "BoneExchange", version: "1", chainId: CHAIN_ID, verifyingContract: XCHG_ADDR };
  const types = { SwapBones: [
    { name: "player", type: "address" }, { name: "deciBones", type: "uint256" },
    { name: "deadline", type: "uint256" }, { name: "nonce", type: "uint256" },
  ] };
  try {
    const sig = await w.signTypedData(domain, types, { player, deciBones, deadline, nonce });
    return { deciBones, nonce, deadline, sig, contract: XCHG_ADDR, chainId: CHAIN_ID, rpc: RPC_URL, createdAt: Date.now() };
  } catch (e: any) { console.warn("[BoneSwap] sign fail:", e?.message); return null; }
}

// Ar nonce panaudotas on-chain? (pasibaigusio voucher'io re-credit sprendimui). null = nepavyko patikrinti.
export async function isNonceUsed(nonce: string): Promise<boolean | null> {
  if (!XCHG_ADDR) return null;
  try {
    const c = new Contract(XCHG_ADDR, ["function usedNonces(uint256) view returns (bool)"], getProv());
    return Boolean(await c.usedNonces(nonce));
  } catch (e: any) { console.warn("[BoneSwap] nonce check fail:", e?.message); return null; }
}
