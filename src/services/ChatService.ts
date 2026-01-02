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

export type DuelInvite = {
  fromSessionId: string;
  fromAddress?: string;
  toSessionId: string;
  ts: number;
  serverEndpoint?: string;
  roomName?: string;
};

export type DuelOffer = {
  id: string;
  fromSid: string;
  fromAddress: string;
  fromNick: string;
  toSid: string;
  toAddress: string;
  toNick: string;
  fromAccepted: boolean;
  toAccepted: boolean;
  serverEndpoint: string;
  roomName: string;
  createdAt: number;
  status: "pending" | "declined" | "cancelled" | "start";
};

export type DuelInviteResponse = {
  fromSessionId: string;
  toSessionId: string;
  accepted: boolean;
  ts: number;
  serverEndpoint?: string;
  roomName?: string;
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
  private lastMe: { address: string; nickname: string } | null = null;

  private _users = new Map<string, ChatUser>();
  private _messages: ChatMessage[] = [];

  onUsersChanged: ((users: ChatUser[]) => void) | null = null;
  onMessagesChanged: ((messages: ChatMessage[]) => void) | null = null;
  onInvite: ((fromSessionId: string) => void) | null = null;
  onInvitePayload: ((msg: DuelInvite) => void) | null = null;
  onInviteResponse: ((msg: DuelInviteResponse) => void) | null = null;
  onDuelOffer: ((offer: DuelOffer) => void) | null = null;
  onDuelOfferUpdate: ((offer: DuelOffer) => void) | null = null;
  onDuelOfferStart: ((offer: DuelOffer) => void) | null = null;

  start(endpoint: string | null | undefined, me: { address: string; nickname: string }): void {
    if (!endpoint) return;
    this.setEndpoint(endpoint, me);
  }

  setEndpoint(endpoint: string | null | undefined, me: { address: string; nickname: string }): void {
    if (!endpoint) return;
    const ws = toWsEndpoint(endpoint);
    this.lastMe = { address: (me?.address || "").trim(), nickname: (me?.nickname || "").trim() };

    // If endpoint didn't change, don't force reconnect (prevents LIVE/OFFLINE flicker).
    if (this.endpoint === ws) {
      // If already connected, just update profile.
      if (this.room && this.connState === "connected") {
        this.updateIdentity(this.lastMe);
      }
      return;
    }

    this.endpoint = ws;
    this.retryDelayMs = 1500;
    this.retryAt = 0;
    void this.connectNow(this.lastMe);
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

  sendInvite(toSessionId: string, meta?: { serverEndpoint?: string; roomName?: string }): void {
    if (!toSessionId) return;
    try {
      if (!this.room) {
        this.lastError = "Chat not connected";
        return;
      }
      this.room.send("invite", {
        toSessionId,
        serverEndpoint: meta?.serverEndpoint || "",
        roomName: meta?.roomName || "",
      });
    } catch {}
  }

  sendDuelOfferCreate(toSessionId: string, meta?: { serverEndpoint?: string; roomName?: string }): void {
    if (!toSessionId) return;
    try {
      if (!this.room) {
        this.lastError = "Chat not connected";
        return;
      }
      this.room.send("duel_offer_create", {
        toSessionId,
        serverEndpoint: meta?.serverEndpoint || "",
        roomName: meta?.roomName || "",
      });
    } catch {}
  }

  sendDuelOfferAction(offerId: string, action: "accept" | "decline" | "cancel"): void {
    if (!offerId) return;
    try {
      if (!this.room) {
        this.lastError = "Chat not connected";
        return;
      }
      this.room.send("duel_offer_action", { offerId, action });
    } catch {}
  }

  sendInviteResponse(
    toSessionId: string,
    accepted: boolean,
    meta?: { serverEndpoint?: string; roomName?: string; toAddress?: string }
  ): void {
    if (!toSessionId) return;
    try {
      if (!this.room) {
        this.lastError = "Chat not connected";
        return;
      }
      this.room.send("invite_response", {
        toSessionId,
        accepted: !!accepted,
        serverEndpoint: meta?.serverEndpoint || "",
        roomName: meta?.roomName || "",
        toAddress: meta?.toAddress || "",
      });
    } catch {}
  }

  // Update my address/nickname without reconnecting.
  updateIdentity(me: { address: string; nickname: string }): void {
    try {
      if (!this.room) return;
      this.room.send("set_profile", {
        address: (me.address || "").trim(),
        nickname: (me.nickname || "").trim(),
      });
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
      // NOTE: don't clear messages on reconnect; keeping old messages prevents visible "refresh" flicker.
      // If you need to clear history (e.g. switching endpoints), that's handled by endpoint change above.

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
        const toSid = typeof msg?.toSessionId === "string" ? msg.toSessionId : "";
        const ts = typeof msg?.ts === "number" ? msg.ts : Date.now();
        const serverEndpoint = typeof msg?.serverEndpoint === "string" ? msg.serverEndpoint : "";
        const roomName = typeof msg?.roomName === "string" ? msg.roomName : "";
        const fromAddress = typeof msg?.fromAddress === "string" ? msg.fromAddress : "";
        if (fromSid && toSid) {
          this.onInvitePayload?.({ fromSessionId: fromSid, toSessionId: toSid, ts, serverEndpoint, roomName, fromAddress });
        }
      });

      const bindOffer = (msg: any): DuelOffer | null => {
        try {
          const id = typeof msg?.id === "string" ? msg.id : "";
          const fromSid = typeof msg?.fromSid === "string" ? msg.fromSid : "";
          const toSid = typeof msg?.toSid === "string" ? msg.toSid : "";
          if (!id || !fromSid || !toSid) return null;
          return {
            id,
            fromSid,
            fromAddress: typeof msg?.fromAddress === "string" ? msg.fromAddress : "",
            fromNick: typeof msg?.fromNick === "string" ? msg.fromNick : "",
            toSid,
            toAddress: typeof msg?.toAddress === "string" ? msg.toAddress : "",
            toNick: typeof msg?.toNick === "string" ? msg.toNick : "",
            fromAccepted: !!msg?.fromAccepted,
            toAccepted: !!msg?.toAccepted,
            serverEndpoint: typeof msg?.serverEndpoint === "string" ? msg.serverEndpoint : "",
            roomName: typeof msg?.roomName === "string" ? msg.roomName : "",
            createdAt: typeof msg?.createdAt === "number" ? msg.createdAt : Date.now(),
            status: (typeof msg?.status === "string" ? msg.status : "pending") as any,
          };
        } catch {
          return null;
        }
      };

      this.room.onMessage("duel_offer", (msg: any) => {
        const offer = bindOffer(msg);
        if (offer) this.onDuelOffer?.(offer);
      });
      this.room.onMessage("duel_offer_update", (msg: any) => {
        const offer = bindOffer(msg);
        if (offer) this.onDuelOfferUpdate?.(offer);
      });
      this.room.onMessage("duel_offer_start", (msg: any) => {
        const offer = bindOffer(msg);
        if (offer) this.onDuelOfferStart?.(offer);
      });

      this.room.onMessage("duel_invite_response", (msg: any) => {
        const fromSid = typeof msg?.fromSessionId === "string" ? msg.fromSessionId : "";
        const toSid = typeof msg?.toSessionId === "string" ? msg.toSessionId : "";
        const accepted = !!msg?.accepted;
        const ts = typeof msg?.ts === "number" ? msg.ts : Date.now();
        const serverEndpoint = typeof msg?.serverEndpoint === "string" ? msg.serverEndpoint : "";
        const roomName = typeof msg?.roomName === "string" ? msg.roomName : "";
        if (!fromSid || !toSid) return;
        this.onInviteResponse?.({ fromSessionId: fromSid, toSessionId: toSid, accepted, ts, serverEndpoint, roomName });
      });

      this.room.onLeave(() => {
        // If we intentionally left while reconnecting, don't schedule another reconnect.
        if (this.connecting) return;
        this.room = null;
        this.connState = "offline";
        this.scheduleReconnect(this.lastMe || me);
      });
      this.room.onError(() => {
        // If we're in the middle of connectNow(), ignore transient errors from the old room.
        if (this.connecting) return;
        this.connState = "offline";
        this.scheduleReconnect(this.lastMe || me);
      });

      // Notify once
      this.onUsersChanged?.(this.getUsers());
      this.onMessagesChanged?.(this.getMessages());
      this.retryDelayMs = 1500;
      this.retryAt = 0;
    } catch {
      this.connState = "offline";
      this.lastError = "Failed to connect";
      this.scheduleReconnect(this.lastMe || me);
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


