/* 🎖️🛟 TETRIS XP: DB klaida nebegali nei PRARYTI, nei IŠTRINTI pool'o (2026-09-20).
 *
 *   Skundas: „sužaidė teterį, o XP neatsiranda" ir „asmeninis pool'as dingo".
 *   Šaknis: `RankStore` read-modify-write netikrino NEI skaitymo, NEI rašymo klaidos:
 *     • skaitymas krito ⇒ atrodė kaip „eilutės nėra" ⇒ upsert PERRAŠYDAVO sukauptą pool'ą
 *       vieno mačo prieaugiu (tikras duomenų praradimas);
 *     • rašymas krito ⇒ funkcija grąžindavo naują sumą, t. y. melavo, kad įrašė.
 *
 *   T1  normalus kelias: pool auga
 *   T2  🔴 REGRESIJA: skaitymas krinta → SENAS pool'as NEPERRAŠOMAS (anksčiau 500 → 7)
 *   T3  skaitymas atsigauna po pirmo bandymo → įrašoma teisingai (500 + 7)
 *   T4  rašymas krinta visam laikui → grąžina null (NEMELUOJA) ir prieaugis lieka eilėje
 *   T5  eilė atsigavus atkartoja prieaugį — XP neprarastas
 *   T6  xpUnitsGet prie skaitymo klaidos NIEKO nerašo (UI parodys 0, bet DB nesugadinta)
 *   T7  xpAssign prie skaitymo klaidos NERAŠO nulių ant unito XP
 *   T8  tetrisAdd naudoja tą patį patvarų kelią
 *
 * Be tinklo ir DB: `@supabase/supabase-js` pakeičiamas stub'u. Pirma `npx tsc`.
 * Paleidimas: node _xpdurable.test.mjs   (~10 s dėl tikrų retry pauzių)
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ── Supabase stub'as: valdom, kada skaitymas/rašymas krinta ───────────────────
const DB = new Map();                 // ronin_address → buildings
let failRead = 0, failWrite = 0;      // kiek KITŲ operacijų turi kristi (-1 = visada)
let reads = 0, writes = 0;
const _take = (n) => (n === -1 ? true : n > 0);
const _dec = (which) => { if (which === "r" && failRead > 0) failRead--; if (which === "w" && failWrite > 0) failWrite--; };

const fakeClient = {
  from() {
    const q = {
      _key: null,
      select() { return q; },
      eq(_c, v) { q._key = v; return q; },
      async maybeSingle() {
        reads++;
        if (_take(failRead)) { _dec("r"); return { data: null, error: { message: "simulated read outage" } }; }
        const b = DB.get(q._key);
        return { data: b ? { buildings: b } : null, error: null };
      },
      async upsert(row) {
        writes++;
        if (_take(failWrite)) { _dec("w"); return { error: { message: "simulated write outage" } }; }
        DB.set(row.ronin_address, row.buildings);
        return { error: null };
      },
    };
    return q;
  },
};
const sjs = require("@supabase/supabase-js");
sjs.createClient = () => fakeClient;
process.env.SUPABASE_URL = "http://stub.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-key";

const RankStore = require("./build/blocks/RankStore.js");

let fails = 0;
const check = (name, cond, extra) => {
  console.log((cond ? "  PASS " : "  FAIL ") + name + (cond ? "" : "  -> " + JSON.stringify(extra)));
  if (!cond) fails++;
};
const W = "0x1111111111111111111111111111111111111111";
const KEY = "xpunits_" + W;
const pool = () => (DB.get(KEY) || {}).pool;
const reset = () => { failRead = 0; failWrite = 0; reads = 0; writes = 0; };

console.log("🎖️🛟 Tetris XP patvarumas\n");

// ── T1 ───────────────────────────────────────────────────────────────────────
reset();
let r = await RankStore.xpPoolAdd(W, 500);
check("T1 pirmas priskaitymas sukuria pool'ą", r === 500 && pool() === 500, { r, pool: pool() });
r = await RankStore.xpPoolAdd(W, 12);
check("T1 antras prisideda, o ne perrašo", r === 512 && pool() === 512, { r, pool: pool() });

// ── T2 + T3: skaitymo triktis ────────────────────────────────────────────────
reset();
failRead = 1;                                   // krinta TIK pirmas skaitymas
r = await RankStore.xpPoolAdd(W, 7);
check("T3 po pakartojimo įrašoma teisinga suma", r === 519 && pool() === 519, { r, pool: pool() });
check("T2 🔴 senas pool'as NEBUVO perrašytas (nėra 7)", pool() !== 7, { pool: pool() });
check("T3 buvo bent 2 skaitymai (retry veikė)", reads >= 2, { reads });

// ── T4: rašymas krinta visam laikui ──────────────────────────────────────────
reset();
const before = pool();
failWrite = -1;
r = await RankStore.xpPoolAdd(W, 33);
check("T4 grąžina null, o ne melagingą sumą", r === null, { r });
check("T4 pool'as nepasikeitė", pool() === before, { pool: pool(), before });
check("T4 prieaugis padėtas į kartojimo eilę", RankStore.xpPendingCount() === 1, RankStore.xpPendingCount());

// ── T5: eilė atsigavus ───────────────────────────────────────────────────────
failWrite = 0;
await RankStore.xpPendingFlushNow();
check("T5 atkartota po atsigavimo (+33)", pool() === before + 33, { pool: pool(), laukta: before + 33 });
check("T5 eilė tuščia", RankStore.xpPendingCount() === 0, RankStore.xpPendingCount());

// ── T6: getter prie skaitymo klaidos nieko nerašo ────────────────────────────
reset();
const snapshot = pool();
failRead = -1;
const got = await RankStore.xpUnitsGet(W);
check("T6 grąžina 0 (nežinoma), bet DB NEPALIESTA", got.pool === 0 && pool() === snapshot && writes === 0, { got, pool: pool(), writes });

// ── T7: xpAssign prie skaitymo klaidos nenulina unito ────────────────────────
reset();
failRead = -1;
const asg = await RankStore.xpAssign(W, "4863");
check("T7 assign atsisako ir NERAŠO", asg.ok === false && writes === 0, { asg, writes });
reset();
const asg2 = await RankStore.xpAssign(W, "4863");
check("T7 sveikas kelias vis dar veikia", asg2.ok === true && asg2.unitXp === snapshot && pool() === 0, { asg2, pool: pool() });

// ── T8: tetrisAdd ────────────────────────────────────────────────────────────
reset();
const TK = "tetris_" + W;
await RankStore.tetrisAdd(W, 3);
failRead = 1;
const n = await RankStore.tetrisAdd(W, 2);
check("T8 tetrisų skaitiklis irgi nepersirašo", n === 5 && (DB.get(TK) || {}).n === 5, { n, db: DB.get(TK) });

console.log("\n" + (fails ? "❌ FAIL: " + fails : "✅ visi testai praėjo"));
process.exit(fails ? 1 : 0);
