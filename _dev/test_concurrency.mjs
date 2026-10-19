// node 18+: 2 クライアント × 各 50 件の finish（各 5 picks）を並列送信し、同じ 100 件を再送する（AC-09）
// 使い方: node output\_dev\test_concurrency.mjs [http://127.0.0.1:8107] [day=24]
// 前提: サーバーは SJ_RATE_MAX を十分大きくして起動（例 SJ_RATE_MAX=100000）。差分で判定するので何度でも実行できる
// picks は shindan_logic で本当に計算する。v2（PRJ-110）: ageClass は 0〜5 の両端 [0,5] を送る（modeOf で child/adult を引く。§4 #16）
// 注意: この payload の v は "test"・games[].m は仮の値なので、verify_log v2（v "2." の行だけ照合）はこれらの行を読み飛ばす
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(here, "..", "sj2026-gunshi");
const L = require(path.join(base, "shindan", "shindan_logic.js"));
const PARAMS = require(path.join(base, "shindan", "shindan_params.js"));
const DATA = require(path.join(base, "shindan", "shindan_data.js"));

const URL0 = process.argv[2] || "http://127.0.0.1:8107";
const DAY = parseInt(process.argv[3] || "24", 10);
const api = (a, q = "") => `${URL0}/api/api.php?a=${a}${q}`;
const dataDir = path.join(base, "data");
const readState = () => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, `state-${DAY}.json`), "utf8")); } catch { return { seq: 0, counts: {}, keys: {} }; } };
const logLines = () => { try { return fs.readFileSync(path.join(dataDir, `log-${DAY}.jsonl`), "utf8").split("\n").filter(Boolean).length; } catch { return 0; } };
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const hex8 = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");

// 5 picks になる組合せだけを使う
function makePayload(cid, seq) {
  for (let t = 0; t < 200; t++) {
    const age = [0, 5][(seq + t) % 2], mode = L.modeOf(age, PARAMS);
    const s = [0, 1, 2, 3].map(() => Math.round(Math.random() * 100));
    const q1 = ["木", "金属", "画面紙樹脂", "荷物乗り物", "なし"][(seq + t) % 5], q2 = [-1, 0, 1][(seq + t) % 3];
    const res = L.recommend({ day: DAY, ageClass: age, n: seq, s, q1, q2, q3: null }, DATA, {}, PARAMS);
    if (res.picks.length !== 5) { continue; }
    return {
      key: `${cid}-${seq}`, client_id: cid, client_ts: new Date().toISOString(), v: "test", day: DAY, n: seq, n_source: "server",
      ageClass: age, mode, degrade: false,
      games: [1, 2, 3, 4].map((g, k) => ({ g, end: "timeout", m: { t: 1 }, p1: s[k], p2: s[k], s: s[k], raw: {} })),
      s, q1, q2, q3: null, top: res.profile.top, second: res.profile.second,
      picks: res.picks.map((p) => p.program_id), honmei: res.honmei.program_id, expCount: res.experienceCount, counts_used: {}, ov: {}
    };
  }
  throw new Error("5 picks の組合せが見つからない");
}
async function post(b) {
  const r = await fetch(api("finish"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  return { status: r.status, json: await r.json() };
}

const st0 = readState(), log0 = logLines();
const clients = [`c-${hex8()}`, `c-${hex8()}`];
const payloads = [];
for (const c of clients) { for (let i = 1; i <= 50; i++) { payloads.push(makePayload(c, i)); } }
// 2 クライアントを交互に並べ、全件を並列送信
const order = []; for (let i = 0; i < 50; i++) { order.push(payloads[i], payloads[50 + i]); }
const r1 = await Promise.all(order.map(post));
const st1 = readState(), log1 = logLines();
const r2 = await Promise.all(order.map(post));
const st2 = readState(), log2 = logLines();

const checks = [
  ["1 回目 すべて 200・dup:false", r1.every((r) => r.status === 200 && r.json.dup === false)],
  ["counts 合計の増分 = 500", sum(st1.counts) - sum(st0.counts) === 500],
  ["keys の増分 = 100", Object.keys(st1.keys || {}).length - Object.keys(st0.keys || {}).length === 100],
  ["seq は finish で変わらない", st1.seq === st0.seq],
  ["log 行数の増分 = 100", log1 - log0 === 100],
  ["再送 すべて 200・dup:true", r2.every((r) => r.status === 200 && r.json.dup === true)],
  ["再送で counts 不変", JSON.stringify(st2.counts) === JSON.stringify(st1.counts)],
  ["再送で log 不変", log2 === log1]
];
checks.forEach(([n, ok]) => console.log((ok ? "ok   " : "NG   ") + n));
console.log(`day ${DAY}: counts ${sum(st0.counts)}→${sum(st1.counts)}→${sum(st2.counts)} / log ${log0}→${log1}→${log2}`);
console.log(checks.every((c) => c[1]) ? "PASS" : "FAIL");
process.exit(checks.every((c) => c[1]) ? 0 : 1);
