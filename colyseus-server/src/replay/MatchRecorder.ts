import type { GameState, Player } from "../schema/GameState";
import type {
  ReplayEndReason,
  ReplayInputEvent,
  ReplayPlayerMeta,
  ReplaySettlement,
  ReplaySnapshot,
  ReplayV1
} from "./ReplayTypes";
import { replayStore } from "./ReplayStore";

function nowMs(): number {
  return Date.now();
}

function safeStr(s: any): string {
  return (typeof s === "string" ? s : "").trim();
}

// Prevent prototype pollution by validating object keys
function isSafeKey(key: string): boolean {
  return key !== "__proto__" && key !== "constructor" && key !== "prototype";
}

function makeReplayId(roomId: string, createdAt: number): string {
  // roomId already tends to be url-safe, but keep it conservative.
  const base = safeStr(roomId).replace(/[^a-zA-Z0-9_-]/g, "_") || "room";
  return `${base}_${createdAt}`;
}

export class MatchRecorder {
  private replay: ReplayV1;
  private finalized = false;
  private lastSnapshotAt = 0;
  private snapshotIntervalMs: number;

  constructor(params: { roomId: string; roomName: string; snapshotIntervalMs?: number }) {
    const createdAt = nowMs();
    const id = makeReplayId(params.roomId, createdAt);
    this.snapshotIntervalMs = Math.max(50, Math.min(1000, params.snapshotIntervalMs ?? 100));
    this.replay = {
      version: 1,
      id,
      roomId: params.roomId,
      roomName: params.roomName,
      createdAt,
      match: {},
      players: {},
      inputs: [],
      snapshots: []
    };
  }

  getId(): string {
    return this.replay.id;
  }

  recordJoin(meta: ReplayPlayerMeta): void {
    const sid = safeStr(meta.sid);
    if (!sid || !isSafeKey(sid)) return;
    this.replay.players[sid] = {
      sid,
      address: safeStr(meta.address),
      profilePicture: meta.profilePicture ? safeStr(meta.profilePicture) : undefined,
      ufoTicketTokenId: meta.ufoTicketTokenId ? safeStr(meta.ufoTicketTokenId) : undefined
    };
  }

  recordLeave(sid: string): void {
    // lightweight marker via inputs stream
    this.replay.inputs.push({ t: nowMs(), sid: safeStr(sid), input: { type: "_leave" } });
  }

  startMatch(params: { startedAt: number; plannedEndAt?: number }): void {
    if (!this.replay.match.startedAt) {
      this.replay.match.startedAt = params.startedAt;
      if (typeof params.plannedEndAt === "number") this.replay.match.plannedEndAt = params.plannedEndAt;
    }
  }

  endMatch(params: { endedAt: number; reason: ReplayEndReason; winnerSid: string | null }): void {
    this.replay.match.endedAt = params.endedAt;
    this.replay.match.endReason = params.reason;
    this.replay.match.winnerSid = params.winnerSid;
  }

  setSettlement(settlement: ReplaySettlement): void {
    this.replay.settlement = { ...(this.replay.settlement || {}), ...settlement };
  }

  recordInput(ev: ReplayInputEvent): void {
    if (!ev) return;
    const sid = safeStr(ev.sid);
    if (!sid) return;
    // Keep inputs bounded (defense vs runaway memory)
    if (this.replay.inputs.length > 20000) return;
    this.replay.inputs.push({
      t: typeof ev.t === "number" ? ev.t : nowMs(),
      sid,
      input: ev.input
    });
  }

  maybeSnapshot(state: GameState, playersBySid?: Map<string, Player>, force = false): void {
    const t = nowMs();
    if (!force && t - this.lastSnapshotAt < this.snapshotIntervalMs) return;
    this.lastSnapshotAt = t;

    const players: ReplaySnapshot["players"] = [];
    const bySid = playersBySid || (state?.players as any);
    try {
      if (bySid && typeof (bySid as any).forEach === "function") {
        (bySid as any).forEach((p: any, sid: any) => {
          const s = safeStr(p?.sessionId || sid);
          if (!s) return;
          players.push({
            sid: s,
            address: typeof p?.address === "string" ? p.address : undefined,
            x: Number(p?.x ?? 0) || 0,
            y: Number(p?.y ?? 0) || 0,
            vx: Number(p?.vx ?? 0) || 0,
            vy: Number(p?.vy ?? 0) || 0,
            hp: Number(p?.hp ?? 0) || 0,
            armor: Number(p?.armor ?? 0) || 0,
            maxHP: Number(p?.maxHP ?? 0) || 0,
            maxArmor: Number(p?.maxArmor ?? 0) || 0,
            paralyzedUntil: typeof p?.paralyzedUntil === "number" ? p.paralyzedUntil : undefined
          });
        });
      }
    } catch {
      // ignore snapshot failure
    }

    // Keep snapshots bounded (~90s @ 10Hz => 900). Allow some slack.
    if (this.replay.snapshots.length > 2000) return;
    const snap: ReplaySnapshot = { t, players };
    this.replay.snapshots.push(snap);
  }

  async finalize(): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    try {
      await replayStore.write(this.replay);
    } catch (e: any) {
      // Swallow errors to avoid crashing the room dispose flow; keep a hint in memory.
      this.replay.settlement = {
        ...(this.replay.settlement || {}),
        error: `replay_write_failed:${e?.message || "unknown"}`
      };
    }
  }
}


