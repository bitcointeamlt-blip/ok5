// ⛏️🚦 Ar dienos-lubos patikra neužblokuoja ŠVARAUS žaidėjo (leidimo šaka)?
//   Švarus adresas: on-chain claimsCount=0/2 → withdraw PRIVALO praeiti ir grąžinti voucherį.
//   Tai pagrindinė regresijos rizika: patikra sukasi KAS KARTĄ, tad jei ji meta/klysta — nusiėmimas
//   lūžta visiems. Blokavimo šaka patikrinta vienetiškai prieš tikrą grandinę (skundęsis: 2/2 → left 0).
import { Client } from "colyseus.js";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const EP = process.argv[2] || "ws://localhost:2567";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const addr = ("0xf7" + String(Date.now()).slice(-8) + "0".repeat(40)).slice(0, 42);
const deck = Array.from({ length: 12 }, (_, i) => ({ utype: "skull", level: 1, tokenId: "dev" + i }));
const buildings = {
  wallLevel: 1, towerLevel: 1, towers: [], injured: [], deadUnits: [],
  cemPot: 0, cemTick: Date.now(), cemPower: 1000, cemNft: 15, cemRv: 1, cemWallet: 100, cemRamp: Date.now(),
  mineField: 12, mineReserve: 2, minePot: 1200, mineCheckpoint: 2000, dutyMode: "safe", mineGated: false,
};

let code = 1;
try {
  await sb.from("f9_bases").upsert({ ronin_address: addr, buildings }, { onConflict: "ronin_address" });
  const room = await new Client(EP).create("f9_pvp_room", { home: true, owner: addr, address: addr, name: "limit-test", deck });
  let res = null;
  room.onMessage("mine_withdraw_result", (e) => { res = e; });
  room.onMessage("*", () => {});
  await sleep(2500);
  const t0 = Date.now();
  room.send("mine_withdraw", {});
  for (let i = 0; i < 40 && !res; i++) await sleep(250);
  const ms = Date.now() - t0;
  try { await room.leave(); } catch (_) {}

  console.log("endpoint:", EP);
  console.log("atsakymas per", ms, "ms:", JSON.stringify(res));
  const { data: after } = await sb.from("f9_bases").select("buildings").eq("ronin_address", addr).maybeSingle();
  const pot = after?.buildings?.minePot;
  console.log("pot po bandymo:", pot, "(buvo 1200)");

  if (!res) console.log("\n❌ atsakymo NĖRA — patikra pakibo (RPC be timeout'o?)");
  else if (res.ok && res.claim) {
    console.log("\n✅ LEIDIMO ŠAKA OK — švarus žaidėjas gavo voucherį", Math.round(Number(res.claim.amount) / 1e18), "RONKE");
    console.log("   pot nurašytas:", pot != null && pot < 1200 ? "taip (teisinga)" : "NE (įtartina)");
    code = 0;
  } else if (/Daily on-chain limit/.test(res.error || "")) {
    console.log("\n❌ REGRESIJA — švarus žaidėjas (0/2) BLOKUOTAS:", res.error);
  } else {
    console.log("\n⚠️ kitas atmetimas (ne dėl lubos):", res.error);
  }
} catch (e) { console.log("ERR", e?.message); }
try { await sb.from("f9_bases").delete().eq("ronin_address", addr); console.log("testinė pilis ištrinta"); } catch (_) {}
process.exit(code);
