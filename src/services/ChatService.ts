import { Client, Room } from "colyseus.js";

export type ChatUser = {
  sessionId: string;
  address: string;
  nickname: string;
  joinedAt: number;
};

export type ChatMessage = {
  id: string;
  kind: "chat" | "system" | "invite";
  fromSessionId: string;
  fromAddress: string;
  fromNickname: string;
  text: string;
  ts: number;
};

function toWsEndpoint(endpoint: string): string {
  const trimmed = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  return trimmed
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://");
}

class ChatService {
  private client: Client | null = null;
  private room: Room<any> | null = null;
  private endpoint: string | null = null;
  private connecting = false;
  private retryAt = 0;
  private retryDelayMs = 1500;
  private connState: "idle" | "connecting" | "connected" | "offline" = "idle";
  private lastError: string | null = null;

  private _users = new Map<string, ChatUser>();
  private _messages: ChatMessage[] = [];

  onUsersChanged: ((users: ChatUser[]) => void) | null = null;
  onMessagesChanged: ((messages: ChatMessage[]) => void) | null = null;
  onInvite: ((fromSessionId: string) => void) | null = null;

  start(endpoint: string | null | undefined, me: { address: string; nickname: string }): void {
    if (!endpoint) return;
    this.setEndpoint(endpoint, me);
  }

  setEndpoint(endpoint: string | null | undefined, me: { address: string; nickname: string }): void {
    if (!endpoint) return;
    const ws = toWsEndpoint(endpoint);
    this.endpoint = ws;
    this.retryDelayMs = 1500;
    this.retryAt = 0;
    void this.connectNow(me);
  }

  getUsers(): ChatUser[] {
    return Array.from(this._users.values());
  }

  getMessages(): ChatMessage[] {
    return this._messages.slice();
  }

  getRoomSessionId(): string | null {
    return (this.room as any)?.sessionId || null;
  }

  isConnected(): boolean {
    return this.connState === "connected" && !!this.room;
  }

  getConnectionState(): "idle" | "connecting" | "connected" | "offline" {
    return this.connState;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  sendChat(text: string): void {
    const t = (text || "").trim();
    if (!t) return;
    try {
      if (!this.room) {
        this.lastError = "Chat not connected";
        return;
      }
      this.room.send("chat", { text: t });
    } catch {}
  }

  sendInvite(toSessionId: string): void {
    if (!toSessionId) return;
    try {
      this.room?.send("invite", { toSessionId });
    } catch {}
  }

  private async connectNow(me: { address: string; nickname: string }): Promise<void> {
    if (!this.endpoint) return;
    if (this.connecting) return;
    const now = Date.now();
    if (this.retryAt && now < this.retryAt) return;

    this.connecting = true;
    this.connState = "connecting";
    try {
      if (this.room) {
        try { await this.room.leave(); } catch {}
        this.room = null;
      }

      this.client = new Client(this.endpoint);
      this.room = await this.client.joinOrCreate("chat_room", {
        address: me.address || "",
        nickname: me.nickname || "",
        ts: Date.now()
      });
      this.connState = "connected";
      this.lastError = null;

      // Bind state listeners
      this._users.clear();
      this._messages = [];

      const users = (this.room.state as any)?.users;
      if (users?.onAdd) {
        users.onAdd((u: any, key: string) => {
          this._users.set(key, {
            sessionId: u?.sessionId || key,
            address: u?.address || "",
            nickname: u?.nickname || "",
            joinedAt: u?.joinedAt || 0,
          });
          this.onUsersChanged?.(this.getUsers());
        });
        users.onRemove((_u: any, key: string) => {
          this._users.delete(key);
          this.onUsersChanged?.(this.getUsers());
        });
      }

      const msgs = (this.room.state as any)?.messages;
      if (msgs?.onAdd) {
        msgs.onAdd((m: any) => {
          this._messages.push({
            id: m?.id || `${Date.now()}`,
            kind: (m?.kind as any) || "chat",
            fromSessionId: m?.fromSessionId || "",
            fromAddress: m?.fromAddress || "",
            fromNickname: m?.fromNickname || "",
            text: m?.text || "",
            ts: m?.ts || Date.now(),
          });
          if (this._messages.length > 200) this._messages.splice(0, this._messages.length - 200);
          this.onMessagesChanged?.(this.getMessages());
        });
      }

      this.room.onMessage("duel_invite", (msg: any) => {
        const fromSid = typeof msg?.fromSessionId === "string" ? msg.fromSessionId : "";
        if (fromSid) this.onInvite?.(fromSid);
      });

      this.room.onLeave(() => {
        this.room = null;
        this.connState = "offline";
        this.scheduleReconnect(me);
      });
      this.room.onError(() => {
        this.connState = "offline";
        this.scheduleReconnect(me);
      });

      // Notify once
      this.onUsersChanged?.(this.getUsers());
      this.onMessagesChanged?.(this.getMessages());
      this.retryDelayMs = 1500;
      this.retryAt = 0;
    } catch {
      this.connState = "offline";
      this.lastError = "Failed to connect";
      this.scheduleReconnect(me);
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect(me: { address: string; nickname: string }): void {
    const now = Date.now();
    this.retryAt = now + this.retryDelayMs;
    this.retryDelayMs = Math.min(15000, Math.floor(this.retryDelayMs * 1.6));
    window.setTimeout(() => void this.connectNow(me), Math.max(0, this.retryAt - now));
  }
}

export const chatService = new ChatService();


