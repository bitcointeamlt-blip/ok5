/* 🪽❌ BALL (F12) ŽAIDIME BLESS NEBEGALIOJA — 100% mirtis (user 2026-09-20:
 *   „padaryk kad bless negaliotų išvis pewpew žaidime · kad ten 100% mirtis būtų, uždėtas bless ar ne").
 *   Pilies PvP pusė — „išlaikyk taip kaip yra dabar, nieko nekeisk".
 *
 *   B1  klientas nebeskaito `savedTokenIds` ir nebepiešia „DEATH SHIELD SAVED"
 *   B2  edge fn `submit-battle-result` nebeturi jokio skydo kodo (`#blessprot`, savedIds, shieldsBurned)
 *   B3  degina VISUS žuvusius (`deadIds`), ne poaibį
 *   B4  PvP NEPALIESTA: `F9PvpRoom.ts` ir `BlessShield.ts` byte-identiški `origin/main`
 *   B5  `index.html` ?v= pabumpintas (kitaip naršyklė ims seną klientą)
 *
 * Paleidimas: node _ballnobless.test.mjs
 */
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

const R = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const F12 = R("../public/lenta/floor12_merge.js");
const HTML = R("../public/lenta/index.html");
/* Edge funkcija gyvena UŽ repo ribų (deploy'inama ranka per Supabase), todėl kelias absoliutus. */
const EDGE_PATH = "C:/Users/p3p3l/Downloads/lenta/supabase/functions/submit-battle-result/index.ts";
let EDGE = "";
try { EDGE = readFileSync(EDGE_PATH, "utf8"); } catch (_) { EDGE = null; }

let fails = 0;
const check = (name, cond, extra) => {
  console.log((cond ? "  PASS " : "  FAIL ") + name + (cond ? "" : "  -> " + JSON.stringify(extra)));
  if (!cond) fails++;
};

console.log("🪽❌ Ball žaidimas be BLESS (100% mirtis)\n");

// ── B1: klientas ──────────────────────────────────────────────────────────
check("B1 nebeskaito resp.savedTokenIds", !/resp\.savedTokenIds/.test(F12));
check("B1 nėra blessSaved kintamojo", !/blessSaved/.test(F12));
check("B1 nėra „DEATH SHIELD SAVED“ ekrano", !/DEATH SHIELD SAVED/.test(F12));
check("B1 nėra „Shield consumed“", !/Shield consumed/.test(F12));
check("B1 settle vis dar rodo sudegintus", /dead: actuallyBurned,/.test(F12));
check("B1 paaiškinta, kodėl nebeskaitom", /BLESS NEBEGALIOJA/.test(F12));

// ── B2 + B3: edge funkcija ────────────────────────────────────────────────
if (EDGE === null) {
  check("B2 edge fn failas randamas", false, EDGE_PATH);
} else {
  check("B2 nėra #blessprot eilutės skaitymo", !/blessprot/.test(EDGE));
  check("B2 nėra savedIds / shieldsBurned", !/savedIds|shieldsBurned|shieldsToBurn/.test(EDGE));
  check("B2 nėra savedTokenIds atsakyme", !/savedTokenIds/.test(EDGE));
  check("B2 nebeliko 503 „Shield check unavailable“", !/Shield check unavailable/.test(EDGE));
  check("B2 nebeliko burnIds poaibio", !/burnIds/.test(EDGE));

  check("B3 burn sąlyga per deadIds", /if \(deadIds\.length > 0\) \{/.test(EDGE));
  check("B3 burnAuthorized gauna deadIds", /deadIds\.map\(t => BigInt\(t\)\),/.test(EDGE));
  check("B3 sesijos istorija rašo deadIds", /dead_token_ids: deadIds,/.test(EDGE));
  check("B3 atsakyme burnedTokenIds = deadIds", /burnedTokenIds: deadIds,/.test(EDGE));
  /* Mirčių šaltinis nesikeičia: klientas + serveryje užfiksuotos (`register-death`/checkpoint) —
     kitaip reload'as leistų pabėgti nuo mirties. */
  check("B3 deadIds vis dar = klientas ∪ serveris",
    /_clientDead, \.\.\._registeredDead/.test(EDGE));
}

// ── B4: PvP nepaliesta ────────────────────────────────────────────────────
{
  const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  let changed = [];
  try {
    changed = execFileSync("git", ["diff", "--name-only", "origin/main"], { cwd: root, encoding: "utf8" })
      .split(/\r?\n/).filter(Boolean);
  } catch (e) { changed = ["<git klaida: " + String(e).slice(0, 80) + ">"]; }
  const pvp = changed.filter((f) => /F9PvpRoom|BlessShield|BlessBank|f9_pvp_live|colyseus-server\/src/.test(f));
  check("B4 jokių PvP/serverio pakeitimų", pvp.length === 0, pvp);
  const allowed = changed.every((f) => f === "public/lenta/floor12_merge.js" || f === "public/lenta/index.html");
  check("B4 keisti tik 2 ball failai", allowed, changed);
}

// ── B5: cache-bust ────────────────────────────────────────────────────────
check("B5 index.html rodo į naują floor12_merge.js versiją",
  /floor12_merge\.js\?v=f12_nobless_20260920/.test(HTML));
check("B5 senos versijos nebeliko",
  !/floor12_merge\.js\?v=f12_rotfreeze_20260823/.test(HTML));

console.log("\n" + (fails ? "❌ FAIL: " + fails : "✅ visi testai praėjo"));
process.exit(fails ? 1 : 0);
