// 10-12 double-pay regression: concurrent flushQueue calls must pay each queued payout exactly once.
const os = require("os"), path = require("path"), fs = require("fs");
const dir = path.join(process.env.TEMP || os.tmpdir(), "payfix-test"); fs.mkdirSync(dir, { recursive: true });
process.chdir(dir); try { fs.unlinkSync("blocks_payouts.json"); } catch {}
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const B = path.join(__dirname, "build");
const { PayoutQueue } = require(B + "/blocks/PayoutQueue");
const { StakeService } = require(B + "/services/StakeService");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const mk = (mode) => {
  const s = new StakeService(); const sent = [];
  Object.defineProperty(s, "enabled", { value: true }); Object.defineProperty(s, "manual", { value: false });
  s._wallet = { address: "0x" + "1".repeat(40) };
  s._erc20 = () => ({
    balanceOf: async () => 10n ** 30n,
    transfer: async (to, amt) => {
      await new Promise((r) => setTimeout(r, 150));
      if (mode === "nogas") throw Object.assign(new Error("insufficient funds for intrinsic transaction cost"), { code: "INSUFFICIENT_FUNDS" });
      if (mode === "net") throw new Error("socket hang up");
      sent.push(to); return { hash: "0x" + String(sent.length).padStart(64, "0"), wait: async () => {} };
    },
  });
  return { s, sent };
};
(async () => {
  const addrs = [...Array(6)].map((_, i) => "0x" + String(i + 1).repeat(40).slice(0, 40));
  addrs.forEach((a, i) => PayoutQueue.add({ to: a, amount: 110, kind: "win", roomId: "room" + i }));
  // 1) no gas: nothing sent, everything back to pending
  const g = mk("nogas"); await Promise.all([g.s.flushQueue(), g.s.flushQueue()]);
  ok(g.sent.length === 0 && PayoutQueue.pending().length === 6, `no gas → 0 sent, 6 still pending (${PayoutQueue.pending().length})`);
  // 2) gas back: 3 concurrent calls on one service + a second service (= second process) at the same time
  const a = mk("ok"), b = mk("ok");
  await Promise.all([a.s.flushQueue(), a.s.flushQueue(), a.s.flushQueue(), b.s.flushQueue(), (async () => { await new Promise((r) => setTimeout(r, 400)); await a.s.flushQueue(); })()]);
  const all = [...a.sent, ...b.sent];
  ok(all.length === 6, `6 queued payouts → ${all.length} transfers`);
  ok(new Set(all).size === 6, "every address paid exactly once");
  ok(PayoutQueue.pending().length === 0, "nothing left pending");
  // 3) a later flush pays nothing again
  await a.s.flushQueue(); await b.s.flushQueue();
  ok(a.sent.length + b.sent.length === 6, "later flushes pay nothing more");
  // 4) network error after possible broadcast → stays 'sending', not retried
  PayoutQueue.add({ to: "0x" + "9".repeat(40), amount: 25, kind: "refund", roomId: "roomX" });
  const n = mk("net"); await n.s.flushQueue(); await n.s.flushQueue();
  const it = JSON.parse(fs.readFileSync("blocks_payouts.json", "utf8")).find((x) => x.roomId === "roomX");
  ok(it.status === "sending" && PayoutQueue.pending().length === 0, `unclear send error → '${it.status}', not retried`);
  console.log(fail ? `${fail} FAIL` : "ALL PASS"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
