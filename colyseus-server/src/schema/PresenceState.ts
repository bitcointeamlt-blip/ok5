import { Schema, type } from "@colyseus/schema";

// Minimal schema state for presence_room.
// Colyseus' default serializer expects Schema (not plain objects).
export class PresenceState extends Schema {
  @type("number")
  count: number = 0;
}











