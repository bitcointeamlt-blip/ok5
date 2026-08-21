/**
 * ⛏️🔎 KASIMO AUDITAS — „kaip šis žaidėjas uždirbo savo RONKE ir ar pagal taisykles?"
 *
 *   node _mineaudit.mjs 0xADRESAS
 *
 * Sujungia TRIS šaltinius:
 *   1) `<addr>#minelog`  — serverio įvykiai (duty / gate / siege / withdraw / steal)
 *   2) `<addr>` buildings — dabartinė būsena (pot, ciklas, režimas, laukas)
 *   3) grandinė          — realūs RONKE atėjimai (kuris pool'as ir kiek)
 *
 * Ir pasako, ar skaičiai sueina: ar išimta suma padengiama kasimu + grobiu, ir ar
 * kiekvienam užpildytam 200 ciklui buvo PvP mūšis.
 */
import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";
import "dotenv/config";

const ADDR = (process.argv[2] || "").trim().toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(ADDR)) { console.log("Naudojimas: node _mineaudit.mjs 0xADRESAS"); process.exit(1); }

const RONKE = "0xf988f63bf26C3Ed3fBf39922149E3E7b1e5c27cB";
const T = ethers.id("Transfer(address,address,uint256)");
const POOLS = {
  "0xc59e860e2115ccdab499f619a67bedf71ee26007": "kasyklos pool (RonkeReward)",
  "0xe47babcecb54760f73e97322f0a1cd7891e2b674": "išmokų pool (prizai/refundai)",
  "0xff0a2d76e6156bc1c0c689fe4029f6f1a566e92e": "įėjimų treasury",
};
// Taisyklių konstantos (PRIVALO sutapti su F9PvpRoom)
const SAFE_H = 5, DUTY_H = 10, POWER_H = 0.05, STEP = 200;

const sb = createClient(process.env.SUPABASE_URL || "https://rbkivemouxwcgrpzazxb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const prov = new ethers.JsonRpcProvider("https://ronin.gateway.tenderly.co", 2020, { staticNetwork: true });
const dt = (t) => new Date(Number(t)).toISOString().slice(0, 16).replace("T", " ");

// ── 1) būsena ───────────────────────────────────────────────────────────────
const { data: base } = await sb.from("f9_bases").select("buildings").eq("ronin_address", ADDR).maybeSingle();
const b = base?.buildings || {};
const power = Number(b.cemPower) || 0;
console.log(`\n═══ KASIMO AUDITAS  ${ADDR} ═══\n`);
console.log("DABARTINĖ BŪSENA");
console.log(`  režimas ${b.dutyMode || "?"} · pot ${b.minePot ?? "?"} · ciklas ${b.mineMined ?? "?"}/${STEP} · lauke ${b.mineField ?? "?"} unitų`);
console.log(`  RonkePower ${power} · NFT ${b.cemNft ?? "?"} · paskyra nuo ${b.cemRamp ? dt(b.cemRamp) : "?"}`);
const rateSafe = SAFE_H + power * POWER_H, rateDuty = DUTY_H + power * POWER_H;
console.log(`  greitis: SAFE ${rateSafe.toFixed(2)}/h · DUTY ${rateDuty.toFixed(2)}/h`);

// ── 2) žurnalas ─────────────────────────────────────────────────────────────
const { data: logRow } = await sb.from("f9_bases").select("buildings").eq("ronin_address", ADDR + "#minelog").maybeSingle();
const evs = Array.isArray(logRow?.buildings?.events) ? logRow.buildings.events : [];
console.log(`\nŽURNALAS: ${evs.length} įvykių`);
if (!evs.length) {
  console.log("  ⚠️ TUŠČIAS — žurnalas įjungtas 2026-08-21; senesnė veikla NEFIKSUOTA.");
} else {
  const cnt = {};
  evs.forEach((e) => { cnt[e.k] = (cnt[e.k] || 0) + 1; });
  console.log("  " + Object.entries(cnt).map(([k, v]) => `${k}:${v}`).join(" · "));
  console.log("\n  paskutiniai 15:");
  evs.slice(-15).forEach((e) => {
    const extra = [e.duty && `duty=${e.duty}`, e.amt != null && `${e.amt} RONKE`, e.pot != null && `pot=${e.pot}`,
      e.mined != null && `ciklas=${e.mined}`, e.by && `su ${e.by}`, e.why].filter(Boolean).join(" · ");
    console.log(`   ${dt(e.t)}  ${String(e.k).padEnd(8)} ${extra}`);
  });
  // DUTY trukmė — sumuojam intervalus tarp perjungimų
  let inDuty = 0, last = null, mode = null;
  evs.filter((e) => e.k === "duty").forEach((e) => {
    if (mode === "online" && last) inDuty += e.t - last;
    mode = e.duty; last = e.t;
  });
  if (mode === "online" && last) inDuty += Date.now() - last;
  if (inDuty > 0) console.log(`\n  DUTY iš viso: ${(inDuty / 3600000).toFixed(1)} h  (≈ ${(inDuty / 3600000 * rateDuty).toFixed(0)} RONKE)`);
  const gates = evs.filter((e) => e.k === "gate").length, sieges = evs.filter((e) => e.k === "siege").length;
  console.log(`  ciklų užpildyta: ${gates} · PvP mūšių: ${sieges}  ${sieges >= gates ? "✅ atitinka" : "⚠️ mūšių MAŽIAU nei ciklų"}`);
}

// ── 3) grandinė ─────────────────────────────────────────────────────────────
const now = await prov.getBlockNumber();
const logs = await prov.getLogs({ address: RONKE, topics: [T, null, ethers.zeroPadValue(ADDR, 32)], fromBlock: now - 250000, toBlock: now });
const bySrc = {};
for (const l of logs) {
  const from = ("0x" + l.topics[1].slice(26)).toLowerCase();
  const amt = Number(ethers.formatUnits(BigInt(l.data), 18));
  const label = POOLS[from] || ("kita: " + from.slice(0, 12) + "…");
  bySrc[label] = (bySrc[label] || 0) + amt;
}
console.log(`\nGRANDINĖ — gavo RONKE (${logs.length} pervedimai):`);
Object.entries(bySrc).sort((a, b2) => b2[1] - a[1]).forEach(([k, v]) => console.log(`  ${v.toFixed(2).padStart(12)}  ← ${k}`));

const mined = bySrc["kasyklos pool (RonkeReward)"] || 0;
if (mined > 0) {
  const hSafe = mined / rateSafe, hDuty = mined / rateDuty;
  console.log(`\nIŠVADA dėl kasimo (${mined.toFixed(0)} RONKE išimta):`);
  console.log(`  reikėtų ${hSafe.toFixed(0)} h SAFE arba ${hDuty.toFixed(0)} h DUTY`);
  console.log(`  ciklų po ${STEP}: ${Math.ceil(mined / STEP)} → tiek PvP mūšių turėjo būti (SAFE režimu)`);
  if (b.cemRamp) {
    const ageH = (Date.now() - Number(b.cemRamp)) / 3600000;
    console.log(`  paskyros amžius: ${ageH.toFixed(0)} h → ${ageH >= hDuty ? "✅ laiko pakako" : "🔴 LAIKO NEPAKAKO — įtartina"}`);
  }
}
console.log();
process.exit(0);
