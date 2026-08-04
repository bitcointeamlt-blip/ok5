import * as fs from "fs";
import * as path from "path";

// 🧱📊 MATCH LOG — kiekvieno wager mačo įrašas dashboard'ui (kas žaidė, kas laimėjo, RONKE srautas, būsena).
// Rašom į blocks_matches.json (bendras failas, kaip PayoutQueue). Skaito :8802 dashboard PvP skiltis.

export interface MatchRecord {
  ts: number;
  roomId: string;
  wager: boolean;                 // true = statymas (RONKE); false = nemokamas mačas
  tier: number;
  pot: number;
  p1Name: string; p2Name: string; // žaidėjų vardai (nemokamiems mačams, kur nėra adresų)
  p1Addr: string; p1Tx: string;
  p2Addr: string; p2Tx: string;
  winner: "p1" | "p2" | "draw" | "";
  winnerAddr: string;
  loserAddr: string;
  prize: number;                  // laimėtojui (80%); draw/abort/free = 0
  treasuryCut: number;            // 20% (pot - prize); draw/abort/free = 0
  result: "settled" | "draw" | "aborted";
  reason?: string;                // aborted priežastis
}

const FILE = path.join(process.cwd(), "blocks_matches.json");
const MAX = 500;

function readAll(): MatchRecord[] {
  try { if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, "utf8")) || []; }
  catch (e: any) { console.error("[MatchLog] read fail:", e?.message); }
  return [];
}

export const MatchLog = {
  record(r: MatchRecord): void {
    const a = readAll();
    a.push(r);
    if (a.length > MAX) a.splice(0, a.length - MAX);
    try { fs.writeFileSync(FILE, JSON.stringify(a, null, 2)); } catch (e: any) { console.error("[MatchLog] write fail:", e?.message); }
    console.log(`[MatchLog] ${r.result} room=${r.roomId} tier=${r.tier} winner=${r.winner || "-"} prize=${r.prize} cut=${r.treasuryCut}`);
  },
  recent(n = 100): MatchRecord[] { return readAll().slice(-n).reverse(); },
};
