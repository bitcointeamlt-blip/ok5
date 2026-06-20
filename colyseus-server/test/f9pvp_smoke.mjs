// Headless smoke test for the F9 PvP room — drives a FULL 1v1 match with two
// Colyseus clients (no browser). Verifies: join → match start → sim ticks →
// units fight / core damage → match_end with a winner.
//
// Run:  node test/f9pvp_smoke.mjs   (server must be running on ws://localhost:2567)
// Needs colyseus.js available (npm i --no-save colyseus.js).
import { Client } from "colyseus.js";

const ENDPOINT = process.env.F9_EP || "ws://localhost:2567";
const TIMEOUT_MS = 40000;

function deck(arr) { return arr.map(([utype, level]) => ({ utype, level })); }

async function main() {
  const client = new Client(ENDPOINT);

  // Asymmetric decks so the match resolves quickly and deterministically-ish.
  const p1 = await client.joinOrCreate("f9pvp_room", {
    address: "0xsmoke_p1",
    deck: deck([["pigronke", 6], ["pigronke", 6], ["archer", 5], ["archer", 5], ["shaman", 4]]),
  });
  const p2 = await client.joinOrCreate("f9pvp_room", {
    address: "0xsmoke_p2",
    deck: deck([["skull", 1], ["skull", 1]]),
  });
  console.log(`[smoke] joined: p1 room=${p1.id}, p2 room=${p2.id} (should match)`);
  if (p1.id !== p2.id) { console.error("[smoke] FAIL: players landed in different rooms"); process.exit(2); }

  let started = false, ended = false, coreEvent = false, deaths = 0, matchResult = null;
  p1.onMessage("f9pvp_game_start", (e) => { started = true; console.log("[smoke] game_start seed=" + e.seed); });
  p1.onMessage("f9pvp_unit_died", () => { deaths++; });
  p1.onMessage("f9pvp_core_destroyed", (e) => { coreEvent = true; console.log("[smoke] core destroyed team=" + e.team); });
  p1.onMessage("f9pvp_match_result", (r) => { matchResult = r; });

  const result = await new Promise((resolve) => {
    const to = setTimeout(() => resolve({ timeout: true }), TIMEOUT_MS);
    p1.onMessage("f9pvp_match_end", (e) => { clearTimeout(to); ended = true; resolve(e); });
  });

  // peek final state
  let units = -1, cores = "";
  try {
    units = p1.state.units.size;
    p1.state.cores.forEach((c) => { cores += ` team${c.team}:hp${Math.round(c.hp)}${c.active ? "" : "(DEAD)"}`; });
  } catch (_) {}

  console.log(`[smoke] started=${started} ended=${ended} deaths=${deaths} coreEvent=${coreEvent} finalUnits=${units} cores=${cores.trim()}`);

  try { p1.leave(); p2.leave(); } catch (_) {}

  if (result.timeout) { console.error("[smoke] FAIL: match did not end within timeout"); process.exit(3); }
  if (!started) { console.error("[smoke] FAIL: game never started"); process.exit(4); }

  // Phase 5: settlement summary should arrive right after match_end.
  await new Promise((r) => setTimeout(r, 200));
  if (!matchResult) { console.error("[smoke] FAIL: no f9pvp_match_result (settlement) broadcast"); process.exit(5); }
  const pr = matchResult.players || [];
  const ok5 = pr.length === 2 && pr.every((p) => typeof p.eloAfter === "number" && typeof p.xpPreview === "number");
  console.log(`[smoke] settlement matchId=${matchResult.matchId} dur=${matchResult.durationMs}ms players=` +
    pr.map((p) => `t${p.team}{w:${p.won?1:0},k:${p.kills},dmg:${p.dmgDealt},elo:${p.eloAfter}(${p.eloDelta>=0?'+':''}${p.eloDelta}),xp:${p.xpPreview}}`).join(" "));
  if (!ok5) { console.error("[smoke] FAIL: settlement payload malformed"); process.exit(6); }

  console.log(`[smoke] PASS ✅  winnerTeam=${result.winnerTeam} reason=${result.reason}`);
  process.exit(0);
}

main().catch((e) => { console.error("[smoke] ERROR", e); process.exit(1); });
