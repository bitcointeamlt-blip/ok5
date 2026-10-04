/**
 * 💥 SHAMAN SPLASH — F9PvpRoom._shamanSplash testas (2026-10-04).
 *   npm run build && node _shamansplash.test.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { F9PvpRoom } = require("./build/rooms/F9PvpRoom.js");
const { F9State, F9Unit } = require("./build/schema/F9State.js");
let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✅" : "🔴"} ${m}`); if (!c) fail++; };

function mkRoom(units) {
  const r = new F9PvpRoom();
  r.setState(new F9State());
  r.broadcast = () => {};
  for (const [id, team, x, y, hp = 10] of units) {
    const u = new F9Unit(); Object.assign(u, { id, team, x, y, hp, maxHp: 10, alive: true, utype: "skull" });
    r.state.units.set(id, u);
  }
  return r;
}
const hp = (r) => Object.fromEntries([...r.state.units.values()].map((u) => [u.id, u.hp]));

console.log("1) 8 kaimynai + toli esantis + savas");
let r = mkRoom([["T", 1, 10, 10], ["n1", 1, 10, 9], ["n2", 1, 10, 11], ["n3", 1, 9, 10], ["n4", 1, 11, 10],
  ["d1", 1, 9.05, 9.05], ["d2", 1, 11, 9], ["d3", 1, 9, 11], ["d4", 1, 11, 11], ["far", 1, 12.2, 10], ["mine", 0, 9.5, 10.2]]);
r._shamanSplash(10, 10, "T", 0, undefined);
let h = hp(r);
ok(h.T === 10, "pagrindinis taikinys bangos NEgauna (jau gavo įprastą dmg)");
ok(Object.entries(h).filter(([k, v]) => k !== "mine" && v === 9).length === 4, "lygiai 4 priešai gavo -1");
ok(h.n1 === 9 && h.n2 === 9 && h.n3 === 9 && h.n4 === 9 && h.d1 === 10 && h.d2 === 10, "pirmiausia tiesiai šalia (1.0), įstrižai (1.34+) lieka");
ok(h.far === 10, "2.2 celės atstumu — nekliudytas");
ok(h.mine === 10, "šaulio komandos unitas — nekliudytas");

console.log("2) FFA: kitos komandos (2,3) irgi gauna");
r = mkRoom([["a", 2, 10.5, 10], ["b", 3, 10, 10.8], ["own", 0, 10, 10]]);
r._shamanSplash(10, 10, "x", 0, undefined); h = hp(r);
ok(h.a === 9 && h.b === 9 && h.own === 10, "team 2 ir 3 po -1, team 0 sveikas");

console.log("3) 1 HP kaimynas miršta");
r = mkRoom([["w", 1, 11, 11, 1]]);
r._shamanSplash(10, 10, "x", 0, undefined);
ok(r.state.units.get("w").alive === false, "alive=false");

console.log("4) STATINIS: shaman šūvio callback kviečia bangą ir per miss");
const SRC = require("fs").readFileSync("./src/rooms/F9PvpRoom.ts", "utf8");
ok(/if \(Math\.random\(\) < MISS_CHANCE\) this\.broadcast\("miss"[\s\S]{0,200}?else this\._dealDmg\(t2[\s\S]{0,80}?if \(isShaman\) this\._shamanSplash\(bx, by, t2\.id, atkTeam/.test(SRC), "ranged callback → _shamanSplash");

console.log(fail ? `\n🔴 TESTAS KRITO (${fail})` : "\n✅ VISI TESTAI ŽALI");
process.exit(fail ? 1 : 0);
