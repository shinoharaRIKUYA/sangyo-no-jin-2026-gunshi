// 結果画面（S4）・推挙状（A-5）・印刷。計算はしない（app.js が recommend を 1 回だけ呼んだ結果 res を表示する）
var SJResult = (function () {
  "use strict";
  var S = SJStage, P = SJPure, T = SJTexts;
  var A4_PX = 1031;                                   // 273mm ≒ 1031px@96dpi（A4 の印刷可能高さ）

  function row(pick) { return pick.row || pick; }

  // 力の横棒グラフ（PRJ-116）: 4 軸の点（0〜100）を横棒で。主（top）は朱。cls で画面用（s4-gr）と推挙状用（sh-gr）を分ける
  // 0 点でも棒の頭が見えるよう最小 2%。軸の並びは T.axes の順（K1〜K4）
  function bars(parent, scores, top, cls, title) {
    var g = S.el("div", cls, null, parent);
    if (title) { S.el("div", cls + "-h", title, g); }
    T.axes.forEach(function (a, i) {
      var v = Math.max(0, Math.min(100, +scores[i] || 0));
      var r = S.el("div", cls + "-row" + (i === top ? " top" : ""), null, g);
      S.el("span", cls + "-label", a.word, r);
      var tr = S.el("span", cls + "-track", null, r);
      S.el("span", cls + "-fill", null, tr).style.width = Math.max(2, v) + "%";
    });
    return g;
  }

  // S4 見立て
  function showS4(stageEl, V, onPrint, onNext) {
    var mode = V.mode, res = V.res, ax = T.axes;
    var top = ax[res.profile.top], sec = ax[res.profile.second];
    var root = S.el("div", "screen s4", null, stageEl);
    S.el("div", "s4-head", mode === "adult" ? T.s4.adult(top.word, sec.word) : T.s4.child(top.word, sec.word), root);
    var topRow = S.el("div", "s4-top", null, root);
    var big = S.el("div", "s4-type", null, topRow);
    S.el("div", "s4-main", top.word, big);
    S.el("div", "s4-kana", top.kana, big);
    S.el("div", "s4-sub", "従: " + sec.word, big);
    if (res.profile.scores) { bars(topRow, res.profile.scores, res.profile.top, "s4-gr", T.s4.graph[mode]); }
    if (res.message) { S.el("div", "s4-msg", res.message, root); }
    var list = S.el("div", "s4-cards", null, root);
    res.picks.forEach(function (pk) {
      var r = row(pk), c = S.el("div", "s4-card" + (res.honmei && res.honmei.program_id === r.program_id ? " honmei" : ""), null, list);
      if (res.honmei && res.honmei.program_id === r.program_id) { S.el("div", "s4-hon", T.s4.honmei, c); }
      S.el("div", "s4-kind", "【" + r["種別"] + "】", c);
      S.el("div", "s4-pname", r["プログラム名"], c);
      S.el("div", "s4-ename", r["出展者名"], c);
    });
    var bar = S.el("div", "s4-btns", null, root);
    var pb = S.el("button", "btn big", T.s4.print, bar); pb.type = "button";
    var nb = S.el("button", "btn big sub", T.s4.next, bar); nb.type = "button";
    pb.addEventListener("click", function () { onPrint(pb); });
    nb.addEventListener("click", onNext);
    return { printBtn: pb };
  }

  function fmtDate(day) { return "2026年10月" + day + "日"; }

  // 軍師の一言（設計変更票 #2 §3-1 論点 9）: 主文 + 従文。主＝従（想定外）は主文だけ。「」で囲む
  function hitokoto(top, second) {
    var h = T.sheet.hitokoto, s = h.main[top] || "";
    if (second !== top && h.sub[second]) { s += h.sub[second]; }
    return "「" + s + "」";
  }

  // ラベル囲み 1 組（.sh-row = .sh-label + .sh-val）
  function labelRow(parent, label, value) {
    var r = S.el("div", "sh-row", null, parent);
    S.el("span", "sh-label", label, r);
    S.el("span", "sh-val", value, r);
    return r;
  }

  // 推挙状を組み立てる（#sheet）。構成: 表題行 → 二重線 → メタ行 → 見立て＋一言 → カード 2 列グリッド（＋6 セル目に定型文）
  function buildSheet(V, picksOverride) {
    var sh = document.getElementById("sheet");
    sh.innerHTML = ""; sh.className = "";
    var res = V.res, top = T.axes[res.profile.top], sec = T.axes[res.profile.second], L = T.sheet.labels;
    var picks = picksOverride || res.picks;
    // 表題行
    var head = S.el("div", "sh-head", null, sh);
    S.el("div", "sh-title", T.sheet.title, head);
    var subs = S.el("div", "sh-subs", null, head);
    S.el("div", "sh-sub sub1", T.sheet.sub1, subs);
    S.el("div", "sh-sub sub2", T.sheet.sub2, subs);
    S.el("div", "sh-rule", null, sh);
    S.el("div", "sh-meta", "仕官番号 第 " + V.nLabel + " 号　／　来場日 " + fmtDate(V.day) + "　／　" + T.modeName[V.mode], sh);
    // 見立て箱＋軍師の一言
    var mrow = S.el("div", "sh-mitate-row", null, sh);
    var mi = S.el("div", "sh-mitate", null, mrow);
    S.el("div", "sh-mitate-h", L.mitate, mi);
    var a1 = S.el("div", "sh-axis main", null, mi);
    S.el("span", "sh-mark", L.main, a1); S.el("span", "sh-word", top.word, a1);
    var a2 = S.el("div", "sh-axis sub", null, mi);
    S.el("span", "sh-mark", L.sub, a2); S.el("span", "sh-word", sec.word, a2);
    if (res.profile.scores) { bars(mi, res.profile.scores, res.profile.top, "sh-gr", L.graph); }
    var hk = S.el("div", "sh-hitokoto", null, mrow);
    S.el("div", "sh-hitokoto-h", L.hitokoto, hk);
    S.el("div", "sh-hitokoto-body", hitokoto(res.profile.top, res.profile.second), hk);
    // カード
    var grid = S.el("div", "sh-grid", null, sh);
    picks.forEach(function (pk) {
      var r = row(pk), hon = !picksOverride && res.honmei && res.honmei.program_id === r.program_id;
      var c = S.el("div", "sh-card" + (hon ? " honmei" : ""), null, grid);
      var c1 = S.el("div", "sh-c1", null, c);
      var kind = r["種別"] === "体験" ? "taiken" : "kengaku";
      S.el("span", "sh-kind " + kind, L.kind[r["種別"]] || r["種別"], c1);
      S.el("span", "sh-ename", r["出展者名"], c1);
      if (hon) { S.el("span", "sh-honmei", L.honmei, c1); }   // 本命帯は 1 行目の flex 末尾（margin-left:auto）。出展者名と重ならない（レビュー v2 #2）
      S.el("div", "sh-c2", r["プログラム名"], c);
      var rows = S.el("div", "sh-rows", null, c);
      labelRow(rows, L.days, P.daysLabel(r));
      labelRow(rows, L.reserve, P.reserveLabel(r["予約区分"]));
      var du = P.durationLabel(r["所要分"]), co = P.costLabel(r["費用円"]);
      if (du) { labelRow(rows, L.duration, du); }
      if (co) { labelRow(rows, L.cost, co); }
      labelRow(rows, L.age, P.ageLabel(r["年齢注記"]));
      if (r["カード注記"]) { var n = S.el("div", "sh-c5", r["カード注記"], c); n.setAttribute("data-full", r["カード注記"]); }
    });
    // 6 セル目: カードが偶数枚（0・2・4）なら 2 列分に広げる
    var fb = S.el("div", "sh-fixedblock" + (picks.length % 2 === 0 ? " wide" : ""), null, grid);
    if (res.message && !picksOverride) { S.el("div", "sh-msg", res.message, fb); }
    S.el("div", "sh-fixed", T.sheet.fixed, fb);
    S.el("div", "sh-privacy", T.sheet.privacy, fb);
    fit();
    return sh;
  }

  // Web フォント（D-27）の読込を最大 ms だけ待つ。読めなくても必ず解決する（体験を止めない）
  // document.fonts.ready は「使われているフォント」が無いと即解決するため、推挙状で使う書体を load() で先に要求する
  // Google Fonts は unicode-range で分割配信されるので、load(spec, text) の text に推挙状の日本語文字列を渡し、
  // 日本語サブセットを初回印刷前に読ませる（レビュー v2 #1）。出展者名・プログラム名・注記は含まない（代表文字列で足りる）
  var FONT_SPECS = ['900 30pt "Noto Serif JP"', '700 12pt "Noto Serif JP"', '400 10pt "BIZ UDPGothic"', '700 10pt "BIZ UDPGothic"'];
  function objValues(o) { return Object.keys(o).map(function (k) { return typeof o[k] === "object" ? objValues(o[k]) : o[k]; }).join(""); }
  var FONT_TEXT = T.sheet.title + T.sheet.sub1 + T.sheet.sub2
    + T.sheet.hitokoto.main.join("") + T.sheet.hitokoto.sub.join("") + objValues(T.sheet.labels)
    + T.sheet.fixed + T.sheet.privacy + T.sheet.more + objValues(T.modeName)
    + T.axes.map(function (a) { return a.word; }).join("")
    + "仕官番号第号／来場日2026年10月日「」0123456789";
  function whenFontsReady(ms, text) {
    return new Promise(function (resolve) {
      var done = false, fin = function () { if (!done) { done = true; resolve(); } };
      setTimeout(fin, ms || 1500);
      if (!document.fonts || !document.fonts.load) { fin(); return; }
      try {
        Promise.all(FONT_SPECS.map(function (s) { return document.fonts.load(s, text || FONT_TEXT).catch(function () { return null; }); }))
          .then(function () { return document.fonts.ready; }).then(fin, fin);
      } catch (e) { fin(); }
    });
  }
  // 先読み（読込中の 1 回目の印刷でも揃いやすくする）。失敗しても何もしない
  if (typeof window !== "undefined") { window.addEventListener("load", function () { whenFontsReady(10000); }); }

  // 高さを測る（画面外に A4 幅で描いて測る）
  function measure() {
    var sh = document.getElementById("sheet");
    sh.classList.add("measure");
    var h = sh.getBoundingClientRect().height;
    sh.classList.remove("measure");
    return Math.round(h);
  }
  // 1 枚に収める: 超えたら .compact、それでも超えたら注記を省略
  function fit() {
    var sh = document.getElementById("sheet");
    if (measure() <= A4_PX) { return "normal"; }
    sh.classList.add("compact");
    if (measure() <= A4_PX) { return "compact"; }
    var notes = sh.querySelectorAll(".sh-c5");
    for (var lim = 60; lim >= 20 && measure() > A4_PX; lim -= 10) {
      for (var i = 0; i < notes.length; i++) {
        var full = notes[i].getAttribute("data-full");
        if (full.length > lim) { notes[i].textContent = full.slice(0, lim) + T.sheet.more; }
      }
    }
    return "clipped";
  }

  // ?printtest=longest: カード注記が長い上位 5 行
  function longestRows(data) {
    return (data.rows || data).slice().sort(function (a, b) { return (b["カード注記"] || "").length - (a["カード注記"] || "").length; }).slice(0, 5);
  }

  function print() { window.print(); }

  return { bars: bars, showS4: showS4, buildSheet: buildSheet, hitokoto: hitokoto, whenFontsReady: whenFontsReady, measure: measure, fit: fit, longestRows: longestRows, print: print, A4_PX: A4_PX };
})();
