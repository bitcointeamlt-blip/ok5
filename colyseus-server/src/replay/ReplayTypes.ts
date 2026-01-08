export type ReplayEndReason = "timeout" | "player_left" | "death" | "unknown";

export type ReplayPlayerMeta = {
  sid: string;
  address: string;
  profilePicture?: string;
  ufoTicketTokenId?: string; // bigint serialized as string
};

export type ReplayInputEvent = {
  t: number; // server ms timestamp
  sid: string;
  input: any; // sanitized PlayerInputMessage (we keep it flexible for forward-compat)
};

export type ReplaySnapshotPlayer = {
  sid: string;
  address?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  armor: number;
  maxHP: number;
  maxArmor: number;
  paralyzedUntil?: number;
};

export type ReplaySnapshot = {
  t: number; // server ms timestamp
  players: ReplaySnapshotPlayer[];
};

export type ReplaySettlement = {
  loserTokenId?: string;
  winnerAddress?: string;
  txHash?: string | null;
  contractAddress?: string;
  callerAddress?: string;
  error?: string;
};

export type ReplayV1 = {
  version: 1;
  id: string;
  roomId: string;
  roomName: string;
  createdAt: number;
  match: {
    startedAt?: number;
    plannedEndAt?: number;
    endedAt?: number;
    endReason?: ReplayEndReason;
    winnerSid?: string | null;
  };
  players: Record<string, ReplayPlayerMeta>;
  inputs: ReplayInputEvent[];
  snapshots: ReplaySnapshot[];
  settlement?: ReplaySettlement;
};


