import { Client, Room } from "colyseus.js";

// Lightweight client-side presence connection.
// We join `presence_room` as soon as the page loads, so every visitor is counted as "online"
// regardless of whether they are playing, browsing profile, or in training.

function toWsEndpoint(endpoint: string): string {
  const trimmed = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  return trimmed
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://");
}

class PresenceService {
  private client: Client | null = null;
  private room: Room<any> | null = null;
  private endpoint: string | null = null;
  private connecting = false;
  private retryAt = 0;
  private retryDelayMs = 1500;

  start(endpoint: string | null | undefined): void {
    if (!endpoint) return;
    this.setEndpoint(endpoint);
  }

  setEndpoint(endpoint: string | null | undefined): void {
    if (!endpoint) return;
    const ws = toWsEndpoint(endpoint);
    if (this.endpoint === ws) return;
    this.endpoint = ws;
    this.retryDelayMs = 1500;
    this.retryAt = 0;
    this.connectNow();
  }

  private async connectNow(): Promise<void> {
    if (!this.endpoint) return;
    if (this.connecting) return;

    const now = Date.now();
    if (this.retryAt && now < this.retryAt) return;

    this.connecting = true;
    try {
      // Leave previous room if any
      if (this.room) {
        try { await this.room.leave(); } catch {}
        this.room = null;
      }

      this.client = new Client(this.endpoint);
      this.room = await this.client.joinOrCreate("presence_room", {
        // no PII; just a random nonce for debugging if needed
        v: 1,
        ts: Date.now()
      });

      // Reset backoff on success
      this.retryDelayMs = 1500;
      this.retryAt = 0;

      // If we get disconnected, reconnect with backoff
      this.room.onLeave(() => {
        // If we intentionally left while reconnecting, don't schedule another reconnect.
        if (this.connecting) return;
        this.room = null;
        this.scheduleReconnect();
      });
      this.room.onError(() => {
        if (this.connecting) return;
        this.scheduleReconnect();
      });
    } catch {
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect(): void {
    const now = Date.now();
    this.retryAt = now + this.retryDelayMs;
    this.retryDelayMs = Math.min(15000, Math.floor(this.retryDelayMs * 1.6));
    // fire-and-forget retry
    window.setTimeout(() => this.connectNow(), this.retryAt - now);
  }
}

export const presenceService = new PresenceService();



