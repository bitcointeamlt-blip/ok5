import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class ChatUser extends Schema {
  @type("string") sessionId: string = "";
  @type("string") address: string = "";
  @type("string") nickname: string = "";
  @type("number") joinedAt: number = 0;
}

export class ChatMessage extends Schema {
  @type("string") id: string = "";
  @type("string") fromSessionId: string = "";
  @type("string") fromAddress: string = "";
  @type("string") fromNickname: string = "";
  @type("string") text: string = "";
  @type("number") ts: number = 0;
  @type("string") kind: string = "chat"; // chat | system | invite
}

export class ChatState extends Schema {
  @type({ map: ChatUser })
  users = new MapSchema<ChatUser>();

  @type([ChatMessage])
  messages = new ArraySchema<ChatMessage>();
}











