/* 🔌 TETRIS PERSIJUNGIMAS PO RYŠIO TRŪKIO (2026-09-20).
 *
 *   Skundas: „žaidžiant tetrį gavau diskonektą ir mačas nutrūko", „kiti irgi skundžiasi".
 *   Šaknis: `tetris/js/net.js` neturėjo JOKIO atsistatymo — `room.onLeave` iškart skelbdavo `close`.
 *   Serveris tuo metu laiko vietą (`allowReconnection`), bet klientas to lango nenaudojo niekada,
 *   o pasibaigus jis skelbdavo `_winByLeave` — pralaimėjimas ir statymas.
 *   Pilis (`f9_pvp_live.js`) persijungimą turi seniai (14 vietų), Tetris — 0.
 *
 *   R1  netikėtas trūkis → NEskelbia `close`, o bando grįžti
 *   R2  pavykus grįžti → `reopen`, ryšys atviras, žinutės vėl eina
 *   R3  sąmoningas išėjimas (`disconnect`) → jokio persijungimo
 *   R4  `gameover` jau gautas → mačas baigtas, persijungti nebandom
 *   R5  consented close (4000) → iškart `close`
 *   R6  nepavykus per visus bandymus → `close` su `reconnect_failed`
 *   R7  serverio langas ≥ kliento bandymų trukmės (kitaip langas beprasmis)
 *
 * Testuojam TIKRĄ `net.js` su stub'intu Colyseus klientu. Paleidimas: node _netreconnect.test.mjs
 */
import { readFileSync } from "fs";

const NET_SRC = readFileSync(new URL("../public/lenta/tetris/js/net.js", import.meta.url), "utf8");
const ROOM_SRC = readFileSync(new URL("./src/rooms/BlocksRoom.ts", import.meta.url), "utf8");

let fails = 0;
const check = (name, cond, extra) => {
  console.log((cond ? "  PASS " : "  FAIL ") + name + (cond ? "" : "  -> " + JSON.stringify(extra)));
  if (!cond) fails++;
};
const tick = (n = 1) => new Promise((r) => setTimeout(r, n));

/* Stub'as: Colyseus Client su valdomu reconnect rezultatu. */
function makeEnv(opts = {}) {
  const log = { events: [], reconnects: 0 };
  function mkRoom(id) {
    return {
      sessionId: "S1", roomId: id || "R1", reconnectionToken: "TOK",
      _h: {},
      onMessage(_t, cb) { this._h.msg = cb; },
      onLeave(cb) { this._h.leave = cb; },
      onError(cb) { this._h.err = cb; },
      send() {},
      leave() { if (this._h.leave) this._h.leave(4000); },
    };
  }
  const first = mkRoom("R1");
  const env = {
    document: null,
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn) => setTimeout(fn, 0),          // greitiname retry pauzes
    clearTimeout,
    Colyseus: {
      Client: function () {
        return {
          joinOrCreate: () => Promise.resolve(first),
          joinById: () => Promise.resolve(first),
          create: () => Promise.resolve(first),
          reconnect: () => {
            log.reconnects++;
            return opts.reconnectOk && log.reconnects >= (opts.okAfter || 1)
              ? Promise.resolve(mkRoom("R1"))
              : Promise.reject(new Error("gone"));
          },
        };
      },
    },
  };
  // net.js baigiasi `})(window)` — tad IIFE argumentą paduodam būtent kaip `window`.
  new Function("window", "setTimeout", "clearTimeout", "console", NET_SRC)(env, env.setTimeout, env.clearTimeout, env.console);
  const NET = env.NET;
  NET.on("close", (e) => log.events.push("close:" + (e && e.code)));
  NET.on("reconnecting", () => log.events.push("reconnecting"));
  NET.on("reopen", () => log.events.push("reopen"));
  NET.on("open", () => log.events.push("open"));
  return { NET, log, first };
}

console.log("🔌 Tetris persijungimas\n");

// ── R1 + R2 ──────────────────────────────────────────────────────────────
{
  const { NET, log, first } = makeEnv({ reconnectOk: true, okAfter: 3 });
  await NET.connect("colyseus", {});
  first._h.leave(1006);                       // netikėtas trūkis
  check("R1 iškart NEskelbia close", !log.events.some((e) => e.startsWith("close")), log.events);
  check("R1 paskelbė reconnecting", log.events.includes("reconnecting"), log.events);
  for (let i = 0; i < 40 && !log.events.includes("reopen"); i++) await tick(3);
  check("R2 grįžo į mačą (reopen)", log.events.includes("reopen"), log.events);
  check("R2 ryšys atviras", NET.status === "open", NET.status);
  check("R2 bandė kelis kartus", log.reconnects >= 3, log.reconnects);
}

// ── R3 ───────────────────────────────────────────────────────────────────
{
  const { NET, log } = makeEnv({ reconnectOk: true });
  await NET.connect("colyseus", {});
  NET.disconnect();
  await tick(5);
  check("R3 sąmoningai išėjus persijungimo nėra", log.reconnects === 0 && log.events.some((e) => e.startsWith("close")), { r: log.reconnects, e: log.events });
}

// ── R4 ───────────────────────────────────────────────────────────────────
{
  const { NET, log, first } = makeEnv({ reconnectOk: true });
  await NET.connect("colyseus", {});
  first._h.msg("gameover", { winner: "p1" });   // mačas baigtas
  first._h.leave(1006);
  await tick(5);
  check("R4 po gameover negrįžinėjam", log.reconnects === 0, log.reconnects);
  check("R4 paskelbtas close", log.events.some((e) => e.startsWith("close")), log.events);
}

// ── R5 ───────────────────────────────────────────────────────────────────
{
  const { NET, log, first } = makeEnv({ reconnectOk: true });
  await NET.connect("colyseus", {});
  first._h.leave(4000);                        // consented
  await tick(5);
  check("R5 consented (4000) → iškart close, be bandymų", log.reconnects === 0 && log.events.includes("close:4000"), log.events);
}

// ── R6 ───────────────────────────────────────────────────────────────────
{
  const { NET, log, first } = makeEnv({ reconnectOk: false });
  await NET.connect("colyseus", {});
  first._h.leave(1006);
  for (let i = 0; i < 300 && !log.events.includes("close:reconnect_failed"); i++) await tick(2);
  check("R6 nepavykus → close reconnect_failed", log.events.includes("close:reconnect_failed"), log.events.slice(-3));
  check("R6 bandyta 20 kartų", log.reconnects === 20, log.reconnects);
}

// ── R7: serverio langas ──────────────────────────────────────────────────
{
  const mTries = NET_SRC.match(/RC_TRIES\s*=\s*(\d+)/), mGap = NET_SRC.match(/RC_GAP_MS\s*=\s*(\d+)/);
  const clientS = mTries && mGap ? (Number(mTries[1]) * Number(mGap[1])) / 1000 : -1;
  const mSrv = ROOM_SRC.match(/RECONNECT_S\s*=\s*Number\(process\.env\.BLOCKS_RECONNECT_S\s*\|\|\s*(\d+)\)/);
  const srvS = mSrv ? Number(mSrv[1]) : -1;
  check("R7 serverio langas telpa kliento bandymus", srvS >= clientS && clientS > 0, { klientas: clientS + "s", serveris: srvS + "s" });
  check("R7 serveris nebe 8 s", /allowReconnection\(client, RECONNECT_S\)/.test(ROOM_SRC));
}

console.log("\n" + (fails ? "❌ FAIL: " + fails : "✅ visi testai praėjo"));
process.exit(fails ? 1 : 0);
