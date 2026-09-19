/* 🗼🔋 ZIP BOKŠTŲ ŠOVINIAI + UŽTAISYMAS (user 2026-09-19).
 *   A1  mūšio pradžioj bokštas pilnas (3), iššauna lygiai 3 kartus ir nutyla
 *   A2  gyvas gynėjas: užtaisymas trunka 6 s ir bėga TIK kol šalia stovi jo unitas
 *   A3  be unito šalia užtaisymas pradedamas, bet stovi (reloadWait), kol unitas atbėga
 *   A4  užtaisyti gali tik savininkas; pilno / jau taisomo / sugriauto bokšto — ne
 *   A5  savininkas offline → VISI bokštai prisipildo kartu kas 12 s, be unitų sąlygos
 *   A6  ramybė (nėra puoliko) → visi bokštai pilni, užtaisymai atšaukti
 * Logikos testas be tinklo ir DB: kambario klasė iš build/ (pirma `npx tsc`).
 * Paleidimas: node _towerammo.test.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { F9PvpRoom } = require("./build/rooms/F9PvpRoom.js");
const { F9State, F9Wall, F9Unit, F9Player } = require("./build/schema/F9State.js");

let fails = 0;
const check = (name, cond, extra) => {
  console.log((cond ? "  PASS " : "  FAIL ") + name + (cond ? "" : "  -> " + JSON.stringify(extra)));
  if (!cond) fails++;
};

function makeRoom() {
  const room = new F9PvpRoom();
  room.setState(new F9State());
  const shots = [];
  room.broadcast = (type, e) => { if (type === "zip_shot") shots.push(e); };
  room._schedule = () => {};   // žala nesvarbi — skaičiuojam tik šūvius
  room._combatEnabled = true;
  room._buildings = { towerLevel: 1 };
  room.state.phase = "playing";
  const mkWall = (y) => {
    const w = new F9Wall();
    w.x = 33; w.y = y; w.tower = true; w.alive = true; w.hp = w.maxHp = 70; w.ammo = 3;
    room.state.walls.set("33," + y, w);
    return w;
  };
  const t1 = mkWall(5), t2 = mkWall(18);
  room._walls = [t1, t2];
  const addPlayer = (sid, team) => { const p = new F9Player(); p.sessionId = sid; p.team = team; room.state.players.set(sid, p); };
  addPlayer("DEF", 1); addPlayer("ATK", 0);
  room._ownerSid = "DEF";
  const sent = { DEF: [], ATK: [] };
  const fakeClient = (sid) => ({ sessionId: sid, send: (type, e) => sent[sid].push({ type, e }) });
  room.clients.push(fakeClient("DEF"), fakeClient("ATK"));
  const addUnit = (id, team, x, y) => { const u = new F9Unit(); u.id = id; u.team = team; u.x = x; u.y = y; u.alive = true; room.state.units.set(id, u); return u; };
  const enemy1 = addUnit("e1", 0, 30, 5);    // abiejų bokštų nuotoly? t1 — taip (3 cells), t2 — ne (13)
  const enemy2 = addUnit("e2", 0, 30, 18);   // t2 nuotoly
  const guard = addUnit("g1", 1, 45, 11);    // gynėjo unitas toli nuo abiejų bokštų
  const step = (ms, dt = 33) => { for (let t = 0; t < ms; t += dt) { room._simTime += dt; room._updateTowers(); } };
  const reload = (sid, w) => { const c = room.clients.find((c) => c.sessionId === sid); room._handleTowerReload(c, { x: w.x, y: w.y }); return sent[sid].at(-1); };
  return { room, shots, t1, t2, guard, enemy1, enemy2, step, reload, sent };
}

console.log("\nA1 · pilnas bokštas iššauna 3 kartus ir nutyla");
{
  const { shots, t1, t2, step } = makeRoom();
  check("pradžioj 3 šoviniai", t1.ammo === 3 && t2.ammo === 3, { a: t1.ammo });
  step(12000);
  const s1 = shots.filter((s) => s.y === 5).length;
  check("t1 per 12 s iššovė lygiai 3", s1 === 3, { s1 });
  check("t1 tuščias", t1.ammo === 0, { a: t1.ammo });
  step(20000);
  check("tuščias bokštas nebešaudo dar 20 s", shots.filter((s) => s.y === 5).length === 3, { n: shots.length });
}

console.log("\nA2 · gynėjas užtaiso: 6 s, kol šalia jo unitas");
{
  const { t1, guard, shots, step, reload } = makeRoom();
  step(12000);
  guard.x = 34.5; guard.y = 5;   // 1,5 celės nuo t1
  const r = reload("DEF", t1);
  check("atsakymas tower_reload_ok, near=true", r && r.type === "tower_reload_ok" && r.e.near === true, r);
  check("progresas prasidėjo", t1.reload >= 1 && !t1.reloadWait, { reload: t1.reload, wait: t1.reloadWait });
  step(3000);
  check("po 3 s ~50 %", t1.reload >= 45 && t1.reload <= 55 && t1.ammo === 0, { reload: t1.reload, ammo: t1.ammo });
  step(2800);
  check("po 5,8 s dar tuščias", t1.ammo === 0, { ammo: t1.ammo, reload: t1.reload });
  const before = shots.length;
  step(300);
  // užsitaisęs bokštas IŠKART šauna į šalia stovintį priešą → 3 − 1
  check("po ~6,1 s pilnas ir vėl šauna, progresas nulis", t1.ammo === 2 && shots.length === before + 1 && t1.reload === 0, { ammo: t1.ammo, reload: t1.reload });
}

console.log("\nA3 · be unito šalia užtaisymas stovi");
{
  const { t1, guard, step, reload } = makeRoom();
  step(12000);
  const r = reload("DEF", t1);
  check("pradėtas, bet near=false", r && r.type === "tower_reload_ok" && r.e.near === false, r);
  step(10000);
  check("po 10 s be unito — vis dar tuščias, reloadWait", t1.ammo === 0 && t1.reloadWait === true && t1.reload <= 2, { ammo: t1.ammo, wait: t1.reloadWait, reload: t1.reload });
  guard.x = 34.5; guard.y = 5.5;
  step(3000);
  check("unitas atbėgo → vyksta (~50 %), nebelaukia", t1.reloadWait === false && t1.reload >= 45 && t1.ammo === 0, { r: t1.reload, w: t1.reloadWait });
  guard.x = 40;
  step(4000);
  check("unitas nuėjo → sustojo ties ~50 %", t1.reloadWait === true && t1.reload <= 55 && t1.ammo === 0, { r: t1.reload, w: t1.reloadWait });
  guard.x = 34.5;
  step(3100);
  check("grįžo → baigė (iš viso 6 s šalia) ir vėl šauna", t1.ammo === 2 && t1.reload === 0, { ammo: t1.ammo, r: t1.reload });
}

console.log("\nA4 · kas ir kada gali užtaisyti");
{
  const { room, t1, t2, guard, step, reload } = makeRoom();
  let r = reload("DEF", t1);
  check("pilno neužtaiso (full)", r && r.type === "tower_reload_fail" && r.e.reason === "full", r);
  step(12000);
  r = reload("ATK", t1);
  check("puolikas negali (not_defender)", r && r.type === "tower_reload_fail" && r.e.reason === "not_defender", r);
  guard.x = 34.5; guard.y = 5;
  reload("DEF", t1);
  r = reload("DEF", t1);
  check("antras paspaudimas taisant (reloading)", r && r.type === "tower_reload_fail" && r.e.reason === "reloading", r);
  t2.alive = false;
  r = reload("DEF", t2);
  check("sugriauto bokšto neužtaiso (no_tower)", r && r.type === "tower_reload_fail" && r.e.reason === "no_tower", r);
  room.state.phase = "ended";
  r = reload("DEF", t1);
  check("po mūšio (phase≠playing) — atmesta", r && r.type === "tower_reload_fail", r);
}

console.log("\nA5 · savininkas offline → visi kartu kas 12 s");
{
  const { room, t1, t2, shots, step } = makeRoom();
  room.clients.splice(room.clients.findIndex((c) => c.sessionId === "DEF"), 1);   // gynėjas atsijungė
  step(11000);
  check("per 11 s abu iššovė po 3 ir tušti", t1.ammo === 0 && t2.ammo === 0 && shots.length === 6, { a1: t1.ammo, a2: t2.ammo, n: shots.length });
  check("rodomas bendras progresas", t1.reload > 80 && t1.reload === t2.reload, { r1: t1.reload, r2: t2.reload });
  step(1100);
  check("ties 12 s abu vėl pilni (be unitų šalia)", t1.ammo >= 2 && t2.ammo >= 2, { a1: t1.ammo, a2: t2.ammo });
  step(23800);
  check("iki 35,9 s: pradžia + 2 pripildymai = lygiai 18 šūvių", shots.length === 18, { n: shots.length });
  step(200);
  check("ties 36 s trečias pripildymas — vėl šauna", shots.length === 20, { n: shots.length });
}

console.log("\nA6 · ramybė → visi pilni");
{
  const { room, t1, guard, step, reload } = makeRoom();
  step(12000);
  guard.x = 34.5; guard.y = 5;
  reload("DEF", t1);
  step(1000);
  room.state.players.delete("ATK");
  step(100);
  check("puolikas išėjo → pilnas, užtaisymas atšauktas", t1.ammo === 3 && t1.reload === 0 && Object.keys(room._towerReload).length === 0, { a: t1.ammo, r: t1.reload });
}

console.log(fails ? `\n🔴 KRITO: ${fails}` : "\n✅ VISI TESTAI ŽALI");
process.exit(fails ? 1 : 0);
