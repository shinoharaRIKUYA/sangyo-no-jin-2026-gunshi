// node: ログ各行を shindan_logic で再計算して照合（AC-06・AC-22）
// 使い方: node output\_dev\verify_log.js output\sj2026-gunshi\data\log-22.jsonl [log-23.jsonl …]
"use strict";
var path = require("path"), fs = require("fs");
var base = path.join(__dirname, "..", "sj2026-gunshi");
var P = require(path.join(base, "js", "pure.js"));
var L = require(path.join(base, "shindan", "shindan_logic.js"));
var PARAMS = require(path.join(base, "shindan", "shindan_params.js"));
var DATA = require(path.join(base, "shindan", "shindan_data.js"));

// A-6-5 の許可リスト＋ts・phase
var ALLOWED = ["ts", "phase", "key", "client_id", "client_ts", "v", "day", "n", "n_source", "ageClass", "mode", "degrade",
  "games", "s", "q1", "q2", "q3", "top", "second", "picks", "honmei", "expCount", "counts_used", "ov"];

var files = process.argv.slice(2);
if (!files.length) { console.log("使い方: node verify_log.js <log-22.jsonl> …"); process.exit(2); }
var total = 0, mismatch = 0, badKeys = 0, tzBad = 0, kinds = { child: 0, adult: 0, degrade: 0, local: 0 };
files.forEach(function (f) {
  var lines = fs.readFileSync(f, "utf8").split(/\r?\n/).filter(function (x) { return x.trim() !== ""; });
  lines.forEach(function (line, i) {
    total++;
    var r = JSON.parse(line);
    var extra = Object.keys(r).filter(function (k) { return ALLOWED.indexOf(k) < 0; });
    if (extra.length) { badKeys++; console.log("KEYS " + path.basename(f) + ":" + (i + 1) + " " + extra.join(",")); }
    if (!/\+09:00$/.test(r.ts)) { tzBad++; }
    kinds[r.mode]++; if (r.degrade) { kinds.degrade++; } if (r.n_source === "local") { kinds.local++; }
    var Pe = P.effectiveParams(PARAMS, !!r.degrade);
    var data = P.applyOverrides(DATA, r.ov || {});
    var res;
    try {
      res = L.recommend({ day: r.day, ageClass: r.ageClass, n: r.n, s: r.s, q1: r.q1, q2: r.q2, q3: r.q3 }, data, r.counts_used || {}, Pe);
    } catch (e) { mismatch++; console.log("ERROR " + path.basename(f) + ":" + (i + 1) + " " + e.message); return; }
    var picks = res.picks.map(function (p) { return p.program_id; }), hon = res.honmei ? res.honmei.program_id : null;
    var okDeg = !r.degrade || (r.games.length === 3 && r.s[3] === 0);
    if (JSON.stringify(picks) !== JSON.stringify(r.picks) || hon !== r.honmei || !okDeg) {
      mismatch++;
      console.log("MISMATCH " + path.basename(f) + ":" + (i + 1) + " n=" + r.n + " log=" + JSON.stringify([r.picks, r.honmei]) + " calc=" + JSON.stringify([picks, hon]));
    }
  });
});
console.log("lines " + total + " / child " + kinds.child + " adult " + kinds.adult + " degrade " + kinds.degrade + " local " + kinds.local);
console.log("KEYS_EXTRA " + badKeys + " / TZ_NOT_+09:00 " + tzBad);
console.log("MISMATCH " + mismatch);
process.exit(mismatch === 0 && badKeys === 0 ? 0 : 1);
