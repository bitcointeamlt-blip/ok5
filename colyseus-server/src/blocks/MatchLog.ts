import * as fs from "fs";
import * as path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  result: "settled" | "draw" | "aborted" | "started";   // 🔎 „started" = mačas realiai startavo (prep) — be jo nesimatė, ar iki starto apskritai priėjo
  reason?: string;                // aborted priežastis
}

const FILE = path.join(process.cwd(), "blocks_matches.json");

// 🔎 08-20: mačų žurnalas DUBLIUOJAMAS į Supabase. Priežastis: `blocks_matches.json` gyvena
//    EFEMERIŠKAME Colyseus Cloud diske ir dingsta per kiekvieną redeploy/restartą, o Cloud CLI
//    runtime log'ų neatiduoda. Tad tiriant „žaidėjai sumoka, mačas neįvyksta" nebuvo JOKIO
//    pėdsako — tik on-chain mokėjimai be konteksto. Dabar kiekvienas wager mačo įvykis lieka DB.
let _sb: SupabaseClient | null = null; let _sbTried = false;
function sb(): SupabaseClient | null {
  if (_sbTried) return _sb;
  _sbTried = true;
  const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (url && key) _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}
function sbMirror(r: MatchRecord): void {
  const c = sb(); if (!c) return;
  const key = "blocksmatch_" + r.ts + "_" + (r.roomId || "x");
  c.from("f9_bases").upsert({ ronin_address: key, buildings: { blocksMatch: r } }, { onConflict: "ronin_address" })
    .then(({ error }: any) => { if (error) console.warn("[MatchLog] sb mirror fail:", error.message); }, () => {});
}
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
    sbMirror(r);   // 🔎 kad pėdsakas išliktų per restartus (žr. sbMirror komentarą)
    console.log(`[MatchLog] ${r.result} room=${r.roomId} tier=${r.tier} winner=${r.winner || "-"} prize=${r.prize} cut=${r.treasuryCut}`);
  },
  recent(n = 100): MatchRecord[] { return readAll().slice(-n).reverse(); },
};
