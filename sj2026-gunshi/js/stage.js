// 1280×720 の論理ステージ・拡縮・座標変換・共通部品（A-2 冒頭）
var SJStage = (function () {
  "use strict";
  var W = 1280, H = 720, scale = 1, stageEl = null;

  function fit() {
    if (!stageEl) { return; }
    var vw = window.innerWidth, vh = window.innerHeight;
    scale = Math.min(vw / W, vh / H);
    var left = Math.floor((vw - W * scale) / 2), top = Math.floor((vh - H * scale) / 2);
    stageEl.style.transform = "translate(" + left + "px," + top + "px) scale(" + scale + ")";
  }
  function init(el) {
    stageEl = el;
    fit();
    window.addEventListener("resize", fit);
    if (window.ResizeObserver) { new ResizeObserver(fit).observe(document.documentElement); }
  }
  // 画面座標 → 論理座標
  function toLogical(e) {
    var r = stageEl.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }
  // 要素を作る小道具
  function el(tag, cls, text, parent) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    if (parent) { parent.appendChild(e); }
    return e;
  }
  function pos(e, x, y, w, h) {
    e.style.left = x + "px"; e.style.top = y + "px";
    if (w !== undefined) { e.style.width = w + "px"; }
    if (h !== undefined) { e.style.height = h + "px"; }
    return e;
  }
  // 陣の上部: 陣名・残り時間の帯と秒数（残り 10 秒で朱）・進行表示
  function hud(parent, title, progress, limitSec) {
    var h = el("div", "hud", null, parent);
    el("div", "hud-title", title, h);
    var bar = el("div", "hud-bar", null, h), fill = el("div", "hud-fill", null, bar);
    var sec = el("div", "hud-sec", String(limitSec), h);
    el("div", "hud-prog", progress, h);
    var warned = false;
    return {
      update: function (remain) {
        var r = Math.max(0, remain);
        fill.style.width = (r / limitSec * 100) + "%";
        sec.textContent = String(Math.ceil(r));
        var warn = r <= 10;
        h.classList.toggle("warn", warn);
        // 初めて残り 10 秒以下（0 より大）になった時に 1 回だけ通知（軍師の声かけ。PRJ-114 §3-7）
        if (warn && r > 0 && !warned) { warned = true; if (hooks.warn) { try { hooks.warn(); } catch (e) { /* 陣を止めない */ } } }
      }
    };
  }
  // 時間制御: performance.now で残り秒を数え、0 で onEnd
  function clock(limitSec, onTick, onEnd) {
    var t0 = performance.now(), stopped = false, raf = 0, lastStep = t0;
    function tickOnce() {
      if (stopped) { return; }
      lastStep = performance.now();
      var el2 = (lastStep - t0) / 1000, remain = limitSec - el2;
      onTick(remain, el2);
      if (remain <= 0) { stopped = true; onEnd(); }
    }
    function step() { tickOnce(); if (!stopped) { raf = requestAnimationFrame(step); } }
    raf = requestAnimationFrame(step);
    // rAF が止まる環境（最小化・背景タブ等）でも進み、必ず終わるように
    var iv = setInterval(function () { if (performance.now() - lastStep > 100) { tickOnce(); } }, 50);
    var to = setTimeout(function () { if (!stopped) { stopped = true; onTick(0, limitSec); onEnd(); } }, limitSec * 1000 + 50);
    return { t0: t0, stop: function () { stopped = true; cancelAnimationFrame(raf); clearTimeout(to); clearInterval(iv); } };
  }
  var hooks = {};   // 外から差し込む通知（warn: 残り 10 秒）
  return { W: W, H: H, init: init, fit: fit, toLogical: toLogical, el: el, pos: pos, hud: hud, clock: clock, hooks: hooks,
    get scale() { return scale; } };
})();
