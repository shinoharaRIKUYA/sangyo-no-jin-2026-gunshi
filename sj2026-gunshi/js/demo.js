// 説明画面 S2 のデモアニメ（PRJ-110 §3-5・付録 B-3。PRJ-109 demo_proto の 5 本＋三の陣 2 レーンを流用）
// DOM をここで組み、動きは css/demo.css の keyframes だけ。ブラウザ専用（window.SJDemo）。pure.js の後・app.js の前に読む
//   SJDemo.mount(figEl, k, ageClass)  … figEl（.s2-fig）に陣 k のデモを入れる。k=3 は G3_STAGES[ageClass].lanes で d3-1／d3-2／d3-3 を選ぶ
//   SJDemo.unmount(figEl)             … innerHTML を空にする（S2 を離れるとき。ゲーム中は走らせない。R-6）
(function () {
  "use strict";
  var P = window.SJPure, T = window.SJTexts;
  var CUR = '<span class="ring"></span><svg viewBox="0 0 24 32"><path d="M2 2 L2 26 L8 20 L12 30 L16 28 L12 19 L20 19 Z"/></svg>';

  function px(n) { return Math.round(n) + "px"; }
  function pos(x, y, w, h) {
    var s = "left:" + px(x) + ";top:" + px(y) + ";";
    if (w !== undefined) { s += "width:" + px(w) + ";"; }
    if (h !== undefined) { s += "height:" + px(h) + ";"; }
    return s;
  }
  function cur(cls) { return '<div class="dm-cur ' + cls + '">' + CUR + "</div>"; }
  // 上部（実ゲームの HUD と同じ部品。時間バーは満タンで止める）
  function hud(k) {
    var g = T && T.games && T.games[k - 1];
    return '<div class="hud"><div class="hud-title">' + (g ? g.name : "") + '</div><div class="hud-bar"><div class="hud-fill"></div></div>' +
      '<div class="hud-sec">' + (g ? g.limit : "") + "</div></div>";
  }

  // d1 一の陣: 手カーソルが墨線（2 次曲線）をなぞる
  function d1() {
    var d = "M290 500 Q640 240 990 500";
    return hud(1) +
      '<svg class="g1-svg" viewBox="0 0 1280 720">' +
      '<rect x="190" y="200" width="900" height="440" rx="6" class="g1-board"/>' +
      '<path d="' + d + '" class="g1-band"/><path d="' + d + '" class="g1-ink"/><path d="' + d + '" class="dm-trace" pathLength="100"/>' +
      '<circle cx="290" cy="500" r="20" class="g1-start"/><circle cx="990" cy="500" r="20" class="g1-end"/></svg>' +
      '<div class="g1-count">1 / 3</div>' + cur("dm-d1cur");
  }

  // d2 二の陣: 置き場の立て板を影へドラッグ（台板は置き済み）
  function d2() {
    return hud(2) +
      '<div class="g2-board" style="' + pos(80, 150, 600, 500) + '"></div>' +
      '<div class="g2-tray" style="' + pos(760, 150, 440, 500) + '"></div>' +
      '<div class="g2-shadow" style="' + pos(230, 540, 300, 40) + '"></div>' +
      '<div class="g2-shadow" style="' + pos(230, 280, 40, 260) + '"></div>' +
      '<div class="g2-shadow tri" style="' + pos(270, 420, 120, 120) + '"></div>' +
      '<div class="g2-shadow" style="' + pos(490, 480, 40, 60) + '"></div>' +
      '<div class="g2-shadow" style="' + pos(210, 250, 80, 30) + '"></div>' +
      '<div class="g2-part fixed" style="' + pos(230, 540, 300, 40) + '"></div>' +
      '<div class="g2-part dm-d2part" style="' + pos(960, 200, 40, 260) + '"></div>' +
      '<div class="g2-part tri" style="' + pos(800, 480, 120, 120) + '"></div>' +
      '<div class="g2-part" style="' + pos(1100, 300, 40, 60) + '"></div>' +
      '<div class="g2-part" style="' + pos(1060, 440, 80, 30) + '"></div>' + cur("dm-d2cur");
  }

  // d3 三の陣: レーン別 3 本（マーク 2・3・4 固定。D-8・Q3）。盤面は pure.js の g3Layout と同じ
  //   lanes 1: ▲ を二番蔵へ／2: 2 本目の ■ を三番蔵へ／3: 2 本目の ◆ を四番蔵へ。背景の荷は {lane, mark, delay}
  var D3 = {
    1: { marks: 2, cls: "a", grabLane: 0, bg: [{ l: 0, m: 0, d: -2 }, { l: 0, m: 0, d: -4 }] },
    2: { marks: 3, cls: "b", grabLane: 1, bg: [{ l: 0, m: 0, d: -1.5 }, { l: 0, m: 1, d: -4 }, { l: 1, m: 1, d: -3.5 }, { l: 1, m: 0, d: -1 }] },
    3: { marks: 4, cls: "c", grabLane: 1, bg: [{ l: 0, m: 0, d: -1.5 }, { l: 0, m: 1, d: -4 }, { l: 1, m: 2, d: -3.5 }, { l: 2, m: 1, d: -0.5 }, { l: 2, m: 3, d: -3 }] }
  };
  function d3(lanes) {
    var c = D3[lanes] || D3[1], lay = P.g3Layout(lanes, c.marks), marks = P.g3Marks(c.marks), h = hud(3), i;
    for (i = 0; i < lay.belts.length; i++) { h += '<div class="g3-belt" style="' + pos(0, lay.belts[i].y1, 1280, 100) + '"></div>'; }
    for (i = 0; i < lay.bins.length; i++) {
      var b = lay.bins[i], mk = marks[b.mark];
      h += '<div class="g3-bin" style="' + pos(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1) + '"><div class="g3-mark c-' + mk.color + '">' + mk.mark + '</div><div class="g3-name">' + mk.name + "</div></div>";
    }
    for (i = 0; i < c.bg.length; i++) {
      var g = c.bg[i], m = marks[g.m];
      h += '<div class="g3-box dm-flow c-' + m.color + '" style="top:' + px(lay.belts[g.l].boxY) + ";animation-delay:" + g.d + 's">' + m.mark + "</div>";
    }
    var boxY = lay.belts[c.grabLane].boxY, gm = marks[c.marks - 1];
    h += '<div class="dm-shadow" style="top:' + px(boxY) + '"></div>';
    h += '<div class="g3-box dm-d3box dm-d3' + c.cls + '-box c-' + gm.color + '" style="top:' + px(boxY) + '">' + gm.mark + "</div>";
    return h + cur("dm-d3cur dm-d3" + c.cls + "-cur");
  }

  // d4 四の陣: 命令タイル ↑↑→→→ → 出陣 → 到着
  function d4() {
    var h = hud(4) + '<div class="g4-grid" style="' + pos(100, 140, 450, 450) + '"></div>';
    var walls = { "1,3": 1, "2,3": 1, "3,4": 1 };
    for (var y = 0; y < 5; y++) {
      for (var x = 0; x < 5; x++) {
        var w = walls[x + "," + y];
        h += '<div class="g4-cell' + (w ? " wall" : "") + '" style="' + pos(100 + x * 90, 140 + y * 90) + '">' + (w ? "棚" : "") + "</div>";
      }
    }
    h += '<div class="g4-goal" style="' + pos(380, 330) + '">荷</div><div class="g4-lift">車</div>';
    h += '<div class="g4-panel" style="' + pos(640, 140, 560, 450) + '"></div><div class="g4-label" style="' + pos(662, 160) + '">めいれい（さいだい 8 こ）</div>';
    var arrows = ["↑", "↑", "→", "→", "→"];
    for (var s = 0; s < 8; s++) {
      h += '<div class="g4-slot' + (s < 5 ? " dm-s" + (s + 1) : "") + '" style="' + pos(662 + s * 64, 194) + '">' + (s < 5 ? "<span>" + arrows[s] + "</span>" : "") + "</div>";
    }
    h += '<div class="dm-btn" style="' + pos(662, 280) + '">↑</div><div class="dm-btn" style="' + pos(770, 280) + '">↓</div>' +
      '<div class="dm-btn" style="' + pos(878, 280) + '">←</div><div class="dm-btn" style="' + pos(986, 280) + '">→</div>' +
      '<div class="dm-btn dm-del" style="' + pos(662, 370) + '">ひとつ けす</div><div class="dm-btn dm-go" style="' + pos(820, 370) + '">しゅつじん</div>' +
      '<div class="g4-msg" style="' + pos(662, 470) + '">とどいた！ おみごと！</div>';
    return h + cur("dm-d4cur");
  }

  function demoId(k, ageClass) {
    if (k !== 3) { return "d" + k; }
    var st = P.G3_STAGES[ageClass];
    return "d3-" + (st ? st.lanes : 1);
  }
  function build(k, ageClass) {
    if (k === 1) { return d1(); }
    if (k === 2) { return d2(); }
    if (k === 4) { return d4(); }
    var st = P.G3_STAGES[ageClass];
    return d3(st ? st.lanes : 1);
  }
  function mount(figEl, k, ageClass) {
    var id = demoId(k, ageClass);
    figEl.innerHTML = '<section class="stage demo-stage" data-demo="' + id + '"><div class="demo-inner dm-d' + k + '">' + build(k, ageClass) + "</div></section>";
  }
  function unmount(figEl) { if (figEl) { figEl.innerHTML = ""; } }

  window.SJDemo = { mount: mount, unmount: unmount, demoId: demoId };
})();
