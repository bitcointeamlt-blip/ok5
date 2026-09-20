/* 🛡💸 DVIGUBAS 25 RONKE MOKĖJIMAS vs AI (2026-09-20).
 *
 *   Žaidėjas: „vs ai if you click play it doubles or triples the transaction but not play".
 *   Grandinėje patvirtinta (0xc7ce068c…): 09:40:35, 09:40:45, 09:40:47 UTC — 3×25 RONKE per 12 s,
 *   o vienintelis startavęs mačas krito `prep_not_ready`. Nei `_doAiRanked`, nei `_doStake`
 *   neturėjo jokio užrakto.
 *
 *   F1  pakartotinis `stake_now` kol piniginė dar neatsakė → mokama TIK vieną kartą
 *   F2  tas pats fee per 25 s po apmokėjimo → antro mokėjimo NĖRA (tikrasis 09:40 atvejis)
 *   F3  praėjus langui kitas mačas apmokamas normaliai (sargas neužrakina žaidimo)
 *   F4  kita pakopa/kita rūšis NEBLOKUOJAMA (PvP statymas po vsAI fee)
 *   F5  piniginės atmetimas (`pay` reject) atlaisvina sargą ir atšaukia mačą — anksčiau kabodavo
 *   F6  vs AI mygtukas: 3 paspaudimai iš eilės → TIK vienas kambarys serveriui
 *   F7  grįžus į lobį mygtukas vėl laisvas
 *
 * Testuojam TIKRĄ kodą: funkcijos ištraukiamos iš `public/lenta/blocks_lobby_client.js`.
 * Paleidimas: node _feeguard.test.mjs
 */
import { readFileSync } from "fs";

const SRC = readFileSync(new URL("../public/lenta/blocks_lobby_client.js", import.meta.url), "utf8");
const cut = (fromTxt, toTxt, label) => {
  const a = SRC.indexOf(fromTxt), b = SRC.indexOf(toTxt);
  if (a < 0 || b < 0 || b <= a) throw new Error("neradau bloko: " + label + " (" + a + "," + b + ")");
  return SRC.slice(a, b);
};
const stakeSrc = cut("  var _stakeBusy = false", "  // 🟣 Solana host", "_doStake");
const aiSrc = cut("  var _aiStartedAt = 0;", "  // JOIN: jei wager", "_doAiRanked");

let fails = 0;
const check = (name, cond, extra) => {
  console.log((cond ? "  PASS " : "  FAIL ") + name + (cond ? "" : "  -> " + JSON.stringify(extra)));
  if (!cond) fails++;
};

/* Smėlio dėžė: stubai viskam, ko funkcijos siekia per closure. `payCtl` valdo piniginės pažadą. */
function sandbox() {
  const state = { pays: [], cmds: [], status: [], resolvers: [], now: 1000000 };
  const harness = new Function("state", `
    var _stakeBusyOuter;
    function _wager() { return true; }
    function _status(t) { state.status.push(String(t)); }
    function _esc(t) { return String(t); }
    function _alarm() {}
    function _myRef() { return null; }
    function _walletAddr() { return "0xabc"; }
    function _ensureWallet(cb) { cb(); }
    function _ensureGame() {}
    function _cmd(kind) { state.cmds.push(kind); }
    var _aiPlayFlag = false, _bgActive = false, _myRole = "", _podClaimedMatch = false;
    var window = { BlocksWager: {
      address: function () { return "0xabc"; },
      payExact: function (t) { return mkPay("ai", t); },
      payEntry: function (t) { return mkPay("pvp", t); },
    } };
    var console = { warn: function () {}, log: function () {} };
    function mkPay(kind, tier) {
      state.pays.push(kind + ":" + tier);
      return new Promise(function (res, rej) { state.resolvers.push({ res: res, rej: rej }); });
    }
    ${stakeSrc}
    ${aiSrc}
    return {
      doStake: _doStake,
      doAi: _doAiRanked,
      lobbyReset: function () { _aiStartedAt = 0; },
      warp: function (ms) { _stakePaidAt -= ms; },
    };
  `)(state);
  return { state, ...harness };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

console.log("🛡💸 vs AI fee — dvigubo mokėjimo sargas\n");

// ── F1: kol piniginė neatsakė ────────────────────────────────────────────
{
  const h = sandbox();
  h.doStake(25, true);
  h.doStake(25, true);
  h.doStake(25, true);
  check("F1 trys stake_now kol laukiam piniginės → 1 mokėjimas", h.state.pays.length === 1, h.state.pays);
}

// ── F2: tikrasis 09:40 atvejis ───────────────────────────────────────────
{
  const h = sandbox();
  h.doStake(25, true);
  h.state.resolvers[0].res({ ok: true, tx: "0xaa" });
  await tick();
  h.doStake(25, true);          // +10 s realybėje
  h.doStake(25, true);          // +12 s realybėje
  await tick();
  check("F2 po apmokėjimo dar du paspaudimai → vis tiek 1 mokėjimas", h.state.pays.length === 1, h.state.pays);
  check("F2 žaidėjui pasakoma, kad jau sumokėta", h.state.status.some((t) => /Already paid/.test(t)), h.state.status);
}

// ── F3 + F4: sargas neblokuoja gyvo žaidimo ──────────────────────────────
{
  const h = sandbox();
  h.doStake(25, true);
  h.state.resolvers[0].res({ ok: true, tx: "0xaa" }); await tick();
  h.warp(30000);                 // praėjo 30 s → kitas mačas
  h.doStake(25, true);
  check("F3 po 25 s lango kitas mačas apmokamas", h.state.pays.length === 2, h.state.pays);

  const g = sandbox();
  g.doStake(25, true);
  g.state.resolvers[0].res({ ok: true, tx: "0xaa" }); await tick();
  g.doStake(69, false);          // PvP statymas — kita pakopa
  check("F4 kita pakopa neblokuojama", g.state.pays.length === 2, g.state.pays);
}

// ── F5: piniginės atmetimas ──────────────────────────────────────────────
{
  const h = sandbox();
  h.doStake(25, true);
  h.state.resolvers[0].rej(new Error("user rejected"));
  await tick(); await tick();
  check("F5 atmetus mačas atšaukiamas", h.state.cmds.includes("stakecancel"), h.state.cmds);
  h.doStake(25, true);
  check("F5 sargas atsilaisvino (galima bandyti iš naujo)", h.state.pays.length === 2, h.state.pays);
}

// ── F6 + F7: vs AI mygtukas ──────────────────────────────────────────────
{
  const h = sandbox();
  h.doAi(); h.doAi(); h.doAi();
  const aiCmds = h.state.cmds.filter((c) => c === "ai");
  check("F6 trys paspaudimai → 1 kambarys serveriui", aiCmds.length === 1, h.state.cmds);
  h.lobbyReset();
  h.doAi();
  check("F7 grįžus į lobį mygtukas vėl veikia", h.state.cmds.filter((c) => c === "ai").length === 2, h.state.cmds);
}

console.log("\n" + (fails ? "❌ FAIL: " + fails : "✅ visi testai praėjo"));
process.exit(fails ? 1 : 0);
