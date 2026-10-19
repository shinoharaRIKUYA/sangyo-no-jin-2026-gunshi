// 四の陣「しくみ」（K4）— フォークリフトの命令（A-3-4）。指標 {success[], runs[], shortest[], used[]}（問題ごとの配列）だけを返す
// 2026-10-19（PRJ-111）: 年齢段階ごとに問題を 1〜4 問つづけて解く。1 問解けると次の問題へ。時間切れで残った問題は未成功
var SJGame = SJGame || {};
SJGame[4] = {
  start: function (ctx) {
    "use strict";
    var P = SJPure, S = SJStage, cfg = P.gameConfig(ctx.ageClass, ctx.mode).g4, child = ctx.mode !== "adult";
    var ids = cfg.puzzles, CELL = 90, GX = 140, GY = 150;
    var root = S.el("div", "game g4", null, ctx.stageEl);
    var hud = S.hud(root, SJTexts.games[3].name, ctx.progress, cfg.limitSec);
    var grid = S.el("div", "g4-grid", null, root);
    var count = S.el("div", "g4-count", "", root); S.pos(count, GX, GY - 50, 450, 40);
    var lay, lift, cur = 0;

    function putLift(p) { S.pos(lift, p[0] * CELL + 8, p[1] * CELL + 8, CELL - 16, CELL - 16); }
    function drawPuzzle() {
      lay = P.g4Layout(ids[cur], ctx.n + cur);
      while (grid.firstChild) { grid.removeChild(grid.firstChild); }
      S.pos(grid, GX, GY, lay.size * CELL, lay.size * CELL);
      for (var y = 0; y < lay.size; y++) {
        for (var x = 0; x < lay.size; x++) {
          var c = S.el("div", "g4-cell", null, grid); S.pos(c, x * CELL, y * CELL, CELL, CELL);
          if (P.isWall(lay, x, y)) { c.classList.add("wall"); c.textContent = "棚"; }
        }
      }
      var goal = S.el("div", "g4-goal", "荷", grid); S.pos(goal, lay.goal[0] * CELL + 10, lay.goal[1] * CELL + 10, CELL - 20, CELL - 20);
      lift = S.el("div", "g4-lift", "車", grid);
      putLift(lay.start);
      count.textContent = (child ? "もんだい " : "問題 ") + (cur + 1) + " / " + ids.length;
    }

    // 命令欄
    var panel = S.el("div", "g4-panel", null, root); S.pos(panel, 700, 130, 540, 560);
    S.el("div", "g4-label", child ? "めいれい（8こ まで）" : "命令（最大 8 個）", panel);
    var slots = S.el("div", "g4-slots", null, panel), slotEls = [];
    for (var i = 0; i < cfg.maxCmds; i++) { slotEls.push(S.el("div", "g4-slot", "", slots)); }
    var btns = S.el("div", "g4-btns", null, panel);
    var ARROW = { U: "↑", D: "↓", L: "←", R: "→" };
    ["U", "L", "D", "R"].forEach(function (d) {
      var b = S.el("div", "btn g4-dir", ARROW[d], btns);
      b.addEventListener("pointerdown", function (ev) { if (ev.button === 0) { add(d); ev.preventDefault(); } });
    });
    var del = S.el("div", "btn g4-del", child ? "ひとつ けす" : "一つ消す", panel);
    del.addEventListener("pointerdown", function (ev) { if (ev.button === 0) { pop(); ev.preventDefault(); } });
    var go = S.el("div", "btn g4-go", child ? "しゅつじん" : "出陣", panel);
    go.addEventListener("pointerdown", function (ev) { if (ev.button === 0) { run(); ev.preventDefault(); } });
    var msg = S.el("div", "g4-msg", "", panel);

    // results[i] = {success, runs, used}（問題ごと）
    var results = ids.map(function () { return { success: false, runs: 0, used: 0 }; });
    var cmds = [], busy = false, finished = false, history = [], resolveFn, clk, anim = 0, nextT = 0;
    function render() { slotEls.forEach(function (e, k) { e.textContent = cmds[k] ? ARROW[cmds[k]] : ""; }); }
    function add(d) {
      if (busy || finished) { return; }
      if (cmds.length >= cfg.maxCmds) { slots.classList.remove("shake"); void slots.offsetWidth; slots.classList.add("shake"); return; }
      cmds.push(d); msg.textContent = ""; render();
    }
    function pop() { if (busy || finished) { return; } cmds.pop(); render(); }
    function run() {
      if (busy || finished || !cmds.length) { return; }
      results[cur].runs++; busy = true; msg.textContent = "";
      var res = P.g4Run(lay, cmds), k = 0;
      if (history.length < 20) { history.push(cur + ":" + cmds.join("")); }
      putLift(lay.start);
      anim = setInterval(function () {
        if (finished) { clearInterval(anim); return; }
        k++;
        if (k < res.path.length) { putLift(res.path[k]); return; }
        clearInterval(anim);
        if (res.result === "success") {
          results[cur].success = true; results[cur].used = cmds.length;
          if (cur < ids.length - 1) {
            msg.textContent = child ? "とどいた！ つぎの もんだい" : "荷に着いた！ 次の問題へ";
            nextT = setTimeout(function () { if (finished) { return; } cur++; cmds = []; render(); msg.textContent = ""; drawPuzzle(); busy = false; }, 700);
          } else {
            msg.textContent = child ? "ぜんぶ とどいた！" : "全問 荷に着いた！"; finish("done");
          }
          return;
        }
        if (res.result === "crash") { msg.textContent = child ? "ぶつかった！" : "ぶつかった！ 並べ直そう"; lift.classList.add("shake"); setTimeout(function () { lift.classList.remove("shake"); }, 400); }
        else { msg.textContent = child ? "とどかない" : "とどかない。並べ直そう"; }
        busy = false;
      }, cfg.stepMs);
    }
    function key(ev) {
      var map = { ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R" };
      if (map[ev.key]) { ev.preventDefault(); add(map[ev.key]); return; }
      if (ev.key === "Backspace") { ev.preventDefault(); pop(); return; }
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); if (!ev.repeat) { run(); } }
    }
    document.addEventListener("keydown", key);
    function metrics() { return P.g4Metrics(results, ids); }
    function finish(end) {
      if (finished) { return; }
      finished = true; clk.stop(); clearInterval(anim); clearTimeout(nextT);
      document.removeEventListener("keydown", key);
      // 時間切れは実行中でも成功扱いにしない。残った問題は未成功（0 点）
      resolveFn({ m: metrics(), end: end, raw: { runs: history, solved: results.filter(function (r) { return r.success; }).length, total: ids.length, mirrored: lay.mirrored } });
    }
    drawPuzzle();
    return new Promise(function (resolve) {
      resolveFn = resolve;
      clk = S.clock(cfg.limitSec, function (r) { hud.update(r); }, function () { finish("timeout"); });
      if (ctx.debug) { ctx.debugHook(metrics); }
    });
  }
};
