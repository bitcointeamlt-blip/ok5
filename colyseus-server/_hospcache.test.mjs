/* 🏥🔄 LIGONINĖS KEŠAS NEBEMELUOJA IR NEBETRINA (2026-09-21).
 *
 *   Žaidėjo pranešimas: „ką tik padariau reidą… teoriškai turėčiau turėti 10 unitų ligoninėje…
 *   bet jie visi lauke, o ligoninėje 0."
 *   Šaknis: raidas vyksta GYNĖJO kambaryje (ten sužalojimai įrašomi), o puoliko SAVO pilies kambarys
 *   turėjo prieš raidą užkrautą kopiją ir `_loadInjured` ją grąžindavo AMŽINAI — DB nebeskaitė niekada.
 *   Antra pusė: `_persistInjured` rašė `b.injured = q` aklai, tad tas pasenęs kešas galėjo raide
 *   įrašytus sužalojimus dar ir IŠTRINTI.
 *
 *   H1  pirmas užkrovimas paima eilę iš DB
 *   H2  per TTL DB nebeskaitomas (nedaužom DB kiekvienu hospital_get)
 *   H3  🔴 REGRESIJA: pasibaigus TTL kešas perkraunamas ⇒ raide įrašyti sužalojimai MATOMI
 *   H4  🔴 REGRESIJA: kambarys su tuščiu kešu NEBEIŠTRINA svetimų DB sužalojimų
 *   H5  savo išgydytus šis kambarys normaliai IŠIMA (sąjunga neužrakina eilės amžiams)
 *   H6  ką tik sužalotas tokenas laikomas „savu" — jį ištrinti galima (nedubliuojamas)
 *
 * Be tinklo: `loadBaseBuildings` / `_buildingsOp` pakeisti stub'ais. Pirma `npm run build`.
 * Paleidimas: node _hospcache.test.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const BaseStore = require("./build/services/BaseStore.js");
let DB = { injured: [], hospLevel: 1, hospStarts: [], hospDurs: [], deadUnits: [] };
let reads = 0;
BaseStore.loadBaseBuildings = async () => { reads++; return JSON.parse(JSON.stringify(DB)); };

const { F9PvpRoom } = require("./build/rooms/F9PvpRoom.js");
const { F9State } = require("./build/schema/F9State.js");

let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS " : "  FAIL ") + n + (c ? "" : " -> " + JSON.stringify(x))); if (!c) fails++; };
const ADDR = "0xaaa0000000000000000000000000000000000007";
const inj = (id) => ({ tokenId: String(id), utype: "archer", level: 1 });

function makeRoom() {
  const r = new F9PvpRoom();
  r.setState(new F9State());
  /* `_buildingsOp` tikrovėje skaito ŠVIEŽIĄ eilutę ir pritaiko mutatorių — stub'as daro tą patį. */
  r._buildingsOp = async (_a, fn) => { const b = JSON.parse(JSON.stringify(DB)); fn(b); DB = b; return true; };
  r._deadOwn = () => new Set();
  return r;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("🏥🔄 Ligoninės kešas\n");

// ── H1 + H2 ──────────────────────────────────────────────────────────────
{
  DB = { injured: [inj(101), inj(102)], hospLevel: 1, hospStarts: [Date.now()], hospDurs: [3600000], deadUnits: [] };
  reads = 0;
  const r = makeRoom();
  const q1 = await r._loadInjured(ADDR);
  check("H1 užkrauna 2 sužalotus iš DB", q1.length === 2, q1.map((e) => e.tokenId));
  check("H1 DB skaityta 1 kartą", reads === 1, reads);
  await r._loadInjured(ADDR);
  check("H2 per TTL DB nebeskaitomas", reads === 1, reads);
}

// ── H3 (esmė) ────────────────────────────────────────────────────────────
{
  DB = { injured: [], hospLevel: 1, hospStarts: [], hospDurs: [], deadUnits: [] };
  reads = 0;
  const home = makeRoom();
  const q0 = await home._loadInjured(ADDR);
  check("H3 pradžioje ligoninė tuščia", q0.length === 0);

  // … tuo metu GYNĖJO kambarys įrašo 10 sužalojimų tiesiai į DB
  DB.injured = Array.from({ length: 10 }, (_, i) => inj(200 + i));
  DB.hospStarts = [Date.now()]; DB.hospDurs = [3600000];

  home._hospAt.set(ADDR, Date.now() - 60000);          // TTL pasibaigė
  const q1 = await home._loadInjured(ADDR);
  check("H3 🔴 namų kambarys PAMATO raide įrašytus 10", q1.length === 10, q1.length);
  check("H3 DB buvo skaitytas iš naujo", reads === 2, reads);
}

// ── H4 (antra esmė) ──────────────────────────────────────────────────────
{
  DB = { injured: [], hospLevel: 1, hospStarts: [], hospDurs: [], deadUnits: [] };
  const home = makeRoom();
  await home._loadInjured(ADDR);                        // kešas: tuščia

  DB.injured = Array.from({ length: 10 }, (_, i) => inj(300 + i));   // raidas įrašė DB

  home._persistInjured(ADDR);                           // namų kambarys ką nors išsaugo
  await sleep(10);
  check("H4 🔴 svetimi 10 sužalojimų IŠLIKO DB", (DB.injured || []).length === 10, (DB.injured || []).length);
}

// ── H5 ───────────────────────────────────────────────────────────────────
{
  DB = { injured: [inj(401), inj(402), inj(403)], hospLevel: 1, hospStarts: [Date.now() - 7200000], hospDurs: [3600000], deadUnits: [] };
  const r = makeRoom();
  /* 1 lova × 1 h, startas prieš 2 h ⇒ grandinė: pirmas pasveiko prieš valandą, antras užėmė tą pačią
     lovą ir pasveiko dabar. Trečias dar gydosi. Svarbu tai, kad pasveikusieji iš DB IŠIMAMI. */
  await r._loadInjured(ADDR);
  await sleep(10);
  const ids = (DB.injured || []).map((e) => e.tokenId);
  check("H5 pasveikusieji išimti, liko paskutinis", ids.length === 1 && ids[0] === "403", ids);
}

// ── H6 ───────────────────────────────────────────────────────────────────
{
  DB = { injured: [], hospLevel: 1, hospStarts: [], hospDurs: [], deadUnits: [] };
  const r = makeRoom();
  await r._loadInjured(ADDR);
  const h = r._injured.get(ADDR);
  h.q.push(inj(501)); r._hospSee(ADDR, ["501"]);        // taip daro `_rollInjury`
  r._persistInjured(ADDR);
  await sleep(10);
  check("H6 naujas sužalojimas įrašytas", (DB.injured || []).length === 1, DB.injured);
  h.q.length = 0;                                       // šis kambarys jį išgydė
  r._persistInjured(ADDR);
  await sleep(10);
  check("H6 savo išgydytą galima išimti (nedubliuojasi)", (DB.injured || []).length === 0, DB.injured);
}

console.log("\n" + (fails ? "❌ FAIL: " + fails : "✅ visi testai praėjo"));
process.exit(fails ? 1 : 0);
