export interface RoomMetricsSnapshot {
  totalRooms: number;
  waitingRooms: number;
  activeRooms: number;
  waitingPlayers: number;
  totalPlayers: number;
}

const roomPlayerCounts = new Map<string, number>();

export function registerRoom(roomId: string): void {
  roomPlayerCounts.set(roomId, 0);
}

export function unregisterRoom(roomId: string): void {
  roomPlayerCounts.delete(roomId);
}

export function updateRoomPlayerCount(roomId: string, count: number): void {
  roomPlayerCounts.set(roomId, count);
}

export function getRoomMetrics(): RoomMetricsSnapshot {
  let waitingRooms = 0;
  let activeRooms = 0;
  let waitingPlayers = 0;
  let totalPlayers = 0;

  for (const count of roomPlayerCounts.values()) {
    totalPlayers += count;
    if (count >= 2) {
      activeRooms += 1;
    } else if (count === 1) {
      waitingRooms += 1;
      waitingPlayers += 1;
    }
  }

  return {
    totalRooms: roomPlayerCounts.size,
    waitingRooms,
    activeRooms,
    waitingPlayers,
    totalPlayers
  };
}






