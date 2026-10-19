// 産業の陣2026 AI軍師の仕官相談所 — 純関数（DOM に触れない）
// ブラウザでは window.SJPure、node では require() の戻り値（UMD）。
// 指標の計算・盤面定義・BFS・上書き適用・表示ラベル。点数の計算はしない（採点は ShindanLogic.scoreGame）。
(function (root) {
  "use strict";

  // ---- 共通 -------------------------------------------------------------
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function round1(x) { return Math.round(x * 10) / 10; }

  // mulberry32（三の陣の札。seed = n）
  function mulberry32(seed) {
    var a = (seed >>> 0) || 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- 三の陣 v2 の段階表（PRJ-110 付録 B-2-1。添字 = ageClass 0〜5。前提値・10/20 で見直す） --------
  var G3_STAGES = [
    { lanes: 1, marks: 2, speed: 96,  intervalSec: 2.4, grabMargin: 24, limitSec: 40 },   // 0 未就学児
    { lanes: 1, marks: 2, speed: 110, intervalSec: 2.0, grabMargin: 24, limitSec: 40 },   // 1 低学年
    { lanes: 2, marks: 3, speed: 130, intervalSec: 1.6, grabMargin: 12, limitSec: 40 },   // 2 高学年
    { lanes: 2, marks: 4, speed: 150, intervalSec: 1.3, grabMargin: 12, limitSec: 40 },   // 3 中学生
    { lanes: 3, marks: 4, speed: 170, intervalSec: 1.1, grabMargin: 12, limitSec: 40 },   // 4 高校生
    { lanes: 3, marks: 5, speed: 200, intervalSec: 0.9, grabMargin: 12, limitSec: 40 }    // 5 大人以上
  ];

  // ---- 各陣の設定（A-3。AC-11 で window.__sj.config に出す） -------------
  // v2（PRJ-110 §3-3）: gameConfig(ageClass, mode)。g1・g2・g4 は mode（文言レジスタ child/adult）で 2 段階のまま、
  // g3 だけ G3_STAGES[ageClass] から引く。ageClass が範囲外なら Error（黙って別の段階に落とさない）
  function gameConfig(ageClass, mode) {
    var adult = mode === "adult";
    var st = G3_STAGES[ageClass];
    if (!Number.isInteger(ageClass) || !st) { throw new Error("gameConfig: ageClass " + JSON.stringify(ageClass) + " の段階表がない（0〜" + (G3_STAGES.length - 1) + "）"); }
    var g3 = {}; for (var k in st) { if (Object.prototype.hasOwnProperty.call(st, k)) { g3[k] = st[k]; } }
    return {
      mode: adult ? "adult" : "child",
      ageClass: ageClass,
      g1: { tol: adult ? 12 : 24, lines: adult ? ["直線", "曲線", "曲線"] : ["直線", "直線", "直線"], limitSec: 60, guideSec: 45, sampleMs: 50, minSamples: 20 },
      g2: { parts: adult ? 5 : 3, snap: adult ? 20 : 40, limitSec: 60, grabMargin: 12 },
      g3: g3,
      g4: { size: adult ? 5 : 4, obstacles: adult ? 3 : 1, maxCmds: 8, stepMs: 300, limitSec: 60 }
    };
  }

  // ---- 一の陣（A-3-1） ---------------------------------------------------
  var G1_LINES = {
    child: [
      { type: "line", p: [[290, 420], [990, 420]] },
      { type: "line", p: [[290, 560], [990, 280]] },
      { type: "line", p: [[640, 250], [640, 600]] }
    ],
    adult: [
      { type: "line", p: [[290, 420], [990, 420]] },
      { type: "quad", p: [[290, 500], [640, 240], [990, 500]] },
      { type: "cubic", p: [[290, 420], [520, 240], [760, 600], [990, 420]] }
    ]
  };

  // 線の定義 → 折れ線（直線は 2 点、曲線は 200 点に標本化）
  function g1Polyline(def) {
    var p = def.p, pts = [], i, t, u;
    if (def.type === "line") { return [p[0].slice(), p[1].slice()]; }
    for (i = 0; i < 200; i++) {
      t = i / 199; u = 1 - t;
      if (def.type === "quad") {
        pts.push([u * u * p[0][0] + 2 * u * t * p[1][0] + t * t * p[2][0],
                  u * u * p[0][1] + 2 * u * t * p[1][1] + t * t * p[2][1]]);
      } else {
        pts.push([u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
                  u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]]);
      }
    }
    return pts;
  }
  function g1Lines(mode) { return G1_LINES[mode === "adult" ? "adult" : "child"].map(function (d) { return { def: d, pts: g1Polyline(d) }; }); }

  function polyLength(pts) { var L = 0; for (var i = 1; i < pts.length; i++) { L += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); } return L; }

  // 点から折れ線への最短距離 d（上限 200 で打ち切り）と、最近点までの弧長 along
  function g1Project(pts, x, y) {
    var best = Infinity, along = 0, acc = 0, bx = pts[0][0], by = pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      var ax = pts[i - 1][0], ay = pts[i - 1][1], cx = pts[i][0], cy = pts[i][1];
      var vx = cx - ax, vy = cy - ay, seg = Math.sqrt(vx * vx + vy * vy);
      var t = seg > 0 ? ((x - ax) * vx + (y - ay) * vy) / (seg * seg) : 0;
      if (t < 0) { t = 0; } if (t > 1) { t = 1; }
      var px = ax + vx * t, py = ay + vy * t, d = dist(x, y, px, py);
      if (d < best) { best = d; along = acc + seg * t; bx = px; by = py; }
      acc += seg;
    }
    return { d: Math.min(best, 200), along: along, x: bx, y: by };
  }
  // 弧長 s の位置
  function g1PointAt(pts, s) {
    var acc = 0;
    for (var i = 1; i < pts.length; i++) {
      var seg = dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      if (acc + seg >= s) { var t = seg > 0 ? (s - acc) / seg : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; }
      acc += seg;
    }
    return pts[pts.length - 1].slice();
  }

  // 指標: inSamples = d ≤ tol の数、totalSamples、maxDev。totalSamples = 0 のときは maxDev を渡さない（logic L59）
  function g1Metrics(samples, tol) {
    var m = { inSamples: 0, totalSamples: 0 }, mx = 0;
    for (var i = 0; i < samples.length; i++) {
      var d = Math.min(samples[i], 200);
      m.totalSamples++;
      if (d <= tol) { m.inSamples++; }
      if (d > mx) { mx = d; }
    }
    if (m.totalSamples > 0) { m.maxDev = round1(mx); }
    return m;
  }
  // 有効な線の標本だけを連結する（設計変更票 #2 §3-4）。byLine = [{samples:[d…], done:bool}…]
  // 有効 = 完了（done）または標本数 ≥ minSamples。有効線 0 本なら [] → g1Metrics が totalSamples 0（logic で 0 点）
  function g1LineValid(line, minSamples) {
    var s = (line && line.samples) || [];
    return !!(line && line.done) || s.length >= minSamples;
  }
  function g1Filter(byLine, minSamples) {
    var out = [];
    for (var i = 0; i < byLine.length; i++) {
      if (g1LineValid(byLine[i], minSamples)) { out = out.concat(byLine[i].samples || []); }
    }
    return out;
  }

  // ---- 二の陣（A-3-2） ---------------------------------------------------
  var G2_PARTS = [
    { id: "daiita", name: "台板", shape: "rect", w: 300, h: 40, tx: 380, ty: 560 },
    { id: "tateita", name: "立て板", shape: "rect", w: 40, h: 260, tx: 250, ty: 410 },
    { id: "hokyo", name: "補強", shape: "tri", w: 120, h: 120, tx: 310, ty: 480 },
    { id: "tsume", name: "前の爪", shape: "rect", w: 40, h: 60, tx: 510, ty: 510 },
    { id: "boushi", name: "上の帽子", shape: "rect", w: 80, h: 30, tx: 250, ty: 265 }
  ];
  var G2_BOARD = { x1: 80, y1: 150, x2: 680, y2: 650 };
  var G2_TRAY = { x1: 760, x2: 1200, cx: 980, y0: 120, gap: 12 };
  function g2Parts(mode) { return G2_PARTS.slice(0, mode === "adult" ? 5 : 3).map(function (p) { var o = {}; for (var k in p) { o[k] = p[k]; } return o; }); }
  // 並び順: 定義順を n mod 部品数 だけ回す
  function g2Order(n, count) {
    var r = ((Math.floor(n) % count) + count) % count, out = [];
    for (var i = 0; i < count; i++) { out.push((i + r) % count); }
    return out;
  }
  // 置き場の各部品の中心（縦に並べる）
  function g2TrayLayout(parts, order) {
    var y = G2_TRAY.y0, pos = {};
    for (var i = 0; i < order.length; i++) {
      var p = parts[order[i]];
      pos[p.id] = { x: G2_TRAY.cx, y: y + p.h / 2 };
      y += p.h + G2_TRAY.gap;
    }
    return pos;
  }
  // 落とした位置の判定: "snap"（吸着・固定）／"retry"（組立台に誤って置いた＝置き直し +1）／"out"（数えない）
  function g2Judge(part, cx, cy, snap) {
    if (dist(cx, cy, part.tx, part.ty) <= snap) { return "snap"; }
    if (cx >= G2_BOARD.x1 && cx <= G2_BOARD.x2 && cy >= G2_BOARD.y1 && cy <= G2_BOARD.y2) { return "retry"; }
    return "out";
  }
  function g2Metrics(retries, startMs, endMs, completed) {
    return { retries: retries, seconds: round1((endMs - startMs) / 1000), completed: !!completed };
  }
  // つかみ判定（設計変更票 #2 §3-5）: 点 (x,y) が「図形を margin だけ外側に広げた領域」の中か
  // 図形は部品内座標（左上が原点）。rect = [0,w]×[0,h]。tri = 直角二等辺（直角は左下）: 頂点 (0,0)・(0,h)・(w,h)〔g2.css の clip-path と同じ向き〕
  // 判定は凸多角形の各辺について「外向きの符号付き距離 ≤ margin」をすべて満たすこと
  function g2Hit(part, cx, cy, x, y, margin) {
    var w = part.w, h = part.h, px = x - (cx - w / 2), py = y - (cy - h / 2), m = margin || 0;
    if (part.shape === "tri") {
      var hyp = Math.sqrt(w * w + h * h);
      return (-px <= m) &&                       // 左辺 x=0（外向き −x）
             (py - h <= m) &&                    // 底辺 y=h（外向き +y）
             ((h * px - w * py) / hyp <= m);     // 斜辺 (0,0)-(w,h)（外向き 右上）
    }
    return px >= -m && px <= w + m && py >= -m && py <= h + m;
  }
  // つかむ部品の添字（なければ -1）。centers[i] = {x,y}（parts[i] の中心）。固定済みは除外
  // 優先: 図形の内側（margin 0 で当たる）＞ 余白だけで当たる。同順位なら添字の大きい方（描画順の後＝手前）
  function g2PickPart(parts, centers, x, y, margin) {
    var best = -1, bestRank = -1;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], c = centers[i];
      if (!c || p.fixed) { continue; }
      var rank = g2Hit(p, c.x, c.y, x, y, 0) ? 2 : (g2Hit(p, c.x, c.y, x, y, margin) ? 1 : 0);
      if (rank > 0 && rank >= bestRank) { best = i; bestRank = rank; }
    }
    return best;
  }

  // ---- 三の陣 v2（PRJ-110 付録 B-2。ドラッグ方式・複数レーン・蔵 2〜5） --------------------
  // マーク 5 種（添字 = mark。既存の色トークンのみ）。v1 の key（矢印キー）は廃止
  var G3_MARKS = [
    { mark: "●", color: "shu", name: "一番蔵" },
    { mark: "▲", color: "ai", name: "二番蔵" },
    { mark: "■", color: "matsu", name: "三番蔵" },
    { mark: "◆", color: "kin", name: "四番蔵" },
    { mark: "★", color: "sumi", name: "五番蔵" }
  ];
  var G3_BOX = 90;                                  // 荷の一辺
  function g3Marks(count) { return G3_MARKS.slice(0, count); }
  // 盤面（論理 1280×720。B-2-3）。belts[j] = {y1, y2, boxY}（高さ 100・荷は y+5）、bins[k] = {x1, y1, x2, y2, mark}（y 500〜680・左右余白 40・間隔 20）
  var G3_BELT_Y = { 1: [240], 2: [170, 290], 3: [130, 240, 350] };
  function g3Layout(lanes, marks) {
    var ys = G3_BELT_Y[lanes] || G3_BELT_Y[1], belts = [], bins = [];
    for (var j = 0; j < ys.length; j++) { belts.push({ y1: ys[j], y2: ys[j] + 100, boxY: ys[j] + 5 }); }
    var w = (1200 - 20 * (marks - 1)) / marks;
    for (var k = 0; k < marks; k++) { var x1 = 40 + k * (w + 20); bins.push({ x1: x1, y1: 500, x2: x1 + w, y2: 680, mark: k }); }
    return { belts: belts, bins: bins };
  }
  // 荷 i 番目のマーク（seed = n の乱数列で 0〜marks−1 を一様に選ぶ）
  function g3Labels(n, count, marks) {
    var rnd = mulberry32(n), out = [];
    for (var i = 0; i < count; i++) { out.push(Math.floor(rnd() * marks)); }
    return out;
  }
  // つかみ判定: boxes = [{x, lane, mark, done}]（配列にあるものは出現済み）。(x,y) が荷の矩形＋余白 margin に入る荷のうち
  // b.x が最大のもの（先頭）の添字。対象は !done・x ≤ 1280。無ければ −1
  function g3Pick(boxes, layout, x, y, margin) {
    var idx = -1, m = margin || 0;
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b.done || b.x > 1280) { continue; }
      var belt = layout.belts[b.lane]; if (!belt) { continue; }
      var by = belt.boxY;
      if (x < b.x - m || x > b.x + G3_BOX + m || y < by - m || y > by + G3_BOX + m) { continue; }
      if (idx < 0 || b.x > boxes[idx].x) { idx = i; }
    }
    return idx;
  }
  // 落とし判定: 荷の中心 (cx,cy) を含む蔵があれば {hit:true, correct: 蔵のマーク===mark, bin}、無ければ {hit:false}
  function g3Drop(bins, cx, cy, mark) {
    for (var k = 0; k < bins.length; k++) {
      var b = bins[k];
      if (cx >= b.x1 && cx <= b.x2 && cy >= b.y1 && cy <= b.y2) { return { hit: true, correct: b.mark === mark, bin: b }; }
    }
    return { hit: false };
  }
  // 集計: results = "correct" / "wrong" / "missed" の列
  function g3Tally(results) {
    var m = { correct: 0, wrong: 0, missed: 0 };
    for (var i = 0; i < results.length; i++) { if (m.hasOwnProperty(results[i])) { m[results[i]]++; } }
    return m;
  }

  // ---- 四の陣（A-3-4） ---------------------------------------------------
  var G4_LAYOUT = {
    adult: { size: 5, start: [0, 4], goal: [3, 2], walls: [[1, 3], [2, 3], [3, 4]], shortest: 5 },
    child: { size: 4, start: [0, 3], goal: [2, 1], walls: [[1, 2]], shortest: 4 }
  };
  var DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  // n が奇数なら左右反転
  function g4Layout(mode, n) {
    var b = G4_LAYOUT[mode === "adult" ? "adult" : "child"], mir = Math.abs(Math.floor(n)) % 2 === 1, S = b.size;
    var f = function (p) { return mir ? [S - 1 - p[0], p[1]] : [p[0], p[1]]; };
    return { size: S, start: f(b.start), goal: f(b.goal), walls: b.walls.map(f), shortest: b.shortest, mirrored: mir };
  }
  function isWall(lay, x, y) {
    if (x < 0 || y < 0 || x >= lay.size || y >= lay.size) { return true; }
    for (var i = 0; i < lay.walls.length; i++) { if (lay.walls[i][0] === x && lay.walls[i][1] === y) { return true; } }
    return false;
  }
  // BFS の最短手数（届かなければ -1）
  function g4Bfs(lay) {
    var S = lay.size, seen = {}, q = [[lay.start[0], lay.start[1], 0]];
    seen[lay.start[0] + "," + lay.start[1]] = true;
    while (q.length) {
      var c = q.shift();
      if (c[0] === lay.goal[0] && c[1] === lay.goal[1]) { return c[2]; }
      for (var k in DIRS) {
        var nx = c[0] + DIRS[k][0], ny = c[1] + DIRS[k][1], key = nx + "," + ny;
        if (!isWall(lay, nx, ny) && !seen[key]) { seen[key] = true; q.push([nx, ny, c[2] + 1]); }
      }
    }
    return -1;
  }
  // 命令列（"U","D","L","R" の配列）を実行。途中で荷に入れば成功、壁・棚で停止、使い切って届かなければ short
  function g4Run(lay, cmds) {
    var x = lay.start[0], y = lay.start[1], path = [[x, y]];
    for (var i = 0; i < cmds.length; i++) {
      var d = DIRS[cmds[i]]; if (!d) { continue; }
      var nx = x + d[0], ny = y + d[1];
      if (isWall(lay, nx, ny)) { return { result: "crash", steps: i, path: path, at: [nx, ny] }; }
      x = nx; y = ny; path.push([x, y]);
      if (x === lay.goal[0] && y === lay.goal[1]) { return { result: "success", steps: i + 1, path: path }; }
    }
    return { result: "short", steps: cmds.length, path: path };
  }

  // ---- 上書き適用（A-7-2） ------------------------------------------------
  // ov = { program_id: {mode:"off"} | {mode:"on", ageMin, reserve, noteAdd} }。行を浅く複製して返す（元データは変えない）
  function applyOverrides(data, ov) {
    var rows = Array.isArray(data) ? data : data.rows, out = [];
    ov = ov || {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], o = ov[r.program_id];
      if (!o || (o.mode !== "off" && o.mode !== "on")) { out.push(r); continue; }
      var c = {}; for (var k in r) { if (Object.prototype.hasOwnProperty.call(r, k)) { c[k] = r[k]; } }
      if (o.mode === "off") { c["要確認"] = 1; }
      else {
        c["要確認"] = 0;
        c["年齢下限区分"] = o.ageMin;
        c["予約区分"] = o.reserve;
        if (o.noteAdd) { c["カード注記"] = (c["カード注記"] ? c["カード注記"] + "　" : "") + o.noteAdd; }
      }
      out.push(c);
    }
    if (Array.isArray(data)) { return out; }
    var d2 = {}; for (var kk in data) { if (Object.prototype.hasOwnProperty.call(data, kk)) { d2[kk] = data[kk]; } }
    d2.rows = out;
    return d2;
  }
  // 有効パラメータ（params を複製し axisSource.K4 だけ切替。A-7-2）
  function effectiveParams(params, degrade) {
    var P = {}; for (var k in params) { if (Object.prototype.hasOwnProperty.call(params, k)) { P[k] = params[k]; } }
    P.axisSource = { K4: degrade ? "question" : "game" };
    return P;
  }

  // ---- 表示ラベル（A-5。設計変更票 #1: 必須 →「要予約」のみ） -------------
  function reserveLabel(v) {
    if (v === "不要") { return "予約不要"; }
    if (v === "当日可") { return "予約優先・空きがあれば当日可"; }
    if (v === "必須") { return "要予約"; }
    return "予約は受付で確認";
  }
  var AGE_NONE = ["なし", "設定なし", "指定なし", "対象年齢なし"];
  var AGE_ASK = ["", "記載なし", "（空欄）"];
  function ageLabel(v) {
    if (v === null || v === undefined) { return "年齢条件は受付で確認"; }
    var s = String(v).trim();
    if (AGE_ASK.indexOf(s) >= 0) { return "年齢条件は受付で確認"; }
    if (AGE_NONE.indexOf(s) >= 0) { return "年齢制限なし"; }
    return s;
  }
  function durationLabel(v) { return (typeof v === "number" && isFinite(v)) ? "約 " + v + " 分" : ""; }
  function costLabel(v) {
    if (typeof v !== "number" || !isFinite(v)) { return ""; }
    return v === 0 ? "無料" : v + " 円";
  }
  function daysLabel(row) {
    var d = [];
    [22, 23, 24].forEach(function (x) { if (row["d" + x] === 1) { d.push(String(x)); } });
    return d.length ? d.join("・") + "日" : "";
  }

  var api = {
    mulberry32: mulberry32, gameConfig: gameConfig,
    g1Lines: g1Lines, g1Polyline: g1Polyline, g1Project: g1Project, g1PointAt: g1PointAt, polyLength: polyLength, g1Metrics: g1Metrics,
    g1Filter: g1Filter, g1LineValid: g1LineValid,
    g2Parts: g2Parts, g2Order: g2Order, g2TrayLayout: g2TrayLayout, g2Judge: g2Judge, g2Metrics: g2Metrics, g2Hit: g2Hit, g2PickPart: g2PickPart,
    G2_BOARD: G2_BOARD, G2_TRAY: G2_TRAY,
    G3_STAGES: G3_STAGES, G3_MARKS: G3_MARKS, G3_BOX: G3_BOX, g3Marks: g3Marks, g3Layout: g3Layout, g3Labels: g3Labels, g3Pick: g3Pick, g3Drop: g3Drop, g3Tally: g3Tally,
    g4Layout: g4Layout, g4Bfs: g4Bfs, g4Run: g4Run, isWall: isWall,
    applyOverrides: applyOverrides, effectiveParams: effectiveParams,
    reserveLabel: reserveLabel, ageLabel: ageLabel, durationLabel: durationLabel, costLabel: costLabel, daysLabel: daysLabel
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { root.SJPure = api; }
})(typeof globalThis !== "undefined" ? globalThis : this);
