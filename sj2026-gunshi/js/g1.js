// 一の陣「しあげ」（K1）— 墨線なぞり（A-3-1）。指標 {inSamples, totalSamples, maxDev} だけを返す
var SJGame = SJGame || {};
SJGame[1] = {
  start: function (ctx) {
    "use strict";
    var P = SJPure, cfg = P.gameConfig(ctx.ageClass, ctx.mode).g1, tol = cfg.tol;
    var lines = P.g1Lines(ctx.mode), NS = "http://www.w3.org/2000/svg";
    var root = SJStage.el("div", "game g1", null, ctx.stageEl);
    var hud = SJStage.hud(root, SJTexts.games[0].name, ctx.progress, cfg.limitSec);
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 1280 720"); svg.setAttribute("class", "g1-svg");
    root.appendChild(svg);
    function mk(tag, attrs, parent) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) { e.setAttribute(k, attrs[k]); }
      (parent || svg).appendChild(e); return e;
    }
    mk("rect", { x: 190, y: 200, width: 900, height: 440, rx: 8, "class": "g1-board" });
    var layer = mk("g", {});
    // 線ごとの標本（設計変更票 #2 §3-4）。採点に使うのは「完了した線」か「標本 ≥ minSamples の線」だけ
    var byLine = lines.map(function () { return { samples: [], done: false }; });
    var lineMs = [], doneCount = 0, cur = 0, drawing = false, started = false;
    var progress = 0, lineStart = 0, ptr = null, timer = 0, finished = false, curLen = 0, pts = null;
    var band, ink, trace, startC, endC, mark, tracePts = [];

    function ptsAttr(a) { return a.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "); }
    function drawLine() {
      while (layer.firstChild) { layer.removeChild(layer.firstChild); }
      pts = lines[cur].pts; curLen = P.polyLength(pts); progress = 0; started = false; tracePts = [];
      band = mk("polyline", { points: ptsAttr(pts), "class": "g1-band", "stroke-width": tol * 2 }, layer);
      ink = mk("polyline", { points: ptsAttr(pts), "class": "g1-ink" }, layer);
      trace = mk("polyline", { points: "", "class": "g1-trace" }, layer);
      startC = mk("circle", { cx: pts[0][0], cy: pts[0][1], r: 20, "class": "g1-start" }, layer);
      endC = mk("circle", { cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 20, "class": "g1-end" }, layer);
      mark = mk("circle", { cx: pts[0][0], cy: pts[0][1], r: 8, "class": "g1-mark" }, layer);
      lineStart = performance.now();
      label.textContent = (cur + 1) + " / 3";
    }
    var label = SJStage.el("div", "g1-count", "", root);

    function sample() {
      if (!drawing || !ptr || finished) { return; }
      var pr = P.g1Project(pts, ptr.x, ptr.y);
      byLine[cur].samples.push(pr.d);
      // 進み位置は線の近く（60px 以内）にいるときだけ進める（遠くからの飛び越しを防ぐ）
      if (pr.d <= 60 && pr.along > progress && pr.along - progress < 120) { progress = pr.along; }
      var mp = P.g1PointAt(pts, progress);
      mark.setAttribute("cx", mp[0]); mark.setAttribute("cy", mp[1]);
      tracePts.push([ptr.x, ptr.y]); if (tracePts.length > 2000) { tracePts.shift(); }
      trace.setAttribute("points", ptsAttr(tracePts));
      var end = pts[pts.length - 1];
      if (progress >= curLen * 0.9 && Math.hypot(ptr.x - end[0], ptr.y - end[1]) <= 24) {
        lineMs.push(Math.round(performance.now() - lineStart));
        byLine[cur].done = true;
        doneCount++; drawing = false;
        if (cur < lines.length - 1) { cur++; drawLine(); } else { finish("done"); }
      }
    }

    function down(e) {
      if (finished || e.button !== 0) { return; }
      var p = SJStage.toLogical(e);
      if (!started) {
        if (Math.hypot(p.x - pts[0][0], p.y - pts[0][1]) <= 30) { started = true; drawing = true; }
      } else {
        var mp = P.g1PointAt(pts, progress);
        if (Math.hypot(p.x - mp[0], p.y - mp[1]) <= 40) { drawing = true; }
      }
      if (drawing) { ptr = p; try { svg.setPointerCapture(e.pointerId); } catch (x) { /* 続行 */ } e.preventDefault(); }
    }
    function move(e) { if (drawing) { ptr = SJStage.toLogical(e); } }
    function up() { drawing = false; }
    svg.addEventListener("pointerdown", down);
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);

    var resolveFn, clk;
    function metrics() { return P.g1Metrics(P.g1Filter(byLine, cfg.minSamples), tol); }
    function finish(end) {
      if (finished) { return; }
      finished = true; drawing = false;
      clearInterval(timer); if (clk) { clk.stop(); }
      var m = metrics();
      var perLine = byLine.map(function (l) { return l.samples.length; });
      var valid = byLine.map(function (l) { return P.g1LineValid(l, cfg.minSamples) ? 1 : 0; });
      resolveFn({ m: m, end: end, raw: { lines: doneCount, ms: lineMs, perLine: perLine, valid: valid } });
    }
    drawLine();
    return new Promise(function (resolve) {
      resolveFn = resolve;
      timer = setInterval(sample, cfg.sampleMs);
      clk = SJStage.clock(cfg.limitSec, function (r) { hud.update(r); }, function () { finish("timeout"); });
      if (ctx.debug) { ctx.debugHook(metrics); }
    });
  }
};
