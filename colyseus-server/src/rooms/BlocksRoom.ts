import { Room, Client, updateLobby } from "@colyseus/core";
import { BlocksState, BlocksPlayer } from "../schema/BlocksState";
import { loadGameLib, GameLib } from "../blocks/loadGame";
import { StakeService } from "../services/StakeService";
import { verifyWagerEntry, wagerEnabled } from "../services/WagerEntry";
import { WagerEscrow } from "../blocks/WagerEscrow";
import { MatchLog } from "../blocks/MatchLog";
import { PayoutQueue } from "../blocks/PayoutQueue";   // neverifikuoto rezultato payout → manual eilė
import * as ReferralStore from "../blocks/ReferralStore";   // 🎁 referalų sistema (bind + 5% kreditas)
import * as RankStore from "../blocks/RankStore";           // 🏅 reitingo (lygos+žvaigždutės) + deko XP
import * as AiLevels from "../blocks/AiLevels";
import { chainDeckFull, chainUtypeStr } from "../services/DeckChain";   // 🎖️ unitu XP report (on-chain dekas)             // 🤖 RANKED vs AI — 24 pakopų sunkumo kreivė

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
/* 🎓 PASIRUOSIMO LANGAS. 2026-09-02 (user: "a game already started but i cant play it coz of the
 * wallet pop up - cant control"): iki siol po PREP_MS macas startuodavo PATS, net jei NIEKAS nepaspaude
 * READY. Langas prasideda ta sekunde, kai serveri pasiekia paskutinis stake tx hash - o klientas ji
 * siuncia is `pay.then()`, t. y. dar pinigines lange/app'e. 15 s + 3 s countdown = 18 s nuo "pinigine
 * grazino hash" iki krentanciu figuru; grizimas is mobilios pinigines app'o tiek lengvai suvalgo.
 * Zaidejas negalejo valdyti, pralaimedavo ir gaudavo -* IR prarasdavo statyma uz maca, kurio nemate.
 * DABAR: 60 s, ir langas baigiasi NE startu, o ATSAUKIMU + refundu (zr. _prepGiveUp). Macas prasideda
 * TIK kai visi zmones paspaudzia READY - vienintelis irodymas, kad zaidejas grizo ir valdo. */
const PREP_MS = Number(process.env.BLOCKS_PREP_MS) || 60000;
const CHALLENGE_MS = 30000;   // kiek host'as turi laiko atsakyti „do you want to play?" (auto-decline po to)
// 🧱💰 pay-on-accept: kiek abu turi laiko sumokėti statymą. 08-20: 120 s → 240 s.
//    120 s pakako desktop plėtiniui, bet TELEFONE kelias yra: perjungimas į Ronin appsą →
//    WalletConnect sesija → patvirtinimas → grįžimas į naršyklę → tx blokas. Tai reguliariai
//    netilpdavo, laikmatis nutraukdavo mačą, ir žaidėjams atrodydavo „abu sumokėjom, o žaidimo nėra".
const STAKE_MS = Number(process.env.BLOCKS_STAKE_MS) || 240000;
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

/* ── 🤖 RANKED vs AI ──────────────────────────────────────────────────────────
 * Žaidėjas moka FIKSUOTĄ fee (25 RONKE ≈ PvP treasury 20% cut) → VISA suma lieka treasury
 * (payout'o NĖRA — laimėjęs gauna +1★, pralaimėjęs −½★; TAS PATS reitingas kaip PvP).
 * Botas žaidžia SERVERYJE (0ms ping, cheat'inti negalima) žaidėjo lygos×žvaigždučių stiprumu.
 * Mokestis per tą patį payAndPlay kelią → verifikacija WagerEntry (EXACT 25), refund jei mačas neįvyko. */
const AI_FEE = Math.max(1, Number(process.env.BLOCKS_AI_FEE || 25));   // RONKE už vieną RANKED vs AI mačą
const AI_SNAP_MS = 100;               // boto lentos transliavimo dažnis (klientas interpoliuoja kaip PvP snap'us)
// 🔁 AUTO režime periodiškai išmokam laukiančias eilės išmokas (kai pool papildytas — senos „eilėje" prizai išsimoka savaime).
// 🛟 Pirma RECONCILE iš Supabase — po cloud redeploy vietinis blocks_payouts.json tuščias, tad atstatom
//    laukiančias išmokas iš durablaus Supabase dublio, kad NĖ VIENAS prizas nedingtų per deploy'ą.
if (STAKE.enabled && !STAKE.manual) {
  setTimeout(() => { void PayoutQueue.reconcile().then(() => STAKE.flushQueue()); }, 8000);   // reconcile → tada flush
  setInterval(() => { void STAKE.flushQueue(); }, 3 * 60 * 1000);                              // ir kas 3 min
  // 🎁 Referral claim'ai: klientas rašo `refclaimreq_<R>` (anon) → serveris drenuoja → payout eilė → flushQueue.
  if (ReferralStore.referralEnabled()) {
    setInterval(() => { void ReferralStore.drainClaimRequests().then((n) => { if (n) void STAKE.flushQueue(); }); }, 25000);
  }
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
  /* 🎖️ XP taškai su COMBO/dydžio premija (2026-08-16). Kaupiami PER MAČĄ, serverio pusėje —
   * combo grandinė nustatoma pagal valymų laiką (klientas jos nesiunčia, tad ir suklastoti negali). */
  private _xpAcc: Record<Side, number> = { p1: 0, p2: 0 };
  /* 🧱🏆 TETRISAI (4 linijos vienu metu) — trofėjų misijai; rašom į DB kartą, mačo gale. */
  private _tetrisCnt: Record<Side, number> = { p1: 0, p2: 0 };
  private _combo: Record<Side, { at: number; n: number }> = { p1: { at: -1e9, n: 0 }, p2: { at: -1e9, n: 0 } };
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
  private _refOf: Record<Side, string> = { p1: "", p2: "" };   // 🎁 kiekvieno žaidėjo referrer'is (iš stake žinutės)
  private _aborting = false;   // 🛟 mačas nutraukiamas — nebepriimam naujų statymų kaip „gyvų"
  private _addrOf: Record<Side, string> = { p1: "", p2: "" };  // 🏅 kiekvieno žaidėjo piniginė (nemokamiems iš options.addr; wager perrašo įrodytu iš escrow) — reitingui/XP
  // 🤖 AI botai (bendra RANKED vs AI ir PvP „AI žaidžia už mane" infrastruktūra):
  //   _aiPlayOf[side]=true → tą pusę žaidžia SERVERIO botas žaidėjo lygos stiprumu (bots[side]).
  //   vsAI=true → specialus atvejis: p2 = botas be kliento, solo 25 RONKE fee, be payout.
  private vsAI = false;
  private bots: Partial<Record<Side, { eng: any; ai: any; acc: number; snapAcc: number }>> = {};
  private _aiPlayOf: Record<Side, boolean> = { p1: false, p2: false };
  private _aiCfgOf: Record<Side, { step: number; name: string }> = {
    p1: { step: 0, name: "PAPER AI 0★" }, p2: { step: 0, name: "PAPER AI 0★" },
  };
  // 🪪 žaidėjų lygos (0..7) + W/L statistika (AI ir PvP atskirai) — mačo badge'ams (abu mato tą patį)
  private _leagueOf: Record<Side, number> = { p1: 0, p2: 0 };
  private _idStats: Record<Side, { aiW: number; aiL: number; pvpW: number; pvpL: number }> = {
    p1: { aiW: 0, aiL: 0, pvpW: 0, pvpL: 0 }, p2: { aiW: 0, aiL: 0, pvpW: 0, pvpL: 0 },
  };
  private _feeVerifyStarted = false;   // vsAI: solo fee fono verifikacija (kaip _bgVerify, tik p1)
  private _feeOk = false;
  private _feeDone = false;
  private _rankApplied = false;        // vsAI: rank taikom 1× kai IR mačas baigtas, IR fee verify baigtas

  onCreate(options?: any) {
    /* PRIVATUS kambarys (draugo kvietimas per kodą/nuorodą): išimamas iš matchmaking, kad
     * QUICK MATCH (joinOrCreate) į jį atsitiktinai neįmestų pašalinio. Prisijungiama TIK per
     * joinById(roomId). Public kambariai (quick match) lieka matomi. */
    if (options && options.mode === "private") { this.setPrivate(); this._neverList = true; }   // 🔒 invite kambarys lobyje nefigūruoja NIEKADA
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

    // 🤖 RANKED vs AI kambarys: privatus, 1 žmogus + serverio botas. Escrow perkuriamas SOLO fee režimu
    //   (tier=AI_FEE, moka tik p1; payout kelio NĖRA — žr. _settleIfReady guard). Be env raktų → nemokamas
    //   (lokalus dev / serveris nesukonfigūruotas) — mačas vyksta, bet fee neimamas ir rank'ui reikia rankEnabled().
    this.vsAI = !!(options && options.vsAI);
    if (this.vsAI) {
      this._aiPlayOf.p2 = true;   // p2 = serverio botas (be kliento)
      this.setPrivate();
      this._neverList = true;     // 🔒 vsAI kambarys irgi niekada nefigūruoja lobyje
      this.maxClients = 1;
      this.escrow = new WagerEscrow(
        wagerLive ? AI_FEE : 0,
        (p) => STAKE.settle(p.map((x) => ({ ...x, roomId: this.roomId }))),
        (a, t, ti) => verifyWagerEntry(a, t, ti),
        WINNER_BPS,
        (side, addr, tierR, reason) => {
          PayoutQueue.add({ to: addr, amount: tierR, kind: "refund", roomId: this.roomId, manual: true, note: `vsAI fee refund NEAIŠKUS (${reason}) — patikrink įėjimo tx prieš mokant` });
          console.warn(`[BLOCKS vsAI] 🛟 fee refund NEAIŠKUS (${reason}) → ${addr} ${tierR} RONKE į MANUAL eilę`);
        },
      );
      this.setMetadata({ host: (options && options.name) || "Player", mode: "ai", tier: this.escrow.active ? AI_FEE : 0, wager: this.escrow.active, wagerLive });
    }

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
    this.onMessage("prep_ready", (c) => this._onPrepReady(c));
    this.onMessage("xp_assign", (c, m: any) => { void this._onXpAssign(c, m); });   // 🎖️ pool -> pasirinktas unitas   // 🎓 pasiruošimo lange „ready" → startas kai abu
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
    // 🏅 piniginė reitingui/XP: nemokamiems iš options.addr (deklaruota, ne įrodyta — off-chain XP → OK);
    //    wager metu perrašom ĮRODYTU adresu (_onStake / escrow). Be piniginės → nėra reitingo (ir nėra kam duoti XP).
    this._addrOf[side] = String((options && options.addr) || "").trim().toLowerCase();
    // 🎁 referrer'is iš invite linko — dabar siunčiamas IR per join (ne tik stake), kad prisirištų ir NEMOKAMUOSE mačuose
    this._refOf[side] = String((options && options.ref) || "").trim().toLowerCase();
    if (side === "p1") this.hostSession = client.sessionId;   // pirmasis = HOST (jam eina challenge)
    // 🧱💰 pay-on-accept: NEIMAM įėjimo prisijungiant — abu moka tik po host'o „accept" (žr. _accept/_onStake).
    client.send("hello", { side, seed: this.seed });
    void this._fetchLeague(side);   // 🪪 lyga badge'ams
    // 🤖 vsAI: sintetinis boto „žaidėjas" p2 + sunkumas pagal žaidėjo reitingą (async — spėja iki countdown).
    if (this.vsAI && side === "p1") void this._setupBot();
    // 🤖 PvP „AI žaidžia už mane" NEMOKAMAME mače: deklaruojama join options (fee nėra — nėra ko tikrinti).
    //   WAGER mače options IGNORUOJAM — ten galutinis žodis = stake žinutės aiPlay (fee sumokėtas kartu).
    if (!this.vsAI && !this.escrow.active && options && options.aiPlay) {
      this._aiPlayOf[side] = true;
      void this._fetchAiLevel(side);
    }
  }

  // 🪪 žaidėjo lyga + W/L (AI/PvP atskirai) badge'ams (best-effort; be piniginės/DB → PAPER 0-0)
  private async _fetchLeague(side: Side) {
    try {
      const a = this._addrOf[side];
      if (!RankStore.isAddr(a) || !RankStore.rankEnabled()) return;
      const s = await RankStore.get(a);
      this._leagueOf[side] = s.league;
      this._idStats[side] = {
        aiW: s.aiWins, aiL: s.aiLosses,
        pvpW: Math.max(0, s.wins - s.aiWins), pvpL: Math.max(0, s.losses - s.aiLosses),
      };
    } catch (_) {}
  }

  // 🤖 Pusės AI pakopa = TO žaidėjo lyga×žvaigždutės (naujas/be piniginės → PAPER 0★).
  private async _fetchAiLevel(side: Side) {
    let score = 0;
    try {
      const addr = this._addrOf[side];
      if (RankStore.isAddr(addr) && RankStore.rankEnabled()) score = (await RankStore.get(addr)).score;
    } catch (_) {}
    const lvl = AiLevels.levelFor(score);
    this._aiCfgOf[side] = { step: lvl.step, name: lvl.name };
    console.log(`[BLOCKS AI] ${side} botas ${lvl.name} (step ${lvl.step}) room=${this.roomId}`);
  }

  // 🤖 vsAI: boto lygis pagal P1 (žaidėjo!) reitingą — botas kopijuoja tave + sintetinis p2 „žaidėjas".
  private async _setupBot() {
    let score = 0;
    try {
      const addr = this._addrOf.p1;
      if (RankStore.isAddr(addr) && RankStore.rankEnabled()) score = (await RankStore.get(addr)).score;
    } catch (_) {}
    const lvl = AiLevels.levelFor(score);
    this._aiCfgOf.p2 = { step: lvl.step, name: lvl.name };
    this._leagueOf.p2 = RankStore.decode(score).league;   // 🪪 boto lyga = žaidėjo lyga
    this._idStats.p2 = { ...this._idStats.p1 };           // 🪪 boto statistika = tavo dvynio (tavo) statistika
    if (!this.state.players.get("bot")) {
      const bot = new BlocksPlayer();
      bot.side = "p2"; bot.name = lvl.name; bot.ready = true;
      this.state.players.set("bot", bot);   // sessionId „bot" — realaus kliento su tokiu id nėra
    } else { const b = this.state.players.get("bot")!; b.name = lvl.name; }
    console.log(`[BLOCKS vsAI] botas ${lvl.name} (step ${lvl.step}) room=${this.roomId}`);
  }

  async onLeave(client: Client, consented: boolean) {
    // Iškritus/išėjus DAR NEprasidėjus rungtynėms (lobby/challenge/staking) — jokio „pralaimėjimo".
    if (this.state.phase === "lobby" || this.state.phase === "challenge" || this.state.phase === "staking" || this.state.phase === "prep") {
      const p = this.state.players.get(client.sessionId);
      if (this.state.phase === "challenge" && p && p.side === "p2") this._cancelChallenge();  // svečias dingo (niekas nemokėjo)
      // 📱 MOBILE FIX (08-10): mokėdamas piniginės APP'E žaidėjas praranda WS — NEabortinam iškart!
      //   Kambarys laukia: grįžęs klientas prisijungia per joinById ir atsiunčia stake tx (main.js resume).
      //   Jei negrįžo — stake_timeout (STAKE_MS) abortina + refund'ina kaip anksčiau.
      else if (this.state.phase === "staking" || this.state.phase === "prep") {
        this.autoDispose = false;   // tuščias kambarys nemiršta, kol žaidėjas piniginės app'e
        console.log(`[BLOCKS] 📱 žaidėjas atsijungė ${this.state.phase} fazėje — laukiam sugrįžtant (room=${this.roomId})`);
      }
      try { this.state.players.delete(client.sessionId); } catch {}
      if (client.sessionId === this.hostSession) this.hostSession = "";
      return;
    }
    // ⏱️ COUNTDOWN — mačas dar NEPRASIDĖJO: nė viena figūra nenukrito, tad išėjimas čia NĖRA
    //    pralaimėjimas. Iki 2026-09-02 tai buvo VIENINTELĖ spraga ankstyvame return'e —
    //    lobby/challenge/staking/prep buvo apsaugotos, o countdown ne, todėl išėjimas per tas
    //    3 sekundes krisdavo tiesiai į `_winByLeave`.
    //    📊 IŠMATUOTA (Supabase blocksmatch_, 7 d.): 13 mačų baigėsi per 1,9–12,5 s nuo `started`
    //    įrašo, o `started` rašomas `_beginPrep()` PRADŽIOJE — prieš PREP_MS + COUNTDOWN_MS.
    //    Vadinasi nė vienas tų žaidėjų nematė nė vienos krentančios figūros, bet prarado statymą
    //    ir ★. Suma: 500 RONKE / 2 žaidėjai; 11 iš 13 — prieš AI.
    //    Elgesys toks pat kaip prep: statymas grąžinamas ABIEM, reitingas NELIEČIAMAS.
    if (this.state.phase === "countdown") {
      console.log(`[BLOCKS] ⏱️ žaidėjas išėjo per countdown — mačas atšaukiamas, ne pralaimimas (room=${this.roomId})`);
      try { this.state.players.delete(client.sessionId); } catch {}
      if (client.sessionId === this.hostSession) this.hostSession = "";
      // ⚠️ `_abortWager` pats išvalo laikmačius, uždaro fazę į „lobby" ir grąžina abiem, tad
      //    countdown ciklas (`_tick`, sąlyga `phase === "countdown"`) natūraliai sustoja.
      if (this.escrow.active) { void this._abortWager("countdown_left"); return; }
      // (fazė čia garantuotai „countdown", tad `!== "over"` tikrinti nereikia — tsc tai ir pasako)
      this.state.phase = "lobby";
      this._relist("žaidėjas išėjo per countdown");
      return;
    }
    // 🤖 AI valdoma pusė: žaidėjas gali IŠEITI — jo botas pabaigia mačą (lago/AFK imunitetas).
    //   Jokio pralaimėjimo; state.players įrašo NEtrinam (vardai/lines reikalingi iki galo).
    const leftSide = this.sideOf[client.sessionId];
    if (leftSide && this._aiPlayOf[leftSide]) {
      console.log(`[BLOCKS AI] ${leftSide} žaidėjas išėjo — jo AI pabaigia mačą (room=${this.roomId})`);
      return;
    }
    // Rungtynėse: TAS PATS 8 s persijungimo langas ir „sąmoningam", ir netikėtam išėjimui.
    //    BUVO: `if (consented) { this._winByLeave(client); return; }` — momentinis pralaimėjimas.
    //    Kodėl tai klaida: telefone „sąmoningas" išėjimas įvyksta ne tik paspaudus „išeiti“ —
    //    naršyklei nuėjus į foną (persijungus į Ronin piniginės app'ą) ir kai klientas jungiasi
    //    į NAUJĄ kambarį dar būdamas sename. Žaidėjas tokio ketinimo neturėjo, o rezultatas
    //    buvo galutinis. Būtent dėl to skundas „Tetris paėmė ★ ir RONKE dėl nepavykusių startų“.
    //    Kaina: pasidavus varžovas laukia iki 8 s. Negrįžus rezultatas TOKS PAT kaip anksčiau —
    //    `_winByLeave`, tik ne akimirksniu. Nepelnyto pralaimėjimo kaina buvo didesnė.
    if (consented) console.log(`[BLOCKS] žaidėjas išėjo sąmoningai — duodam 8 s grįžti (room=${this.roomId})`);
    try { await this.allowReconnection(client, 8); }
    catch { this._winByLeave(client); }
  }

  // ── žinutės ────────────────────────────────────────────────────────────────
  private _setReady(client: Client, v: boolean) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.ready = v;
    // 🤖 vsAI: challenge/accept NEREIKIA (botas visada sutinka) → fee (jei gyvas) arba iškart prep.
    if (this.vsAI) {
      if (this.state.phase !== "lobby" || !v) return;
      if (this.escrow.active) {
        this.state.phase = "staking";
        this.clients.forEach((c) => c.send("stake_now", { tier: this.escrow.tier, ai: true }));
        if (this.stakeTimer) clearTimeout(this.stakeTimer);
        this.stakeTimer = setTimeout(() => { void this._abortWager("stake_timeout"); }, STAKE_MS);
      } else {
        this._beginPrep();
      }
      return;
    }
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
      this.clients.forEach((c) => c.send("stake_now", { tier: this.escrow.tier }));   // PvP: tik pakopa (AI avataras nemokamas)
      if (this.stakeTimer) clearTimeout(this.stakeTimer);
      this.stakeTimer = setTimeout(() => { void this._abortWager("stake_timeout"); }, STAKE_MS);
      return;
    }
    this._beginPrep();   // 🎓 nemokamas: iškart į pasiruošimo/tutorial langą
  }

  // 🧱💰 pay-on-accept + OPTIMISTINIS STARTAS: žaidėjo įėjimo tx (po „stake_now"). Kai ABU sumokėjo →
  //   žaidimas startuoja IŠKART (klientas jau patvirtino tx kvitą), o verify vyksta FONE. Payout gated.
  private _onStake(client: Client, m: any) {
    // 🛟 08-20 PINIGŲ PRARADIMO FIX (žaidėjai: „abu sumokam, o žaidimas neįvyksta"):
    //    Anksčiau čia buvo TYLUS `return`, jei fazė nebe „staking". Realus scenarijus:
    //      1) abu sutinka → `stake_now`, paleidžiamas 120 s (STAKE_MS) laikmatis
    //      2) vienas sumoka greitai; kito piniginė užtrunka ilgiau (mobile: perjungimas į Ronin
    //         appsą, WalletConnect, patvirtinimas) — 120 s telefone praeina LENGVAI
    //      3) laikmatis suveikia → `_abortWager` → pirmajam refundas, fazė → „lobby"
    //      4) vėluojančio tx patvirtinamas, klientas siunčia `stake` → čia TYLIAI atmesdavo
    //    ⇒ jo 69 RONKE lieka treasury: escrow tos pusės įrašo NETURI (tx nebuvo užfiksuotas),
    //      tad joks vėlesnis `refundEntry` jo neranda. Pinigai dingdavo be pėdsako.
    //    DABAR: vėluojantį mokėjimą PRIIMAM ir iškart grąžinam (verify-then-refund; neaišku → manual eilė).
    if (this.state.phase !== "staking" || this._aborting || !this.escrow.active) {
      const lateSide = this.sideOf[client.sessionId];
      const lateTx = String((m && (m.tx || m.entryTx)) || "");
      const lateAddr = String((m && m.addr) || "");
      if (lateSide && lateTx && lateAddr && this.escrow.active && !this.escrow.isRefunded(lateSide)) {
        console.warn(`[BLOCKS WAGER] ⏰ VĖLYVAS stake (fazė=${this.state.phase}) ${lateAddr.slice(0, 10)}… → priimam ir GRĄŽINAM`);
        this.escrow.setEntry(lateSide, lateAddr, lateTx);
        void this.escrow.refundEntry(lateSide).then((ok) => {
          console.log(`[BLOCKS WAGER] ⏰ vėlyvo stake refundas: ${ok ? "IŠSIŲSTAS" : "į manual eilę / neapmokėta"}`);
        }).catch((e) => console.warn("[BLOCKS WAGER] vėlyvo stake refundo klaida:", e?.message));
        try { client.send("wager_abort", { reason: "stake_too_late_refunded" }); } catch (_) {}
      }
      return;
    }
    // 🛟 08-20 ESMINIS FIX — „abu sumokėjom, o žaidimo nėra, ir pinigai neatgal":
    //    Mokant piniginės APP'E (mobile) naršyklė nueina į foną ⇒ WebSocket miršta. Grįžęs klientas
    //    persijungia per `joinById` (žr. tetris/js/main.js „MOBILE RESUME") ir gauna **NAUJĄ sessionId**.
    //    O puses laikėm žemėlapyje pagal SENĄ sessionId, tad čia buvo `if (!side) return;` — statymas
    //    TYLIAI dingdavo. Pasekmė: tx patvirtinta ir pinigai treasury, bet escrow apie tą pusę nieko
    //    nežino ⇒ nei mačo, nei refundo, nei prizo (adreso irgi nėra, tad `refundEntry`/`settleWinner`
    //    tos pusės niekada neranda). Būtent tai ir matyti grandinėje: 4 mokėjimai, 0 grąžinimų.
    //    DABAR: pusę atstatom pagal PINIGINĖS ADRESĄ, o nepavykus — pagal vienintelę laisvą pusę.
    let side = this.sideOf[client.sessionId];
    const tx = String((m && (m.tx || m.entryTx)) || "");
    const addr = String((m && m.addr) || "").trim().toLowerCase();
    if (!side && addr) {
      const bySide = (["p1", "p2"] as Side[]).find((sd) => this._addrOf[sd] && this._addrOf[sd] === addr);
      if (bySide) { side = bySide; this.sideOf[client.sessionId] = bySide; console.warn(`[BLOCKS] ♻️ pusė atstatyta pagal adresą po perjungimo: ${bySide} (${addr.slice(0, 10)}…)`); }
    }
    if (!side) {
      const free = (["p1", "p2"] as Side[]).filter((sd) => !this.escrow.hasEntry(sd));
      if (free.length === 1) { side = free[0]; this.sideOf[client.sessionId] = side; console.warn(`[BLOCKS] ♻️ pusė atstatyta pagal laisvą vietą: ${side}`); }
    }
    if (!side) { console.warn(`[BLOCKS] ⛔ stake be atpažįstamos pusės (${addr.slice(0, 10)}…) — praleista`); return; }
    if (!tx) return;
    this._refOf[side] = String((m && m.ref) || "");   // 🎁 referrer'is (iš kliento localStorage `rb_ref`); bind'inam settle metu (proven wallet)
    if (addr) this._addrOf[side] = addr.trim().toLowerCase();   // 🏅 wager: ĮRODYTAS adresas reitingui (perrašo onJoin deklaraciją)
    void this._fetchLeague(side);   // 🪪 lyga badge'ams (įrodytas adresas galėjo pasikeisti)
    // 🤖 PvP „AI žaidžia už mane" — NEMOKAMA (user 08-09): žaidėjas moka TIK pakopą (69/200/800),
    //   jokio priedo. 25 RONKE fee lieka TIK RANKED vs AI mačams (vsAI kelias žemiau).
    if (!this.vsAI && m && m.aiPlay) {
      this._aiPlayOf[side] = true;
      void this._fetchAiLevel(side);
    }
    this.escrow.setEntry(side, addr, tx);
    // 🤖 vsAI: moka TIK p1 (botas nemoka) → startuojam iškart (optimistinis, kaip PvP), fee verify fone.
    if (this.vsAI) {
      if (side !== "p1") return;
      if (this.stakeTimer) { clearTimeout(this.stakeTimer); this.stakeTimer = null; }
      this._beginPrep();
      void this._bgVerifyFee();
      return;
    }
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

  // 🤖 vsAI fee fono verifikacija (kaip _bgVerify, tik SOLO p1). Rezultatas lemia TIK reitingo taikymą:
  //   fake tx → mačas vyksta, bet ★ NEgaunama/NEatimama (mokestis = bilietas į reitingą).
  private async _bgVerifyFee() {
    if (this._feeVerifyStarted) return; this._feeVerifyStarted = true;
    const MAX_ATTEMPTS = 15, GAP_MS = 18000;
    for (let i = 0; i < MAX_ATTEMPTS && !this._disposed; i++) {
      try { if (await this.escrow.verifySide("p1")) { this._feeOk = true; break; } } catch (_) { /* RPC glitch → bandom vėl */ }
      if (this._disposed) break;
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
    this._feeDone = true;
    if (!this._feeOk) console.warn(`[BLOCKS vsAI] fee verify NEpraėjo (fake tx arba RPC gedimas) → reitingas šiam mačui NEtaikomas`);
    this._applyRankVsAiIfReady();
  }

  // 🎓 PASIRUOŠIMO LANGAS — prieš startą rodom valdymo tutorial (klientas). Startuojam kai ABU paspaudžia
  //   „ready" ARBA po PREP_MS. Wager: on-chain verify vyksta kaip tik šiuo metu (fone) → daugiau laiko.
  private _beginPrep() {
    if (this.state.phase === "prep" || this.state.phase === "countdown" || this.state.phase === "playing") return;
    this.state.phase = "prep";
    this._unlist("mačas prasidėjo");   // 🚪 nuo šio momento kambarys NEBERODOMAS lobyje (žr. _unlist)
    // 🔎 08-20: fiksuojam PATĮ STARTĄ. Tiriant „abu sumoka, o žaidimo nėra" nebuvo kaip atskirti,
    //    ar serveris iki starto apskritai priėjo — MatchLog rašydavo tik pabaigoje/nutraukime, o
    //    Cloud runtime log'ai neprieinami. Dabar DB matyti: startavo ir neužsibaigė vs išvis nestartavo.
    if (this.escrow.active) {
      try {
        const mi = this.escrow.matchInfo();
        let p1Name = "", p2Name = "";
        this.state.players.forEach((pl) => { if (pl.side === "p1") p1Name = pl.name; else if (pl.side === "p2") p2Name = pl.name; });
        MatchLog.record({
          ts: Date.now(), roomId: this.roomId, wager: true, tier: mi.tier, pot: mi.pot,
          p1Name, p2Name, p1Addr: mi.p1.addr, p1Tx: mi.p1.tx, p2Addr: mi.p2.addr, p2Tx: mi.p2.tx,
          winner: "", winnerAddr: "", loserAddr: "", prize: 0, treasuryCut: 0,
          result: "started", reason: `clients=${this.clients.length} players=${this.state.players.size}`,
        });
      } catch (_) {}
    }
    this._prepReady = {};
    this.broadcast("prep", { ms: PREP_MS });
    if (this.prepTimer) clearTimeout(this.prepTimer);
    // ⏳ Laikas baigesi, o ne visi paspaude READY -> macas NEPRASIDEDA (zr. PREP_MS komentara).
    this.prepTimer = setTimeout(() => { this.prepTimer = null; void this._prepGiveUp(); }, PREP_MS);
  }

  private _onPrepReady(client: Client) {
    if (this.state.phase !== "prep") return;
    this._prepReady[client.sessionId] = true;
    let ready = 0;
    this.state.players.forEach((_p, sid) => { if (this._prepReady[sid]) ready++; });
    this.broadcast("prep_state", { ready, total: this.state.players.size });
    // 🤖 vsAI: botas visada „ready" → startuojam vos žmogus paspaudžia (state.players turi ir botą, bet
    //   _prepReady pildosi tik realiems klientams, tad vsAI slenkstis = 1).
    const need = this.vsAI ? 1 : 2;
    if (ready >= need && this.state.players.size >= 2) {
      if (this.prepTimer) { clearTimeout(this.prepTimer); this.prepTimer = null; }
      this._beginCountdown();   // abu pasiruošę → startas nelaukiant 15s
    }
  }

  /* ⏳🚪 Ne visi paspaude READY per PREP_MS -> maco NEPRADEDAM.
   * Statymas grazinamas, reitingas NELIECIAMAS. Anksciau cia buvo automatinis startas, ir zaidejas,
   * kuris dar kabejo pinigines lange, gaudavo -* uz maca, kurio nezaide.
   * Kaina: kas nors gali neatsakyti ir macas neivyks - bet tada abu atgauna pinigus ir ne vienas
   * negauna nei pergales, nei pralaimejimo. Tai teisingesnis rezultatas nei nepelnytas pralaimejimas. */
  private async _prepGiveUp() {
    if (this.state.phase !== "prep") return;
    const missing: string[] = [];
    this.state.players.forEach((p, sid) => { if (sid !== "bot" && !this._prepReady[sid]) missing.push(p.name || sid.slice(0, 6)); });
    console.log(`[BLOCKS] ⏳ prep atsauktas - READY nepaspaude: ${missing.join(", ") || "?"} (room=${this.roomId})`);
    try { this.broadcast("prep_cancel", { reason: "not_ready", who: missing }); } catch (_) {}
    if (this.escrow.active) { await this._abortWager("prep_not_ready"); return; }   // -> refundas abiem, phase=lobby
    this._prepReady = {};
    // nemokamas macas: fazes tikrinti nereikia - i cia patenkam tik is "prep" (zr. ankstyva return)
    this.state.phase = "lobby";
    this._relist("niekas nepatvirtino READY");
  }

  // Startas: countdown + (serverAuth) autoritetingos lentos. Kviečiama po pasiruošimo (abu ready / timeout).
  private _beginCountdown() {
    if (this.prepTimer) { clearTimeout(this.prepTimer); this.prepTimer = null; }
    this.state.phase = "countdown";
    this.state.countdown = COUNTDOWN_MS;
    // A6: šviežias anti-cheat sekimas kiekvienoms rungtynėms
    this.matchMs = 0; this.clearLog = {}; this.lastSnapMs = {}; this._cheat = {}; this._lastPieces = {};
    /* 🎖️ šviežias XP/combo skaitliukas kiekvienoms rungtynėms (rematch tame pačiame kambaryje) */
    this._xpAcc = { p1: 0, p2: 0 };
    this._tetrisCnt = { p1: 0, p2: 0 };
    this._combo = { p1: { at: -1e9, n: 0 }, p2: { at: -1e9, n: 0 } };
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
    // 🤖 AI botai: kiekvienai _aiPlayOf pusei — serverio lenta + ai.js vairuotojas TO žaidėjo lygos
    //   parametrais (CFG.AI_LEVELS.BOT_p1/p2). Žmogaus valdomos pusės lieka client-auth (be input lago);
    //   botas cheat'inti negali (serveris = jo lenta). Apima IR vsAI (p2), IR PvP „AI žaidžia už mane".
    this.bots = {};
    (["p1", "p2"] as Side[]).forEach((s) => {
      if (!this._aiPlayOf[s]) return;
      const E = this.lib.Engine;
      const eng = new E({ side: SIDE_TO_ARMY[s], name: "BOT_" + s, seed: this.seed, isAI: true });
      eng.reset(this.seed);
      try { this.lib.CFG.AI_LEVELS["BOT_" + s] = AiLevels.cfgFor(this._aiCfgOf[s].step); } catch (_) {}
      this.bots[s] = { eng, ai: new this.lib.AI(eng, "BOT_" + s), acc: 0, snapAcc: 0 };
    });
    // 🤖 PvP su AI: žaidėjas gali IŠEITI, o jo botas pabaigia mačą → kambarys neturi užsidaryti likus 0 klientų.
    //   Grąžinam autoDispose _end'e (žr. ten) — MATCH_MAX_MS garantuoja pabaigą.
    //   📱 Eksplicitiškai (staking grace galėjo palikti false): be AI pusių → true.
    this.autoDispose = this.vsAI ? true : !(this._aiPlayOf.p1 || this._aiPlayOf.p2);
    this.clients.forEach((c) => {
      const p = this.state.players.get(c.sessionId);
      const side: Side = (p ? p.side : "p1") as Side;
      const other: Side = side === "p1" ? "p2" : "p1";
      c.send("start", {
        side, seed: this.seed, countdown: COUNTDOWN_MS, serverAuth: this.serverAuth,
        // priešo etiketė: vsAI botas = grynas vardas ("PAPER AI 0★"); PvP AI-avataras = 🤖 + lygis
        foeName: this._aiPlayOf[other] ? (this.vsAI ? this._aiCfgOf.p2.name : "🤖 " + this._aiCfgOf[other].name) : undefined,
        // tavo pusę žaidžia TAVO AI (PvP takeover) → klientas piešia savo lentą iš serverio, įvestis išjungta
        aiYou: this._aiPlayOf[side] || undefined,
        aiName: this._aiPlayOf[side] ? "🤖 " + this._aiCfgOf[side].name : undefined,
        // 🪪 mačo badge'ai: abiejų pusių lygos + kas žaidžia (žmogus/AI) + W/L (AI ir PvP atskirai)
        youLeague: this._leagueOf[side], foeLeague: this._leagueOf[other],
        youAi: this._aiPlayOf[side] || undefined, foeAi: this._aiPlayOf[other] || undefined,
        youStats: this._idStats[side], foeStats: this._idStats[other],
      });
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
    if (this._aiPlayOf[p.side as Side]) return;   // 🤖 šią pusę žaidžia botas — kliento clear ignoruojam
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
    // vienas valymas = vienas smuugis: 1 unitas + (n-1) pastiprinimai jam (zr. army.js requestClear)
    this.army.requestClear(armySide, Array.from({ length: n }, () => this._nextDeckType(armySide)));
    this._xpCredit(p.side as Side, n);   // 🎖️ combo/dydžio premija
    p.lines += n;
  }

  private _relaySnap(client: Client, m: any) {
    // 🤖 AI valdomos pusės kliento snap'ai ignoruojami (jo lentą transliuoja serveris iš boto)
    const sideR = this.sideOf[client.sessionId];
    if (sideR && this._aiPlayOf[sideR]) return;
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
    if (this._aiPlayOf[p.side as Side]) return;   // 🤖 boto pusės topout sprendžia serveris (bot engine)
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
        if (this.bots.p1) this.bots.p1.eng.start();   // 🤖 botai pradeda žaisti
        if (this.bots.p2) this.bots.p2.eng.start();
      }
      return;
    }
    if (this.state.phase !== "playing") return;

    // A6: match timeout — jei niekas netopina per limitą (stall/never-lose exploitas), sprendžiam pagal linijas.
    this.matchMs += dt;
    if (this.matchMs >= MATCH_MAX_MS) { this._endByTime(); return; }

    // A6 L2: SERVER-AUTHORITATIVE lentos — žingsniuojam variklius iš įvesčių, clears→unitai, topout→gameover.
    if (this.serverAuth && this.eng) this._stepEngines(dt);
    // 🤖 AI botai (vsAI p2 ir/ar PvP takeover pusės) — žmogaus valdomos pusės lieka client-auth.
    if ((this.bots.p1 || this.bots.p2) && this.state.phase === "playing") this._stepBots(dt);
    if ((this.state.phase as string) !== "playing") return;   // botas galėjo baigti mačą (topout) šio tick'o metu

    this.army.update(dt);
    const evs = this.army.drainEvents();
    for (const e of evs) {
      if (e.t === "arrive") {
        // e.target = kuriai pusei krenta linija ('you'→p1, 'foe'→p2)
        // ⚔️ ×N: linijų tiek, koks daugiklis LIKO atėjus (pradėjo ×3, kovoje nukrito iki ×1 → 1 linija)
        const lines = Math.max(1, Math.min(4, (e.unit && e.unit.mult) || LINES_PER_UNIT));
        if (this.serverAuth && this.eng) {
          // serverAuth: garbage krenta ant SERVERIO lentos (autoritetinga), ne siunčiam klientui
          const teng = e.target === "you" ? this.eng.you : this.eng.foe;
          if (teng && teng.state === "playing") teng.addGarbageNow(lines);
        } else {
          const targetSide: Side = e.target === "you" ? "p1" : "p2";
          const bot = this.bots[targetSide];
          if (bot) {
            // 🤖 boto pusė serveryje: garbage krenta tiesiai ant boto lentos
            if (bot.eng.state === "playing") bot.eng.addGarbageNow(lines);
          } else {
            this._sendGarbage(targetSide, lines);
          }
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
          this.army.requestClear(key, Array.from({ length: n }, () => this._nextDeckType(key)));
          const _sd: Side = key === "you" ? "p1" : "p2";
          this._xpCredit(_sd, n);   // 🎖️ combo/dydžio premija
          const pl = this._playerBySide(_sd); if (pl) pl.lines += n;
          this.boardFx.push({ side: key, n, rows: e.rows || [], colors: e.colors || [] });   // juice klientui
        } else if (e.t === "topout") {
          const loser: Side = key === "you" ? "p1" : "p2";
          this._end(loser === "p1" ? "p2" : "p1");
          return;
        }
      }
    }
  }

  // 🤖 Botų žingsnis — AI galvoja/spaudo (tap per ai.js), variklis suka lentą 120Hz. Kiekvienai AI pusei:
  //   clear → tos pusės unitai į koridorių · topout → priešinga pusė laimi · lentos snapshot:
  //   PRIEŠUI kaip "state"{foe} (esama interpoliacija), SAVININKUI kaip "state"{you} (žiūri savo AI žaidimą).
  private _stepBots(dt: number) {
    const STEP = 1000 / 120;
    for (const s of ["p1", "p2"] as Side[]) {
      const bot = this.bots[s];
      if (!bot) continue;
      bot.acc += dt;
      let guard = 0;
      while (bot.acc >= STEP && guard < 40) {
        bot.ai.update(STEP);
        bot.eng.update(STEP);
        bot.acc -= STEP; guard++;
      }
      if (guard >= 40) bot.acc = 0;
      const armySide = SIDE_TO_ARMY[s];
      const evs = bot.eng.drainEvents();
      for (const e of evs) {
        if (e.t === "clear") {
          const n = Math.max(0, Math.min(4, e.n | 0));
          this.army.requestClear(armySide, Array.from({ length: n }, () => this._nextDeckType(armySide)));
          this._xpCredit(s, n);   // 🎖️ combo/dydžio premija
          const pl = this._playerBySide(s); if (pl) pl.lines += n;
        } else if (e.t === "topout") {
          this._end(s === "p1" ? "p2" : "p1");   // botas užsivertė → priešinga pusė laimi
          return;
        }
      }
      bot.snapAcc += dt;
      if (bot.snapAcc >= AI_SNAP_MS) {
        bot.snapAcc = 0;
        const snap = this._serializeBoard(bot.eng);
        this.clients.forEach((c) => {
          const p = this.state.players.get(c.sessionId);
          if (!p) return;
          if (p.side === s) c.send("state", { you: snap });    // savininkas žiūri savo AI
          else c.send("state", { foe: snap });                 // priešas mato kaip įprastą oponento lentą
        });
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
        // ⚔️ ×N daugiklis — BŪTINAS klientui: nuo jo priklauso užrašas virš galvos ir unito dydis.
        // (08-15: be šito lauko online režime visi unitai atrodė ×1, nors serveryje buvo ×4.)
        mult: u.mult || 1,
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
  /* 🚪 08-21 (user: „mačą jau sužaidžiau, o lobyje jis vis dar kabo ir jį mato visi").
   * Lobio sąrašą klientas filtruoja TIK pagal `clients === 1 && maxClients === 2`. Sužaidus mačą
   * kambarys lieka gyvas (rezultatų ekranas); varžovui išėjus lieka 1 klientas iš 2 ⇒ kambarys VĖL
   * įkrenta į „atvirų mačų" sąrašą. Žmonės siunčia iššūkį, o šeimininkas nieko nebepatvirtina — jo ten
   * jau nebėra. Tas pats nutinka mačo VIDURY, kai vieną pusę žaidžia AI, o žaidėjas išėjęs.
   * `lock()` čia netinka: Colyseus LobbyRoom užklausa filtruoja `private/unlisted`, o ne `locked`.
   * `setPrivate(true)` išima kambarį iš lobio, bet `joinById` LIEKA — mobilus stake-resume nesulūžta. */
  private _listed = true;
  /* 🔒 Kambariai, kurie NIEKADA nebuvo lobyje (invite `mode:"private"` ir visi vsAI) — jų negalima
   * nei išimti, nei GRĄŽINTI. Be šito `_relist` po nutrūkusio statymo būtų padaręs privatų kambarį viešą. */
  private _neverList = false;
  private _unlist(why: string) {
    if (this._neverList) return;
    if (!this._listed) return;
    this._listed = false;
    /* setPrivate() išima kambarį iš NAUJŲ užklausų (`matchMaker.query({private:false})`), BET
     * NEPRANEŠA jau prisijungusiems lobio klientams — Colyseus `updateLobby` publikuoja tik kai
     * kambarys VIEŠAS. Todėl atskirai siunčiam pašalinimą, kad įrašas dingtų iš atidarytų panelių iškart. */
    try { void this.setPrivate(true); } catch (_) {}
    try { this.setMetadata({ ...((this as any).listing?.metadata || {}), open: false }); } catch (_) {}   // 2-as sluoksnis: senas kliento įrašas irgi nebebus rodomas
    try { updateLobby(this as any, true); } catch (_) {}
    console.log(`[BLOCKS] 🚪 kambarys išimtas iš lobio (${why}) room=${this.roomId}`);
  }
  private _relist(why: string) {
    if (this._neverList) return;
    if (this._listed) return;
    this._listed = true;
    try { void this.setPrivate(false); } catch (_) {}
    try { this.setMetadata({ ...((this as any).listing?.metadata || {}), open: true }); } catch (_) {}
    try { updateLobby(this as any); } catch (_) {}
    console.log(`[BLOCKS] 🔙 kambarys grąžintas į lobį (${why}) room=${this.roomId}`);
  }
  private _end(winner: Side | "") {
    if (this.state.phase === "over") return;
    this.state.phase = "over";
    this._unlist("mačas baigtas");   // 🚪 baigtas mačas NIEKADA nebegrįžta į lobį
    this.state.winner = winner;
    this.broadcast("gameover", { winner });
    // 🎖️ linijų XP → pool + unitų reportas (kiekvienai pusei su pinigine; botas be kliento — no-op)
    void this._xpReport("p1");
    if (!this.vsAI) void this._xpReport("p2");
    // 🤖 vsAI: payout/referral kelio NĖRA — fee lieka treasury (markSettled → jokio refund), rank kai fee patvirtintas.
    if (this.vsAI) {
      this._winnerSide = winner;
      if (this.escrow.active) this.escrow.markSettled();   // mačas įvyko → 25 RONKE fee sunaudotas (negrąžinamas)
      this._applyRankVsAiIfReady();
      this._logMatch(winner);
      return;
    }
    this._applyRank(winner);   // 🏅 reitingas + deko XP (off-chain, idempotentiška per roomId) — free IR wager
    this._bindReferrals();     // 🎁 referral bind — pakviestas tampa referalu vos sužaidęs (free IR wager)
    // 🥇 OPTIMISTINIS: mačas baigėsi — payout sprendžiam kai IR verify baigtas (žr. _settleIfReady).
    if (this.escrow.active) { this._winnerSide = winner; this._settleIfReady(); }
    else this._logMatch(winner);   // nemokamas mačas — tik žurnalas (jokio payout)
    // 🤖 PvP su AI: mačas baigtas → kambarys vėl gali užsidaryti normaliai; jei visi žaidėjai jau išėję
    //   (AI žaidė už juos) — uždarom rankiniu būdu (onDispose užbaigs settle/refund kelius).
    if (this._aiPlayOf.p1 || this._aiPlayOf.p2) {
      this.autoDispose = true;
      if (this.clients.length === 0) setTimeout(() => { try { void this.disconnect(); } catch (_) {} }, 2000);
    }
  }

  // 🤖 vsAI reitingas: taikom 1× kai IR mačas baigtas, IR fee verify baigtas (mokestis = bilietas į reitingą).
  //   Fee negyvas (lokalus dev / serveris be env) → rank taikom iškart (rankEnabled vis tiek gate'ina Supabase).
  private _applyRankVsAiIfReady() {
    if (!this.vsAI || this._rankApplied) return;
    if (this._winnerSide === null) return;                          // mačas dar nesibaigė
    if (this.escrow.active && !this._feeDone) return;               // laukiam fee fono verifikacijos
    this._rankApplied = true;
    if (this.escrow.active && !this._feeOk) return;                 // fake tx → jokio reitingo (įspėta _bgVerifyFee)
    if (this._winnerSide === "") return;                            // draw (laiko limitas lygiomis) → nieko
    // 🛡️ anti-cheat: pergalė prieš botą su cheat-flag'ais (fake snap/clear spam) → ★ NEduodama (fee lieka).
    if (this._winnerSide === "p1" && this._isCheater("p1")) {
      console.warn(`[BLOCKS vsAI] ⛔ pergalė pažymėta anti-cheat (${this._cheatReasons("p1")}) → ★ neduodama room=${this.roomId}`);
      return;
    }
    const addr = this._addrOf.p1;
    if (!RankStore.isAddr(addr) || !RankStore.rankEnabled()) return;
    const won = this._winnerSide === "p1";
    void RankStore.applyResultVsAI(addr, won, this.roomId).then((r) => { this._sendRankAnim("p1", won, r); });
  }

  /* 🎖️🔥 XP premijos (2026-08-16, user: „combo turi duoti daugiau XP, bet kad nebūtų OP").
   * Buvo: XP = linijos × (lyga+1) — vienguba po viengubos duodavo tiek pat, kiek tetrisas.
   * Dabar:
   *   DYDIS  — 1 linija ×1.0 · dviguba ×1.15 · triguba ×1.3 · TETRIS ×1.6
   *   COMBO  — valymai iš eilės (tarpas < COMBO_WINDOW_MS): +6% už grandinės žingsnį, iki +30%
   *   🔒 LUBOS — visa premija NIEKADA neviršija +50% bazinio (linijos ×1.5), kad nebūtų begalinio farmo.
   * Išmatuota (BRONZE, 3 min): naujokas ×1.04 · vidutinis ×1.50 · profas ×1.50 (be lubų būtų buvę ×2.6).
   * Combo skaičiuoja SERVERIS pagal valymų laiką — klientas jo nesiunčia, tad nesuklastosi. */
  private static readonly COMBO_WINDOW_MS = 5000;
  private static readonly XP_BONUS_CAP = 1.5;   // premijos lubos: taškai ≤ linijos × 1.5
  private _xpCredit(side: Side, n: number) {
    const lines = Math.max(0, Math.min(4, n | 0));
    if (!lines) return;
    const c = this._combo[side] || { at: -1e9, n: 0 };
    const chain = (this.matchMs - c.at <= BlocksRoom.COMBO_WINDOW_MS) ? c.n + 1 : 1;
    this._combo[side] = { at: this.matchMs, n: chain };
    /* 🧱🏆 TETRIS! Trofėjų skaitiklis — TIK kai žaidi PATS. „AI PLAYS FOR ME" pusės neskaičiuojam,
     * kitaip botą palikus žaisti 169 tetrisai prisifarmintų be tavęs. vsAI mače žmogus = p1
     * (_aiPlayOf.p1 = false) → ten skaičiuojasi normaliai, kaip ir turi (sumokėta 25 RONKE). */
    if (lines >= 4 && !this._aiPlayOf[side]) this._tetrisCnt[side] = (this._tetrisCnt[side] || 0) + 1;
    const sizeMult = lines >= 4 ? 1.6 : lines === 3 ? 1.3 : lines === 2 ? 1.15 : 1;
    const comboMult = 1 + Math.min(0.30, 0.06 * (chain - 1));
    this._xpAcc[side] = (this._xpAcc[side] || 0) + lines * sizeMult * comboMult;
  }

  // 🎖️ LINIJŲ XP: gain = XP taškai (su combo/dydžio premija) × (lyga+1) → pool; klientui siunčiam reportą su ĮREGISTRUOTAIS
  //   deko unitais (on-chain tiesa per DeckChain) + jų sukauptu XP — žaidėjas pasirinks, kam skirti.
  private async _xpReport(side: Side) {
    try {
      const addr = this._addrOf[side];
      if (!RankStore.isAddr(addr) || !RankStore.rankEnabled()) return;
      const pl = this._playerBySide(side);
      const lines = pl ? (pl.lines | 0) : 0;
      const mult = (this._leagueOf[side] | 0) + 1;
      /* 🎖️ taškai su combo/dydžio premija; jei jų nėra (legacy kelias) — grįžtam prie plikų linijų.
       * 🔒 Premija ribojama XP_BONUS_CAP — daugiau nei ×1.5 nuo linijų kiekio neišeis niekada. */
      const raw = (this._xpAcc[side] || 0) > 0 ? this._xpAcc[side] : lines;
      const pts = Math.min(raw, lines * BlocksRoom.XP_BONUS_CAP);
      const gain = Math.max(0, Math.round(pts * mult));
      if (gain > 0) await RankStore.xpPoolAdd(addr, gain);
      /* 🧱🏆 tetrisų skaitiklis (30 → 69 → 169 trofėjai). Botų pusės neturi adreso → praleidžiama. */
      const _tet = this._tetrisCnt[side] || 0;
      if (_tet > 0) await RankStore.tetrisAdd(addr, _tet);
      const st = await RankStore.xpUnitsGet(addr);
      const deck = await chainDeckFull(addr).catch(() => null);
      const units: any[] = [];
      if (deck) deck.ids.forEach((id) => {
        const s = deck.stats.get(id);
        units.push({ id, utype: s ? chainUtypeStr(s.utype) : "", level: s ? s.level : 0, xp: Number(st.units[id]) || 0 });
      });
      units.sort((a, b) => b.level - a.level || Number(a.id) - Number(b.id));
      this.clients.forEach((c) => {
        const p = this.state.players.get(c.sessionId);
        if (p && p.side === side) c.send("xp_report", { gain, lines, mult, pool: st.pool, units });
      });
      if (gain > 0) console.log(`[BLOCKS XP] ${side} ${addr.slice(0, 8)}… +${gain} XP (${lines} linijų × ${mult})`);
    } catch (e: any) { console.warn("[BLOCKS XP] report fail:", e?.message); }
  }

  // 🎖️ žaidėjo pasirinkimas: VISAS pool → nurodytas unitas (validuojam prieš ON-CHAIN deką)
  private async _onXpAssign(client: Client, m: any) {
    const side = this.sideOf[client.sessionId]; if (!side) return;
    const addr = this._addrOf[side];
    if (!RankStore.isAddr(addr) || !RankStore.rankEnabled()) return;
    const tid = String((m && m.unit) || "").trim();
    if (!/^[0-9]+$/.test(tid)) { client.send("xp_assigned", { ok: false, reason: "bad_unit" }); return; }
    const deck = await chainDeckFull(addr).catch(() => null);
    if (!deck || !deck.ids.has(tid)) { client.send("xp_assigned", { ok: false, reason: "not_in_deck" }); return; }
    const r = await RankStore.xpAssign(addr, tid);
    client.send("xp_assigned", { ok: r.ok, unit: tid, unitXp: r.unitXp || 0, pool: r.pool || 0 });
  }

  // 🎬 Reitingo pokyčio animacija klientui: {won, before, after} (score 0..48) → lobby rodo žvaigždučių
  //   pokytį / promotion / demotion + 🤖 TAVO AI statų augimą (greitis/galvojimas/taiklumas — nes tavo
  //   AI-avataras visada tavo lygio). Best-effort — klientas galėjo jau išeiti (AI žaidė už jį).
  private _sendRankAnim(side: Side, won: boolean, r: { before: { score: number }; after: { score: number } } | null) {
    if (!r) return;
    try {
      const aiPack = (score: number) => {
        const l = AiLevels.levelFor(score);
        return { step: l.step, name: l.name, moveMs: l.cfg.moveMs, thinkMs: l.cfg.thinkMs, mistake: l.cfg.mistake, hold: l.cfg.useHold };
      };
      const payload = { won, before: r.before.score, after: r.after.score, ai: { before: aiPack(r.before.score), after: aiPack(r.after.score) } };
      this.clients.forEach((c) => {
        const p = this.state.players.get(c.sessionId);
        if (p && p.side === side) c.send("rank_anim", payload);
      });
    } catch (_) {}
  }

  // 🏅 REITINGAS + XP — mačui pasibaigus atnaujinam abiejų žaidėjų lygas/žvaigždutes + deko XP (off-chain).
  //   Wager: adresai ĮRODYTI (escrow.matchInfo). Nemokamas: deklaruoti (onJoin options.addr) — off-chain,
  //   ne pinigai → priimtina. Be piniginės žaidėjas praleidžiamas. Idempotentiška per roomId (RankStore dedupe).
  //   Draw (winner="") → jokio reitingo pokyčio. Async best-effort → NELIEČIA payout/settle kelio.
  private _applyRank(winner: Side | "") {
    try {
      if (!winner || !RankStore.rankEnabled()) return;
      let a1 = this._addrOf.p1, a2 = this._addrOf.p2;
      if (this.escrow.active) { const mi = this.escrow.matchInfo(); if (mi.p1.addr) a1 = mi.p1.addr; if (mi.p2.addr) a2 = mi.p2.addr; }
      const wAddr = winner === "p1" ? a1 : a2;
      const lAddr = winner === "p1" ? a2 : a1;
      if (!RankStore.isAddr(wAddr) && !RankStore.isAddr(lAddr)) return;   // nė vienas be piniginės → jokio reitingo (ir DB triukšmo)
      void RankStore.applyResult(wAddr, lAddr, this.roomId).then((r) => {
        if (!r) return;
        // 🎬 kiekvienam žaidėjui — JO reitingo animacija (laimėtojui +★, pralaimėjusiam −★)
        this._sendRankAnim(winner as Side, true, r.winner);
        this._sendRankAnim(winner === "p1" ? "p2" : "p1", false, r.loser);
      });
    } catch (e: any) { console.warn("[BLOCKS RANK] apply fail:", e?.message); }
  }

  // Payout sprendimas — kviečiamas ir po _end, ir po fono verify (kuris paskutinis nugali). Reikia ABIEJŲ:
  //   mačas baigtas (_winnerSide) IR verify baigtas (_verifyDone). Payout gated ant _verifyOk.
  private _settleIfReady() {
    if (this.vsAI) return;   // 🤖 vsAI: payout NĖRA (fee lieka treasury) — rank kelias per _applyRankVsAiIfReady
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
      if (w) { void this._settleWinner(w as Side); void this._creditReferrals(); }   // 🎁 TIK jei LAIMĖTOJAS (abiem referrer'iams 5%); draw = refund → jokios maržos, jokio kredito
      else void this.escrow.settleDraw().then((ok) => { if (ok) console.log(`[BLOCKS WAGER] DRAW → refund ${this.escrow.tier} RONKE abiem`); });
    } else {
      void this._queueUnverified(w as Side);   // verify nepraėjo → manual eilė (operatorius sprendžia)
    }
    this._logMatch(w);
  }

  // 🎁 Referalų kreditas — TIK kai _verifyOk (abu įėjimai on-chain patikrinti → wallet'ai ĮRODYTI).
  //   1) bind (jei atėjo per ref linką IR „niekada nežaidė tetris"); 2) markSeen; 3) 5% nuo tier referrer'iams.
  //   Async + best-effort → laimėtojo payout NELIEČIA. Idempotentiška per roomId (creditReferrers dedupe).
  private async _creditReferrals() {
    try {
      if (!this.escrow.active || !ReferralStore.referralEnabled()) return;
      const mi = this.escrow.matchInfo();
      const p1 = mi.p1.addr, p2 = mi.p2.addr, tier = mi.tier;
      await ReferralStore.bind(p1, this._refOf.p1);   // prisiriša tik jei pirmas kartas + ref≠self
      await ReferralStore.bind(p2, this._refOf.p2);
      await ReferralStore.markSeen(p1);               // pažymim „žaidė tetris" (užkerta vėlyvą bind)
      await ReferralStore.markSeen(p2);
      await ReferralStore.creditReferrers(p1, p2, tier, this.roomId);   // 5% nuo kiekvieno statymo
    } catch (e: any) { console.warn("[BLOCKS REFERRAL] credit fail:", e?.message); }
  }

  // 🎁 REFERRAL BIND — pakviestas žaidėjas tampa referalu vos sužaidęs BET KOKĮ mačą (free ar wager).
  //   User pasirinko „bind nuo pirmo mačo". Adresai: wager = ĮRODYTI (escrow.matchInfo); free = deklaruoti
  //   (onJoin options.addr — modifikuotas klientas galėtų pasisavinti referrer komisiją, bet ji < treasury
  //   cut → NE poolo nusausinimas). Bind idempotentiškas (1× per wallet, self-ref blokuotas). Earnings (5%)
  //   LIEKA tik wager mačuose (creditReferrers) — nemokamas mačas jokio uždarbio negeneruoja.
  private _bindReferrals() {
    try {
      if (!ReferralStore.referralEnabled()) return;
      let a1 = this._addrOf.p1, a2 = this._addrOf.p2;
      if (this.escrow.active) { const mi = this.escrow.matchInfo(); if (mi.p1.addr) a1 = mi.p1.addr; if (mi.p2.addr) a2 = mi.p2.addr; }
      if (ReferralStore.isAddr(a1)) { void ReferralStore.bind(a1, this._refOf.p1); void ReferralStore.markSeen(a1); }
      if (ReferralStore.isAddr(a2)) { void ReferralStore.bind(a2, this._refOf.p2); void ReferralStore.markSeen(a2); }
    } catch (e: any) { console.warn("[BLOCKS REFERRAL] bind fail:", e?.message); }
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
      // 🤖 vsAI: payout nėra — fiksuojam fee kaip treasury cut (pot=tier=fee), kad dashboard nerodytų fiktyvaus prizo.
      if (this.vsAI) {
        const fee = this.escrow.active ? this.escrow.tier : 0;
        const mi2 = this.escrow.active ? this.escrow.matchInfo() : null;
        MatchLog.record({
          ts: Date.now(), roomId: this.roomId, wager: this.escrow.active,
          tier: fee, pot: fee,
          p1Name, p2Name: p2Name || this._aiCfgOf.p2.name,
          p1Addr: mi2 ? mi2.p1.addr : this._addrOf.p1, p1Tx: mi2 ? mi2.p1.tx : "",
          p2Addr: "", p2Tx: "",
          winner: winner || "draw", winnerAddr: winner === "p1" ? this._addrOf.p1 : "", loserAddr: winner === "p2" ? this._addrOf.p1 : "",
          prize: 0, treasuryCut: fee,
          result: winner ? "settled" : "draw",
        });
        return;
      }
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
    // 🛟 08-20 (rasta simuliacija): fazę uždarom PIRMA, tik tada grąžinam pinigus.
    //    BUVO: `await this._refundBoth()` ĖJO PIRMAS, o jis daro on-chain verify su pakartojimais
    //    (~15+ s, o RPC gedimo metu ir ilgiau). Visą tą laiką fazė likdavo „staking", tad
    //    ką tik atšauktas mačas dar galėdavo PRASIDĖTI, jei per tą langą atkeliaudavo antro
    //    žaidėjo statymas. Simuliacija (scenarijus C) tai atkartojo: po `stake_cancel` fazė
    //    liko „staking" ir mačas vis tiek startavo. Dabar langas uždaromas iš karto.
    const _wasPhase = this.state.phase;
    if (this.state.phase !== "over") { this.state.phase = "lobby"; this._relist("mačas nutrūko — šeimininkas vėl laukia"); }
    this._aborting = true;
    if (_wasPhase === "staking") console.log(`[BLOCKS WAGER] abort (${reason}) — statymo langas uždarytas IŠ KARTO, refundai vykdomi toliau`);
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
    this.autoDispose = true;   // 📱 grace baigėsi — kambarys vėl gali užsidaryti normaliai
    if (this.clients.length === 0) setTimeout(() => { try { void this.disconnect(); } catch (_) {} }, 1500);
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
    // 🤖 vsAI: mačas ĮVYKO → fee sunaudotas (markSettled jau _end'e), tik pritaikom rank jei dar ne;
    //   mačas NEĮVYKO (išėjo prieš startą) → grąžinam 25 RONKE fee (verify-then-refund, neaišku → manual eilė).
    if (this.vsAI) {
      if (this.escrow.active && !this.escrow.settled) {
        const n = await this.escrow.refundEntry("p1");
        if (n) console.log(`[BLOCKS vsAI] room disposed prieš mačą → fee ${this.escrow.tier} RONKE grąžintas`);
      }
      // mačas baigėsi, bet fee fono verify nespėjo (kambarys užsidaro) → PASKUTINIS verify čia,
      // kad sąžiningo žaidėjo ★ nedingtų vien dėl to, kad jis greitai uždarė žaidimą.
      if (this._winnerSide !== null && this.escrow.active && !this._feeDone) {
        try { this._feeOk = await this.escrow.verifySide("p1"); } catch (_) { /* RPC */ }
        this._feeDone = true;
      }
      this._applyRankVsAiIfReady();
      return;
    }
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
