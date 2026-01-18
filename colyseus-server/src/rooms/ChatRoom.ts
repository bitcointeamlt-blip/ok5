import { Room, Client } from "@colyseus/core";
import { ChatState, ChatUser, ChatMessage } from "../schema/ChatState";
import { randomBytes } from "crypto";

const MAX_MESSAGES = 120;

function clampText(s: any, maxLen: number): string {
  if (typeof s !== "string") return "";
  const t = s.trim();
  if (!t) return "";
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

// Use cryptographically secure random for ID generation
function nowId(): string {
  return `${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export class ChatRoom extends Room<ChatState> {
  maxClients = 5000;
  private duelOffers = new Map<string, {
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
  }>();

  private sendDuelOfferToBoth(offer: any, type: "duel_offer" | "duel_offer_update" | "duel_offer_start"): void {
    try {
      const a = this.clients.find((c) => c.sessionId === offer.fromSid);
      const b = this.clients.find((c) => c.sessionId === offer.toSid);
      if (a) { try { a.send(type, offer); } catch {} }
      if (b) { try { b.send(type, offer); } catch {} }
    } catch {}
  }

  onCreate() {
    this.setState(new ChatState());

    // Client can update their public profile (address/nickname) after joining
    this.onMessage("set_profile", (client, message: any) => {
      const u = this.state.users.get(client.sessionId);
      if (!u) return;
      const nickname = clampText(message?.nickname, 16);
      const address = clampText(message?.address, 80);
      if (nickname) u.nickname = nickname;
      if (address) u.address = address;
    });

    this.onMessage("chat", (client, message: any) => {
      const text = clampText(message?.text, 220);
      if (!text) return;
      this.appendMessage({
        kind: "chat",
        fromSessionId: client.sessionId,
        text,
      });
    });

    // Duel invite: server forwards to target sessionId
    this.onMessage("invite", (client, message: any) => {
      const toSid = typeof message?.toSessionId === "string" ? message.toSessionId : "";
      if (!toSid) return;
      const serverEndpoint = typeof message?.serverEndpoint === "string" ? message.serverEndpoint : "";
      const roomName = typeof message?.roomName === "string" ? message.roomName : "";
      // Only allow inviting connected users.
      const toClient = this.clients.find((c) => c.sessionId === toSid);
      if (!toClient) return;
      const fromUser = this.state.users.get(client.sessionId);
      const fromAddress = (fromUser?.address || "").trim();
      const payload = {
        fromSessionId: client.sessionId,
        fromAddress,
        toSessionId: toSid,
        ts: Date.now(),
        serverEndpoint,
        roomName,
      };
      try {
        toClient.send("duel_invite", payload);
      } catch {}
      // Also add a system message in chat (optional, lightweight)
      this.appendMessage({
        kind: "invite",
        fromSessionId: client.sessionId,
        text: `invited ${toSid}`,
      });
    });

    // New duel offer handshake (both must accept)
    this.onMessage("duel_offer_create", (client, message: any) => {
      const toSid = typeof message?.toSessionId === "string" ? message.toSessionId : "";
      if (!toSid) return;
      const serverEndpoint = typeof message?.serverEndpoint === "string" ? message.serverEndpoint : "";
      const roomName = typeof message?.roomName === "string" ? message.roomName : "";
      const toClient = this.clients.find((c) => c.sessionId === toSid);
      if (!toClient) return;

      const fromUser = this.state.users.get(client.sessionId);
      const toUser = this.state.users.get(toSid);
      const offerId = nowId();
      const offer = {
        id: offerId,
        fromSid: client.sessionId,
        fromAddress: (fromUser?.address || "").trim(),
        fromNick: (fromUser?.nickname || "").trim(),
        toSid,
        toAddress: (toUser?.address || "").trim(),
        toNick: (toUser?.nickname || "").trim(),
        fromAccepted: false,
        toAccepted: false,
        serverEndpoint,
        roomName,
        createdAt: Date.now(),
        status: "pending" as const,
      };
      this.duelOffers.set(offerId, offer);
      this.sendDuelOfferToBoth(offer, "duel_offer");
    });

    this.onMessage("duel_offer_action", (client, message: any) => {
      const offerId = typeof message?.offerId === "string" ? message.offerId : "";
      const action = typeof message?.action === "string" ? message.action : "";
      if (!offerId || !action) return;
      const offer = this.duelOffers.get(offerId);
      if (!offer) return;

      const isFrom = client.sessionId === offer.fromSid;
      const isTo = client.sessionId === offer.toSid;
      if (!isFrom && !isTo) return;

      if (action === "accept") {
        if (isFrom) offer.fromAccepted = true;
        if (isTo) offer.toAccepted = true;
      } else if (action === "decline") {
        offer.status = "declined";
      } else if (action === "cancel") {
        offer.status = "cancelled";
      }

      // Start when both accepted
      if (offer.status === "pending" && offer.fromAccepted && offer.toAccepted) {
        offer.status = "start";
        this.sendDuelOfferToBoth(offer, "duel_offer_start");
        this.duelOffers.delete(offerId);
        return;
      }

      // Terminal states: notify both and clear
      if (offer.status === "declined" || offer.status === "cancelled") {
        this.sendDuelOfferToBoth(offer, "duel_offer_update");
        this.duelOffers.delete(offerId);
        return;
      }

      // Otherwise broadcast updated accept states
      this.sendDuelOfferToBoth(offer, "duel_offer_update");
    });

    // Duel invite response: receiver forwards accepted/declined back to inviter sessionId
    this.onMessage("invite_response", (client, message: any) => {
      const toSid = typeof message?.toSessionId === "string" ? message.toSessionId : "";
      const accepted = !!message?.accepted;
      const serverEndpoint = typeof message?.serverEndpoint === "string" ? message.serverEndpoint : "";
      const roomName = typeof message?.roomName === "string" ? message.roomName : "";
      const toAddress = typeof message?.toAddress === "string" ? message.toAddress : "";
      if (!toSid) return;
      let toClient = this.clients.find((c) => c.sessionId === toSid) || null;
      // If inviter sessionId changed (reconnect), try routing by stable address.
      if (!toClient && toAddress) {
        let targetSid = "";
        this.state.users.forEach((u) => {
          if (targetSid) return;
          if ((u?.address || "").trim() === toAddress) targetSid = u.sessionId;
        });
        if (targetSid) {
          toClient = this.clients.find((c) => c.sessionId === targetSid) || null;
        }
      }
      if (!toClient) return;
      const payload = {
        fromSessionId: client.sessionId,
        toSessionId: toSid,
        accepted,
        ts: Date.now(),
        serverEndpoint,
        roomName,
      };
      try {
        toClient.send("duel_invite_response", payload);
      } catch {}
      this.appendMessage({
        kind: "invite",
        fromSessionId: client.sessionId,
        text: accepted ? `accepted invite from ${toSid}` : `declined invite from ${toSid}`,
      });
    });
  }

  onJoin(client: Client, options: any) {
    const address = clampText(options?.address, 80);
    const nickname = clampText(options?.nickname, 16);
    const u = new ChatUser();
    u.sessionId = client.sessionId;
    u.address = address;
    u.nickname = nickname;
    u.joinedAt = Date.now();
    this.state.users.set(client.sessionId, u);

    this.appendMessage({
      kind: "system",
      fromSessionId: client.sessionId,
      text: "joined",
    });
  }

  onLeave(client: Client) {
    this.state.users.delete(client.sessionId);
    this.appendMessage({
      kind: "system",
      fromSessionId: client.sessionId,
      text: "left",
    });
  }

  private appendMessage(args: { kind: string; fromSessionId: string; text: string }) {
    const u = this.state.users.get(args.fromSessionId);
    const m = new ChatMessage();
    m.id = nowId();
    m.kind = args.kind;
    m.fromSessionId = args.fromSessionId;
    m.fromAddress = u?.address || "";
    m.fromNickname = u?.nickname || "";
    m.text = args.text;
    m.ts = Date.now();

    this.state.messages.push(m);
    if (this.state.messages.length > MAX_MESSAGES) {
      // Remove oldest
      this.state.messages.shift();
    }
  }
}


