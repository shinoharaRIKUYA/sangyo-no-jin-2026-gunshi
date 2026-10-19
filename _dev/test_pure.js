// node: pure.js・logic v2 の単体テスト（PRJ-107 AC-07・AC-14 ＋ PRJ-110 AC-03・04・12・17）。使い方: node _dev\test_pure.js [settings.json のパス]
// v2（PRJ-110）: scoreGame(game, ageClass 0〜5, m, params)・gameConfig(ageClass, mode)・三の陣はドラッグ方式（g3Pick/g3Drop/g3Labels(n,count,marks)）
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
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }
// fn が Error を投げれば true（re があればメッセージが一致するときだけ true）
function throws(fn, re) { try { fn(); return false; } catch (e) { return re ? re.test(String(e.message || e)) : true; } }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
var AGES = [0, 1, 2, 3, 4, 5];

// ---- g1 ----
(function () {
  var lines = P.g1Lines(0);
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
  ok(L.scoreGame(1, 3, m0, PARAMS).s === 0, "g1 標本 0 は logic で 0 点（v2: ageClass 3）");
  // PRJ-111: 段階ごとの本数 3〜8・曲線の数が増える
  eq(AGES.map(function (a) { return P.g1Lines(a).length; }), [3, 4, 5, 6, 7, 8], "g1 段階ごとの本数 3/4/5/6/7/8");
  eq(AGES.map(function (a) { return P.g1Lines(a).filter(function (l) { return l.def.type !== "line"; }).length; }), [0, 0, 2, 4, 5, 6], "g1 曲線の数 0/0/2/4/5/6");
  eq(P.g1Lines(0).map(function (l) { return l.def.type; }), ["line", "line", "line"], "g1 未就学児は直線 3");
  ok(P.g1Lines(5).some(function (l) { return l.id === "C3"; }), "g1 大人以上に Z 字（C3）");
  eq(P.g1Lines(3)[1].pts.length, 200, "g1 曲線は 200 点");
  ok(AGES.every(function (a) { return P.g1Lines(a).every(function (l) { return l.pts.every(function (q) { return q[0] >= 200 && q[0] <= 1080 && q[1] >= 205 && q[1] <= 635; }); }); }), "g1 全段階の線が板（190〜1090 × 200〜640）の内側");
  ok(throws(function () { P.g1Lines("adult"); }) && throws(function () { P.g1Lines(6); }), "g1Lines 旧署名・範囲外は Error");
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

// ---- g3 v2（PRJ-110 付録 B-2・AC-17。ドラッグ方式: 盤面 g3Layout・札 g3Labels(n,count,marks)・つかみ g3Pick・落とし g3Drop） ----
(function () {
  // 盤面（B-2-3）: ベルト y・蔵 x 40〜1240・すき間 20・y 500〜680。蔵の幅は式 (1200−20×(marks−1))/marks（設計変更票 #3）
  var lay1 = P.g3Layout(1, 2), lay2 = P.g3Layout(2, 3), lay3 = P.g3Layout(3, 4), lay5 = P.g3Layout(3, 5);
  eq([lay1, lay2, lay3].map(function (l) { return l.belts.map(function (b) { return b.y1; }); }), [[240], [170, 290], [130, 240, 350]], "g3Layout ベルト y（1／2／3 レーン）");
  eq(lay1.belts[0], { y1: 240, y2: 340, boxY: 245 }, "g3Layout ベルト高さ 100・荷は y+5");
  eq(lay1.bins.map(function (b) { return [b.x1, b.x2, b.mark]; }), [[40, 630, 0], [650, 1240, 1]], "g3Layout 蔵 2 個 幅 590");
  ok(near(lay2.bins[0].x2 - lay2.bins[0].x1, 1160 / 3) && near(lay2.bins[2].x2, 1240), "g3Layout 蔵 3 個 幅 386.67・右端 1240");
  eq(lay3.bins.map(function (b) { return b.x1; }), [40, 345, 650, 955], "g3Layout 蔵 4 個 幅 285");
  eq(lay5.bins.map(function (b) { return b.x2 - b.x1; }), [224, 224, 224, 224, 224], "g3Layout 蔵 5 個 幅 224");
  ok(lay5.bins.every(function (b) { return b.y1 === 500 && b.y2 === 680; }), "g3Layout 蔵 y 500〜680");
  eq(P.G3_MARKS.length, 5, "G3_MARKS は 5 種");
  eq(P.g3Marks(3).map(function (m) { return m.mark; }), ["●", "▲", "■"], "g3Marks(3) は先頭 3 種");
  // 札（seed = n。値域 0〜marks−1・再現・seed 差）
  var lb = P.g3Labels(13, 100, 3);
  ok(lb.length === 100 && lb.every(function (x) { return Number.isInteger(x) && x >= 0 && x < 3; }), "g3Labels 値域 0〜marks−1");
  eq(P.g3Labels(13, 10, 4), P.g3Labels(13, 10, 4), "g3Labels は n で再現");
  ok(JSON.stringify(P.g3Labels(13, 20, 4)) !== JSON.stringify(P.g3Labels(14, 20, 4)), "g3Labels seed が違えば列が違う");
  ok(P.g3Labels(7, 200, 5).indexOf(4) >= 0 && P.g3Labels(7, 200, 2).indexOf(2) < 0, "g3Labels marks 5 で 4 が出る・marks 2 で 2 は出ない");
  // つかみ（荷 90×90＋余白。先頭＝x 最大。done・x>1280 は対象外）
  var boxes = [{ x: 100, lane: 0, mark: 0, done: false }, { x: 400, lane: 0, mark: 1, done: false }, { x: 1300, lane: 0, mark: 0, done: false }];
  eq(P.g3Pick(boxes, lay1, 450, 290, 12), 1, "g3Pick 矩形内");
  eq(P.g3Pick(boxes, lay1, 380, 290, 12), -1, "g3Pick 余白 12 の外（左 20）");
  eq(P.g3Pick(boxes, lay1, 380, 290, 24), 1, "g3Pick 段階 0 の余白 24 なら入る");
  eq(P.g3Pick(boxes, lay1, 450, 232, 12), -1, "g3Pick 上の余白の外");
  eq(P.g3Pick(boxes, lay1, 450, 233, 12), 1, "g3Pick 上の余白の内");
  eq(P.g3Pick(boxes, lay1, 1320, 290, 12), -1, "g3Pick x>1280 の荷は対象外");
  boxes[1].done = true;
  eq(P.g3Pick(boxes, lay1, 450, 290, 12), -1, "g3Pick done は対象外");
  var ov = [{ x: 200, lane: 0, mark: 0, done: false }, { x: 260, lane: 0, mark: 1, done: false }];
  eq(P.g3Pick(ov, lay1, 270, 290, 12), 1, "g3Pick 重なりは先頭（x 大）を優先");
  eq(P.g3Pick(ov, lay1, 205, 290, 12), 0, "g3Pick 先頭に当たらなければ後ろ");
  var b2 = [{ x: 300, lane: 1, mark: 2, done: false }];
  eq(P.g3Pick(b2, lay2, 340, 340, 12), 0, "g3Pick 2 レーン目（boxY 295）");
  eq(P.g3Pick(b2, lay2, 340, 220, 12), -1, "g3Pick 1 レーン目の位置ではつかめない");
  eq(P.g3Pick([{ x: 300, lane: 5, mark: 0, done: false }], lay2, 340, 340, 12), -1, "g3Pick 存在しないレーンは無視");
  // 落とし（荷の中心が蔵の矩形内か・マーク一致か）
  var d = P.g3Drop(lay1.bins, 945, 590, 1);
  eq([d.hit, d.correct, d.bin.mark], [true, true, 1], "g3Drop 二番蔵に ▲ は correct");
  eq(P.g3Drop(lay1.bins, 945, 590, 0).correct, false, "g3Drop 二番蔵に ● は wrong");
  eq(P.g3Drop(lay1.bins, 640, 590, 0), { hit: false }, "g3Drop すき間（x 630〜650）は hit なし");
  eq(P.g3Drop(lay1.bins, 300, 290, 0), { hit: false }, "g3Drop ベルト上は hit なし");
  eq(P.g3Drop(lay1.bins, 40, 500, 0).hit, true, "g3Drop 角 (40,500) は含む");
  eq(P.g3Drop(lay1.bins, 300, 681, 0), { hit: false }, "g3Drop y 681 は外");
  eq(P.g3Drop(lay5.bins, 1130, 600, 4).correct, true, "g3Drop 五番蔵に ★ は correct");
  eq(P.g3Tally(["correct", "wrong", "missed", "correct", "missed"]), { correct: 2, wrong: 1, missed: 2 }, "g3 集計");
  ok(!("g3Press" in P) && !("g3Lanes" in P) && !("G3_LANES" in P), "g3Press・g3Lanes（v1 キー方式）は削除済み");
  // 段階表（B-2-1）
  eq(P.G3_STAGES.map(function (s) { return [s.lanes, s.marks]; }), [[1, 2], [1, 2], [2, 3], [2, 4], [3, 4], [3, 5]], "G3_STAGES レーン・マーク");
  eq(P.G3_STAGES.map(function (s) { return s.grabMargin; }), [24, 24, 12, 12, 12, 12], "G3_STAGES 余白（段階 0・1 は 24）");
})();

// ---- g4 ----
(function () {
  // PRJ-111: 全問題の定義値＝BFS 最短手数（反転も）。旧おとな a5・旧こども c4 は従来の検算をそのまま使う
  Object.keys(P.G4_PUZZLES).forEach(function (id) {
    var l0 = P.g4Layout(id, 0), l1 = P.g4Layout(id, 1);
    ok(P.g4Bfs(l0) === l0.shortest && P.g4Bfs(l1) === l1.shortest && l0.shortest <= 8, "g4 問題 " + id + " 最短 " + l0.shortest + " 手＝BFS（反転も）・8 以下");
  });
  eq(P.G4_STAGES.map(function (s) { return s.length; }), [1, 2, 2, 3, 3, 4], "g4 段階ごとの問題数 1/2/2/3/3/4");
  ok(P.G4_STAGES.every(function (s) { return s.length < 3 || P.G4_PUZZLES[s[s.length - 1]].shortest === 8; }), "g4 3 問以上の段階は最後が矢印 8 個");
  ok(P.G4_STAGES.every(function (s) { return s.length >= 3 || s.every(function (id) { return P.G4_PUZZLES[id].shortest < 8; }); }), "g4 2 問以下の段階に 8 手の問題はない");
  var lays = [P.g4Layout("a5", 2), P.g4Layout("a5", 3), P.g4Layout("c4", 2), P.g4Layout("c4", 3)];
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
  ok(m1.totalSamples === 0 && !("maxDev" in m1) && L.scoreGame(1, 3, m1, PARAMS).s === 0, "g1 標本 1 個だけは totalSamples 0 → logic で 0 点", m1);
  var m2 = P.g1Metrics(P.g1Filter([ln(seq(20).map(function () { return 0; }))].concat(empty), 20), 12);
  ok(m2.totalSamples === 20 && L.scoreGame(1, 3, m2, PARAMS).s > 0, "g1 標本 20 個（線上）は採点される", m2);
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

// ---- 設定値 v2（PRJ-110 §3-3・AC-12: gameConfig(ageClass, mode)。g1/g2/g4 は 0〜2 child・3〜5 adult、g3 は段階表） ----
(function () {
  var cfg = AGES.map(function (a) { return P.gameConfig(a, PARAMS.modeByAge[a]); });
  eq(cfg.map(function (c) { return c.g1.tol; }), [24, 22, 18, 16, 14, 12], "gameConfig g1.tol 段階別（PRJ-111）");
  ok(cfg.every(function (c) { return c.g1.limitSec === 45 && c.g4.limitSec === 45; }), "gameConfig g1・g4 の制限 45 秒（PRJ-111）");
  eq(cfg.map(function (c) { return c.g1.lines.length; }), [3, 4, 5, 6, 7, 8], "gameConfig g1.lines 本数");
  eq(cfg.map(function (c) { return c.g2.parts; }), [3, 3, 3, 5, 5, 5], "gameConfig g2.parts 3／5");
  eq(cfg.map(function (c) { return c.g2.snap; }), [40, 40, 40, 20, 20, 20], "gameConfig g2.snap 40／20");
  eq(cfg.map(function (c) { return c.g4.puzzles.length; }), [1, 2, 2, 3, 3, 4], "gameConfig g4.puzzles 問題数（PRJ-111）");
  eq(cfg.map(function (c) { return c.g3.lanes; }), [1, 1, 2, 2, 3, 3], "gameConfig g3.lanes 1/1/2/2/3/3");
  eq(cfg.map(function (c) { return c.g3.marks; }), [2, 2, 3, 4, 4, 5], "gameConfig g3.marks 2/2/3/4/4/5");
  eq(cfg.map(function (c) { return c.g3.speed; }), [96, 110, 130, 150, 170, 200], "gameConfig g3.speed");
  eq(cfg.map(function (c) { return c.g3.intervalSec; }), [2.4, 1.7, 2.5, 2.1, 2.6, 2.24], "gameConfig g3.intervalSec");
  ok(cfg.every(function (c) { return c.g3.limitSec === 40 && !("downKey" in c.g3); }), "gameConfig g3.limitSec 40・downKey なし");
  eq(cfg.map(function (c) { return c.mode; }), PARAMS.modeByAge, "gameConfig mode は modeByAge と一致");
  eq(cfg.map(function (c) { return c.ageClass; }), AGES, "gameConfig ageClass を返す");
  ok(cfg.every(function (c) { return c.g1.minSamples === 20 && c.g2.grabMargin === 12; }), "設定値 g1.minSamples=20・g2.grabMargin=12（全段階）");
  ok(throws(function () { P.gameConfig(6, "adult"); }) && throws(function () { P.gameConfig(-1, "child"); }) && throws(function () { P.gameConfig("adult"); }),
    "gameConfig ageClass 6・−1・\"adult\"（旧署名）は Error");
  var c3 = P.gameConfig(3, "adult"); c3.g3.speed = 1;
  eq(P.G3_STAGES[3].speed, 150, "gameConfig g3 は段階表の複製（書き換えが漏れない）");
})();

// ---- logic v2（PRJ-110 §3-1・B-1。AC-03 validateParams・AC-04 scoreGame(game, ageClass, m)） ----
(function () {
  eq([PARAMS.version, PARAMS.ageClasses.length, PARAMS.modeByAge.length, PARAMS.thresholds.length], ["v2", 6, 6, 6], "params v2 長さ 6");
  ok(!throws(function () { L.validateParams(PARAMS); }), "validateParams 正本は通る");
  var P5 = clone(PARAMS); P5.thresholds = P5.thresholds.slice(0, 5);
  ok(throws(function () { L.validateParams(P5); }, /6/), "AC-03 thresholds 5 要素は Error（メッセージに 6）");
  var PJ = clone(PARAMS); PJ.modeByAge[3] = "junior";
  ok(throws(function () { L.validateParams(PJ); }, /child\/adult/), "AC-03 modeByAge junior は Error（child/adult を含む）");
  var PK = clone(PARAMS); delete PK.thresholds[2].g3_count;
  ok(throws(function () { L.validateParams(PK); }, /g3_count/), "validateParams 閾値キー欠落は Error");
  // 悪値→0・良値→100（全段階×4 ゲーム）
  AGES.forEach(function (a) {
    var th = PARAMS.thresholds[a];
    var g1b = L.scoreGame(1, a, { onLineRate: th.g1_onLineRate[0], maxDev: th.g1_maxDev[0] }, PARAMS), g1g = L.scoreGame(1, a, { onLineRate: th.g1_onLineRate[1], maxDev: th.g1_maxDev[1] }, PARAMS);
    ok(g1b.s === 0 && g1g.s === 100, "scoreGame g1 a=" + a + " 悪値 0・良値 100", [g1b, g1g]);
    var g2b = L.scoreGame(2, a, { retries: th.g2_retries[0], seconds: th.g2_seconds[0], completed: true }, PARAMS), g2g = L.scoreGame(2, a, { retries: th.g2_retries[1], seconds: th.g2_seconds[1], completed: true }, PARAMS);
    ok(g2b.s === 0 && g2g.s === 100, "scoreGame g2 a=" + a + " 悪値 0・良値 100", [g2b, g2g]);
    var g3b = L.scoreGame(3, a, { correct: th.g3_count[0], wrong: 0, missed: 0 }, PARAMS), g3g = L.scoreGame(3, a, { correct: th.g3_count[1], wrong: 0, missed: 0 }, PARAMS);
    ok(g3b.p2 === 0 && g3g.p2 === 100 && g3g.s === 100, "AC-04 scoreGame g3 a=" + a + " count 悪値→p2 0・良値→p2 100", [g3b, g3g]);
    var g4b = L.scoreGame(4, a, { success: true, runs: th.g4_runs[0], shortest: th.g4_ratio[0] * 10, used: 10 }, PARAMS), g4g = L.scoreGame(4, a, { success: true, runs: th.g4_runs[1], shortest: 10, used: 10 }, PARAMS);
    ok(near(g4b.s, 0) && near(g4g.s, 100), "scoreGame g4 a=" + a + " 悪値 0・良値 100", [g4b, g4g]);
  });
  var m1 = { onLineRate: 50, maxDev: 40 };
  ok(L.scoreGame(1, 0, m1, PARAMS).p1 > L.scoreGame(1, 2, m1, PARAMS).p1, "AC-04 同じ入力で段階 0 の p1 > 段階 2 の p1");
  ok(near(L.scoreGame(3, 4, { correct: 25, wrong: 0, missed: 0 }, PARAMS).p2, (25 - 11) / (35 - 11) * 100), "B-1 検算 scoreGame(3,4,25).p2 = 58.3（2026-10-19 調整後の閾値 [11, 35]）");
  // PRJ-111: 四の陣の複数問は 1 問ずつ従来の式で採点して平均（未成功・時間切れの問題は 0）
  (function () {
    var th = PARAMS.thresholds[5], best = { r: th.g4_runs[1] }, one = L.scoreGame(4, 5, { success: true, runs: best.r, shortest: 8, used: 8 }, PARAMS);
    var all = L.scoreGame(4, 5, { success: [true, true, true, true], runs: [1, 1, 1, 1], shortest: [5, 6, 7, 8], used: [5, 6, 7, 8] }, PARAMS);
    ok(near(one.s, 100) && near(all.s, 100), "g4 複数問 全問最良で 100", [one, all]);
    var half = L.scoreGame(4, 5, { success: [true, true, false, false], runs: [1, 1, 0, 0], shortest: [5, 6, 7, 8], used: [5, 6, 0, 0] }, PARAMS);
    ok(near(half.s, 50), "g4 4 問中 2 問を最良で解けば 50（残りは 0 として平均）", half);
    var none = L.scoreGame(4, 5, { success: [false, false], runs: [3, 0], shortest: [5, 6], used: [0, 0] }, PARAMS);
    ok(none.s === 0, "g4 全問未成功は 0", none);
    var m = P.g4Metrics([{ success: true, runs: 2, used: 6 }], ["a5", "a6"]);
    eq(m, { success: [true, false], runs: [2, 0], shortest: [5, 6], used: [6, 0] }, "g4Metrics 未到達の問題は未成功で埋める");
  })();
  [6, -1, "3", "adult", 1.5, null].forEach(function (v) {
    ok(throws(function () { L.scoreGame(3, v, { correct: 1, wrong: 0, missed: 0 }, PARAMS); }), "AC-04 scoreGame ageClass " + JSON.stringify(v) + " は Error");
  });
  eq(AGES.map(function (a) { return L.modeOf(a, PARAMS); }), ["child", "child", "child", "adult", "adult", "adult"], "modeOf 0〜2 child・3〜5 adult");
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
      AGES.forEach(function (age) {                       // v2: 年齢段階 0〜5
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
