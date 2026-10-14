// node: pure.js の単体テスト（AC-07・AC-14）。使い方: node output\_dev\test_pure.js [settings.json のパス]
"use strict";
var path = require("path"), fs = require("fs");
var base = path.join(__dirname, "..", "sj2026-gunshi");
var P = require(path.join(base, "js", "pure.js"));
var L = require(path.join(base, "shindan", "shindan_logic.js"));
var PARAMS = require(path.join(base, "shindan", "shindan_params.js"));
var DATA = require(path.join(base, "shindan", "shindan_data.js"));

var pass = 0, fail = 0;
function ok(cond, name, info) {
  if (cond) { pass++; } else { fail++; console.log("FAIL " + name + (info !== undefined ? " " + JSON.stringify(info) : "")); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name, { got: a, want: b }); }

// ---- g1 ----
(function () {
  var lines = P.g1Lines("child");
  var pts = lines[0].pts;                                    // (290,420)→(990,420)
  eq(P.g1Project(pts, 500, 430).d, 10, "g1 距離（水平線から 10）");
  eq(Math.round(P.g1Project(pts, 500, 430).along), 210, "g1 弧長");
  eq(P.g1Project(pts, 500, 900).d, 200, "g1 距離の上限 200");
  var m = P.g1Metrics([0, 5, 12, 13, 30, 250], 12);
  eq(m, { inSamples: 3, totalSamples: 6, maxDev: 200 }, "g1 指標 既知の標本列（おとな tol 12）");
  var mc = P.g1Metrics([0, 5, 12, 13, 30, 24, 25], 24);
  eq(mc, { inSamples: 5, totalSamples: 7, maxDev: 30 }, "g1 指標 こども tol 24");
  var m0 = P.g1Metrics([], 12);
  ok(m0.totalSamples === 0 && !("maxDev" in m0), "g1 totalSamples 0 で maxDev なし", m0);
  ok(L.scoreGame(1, "adult", m0, PARAMS).s === 0, "g1 標本 0 は logic で 0 点");
  eq(P.g1Lines("adult").map(function (l) { return l.def.type; }), ["line", "quad", "cubic"], "g1 おとなは直線 1・曲線 2");
  eq(P.g1Lines("child").map(function (l) { return l.def.type; }), ["line", "line", "line"], "g1 こどもは直線 3");
  eq(P.g1Lines("adult")[1].pts.length, 200, "g1 曲線は 200 点");
})();

// ---- g2 ----
(function () {
  var parts = P.g2Parts("adult"), tate = parts[1];         // 立て板 目標 (250,410)
  eq(P.g2Judge(tate, 260, 420, 20), "snap", "g2 吸着（おとな 20 以内）");
  eq(P.g2Judge(tate, 280, 410, 20), "retry", "g2 置き直し（組立台の中の誤った位置）");
  eq(P.g2Judge(tate, 900, 300, 20), "out", "g2 台の外は数えない");
  eq(P.g2Judge(tate, 280, 410, 40), "snap", "g2 こどもの吸着 40");
  eq(P.g2Parts("child").length, 3, "g2 こども 3 部品");
  eq(P.g2Order(7, 5), [2, 3, 4, 0, 1], "g2 並び順 n mod 部品数 だけ回す");
  // 置き直し 2 回の集計
  var retries = 0;
  [[280, 410], [500, 300], [250, 410]].forEach(function (p) { if (P.g2Judge(tate, p[0], p[1], 20) === "retry") { retries++; } });
  eq(retries, 2, "g2 誤った位置に 2 回で retries=2");
  eq(P.g2Metrics(2, 1000, 24360, true), { retries: 2, seconds: 23.4, completed: true }, "g2 指標");
})();

// ---- g3 ----
(function () {
  var boxes = [{ x: 100, lane: "L", done: false }, { x: 400, lane: "R", done: false }, { x: -50, lane: "M", done: false }];
  var r1 = P.g3Press(boxes, "R", "adult");
  eq(r1, { index: 1, correct: true }, "g3 先頭（最も右）の荷を処理・正答");
  boxes[1].done = true;
  var r2 = P.g3Press(boxes, "R", "adult");
  eq(r2, { index: 0, correct: false }, "g3 誤答");
  boxes[0].done = true;
  eq(P.g3Press(boxes, "M", "child"), { ignored: true }, "g3 こどもの ↓ は無視");
  boxes[2].done = true;
  eq(P.g3Press(boxes, "L", "adult"), { ignored: true }, "g3 荷が無いときの入力は無視");
  eq(P.g3Tally(["correct", "wrong", "missed", "correct", "missed"]), { correct: 2, wrong: 1, missed: 2 }, "g3 集計");
  var lc = P.g3Labels(13, 100, "child");
  ok(lc.every(function (x) { return x === "L" || x === "R"; }), "g3 こどもの札は 2 行き先");
  eq(P.g3Labels(13, 10, "adult"), P.g3Labels(13, 10, "adult"), "g3 札は n で再現");
  // すべて逆キー → correct 0・wrong>0
  var bx = P.g3Labels(5, 10, "adult").map(function (l, i) { return { x: 1000 - i * 100, lane: l, done: false }; }), res = [];
  var opp = { L: "R", R: "L", M: "L" };
  for (var i = 0; i < bx.length; i++) { var t = P.g3Press(bx, opp[bx[i].lane], "adult"); bx[t.index].done = true; res.push(t.correct ? "correct" : "wrong"); }
  var tl = P.g3Tally(res);
  ok(tl.correct === 0 && tl.wrong > 0, "g3 すべて逆キーで correct=0・wrong>0", tl);
})();

// ---- g4 ----
(function () {
  var lays = [P.g4Layout("adult", 2), P.g4Layout("adult", 3), P.g4Layout("child", 2), P.g4Layout("child", 3)];
  eq(lays.map(P.g4Bfs), [5, 5, 4, 4], "g4 BFS 最短手数（おとな・反転・こども・反転）");
  eq(lays.map(function (l) { return l.shortest; }), [5, 5, 4, 4], "g4 定義値と一致");
  ok(lays[1].mirrored && !lays[0].mirrored, "g4 n 奇数で反転");
  var a = lays[0];
  eq(P.g4Run(a, ["U", "U", "R", "R", "R"]).result, "success", "g4 成功 ↑↑→→→");
  eq(P.g4Run(a, ["R", "U"]).result, "crash", "g4 棚衝突（先に右→上）");
  eq(P.g4Run(a, ["D"]).result, "crash", "g4 壁衝突（下端）");
  eq(P.g4Run(a, ["U", "U"]).result, "short", "g4 とどかない");
  var mid = P.g4Run(a, ["U", "U", "R", "R", "R", "L", "L"]);
  ok(mid.result === "success" && mid.steps === 5, "g4 途中到達で成功", mid);
  eq(P.g4Run(lays[1], ["U", "U", "L", "L", "L"]).result, "success", "g4 反転配置で成功");
  // 棚へぶつけてから成功 → runs≥2・success
  var runs = 0, success = false;
  [["R", "U"], ["U", "U", "R", "R", "R"]].forEach(function (c) { runs++; if (P.g4Run(a, c).result === "success") { success = true; } });
  ok(runs >= 2 && success, "g4 衝突後に成功 runs≥2");
})();

// ---- g1 標本の下限（設計変更票 #2 §3-4・AC-32 (1)） ----
(function () {
  function ln(samples, done) { return { samples: samples, done: !!done }; }
  function seq(n) { var a = []; for (var i = 0; i < n; i++) { a.push(i); } return a; }
  var empty = [ln([]), ln([])];
  eq(P.g1Filter([ln([1])].concat(empty), 20), [], "g1Filter 標本 1 個・未完了は無効");
  eq(P.g1Filter([ln([1, 2, 3], true)].concat(empty), 20), [1, 2, 3], "g1Filter 完了した線は標本数に関係なく有効");
  eq(P.g1Filter([ln(seq(20))].concat(empty), 20), seq(20), "g1Filter 標本 20 個（下限ちょうど）は有効");
  eq(P.g1Filter([ln(seq(19))].concat(empty), 20), [], "g1Filter 標本 19 個・未完了は無効");
  eq(P.g1Filter([ln([5, 6], true), ln(seq(20)), ln([7])], 20), [5, 6].concat(seq(20)), "g1Filter 有効線だけを連結（無効線は飛ばす）");
  var m1 = P.g1Metrics(P.g1Filter([ln([0])].concat(empty), 20), 12);
  ok(m1.totalSamples === 0 && !("maxDev" in m1) && L.scoreGame(1, "adult", m1, PARAMS).s === 0, "g1 標本 1 個だけは totalSamples 0 → logic で 0 点", m1);
  var m2 = P.g1Metrics(P.g1Filter([ln(seq(20).map(function () { return 0; }))].concat(empty), 20), 12);
  ok(m2.totalSamples === 20 && L.scoreGame(1, "adult", m2, PARAMS).s > 0, "g1 標本 20 個（線上）は採点される", m2);
})();

// ---- g2 つかみ判定（設計変更票 #2 §3-5・AC-33 (1)） ----
(function () {
  var parts = P.g2Parts("adult"), tri = parts[2], tate = parts[1];   // 補強 tri w=h=120／立て板 rect 40×260
  var cx = 500, cy = 400, M = 12, r2 = Math.SQRT1_2;
  ok(P.g2Hit(tri, cx, cy, cx - 20, cy + 20, M), "g2Hit 三角形の重心は true");
  ok(!P.g2Hit(tri, cx, cy, cx + 60, cy - 60, M), "g2Hit 外接矩形の右上角は false");
  ok(P.g2Hit(tri, cx, cy, cx + 8 * r2, cy - 8 * r2, M), "g2Hit 斜辺の外側 8px は true");
  ok(!P.g2Hit(tri, cx, cy, cx + 20 * r2, cy - 20 * r2, M), "g2Hit 斜辺の外側 20px は false");
  ok(P.g2Hit(tri, cx, cy, cx - 60 - 8, cy, M) && !P.g2Hit(tri, cx, cy, cx - 60 - 20, cy, M), "g2Hit 三角形の左辺 外側 8 は true・20 は false");
  ok(P.g2Hit(tate, 300, 300, 300 + 20 + 8, 300, M), "g2Hit 矩形の辺から外側 8px は true");
  ok(!P.g2Hit(tate, 300, 300, 300 + 20 + 20, 300, M), "g2Hit 矩形の辺から外側 20px は false");
  ok(P.g2Hit(tri, cx, cy, cx - 20, cy + 20, 0) && !P.g2Hit(tri, cx, cy, cx + 8 * r2, cy - 8 * r2, 0), "g2Hit margin 0 は図形の内側だけ true");
  // g2PickPart: 固定済みは除外・内側優先・同順位は手前（添字の大きい方）
  var A = { shape: "rect", w: 100, h: 100 }, B = { shape: "rect", w: 100, h: 100 };
  var ps = [A, B], cs = [{ x: 100, y: 100 }, { x: 210, y: 100 }];   // A: x 50..150／B: x 160..260（すき間 10 で余白が重なる）
  eq(P.g2PickPart(ps, cs, 155, 100, M), 1, "g2PickPart 余白が重なる位置は手前（後の添字）");
  eq(P.g2PickPart(ps, cs, 148, 100, M), 0, "g2PickPart 内側にある部品を優先（A の内側・B は余白）");
  eq(P.g2PickPart(ps, cs, 162, 100, M), 1, "g2PickPart 内側にある部品を優先（B の内側・A は余白）");
  eq(P.g2PickPart(ps, cs, 400, 400, M), -1, "g2PickPart 当たらなければ -1");
  var fixedA = { shape: "rect", w: 100, h: 100, fixed: true };
  eq(P.g2PickPart([fixedA], [{ x: 100, y: 100 }], 100, 100, M), -1, "g2PickPart 固定済みは除外");
  var triCenters = [{ x: cx, y: cy }];
  eq(P.g2PickPart([tri], triCenters, cx + 60, cy - 60, M), -1, "g2PickPart 三角形の外接矩形の角ではつかめない");
  eq(P.g2PickPart([tri], triCenters, cx - 20, cy + 20, M), 0, "g2PickPart 三角形の内側でつかめる");
})();

// ---- 軍師の一言（設計変更票 #2 §3-2・AC-28） ----
(function () {
  var vm = require("vm"), src = fs.readFileSync(path.join(base, "js", "texts.js"), "utf8"), ctx = {};
  vm.runInNewContext(src, ctx);
  var T = ctx.SJTexts, H = T.sheet.hitokoto, all = [], lens = [];
  for (var t = 0; t < 4; t++) { for (var s = 0; s < 4; s++) { if (t !== s) { var x = H.main[t] + H.sub[s]; all.push(x); lens.push(x.length); } } }
  eq(all.length, 12, "一言は 12 通り");
  eq(new Set(all).size, 12, "一言 12 通りはすべて異なる");
  ok(lens.every(function (n) { return n >= 40 && n <= 60; }), "一言は各 40〜60 字（句点込み）", lens);
  eq([H.main.length, H.sub.length], [4, 4], "一言は主文 4・従文 4");
  ok(T.axes.every(function (a) { return !("line" in a); }), "axes[].line は削除済み");
  eq([T.sheet.sub1, T.sheet.sub2], ["東信州産業の陣2026", "AI軍師の仕官相談所"], "肩書き 2 行");
  eq(H.main[0] + H.sub[1], "はみ出さず、最後までていねいに仕上げる手を持っている。組み立てる力もあわせ持つ。", "一言 主 K1×従 K2 の表示例");
})();

// ---- 設定値（AC-21・AC-21'） ----
(function () {
  var c = P.gameConfig("child"), d = P.gameConfig("adult");
  eq([c.g1.tol, d.g1.tol, c.g2.parts, d.g2.parts, c.g2.snap, d.g2.snap, c.g3.lanes, d.g3.lanes, c.g3.speed, d.g3.speed, c.g3.downKey,
    c.g4.size, c.g4.obstacles, d.g4.size, d.g4.obstacles], [24, 12, 3, 5, 40, 20, 2, 3, 96, 160, false, 4, 1, 5, 3], "設定値 こども／おとな");
  eq([c.g1.minSamples, d.g1.minSamples, c.g2.grabMargin, d.g2.grabMargin], [20, 20, 12, 12], "設定値 g1.minSamples=20・g2.grabMargin=12（両モード）");
})();

// ---- 表示ラベル（A-5 表の全値。設計変更票 #1） ----
(function () {
  eq(["不要", "当日可", "必須", "不明", undefined].map(P.reserveLabel),
    ["予約不要", "予約優先・空きがあれば当日可", "要予約", "予約は受付で確認", "予約は受付で確認"], "予約区分ラベル");
  eq(["", "記載なし", null, "（空欄）", "なし", "設定なし", "指定なし", "対象年齢なし", "小学生以上"].map(P.ageLabel),
    ["年齢条件は受付で確認", "年齢条件は受付で確認", "年齢条件は受付で確認", "年齢条件は受付で確認", "年齢制限なし", "年齢制限なし", "年齢制限なし", "年齢制限なし", "小学生以上"], "年齢注記ラベル");
  eq([P.durationLabel(30), P.durationLabel(null)], ["約 30 分", ""], "所要分ラベル");
  eq([P.costLabel(0), P.costLabel(500), P.costLabel(null)], ["無料", "500 円", ""], "費用円ラベル");
  eq(P.daysLabel({ d22: 1, d23: 0, d24: 1 }), "22・24日", "開催ラベル");
})();

// ---- applyOverrides（AC-14） ----
(function () {
  var ov = { "chuburikuun-T1": { mode: "on", ageMin: 0, reserve: "不要", noteAdd: "" } };
  // 「推挙しない」にする行: 通常 picks に出る推挙可の行を 1 つ選ぶ（day 22 の全年齢×軸 1 位で最も多く出る行）
  var file = process.argv[2];
  if (file) { ov = JSON.parse(fs.readFileSync(file, "utf8")).overrides || {}; console.log("settings: " + file + " overrides=" + Object.keys(ov).length); }
  var offId = Object.keys(ov).filter(function (k) { return ov[k].mode === "off"; })[0];
  function combos(data, P2) {
    var out = [];
    [22, 23].forEach(function (day) {
      [0, 1, 2, 3].forEach(function (age) {
        [0, 1, 2, 3].forEach(function (k) {
          var s = [20, 20, 20, 20]; s[k] = 80;
          out.push(L.recommend({ day: day, ageClass: age, n: 1, s: s, q1: "なし", q2: 0, q3: null }, data, {}, P2));
        });
      });
    });
    return out;
  }
  if (!offId) {
    var freq = {};
    combos(DATA, PARAMS).forEach(function (r) { r.picks.forEach(function (p) { freq[p.program_id] = (freq[p.program_id] || 0) + 1; }); });
    offId = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; })[0];
    ov[offId] = { mode: "off" };
  }
  console.log("AC-14: on=chuburikuun-T1 off=" + offId);
  var before = JSON.stringify(DATA.rows.filter(function (r) { return r.program_id === "chuburikuun-T1"; })[0]);
  var D2 = P.applyOverrides(DATA, ov);
  eq(JSON.stringify(DATA.rows.filter(function (r) { return r.program_id === "chuburikuun-T1"; })[0]), before, "applyOverrides 元データは不変");
  var on = D2.rows.filter(function (r) { return r.program_id === "chuburikuun-T1"; })[0];
  eq([on["要確認"], on["年齢下限区分"], on["予約区分"]], [0, 0, "不要"], "applyOverrides on の値");
  eq(D2.rows.filter(function (r) { return r.program_id === offId; })[0]["要確認"], 1, "applyOverrides off は要確認=1");
  var rs = combos(D2, PARAMS);
  ok(rs.every(function (r) { return r.candidates.some(function (c) { return c.program_id === "chuburikuun-T1"; }); }), "on の行が day 22/23 の全組合せで候補に入る");
  var offCount = rs.reduce(function (a, r) { return a + r.picks.filter(function (p) { return p.program_id === offId; }).length; }, 0);
  eq(offCount, 0, "off の行は picks に 0 回");
  var noteOv = P.applyOverrides(DATA, { "chuburikuun-T1": { mode: "on", ageMin: 1, reserve: "必須", noteAdd: "追記" } });
  ok(/追記$/.test(noteOv.rows.filter(function (r) { return r.program_id === "chuburikuun-T1"; })[0]["カード注記"]), "applyOverrides 注記の追記");
  var EP = P.effectiveParams(PARAMS, true);
  ok(EP.axisSource.K4 === "question" && PARAMS.axisSource.K4 === "game", "effectiveParams は複製を変える");
})();

console.log((fail === 0 ? "ALL PASS" : "FAILED") + " pass=" + pass + " fail=" + fail);
process.exit(fail === 0 ? 0 : 1);
