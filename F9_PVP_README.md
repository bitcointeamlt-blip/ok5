# F9 PvP — real-time 1v1 RTS (work in progress)

Real-time 1v1 RTS PvP for the lenta / **PewPew Saga** F9 mode: you and an opponent appear in
a shared arena, each deploys the units from their deck, win by **wiping all enemy units** (later:
also "destroy the enemy core"). Full RTS control ("variant A"). Server-authoritative via the
existing Colyseus stack.

> **Status: built + wired + locally verified, NOT deployed.** Single-player F9, F11, F12 and
> index.html are completely untouched. Everything is additive + isolated (F9Pvp-prefixed) and the
> game wiring is opt-in (loads ONLY with the `#f9pvp` hash). If the room is never joined / the hash
> is never used, the game behaves exactly as before. **Only the live Colyseus Cloud deploy remains.**

---

## What is done (Claude, autonomous)

### Server (`colyseus-server/`) — fully isolated, 1 additive line in `app.config.ts`
| File | Purpose |
|---|---|
| `src/schema/F9PvpState.ts` | Colyseus synced state: `F9PvpState` / `F9PvpPlayer` / `F9PvpUnit` / `F9PvpCore`. Coords in grid cells. |
| `src/game/F9PvpRtsLogic.ts` | Server-authoritative combat sim (no Colyseus imports). Ported F9 unit stats (HP/range/cd/dmg/detect/speed) + `nftStatMul`. Seeded PRNG. Move → auto-target → attack-on-cooldown → die → win check. |
| `src/rooms/F9PvpRoom.ts` | `f9pvp_room`: `maxClients=2`, lobby→ready→playing→gameover, 30 Hz sim, deck spawn per side, command validation (own units only), forfeit-on-leave, match-end. |
| `src/app.config.ts` | **+1 line**: `gameServer.define("f9pvp_room", F9PvpRoom)`. Nothing else changed. |

### Client (`public/lenta/`) — fully isolated
| File | Purpose |
|---|---|
| `f9_pvp_net.js` | `window.F9PVP` API: connect / join / ready / move / attack-move / stop / read units. Loads `colyseus.js` from CDN. **Does not touch `game.js` or `floor12_merge.js`.** |

### v1 simplifications (intentional; polish later)
- No tree/boulder collision, unit separation, bush cover, or projectile arcs yet (those are
  feel/render parity → a later phase). Core loop is enough for a playable match.
- Deck is trusted from the client for now. **TODO**: server-verify on-chain (ownerOf + getDeck) like
  `ronke-power`. Marked in `F9PvpRoom.sanitizeDeck`.
- Win = unit wipe. Core/objective schema exists but is off by default.

---

## What still needs YOUR hands

1. **Run the server locally** (to test):
   ```
   cd ok5/colyseus-server
   npm install        # (Claude already ran this to verify it compiles)
   npm run dev        # starts on ws://localhost:2567
   ```
2. **Wire the client into `game.js`** — a careful, guarded, opt-in hook (a new "PvP" F9 entry that:
   loads `f9_pvp_net.js`, calls `F9PVP.join({address, deck})`, renders `F9PVP.getUnits()` each frame
   with existing F9 sprites, and maps mouse input → `F9PVP.moveTo/attackMoveTo/stop`). This is the
   conflict-sensitive step — Claude will do it as a separate minimal, reviewable change.
3. **Live 2-player test** — open two browsers, both join, confirm you see each other's units fight.
   (Claude cannot play two clients against each other.)
4. **Deploy to Colyseus Cloud** — needs your Colyseus Cloud auth. Set `VITE_COLYSEUS_ENDPOINT`
   (already used by the existing PvP games). The lenta client reads `window.F9PVP_ENDPOINT` (override)
   or falls back to the same cloud URL.

---

## Local dev quick test (no game wiring needed)
With the server running (`npm run dev`), in the lenta page DevTools console:
```js
await F9PVP.connect('ws://localhost:2567');
await F9PVP.join({ address: '0xtest1', deck: [{utype:'skull',level:3,tokenId:0},{utype:'archer',level:2,tokenId:0}] });
F9PVP.onGameStart = e => console.log('start', e);
F9PVP.onMatchEnd  = e => console.log('winner team', e.winnerTeam);
// open a 2nd tab and join again (different address) -> match auto-starts after 2s
setInterval(() => console.log(F9PVP.getPhase(), F9PVP.getUnits().length), 1000);
```

## Roadmap (phases)
- [x] **0/1** Server room + schema + sim + client net module
- [x] **4** Core/objective win condition (destroy enemy core OR wipe all units; cores on by default)
- [x] **2** Wire render+input into `game.js` (opt-in, guarded `#f9pvp` mode) — `f9_pvp_overlay.js` + tiny boot in `game.js`
- [x] **3** Client-side prediction for own units (own commanded units move locally + reconcile to server)
- [x] **5** Settlement: server-authoritative result (kills/dmg/survivors), provisional ELO + XP preview,
      optional on-chain deck verify + best-effort settlement POST (all env-gated, safe defaults)
- [x] **verify** Headless 2-client smoke test (`test/f9pvp_smoke.mjs`) — full match + settlement payload. + standalone browser tester (`public/lenta/f9_pvp_test.html`)
- [ ] **6** Combat parity polish (collision, separation, bush cover, projectiles) + matchmaking ELO + **Colyseus Cloud deploy** (needs your cloud auth — only remaining step)

### Phase 2/3 — game wiring (NEW, isolated)
| File | Purpose |
|---|---|
| `public/lenta/f9_pvp_overlay.js` | `window.F9PvpOverlay` — full-screen PvP arena overlay (its OWN canvas above the game). Renders units via the game's own `_f9UnitFrameForOutline()` (real F9 sprites, fallback glyphs), RTS select/move/attack-move/stop input, client-side prediction for own units, lobby + settlement result panel. Auto-builds the real NFT deck via `window.Wallet`/`window.BarracksNFT`. |
| `public/lenta/game.js` | **+~45 lines appended at EOF** (after the final IIFE): guarded bootstrap. Loads `f9_pvp_net.js` + `f9_pvp_overlay.js` and starts ONLY when `location.hash` contains `f9pvp` (or `window.F9PVP_FORCE`/`window.F9PvpLaunch()`). No other line in `game.js` changed. |

### Phase 5 — settlement (NEW, server)
| File | Purpose |
|---|---|
| `colyseus-server/src/game/F9PvpSettlement.ts` | `buildMatchResult()` (winner/reason/duration/per-player kills·dmg·survivors), `computeEloDelta()` (provisional ELO), `estimateXp()` (mirrors `submit-battle-result` formula), `postSettlement()` (best-effort POST to `F9PVP_SETTLE_URL`, never throws), `verifyDeckOnChain()` (env `F9PVP_DECK_VERIFY_URL`; default = trust client = v1 behaviour). |
| `colyseus-server/src/game/F9PvpRtsLogic.ts` | +per-unit `kills`/`dmgDealt`/`dmgTaken` accounting + `allUnits` archive + `matchStats()`. |
| `colyseus-server/src/rooms/F9PvpRoom.ts` | Non-blocking deck verify on join; on match end builds the result, broadcasts `f9pvp_match_result`, best-effort settlement POST. |

> **Settlement is preview-only by default.** No on-chain burn/XP is triggered by the server. The real
> XP claim still flows through the existing signed `submit-battle-result` path on the player's wallet.
> Settlement POST + deck verification only activate if their env vars are set, so the default deploy is safe.

### How to run / test it
- **In-game (opt-in):** serve lenta, open `http://localhost:8080/lenta/#f9pvp` → overlay loads + auto-joins.
  Open the same URL in a 2nd browser to get a real 1v1. (Or call `F9PvpLaunch()` in the console.)
- **Standalone tester:** `http://localhost:8080/lenta/f9_pvp_test.html` (unchanged).

### Verified (2026-06-18, all local, nothing deployed)
- `tsc --noEmit` clean (server). `node --check` clean (`game.js`, `f9_pvp_net.js`, `f9_pvp_overlay.js`).
- Headless smoke test PASS: 2 clients → auto-start → sim → `match_end winnerTeam=0 reason=wipe`, **and**
  `f9pvp_match_result` settlement payload verified: `t0{w:1,k:2,dmg:16,elo:1012(+12),xp:356} t1{...elo:988(-12)}`.
- To re-run: `npm run dev` (one shell) + `node test/f9pvp_smoke.mjs` (another). colyseus.js@0.15 already installed.

### Still needs YOUR hands
- Live 2-browser play test of `#f9pvp` (Claude can't drive two real browsers against each other).
- Phase 6 polish + **deploy to Colyseus Cloud** (your cloud auth; set `VITE_COLYSEUS_ENDPOINT` /
  `window.F9PVP_ENDPOINT`). Optionally set `F9PVP_SETTLE_URL` / `F9PVP_DECK_VERIFY_URL` to turn on real settlement.
