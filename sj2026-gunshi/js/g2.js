// 二の陣「くみたて」（K2）— 部品を影に置く（A-3-2）。指標 {retries, seconds, completed} だけを返す
var SJGame = SJGame || {};
SJGame[2] = {
  start: function (ctx) {
    "use strict";
    var P = SJPure, S = SJStage, cfg = P.gameConfig(ctx.ageClass, ctx.mode).g2;
    var parts = P.g2Parts(ctx.mode), order = P.g2Order(ctx.n, parts.length), home = P.g2TrayLayout(parts, order);
    var root = S.el("div", "game g2", null, ctx.stageEl);
    var hud = S.hud(root, SJTexts.games[1].name, ctx.progress, cfg.limitSec);
    var B = P.G2_BOARD, T = P.G2_TRAY;
    S.pos(S.el("div", "g2-board", null, root), B.x1, B.y1, B.x2 - B.x1, B.y2 - B.y1);
    S.pos(S.el("div", "g2-tray", null, root), T.x1, 100, T.x2 - T.x1, 600);
    var retries = 0, fixed = 0, placed = [], finished = false, t0 = 0, resolveFn, clk;

    function place(e, cx, cy, p) { S.pos(e, cx - p.w / 2, cy - p.h / 2, p.w, p.h); }
    parts.forEach(function (p) {
      var sh = S.el("div", "g2-shadow " + p.shape, null, root); place(sh, p.tx, p.ty, p);
    });
    // 部品の要素と中心（添字は parts と揃える）。つかみ判定は root 1 か所で幾何計算（設計変更票 #2 §3-5。clip-path は見た目だけ）
    var els = [], centers = [];
    parts.forEach(function (p, i) {
      var e = S.el("div", "g2-part " + p.shape, null, root);
      e.title = p.name;
      var c = { x: home[p.id].x, y: home[p.id].y }; place(e, c.x, c.y, p);
      els[i] = e; centers[i] = c;
    });
    var drag = null;   // { i, dx, dy }
    root.addEventListener("pointerdown", function (ev) {
      if (finished || drag || ev.button !== 0) { return; }
      var lp = S.toLogical(ev);
      var i = P.g2PickPart(parts, centers, lp.x, lp.y, cfg.grabMargin);
      if (i < 0) { return; }
      var c = centers[i], e = els[i];
      drag = { i: i, dx: c.x - lp.x, dy: c.y - lp.y };
      e.classList.add("drag"); e.classList.remove("shake");
      try { root.setPointerCapture(ev.pointerId); } catch (x) { /* 続行 */ }
      ev.preventDefault();
    });
    root.addEventListener("pointermove", function (ev) {
      if (!drag) { return; }
      var lp = S.toLogical(ev), c = centers[drag.i], p = parts[drag.i];
      c.x = lp.x + drag.dx; c.y = lp.y + drag.dy; place(els[drag.i], c.x, c.y, p);
    });
    function drop() {
      if (!drag) { return; }
      var i = drag.i, p = parts[i], e = els[i], c = centers[i];
      drag = null; e.classList.remove("drag");
      if (finished) { return; }
      var j = P.g2Judge(p, c.x, c.y, cfg.snap);
      if (j === "snap") {
        p.fixed = true; c.x = p.tx; c.y = p.ty; place(e, c.x, c.y, p); e.classList.add("fixed");
        fixed++; placed.push(p.id);
        if (fixed === parts.length) { finish(true); }
        return;
      }
      if (j === "retry") { retries++; e.classList.add("shake"); }
      c.x = home[p.id].x; c.y = home[p.id].y; place(e, c.x, c.y, p);
    }
    root.addEventListener("pointerup", drop);
    root.addEventListener("pointercancel", drop);

    function finish(done) {
      if (finished) { return; }
      finished = true; if (clk) { clk.stop(); }
      var m = P.g2Metrics(retries, t0, performance.now(), done);
      if (!done) { m.seconds = cfg.limitSec; }
      resolveFn({ m: m, end: done ? "done" : "timeout", raw: { order: placed } });
    }
    return new Promise(function (resolve) {
      resolveFn = resolve; t0 = performance.now();
      clk = S.clock(cfg.limitSec, function (r) { hud.update(r); }, function () { finish(false); });
      if (ctx.debug) { ctx.debugHook(function () { return { retries: retries, fixed: fixed }; }); }
    });
  }
};
