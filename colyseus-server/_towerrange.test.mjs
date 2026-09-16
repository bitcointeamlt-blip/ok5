/* 🗼🎯 BOKŠTŲ TARPAS 4 + NUOTOLIS −50% + NUOTOLIO UPGRADE'AI (user 2026-09-16).
 *   R1  tarpas: 4 eilutės LEIDŽIAMOS, 3 — ne (buvo 6)
 *   R2  upgrade +5% už 150🦴: lygis, nuotolis, banko nurašymas
 *   R3  6 žingsniai → +30% (4.225) ir daugiau nebeleidžia
 *   R4  nuotolio kaina įskaičiuojama į bokšto `spend` ⇒ refundas auga
 *   R5  lygis išlieka DB ir po perkrovimo (persist + savigyda)
 *   R6  be bokštų / be kaulų → atmeta, kaulai nedingsta
 * Paleidimas: node _towerrange.test.mjs [ws://localhost:2567]
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

let fails = 0;
const check = (name, cond, extra) => {
  console.log((cond ? "  PASS " : "  FAIL ") + name + (cond ? "" : "  -> " + JSON.stringify(extra)));
  if (!cond) fails++;
};
async function seed(addr, buildings, bones) {
  await sb.from("f9_bases").upsert({ ronin_address: addr, buildings }, { onConflict: "ronin_address" });
  await sb.from("f9_bases").upsert({ ronin_address: addr + "#bones", buildings: { bones, pending: null } }, { onConflict: "ronin_address" });
}
async function cleanup(addr) {
  for (const k of ["", "#bones", "#bak", "#minelog"]) { try { await sb.from("f9_bases").delete().eq("ronin_address", addr + k); } catch (_) {} }
}
const readBuildings = async (addr) => (await sb.from("f9_bases").select("buildings").eq("ronin_address", addr).maybeSingle()).data?.buildings || null;
const readBones = async (addr) => Number((await sb.from("f9_bases").select("buildings").eq("ronin_address", addr + "#bones").maybeSingle()).data?.buildings?.bones || 0);

async function joinHome(addr) {
  const room = await new Client(EP).create("f9_pvp_room", { home: true, owner: addr, address: addr, name: "range-test", deck });
  const msgs = { built: [], buildFail: [], range: [], state: null, upgFail: [] };
  room.onMessage("tower_built", (e) => msgs.built.push(e));
  room.onMessage("tower_build_fail", (e) => msgs.buildFail.push(e));
  room.onMessage("tower_range_upgraded", (e) => { msgs.range.push(e); msgs.state = e; });
  room.onMessage("tower_state", (e) => { msgs.state = e; });
  room.onMessage("upgrade_fail", (e) => msgs.upgFail.push(e));
  room.onMessage("*", () => {});
  await sleep(2600);
  return { room, msgs };
}
const BASE = { wallLevel: 1, towerLevel: 1, towers: [], injured: [], deadUnits: [], dutyMode: "safe", mineGated: false, minePot: 0, cemTick: Date.now() };

async function scenarioGap() {
  console.log("\nR1 · bokštų tarpas: 4 galima, 3 ne");
  const addr = rnd();
  await seed(addr, { ...BASE, towers: [{ y: 4, level: 1, spend: 40 }] }, 500);
  const { room, msgs } = await joinHome(addr);
  try {
    room.send("build_tower", { y: 7 });                       // 3 eilutės — per arti
    await sleep(2000);
    check("R1 3 eilutės atmesta (gap=4)", msgs.buildFail.some((f) => f.reason === "tooclose" && f.gap === 4), msgs.buildFail);
    check("R1 bokštas nepastatytas", msgs.built.length === 0, msgs.built);
    room.send("build_tower", { y: 8 });                       // 4 eilutės — leidžiama (anksčiau reikėjo 6)
    for (let k = 0; k < 40 && !msgs.built.length; k++) await sleep(250);
    check("R1 4 eilutės LEIDŽIAMOS", msgs.built.length === 1 && msgs.built[0].y === 8, { built: msgs.built, fail: msgs.buildFail });
  } finally { await bye(room); await cleanup(addr); }
}

async function scenarioRangeUpgrade() {
  console.log("\nR2-R5 · nuotolio upgrade po +5% (150🦴), iki +30%");
  const addr = rnd();
  await seed(addr, { ...BASE, towers: [{ y: 4, level: 1, spend: 40 }] }, 1000);
  const { room, msgs } = await joinHome(addr);
  try {
    room.send("tower_state_get"); await sleep(900);
    check("R2 pradžioje nuotolis 3.25, lygis 0", msgs.state?.range === 3.25 && msgs.state?.rangeLevel === 0, msgs.state);
    check("R2 kaina 150, žingsnis 5%, max 6", msgs.state?.rangeCost === 150 && msgs.state?.rangeStepPct === 5 && msgs.state?.rangeMaxLevel === 6, msgs.state);

    const bank0 = await readBones(addr);
    room.send("upgrade_tower_range");
    for (let k = 0; k < 40 && !msgs.range.length; k++) await sleep(250);
    check("R2 po 1 žingsnio lygis 1", msgs.range[0]?.level === 1, msgs.range[0]);
    check("R2 nuotolis 3.25 → 3.413 (+5%)", Math.abs((msgs.range[0]?.range || 0) - 3.413) < 0.01, msgs.range[0]?.range);
    const bank1 = await readBones(addr);
    check("R2 nurašyta lygiai 150🦴", bank0 - bank1 === 150, { bank0, bank1 });

    // R4: nuotolio kaina turi būti bokšto investicijoje → refundas 40+150 = 190 → 95
    room.send("tower_state_get"); await sleep(900);
    check("R4 refundas paaugo iki 95 (190 pusė)", msgs.state?.towers?.[0]?.refund === 95, msgs.state);

    // R3: dar 5 žingsniai → +30%
    for (let i = 0; i < 5; i++) { msgs.range.length = 0; room.send("upgrade_tower_range"); for (let k = 0; k < 40 && !msgs.range.length; k++) await sleep(250); }
    const last = msgs.range[msgs.range.length - 1];
    check("R3 po 6 žingsnių lygis 6", last?.level === 6, last);
    check("R3 nuotolis 4.225 (+30%)", Math.abs((last?.range || 0) - 4.225) < 0.01, last?.range);
    msgs.range.length = 0;
    room.send("upgrade_tower_range"); await sleep(2000);
    check("R3 7-as žingsnis neleidžiamas (max)", msgs.range.length === 1 && msgs.range[0].max === true, msgs.range);
    const bankEnd = await readBones(addr);
    check("R3 viso nurašyta 900🦴", bank0 - bankEnd === 900, { bank0, bankEnd });

    await sleep(1200);
    const b = await readBuildings(addr);
    check("R5 DB: towerRangeLevel = 6", Number(b?.towerRangeLevel) === 6, b?.towerRangeLevel);
    await bye(room);
    await sleep(1500);
    const r2 = await joinHome(addr);
    r2.room.send("tower_state_get"); await sleep(900);
    check("R5 po perkrovimo lygis išliko", r2.msgs.state?.rangeLevel === 6 && Math.abs(r2.msgs.state?.range - 4.225) < 0.01, r2.msgs.state);
    await bye(r2.room);
  } finally { await bye(room); await cleanup(addr); }
}

async function scenarioRejects() {
  console.log("\nR6 · be bokštų / be kaulų");
  const a0 = rnd(), aPoor = rnd();
  await seed(a0, { ...BASE, towers: [] }, 1000);
  await seed(aPoor, { ...BASE, towers: [{ y: 4, level: 1, spend: 40 }] }, 100);
  const r0 = await joinHome(a0), rp = await joinHome(aPoor);
  try {
    const bank0 = await readBones(a0), bankP = await readBones(aPoor);
    r0.room.send("upgrade_tower_range"); rp.room.send("upgrade_tower_range");
    await sleep(2500);
    check("R6 be bokštų → atmesta", r0.msgs.upgFail.some((f) => f.reason === "notower") && r0.msgs.range.length === 0, r0.msgs.upgFail);
    check("R6 be kaulų → atmesta", rp.msgs.upgFail.some((f) => f.reason === "bones") && rp.msgs.range.length === 0, rp.msgs.upgFail);
    check("R6 kaulai nepajudėjo", (await readBones(a0)) === bank0 && (await readBones(aPoor)) === bankP, { bank0, bankP });
  } finally { await bye(r0.room); await bye(rp.room); await cleanup(a0); await cleanup(aPoor); }
}

try {
  console.log("endpoint:", EP);
  await scenarioGap();
  await scenarioRangeUpgrade();
  await scenarioRejects();
  console.log(fails ? `\n❌ FAILED: ${fails}` : "\n✅ ALL PASSED");
  process.exit(fails ? 1 : 0);
} catch (e) {
  console.log("\n❌ CRASH:", e?.message || e);
  process.exit(1);
}
