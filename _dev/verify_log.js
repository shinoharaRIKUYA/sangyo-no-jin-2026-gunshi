// node: ログ各行を shindan_logic で再計算して照合（PRJ-107 AC-06・AC-22 ＋ PRJ-110 AC-25）
// 使い方: node _dev\verify_log.js sj2026-gunshi\data\log-22.jsonl [log-23.jsonl …]
// v2（PRJ-110 §3-6・付録 B-5-2）: v が "2." で始まる行だけ照合し、それ以外（v1 "1.x"・試験用 "test" など）は件数を出して読み飛ばす（Q6 (a)）。
//   v2 行は recommend（picks・honmei）に加え、games[].m と ageClass から scoreGame v2 で s を再計算して照合する（縮退行は g=4 を除く）。
//   集計に段階別の件数と 1 位軸（本編 R-3 の確認用）を出す
"use strict";
var path = require("path"), fs = require("fs");
var base = path.join(__dirname, "..", "sj2026-gunshi");
var P = require(path.join(base, "js", "pure.js"));
var L = require(path.join(base, "shindan", "shindan_logic.js"));
var PARAMS = require(path.join(base, "shindan", "shindan_params.js"));
var DATA = require(path.join(base, "shindan", "shindan_data.js"));

// A-6-5 の許可リスト＋ts・phase（v1 と同じ）
var ALLOWED = ["ts", "phase", "key", "client_id", "client_ts", "v", "day", "n", "n_source", "ageClass", "mode", "degrade",
  "games", "s", "q1", "q2", "q3", "top", "second", "picks", "honmei", "expCount", "counts_used", "ov"];
// 必須キーは api.php の SJ_FINISH_REQUIRED と同じ集合（v は isV2 で保証済み）。api 側を変えたらここも揃える
var REQUIRED = ["key", "client_id", "day", "n", "n_source", "ageClass", "mode", "degrade",
  "games", "s", "q1", "q2", "top", "second", "picks", "honmei", "expCount"];
var EPS = 1e-6;
var AGE_N = PARAMS.ageClasses.length;

var files = process.argv.slice(2);
if (!files.length) { console.log("使い方: node verify_log.js <log-22.jsonl> …"); process.exit(2); }
var total = 0, skippedV1 = 0, v2 = 0, mismatch = 0, scoreMismatch = 0, badKeys = 0, tzBad = 0;
var kinds = { child: 0, adult: 0, degrade: 0, local: 0 };
var byAge = [], topByAge = [];
for (var a = 0; a < AGE_N; a++) { byAge.push(0); topByAge.push([0, 0, 0, 0]); }

function isV2(r) { return typeof r.v === "string" && r.v.indexOf("2.") === 0; }

files.forEach(function (f) {
  var lines = fs.readFileSync(f, "utf8").split(/\r?\n/).filter(function (x) { return x.trim() !== ""; });
  lines.forEach(function (line, i) {
    total++;
    var where = path.basename(f) + ":" + (i + 1);
    var r;
    try { r = JSON.parse(line); } catch (e) { mismatch++; console.log("ERROR " + where + " JSON: " + e.message); return; }
    // 1. 版で読み分け（v1 行・試験行は件数だけ）
    if (!isV2(r)) { skippedV1++; return; }
    v2++;
    // 2. 許可キー・必須キー（v1 と同じ）
    var extra = Object.keys(r).filter(function (k) { return ALLOWED.indexOf(k) < 0; });
    if (extra.length) { badKeys++; console.log("KEYS " + where + " extra " + extra.join(",")); }
    var missing = REQUIRED.filter(function (k) { return !(k in r); });
    if (missing.length) { badKeys++; console.log("KEYS " + where + " missing " + missing.join(",")); return; }
    if (!/\+09:00$/.test(r.ts)) { tzBad++; }
    kinds[r.mode]++; if (r.degrade) { kinds.degrade++; } if (r.n_source === "local") { kinds.local++; }
    if (Number.isInteger(r.ageClass) && r.ageClass >= 0 && r.ageClass < AGE_N) { byAge[r.ageClass]++; if (r.top >= 0 && r.top < 4) { topByAge[r.ageClass][r.top]++; } }
    else { mismatch++; console.log("ERROR " + where + " ageClass " + JSON.stringify(r.ageClass) + " は 0〜" + (AGE_N - 1) + " の外"); return; }
    var Pe = P.effectiveParams(PARAMS, !!r.degrade);
    // 3. 各陣の s を m と ageClass から再計算（|差| ≤ 1e-6。縮退行は g=4 を除く）
    (r.games || []).forEach(function (g) {
      if (r.degrade && g.g === 4) { return; }
      var sc;
      try { sc = L.scoreGame(g.g, r.ageClass, g.m, Pe); } catch (e) { scoreMismatch++; console.log("SCORE_ERROR " + where + " g=" + g.g + " " + e.message); return; }
      var d1 = Math.abs(sc.s - g.s), d2 = Math.abs(sc.s - r.s[g.g - 1]);
      if (!(d1 <= EPS) || !(d2 <= EPS)) {
        scoreMismatch++;
        console.log("SCORE_MISMATCH " + where + " g=" + g.g + " ageClass=" + r.ageClass + " games.s=" + g.s + " s[]=" + r.s[g.g - 1] + " calc=" + sc.s + " 差=" + Math.max(d1, d2));
      }
    });
    // 4. recommend の再計算と picks・honmei の照合（v1 と同じ）
    var data = P.applyOverrides(DATA, r.ov || {});
    var res;
    try {
      res = L.recommend({ day: r.day, ageClass: r.ageClass, n: r.n, s: r.s, q1: r.q1, q2: r.q2, q3: r.q3 }, data, r.counts_used || {}, Pe);
    } catch (e) { mismatch++; console.log("ERROR " + where + " " + e.message); return; }
    var picks = res.picks.map(function (p) { return p.program_id; }), hon = res.honmei ? res.honmei.program_id : null;
    var okDeg = !r.degrade || (r.games.length === 3 && r.s[3] === 0);
    if (JSON.stringify(picks) !== JSON.stringify(r.picks) || hon !== r.honmei || !okDeg) {
      mismatch++;
      console.log("MISMATCH " + where + " n=" + r.n + " log=" + JSON.stringify([r.picks, r.honmei]) + " calc=" + JSON.stringify([picks, hon]));
    }
  });
});
// 5. 集計
console.log("lines " + total + " / v2 " + v2 + " / skipped(not v2) " + skippedV1);
console.log("v2: child " + kinds.child + " adult " + kinds.adult + " degrade " + kinds.degrade + " local " + kinds.local);
console.log("byAge        " + PARAMS.ageClasses.map(function (nm, i) { return nm + "=" + byAge[i]; }).join(" "));
console.log("topByAge     " + PARAMS.ageClasses.map(function (nm, i) { return nm + "=[" + topByAge[i].map(function (c, k) { return "K" + (k + 1) + ":" + c; }).join(" ") + "]"; }).join(" "));
console.log("KEYS_BAD " + badKeys + " / TZ_NOT_+09:00 " + tzBad);
console.log("SCORE_MISMATCH " + scoreMismatch);
console.log("MISMATCH " + mismatch);
process.exit(mismatch === 0 && scoreMismatch === 0 && badKeys === 0 ? 0 : 1);
