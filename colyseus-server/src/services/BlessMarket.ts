import { ethers } from "ethers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { boneBankOp } from "./BaseStore";
import { blessConsume, blessCredit } from "./BlessBank";

// ⚡🛒 BLESS ITEMŲ MARKETAS (2026-08-18, user: „bless tradable — pardavėjas nustato kainą ir kiek nori
//   parduoti, 5% mokestis į treasury").
//
// BLESS yra OFF-CHAIN balansas (`<addr>#bless`), tad on-chain PewPewMarket escrow (ERC721) čia netinka.
// Modelis (user patvirtintas 08-13): SELL = itemai užrakinami serveryje, BUY = pirkėjas pats siunčia
// RONKE, serveris verifikuoja TX kvitus (WagerEntry šablonas) → perkelia itemus.
//
//   LIST    seller → items iš balanso į escrow (`blessConsume`), sukuriama eilutė `blessmkt_<id>`
//   RESERVE buyer  → 3 min rezervacija (kad du pirkėjai nemokėtų už tą patį lotą)
//   BUY     buyer  → 2 RONKE pavedimai: 95% PARDAVĖJUI + 5% TREASURY (mokestis) → serveris tikrina
//                    abu kvitus (from=pirkėjas, EXACT sumos, šviežūs, dedupe) → itemai pirkėjui
//   CANCEL  seller → itemai grįžta į balansą (negalima, kol galioja svetima rezervacija)
//
// ⚠️ Pinigai eina TIESIOGIAI tarp žaidėjų piniginių — jokio kustodijos tarpininko, jokios payout eilės.
//   Pardavėjas gauna RONKE tą pačią sekundę, kai pirkėjas pasirašo. Serveris tik liudija kvitus.
// 🛡 Fail-closed: DB/RPC triktis → sandoris NEįvyksta ir itemai lieka escrow (niekada nedingsta).

const RONKE = (process.env.RONKE_TOKEN_ADDR || "0xf988f63bf26C3Ed3fBf39922149E3E7b1e5c27cB").toLowerCase();
const TREASURY = (process.env.BLESS_MKT_TREASURY || "0xfF0a2d76E6156Bc1C0c689fe4029f6F1a566E92e").toLowerCase();
const FEE_BPS = Math.max(0, Math.min(1000, Number(process.env.BLESS_MKT_FEE_BPS || 500)));   // 5% (cap 10%, kaip NFT markete)
const MAX_TX_AGE_MS = Number(process.env.BLESS_MKT_TX_AGE_MS || 60 * 60 * 1000);             // kvitas ne senesnis nei 1 h
const RESERVE_MS = Number(process.env.BLESS_MKT_RESERVE_MS || 3 * 60 * 1000);                // rezervacija apmokėjimui
const MAX_QTY = 999;
const MAX_PRICE = 1e7;
const MAX_ACTIVE_PER_SELLER = 10;   // anti-spam: kiek aktyvių lotų vienu metu
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

const RPCS = [...new Set((process.env.RONKE_RPCS || [
  "https://ronin.gateway.tenderly.co",
  process.env.RONKE_RPC_URL,
  process.env.RONIN_MAINNET_RPC,
  "https://api.roninchain.com/rpc",
].filter(Boolean).join(",")).split(",").map((s) => s.trim()).filter(Boolean))];

let _prov: ethers.AbstractProvider | null = null;
function prov(): ethers.AbstractProvider {
  if (_prov) return _prov;
  _prov = RPCS.length > 1
    ? new ethers.FallbackProvider(RPCS.map((u, i) => ({ provider: new ethers.JsonRpcProvider(u, 2020, { staticNetwork: true, batchMaxCount: 1 }), priority: i + 1, stallTimeout: 2500, weight: 1 })), 2020, { quorum: 1 })
    : new ethers.JsonRpcProvider(RPCS[0] || "https://api.roninchain.com/rpc", 2020, { staticNetwork: true, batchMaxCount: 1 });
  return _prov;
}

let _sb: SupabaseClient | null = null; let _sbTried = false;
function sb(): SupabaseClient | null {
  if (_sbTried) return _sb;
  _sbTried = true;
  const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}

const _norm = (a: string) => (a || "").trim().toLowerCase();
const _row = (id: string) => "blessmkt_" + id;
const _isAddr = (a: string) => /^0x[0-9a-f]{40}$/.test(a);

export type BlessListing = {
  id: string; seller: string; qty: number; price: number;      // price = už 1 BLESS
  totalWei: string; feeWei: string; sellerWei: string;
  status: "active" | "sold" | "cancelled";
  at: number; resvAddr?: string; resvUntil?: number;
  buyer?: string; soldAt?: number; txSeller?: string; txFee?: string;
};

export function blessMarketFeeBps(): number { return FEE_BPS; }
export function blessMarketTreasury(): string { return TREASURY; }

// Kainos → wei (95% pardavėjui, 5% treasury; dalyba wei lygyje, be dust'o).
export function blessMarketSplit(qty: number, price: number): { totalWei: bigint; feeWei: bigint; sellerWei: bigint } {
  const total = ethers.parseUnits((Math.round(qty * price * 100) / 100).toFixed(2), 18);
  const fee = (total * BigInt(FEE_BPS)) / 10000n;
  return { totalWei: total, feeWei: fee, sellerWei: total - fee };
}

function _clean(r: any, id: string): BlessListing | null {
  if (!r || !r.seller) return null;
  return {
    id, seller: String(r.seller), qty: Number(r.qty) || 0, price: Number(r.price) || 0,
    totalWei: String(r.totalWei || "0"), feeWei: String(r.feeWei || "0"), sellerWei: String(r.sellerWei || "0"),
    status: (r.status === "sold" || r.status === "cancelled") ? r.status : "active",
    at: Number(r.at) || 0, resvAddr: r.resvAddr, resvUntil: Number(r.resvUntil) || 0,
    buyer: r.buyer, soldAt: Number(r.soldAt) || 0,
  };
}

async function _get(id: string): Promise<BlessListing | null> {
  const c = sb(); if (!c) return null;
  const { data, error } = await c.from("f9_bases").select("buildings").eq("ronin_address", _row(id)).maybeSingle();
  if (error) throw new Error("[BlessMarket] read: " + error.message);
  return _clean((data as any)?.buildings, id);
}
async function _put(l: BlessListing): Promise<void> {
  const c = sb(); if (!c) throw new Error("[BlessMarket] no db");
  const { id, ...rest } = l;
  const { error } = await c.from("f9_bases").upsert(
    { ronin_address: _row(id), units: [], buildings: rest, updated_at: new Date().toISOString() },
    { onConflict: "ronin_address" },
  );
  if (error) throw new Error("[BlessMarket] write: " + error.message);
}

// ── BROWSE: aktyvūs lotai (naujausi viršuje). Parduoti/atšaukti nerodomi. ──
export async function blessMarketBrowse(limit = 60): Promise<BlessListing[]> {
  const c = sb(); if (!c) return [];
  try {
    const { data, error } = await c.from("f9_bases").select("ronin_address, buildings")
      .like("ronin_address", "blessmkt_%").order("updated_at", { ascending: false }).limit(Math.max(1, Math.min(200, limit * 3)));
    if (error) return [];
    const out: BlessListing[] = [];
    for (const r of (data as any[]) || []) {
      const l = _clean(r.buildings, String(r.ronin_address).slice("blessmkt_".length));
      if (l && l.status === "active" && l.qty > 0) out.push(l);
      if (out.length >= limit) break;
    }
    return out;
  } catch { return []; }
}

// ── LIST: itemai iš balanso į escrow. Nepavykus įrašyti loto — itemai GRĄŽINAMI. ──
export async function blessMarketList(seller: string, qty: number, price: number): Promise<{ ok: boolean; reason?: string; listing?: BlessListing }> {
  const s = _norm(seller);
  const q = Math.floor(Number(qty) || 0), p = Math.round((Number(price) || 0) * 100) / 100;
  if (!_isAddr(s)) return { ok: false, reason: "no_wallet" };
  if (!(q >= 1 && q <= MAX_QTY)) return { ok: false, reason: "bad_qty" };
  if (!(p > 0 && p <= MAX_PRICE)) return { ok: false, reason: "bad_price" };
  try {
    const mine = (await blessMarketBrowse(200)).filter((l) => l.seller === s);
    if (mine.length >= MAX_ACTIVE_PER_SELLER) return { ok: false, reason: "too_many_listings" };
  } catch { /* browse triktis neblokuoja listinimo */ }

  const taken = await blessConsume(s, q);          // 🔒 itemai iškart iš balanso (fail-closed viduje)
  if (!taken.ok) return { ok: false, reason: "not_enough" };
  const split = blessMarketSplit(q, p);
  const id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const listing: BlessListing = {
    id, seller: s, qty: q, price: p,
    totalWei: split.totalWei.toString(), feeWei: split.feeWei.toString(), sellerWei: split.sellerWei.toString(),
    status: "active", at: Date.now(),
  };
  try { await _put(listing); }
  catch (e: any) { await blessCredit(s, q); return { ok: false, reason: "db" }; }   // ↩️ įrašas nepavyko → itemai atgal
  console.log(`[BlessMarket] 📦 LIST ${q}×BLESS @${p} (${s.slice(0, 10)}…, id ${id})`);
  return { ok: true, listing };
}

// ── CANCEL: itemai grįžta pardavėjui. Blokuojama, kol galioja SVETIMA rezervacija. ──
export async function blessMarketCancel(seller: string, id: string): Promise<{ ok: boolean; reason?: string; qty?: number }> {
  const s = _norm(seller);
  if (!_isAddr(s) || !id) return { ok: false, reason: "bad_req" };
  return boneBankOp("blessmkt#" + id, async () => {
    try {
      const l = await _get(id);
      if (!l) return { ok: false, reason: "not_found" };
      if (l.seller !== s) return { ok: false, reason: "not_seller" };
      if (l.status !== "active") return { ok: false, reason: "not_active" };
      if (l.resvAddr && l.resvAddr !== s && (l.resvUntil || 0) > Date.now()) return { ok: false, reason: "reserved" };
      if (!(await _lockFinal(id, s, "cancel"))) return { ok: false, reason: "gone" };   // 🔐 pirkėjas spėjo pirmas
      await _put({ ...l, status: "cancelled", resvAddr: undefined, resvUntil: 0 });
      await blessCredit(s, l.qty);
      console.log(`[BlessMarket] ↩️ CANCEL ${l.qty}×BLESS (${s.slice(0, 10)}…, id ${id})`);
      return { ok: true, qty: l.qty };
    } catch { return { ok: false, reason: "db" }; }
  });
}

// ── RESERVE: 3 min langas apmokėjimui (kad du pirkėjai nemokėtų už tą patį lotą). ──
export async function blessMarketReserve(buyer: string, id: string): Promise<{ ok: boolean; reason?: string; listing?: BlessListing; until?: number }> {
  const b = _norm(buyer);
  if (!_isAddr(b) || !id) return { ok: false, reason: "bad_req" };
  return boneBankOp("blessmkt#" + id, async () => {
    try {
      const l = await _get(id);
      if (!l) return { ok: false, reason: "not_found" };
      if (l.status !== "active") return { ok: false, reason: "gone" };
      if (l.seller === b) return { ok: false, reason: "own_listing" };
      const now = Date.now();
      if (l.resvAddr && l.resvAddr !== b && (l.resvUntil || 0) > now) return { ok: false, reason: "busy" };
      const until = now + RESERVE_MS;
      const nl = { ...l, resvAddr: b, resvUntil: until };
      await _put(nl);
      return { ok: true, listing: nl, until };
    } catch { return { ok: false, reason: "db" }; }
  });
}

// Vienas RONKE pavedimas: from=pirkėjas, to=gavėjas, EXACT suma, tx šviežias. Dedupe atskirai (žr. _useTx).
async function _verifyTransfer(buyer: string, to: string, needWei: bigint, txHash: string): Promise<{ ok: boolean; reason?: string }> {
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) return { ok: false, reason: "bad_tx" };
  let rc: any = null;
  for (let i = 0; i < 6 && !rc; i++) {
    try { rc = await prov().getTransactionReceipt(txHash); } catch (_) { /* 429/timeout → bandom vėl */ }
    if (!rc) await new Promise((r) => setTimeout(r, 2500));
  }
  if (!rc) return { ok: false, reason: "tx_not_found" };
  if (rc.status !== 1) return { ok: false, reason: "tx_failed" };
  let sawFrom = false;
  for (const lg of rc.logs) {
    if (String(lg.address).toLowerCase() !== RONKE) continue;
    if (lg.topics[0] !== TRANSFER_TOPIC || lg.topics.length < 3) continue;
    const f = ("0x" + lg.topics[1].slice(26)).toLowerCase();
    const t = ("0x" + lg.topics[2].slice(26)).toLowerCase();
    if (f !== buyer) continue;
    sawFrom = true;
    if (t === to && BigInt(lg.data) === needWei) {
      let blk: any = null;
      for (let i = 0; i < 3 && !blk; i++) { try { blk = await prov().getBlock(rc.blockNumber); } catch (_) {} if (!blk) await new Promise((r) => setTimeout(r, 1200)); }
      if (blk && Date.now() - Number(blk.timestamp) * 1000 > MAX_TX_AGE_MS) return { ok: false, reason: "tx_expired" };
      return { ok: true };
    }
  }
  return { ok: false, reason: sawFrom ? "wrong_amount" : "wrong_to" };
}

/* DEDUPE: unikalus insert — tas pats kvitas antram pirkiniui nepraeis (fail-closed be DB).
 * „own" = tą patį kvitą tam pačiam lotui pateikia TAS PATS pirkėjas → tai jo paties kartojimas
 * (pvz. apmokėjo pardavėjui, nutrūko ties mokesčiu, bando dar kartą) — leidžiam. */
async function _useTx(txHash: string, id: string, buyer: string, kind: string): Promise<"ok" | "own" | "used"> {
  const c = sb(); if (!c) return "used";
  const { error } = await c.from("f9_bases").insert({ ronin_address: "blessmkttx_" + txHash, buildings: { blessMkt: { id, buyer, kind, at: Date.now() } } });
  if (!error) return "ok";
  try {
    const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", "blessmkttx_" + txHash).maybeSingle();
    const m = (data as any)?.buildings?.blessMkt;
    if (m && String(m.id) === id && String(m.buyer).toLowerCase() === buyer && String(m.kind) === kind) return "own";
  } catch { /* skaityti nepavyko → laikom panaudotu (fail-closed) */ }
  return "used";
}
/* 🔐 GALUTINIS UŽRAKTAS (2026-08-18): lotą galima uždaryti (parduoti ARBA atšaukti) tik VIENĄ kartą.
 * Unikalus PK insert'as = atominis per visus procesus: kas įrašė pirmas — tas ir uždarė. Be šito
 * du pirkėjai (arba pirkėjas ir tuo pat metu atšaukiantis pardavėjas) galėtų gauti tuos pačius itemus. */
async function _lockFinal(id: string, who: string, kind: string): Promise<boolean> {
  const c = sb(); if (!c) return false;
  const { error } = await c.from("f9_bases").insert({ ronin_address: "blessmktdone_" + id, buildings: { id, who, kind, at: Date.now() } });
  return !error;
}
async function _unlockFinal(id: string): Promise<void> {
  const c = sb(); if (!c) return;
  try { await c.from("f9_bases").delete().eq("ronin_address", "blessmktdone_" + id); } catch { /* best-effort */ }
}

// ── BUY: du kvitai (95% pardavėjui + 5% treasury) → itemai pirkėjui. ──
export async function blessMarketBuy(buyer: string, id: string, txSeller: string, txFee: string): Promise<{ ok: boolean; reason?: string; qty?: number; listing?: BlessListing }> {
  const b = _norm(buyer);
  const t1 = _norm(txSeller), t2 = _norm(txFee);
  if (!_isAddr(b) || !id) return { ok: false, reason: "bad_req" };
  if (t1 === t2) return { ok: false, reason: "bad_tx" };

  // 1) Loto patikra + rezervacija (be pinigų judėjimo)
  let listing: BlessListing | null = null;
  try { listing = await _get(id); } catch { return { ok: false, reason: "db" }; }
  if (!listing) return { ok: false, reason: "not_found" };
  if (listing.status !== "active") return { ok: false, reason: "gone" };
  if (listing.seller === b) return { ok: false, reason: "own_listing" };
  if (listing.resvAddr && listing.resvAddr !== b && (listing.resvUntil || 0) > Date.now()) return { ok: false, reason: "busy" };

  // 2) Kvitai — TIK skaitymas iš grandinės (lėta dalis, todėl PRIEŠ užraktą)
  const vs = await _verifyTransfer(b, listing.seller, BigInt(listing.sellerWei), t1);
  if (!vs.ok) return { ok: false, reason: "seller_" + (vs.reason || "bad") };
  const vf = await _verifyTransfer(b, TREASURY, BigInt(listing.feeWei), t2);
  if (!vf.ok) return { ok: false, reason: "fee_" + (vf.reason || "bad") };

  // 3) Atomiškas užbaigimas per loto eilę: dedupe TX → itemai pirkėjui → lotas „sold"
  return boneBankOp("blessmkt#" + id, async () => {
    try {
      const l = await _get(id);
      if (!l || l.status !== "active") return { ok: false, reason: "gone" };
      // 🔐 lotą uždarom atomiškai PIRMA (kad antras pirkėjas nebegautų tų pačių itemų), tada kvitų dedupe;
      //    jei kvitas jau panaudotas — užraktą atleidžiam, kad lotas neliktų įstrigęs.
      if (!(await _lockFinal(id, b, "buy"))) return { ok: false, reason: "gone" };
      const u1 = await _useTx(t1, id, b, "seller");
      if (u1 === "used") { await _unlockFinal(id); return { ok: false, reason: "tx_used" }; }
      const u2 = await _useTx(t2, id, b, "fee");
      if (u2 === "used") { await _unlockFinal(id); return { ok: false, reason: "tx_used" }; }
      await _put({ ...l, status: "sold", buyer: b, soldAt: Date.now(), txSeller: t1, txFee: t2, resvAddr: undefined, resvUntil: 0 });
      await blessCredit(b, l.qty);   // 🎒 itemai pirkėjui (best-effort kaip visur, bet lotas jau „sold")
      console.log(`[BlessMarket] 💰 SOLD ${l.qty}×BLESS @${l.price} → ${b.slice(0, 10)}… (pardavėjas ${l.seller.slice(0, 10)}…, id ${id})`);
      return { ok: true, qty: l.qty, listing: { ...l, status: "sold", buyer: b } };
    } catch { return { ok: false, reason: "db" }; }
  });
}
