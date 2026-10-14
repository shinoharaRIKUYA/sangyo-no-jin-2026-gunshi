// 三の陣「しわけ」（K3）— 荷札で振り分け（A-3-3）。指標 {correct, wrong, missed} だけを返す
var SJGame = SJGame || {};
SJGame[3] = {
  start: function (ctx) {
    "use strict";
    var P = SJPure, S = SJStage, cfg = P.gameConfig(ctx.mode).g3;
    var lanes = P.g3Lanes(ctx.mode), labels = P.g3Labels(ctx.n, 200, ctx.mode);
    var laneById = {}; P.g3Lanes("adult").forEach(function (l) { laneById[l.id] = l; });
    var root = S.el("div", "game g3", null, ctx.stageEl);
    var hud = S.hud(root, SJTexts.games[2].name, ctx.progress, cfg.limitSec);
    S.pos(S.el("div", "g3-belt", null, root), 0, 240, 1280, 100);
    // レーン（蔵）。こどもは中レーンなし
    var LX = { L: 40, M: 450, R: 860 };
    if (ctx.mode !== "adult") { LX = { L: 120, R: 700 }; }
    lanes.forEach(function (l) {
      var e = S.el("div", "g3-lane c-" + l.color, null, root);
      S.pos(e, LX[l.id], 420, ctx.mode === "adult" ? 380 : 460, 260);
      S.el("div", "g3-mark", l.mark, e);
      S.el("div", "g3-name", l.name, e);
      S.el("div", "g3-key", { ArrowLeft: "←", ArrowDown: "↓", ArrowRight: "→" }[l.key], e);
      e.addEventListener("pointerdown", function (ev) { if (ev.button === 0) { press(l.id, "click"); ev.preventDefault(); } });
      l.el = e;
    });
    var boxes = [], results = [], spawned = 0, finished = false, resolveFn, clk, inputs = { key: 0, click: 0 }, last = 0, nextSpawn = 0;

    function spawn() {
      var lane = labels[spawned % labels.length], L = laneById[lane];
      var e = S.el("div", "g3-box c-" + L.color, null, root);
      S.el("span", "g3-tag", L.mark, e);
      var b = { x: -90, lane: lane, done: false, el: e };
      S.pos(e, b.x, 245, 90, 90);
      boxes.push(b); spawned++;
    }
    function press(laneId, kind) {
      if (finished) { return; }
      var r = P.g3Press(boxes, laneId, ctx.mode);
      if (r.ignored) { return; }
      inputs[kind]++;
      var b = boxes[r.index]; b.done = true;
      results.push(r.correct ? "correct" : "wrong");
      // 押したレーンへ落ちる演出
      var tx = LX[laneId] + (ctx.mode === "adult" ? 145 : 185);
      b.el.classList.add("drop", r.correct ? "ok" : "ng");
      S.pos(b.el, tx, 500);
      setTimeout(function () { if (b.el.parentNode) { b.el.parentNode.removeChild(b.el); } }, 400);
    }
    function key(ev) {
      var map = { ArrowLeft: "L", ArrowDown: "M", ArrowRight: "R" };
      if (!map[ev.key]) { return; }
      ev.preventDefault();
      if (ev.repeat) { return; }
      press(map[ev.key], "key");
    }
    document.addEventListener("keydown", key);

    function tick(now) {
      var dt = last ? (now - last) / 1000 : 0; last = now;
      var el = (now - t0) / 1000;
      while (el >= nextSpawn) { spawn(); nextSpawn += cfg.intervalSec; }
      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        if (b.done || b.gone) { continue; }
        b.x += cfg.speed * dt;
        b.el.style.left = b.x + "px";
        if (b.x > 1280) { b.gone = true; results.push("missed"); if (b.el.parentNode) { b.el.parentNode.removeChild(b.el); } }
      }
    }
    var t0 = 0;
    function finish() {
      if (finished) { return; }
      finished = true; clk.stop();
      document.removeEventListener("keydown", key);
      resolveFn({ m: P.g3Tally(results), end: "timeout", raw: { key: inputs.key, click: inputs.click, spawned: spawned } });
    }
    return new Promise(function (resolve) {
      resolveFn = resolve; t0 = performance.now(); last = 0;
      clk = S.clock(cfg.limitSec, function (r) { hud.update(r); tick(performance.now()); }, finish);
      if (ctx.debug) { ctx.debugHook(function () { return P.g3Tally(results); }); }
    });
  }
};
