import { Room, Client } from "@colyseus/core";
import { BlocksState, BlocksPlayer } from "../schema/BlocksState";
import { loadGameLib, GameLib } from "../blocks/loadGame";
import { StakeService } from "../services/StakeService";
import { verifyWagerEntry, wagerEnabled } from "../services/WagerEntry";
import { WagerEscrow } from "../blocks/WagerEscrow";
import { MatchLog } from "../blocks/MatchLog";
import { PayoutQueue } from "../blocks/PayoutQueue";   // neverifikuoto rezultato payout → manual eilė

/* RONKE BLOCKS — 1v1 online (server-authoritative KORIDORIUS).
 *
 * Modelis (hibridas): KLIENTAI sukа savo tetris lentas ir siunčia:
 *   - "snap" {board}  → serveris persiunčia priešui (jis mato tavo lentą)
 *   - "clear" {n}     → serveris paleidžia n TAVO unitų į koridorių
 *   - "topped"        → tu top out
 * SERVERIS autoritetingai sukа KORIDORIŲ (army.js — tas pats kodas kaip kliento), ir:
 *   - "corridor" {units} → transliuoja unitų pozicijas (klientas piešia)
 *   - "garbage" {lines}  → kai TAVO unitas atėjo iki priešo, priešui krenta linija
 *   - "gameover" {winner}
 * Koridorius serveryje = VIENA orientacija (p1='you' dešinėn, p2='foe' kairėn) → jokio
 * veidrodinio desync'o. Klientas apsuka vaizdą pagal savo pusę. */

const TICK = 1000 / 60;        // serverio sim (koridoriui pakanka 60Hz; klientas interpoliuoja)
const CORRIDOR_MS = 60;        // koridoriaus būsenos transliavimo dažnis (~16/s)
const COUNTDOWN_MS = 3000;
const PREP_MS = 15000;        // 🎓 pasiruošimo/valdymo-tutorial langas prieš startą: startas kai ABU „ready" ARBA po 15s
const CHALLENGE_MS = 30000;   // kiek host'as turi laiko atsakyti „do you want to play?" (auto-decline po to)
const STAKE_MS = 120000;      // 🧱💰 pay-on-accept: kiek abu turi laiko sumokėti statymą (wallet popup+tx) — po to abort+refund
const LINES_PER_UNIT = 1;

/* ── A6 ANTI-CHEAT (1 sluoksnis: sveiko proto ribos + rate-limit + match timeout) ──
 * Serveris NEtiki aklai kliento žinutėmis. Pilnas cheat-proof (serveris suka ir LENTAS iš įvesčių)
 * = didesnis žingsnis; čia sustabdom akivaizdžius exploitus: fake/flood clear, begalinis stall. */
const MAX_LINES_PER_CLEAR = 4;        // tetris: daugiausia 4 linijos vienu kartu (quad)
const CLEAR_WINDOW_MS = 2000;         // rate-limit langas
const MAX_CLEARS_PER_WINDOW = 6;      // >6 valymų per 2s = neįmanoma žmogui → ignoruojam
const SNAP_MIN_INTERVAL_MS = 40;      // max ~25 snap/s (flood apsauga)
const MATCH_MAX_MS = 6 * 60 * 1000;   // 6 min riba → jei niekas netopina (stall), sprendžiam pagal linijas
// 🛡️ ANTI-CHEAT (client-auth): validuojam kliento snapshot'us. Žemas false-positive → ribos KONSERVATYVIOS.
const MAX_HUMAN_PPS = 12;             // >12 figūrų/s fiziškai neįmanoma žmogui (botas/spartintuvas)
const CHEAT_HITS = 3;                 // tiek pažeidimų → laikom sukčiumi → laimėjimas į MANUAL review (ne auto-pay)

/* ── 🧱💰 WAGER (statymas) ─────────────────────────────────────────────────────
 * Abu žaidėjai PATYS pasirašo `payAndPlay(tier,…)` → RONKE į treasury (žr. [[WagerEntry.ts]]).
 * Serveris PRIEŠ startą on-chain verifikuoja ABU įėjimus (EXACT tier → jokių 69-vs-800 rungtynių),
 * o pabaigoje išmoka laimėtojui 80% poolo (2×tier) per [[StakeService.ts]]; treasury pasilieka 20%
 * (jis jau treasury'je). Refund'ai: host declined / nemačas (dispose) / verify fail / lygiosios.
 * VISKAS gated ant serverio env raktų (wagerEnabled() && StakeService.enabled) — be jų = NEMOKAMA. */
const STAKE = new StakeService();     // dalinamasi tarp kambarių (ethers signer lazy-init)
const WINNER_BPS = 8000;              // laimėtojas 80% poolo; treasury pasilieka 20%
// 🔁 AUTO režime periodiškai išmokam laukiančias eilės išmokas (kai pool papildytas — senos „eilėje" prizai išsimoka savaime).
// 🛟 Pirma RECONCILE iš Supabase — po cloud redeploy vietinis blocks_payouts.json tuščias, tad atstatom
//    laukiančias išmokas iš durablaus Supabase dublio, kad NĖ VIENAS prizas nedingtų per deploy'ą.
if (STAKE.enabled && !STAKE.manual) {
  setTimeout(() => { void PayoutQueue.reconcile().then(() => STAKE.flushQueue()); }, 8000);   // reconcile → tada flush
  setInterval(() => { void STAKE.flushQueue(); }, 3 * 60 * 1000);                              // ir kas 3 min
} else if (STAKE.manual) {
  setTimeout(() => { void PayoutQueue.reconcile(); }, 8000);   // manual režimas: bent atstatom eilę operatoriui
}

type Side = "p1" | "p2";
const SIDE_TO_ARMY: Record<Side, "you" | "foe"> = { p1: "you", p2: "foe" };

export class BlocksRoom extends Room<BlocksState> {
  maxClients = 2;

  private lib!: GameLib;
  private army: any;
  private seed = 0;
  private deckRnd: (() => number) | null = null;
  private deckAt: Record<"you" | "foe", number> = { you: 0, foe: 0 };
  private corridorAcc = 0;
  private fxBuf: any[] = [];   // mūšio efektų įvykiai, kaupiami tarp corridor transliacijų
  private hostSession = "";    // p1 (kambario kūrėjas) — jam siunčiam „challenge" kai kažkas prisijungia
  private challengeTimer: any = null;   // jei host'as neatsako per CHALLENGE_MS — auto-decline
  // A6 anti-cheat sekimas:
  private matchMs = 0;                              // sukauptas žaidimo laikas (playing fazėj)
  private clearLog: Record<string, number[]> = {}; // sessionId → clear'ų laikai (rate-limit)
  private lastSnapMs: Record<string, number> = {}; // sessionId → paskutinio snap laikas (flood)
  private _cheat: Record<string, { hits: number; reasons: string[] }> = {};   // 🛡️ sessionId → anti-cheat pažeidimai
  private _lastPieces: Record<string, number> = {};                            // 🛡️ monotonic figūrų patikra
  // A6 L2: SERVER-AUTHORITATIVE lentos (serveris = vienintelis lentų šeimininkas; cheat-proof).
  private serverAuth = false;                      // options.serverAuth → serveris sukа lentas iš įvesčių
  private onchainMatchId = "";                      // wager: on-chain RonkeBlocksWager matchId (payout'ui)
  private eng: { you: any; foe: any } | null = null;
  private engAcc = 0;                              // 120Hz žingsnio akumuliatorius
  private boardAcc = 0;                            // lentos būsenos transliavimo dažnis
  private boardFx: any[] = [];                      // A6 L2: linijų valymo efektai klientui (juice)
  private sideOf: Record<string, Side> = {};       // sessionId → p1/p2
  // 🧱💰 WAGER escrow — visa pinigų būsena/logika [[WagerEscrow]] (gated; tier 0 = nemokama). On-chain
  //   servisai injektuoti (settle=StakeService, verify=WagerEntry) → unit-testuota (test/wagerEscrow.test.ts).
  private escrow: WagerEscrow = new WagerEscrow(0, (p) => STAKE.settle(p), (a, t, ti) => verifyWagerEntry(a, t, ti), WINNER_BPS);
  private verifying = false;                         // verifikacija vyksta (anti double)
  private stakeTimer: any = null;                    // pay-on-accept: statymo langas (STAKE_MS) → timeout=abort
  private prepTimer: any = null;                     // 🎓 pasiruošimo langas (PREP_MS) → timeout=startas
  private _prepReady: Record<string, boolean> = {};  // 🎓 sessionId → paspaudė „ready" (startas kai abu)
  // 🥇 OPTIMISTINIS STARTAS: žaidimas startuoja IŠKART kai abu sumoka (klientas jau patvirtino kvitą),
  //   verify vyksta FONE per visą mačo laiką, o PAYOUT duodamas TIK jei verify praėjo (kitaip → manual eilė).
  private _winnerSide: Side | "" | null = null;      // null = mačas dar nesibaigė
  private _verifyStarted = false;
  private _verifyDone = false;
  private _verifyOk = false;
  private _disposed = false;                          // kambarys uždarytas → stabdom fono verify ciklą

  onCreate(options?: any) {
    /* PRIVATUS kambarys (draugo kvietimas per kodą/nuorodą): išimamas iš matchmaking, kad
     * QUICK MATCH (joinOrCreate) į jį atsitiktinai neįmestų pašalinio. Prisijungiama TIK per
     * joinById(roomId). Public kambariai (quick match) lieka matomi. */
    if (options && options.mode === "private") this.setPrivate();
    /* METADATA — matoma LobbyRoom sąraše (host vardas + režimas + STATYMO PAKOPA). Pakopa (RONKE suma)
     * leidžia žaidėjui lobyje matyti, už kokią sumą kambarys atviras, ir pasirinkti. Leistinos: 69/200/800. */
    const ALLOWED_TIERS = [69, 200, 800];
    let tier = (options && Number(options.tier)) || 69;
    if (ALLOWED_TIERS.indexOf(tier) < 0) tier = 69;
    this.serverAuth = !!(options && options.serverAuth);   // A6 L2: serveris sukа lentas (gated)
    // 🧱💰 WAGER host įėjimas: wager „gyvas" TIK jei serveris gali IR verifikuoti (WagerEntry) IR išmokėti
    //   (StakeService). Jei entry tx pateiktas, bet wager NEGYVAS → rungtynės NEMOKAMOS (jokio charge/payout).
    // 🧱💰 PAY-ON-ACCEPT: kambarys sukuriamas su wager KETINIMU (be mokėjimo). Niekas nemoka, kol ABU nesutinka
    //   ir serveris nepaprašo „stake_now" (žr. _accept). Taip nė vienas nesumoka į nesukonfigūruotą serverį.
    const wagerLive = wagerEnabled() && STAKE.enabled;
    const wagerIntent = !!(options && options.wager);
    this.escrow = new WagerEscrow(
      (wagerIntent && wagerLive) ? tier : 0,
      (p) => STAKE.settle(p.map((x) => ({ ...x, roomId: this.roomId }))),
      (a, t, ti) => verifyWagerEntry(a, t, ti),
      WINNER_BPS,
      // 🛟 refund'o NEGALIM patvirtinti (RPC krito) → į MANUAL eilę, kad žaidėjo pinigai NEDINGTŲ
      (side, addr, tierR, reason) => {
        PayoutQueue.add({ to: addr, amount: tierR, kind: "refund", roomId: this.roomId, manual: true, note: `unverified refund (${reason}) — patikrink įėjimo tx on-chain prieš mokant` });
        console.warn(`[BLOCKS WAGER] 🛟 refund NEAIŠKUS (${reason}, ${side}) → ${addr} ${tierR} RONKE į MANUAL eilę (RPC krito; operatorius patikrina tx :6610)`);
      },
    );
    if (wagerIntent && !wagerLive) console.warn(`[BLOCKS WAGER] wager kambarys prašytas, bet serveris NEGYVAS (WagerEntry=${wagerEnabled()} StakeService=${STAKE.enabled}) → NEMOKAMOS rungtynės. Sukonfigūruok env.`);
    this.onchainMatchId = "";
    this.setMetadata({ host: (options && options.name) || "Player", mode: (options && options.mode) || "public", tier, wager: this.escrow.active, wagerLive });

    this.setState(new BlocksState());
    this.lib = loadGameLib();
    this.seed = (Math.floor(Math.random() * 0xffffffff)) >>> 0;
    this.state.seed = this.seed;

    this.army = new this.lib.Army();
    this.army.reset(this.seed);
    // deterministinis deko parinkimas (kaip klientas)
    this.deckRnd = this.lib.RNG.mulberry32((this.seed ^ 0x1b873593) >>> 0);
    const dl = this._deckLen();
    this.deckAt = {
      you: Math.floor(this.deckRnd!() * dl),
      foe: Math.floor(this.deckRnd!() * dl),
    };

    this.onMessage("ready", (c) => this._setReady(c, true));
    this.onMessage("accept", (c) => this._accept(c));    // host'as sutiko žaisti su prisijungusiu
    this.onMessage("decline", (c) => this._decline(c));  // host'as atmetė → svečias išmetamas, host lieka laukti
    this.onMessage("stake", (c, m: any) => this._onStake(c, m));        // 🧱💰 pay-on-accept: žaidėjo įėjimo tx
    this.onMessage("stake_cancel", (c) => this._abortWager("stake_cancelled"));  // žaidėjas atsisakė mokėti → abort+refund kitam
    this.onMessage("prep_ready", (c) => this._onPrepReady(c));   // 🎓 pasiruošimo lange „ready" → startas kai abu
    this.onMessage("clear", (c, m: any) => this._onClear(c, m));
    this.onMessage("snap", (c, m: any) => this._relaySnap(c, m));
    this.onMessage("topped", (c) => this._onTopped(c));
    this.onMessage("input", (c, m: any) => this._onInput(c, m));   // A6 L2: kliento įvestis → serverio variklis
    // 📡 LIVE PING: klientas siunčia savo timestamp'ą, serveris grąžina jį + savo → klientas skaičiuoja RTT.
    this.onMessage("ping", (c, m: any) => { try { c.send("pong", { t: (m && m.t) || 0 }); } catch (_) {} });

    this.setSimulationInterval((dt) => this._tick(dt), TICK);
  }

  onJoin(client: Client, options?: any) {
    const taken = new Set<string>();
    this.state.players.forEach((p) => taken.add(p.side));
    const side: Side = taken.has("p1") ? "p2" : "p1";
    const p = new BlocksPlayer();
    p.side = side;
    p.name = (options && options.name) || "Player";
    this.state.players.set(client.sessionId, p);
    this.sideOf[client.sessionId] = side;
    if (side === "p1") this.hostSession = client.sessionId;   // pirmasis = HOST (jam eina challenge)
    // 🧱💰 pay-on-accept: NEIMAM įėjimo prisijungiant — abu moka tik po host'o „accept" (žr. _accept/_onStake).
    client.send("hello", { side, seed: this.seed });
  }

  async onLeave(client: Client, consented: boolean) {
    // Iškritus/išėjus DAR NEprasidėjus rungtynėms (lobby/challenge/staking) — jokio „pralaimėjimo".
    if (this.state.phase === "lobby" || this.state.phase === "challenge" || this.state.phase === "staking" || this.state.phase === "prep") {
      const p = this.state.players.get(client.sessionId);
      if (this.state.phase === "challenge" && p && p.side === "p2") this._cancelChallenge();  // svečias dingo (niekas nemokėjo)
      // 🧱💰 staking/prep metu kažkas išėjo (mačas dar neprasidėjo) → abort + grąžinam abiem sumokėjusiems
      else if (this.state.phase === "staking" || this.state.phase === "prep") void this._abortWager("opponent_left");
      try { this.state.players.delete(client.sessionId); } catch {}
      if (client.sessionId === this.hostSession) this.hostSession = "";
      return;
    }
    // Rungtynėse: sąmoningas išėjimas → iškart pralaimėjimas; kitaip 8s reconnect.
    if (consented) { this._winByLeave(client); return; }
    try { await this.allowReconnection(client, 8); }
    catch { this._winByLeave(client); }
  }

  // ── žinutės ────────────────────────────────────────────────────────────────
  private _setReady(client: Client, v: boolean) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.ready = v;
    // Abu prisijungę & pasiruošę → NEbe auto-start, o CHALLENGE host'ui („do you want to play?").
    if (this.state.phase === "lobby" && this.state.players.size === 2 && this._allReady()) {
      this._openChallenge();
    }
  }

  // Prisijungė svečias → klausiam HOST'o, ar nori žaisti (jis gali būti „fone", žaidžia pilyje).
  private _openChallenge() {
    this.state.phase = "challenge";
    let hostName = "Player", guestName = "Player";
    this.state.players.forEach((pl, sid) => {
      if (pl.side === "p1") hostName = pl.name; else guestName = pl.name;
    });
    this.clients.forEach((c) => {
      if (c.sessionId === this.hostSession) c.send("challenge", { opponent: guestName });
      else c.send("await", { host: hostName });   // svečias laukia host'o sprendimo
    });
    if (this.challengeTimer) clearTimeout(this.challengeTimer);
    this.challengeTimer = setTimeout(() => this._cancelChallenge(true), CHALLENGE_MS);
  }

  private _accept(client: Client) {
    if (this.state.phase !== "challenge" || client.sessionId !== this.hostSession) return;
    if (this.challengeTimer) { clearTimeout(this.challengeTimer); this.challengeTimer = null; }
    // 🧱💰 PAY-ON-ACCEPT: host sutiko → dabar ABU prašomi sumokėti statymą. Nė vienas nemokėjo iki šiol,
    //   tad decline/nemačas nekainuoja. „stake_now" siunčiamas TIK jei serveris wager-live (escrow.active).
    if (this.escrow.active) {
      this.state.phase = "staking";
      this.clients.forEach((c) => c.send("stake_now", { tier: this.escrow.tier }));
      if (this.stakeTimer) clearTimeout(this.stakeTimer);
      this.stakeTimer = setTimeout(() => { void this._abortWager("stake_timeout"); }, STAKE_MS);
      return;
    }
    this._beginPrep();   // 🎓 nemokamas: iškart į pasiruošimo/tutorial langą
  }

  // 🧱💰 pay-on-accept + OPTIMISTINIS STARTAS: žaidėjo įėjimo tx (po „stake_now"). Kai ABU sumokėjo →
  //   žaidimas startuoja IŠKART (klientas jau patvirtino tx kvitą), o verify vyksta FONE. Payout gated.
  private _onStake(client: Client, m: any) {
    if (this.state.phase !== "staking" || !this.escrow.active) return;
    const side = this.sideOf[client.sessionId]; if (!side) return;
    const tx = String((m && (m.tx || m.entryTx)) || "");
    const addr = String((m && m.addr) || "");
    if (!tx) return;
    this.escrow.setEntry(side, addr, tx);
    if (!this.escrow.bothStaked()) return;   // laukiam kito žaidėjo mokėjimo
    if (this.stakeTimer) { clearTimeout(this.stakeTimer); this.stakeTimer = null; }
    this._beginPrep();                    // 🎓 pasiruošimo/tutorial langas (verify vyksta jo metu fone)
    void this._bgVerify();               // verify fone (retry/fallback per visą mačo laiką)
  }

  // Fono verifikacija — nustato ar abu realiai sumokėjo (EXACT tier). Rezultatas lemia payout (ne startą).
  // ♻️ PAKARTOTINIS per visą mačą: drpc/RPC gali laikinai kristi kaip tik mačo pradžioj. Kadangi mačas
  //    trunka MINUTES, kartojam verify (idempotentiška — verifyBoth praleidžia jau patvirtintus) tol, kol
  //    ABU patvirtinti ARBA baigiasi bandymai/kambarys. Kai patvirtinta — IŠKART settle (jei mačas baigtas).
  //    Anksčiau buvo VIENAS bandymas → RPC blyksnis pradžioj amžinai užrakindavo prizą į manual eilę.
  private async _bgVerify() {
    if (this._verifyStarted) return; this._verifyStarted = true;
    const MAX_ATTEMPTS = 15, GAP_MS = 18000;    // ~15 × 18s ≈ iki 4.5 min (ilgiau nei tipinis mačas)
    for (let i = 0; i < MAX_ATTEMPTS && !this._disposed; i++) {
      let ok = false;
      try { ok = await this.escrow.verifyBoth(); } catch (_) { /* RPC glitch → bandom vėl */ }
      if (ok) { this._verifyOk = true; break; }
      if (this._disposed) break;
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
    this._verifyOk = this.escrow.bothVerified();
    this._verifyDone = true;
    if (!this._verifyOk) console.warn(`[BLOCKS WAGER] verify NEpraėjo po ${MAX_ATTEMPTS} bandymų (fake tx arba ilgas RPC gedimas) → manual eilė`);
    this._settleIfReady();               // jei mačas jau baigėsi — dabar sprendžiam payout
  }

  // 🎓 PASIRUOŠIMO LANGAS — prieš startą rodom valdymo tutorial (klientas). Startuojam kai ABU paspaudžia
  //   „ready" ARBA po PREP_MS. Wager: on-chain verify vyksta kaip tik šiuo metu (fone) → daugiau laiko.
  private _beginPrep() {
    if (this.state.phase === "prep" || this.state.phase === "countdown" || this.state.phase === "playing") return;
    this.state.phase = "prep";
    this._prepReady = {};
    this.broadcast("prep", { ms: PREP_MS });
    if (this.prepTimer) clearTimeout(this.prepTimer);
    this.prepTimer = setTimeout(() => { this.prepTimer = null; this._beginCountdown(); }, PREP_MS);
  }

  private _onPrepReady(client: Client) {
    if (this.state.phase !== "prep") return;
    this._prepReady[client.sessionId] = true;
    let ready = 0;
    this.state.players.forEach((_p, sid) => { if (this._prepReady[sid]) ready++; });
    this.broadcast("prep_state", { ready, total: this.state.players.size });
    if (ready >= 2 && this.state.players.size >= 2) {
      if (this.prepTimer) { clearTimeout(this.prepTimer); this.prepTimer = null; }
      this._beginCountdown();   // abu pasiruošę → startas nelaukiant 15s
    }
  }

  // Startas: countdown + (serverAuth) autoritetingos lentos. Kviečiama po pasiruošimo (abu ready / timeout).
  private _beginCountdown() {
    if (this.prepTimer) { clearTimeout(this.prepTimer); this.prepTimer = null; }
    this.state.phase = "countdown";
    this.state.countdown = COUNTDOWN_MS;
    // A6: šviežias anti-cheat sekimas kiekvienoms rungtynėms
    this.matchMs = 0; this.clearLog = {}; this.lastSnapMs = {}; this._cheat = {}; this._lastPieces = {};
    // A6 L2: sukuriam autoritetingas lentas (serveris sukа abu boardus iš įvesčių)
    if (this.serverAuth) {
      const E = this.lib.Engine;
      this.eng = {
        you: new E({ side: "you", name: "p1", seed: this.seed }),
        foe: new E({ side: "foe", name: "p2", seed: this.seed }),
      };
      this.eng.you.reset(this.seed); this.eng.foe.reset(this.seed);
      this.engAcc = 0; this.boardAcc = 0; this.boardFx = [];
    }
    this.clients.forEach((c) => {
      const p = this.state.players.get(c.sessionId);
      c.send("start", { side: p ? p.side : "p1", seed: this.seed, countdown: COUNTDOWN_MS, serverAuth: this.serverAuth });
    });
  }

  private _decline(client: Client) {
    if (this.state.phase !== "challenge" || client.sessionId !== this.hostSession) return;
    this._cancelChallenge();
  }

  // Atmesta / timeout / svečias dingo → svečiui „declined", HOST lieka laukti (kambarys vėl matomas sąraše).
  //   🧱💰 pay-on-accept: iki „accept" niekas nemokėjo → jokio refund'o čia nereikia.
  private _cancelChallenge(timeout = false) {
    if (this.challengeTimer) { clearTimeout(this.challengeTimer); this.challengeTimer = null; }
    this.clients.forEach((c) => {
      if (c.sessionId !== this.hostSession) c.send("declined", { timeout });
    });
    this.state.phase = "lobby";
  }

  private _onClear(client: Client, m: any) {
    if (this.serverAuth) return;   // A6 L2: clears sprendžia serverio variklis, ne kliento reportas
    if (this.state.phase !== "playing") return;
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    let n = (m && (m.lines != null ? m.lines : m.n)) | 0;
    // A6: viena valymo žinutė NEGALI viršyti 4 linijų (tetris riba) — kirpk (anti fake-spawn).
    if (n < 1) return;
    if (n > MAX_LINES_PER_CLEAR) n = MAX_LINES_PER_CLEAR;
    // A6 rate-limit: max MAX_CLEARS_PER_WINDOW valymų per CLEAR_WINDOW_MS (flood/bot apsauga).
    const log = this.clearLog[client.sessionId] || (this.clearLog[client.sessionId] = []);
    const cutoff = this.matchMs - CLEAR_WINDOW_MS;
    while (log.length && log[0] < cutoff) log.shift();
    if (log.length >= MAX_CLEARS_PER_WINDOW) { this._flag(client.sessionId, "clear_rate"); return; }   // per greitai → ignoruojam + flag
    log.push(this.matchMs);

    const armySide = SIDE_TO_ARMY[p.side as Side];
    for (let i = 0; i < n; i++) {
      this.army.request(armySide, this._nextDeckType(armySide));
    }
    p.lines += n;
  }

  private _relaySnap(client: Client, m: any) {
    // A6: snap flood apsauga — max ~25/s.
    const last = this.lastSnapMs[client.sessionId];
    if (last != null && this.matchMs - last < SNAP_MIN_INTERVAL_MS) return;
    this.lastSnapMs[client.sessionId] = this.matchMs;
    this._auditSnap(client.sessionId, m);   // 🛡️ anti-cheat validacija (client-auth)
    // persiunčiam TAVO lentos snapshot'ą priešui kaip STATE{foe} (tas pats vardas kaip mock).
    this.broadcast("state", { foe: m }, { except: client });
  }

  // 🛡️ ANTI-CHEAT (client-auth, 08-05): serveris validuoja kliento snapshot'us (be per-frame naštos). Signalai:
  //   superhuman PPS, figūrų mažėjimas (fabrikacija), clear-spam. ≥CHEAT_HITS pažeidimų → laimėjimas į MANUAL
  //   review (ne auto-pay) — sąžiningas žaidėjas apsaugotas (operatorius patikrina, false-positive nesumoka cheat'eriui).
  //   Ribos KONSERVATYVIOS → mažas false-positive. Stipresnis lygis (pilnas įvesčių replay) — ateity.
  private _flag(sid: string, reason: string) {
    const f = this._cheat[sid] || (this._cheat[sid] = { hits: 0, reasons: [] });
    f.hits++;
    if (!f.reasons.includes(reason)) f.reasons.push(reason);
    console.warn(`[BLOCKS ANTI-CHEAT] ${sid.slice(0, 8)}… flag=${reason} hits=${f.hits} (${f.reasons.join(",")})`);
  }
  private _isCheater(side: Side | ""): boolean {
    let bad = false;
    this.state.players.forEach((p, sid) => { if (side && p.side === side && (this._cheat[sid]?.hits || 0) >= CHEAT_HITS) bad = true; });
    return bad;
  }
  private _cheatReasons(side: Side | ""): string {
    let r = "";
    this.state.players.forEach((p, sid) => { if (side && p.side === side) r = (this._cheat[sid]?.reasons || []).join(","); });
    return r;
  }
  private _auditSnap(sid: string, m: any) {
    try {
      if (!m || !m.stats || this.matchMs < 4000) return;   // pradžioj per mažai duomenų
      const pieces = m.stats.pieces | 0, lines = m.stats.lines | 0;
      // (1) MONOTONIC: figūrų skaičius neturi mažėti — jei mažėja, snapshot fabrikuotas / rollback
      const prev = this._lastPieces[sid] || 0;
      if (pieces < prev - 1) this._flag(sid, "pieces_decrease");
      if (pieces > prev) this._lastPieces[sid] = pieces;
      // (2) PPS: figūros/s nuo starto — fiziškai neįmanoma > MAX_HUMAN_PPS (botas/spartintuvas)
      const secs = this.matchMs / 1000;
      if (pieces > 30 && secs > 3) {
        const pps = pieces / secs;
        if (pps > MAX_HUMAN_PPS) this._flag(sid, `pps_${pps.toFixed(1)}`);
      }
      // (3) linijos vs figūros: net su garbage, KONSERVATYVI viršutinė riba (didelė marža → mažas false-positive)
      if (lines > pieces + 60) this._flag(sid, "lines_impossible");
    } catch (_) {}
  }

  private _onTopped(client: Client) {
    if (this.serverAuth) return;   // A6 L2: topout sprendžia serverio variklis
    const p = this.state.players.get(client.sessionId);
    if (!p || this.state.phase === "over") return;
    p.topped = true;
    // priešas laimi
    let winner: Side | "" = "";
    this.state.players.forEach((pl) => { if (pl.side !== p.side) winner = pl.side as Side; });
    this._end(winner);
  }

  // ── simuliacija ──────────────────────────────────────────────────────────────
  private _tick(dt: number) {
    if (this.state.phase === "countdown") {
      this.state.countdown -= dt;
      if (this.state.countdown <= 0) {
        this.state.phase = "playing"; this.state.countdown = 0;
        if (this.serverAuth && this.eng) { this.eng.you.start(); this.eng.foe.start(); }   // A6 L2: paleidžiam lentas
      }
      return;
    }
    if (this.state.phase !== "playing") return;

    // A6: match timeout — jei niekas netopina per limitą (stall/never-lose exploitas), sprendžiam pagal linijas.
    this.matchMs += dt;
    if (this.matchMs >= MATCH_MAX_MS) { this._endByTime(); return; }

    // A6 L2: SERVER-AUTHORITATIVE lentos — žingsniuojam variklius iš įvesčių, clears→unitai, topout→gameover.
    if (this.serverAuth && this.eng) this._stepEngines(dt);

    this.army.update(dt);
    const evs = this.army.drainEvents();
    for (const e of evs) {
      if (e.t === "arrive") {
        // e.target = kuriai pusei krenta linija ('you'→p1, 'foe'→p2)
        if (this.serverAuth && this.eng) {
          // serverAuth: garbage krenta ant SERVERIO lentos (autoritetinga), ne siunčiam klientui
          const teng = e.target === "you" ? this.eng.you : this.eng.foe;
          if (teng && teng.state === "playing") teng.addGarbageNow(LINES_PER_UNIT);
        } else {
          const targetSide: Side = e.target === "you" ? "p1" : "p2";
          this._sendGarbage(targetSide, LINES_PER_UNIT);
        }
      } else if (e.t === "hit" || e.t === "shoot" || e.t === "impact" ||
                 e.t === "block" || e.t === "miss" || e.t === "die") {
        // mūšio EFEKTAS klientui (kirtis/šūvis/sprogimas/blokas/prašovė/mirtis) — kaupiam iki transliacijos
        this.fxBuf.push({
          t: e.t,
          x: Math.round((e.x != null ? e.x : 0) * 1000) / 1000,
          lane: e.lane != null ? e.lane : (e.unit ? e.unit.lane : 0),
          crit: !!e.crit, ranged: !!e.ranged,
          type: e.type,
          killerSide: e.killer ? e.killer.side : undefined,
        });
      }
    }

    // koridoriaus būsena + mūšio efektai klientams (~16/s)
    this.corridorAcc += dt;
    if (this.corridorAcc >= CORRIDOR_MS) {
      this.corridorAcc = 0;
      this.broadcast("corridor", {
        t: Math.round(this.army.time),
        units: this._corridorUnits(),
        shots: this._corridorShots(),
        events: this.fxBuf,
      });
      this.fxBuf = [];
    }

    // A6 L2: autoritetingų LENTŲ būsena klientams (~30/s) — klientas piešia iš serverio, ne lokaliai.
    // 33ms (vietoj 50) = sklandesnis, mažiau jaučiamas lagas; papildomas srautas nedidelis (2 mažos lentos).
    if (this.serverAuth && this.eng) {
      this.boardAcc += dt;
      if (this.boardAcc >= 33) {
        this.boardAcc = 0;
        this.broadcast("boards", { you: this._serializeBoard(this.eng.you), foe: this._serializeBoard(this.eng.foe), fx: this.boardFx });
        this.boardFx = [];
      }
    }
  }

  // A6 L2: variklių žingsnis (120Hz) iš įvesčių → autoritetingi clears (unitai) + topout (gameover).
  private _stepEngines(dt: number) {
    if (!this.eng) return;
    const STEP = 1000 / 120;
    this.engAcc += dt;
    let guard = 0;
    while (this.engAcc >= STEP && guard < 40) { this.eng.you.update(STEP); this.eng.foe.update(STEP); this.engAcc -= STEP; guard++; }
    if (guard >= 40) this.engAcc = 0;
    for (const key of ["you", "foe"] as const) {
      const en = this.eng[key];
      const evs = en.drainEvents();
      for (const e of evs) {
        if (e.t === "clear") {
          const n = Math.max(0, Math.min(4, e.n | 0));
          for (let i = 0; i < n; i++) this.army.request(key, this._nextDeckType(key));
          const pl = this._playerBySide(key === "you" ? "p1" : "p2"); if (pl) pl.lines += n;
          this.boardFx.push({ side: key, n, rows: e.rows || [], colors: e.colors || [] });   // juice klientui
        } else if (e.t === "topout") {
          const loser: Side = key === "you" ? "p1" : "p2";
          this._end(loser === "p1" ? "p2" : "p1");
          return;
        }
      }
    }
  }

  private _playerBySide(side: Side): BlocksPlayer | undefined {
    let found: BlocksPlayer | undefined;
    this.state.players.forEach((pl) => { if (pl.side === side) found = pl; });
    return found;
  }

  // Lentos serializacija klientui (grid + figūra + eilė + hold + stats + incoming). Kaip kliento _youSnapshot.
  private _serializeBoard(en: any) {
    return {
      grid: en.board.grid.map((r: any[]) => r.slice()),
      cur: en.cur ? { type: en.cur.type, rot: en.cur.rot, x: en.cur.x, y: en.cur.y } : null,
      ghostY: en.cur ? en.ghostY() : 0,
      nextQueue: en.nextQueue.slice(0, 5),
      hold: en.hold, holdUsed: !!en.holdUsed,
      state: en.state, level: en.level, combo: en.combo, time: Math.round(en.time),
      incoming: en.garbage.entries.map((e: any) => ({ lines: e.lines, readyAt: e.readyAt })),
      stats: { lines: en.stats.lines, sent: en.stats.sent, cancelled: en.stats.cancelled, pieces: en.stats.pieces },
    };
  }

  // A6 L2: kliento įvestis → serverio variklis (tik serverAuth). down=true → press, false → release.
  private _onInput(client: Client, m: any) {
    if (!this.serverAuth || !this.eng || this.state.phase !== "playing") return;
    const side = this.sideOf[client.sessionId]; if (!side) return;
    const en = side === "p1" ? this.eng.you : this.eng.foe;
    if (!en || en.state !== "playing") return;
    const a = String(m && m.a || "").slice(0, 12);
    if (!a) return;
    if (m && m.down) en.press(a); else en.release(a);
  }

  private _corridorUnits() {
    const out: any[] = [];
    for (const u of this.army.units) {
      out.push({
        id: u.id, side: u.side, type: u.type, lane: u.lane,
        x: Math.round(u.x * 1000) / 1000, hp: u.hp, maxHp: u.maxHp,
        state: u.state, holding: !!u.holding, dir: u.dir,
        // mūšio animacijos laukai — kad klientas rodytų atakos POZAS/mostus + skydą (F12 pozų mašina)
        swingAt: Math.round(u.swingAt), swingT: Math.round(u.swingT),
        guardAt: Math.round(u.guardAt), hitDelay: u.hitDelay,
      });
    }
    return out;
  }

  // SVIEDINIAI (strėlės/harpūnai/burtai) — kad tolimojo mūšio unitų atakos matytųsi kliente.
  private _corridorShots() {
    const out: any[] = [];
    const shots = (this.army as any).shots || [];
    for (const s of shots) {
      out.push({
        side: s.side, lane: s.lane, type: s.type, kind: s.kind,
        x0: Math.round(s.x0 * 1000) / 1000, x1: Math.round(s.x1 * 1000) / 1000,
        x: Math.round(s.x * 1000) / 1000, dir: s.dir,
        t: Math.round(s.t), dur: s.dur,
      });
    }
    return out;
  }

  private _sendGarbage(targetSide: Side, lines: number) {
    this.clients.forEach((c) => {
      const p = this.state.players.get(c.sessionId);
      if (p && p.side === targetSide) c.send("garbage", { lines });
    });
  }

  // ── pagalbinės ──────────────────────────────────────────────────────────────
  private _deckLen(): number {
    try { const d = this.lib.Units && this.lib.Units.deck(0); return (d && d.length) || 7; } catch { return 7; }
  }
  private _nextDeckType(side: "you" | "foe"): string {
    const deck = (this.lib.Units && this.lib.Units.deck(0)) || null;
    if (!deck || !deck.length) return "skull";
    const type = deck[this.deckAt[side] % deck.length];
    this.deckAt[side] += (this.deckRnd!() < 0.35 ? 2 : 1);
    return type;
  }
  private _allReady(): boolean {
    let all = true;
    this.state.players.forEach((p) => { if (!p.ready) all = false; });
    return all;
  }
  private _winByLeave(client: Client) {
    if (this.state.phase === "over") return;
    const gone = this.state.players.get(client.sessionId);
    let winner: Side | "" = "";
    this.state.players.forEach((p) => { if (!gone || p.side !== gone.side) winner = p.side as Side; });
    try { this.state.players.delete(client.sessionId); } catch {}
    this._end(winner);
  }
  private _end(winner: Side | "") {
    if (this.state.phase === "over") return;
    this.state.phase = "over";
    this.state.winner = winner;
    this.broadcast("gameover", { winner });
    // 🥇 OPTIMISTINIS: mačas baigėsi — payout sprendžiam kai IR verify baigtas (žr. _settleIfReady).
    if (this.escrow.active) { this._winnerSide = winner; this._settleIfReady(); }
    else this._logMatch(winner);   // nemokamas mačas — tik žurnalas (jokio payout)
  }

  // Payout sprendimas — kviečiamas ir po _end, ir po fono verify (kuris paskutinis nugali). Reikia ABIEJŲ:
  //   mačas baigtas (_winnerSide) IR verify baigtas (_verifyDone). Payout gated ant _verifyOk.
  private _settleIfReady() {
    if (!this.escrow.active || this.escrow.settled) return;
    if (this._winnerSide === null || !this._verifyDone) return;   // laukiam kol IR mačas, IR verify baigti
    const w = this._winnerSide;
    // 🛡️ BAUSMĖ (#5): jei laimėtojas pažymėtas kaip sukčius → NEauto-mokėti, į manual eilę operatoriui.
    //    Sąžiningo žaidėjo apsauga: neatmetam automatiškai (galimas false-positive), tik sulaikom peržiūrai.
    if (w && this._isCheater(w as Side)) {
      const reasons = this._cheatReasons(w as Side);
      console.warn(`[BLOCKS ANTI-CHEAT] ⛔ winner=${w} PAŽYMĖTAS sukčiumi (${reasons}) → payout SULAIKYTAS, manual eilė`);
      void this._queueUnverified(w as Side, `anti-cheat: ${reasons}`);
      this._logMatch(w);
      return;
    }
    if (this._verifyOk) {
      if (w) void this._settleWinner(w as Side);
      else void this.escrow.settleDraw().then((ok) => { if (ok) console.log(`[BLOCKS WAGER] DRAW → refund ${this.escrow.tier} RONKE abiem`); });
    } else {
      void this._queueUnverified(w as Side);   // verify nepraėjo → manual eilė (operatorius sprendžia)
    }
    this._logMatch(w);
  }

  // Neverifikuotas rezultatas → laimėtojo prizas į MANUAL eilę (:6610). Operatorius patikrina įėjimus prieš mokant.
  private async _queueUnverified(winner: Side, note?: string) {
    this.escrow.markSettled();   // apsauga nuo dvigubo apmokėjimo
    if (!winner) { console.warn(`[BLOCKS WAGER] unverified draw room=${this.roomId} — reikia manual patikros`); return; }
    const { prize } = this.escrow.split();
    const addr = this.escrow.addressOf(winner);
    if (/^0x[0-9a-f]{40}$/.test(addr)) {
      PayoutQueue.add({ to: addr, amount: prize, kind: "win", roomId: this.roomId, manual: true, note });   // manual → auto-flush NEmokės
      console.warn(`[BLOCKS WAGER] ⚠️ UNVERIFIED → winner ${prize} RONKE → ${addr} į MANUAL eilę${note ? ` (${note})` : ""} (admin :6610 patikrink įėjimus prieš mokant!)`);
    }
  }

  // 📊 Įrašo KIEKVIENĄ tetris mačą į MatchLog (dashboard PvP skiltis). Nemokamiems — tik vardai + laimėtojas.
  private _logMatch(winner: Side | "") {
    try {
      let p1Name = "", p2Name = "";
      this.state.players.forEach((pl) => { if (pl.side === "p1") p1Name = pl.name; else if (pl.side === "p2") p2Name = pl.name; });
      const wager = this.escrow.active;
      const mi = wager ? this.escrow.matchInfo() : null;
      const wAddr = wager && mi ? (winner === "p1" ? mi.p1.addr : winner === "p2" ? mi.p2.addr : "") : "";
      const lAddr = wager && mi ? (winner === "p1" ? mi.p2.addr : winner === "p2" ? mi.p1.addr : "") : "";
      MatchLog.record({
        ts: Date.now(), roomId: this.roomId, wager,
        tier: mi ? mi.tier : 0, pot: mi ? mi.pot : 0,
        p1Name, p2Name,
        p1Addr: mi ? mi.p1.addr : "", p1Tx: mi ? mi.p1.tx : "",
        p2Addr: mi ? mi.p2.addr : "", p2Tx: mi ? mi.p2.tx : "",
        winner: winner || "draw", winnerAddr: wAddr, loserAddr: lAddr,
        prize: (wager && mi && winner) ? mi.prize : 0, treasuryCut: (wager && mi && winner) ? mi.treasuryCut : 0,
        result: winner ? "settled" : "draw",
      });
    } catch (e: any) { console.warn("[MatchLog] record fail:", e?.message); }
  }

  // ── 🧱💰 WAGER settle/abort (deleguoja [[WagerEscrow]]; čia tik transliacija klientams) ──────────
  // Laimėtojas 80% poolo (2×tier); treasury pasilieka 20% (jis jau treasury'je iš įėjimų).
  private async _settleWinner(winner: Side) {
    const r = await this.escrow.settleWinner(winner);
    if (!r) { console.error(`[BLOCKS WAGER] winner ${winner} payout praleistas (jau settlinta / be adreso)`); return; }
    this.broadcast("settle", { winner, prize: r.prize, pot: r.pot });
    console.log(`[BLOCKS WAGER] SETTLE winner=${winner} ${r.prize}/${r.pot} RONKE → ${this.escrow.addressOf(winner)}`);
  }

  // Abort (stake timeout / verify fail / oponentas išėjo / atsisakė mokėti) → grąžinam tam, kas jau
  //   sumokėjo (verify-then-refund kiekvienai pusei), visi grįžta į lobį. Idempotentiška (refunded flag'ai).
  private async _abortWager(reason: string) {
    if (this.stakeTimer) { clearTimeout(this.stakeTimer); this.stakeTimer = null; }
    if (this.prepTimer) { clearTimeout(this.prepTimer); this.prepTimer = null; }   // 🎓 kad prep-timeout nepaleistų mačo po abort
    this._prepReady = {};
    const n = await this._refundBoth();
    if (n) console.log(`[BLOCKS WAGER] abort (${reason}) → refunded ${n}× ${this.escrow.tier} RONKE`);
    // 📊 dashboard'ui: užfiksuojam nutrūkusį/refundintą mačą (kad matytųsi „ar viskas sklandžiai")
    try {
      const mi = this.escrow.matchInfo();
      let p1Name = "", p2Name = "";
      this.state.players.forEach((pl) => { if (pl.side === "p1") p1Name = pl.name; else if (pl.side === "p2") p2Name = pl.name; });
      if (mi.p1.tx || mi.p2.tx) MatchLog.record({
        ts: Date.now(), roomId: this.roomId, wager: true, tier: mi.tier, pot: mi.pot,
        p1Name, p2Name,
        p1Addr: mi.p1.addr, p1Tx: mi.p1.tx, p2Addr: mi.p2.addr, p2Tx: mi.p2.tx,
        winner: "", winnerAddr: "", loserAddr: "", prize: 0, treasuryCut: 0,
        result: "aborted", reason,
      });
    } catch (_) {}
    this.clients.forEach((c) => c.send("wager_abort", { reason }));
    if (this.state.phase !== "over") this.state.phase = "lobby";
  }

  // Grąžina abiem pusėm (kiekviena refundEntry: verify-then-refund; no-op jei nemokėjo/jau grąžinta/settlinta).
  private async _refundBoth(): Promise<number> {
    const a = await this.escrow.refundEntry("p1");
    const b = await this.escrow.refundEntry("p2");
    return (a ? 1 : 0) + (b ? 1 : 0);
  }

  // Kambarys užsidaro: jei buvo staking'as, kažkas sumokėjo, bet rungtynių NEĮVYKO → grąžinam.
  async onDispose() {
    this._disposed = true;   // stabdom fono verify ciklą
    if (this.prepTimer) { clearTimeout(this.prepTimer); this.prepTimer = null; }
    if (this.stakeTimer) { clearTimeout(this.stakeTimer); this.stakeTimer = null; }
    if (this.escrow.active && !this.escrow.settled) {
      // Jei mačas TURĖJO baigtį (laimėtojas/lygiosios) — NErefundinam aklai: paskutinį kartą verifikuojam ir
      //   IŠMOKAM laimėtojui (arba refund lygiosioms). Kitaip skubus kambario uždarymas prieš verify pabaigą
      //   „prarytų" pergalę ir grąžintų 69, o ne 110 → žaidėjas laimi, bet negauna prizo.
      if (this._winnerSide !== null) {
        if (!this._verifyDone) { try { this._verifyOk = await this.escrow.verifyBoth(); } catch { /* RPC */ } this._verifyOk = this.escrow.bothVerified(); this._verifyDone = true; }
        this._settleIfReady();   // verifyOk → winner payout (per StakeService/eilė); else → manual eilė (durabili)
        return;
      }
      // Mačas be baigties (abandoned prieš pabaigą) — grąžinam abiem jau sumokėjusiems.
      const n = await this._refundBoth();
      if (n) console.log(`[BLOCKS WAGER] room disposed → refunded ${n}× ${this.escrow.tier} RONKE`);
    }
  }

  // A6: laiko limitas be topout → laimi DAUGIAU linijų išsiuntęs (agresyvesnis); lygu → lygiosios ("").
  private _endByTime() {
    let bestSide: Side | "" = "";
    let bestLines = -1;
    let tie = false;
    this.state.players.forEach((pl) => {
      if (pl.lines > bestLines) { bestLines = pl.lines; bestSide = pl.side as Side; tie = false; }
      else if (pl.lines === bestLines) { tie = true; }
    });
    this._end(tie ? "" : bestSide);
  }
}
