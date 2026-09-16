/* 🗼📏 BOKŠTŲ TARPAS 4 — ar VISI 5 bokštai telpa į vieną sieną? (user 2026-09-16)
 * Siena y=0..23, bet praėjimai (1–4, 10–13, 19–22) užimti ⇒ statyti galima tik 0, 5–9, 14–18, 23.
 * Su senu tarpu 6 tilpdavo tik 4 bokštai — būtent dėl to ir keičiam į 4.
 *   G1  5 bokštai 0 · 5 · 9 · 14 · 18 pastatomi VISI
 *   G2  6-as atmetamas (MAX 5)
 *   G3  3 eilučių tarpas vis dar per arti
 *   G4  ant praėjimo statyti negalima (nepasikeitė)
 *   G5  su senu tarpu 6 tos pačios eilės NEBŪTŲ tilpę (regresijos įrodymas)
 * Paleidimas: node _towergap.test.mjs [ws://localhost:2567]
 */
import { Client } from "colyseus.js";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const EP = process.argv[2] || "ws://localhost:2567";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bye = async (r) => { try { await Promise.race([r.leave(), sleep(1500)]); } catch (_) {} };
const rnd = () => ("0xf5" + String(Date.now()).slice(-8) + Math.floor(Math.random() * 1e8).toString().padStart(8, "0") + "0".repeat(40)).slice(0, 42);
const deck = Array.from({ length: 12 }, (_, i) => ({ utype: "skull", level: 1, tokenId: "dev" + i }));
const ROWS = [0, 5, 9, 14, 18];

let fails = 0;
const check = (name, cond, extra) => {
  console.log((cond ? "  PASS " : "  FAIL ") + name + (cond ? "" : "  -> " + JSON.stringify(extra)));
  if (!cond) fails++;
};
async function seed(addr, bones) {
  await sb.from("f9_bases").upsert({ ronin_address: addr, buildings: { wallLevel: 1, towerLevel: 1, towers: [], injured: [], deadUnits: [], dutyMode: "safe", minePot: 0, cemTick: Date.now() } }, { onConflict: "ronin_address" });
  await sb.from("f9_bases").upsert({ ronin_address: addr + "#bones", buildings: { bones, pending: null } }, { onConflict: "ronin_address" });
}
async function cleanup(addr) {
  for (const k of ["", "#bones", "#bak", "#minelog"]) { try { await sb.from("f9_bases").delete().eq("ronin_address", addr + k); } catch (_) {} }
}
async function joinHome(addr) {
  const room = await new Client(EP).create("f9_pvp_room", { home: true, owner: addr, address: addr, name: "gap-test", deck });
  const msgs = { built: [], fail: [] };
  room.onMessage("tower_built", (e) => msgs.built.push(e));
  room.onMessage("tower_build_fail", (e) => msgs.fail.push(e));
  room.onMessage("*", () => {});
  await sleep(2600);
  return { room, msgs };
}
const wallTowers = (room) => { let n = 0; room.state.walls.forEach((w) => { if (w.tower) n++; }); return n; };

try {
  console.log("endpoint:", EP);
  const addr = rnd();
  await seed(addr, 600);
  const { room, msgs } = await joinHome(addr);
  try {
    for (const y of ROWS) {
      const before = msgs.built.length;
      room.send("build_tower", { y });
      for (let k = 0; k < 40 && msgs.built.length === before; k++) await sleep(250);
    }
    const builtRows = msgs.built.map((e) => e.y).sort((a, b) => a - b);
    check("G1 visi 5 bokštai (0·5·9·14·18) pastatyti", JSON.stringify(builtRows) === JSON.stringify(ROWS), { builtRows, fail: msgs.fail });
    check("G1 sienoje 5 bokštai", wallTowers(room) === 5, wallTowers(room));

    msgs.fail.length = 0;
    room.send("build_tower", { y: 23 });           // 6-as: tarpas OK, bet MAX 5
    await sleep(2000);
    check("G2 6-as atmestas (max 5)", msgs.fail.some((f) => f.reason === "max"), msgs.fail);

    msgs.fail.length = 0;
    room.send("build_tower", { y: 11 });           // vidurinis praėjimas
    await sleep(2000);
    check("G4 ant praėjimo negalima", msgs.fail.some((f) => f.reason === "entrance"), msgs.fail);

    /* G5: kiek bokštų apskritai TELPA prie duoto tarpo. Skaičiuojam per VISAS statomas eilutes
     * (0, 5–9, 14–18, 23) — godus algoritmas nuo viršaus duoda maksimumą, nes eilės surikiuotos. */
    const ALLOWED = [0, 5, 6, 7, 8, 9, 14, 15, 16, 17, 18, 23];
    const fitsWith = (gap) => { let last = -99, n = 0; for (const y of ALLOWED) { if (y - last >= gap) { n++; last = y; } } return n; };
    check("G5 su senu tarpu 6 tilpdavo tik 4", fitsWith(6) === 4, fitsWith(6));
    check("G5 su nauju tarpu 4 telpa 5+", fitsWith(4) >= 5, fitsWith(4));
  } finally { await bye(room); await cleanup(addr); }

  // G3 atskirai: pilyje su VIENU bokštu (kitaip atsimuša į „max 5" prieš tarpo patikrą)
  const addr2 = rnd();
  await seed(addr2, 300);
  const r2 = await joinHome(addr2);
  try {
    r2.room.send("build_tower", { y: 5 });
    for (let k = 0; k < 40 && !r2.msgs.built.length; k++) await sleep(250);
    r2.msgs.fail.length = 0;
    r2.room.send("build_tower", { y: 7 });         // 2 eilutės nuo 5 — per arti
    await sleep(2000);
    check("G3 per arti (2 eilutės) atmesta", r2.msgs.fail.some((f) => f.reason === "tooclose" && f.gap === 4), r2.msgs.fail);
    r2.msgs.fail.length = 0;
    r2.room.send("build_tower", { y: 9 });         // lygiai 4 — leidžiama
    for (let k = 0; k < 40 && r2.msgs.built.length < 2; k++) await sleep(250);
    check("G3 lygiai 4 eilutės leidžiama", r2.msgs.built.length === 2, { built: r2.msgs.built, fail: r2.msgs.fail });
  } finally { await bye(r2.room); await cleanup(addr2); }
  console.log(fails ? `\n❌ FAILED: ${fails}` : "\n✅ ALL PASSED");
  process.exit(fails ? 1 : 0);
} catch (e) {
  console.log("\n❌ CRASH:", e?.message || e);
  process.exit(1);
}
