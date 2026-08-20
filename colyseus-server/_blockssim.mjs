// 🧱🧪 PvP Tetris statymo simuliacija — atkartoja BŪTENT tą gedimą, dėl kurio žaidėjai neteko RONKE:
//    mokant piniginės APP'E naršyklė nueina į foną → WS miršta → klientas persijungia ir gauna
//    NAUJĄ sessionId → serveris anksčiau tokio statymo nebeatpažindavo ir TYLIAI numesdavo.
//
// Scenarijai:
//   A) ŠVARUS  — abu sumoka be ryšio trikdžių → mačas privalo prasidėti
//   B) SESIJOS PRARADIMAS — p2 atsijungia, persijungia (naujas sessionId) ir tik tada sumoka
//   C) VĖLYVAS — p2 sumoka jau po nutraukimo → privalo būti priimtas ir grąžintas (ne tyla)
//
// Tikri RONKE NEJUDA: tx hash'ai pramanyti → verify nepraeina → jokių išmokų. Tikrinam TIK srautą.
import * as Colyseus from "colyseus.js";

const EP = process.argv[2] || "ws://localhost:2601";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fakeTx = (n) => "0x" + String(n).padStart(64, "a");
const A1 = "0x1111111111111111111111111111111111111111";
const A2 = "0x2222222222222222222222222222222222222222";

const phase = (r) => { try { return r.state && r.state.phase; } catch (_) { return "?"; } };

function wire(room, tag, log) {
  const seen = [];
  ["stake_now", "prep", "prep_state", "wager_abort", "wager_verify", "settle"].forEach((t) => {
    room.onMessage(t, (p) => { seen.push(t); if (log) console.log(`   [${tag}] ← ${t}`, t === "wager_abort" ? JSON.stringify(p) : ""); });
  });
  room.onMessage("*", () => {});
  return seen;
}

async function scenario(name, fn) {
  console.log(`\n═══ ${name} ═══`);
  try { await fn(); } catch (e) { console.log("   ❌ KLAIDA:", e && e.message); }
}

// Sukuria kambarį ir prijungia du žaidėjus iki „stake_now"
async function openMatch(tier = 69) {
  const c1 = new Colyseus.Client(EP), c2 = new Colyseus.Client(EP);
  const r1 = await c1.create("blocks_room", { name: "P1", addr: A1, tier, wager: true, mode: "units" });
  const s1 = wire(r1, "p1", true);
  await sleep(600);
  const r2 = await c2.joinById(r1.roomId, { name: "P2", addr: A2, tier, wager: true, mode: "units" });
  const s2 = wire(r2, "p2", true);
  // abu praneša „ready" — be to serveris į „challenge" NEEINA (_allReady())
  try { r1.send("ready", {}); } catch (_) {}
  try { r2.send("ready", {}); } catch (_) {}
  // laukiam kol serveris pereis į „challenge" (svečias prisijungė)
  for (let i = 0; i < 20 && phase(r1) !== "challenge"; i++) await sleep(250);
  console.log(`   fazė prieš accept: ${phase(r1)}`);
  try { r1.send("accept", {}); } catch (_) {}   // ⚠️ TIK host'as ir TIK per challenge
  for (let i = 0; i < 20 && !s1.includes("stake_now"); i++) await sleep(250);
  return { c1, c2, r1, r2, s1, s2 };
}

await scenario("A) ŠVARUS srautas — abu sumoka be trikdžių", async () => {
  const { r1, r2, s1, s2 } = await openMatch();
  console.log("   stake_now gautas:", s1.includes("stake_now"), "/", s2.includes("stake_now"));
  r1.send("stake", { tx: fakeTx(1), addr: A1 });
  await sleep(400);
  r2.send("stake", { tx: fakeTx(2), addr: A2 });
  await sleep(2500);
  const ok = s1.includes("prep") && s2.includes("prep");
  console.log(`   fazė: ${phase(r1)}`);
  console.log(`   ${ok ? "✅" : "❌"} mačas ${ok ? "PRASIDĖJO (prep abiem)" : "NEPRASIDĖJO"}`);
  await r1.leave(); await r2.leave(); await sleep(600);
});

await scenario("B) SESIJOS PRARADIMAS — p2 persijungia ir tik tada sumoka (TAS PATS gedimas)", async () => {
  const { c2, r1, r2, s1 } = await openMatch();
  r1.send("stake", { tx: fakeTx(3), addr: A1 });          // p1 sumoka normaliai
  await sleep(500);
  const roomId = r1.roomId;
  const oldSid = r2.sessionId;
  await r2.leave(false);                                   // 📱 piniginės appsas → WS miršta
  await sleep(900);
  const r2b = await c2.joinById(roomId, { name: "P2", addr: A2, tier: 69, wager: true, mode: "units" });
  const s2b = wire(r2b, "p2*", true);
  console.log(`   sessionId: ${oldSid} → ${r2b.sessionId}  ${oldSid === r2b.sessionId ? "(tas pats)" : "(NAUJAS — čia ir lūždavo)"}`);
  await sleep(700);
  r2b.send("stake", { tx: fakeTx(4), addr: A2 });          // sumoka jau NAUJA sesija
  await sleep(2500);
  const started = s1.includes("prep") || s2b.includes("prep");
  console.log(`   fazė: ${phase(r1)}`);
  console.log(`   ${started ? "✅" : "❌"} statymas ${started ? "ATPAŽINTAS — mačas prasidėjo" : "DINGO (bug'as gyvas)"}`);
  try { await r1.leave(); await r2b.leave(); } catch (_) {}
  await sleep(600);
});

await scenario("C) VĖLYVAS statymas po nutraukimo — privalo būti priimtas ir grąžintas", async () => {
  const { r1, r2, s1, s2 } = await openMatch();
  r1.send("stake", { tx: fakeTx(5), addr: A1 });
  await sleep(600);
  r2.send("stake_cancel", {});                             // p2 atsisako → abort + refundas p1
  await sleep(1800);
  console.log(`   po atšaukimo fazė: ${phase(r1)}  · p1 gavo wager_abort: ${s1.includes("wager_abort")}`);
  r2.send("stake", { tx: fakeTx(6), addr: A2 });           // p2 „pavėluotai" sumoka
  await sleep(2000);
  const late = s2.filter((x) => x === "wager_abort").length;
  console.log(`   ${late >= 1 ? "✅" : "⚠️"} vėlyvas statymas apdorotas (wager_abort ×${late}) — serverio log'e turi būti „VĖLYVAS stake"`);
  try { await r1.leave(); await r2.leave(); } catch (_) {}
  await sleep(600);
});

console.log("\n═══ BAIGTA ═══");
process.exit(0);
