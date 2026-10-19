// 三の陣「しわけ」（K3）— 荷をつかんで同じマークの蔵へ運ぶ（PRJ-110 付録 B-2）。指標 {correct, wrong, missed} だけを返す
// 方式 (iii): 表示はポインタに従い、ベルト上の「元の位置」（影）だけがベルト速度で進み続ける。影が右端を出たら自動で手放されて missed
var SJGame = SJGame || {};
SJGame[3] = {
  start: function (ctx) {
    "use strict";
    var P = SJPure, S = SJStage, cfg = P.gameConfig(ctx.ageClass, ctx.mode).g3;
    var marks = P.g3Marks(cfg.marks), labels = P.g3Labels(ctx.n, 200, cfg.marks), lay = P.g3Layout(cfg.lanes, cfg.marks);
    var BOX = P.G3_BOX;
    var root = S.el("div", "game g3", null, ctx.stageEl);
    var hud = S.hud(root, SJTexts.games[2].name, ctx.progress, cfg.limitSec);
    lay.belts.forEach(function (b) { S.pos(S.el("div", "g3-belt", null, root), 0, b.y1, 1280, b.y2 - b.y1); });
    // 蔵（落とし先）。クリックでは何も起きない（キー入力・蔵クリックは v1 で廃止）
    lay.bins.forEach(function (b) {
      var mk = marks[b.mark], e = S.el("div", "g3-bin c-" + mk.color, null, root);
      S.pos(e, b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
      S.el("div", "g3-mark", mk.mark, e);
      S.el("div", "g3-name", mk.name, e);
    });
    // 影（つかまれている荷の元の位置）。held のときだけ表示
    var shadow = S.el("div", "g3-shadow", null, root); S.pos(shadow, -200, 0, BOX, BOX);
    var boxes = [], results = [], finished = false, resolveFn, clk, last = 0, nextSpawn = 0, t0 = 0;
    var raw = { spawned: 0, grabs: 0, returns: 0, autoMissed: 0, lanes: cfg.lanes, marks: cfg.marks };
    var held = null;                                  // { idx, dx, dy, px, py, pid }（pid: つかんだ pointerId。別ポインタの move/up は無視）

    function spawn() {
      var i = raw.spawned, lane = i % cfg.lanes, mark = labels[i % labels.length], mk = marks[mark];
      var e = S.el("div", "g3-box c-" + mk.color, null, root);
      S.el("span", "g3-tag", mk.mark, e);
      var b = { i: i, x: -BOX, lane: lane, mark: mark, done: false, el: e };
      S.pos(e, b.x, lay.belts[lane].boxY, BOX, BOX);
      boxes.push(b); raw.spawned++;
    }
    function removeLater(el, ms) { setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, ms); }
    function drawHeld() {
      if (!held) { return; }
      var b = boxes[held.idx];
      b.el.style.left = (held.px - held.dx) + "px"; b.el.style.top = (held.py - held.dy) + "px";
      shadow.style.left = b.x + "px";
    }
    function release() {
      if (!held) { return; }
      boxes[held.idx].el.classList.remove("held");
      shadow.style.display = "none";
      held = null;
    }
    // 自動 missed（設計変更票 #1）: 手の中の荷が消えると同時に右端で荷が落ち、「見逃し！」を 1 秒以内だけ出す
    function autoMiss(b) {
      var by = lay.belts[b.lane].boxY;
      release();
      b.el.style.left = (1280 - BOX) + "px"; b.el.style.top = by + "px";
      void b.el.offsetHeight;                         // 右端の位置を確定させてから落とす（transition の始点）
      b.el.classList.add("fall");
      b.el.style.top = (by + 220) + "px";
      removeLater(b.el, 500);
      var miss = S.el("div", "g3-miss", SJTexts.g3Miss[ctx.mode], root);
      S.pos(miss, 940, by - 6, 320, 100);
      removeLater(miss, 900);
      raw.autoMissed++;
    }

    root.addEventListener("pointerdown", function (ev) {
      if (finished || held || ev.button !== 0) { return; }     // つかんでいる間の 2 個目は無視（単一ポインタ）
      var lp = S.toLogical(ev);
      var idx = P.g3Pick(boxes, lay, lp.x, lp.y, cfg.grabMargin);
      if (idx < 0) { return; }
      var b = boxes[idx], by = lay.belts[b.lane].boxY;
      held = { idx: idx, dx: lp.x - b.x, dy: lp.y - by, px: lp.x, py: lp.y, pid: ev.pointerId };
      raw.grabs++;
      b.el.classList.add("held");
      shadow.style.display = "block"; shadow.style.top = by + "px";
      drawHeld();
      try { root.setPointerCapture(ev.pointerId); } catch (x) { /* 続行 */ }
      ev.preventDefault();
    });
    root.addEventListener("pointermove", function (ev) {
      if (!held || ev.pointerId !== held.pid) { return; }    // 2 本目の指・別ボタンの move は無視
      var lp = S.toLogical(ev); held.px = lp.x; held.py = lp.y; drawHeld();
    });
    function drop(ev) {
      if (!held || ev.pointerId !== held.pid) { return; }    // つかんだポインタ以外の up/cancel では手放さない
      var b = boxes[held.idx], by = lay.belts[b.lane].boxY;
      var cx = held.px - held.dx + BOX / 2, cy = held.py - held.dy + BOX / 2;
      release();
      if (finished || b.done) { return; }
      var r = P.g3Drop(lay.bins, cx, cy, b.mark);
      if (r.hit) {
        b.done = true; results.push(r.correct ? "correct" : "wrong");
        // 蔵へ落ちる演出（v1 と同じ）
        b.el.classList.add("drop", r.correct ? "ok" : "ng");
        S.pos(b.el, (r.bin.x1 + r.bin.x2) / 2 - BOX / 2, r.bin.y1 + 45);
        removeLater(b.el, 400);
        return;
      }
      // どの蔵にも入らない → 影の位置へ戻る（数えない）
      raw.returns++;
      b.el.style.left = b.x + "px"; b.el.style.top = by + "px";
    }
    root.addEventListener("pointerup", drop);
    root.addEventListener("pointercancel", drop);     // 外に落としたのと同じ扱い

    function tick(now) {
      var dt = last ? (now - last) / 1000 : 0; last = now;
      var el = (now - t0) / 1000;
      while (el >= nextSpawn) { spawn(); nextSpawn += cfg.intervalSec / cfg.lanes; }
      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        if (b.done) { continue; }
        b.x += cfg.speed * dt;
        var isHeld = held && held.idx === i;
        if (b.x > 1280) {
          b.done = true; results.push("missed");
          if (isHeld) { autoMiss(b); } else if (b.el.parentNode) { b.el.parentNode.removeChild(b.el); }
          continue;
        }
        if (isHeld) { shadow.style.left = b.x + "px"; } else { b.el.style.left = b.x + "px"; }
      }
    }
    function finish() {
      if (finished) { return; }
      finished = true; clk.stop();
      release();                                      // 手の中・ベルト上の荷は数えない
      resolveFn({ m: P.g3Tally(results), end: "timeout", raw: raw });
    }
    return new Promise(function (resolve) {
      resolveFn = resolve; t0 = performance.now(); last = 0;
      clk = S.clock(cfg.limitSec, function (r) { hud.update(r); tick(performance.now()); }, finish);
      if (ctx.debug) { ctx.debugHook(function () { var m = P.g3Tally(results); m.held = !!held; m.raw = raw; return m; }); }
    });
  }
};
