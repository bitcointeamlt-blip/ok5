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

import { ethers } from "ethers";
import { PayoutQueue } from "../blocks/PayoutQueue";

export interface Payout { address: string; amount: number; sessionId: string; kind?: "win" | "refund"; roomId?: string; }
export interface DeathSettle { tokenId: string; owner: string; utype: string; level: number; outcome: "burn" | "lock"; lockUntil: number; }

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

export class StakeService {
  readonly enabled: boolean;
  readonly manual: boolean;   // 🧱💰 MANUAL: raktas NElaikomas serveryje → payout'ai eina į PayoutQueue, operatorius pasirašo per admin.html
  private tokenAddr: string;
  private rpcUrl: string;
  private treasury: string;
  private signerKey: string;
  private _prov: ethers.JsonRpcProvider | null = null;
  private _wallet: ethers.Wallet | null = null;
  private _token: ethers.Contract | null = null;
  private _signerChecked = false;

  constructor() {
    this.tokenAddr = process.env.RONKE_TOKEN_ADDRESS || "";
    this.rpcUrl = process.env.RONKE_RPC_URL || "";
    this.treasury = (process.env.STAKE_TREASURY_ADDRESS || "").toLowerCase();
    this.signerKey = process.env.STAKE_SIGNER_PRIVATE_KEY || "";
    // MANUAL režimas: BLOCKS_PAYOUT_MANUAL=1 + treasury adresas (raktas NEreikalingas). Payout → operatoriaus admin.html.
    this.manual = process.env.BLOCKS_PAYOUT_MANUAL === "1" && !!this.treasury;
    // Serveris „gyvas" išmokoms jei: (a) MANUAL (operatorius pasirašo), ARBA (b) turi visą auto-signer setup'ą.
    this.enabled = this.manual || !!(this.tokenAddr && this.rpcUrl && this.treasury && this.signerKey);
    console.log(`[StakeService] ${this.manual ? "MANUAL (operatorius pasirašo per admin.html — raktas NE serveryje)" : this.enabled ? "ENABLED (auto-sign su serverio raktu)" : "NO-OP (off-chain accounting only)"}`);
  }

  // Lazy ethers signer (=treasury). transfer() siunčia iš signer adreso → signer TURI būti treasury raktas.
  private _erc20(): ethers.Contract | null {
    if (!this.enabled) return null;
    if (!this._token) {
      this._prov = new ethers.JsonRpcProvider(this.rpcUrl, 2020, { staticNetwork: true });
      this._wallet = new ethers.Wallet(this.signerKey, this._prov);
      this._token = new ethers.Contract(this.tokenAddr, ERC20_ABI, this._wallet);
      if (!this._signerChecked) {
        this._signerChecked = true;
        // ⚠️ payout eina IŠ signer adreso — jis PRIVALO būti treasury (kur susirinko įėjimai). Perspėjam jei ne.
        if (this._wallet.address.toLowerCase() !== this.treasury) {
          console.error(`[StakeService] ⚠️ SIGNER ${this._wallet.address} != TREASURY ${this.treasury} — payout eina iš signer, ne treasury! Sutvarkyk env prieš go-live.`);
        }
      }
    }
    return this._token;
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

  // Match pabaigos payout / refund: laimėtojui (80% poolo) ARBA grąžinimas (refund tier). NO-OP kol !enabled.
  //   Payout eina IŠ treasury (kur payAndPlay surinko įėjimus) → laimėtojas/refund adresas. Rezultatas
  //   serveris-autoritetingas (A6 L2) → saugu. Balanso sanity: jei treasury nepadengia — ABORT (nieko nesiunčia).
  async settle(payouts: Payout[]): Promise<boolean> {
    const valid = payouts.filter((p) => p.amount > 0 && /^0x[0-9a-fA-F]{40}$/.test(p.address || ""));
    const total = valid.reduce((s, p) => s + p.amount, 0);
    if (total <= 0) return true;
    // 🧱💰 MANUAL: NEpasirašom — įrašom laukiančią išmoką, operatorius pasirašo iš treasury piniginės (admin.html).
    if (this.manual) {
      valid.forEach((p) => PayoutQueue.add({ to: p.address, amount: p.amount, kind: p.kind || "win", roomId: p.roomId || "?" }));
      return true;
    }
    if (!this.enabled) {
      valid.forEach((p) => console.log(`[StakeService] (noop) payout ${p.amount.toFixed(2)} RONKE → ${p.address || p.sessionId}`));
      return true;
    }
    const queue = (why: string) => { console.warn(`[StakeService] → QUEUING ${valid.length} payout(s) for MANUAL (admin.html): ${why}`); valid.forEach((p) => PayoutQueue.add({ to: p.address, amount: p.amount, kind: p.kind || "win", roomId: p.roomId || "?" })); };
    const token = this._erc20();
    if (!token) { queue("no signer"); return true; }
    try {
      // Sanity: pool (signer) balansas turi padengti VISUS payout'us. Jei ne → NEprarandam: nukeliam į manual eilę.
      const need = valid.reduce((s, p) => s + ethers.parseUnits(p.amount.toFixed(6), 18), 0n);
      const bal: bigint = await token.balanceOf(this._wallet!.address);
      if (bal < need) { queue(`pool balance ${ethers.formatUnits(bal, 18)} < need ${ethers.formatUnits(need, 18)} RONKE (fund pool: ${this._wallet!.address})`); return true; }
    } catch (e: any) { queue("balance check fail: " + e?.message); return true; }
    let allOk = true;
    for (const p of valid) {
      try {
        const amt = ethers.parseUnits(p.amount.toFixed(6), 18);
        const tx = await token.transfer(p.address, amt);
        await tx.wait(1);
        console.log(`[StakeService] ✅ AUTO payout ${p.amount.toFixed(2)} RONKE → ${p.address} (${p.sessionId}) tx ${tx.hash}`);
      } catch (e: any) { allOk = false; console.error(`[StakeService] ❌ auto payout FAIL → ${p.address} → queuing for manual:`, e?.message); PayoutQueue.add({ to: p.address, amount: p.amount, kind: p.kind || "win", roomId: p.roomId || "?" }); }
    }
    return allOk;
  }

  // 🔁 Išmoka LAUKIANČIAS eilės išmokas (kurios buvo nukeltos kai pool buvo tuščias). Kviečiama periodiškai —
  //   kai pool papildytas, senos „eilėje" išmokos išsimoka savaime, be operatoriaus. Tik AUTO režime.
  async flushQueue(): Promise<number> {
    if (!this.enabled || this.manual) return 0;
    const token = this._erc20();
    if (!token) return 0;
    const pend = PayoutQueue.pending();
    if (!pend.length) return 0;
    let paid = 0;
    for (const p of pend) {
      if (p.manual) continue;   // ⚠️ neverifikuoti (manual patikros) — auto-flush NEmoka; tik operatorius per admin
      if (!/^0x[0-9a-fA-F]{40}$/.test(p.to) || !(p.amount > 0)) continue;
      try {
        const amt = ethers.parseUnits(String(p.amount), 18);
        const bal: bigint = await token.balanceOf(this._wallet!.address);
        if (bal < amt) { console.warn(`[StakeService] flush: pool ${ethers.formatUnits(bal, 18)} < ${p.amount} — palieku eilėje ${p.id}`); continue; }
        const tx = await token.transfer(p.to, amt);
        await tx.wait(1);
        PayoutQueue.markPaid(p.id, tx.hash);
        console.log(`[StakeService] ✅ FLUSH queued payout ${p.amount} RONKE → ${p.to} tx ${tx.hash}`);
        paid++;
      } catch (e: any) { console.error(`[StakeService] flush fail ${p.id}:`, e?.message); }
    }
    return paid;
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
