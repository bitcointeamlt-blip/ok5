## PvP Lag Reduction Plan

### ✅ Completed in this pass
- Added client-side movement snapshots that send data only when the player/arrow/projectile actually moves or every 400 ms heartbeat, cutting redundant packets by ~50–70 %.
- Limited projectile + arrow sync to significant deltas and reset snapshots when those objects despawn, preventing stale broadcasts.
- Disabled Supabase Realtime for PvP (all matches use Colyseus only, Supabase is now standby), eliminating duplicate transports entirely.

### 🎯 Next target areas
1. **Server schema trim** – keep authoritative state minimal (positions, HP/armor) and relay effects via messages to shrink patch sizes.
2. **Input batching on server** – convert `player_input` broadcast into tick-based deltas to avoid double-delivery (schema + message).
3. **Frontend logging/audio hygiene** – drop per-event `console.log` and defer audio resume promises outside the hot loop.
4. **Matchmaking cleanup** – ensure Supabase channels/intervals close on every match end to stop hidden CPU/network usage.

### 📌 Validation steps
- Profile WebSocket traffic in Chrome DevTools → Network → WS; expect `player_input` frequency to align with real movement rather than constant spam.
- Measure average RTT via in-game latency overlay; target <150 ms for EU endpoints.
- During matches, confirm Supabase dashboard shows zero realtime connections for players using Colyseus transport.

### 📅 Follow-up work
- Introduce compression / bitpacking for PvP payloads (positions + velocities can be sent as 16-bit ints).
- Move heavy collision checks (lines/platforms) into a worker or staggered update loop to free the render thread.
- Add automated soak test (bot vs bot) to detect regressions in packet volume or CPU usage.


