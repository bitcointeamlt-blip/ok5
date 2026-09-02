/**
 * ⚔️🔢 RAID SQUAD FIX — regresijos testas (2026-09-02).
 *   node _raidsquad.test.mjs        (leisti iš colyseus-server, kur guli .env)
 * 1) STATINIS: ar kode tebėra abu sargai (kad ateities refaktoras jų nenumestų).
 * 2) DUOMENŲ: perleidžia VISUS istorinius raidus per seną ir naują siege sąlygą ir tikrina, kad
 *    dingsta TIK tie užskaitymai, kur nė viena pusė neprarado 6 realių unitų.
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const SRC = readFileSync(new URL("./src/rooms/F9PvpRoom.ts", import.meta.url), "utf8");
let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✅" : "🔴"} ${m}`); if (!c) fail++; };

console.log("1) STATINIAI SARGAI");
ok(/_checkRaiderSquad[\s\S]{0,2000}?this\._activeCount\.set\(client\.sessionId,\s*MAX_ACTIVE\)/.test(SRC),
   "_checkRaiderSquad priverstinai nustato _activeCount = MAX_ACTIVE (raide kliento `active` neturi galios)");
ok(/_siegeDefPct\s*=\s*defElim\s*\/\s*Math\.max\(defTotal,\s*RAID_FIELD_REQ\)/.test(SRC),
   "gynėjo siege vardiklis apsaugotas Math.max(defTotal, RAID_FIELD_REQ)");
ok(/_siegeAtkPct\s*=\s*atkElim\s*\/\s*Math\.max\(atkTotal,\s*RAID_FIELD_REQ\)/.test(SRC),
   "puoliko siege vardiklis apsaugotas Math.max(atkTotal, RAID_FIELD_REQ)");
ok(/if\s*\(\(_siegeDefPct\s*>=\s*DUTY_SIEGE_CASUALTY\s*\|\|\s*_siegeAtkPct\s*>=\s*DUTY_SIEGE_CASUALTY\)/.test(SRC),
   "siege sąlyga naudoja APSAUGOTAS proporcijas");
ok(/if\s*\(casualtyPct\s*>=\s*0\.5\)\s*\{\s*\/\/\s*🛡/.test(SRC),
   "SKYDAS tebenaudoja tikrą gynėjo proporciją (nepaliesta)");
ok(/const fullWipe = defTotal > 0 && defElim === defTotal/.test(SRC),
   "GROBIS (fullWipe) nepaliestas");

console.log("\n2) ISTORINIAI DUOMENYS (visi raidai)");
const sb = createClient(process.env.SUPABASE_URL || "https://rbkivemouxwcgrpzazxb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let all = [], from = 0;
for (;;) { const { data } = await sb.from("f9_bases").select("buildings").like("ronin_address", "match_%").range(from, from + 999);
  all = all.concat(data || []); if (!data || data.length < 1000) break; from += 1000; }
const ms = all.map((r) => r.buildings).filter(Boolean);
const REQ = 12, TH = 0.5;
const T = (m, p) => (m[p + "Survived"] || 0) + (m[p + "Injured"] || 0) + (m[p + "Dead"] || 0) + (m[p + "Escaped"] || 0);
const C = (m, p) => (m[p + "Injured"] || 0) + (m[p + "Dead"] || 0);
let oldQ = 0, newQ = 0, lostLegit = 0, killedCheap = 0;
const lost = [];
for (const m of ms) {
  const aT = T(m, "atk"), dT = T(m, "def"), aC = C(m, "atk"), dC = C(m, "def");
  const o = (aT && aC / aT >= TH) || (dT && dC / dT >= TH);
  const n = aC / Math.max(aT, REQ) >= TH || dC / Math.max(dT, REQ) >= TH;
  if (o) oldQ++; if (n) newQ++;
  if (o && !n) { if (Math.max(aC, dC) >= REQ * TH) { lostLegit++; lost.push(m); } else killedCheap++; }
  if (!o && n) { lostLegit++; }   // naujoji NEGALI užskaityti to, ko sena neužskaitė
}
console.log(`  raidų: ${ms.length} · sena sąlyga užskaitė ${oldQ} · nauja ${newQ}`);
ok(killedCheap > 0, `panaikinta ${killedCheap} užskaitymų, kur nė viena pusė neprarado ${REQ * TH} unitų`);
ok(lostLegit === 0, `NĖ VIENAS tikras mūšis (≥${REQ * TH} aukų) neprarado užskaitymo (rasta: ${lostLegit})`);
if (lost.length) lost.slice(0, 5).forEach((m) => console.log("     🔴", JSON.stringify(m).slice(0, 160)));

console.log(fail ? `\n🔴 TESTAS KRITO (${fail})` : "\n✅ VISI TESTAI ŽALI");
process.exit(fail ? 1 : 0);
