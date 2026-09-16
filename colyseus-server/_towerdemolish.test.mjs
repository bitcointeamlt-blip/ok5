/* 🗼💥 ZIP BOKŠTO GRIOVIMAS + 50% KAULŲ GRĄŽINIMAS (user 2026-09-16).
 * Tikrinam ne „ar grąžina", o INVARIANTUS, dėl kurių tai galėtų tapti kaulų spausdintuvu:
 *   T1  refundas = pusė TO bokšto investicijos dalies (spend/N), žemyn apvalinant
 *   T2  bankas realiai paauga tiek pat, kiek pažadėta
 *   T3  DB: bokštas dingsta iš `buildings.towers`, `towerSpend` sumažėja ta pačia dalimi
 *   T4  🔴 PERSIJUNGUS į kambarį iš naujo bokštas NEATSIKELIA (savigyda/backup) — kitaip begalinis ciklas
 *   T5  pilnas ciklas statyba→griovimas niekada negrąžina daugiau, nei išleista (griežtai < 100%)
 *       — būtent čia pirmoji versija (bendras katilas / N) lūžo: 120🦴 išleista → 151🦴 atgal
 *   T6  upgrade'ai įskaičiuoti: L4 bokštas grąžina daugiau nei L1
 *   T7  nėra bokšto toj eilėj / svetimas adresas → jokio kredito
 * Paleidimas: node _towerdemolish.test.mjs [ws://localhost:2567]
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
  for (const k of ["", "#bones", "#bak", "#minelog"]) {
    try { await sb.from("f9_bases").delete().eq("ronin_address", addr + k); } catch (_) {}
  }
}
const readBuildings = async (addr) => (await sb.from("f9_bases").select("buildings").eq("ronin_address", addr).maybeSingle()).data?.buildings || null;
const readBones = async (addr) => Number((await sb.from("f9_bases").select("buildings").eq("ronin_address", addr + "#bones").maybeSingle()).data?.buildings?.bones || 0);

async function joinHome(addr) {
  const room = await new Client(EP).create("f9_pvp_room", { home: true, owner: addr, address: addr, name: "demolish-test", deck });
  const msgs = { demolished: [], built: [], state: null, fail: [], spent: [] };
  room.onMessage("tower_demolished", (e) => msgs.demolished.push(e));
  room.onMessage("tower_built", (e) => msgs.built.push(e));
  room.onMessage("tower_state", (e) => { msgs.state = e; });
  room.onMessage("tower_demolish_fail", (e) => msgs.fail.push(e));
  room.onMessage("bones_spent", (e) => msgs.spent.push(e));
  room.onMessage("tower_build_fail", (e) => msgs.fail.push(e));
  room.onMessage("*", () => {});
  await sleep(2600);
  return { room, msgs };
}
const wallTowers = (room) => { let n = 0; room.state.walls.forEach((w) => { if (w.tower) n++; }); return n; };

const BASE = { wallLevel: 1, towerLevel: 1, towers: [], injured: [], deadUnits: [], dutyMode: "safe", mineGated: false, minePot: 0, cemTick: Date.now() };

async function scenarioRefundMath() {
  console.log("\nT1-T4 · L4 pilis su 2 bokštais: refundas, bankas, DB, atsparumas savigydai");
  const addr = rnd();
  // 2 bokštai L4: realiai išleista 2×40 + (30+60+120) = 290 🦴 → vienam tenka 145 → refundas 72
  await seed(addr, { ...BASE, towerLevel: 4, towers: [{ y: 4, level: 4 }, { y: 18, level: 4 }] }, 500);
  const { room, msgs } = await joinHome(addr);
  try {
    room.send("tower_state_get"); await sleep(900);
    const st = msgs.state;
    check("T1 serveris pats atkuria seną investiciją (2×40 + 210 = 290)", st && st.spend === 290 && st.count === 2, st);
    const q4 = st && (st.towers || []).find((t) => t.y === 4);
    check("T1 kvotas bokstui y4 = floor(145/2) = 72", q4 && q4.refund === 72, st);

    const bankBefore = await readBones(addr);
    room.send("demolish_tower", { y: 4 });
    for (let i = 0; i < 40 && !msgs.demolished.length; i++) await sleep(250);
    const d = msgs.demolished[0];
    check("T1 nugriauta ir grąžinta 72", d && d.y === 4 && d.refund === 72, d);
    const bankAfter = await readBones(addr);
    check("T2 bankas paaugo lygiai 72", bankAfter - bankBefore === 72, { bankBefore, bankAfter });
    check("T2 sienoje liko 1 bokštas", wallTowers(room) === 1, wallTowers(room));

    await sleep(1200);
    const b = await readBuildings(addr);
    check("T3 DB: liko tik y18", Array.isArray(b?.towers) && b.towers.length === 1 && b.towers[0].y === 18, b?.towers);
    check("T3 DB: likusiam bokstui priskirta 145 (jo investicija)", Number(b?.towers?.[0]?.spend) === 145, b?.towers);
    check("T3 DB: lygis nenukrito (kiti bokštai lieka L4)", Number(b?.towerLevel) === 4, b?.towerLevel);

    await bye(room);
    await sleep(1500);
    // 🔴 Svarbiausias testas: savigyda/backup neturi prikelti nugriauto bokšto (kitaip refundą gauni amžinai)
    const r2 = await joinHome(addr);
    check("T4 po perjungimo bokštas NEATSIKĖLĖ (savigyda nepraleido)", wallTowers(r2.room) === 1, wallTowers(r2.room));
    const b2 = await readBuildings(addr);
    check("T4 DB po perkrovimo vis dar 1 bokštas", (b2?.towers || []).length === 1, b2?.towers);
    await bye(r2.room);
  } finally { await bye(room); await cleanup(addr); }
}

async function scenarioCycleNeverProfits() {
  console.log("\nT5 · ciklas statyba→griovimas: ar galima prisispausdinti kaulų?");
  const addr = rnd();
  await seed(addr, { ...BASE, towerLevel: 4, towers: [{ y: 4, level: 4 }] }, 1000);
  const { room, msgs } = await joinHome(addr);
  try {
    let spentTotal = 0, refundTotal = 0;
    const bank0 = await readBones(addr);
    for (let i = 0; i < 3; i++) {
      msgs.built.length = 0; msgs.demolished.length = 0; msgs.spent.length = 0; msgs.fail.length = 0;
      room.send("build_tower", { y: 16 });
      for (let k = 0; k < 40 && !msgs.built.length; k++) await sleep(250);
      if (msgs.fail.length) console.log("     build_fail:", JSON.stringify(msgs.fail));
      spentTotal += msgs.spent.reduce((s, e) => s + (Number(e.cost) || 0), 0);
      room.send("demolish_tower", { y: 16 });
      for (let k = 0; k < 40 && !msgs.demolished.length; k++) await sleep(250);
      refundTotal += Number(msgs.demolished[0]?.refund || 0);
    }
    const bank1 = await readBones(addr);
    console.log(`     išleista ${spentTotal}🦴 · grąžinta ${refundTotal}🦴 · bankas ${bank0} → ${bank1}`);
    check("T5 grąžinta MAŽIAU nei išleista (nėra spausdinimo)", refundTotal < spentTotal, { spentTotal, refundTotal });
    check("T5 bankas nukrito", bank1 < bank0, { bank0, bank1 });
    const b = await readBuildings(addr);
    check("T5 pradinis bokštas vietoje, laikinojo nėra", (b?.towers || []).length === 1 && b.towers[0].y === 4, b?.towers);
  } finally { await bye(room); await cleanup(addr); }
}

async function scenarioUpgradesCounted() {
  console.log("\nT6 · ar upgrade'ai įskaičiuoti (L1 vs L4 refundas)");
  const a1 = rnd(), a4 = rnd();
  await seed(a1, { ...BASE, towerLevel: 1, towers: [{ y: 4, level: 1 }] }, 300);
  await seed(a4, { ...BASE, towerLevel: 4, towers: [{ y: 4, level: 4 }] }, 300);
  const r1 = await joinHome(a1), r4 = await joinHome(a4);
  try {
    r1.room.send("demolish_tower", { y: 4 }); r4.room.send("demolish_tower", { y: 4 });
    for (let i = 0; i < 40 && (!r1.msgs.demolished.length || !r4.msgs.demolished.length); i++) await sleep(250);
    const v1 = Number(r1.msgs.demolished[0]?.refund), v4 = Number(r4.msgs.demolished[0]?.refund);
    check("T6 L1 bokštas grąžina 20 (pusė nuo 40)", v1 === 20, v1);
    check("T6 L4 bokštas grąžina 125 (pusė nuo 40+210)", v4 === 125, v4);
  } finally { await bye(r1.room); await bye(r4.room); await cleanup(a1); await cleanup(a4); }
}

async function scenarioBadInput() {
  console.log("\nT7 · tuščia eilė / nesamas bokštas");
  const addr = rnd();
  await seed(addr, { ...BASE, towerLevel: 2, towers: [{ y: 4, level: 2 }] }, 200);
  const { room, msgs } = await joinHome(addr);
  try {
    const bank0 = await readBones(addr);
    room.send("demolish_tower", { y: 9 });     // toj eilėj bokšto nėra
    room.send("demolish_tower", { y: 999 });   // už arenos ribų
    await sleep(2500);
    check("T7 abu bandymai atmesti", msgs.fail.length === 2 && msgs.fail.every((f) => f.reason === "notower"), msgs.fail);
    check("T7 jokio kredito", (await readBones(addr)) === bank0, bank0);
    check("T7 bokštas vietoje", wallTowers(room) === 1, wallTowers(room));
  } finally { await bye(room); await cleanup(addr); }
}

async function scenarioUpgradeSplit() {
  console.log("\nT8 · upgrade po statybos: kaina dalinasi tarp bokštų, naujas bokštas nepaveldi svetimų investicijų");
  const addr = rnd();
  await seed(addr, { ...BASE, towerLevel: 1, towers: [{ y: 4, level: 1, spend: 40 }] }, 600);
  const { room, msgs } = await joinHome(addr);
  try {
    room.send("build_tower", { y: 16 });                    // antras bokštas: 40🦴
    for (let k = 0; k < 40 && !msgs.built.length; k++) await sleep(250);
    room.send("upgrade_towers");                            // L2 = 30🦴 abiem → po 15 kiekvienam
    await sleep(2500);
    room.send("tower_state_get"); await sleep(900);
    const st = msgs.state;
    const q = (y) => (st?.towers || []).find((t) => t.y === y)?.refund;
    check("T8 abu bokštai po 55🦴 investicijos → refundas 27", q(4) === 27 && q(16) === 27, st);
    check("T8 bendra investicija 110 (40+40+30)", st && st.spend === 110, st);
    /* Nugriautas ir PERSTATYTAS bokštas kainuoja 40, o lygį paveldi VELTUI → grąžinti gali tik 20.
     * Kitaip ciklas „perstatau ir vėl nugriaunu" po truputį ištrauktų senus upgrade'us. */
    msgs.demolished.length = 0; msgs.built.length = 0; msgs.fail.length = 0;
    room.send("demolish_tower", { y: 16 });
    for (let k = 0; k < 40 && !msgs.demolished.length; k++) await sleep(250);
    check("T8 nugriautas grąžina 27 (savo 55 pusę)", Number(msgs.demolished[0]?.refund) === 27, msgs.demolished[0]);
    room.send("build_tower", { y: 16 });
    for (let k = 0; k < 40 && !msgs.built.length; k++) await sleep(250);
    if (msgs.fail.length) console.log("     build_fail:", JSON.stringify(msgs.fail));
    room.send("tower_state_get"); await sleep(900);
    const qRe = (msgs.state?.towers || []).find((t) => t.y === 16)?.refund;
    check("T8 perstatytas (L2 gautas veltui) grąžina tik 20", qRe === 20, msgs.state);
  } finally { await bye(room); await cleanup(addr); }
}

try {
  console.log("endpoint:", EP);
  await scenarioRefundMath();
  await scenarioCycleNeverProfits();
  await scenarioUpgradesCounted();
  await scenarioBadInput();
  await scenarioUpgradeSplit();
  console.log(fails ? `\n❌ FAILED: ${fails}` : "\n✅ ALL PASSED");
  process.exit(fails ? 1 : 0);
} catch (e) {
  console.log("\n❌ CRASH:", e?.message || e);
  process.exit(1);
}
