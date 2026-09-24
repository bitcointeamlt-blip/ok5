/* ✍️🔁 BEGALINĖ „SIGN" KILPA — parašų baseinas užsikimšdavo pasibaigusiais (2026-09-24).
 *
 *   Žaidėjas: „duty paspaudžiu, geltona knopkė, paspaudžiu — išmeta piniginę, bet nekonektina;
 *   kai SIGN spaudžiu, sumirksi ir vėl prašo SIGN."
 *   Šaknis: `MAX_POOL = 24`, o pasibaigę parašai iš baseino NIEKADA nebuvo šalinami. Gyvas atvejis
 *   (`0xdc35…999F`): 24 parašai, iš jų **20 pasibaigę**, 4 galiojantys.
 *     • `burnAuthAdd` ties `row.auths.length >= MAX_POOL` darydavo `break` ⇒ naujas parašas NEĮRAŠOMAS;
 *     • `_write` darė `slice(0, MAX_POOL)` ⇒ paliekami SENIAUSI, iškrenta būtent naujas;
 *     • `burnAuthCount` skaičiuoja tik galiojančius ⇒ `have` nepasikeičia ⇒ klientas prašo vėl.
 *   Rezultatas: DUTY ir raidas užrakinti NEGRĮŽTAMAI — pasirašyti fiziškai neįmanoma.
 *
 *   B1  pasibaigę parašai nebeatiduodami skaitant
 *   B2  🔴 REGRESIJA: pilnas baseinas su pasibaigusiais — NAUJAS parašas ĮSIRAŠO
 *   B3  baseinas pilnas GALIOJANČIŲ — naujas vis tiek telpa (išstumia seniausią), kilpos nebėra
 *   B4  dublis (tas pats nonce) neįrašomas antrą kartą
 *   B5  `burnAuthUncovered` po pasirašymo nebereikalauja parašo tiems patiems tokenams
 *
 * Be tinklo: Supabase pakeistas stub'u. Pirma `npm run build`.
 * Paleidimas: node _burnauthpool.test.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

let ROW = null;   // f9_bases eilutė `<addr>#burnauth`
const sjs = require("@supabase/supabase-js");
sjs.createClient = () => ({
  from() {
    const q = {
      select() { return q; }, eq() { return q; },
      async maybeSingle() { return { data: ROW ? { buildings: JSON.parse(JSON.stringify(ROW)) } : null, error: null }; },
      async upsert(r) { ROW = JSON.parse(JSON.stringify(r.buildings)); return { error: null }; },
      update(r) {
        ROW = JSON.parse(JSON.stringify(r.buildings));
        /* Tikroji grandinė: .update().eq().filter().select() — stub'as turi turėti visus narius,
           kitaip `_write` mestų klaidą ir `burnAuthAdd` grąžintų 0, nors įrašas jau būtų atliktas. */
        const chain = { eq: () => chain, filter: () => chain, select: async () => ({ data: [{ ronin_address: "x" }], error: null }) };
        return chain;
      },
      insert() { return { error: null }; },
    };
    return q;
  },
});
process.env.SUPABASE_URL = "http://stub.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";

const BA = require("./build/services/F9BurnAuth.js");

let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS " : "  FAIL ") + n + (c ? "" : " -> " + JSON.stringify(x))); if (!c) fails++; };
const ADDR = "0xdc353150e4bcbad4056e9667fdaf3db3f9a2999f";
const NOW = () => Math.floor(Date.now() / 1000);
const SIG = "0x" + "a".repeat(130);
const mk = (nonce, deadline, tokens) => ({ battleId: String(1000 + nonce), nonce: String(nonce), deadline, sig: SIG, tokens: tokens || ["477", "478"] });
const seed = (list) => { ROW = { auths: list, used: [], ver: 1 }; };

console.log("✍️🔁 Parašų baseinas\n");

// ── B1 ───────────────────────────────────────────────────────────────────
{
  seed([mk(1, NOW() - 100), mk(2, NOW() + 100000)]);
  const n = await BA.burnAuthCount(ADDR);
  check("B1 skaičiuojami tik galiojantys", n === 1, n);
}

// ── B2 (tikrasis atvejis) ────────────────────────────────────────────────
{
  const old = Array.from({ length: 20 }, (_, i) => mk(i + 1, NOW() - 5000));      // 20 pasibaigusių
  const live = Array.from({ length: 4 }, (_, i) => mk(100 + i, NOW() + 300000));  // 4 galiojantys
  seed([...old, ...live]);
  check("B2 pradinis baseinas pilnas (24)", ROW.auths.length === 24);
  const after = await BA.burnAuthAdd(ADDR, [mk(999, NOW() + 600000, ["4020", "4018"])]);
  const nonces = (ROW.auths || []).map((a) => String(a.nonce));
  check("B2 🔴 NAUJAS parašas įrašytas", nonces.includes("999"), nonces.slice(-3));
  check("B2 pasibaigusieji išvalyti", (ROW.auths || []).every((a) => a.deadline > NOW()), (ROW.auths || []).length);
  check("B2 galiojančių dabar 5", after === 5, after);
}

// ── B3 ───────────────────────────────────────────────────────────────────
{
  seed(Array.from({ length: 24 }, (_, i) => mk(i + 1, NOW() + 100000)));          // 24 GALIOJANTYS
  const after = await BA.burnAuthAdd(ADDR, [mk(777, NOW() + 600000)]);
  const nonces = (ROW.auths || []).map((a) => String(a.nonce));
  check("B3 naujas telpa ir į pilną gyvą baseiną", nonces.includes("777"), nonces.slice(-2));
  check("B3 baseinas neviršija 24", (ROW.auths || []).length <= 24, (ROW.auths || []).length);
  check("B3 išstumtas seniausias (nonce 1)", !nonces.includes("1"), nonces.slice(0, 2));
  check("B3 grąžinamas kiekis teisingas", after === 24, after);
}

// ── B4 ───────────────────────────────────────────────────────────────────
{
  seed([mk(5, NOW() + 100000)]);
  await BA.burnAuthAdd(ADDR, [mk(5, NOW() + 100000)]);
  check("B4 dublis neįrašomas", (ROW.auths || []).length === 1, ROW.auths);
}

// ── B5 ───────────────────────────────────────────────────────────────────
{
  seed([]);
  const before = await BA.burnAuthUncovered(ADDR, ["4020", "4018"]);
  check("B5 be parašų — visi tokenai nepadengti", before.length === 2, before);
  await BA.burnAuthAdd(ADDR, [mk(42, NOW() + 600000, ["4020", "4018"])]);
  const after = await BA.burnAuthUncovered(ADDR, ["4020", "4018"]);
  check("B5 pasirašius — nebereikia (kilpa nutrūksta)", after.length === 0, after);
}

console.log("\n" + (fails ? "❌ FAIL: " + fails : "✅ visi testai praėjo"));
process.exit(fails ? 1 : 0);
