// ── F9 PvP stake/payout service (FAZA D escrow scaffold). ──
// Server-side ekonomika (pot apskaita) gyvena F9PvpRoom. Šis servisas = ON-CHAIN sluoksnis:
// realus RONKE įėjimo mokesčio nuskaitymas + pergalės payout. Modeliuotas pagal DOT Clicker
// UfoTicketService šabloną (žr. memory/project_lenta_pvp_colyseus „escrow šablonas").
//
// ⚠️ SAUGUMAS: kol env raktai nesukonfigūruoti → VISKAS NO-OP (tik log). Realus on-chain RONKE
// judėjimas (transferFrom/transfer ar signed claim) ĮJUNGIAMAS tik kai user PATVIRTINA + pateikia
// kontrakto/treasury/signer duomenis ([[feedback_deploy_confirm]]). Realus transfer kodas
// SĄMONINGAI neįdiegtas — tik aiškūs TODO, kad netyčia nepajudėtų pinigai.
//
// Env (visi reikalingi, kad įsijungtų): RONKE_TOKEN_ADDRESS, RONKE_RPC_URL,
//   STAKE_SIGNER_PRIVATE_KEY, STAKE_TREASURY_ADDRESS.

export interface Payout { address: string; amount: number; sessionId: string; }
export interface DeathSettle { tokenId: string; owner: string; utype: string; level: number; outcome: "burn" | "lock"; lockUntil: number; }

export class StakeService {
  readonly enabled: boolean;
  private tokenAddr: string;
  private rpcUrl: string;
  private treasury: string;

  constructor() {
    this.tokenAddr = process.env.RONKE_TOKEN_ADDRESS || "";
    this.rpcUrl = process.env.RONKE_RPC_URL || "";
    this.treasury = process.env.STAKE_TREASURY_ADDRESS || "";
    const signer = process.env.STAKE_SIGNER_PRIVATE_KEY || "";
    this.enabled = !!(this.tokenAddr && this.rpcUrl && this.treasury && signer);
    console.log(`[StakeService] ${this.enabled ? "ENABLED (on-chain)" : "NO-OP (off-chain accounting only)"}`);
  }

  // Įėjimo mokestis: žaidėjui prisijungus prie staked match. NO-OP kol !enabled.
  async chargeEntry(address: string, fee: number): Promise<boolean> {
    if (fee <= 0) return true;
    if (!this.enabled) { console.log(`[StakeService] (noop) charge ${fee} RONKE from ${address || "?"}`); return true; }
    // TODO (po user patvirtinimo): RONKE transferFrom(player → treasury) su pre-approve allowance,
    //   ARBA signed-claim deduct. Reikia kontrakto + signer + flow patvirtinimo. NEĮDIEGTA tyčia.
    console.log(`[StakeService] TODO on-chain charge ${fee} RONKE from ${address} (not implemented)`);
    return true;
  }

  // Match pabaigos payout: nugalėtojui (+ KotH drip earner'iams). NO-OP kol !enabled.
  async settle(payouts: Payout[]): Promise<boolean> {
    const total = payouts.reduce((s, p) => s + p.amount, 0);
    if (total <= 0) return true;
    if (!this.enabled) {
      payouts.forEach((p) => { if (p.amount > 0) console.log(`[StakeService] (noop) payout ${p.amount.toFixed(2)} RONKE → ${p.address || p.sessionId}`); });
      return true;
    }
    // TODO (po user patvirtinimo): RONKE transfer(treasury → kiekvienas address) signed relayer'iu.
    //   Reikia treasury balanso + signer. NEĮDIEGTA tyčia.
    console.log(`[StakeService] TODO on-chain settle total ${total.toFixed(2)} RONKE across ${payouts.length} payouts (not implemented)`);
    return true;
  }

  // Mirties stakes (FAZA E): mirę NFT → burn (visam) arba 3d lock. NO-OP kol !enabled.
  async settleDeaths(deaths: DeathSettle[]): Promise<boolean> {
    if (!deaths.length) return true;
    const burns = deaths.filter((d) => d.outcome === "burn");
    const locks = deaths.filter((d) => d.outcome === "lock");
    if (!this.enabled) {
      burns.forEach((d) => console.log(`[StakeService] (noop) BURN nft #${d.tokenId} (${d.utype} L${d.level}) owner ${d.owner}`));
      locks.forEach((d) => console.log(`[StakeService] (noop) LOCK nft #${d.tokenId} (${d.utype} L${d.level}) until ${new Date(d.lockUntil).toISOString()}`));
      return true;
    }
    // TODO (po user patvirtinimo): on-chain burn (PewPewBarracks burn auth / signed) + 3d lock state.
    //   ⚠️ REALŪS NFT BURN'AI — reikia kontrakto + signer + explicit patvirtinimo. NEĮDIEGTA tyčia.
    console.log(`[StakeService] TODO on-chain ${burns.length} burns + ${locks.length} locks (not implemented)`);
    return true;
  }
}
