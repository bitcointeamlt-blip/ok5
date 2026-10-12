// 10-12 regression: several PROCESSES sharing one blocks_payouts.json must pay each payout once.
const { fork } = require("child_process"), path = require("path"), fs = require("fs"), os = require("os");
const B = path.join(__dirname, "build");
const dir = path.join(process.env.TEMP || os.tmpdir(), "payfix-multi");
if (process.argv[2] === "child") {
  process.chdir(dir); delete process.env.SUPABASE_URL;
  const { StakeService } = require(B + "/services/StakeService");
  const s = new StakeService(); const sent = [];
  Object.defineProperty(s, "enabled", { value: true }); Object.defineProperty(s, "manual", { value: false });
  s._wallet = { address: "0x" + "1".repeat(40) };
  s._erc20 = () => ({ balanceOf: async () => 10n ** 30n, transfer: async (to) => { await new Promise((r) => setTimeout(r, 20 + Math.random() * 30)); sent.push(to); return { hash: "0x" + process.pid + "_" + sent.length }; } });
  const start = Number(process.argv[3]);
  setTimeout(async () => { await Promise.all([s.flushQueue(), s.flushQueue()]); await s.flushQueue(); process.send(sent); process.exit(0); }, start - Date.now());
  return;
}
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); process.chdir(dir); delete process.env.SUPABASE_URL;
const { PayoutQueue } = require(B + "/blocks/PayoutQueue");
const N = 40, P = 4;
for (let i = 0; i < N; i++) PayoutQueue.add({ to: "0x" + i.toString(16).padStart(40, "a"), amount: 110, kind: "win", roomId: "r" + i });
const start = Date.now() + 1500; const all = []; let done = 0;
for (let k = 0; k < P; k++) { const c = fork(__filename, ["child", String(start)], { silent: true }); c.on("message", (m) => { all.push(...m); if (++done === P) finish(); }); }
function finish() {
  const items = JSON.parse(fs.readFileSync("blocks_payouts.json", "utf8"));
  const ok1 = all.length === N, ok2 = new Set(all).size === N, ok3 = items.every((x) => x.status === "paid");
  console.log(`${P} processes, ${N} queued → ${all.length} transfers, ${new Set(all).size} unique, all paid in file: ${ok3}`);
  console.log(ok1 && ok2 && ok3 ? "ALL PASS" : "FAIL"); process.exit(ok1 && ok2 && ok3 ? 0 : 1);
}
