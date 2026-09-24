/* 🟢⛏️ DUTY NEBEJUDINA 200 CIKLO (user 2026-09-20).
 *
 *   User taisyklė: „jeigu DUTY — kasi kiek nori, tave pulti gali, o SAFE ciklas NEJUDA.
 *   O kai įjungi SAFE, ciklas juda, užsipildo 200/200 ir kasimas sustoja."
 *   Nuo `eebb5fdf` (08-20) `mmined` augo ABIEM režimais — dėl to naktį DUTY pakasęs žaidėjas,
 *   grįžęs į SAFE, būdavo užrakintas iš karto, nors už DUTY jau sumokėjo tuo, kad buvo puolamas.
 *
 *   D1  🛡 SAFE: ciklas auga kartu su balansu
 *   D2  🟢 DUTY: balansas auga, o ciklas STOVI
 *   D3  DUTY → SAFE: ciklas tęsiasi nuo ten, kur buvo (DUTY „nesuvalgė" limito)
 *   D4  SAFE luba vis tiek veikia: 200 pasiekta → kasimas stoja, `gated` įsijungia
 *   D5  ciklui pilnam DUTY kasa toliau, bet skalė nebeauga ir grįžus į SAFE lieka užrakinta
 *   D6  klientas nebesako, kad DUTY režime ciklas pildosi
 *
 * Be tinklo ir DB: kambario klasė iš build/ (pirma `npm run build`).
 * Paleidimas: node _dutycycle.test.mjs
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
const require = createRequire(import.meta.url);
const { F9PvpRoom } = require("./build/rooms/F9PvpRoom.js");
const { F9State } = require("./build/schema/F9State.js");

let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS " : "  FAIL ") + n + (c ? "" : " -> " + JSON.stringify(x))); if (!c) fails++; };
const ADDR = "0xabc0000000000000000000000000000000000009";

function room(duty, mmined = 0, mpot = 0) {
  const r = new F9PvpRoom();
  r.setState(new F9State());
  r._mineRateStored = () => 60;          // 60 RONKE/h → 1 per minutę, patogu skaičiuoti
  r._mineCap = () => 100000;             // balanso backstop netrukdo
  r._pruneHosp = () => {};
  r._cem.set(ADDR, {
    pot: 0, tick: Date.now() - 3600000, power: 0, nft: 0, rv: 0, wallet: 0, ramp: 0,
    mpot, mcp: 200, mfield: 12, mres: 0, duty, gated: false, mpotSync: mpot, mmined, msync: mmined,
  });
  return r;
}
const run = (r) => { r._cemAccrue(ADDR); return r._cem.get(ADDR); };

console.log("🟢⛏️ DUTY nebejudina 200 ciklo\n");

// ── D1 ───────────────────────────────────────────────────────────────────
{
  const c = run(room("safe"));
  check("D1 SAFE: balansas auga", c.mpot > 0, c.mpot);
  check("D1 SAFE: ciklas auga kartu", Math.abs(c.mmined - c.mpot) < 0.01, { mmined: c.mmined, mpot: c.mpot });
}

// ── D2 (esmė) ────────────────────────────────────────────────────────────
{
  const c = run(room("online"));
  check("D2 DUTY: balansas auga", c.mpot >= 59, c.mpot);
  check("D2 🟢 DUTY: ciklas STOVI", c.mmined === 0, { mmined: c.mmined, mpot: c.mpot });
}

// ── D3 ───────────────────────────────────────────────────────────────────
{
  const c1 = run(room("online", 40));            // valanda DUTY su jau iškastais 40
  check("D3 DUTY nepajudino esamo ciklo", c1.mmined === 40, c1.mmined);
  const r2 = room("safe", c1.mmined);
  const c2 = run(r2);
  check("D3 grįžus į SAFE ciklas tęsiasi nuo 40", c2.mmined > 40 && c2.mmined <= 200, c2.mmined);
}

// ── D4 ───────────────────────────────────────────────────────────────────
{
  const c = run(room("safe", 190));
  check("D4 SAFE luba veikia (ne daugiau 200)", c.mmined <= 200.01, c.mmined);
  check("D4 pasiekus 200 įsijungia gated", c.gated === true, { gated: c.gated, mmined: c.mmined });
}

// ── D5 ───────────────────────────────────────────────────────────────────
{
  const c = run(room("online", 200, 500));
  check("D5 pilnam ciklui DUTY vis tiek kasa", c.mpot > 500, c.mpot);
  check("D5 skalė nebeauga virš 200", c.mmined === 200, c.mmined);
  check("D5 DUTY režime gated neįjungiamas", c.gated === false, c.gated);
  const back = run(room("safe", c.mmined, c.mpot));
  check("D5 grįžus į SAFE lieka užrakinta", back.gated === true && back.mmined === 200, { g: back.gated, m: back.mmined });
}

// ── D6: klientas ─────────────────────────────────────────────────────────
{
  const GAME = readFileSync(new URL("../public/lenta/game.js", import.meta.url), "utf8");
  check("D6 nebeliko „this cycle fills here too“", !/this cycle fills here too/.test(GAME));
  check("D6 pasakyta, kad juostelė DUTY metu stovi", /stays put<\/b> while you are on DUTY/.test(GAME));
}

console.log("\n" + (fails ? "❌ FAIL: " + fails : "✅ visi testai praėjo"));
process.exit(fails ? 1 : 0);
