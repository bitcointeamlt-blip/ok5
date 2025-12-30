export interface RoomMetricsSnapshot {
  // PvP matchmaking metrics (exclude presence_room so UI doesn't get polluted)
  totalRooms: number;
  waitingRooms: number;
  activeRooms: number;
  waitingPlayers: number;
  totalPlayers: number;
  // Presence metric: count of visitors who have the website open (joined presence_room)
  presencePlayers: number;
}

type RoomKind = "pvp" | "presence";
type RoomMeta = { count: number; kind: RoomKind };

const roomMetaById = new Map<string, RoomMeta>();

export function registerRoom(roomId: string, kind: RoomKind = "pvp"): void {
  roomMetaById.set(roomId, { count: 0, kind });
}

export function unregisterRoom(roomId: string): void {
  roomMetaById.delete(roomId);
}

export function updateRoomPlayerCount(roomId: string, count: number): void {
  const meta = roomMetaById.get(roomId);
  if (meta) {
    meta.count = count;
    roomMetaById.set(roomId, meta);
  } else {
    // Backwards-compatible default (treat unknown rooms as PvP rooms).
    roomMetaById.set(roomId, { count, kind: "pvp" });
  }
}

export function getRoomMetrics(): RoomMetricsSnapshot {
  let waitingRooms = 0;
  let activeRooms = 0;
  let waitingPlayers = 0;
  let totalPlayers = 0;
  let presencePlayers = 0;
  let pvpRooms = 0;

  for (const meta of roomMetaById.values()) {
    if (meta.kind === "presence") {
      presencePlayers += meta.count;
      continue;
    }

    // PvP metrics
    pvpRooms += 1;
    totalPlayers += meta.count;
    if (meta.count >= 2) {
      activeRooms += 1;
    } else if (meta.count === 1) {
      waitingRooms += 1;
      waitingPlayers += 1;
    }
  }

  return {
    totalRooms: pvpRooms,
    waitingRooms,
    activeRooms,
    waitingPlayers,
    totalPlayers,
    presencePlayers
  };
}














