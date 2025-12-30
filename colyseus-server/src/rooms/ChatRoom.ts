import { Room, Client } from "@colyseus/core";
import { ChatState, ChatUser, ChatMessage } from "../schema/ChatState";

const MAX_MESSAGES = 120;

function clampText(s: any, maxLen: number): string {
  if (typeof s !== "string") return "";
  const t = s.trim();
  if (!t) return "";
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function nowId(): string {
  return `${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export class ChatRoom extends Room<ChatState> {
  maxClients = 5000;

  onCreate() {
    this.setState(new ChatState());

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
      // Only allow inviting connected users.
      const toClient = this.clients.find((c) => c.sessionId === toSid);
      if (!toClient) return;
      const payload = {
        fromSessionId: client.sessionId,
        toSessionId: toSid,
        ts: Date.now(),
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


