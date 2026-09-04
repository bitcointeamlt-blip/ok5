/**
 * ⏲ POROS COOLDOWN — regresijos testas (2026-09-04).
 *   cd colyseus-server && node _paircd.test.mjs
 * 1) STATINIS: ar kode tebėra visos keturios dalys (be vienos taisyklė tyliai neveiktų).
 * 2) SIMULIACIJA ant TIKROS istorijos: kiek siege'ų būtų buvę užblokuoti.
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
const R = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const SRC = R("./src/rooms/F9PvpRoom.ts"), STORE = R("./src/services/BaseStore.ts"), UI = R("../public/lenta/raid_ui.js"), GAME = R("../public/lenta/game.js");
let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✅" : "🔴"} ${m}`); if (!c) fail++; };

console.log("1) STATINIAI SARGAI");
ok(/RAID_CD_MS = Number\(process\.env\.F9_RAID_CD_MS\) \|\| 2 \* 3_600_000/.test(SRC), "cooldown = 2 h (env F9_RAID_CD_MS)");
ok(/_applyRaidCooldown\(atkRaw: string, defRaw: string\)/.test(SRC), "_applyRaidCooldown egzistuoja");
ok(/b\.raidCd = \{ \[atk\]: now \}/.test(SRC) && /b\.raidCd = \{ \[def\]: now \}/.test(SRC),
   "raidCd = {kitas: now} — abipusis CD IR kitų nuvalymas dalyvavusiems");
ok((SRC.match(/this\._applyRaidCooldown\(/g) || []).length >= 2, "kviečiamas iš abiejų raido kelių");
ok(/for \(const k of Object\.keys\(_cd\)\) _cd\[k\] = _now/.test(SRC), "DUTY įjungimas paleidžia laikrodį IŠ NAUJO");
ok(/Math\.max\(Number\(_cdRow\[atk\]\) \|\| 0, _raidCdMap\.get/.test(SRC), "gate skaito PERSISTUOTĄ reikšmę (ne tik atmintį)");
ok(/raidCd\?: Record<string, number>/.test(STORE) && /return \{ raidCd, wallLevel/.test(STORE),
   "🔑 raidCd IŠTRAUKIAMAS normalizatoriuje (kitaip tyliai dingtų — baltasis sąrašas)");
ok(/function onCooldown\(r, me\)/.test(UI) && /if \(onCooldown\(r, me\)\) return false/.test(UI),
   "klientas pilį SLEPIA (ne klaida paspaudus)");
ok(/var RAID_CD_MS = 2 \* 3600000/.test(UI), "kliento riba sutampa su serverio");
ok(/function raidCooldownLeft\(addr\)/.test(UI) && /window\.F9RaidCooldown/.test(UI), "bendras sargas eksportuotas (F9RaidCooldown)");
ok(/raidCooldownLeft\(addr\)\.then/.test(UI), "rankinis adreso ivedimas tikrinamas PRIES raida");
ok(/window\.F9RaidCooldown\.left\(addr\)\.then/.test(GAME) && /You already fought this address/.test(GAME),
   "KVIETIMO NUORODA: vietoj ATTACK mygtuko rodomas cooldown");

console.log("\n2) SIMULIACIJA ant tikros istorijos");
const sb = createClient(process.env.SUPABASE_URL || "https://rbkivemouxwcgrpzazxb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let rows = [], f = 0;
for (;;) { const { data } = await sb.from("f9_bases").select("ronin_address,buildings").ilike("ronin_address", "%#minelog").range(f, f + 999);
  rows = rows.concat(data || []); if (!data || data.length < 1000) break; f += 1000; }
const CD = 2 * 3600000;
let tot = 0, blocked = 0; const per = {};
for (const r of rows) {
  const me = r.ronin_address.replace("#minelog", "");
  const evs = (r.buildings?.events || []).sort((a, b) => a.t - b.t);
  const cd = {}; let dutyAt = null;
  for (const e of evs) {
    if (e.k === "duty" && e.duty === "online") { dutyAt = e.t; for (const k of Object.keys(cd)) cd[k] = e.t; }
    else if (e.k === "duty" && e.duty === "safe") dutyAt = null;
    else if (e.k === "siege" && e.by) {
      tot++; const key = e.by;
      const at = cd[key] || 0;
      if (at && e.t - at < CD) { blocked++; (per[me] = per[me] || { b: 0, n: 0 }).b++; }
      (per[me] = per[me] || { b: 0, n: 0 }).n++;
      cd[key] = e.t;   // po mūšio – šviežias CD
    }
  }
}
console.log(`  istoriniai siege'ai: ${tot} · būtų užblokuoti: ${blocked} (${(100 * blocked / tot).toFixed(0)}%)`);
console.log("\n  pagal žaidėją (blokuoti / viso):");
Object.entries(per).sort((a, b) => b[1].b - a[1].b).slice(0, 8)
  .forEach(([a, v]) => console.log(`    ${a.slice(0, 12)}  ${String(v.b).padStart(3)} / ${String(v.n).padStart(3)}  (${(100 * v.b / v.n).toFixed(0)}%)`));
ok(blocked > 0, "taisyklė realiai kirstų istorinius atvejus");
console.log(fail ? `\n🔴 TESTAS KRITO (${fail})` : "\n✅ VISI TESTAI ŽALI");
process.exit(fail ? 1 : 0);
