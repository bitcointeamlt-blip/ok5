import type { Payout } from "../services/StakeService";

// 🧱💰 Pure wager escrow state-machine (BE tinklo/Colyseus). Laiko įėjimų būseną + verifikacijos/payout/refund
// sprendimus; on-chain servisai INJEKTUOJAMI (settle=StakeService.settle, verify=WagerEntry.verifyWagerEntry)
// → unit-testuojama su mock'ais (žr. test/wagerEscrow.test.ts). BlocksRoom tik deleguoja + transliuoja žinutes.
//
// Pinigų dvigubinimo apsauga: `settled` (payout/draw 1×) + per-entry `refunded` + (realiame kelyje) DB dedupe
// verify() viduje (WagerEntry insert → fee_used). EXACT tier tikrinimas gyvena verify() (WagerEntry).

export type EscrowSide = "p1" | "p2";
export type VerifyResult = { ok: boolean; reason?: string };
export type SettleFn = (payouts: Payout[]) => Promise<boolean>;
export type VerifyFn = (player: string, txHash: string, tier: number) => Promise<VerifyResult>;

interface Entry { addr: string; tx: string; verified: boolean; refunded: boolean; }
const isAddr = (a: string) => /^0x[0-9a-f]{40}$/.test(a);

export class WagerEscrow {
  private e: Record<EscrowSide, Entry> = {
    p1: { addr: "", tx: "", verified: false, refunded: false },
    p2: { addr: "", tx: "", verified: false, refunded: false },
  };
  private _settled = false;
  // 🤖 per-side PRIEDAS prie įėjimo (AI-takeover fee): žaidėjas moka tier+extra VIENU tx (EXACT verify).
  //   Extra įskaičiuojamas į verify sumą ir į PILNĄ refund'ą (mačas neįvyko); payout/draw skaičiuojasi
  //   TIK nuo tier (fee lieka treasury, kai mačas įvyko).
  private extra: Record<EscrowSide, number> = { p1: 0, p2: 0 };

  constructor(
    readonly tier: number,                 // 0 = nemokama (viskas no-op)
    private readonly settle: SettleFn,
    private readonly verify: VerifyFn,
    private readonly winnerBps = 8000,      // laimėtojas 80% poolo; treasury – likutis
    // 🛟 kviečiamas kai refund'o NEGALIM patvirtinti (RPC krito / tx dar neindeksuotas) — kad pinigai NEDINGTŲ:
    //    operatorius rankiniu būdu patikrina tx ir grąžina. Definityvūs „nemokėjo" atvejai čia NEpatenka.
    private readonly onUncertainRefund?: (side: EscrowSide, addr: string, tier: number, reason: string) => void,
  ) {}

  get active(): boolean { return this.tier > 0; }
  get settled(): boolean { return this._settled; }
  markSettled(): void { this._settled = true; }   // pažymėti apmokėta (kai payout keliauja į manual eilę, ne per settle)
  hasEntry(side: EscrowSide): boolean { return !!this.e[side].tx; }
  bothStaked(): boolean { return this.hasEntry("p1") && this.hasEntry("p2"); }
  bothVerified(): boolean { return this.e.p1.verified && this.e.p2.verified; }
  addressOf(side: EscrowSide): string { return this.e[side].addr; }
  isRefunded(side: EscrowSide): boolean { return this.e[side].refunded; }

  setEntry(side: EscrowSide, addr: string, tx: string): void {
    if (!this.active) return;
    this.e[side] = { addr: (addr || "").toLowerCase(), tx: (tx || "").toLowerCase(), verified: false, refunded: false };
  }

  // 🤖 nustato pusės priedą (AI fee). Kviesti PRIEŠ tos pusės verify (setEntry metu).
  setExtra(side: EscrowSide, amount: number): void {
    this.extra[side] = Math.max(0, Math.floor(Number(amount) || 0));
  }
  extraOf(side: EscrowSide): number { return this.extra[side]; }
  // pilna įėjimo suma (verify/refund): tier + tos pusės priedas
  entryAmount(side: EscrowSide): number { return this.tier + this.extra[side]; }

  // Mačo info dashboard'ui/žurnalui (adresai + įėjimų tx + padalinimas).
  matchInfo(): { tier: number; pot: number; prize: number; treasuryCut: number; p1: { addr: string; tx: string }; p2: { addr: string; tx: string } } {
    const { pot, prize, treasury } = this.split();
    return { tier: this.tier, pot, prize, treasuryCut: treasury, p1: { addr: this.e.p1.addr, tx: this.e.p1.tx }, p2: { addr: this.e.p2.addr, tx: this.e.p2.tx } };
  }

  // Grynas poolo padalinimas: pot = 2×tier, laimėtojas winnerBps‰, treasury pasilieka likutį.
  split(): { pot: number; prize: number; treasury: number } {
    const pot = this.tier * 2;
    const prize = Math.floor((pot * this.winnerBps) / 10000);
    return { pot, prize, treasury: pot - prize };
  }

  // Verifikuoja ABU įėjimus PAEILIUI (ne lygiagrečiai) — kad nekurtų RPC užklausų pliūpsnio (429 apsauga).
  // ♻️ IDEMPOTENTIŠKA: jau verifikuotos pusės PRALEIDŽIAMOS → saugu KARTOTI (retry per RPC blyksnį).
  //   Kritiška: verify() ant sėkmės įrašo dedupe eilutę; pakartotinis to paties tx verify grąžintų
  //   `fee_used`. Praleisdami jau `verified` puses, retry nesulaužo jau patvirtinto įėjimo.
  async verifyBoth(): Promise<boolean> {
    if (!this.e.p1.verified) { const r1 = await this.verify(this.e.p1.addr, this.e.p1.tx, this.entryAmount("p1")); this.e.p1.verified = r1.ok; }
    if (!this.e.p2.verified) { const r2 = await this.verify(this.e.p2.addr, this.e.p2.tx, this.entryAmount("p2")); this.e.p2.verified = r2.ok; }
    return this.e.p1.verified && this.e.p2.verified;
  }

  // 🤖 SOLO verifikacija (RANKED vs AI fee — moka tik p1). Idempotentiška kaip verifyBoth.
  async verifySide(side: EscrowSide): Promise<boolean> {
    const e = this.e[side];
    if (!e.verified) { const r = await this.verify(e.addr, e.tx, this.entryAmount(side)); e.verified = r.ok; }
    return e.verified;
  }

  // Laimėtojas 80% poolo. Grąžina {prize,pot} arba null (nebeaktyvu / jau settlinta / be adreso). Guard: settled.
  async settleWinner(side: EscrowSide): Promise<{ prize: number; pot: number } | null> {
    if (!this.active || this._settled) return null;
    const addr = this.e[side].addr;
    if (!isAddr(addr)) return null;
    this._settled = true;
    const { pot, prize } = this.split();
    await this.settle([{ address: addr, amount: prize, sessionId: side, kind: "win" }]);
    return { prize, pot };
  }

  // Lygiosios → grąžinam kiekvienam jo pakopą (treasury pasilieka 0). Guard: settled.
  async settleDraw(): Promise<boolean> {
    if (!this.active || this._settled) return false;
    this._settled = true;
    this.e.p1.refunded = true; this.e.p2.refunded = true;
    await this.settle([
      { address: this.e.p1.addr, amount: this.tier, sessionId: "p1", kind: "refund" },
      { address: this.e.p2.addr, amount: this.tier, sessionId: "p2", kind: "refund" },
    ]);
    return true;
  }

  // Grąžina VISIEMS jau verifikuotiems (in-memory) — be pakartotinės on-chain patikros. Grąžina refundintų skaičių.
  async refundVerified(): Promise<number> {
    if (!this.active || this._settled) return 0;   // po payout/draw – jokių refund'ų (double-pay apsauga)
    const refunds: Payout[] = [];
    (["p1", "p2"] as EscrowSide[]).forEach((s) => {
      const e = this.e[s];
      if (e.verified && !e.refunded && isAddr(e.addr)) { e.refunded = true; refunds.push({ address: e.addr, amount: this.entryAmount(s), sessionId: s, kind: "refund" }); }
    });
    if (refunds.length) await this.settle(refunds);
    return refunds.length;
  }

  // Grąžina VIENĄ pusę: jei dar neverifikuota — verify PIRMA (apsauga nuo pramanyto tx), tik tada refund.
  //   🛟 ATSPARUS RPC: jei verify NEPAVYKO dėl LAIKINO gedimo (rpc / tx_not_found) — refund NEDINGSTA:
  //      pažymim ir siunčiam į MANUAL eilę (operatorius patikrina tx). Tik DEFINITYVŪS „nemokėjo" atvejai
  //      (wrong_to/wrong_amount/tx_failed/bad_tx/disabled/db_off) atmetami be refund'o. Tai užkardo bug'ą,
  //      kai žaidėjas sumoka, mačas neįvyksta, o refund'as pakimba dėl RPC blyksnio.
  async refundEntry(side: EscrowSide): Promise<boolean> {
    if (!this.active || this._settled) return false;   // po payout/draw – jokių refund'ų (double-pay apsauga)
    const e = this.e[side];
    if (e.refunded || !e.tx || !isAddr(e.addr)) return false;
    const v: VerifyResult = e.verified ? { ok: true } : await this.verify(e.addr, e.tx, this.entryAmount(side));
    // ✅ tikras įėjimas (ok) ARBA fee_used (tx JAU įrašytas ankstesnės verify → realus mokėjimas) → auto-refund
    if (v.ok || v.reason === "fee_used") {
      e.verified = true; e.refunded = true;
      await this.settle([{ address: e.addr, amount: this.entryAmount(side), sessionId: side, kind: "refund" }]);
      return true;
    }
    // 🛟 NEAIŠKU (RPC nukrito / tx dar neindeksuotas) → į MANUAL eilę, kad pinigai NEDINGTŲ
    if (v.reason === "rpc" || v.reason === "tx_not_found") {
      e.refunded = true;   // pažymim, kad nekurtume dublio
      if (this.onUncertainRefund) this.onUncertainRefund(side, e.addr, this.entryAmount(side), v.reason || "rpc");
    }
    return false;   // definityvu (nemokėjo/blogas tx) ARBA manual jau sukurtas → ne auto-refund
  }
}
