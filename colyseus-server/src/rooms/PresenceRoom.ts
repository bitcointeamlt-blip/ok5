import { Room, Client } from "@colyseus/core";
import { registerRoom, unregisterRoom, updateRoomPlayerCount } from "../metrics/RoomMetrics";
import { PresenceState } from "../schema/PresenceState";

// Lightweight presence room:
// - every website visitor joins this room on page load
// - server counts connected clients as "presencePlayers"
export class PresenceRoom extends Room<any> {
  // Allow many concurrent visitors
  maxClients = 20000;

  onCreate(_options: any) {
    registerRoom(this.roomId, "presence");
    // Use Schema state (required by Colyseus default serializer).
    this.setState(new PresenceState());
  }

  onJoin(_client: Client, _options: any) {
    updateRoomPlayerCount(this.roomId, this.clients.length);
    try { (this.state as any).count = this.clients.length; } catch {}
  }

  onLeave(_client: Client, _consented: boolean) {
    updateRoomPlayerCount(this.roomId, this.clients.length);
    try { (this.state as any).count = this.clients.length; } catch {}
  }

  onDispose() {
    unregisterRoom(this.roomId);
  }
}


