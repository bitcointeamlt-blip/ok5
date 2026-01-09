import { Contract, JsonRpcProvider, Wallet, isAddress } from "ethers";

/**
 * UFO Ticket service (server-side).
 *
 * This is intentionally "env-driven":
 * - If UFO_TICKET_RPC_URL or UFO_TICKET_CONTRACT_ADDRESS is not set, all checks become NO-OP.
 * - If UFO_TICKET_REQUIRED=true, joins are denied unless a valid active ticket is verified.
 *
 * Expected contract surface (can evolve, but keep these methods stable):
 * - activeTokenIdOf(address owner) -> uint256 (0 means none)
 * - ownerOf(uint256 tokenId) -> address
 * - isDestroyed(uint256 tokenId) -> bool   (optional; if missing we treat as not destroyed)
 * - resolveMatch(uint256 loserTokenId, address winner) -> tx (burn loser + payout winner)
 */

const UFO_TICKET_ABI = [
  "function activeTokenIdOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function isDestroyed(uint256 tokenId) view returns (bool)",
  "function statsOf(uint256 tokenId) view returns (uint16 maxHP,uint16 maxArmor,uint16 dmg,uint8 critChance,uint8 accuracy,uint16 maxFuel)",
  "function resolveMatch(uint256 loserTokenId, address winner) external",
];

function envBool(name: string, fallback = false): boolean {
  const v = (process.env[name] || "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function safeLower(a: string): string {
  return (a || "").trim().toLowerCase();
}

export type UfoTicketJoinCheck =
  | { ok: true; tokenId: bigint }
  | { ok: false; reason: string };

export type UfoTicketStats = {
  maxHP: number;
  maxArmor: number;
  dmg: number;
  critChance: number;
  accuracy: number;
  maxFuel: number;
};

class UfoTicketService {
  private _provider: JsonRpcProvider | null = null;
  private _contract: Contract | null = null;
  private _signer: Wallet | null = null;
  // Serialize resolveMatch tx submissions to avoid signer nonce contention across parallel rooms.
  private _resolveQueue: Promise<any> = Promise.resolve();

  isEnabled(): boolean {
    return !!this._contract;
  }

  isRequired(): boolean {
    return envBool("UFO_TICKET_REQUIRED", false);
  }

  init(): void {
    if (this._contract) return;
    const rpcUrl = (process.env.UFO_TICKET_RPC_URL || "").trim();
    const contractAddr = (process.env.UFO_TICKET_CONTRACT_ADDRESS || "").trim();
    if (!rpcUrl || !contractAddr) return;
    if (!isAddress(contractAddr)) {
      console.warn("[UFO_TICKET] invalid UFO_TICKET_CONTRACT_ADDRESS");
      return;
    }
    try {
      this._provider = new JsonRpcProvider(rpcUrl);
      const pk = (process.env.UFO_TICKET_SIGNER_PRIVATE_KEY || "").trim();
      if (pk) {
        try {
          this._signer = new Wallet(pk, this._provider);
        } catch {
          console.warn("[UFO_TICKET] invalid UFO_TICKET_SIGNER_PRIVATE_KEY");
        }
      }
      this._contract = new Contract(contractAddr, UFO_TICKET_ABI, this._signer || this._provider);
      console.log("[UFO_TICKET] enabled:", { required: this.isRequired(), contract: contractAddr });
    } catch (e: any) {
      console.warn("[UFO_TICKET] init failed:", e?.message || e);
      this._provider = null;
      this._contract = null;
      this._signer = null;
    }
  }

  async checkJoin(address: string, tokenIdFromClient?: bigint | null): Promise<UfoTicketJoinCheck> {
    this.init();
    const required = this.isRequired();
    const enabled = this.isEnabled();

    const addr = (address || "").trim();
    if (!addr || !isAddress(addr)) {
      return required ? { ok: false, reason: "wallet_required" } : { ok: true, tokenId: 0n };
    }

    if (!enabled) {
      // No contract configured => dev/no-op.
      return required ? { ok: false, reason: "ticket_not_configured" } : { ok: true, tokenId: 0n };
    }

    const tryValidateTokenId = async (tokenId: bigint): Promise<UfoTicketJoinCheck> => {
      if (!tokenId) return { ok: false, reason: "ticket_required" };
      const owner = safeLower(await this._contract!.ownerOf(tokenId));
      if (owner !== safeLower(addr)) return { ok: false, reason: "ticket_not_owned" };
      // Optional: destroyed flag
      try {
        const destroyed = (await this._contract!.isDestroyed(tokenId)) as boolean;
        if (destroyed) return { ok: false, reason: "ticket_destroyed" };
      } catch {
        // ignore if method not present
      }
      return { ok: true, tokenId };
    };

    try {
      // If client provided tokenId, validate it first; if invalid, fall back to activeTokenIdOf(addr)
      if (tokenIdFromClient && tokenIdFromClient > 0n) {
        try {
          const res = await tryValidateTokenId(tokenIdFromClient);
          if (res.ok) return res;
        } catch {}
      }

      const active = (await this._contract!.activeTokenIdOf(addr)) as bigint;
      return await tryValidateTokenId(active);
    } catch (e: any) {
      return { ok: false, reason: `ticket_check_failed:${e?.message || "unknown"}` };
    }
  }

  async resolveMatchBurnAndPayout(loserTokenId: bigint, winnerAddress: string): Promise<string | null> {
    this.init();
    if (!this._contract || !this._signer) return null; // needs signer
    if (!loserTokenId) return null;
    const winner = (winnerAddress || "").trim();
    if (!winner || !isAddress(winner)) return null;

    const run = async (): Promise<string | null> => {
      try {
        const tx = await this._contract!.resolveMatch(loserTokenId, winner);
        const hash = (tx?.hash || "").toString();
        // Fire-and-forget confirmation (don't block room)
        try { tx.wait?.(1).catch(() => {}); } catch {}
        return hash || null;
      } catch (e: any) {
        console.warn("[UFO_TICKET] resolveMatch failed:", e?.message || e);
        return null;
      }
    };

    // Ensure sequential submission even if callers don't await.
    const task = this._resolveQueue.then(run, run);
    this._resolveQueue = task.then(() => {}, () => {});
    return await task;
  }

  async getStats(tokenId: bigint): Promise<UfoTicketStats | null> {
    this.init();
    if (!this._contract) return null;
    if (!tokenId) return null;
    try {
      const s = await this._contract!.statsOf(tokenId);
      // ethers returns a Result that supports both positional + named props
      const maxHP = Number(s?.maxHP ?? s?.[0] ?? 0);
      const maxArmor = Number(s?.maxArmor ?? s?.[1] ?? 0);
      const dmg = Number(s?.dmg ?? s?.[2] ?? 0);
      const critChance = Number(s?.critChance ?? s?.[3] ?? 0);
      const accuracy = Number(s?.accuracy ?? s?.[4] ?? 0);
      const maxFuel = Number(s?.maxFuel ?? s?.[5] ?? 0);
      return { maxHP, maxArmor, dmg, critChance, accuracy, maxFuel };
    } catch (e: any) {
      console.warn("[UFO_TICKET] statsOf failed:", e?.message || e);
      return null;
    }
  }
}

export const ufoTicketService = new UfoTicketService();


