import { Contract, JsonRpcProvider, isAddress } from "ethers";

// Ronkeverse NFT (Ronin) – used for tiered PvP bonuses.
// Frontend reference:
// - contract: 0x810b6d1374ac7ba0e83612e7d49f49a13f1de019
// - rpc: https://api.roninchain.com/rpc

const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
];

function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] || "").trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function envBool(name: string, fallback = false): boolean {
  const v = (process.env[name] || "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export type NftBonusSnapshot = {
  nftCount: number;
  bonusHp: number;
  bonusDmg: number;
  bonusCritChance: number; // %
  armorRegenPerTick: 1 | 2;
};

export class NftBonusService {
  private provider: JsonRpcProvider;
  private ronkeverse: Contract;
  private cache = new Map<string, { at: number; snap: NftBonusSnapshot }>();
  private ttlMs: number;
  private enabled: boolean;

  constructor() {
    const rpc =
      (process.env.RONIN_RPC_URL || "").trim() ||
      (process.env.UFO_TICKET_RPC_URL || "").trim() ||
      "https://api.roninchain.com/rpc";
    const contract =
      (process.env.RONKEVERSE_NFT_CONTRACT_ADDRESS || "").trim() ||
      "0x810b6d1374ac7ba0e83612e7d49f49a13f1de019";

    this.enabled = envBool("PVP_NFT_BONUSES_ENABLED", true) && isAddress(contract) && !!rpc;
    this.ttlMs = Math.max(5_000, Math.min(10 * 60_000, envInt("PVP_NFT_BONUSES_TTL_MS", 60_000)));

    this.provider = new JsonRpcProvider(rpc);
    this.ronkeverse = new Contract(contract, ERC721_ABI, this.provider);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private computeBonuses(nftCount: number): NftBonusSnapshot {
    const bonusHp = nftCount >= 2 ? 5 : 0;
    const bonusCritChance = nftCount >= 3 ? 2 : 0;
    const bonusDmg = nftCount >= 5 ? 3 : 0;
    const armorRegenPerTick: 1 | 2 = nftCount >= 1 ? 2 : 1;
    return { nftCount, bonusHp, bonusDmg, bonusCritChance, armorRegenPerTick };
  }

  async getRonkeverseBonuses(address: string): Promise<NftBonusSnapshot> {
    const addr = (address || "").trim();
    if (!this.enabled || !addr || !isAddress(addr)) {
      return this.computeBonuses(0);
    }

    const key = addr.toLowerCase();
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && (now - cached.at) < this.ttlMs) {
      return cached.snap;
    }

    try {
      const bal = await this.ronkeverse.balanceOf(addr);
      const nftCount = Math.max(0, Math.min(10_000, Number(bal)));
      const snap = this.computeBonuses(nftCount);
      this.cache.set(key, { at: now, snap });
      return snap;
    } catch {
      const snap = this.computeBonuses(0);
      this.cache.set(key, { at: now, snap });
      return snap;
    }
  }
}

export const nftBonusService = new NftBonusService();


