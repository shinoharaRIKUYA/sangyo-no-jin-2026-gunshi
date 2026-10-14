// 画面遷移・放置・係パネル・デバッグ（A-2・A-3-6）。計算は ShindanLogic を呼ぶだけ（D-1）
(function () {
  "use strict";
  var S = SJStage, T = SJTexts, P0 = SHINDAN_PARAMS, D0 = SHINDAN_DATA;
  var q = new URLSearchParams(location.search);
  var DEBUG = q.get("debug") === "1";
  var IDLE = q.get("idle") ? parseFloat(q.get("idle")) : 0;
  var T_ASK = IDLE ? IDLE * 1000 : 60000, T_ASK2 = IDLE ? 2000 : 10000, T_AFTER = IDLE ? 3000 : 30000;
  var PRINTTEST = q.get("printtest");
  var VERSION = "1.0.0";

  var stage = document.getElementById("stage");
  S.init(stage);
  var V = null;                       // 来場者 1 人の状態（受付へ戻ると破棄）
  var screenKey = null, idleKind = null, lastAct = performance.now(), asking = null, staff = null, busy = false;
  var SJ = { config: { child: SJPure.gameConfig("child"), adult: SJPure.gameConfig("adult") }, visitor: null, input: null, result: null, games: [] };
  if (DEBUG) { window.__sj = SJ; }    // 公開は ?debug=1 のときだけ（A-2-3）

  // ---- 共通 ---------------------------------------------------------------
  function clear() {
    stage.innerHTML = ""; screenKey = null; asking = null;
    SJNet.flush();                    // 画面遷移ごとに再送
  }
  function setIdle(kind) { idleKind = kind; lastAct = performance.now(); }
  ["pointerdown", "pointermove", "keydown"].forEach(function (ev) {
    document.addEventListener(ev, function () { if (!asking) { lastAct = performance.now(); } }, true);
  });
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.altKey && (e.key === "k" || e.key === "K")) { e.preventDefault(); toggleStaff(); return; }
    if (staff) { if (e.key === "Escape") { toggleStaff(); } return; }
    if (asking) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); asking.cont(); } return; }
    if (screenKey) { screenKey(e); }
  });
  function btn(parent, cls, text, fn) {
    var b = S.el("button", "btn " + (cls || ""), text, parent); b.type = "button";
    b.addEventListener("click", function (e) { fn(e); });
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });   // フォーカスを残さない（Enter の二重押下防止）
    return b;
  }

  // 放置: 通常画面は 60 秒で「つづけますか？」→10 秒で受付へ。印刷後は 30 秒で受付へ
  setInterval(function () {
    if (!idleKind || staff) { return; }
    var now = performance.now();
    if (asking) { if (now - asking.t0 >= T_ASK2) { showS0(); } return; }
    if (idleKind === "normal" && now - lastAct >= T_ASK) { askContinue(); }
    else if (idleKind === "after" && now - lastAct >= T_AFTER) { showS0(); }
  }, 200);
  function askContinue() {
    var ov = S.el("div", "overlay ask", null, stage);
    var box = S.el("div", "ask-box", null, ov);
    S.el("div", "ask-text", T.idle.ask, box);
    var bar = S.el("div", "ask-bar", null, box), fill = S.el("div", "ask-fill", null, bar);
    fill.style.animationDuration = (T_ASK2 / 1000) + "s";
    asking = { t0: performance.now(), cont: function () { if (ov.parentNode) { ov.parentNode.removeChild(ov); } asking = null; lastAct = performance.now(); } };
    btn(box, "big", T.idle.cont, function () { if (asking) { asking.cont(); } });
  }

  // ---- デバッグ表示 -------------------------------------------------------
  var dbg = null, dbgLive = null;
  if (DEBUG) {
    dbg = S.el("pre", "debug", "", document.body);
    setInterval(function () {
      var o = { n: V && V.n, n_source: V && V.nSource, mode: V && V.mode, degrade: V && V.degrade, live: dbgLive ? dbgLive() : null,
        games: SJ.games, input: SJ.input, net: SJNet.status() };
      dbg.textContent = JSON.stringify(o, null, 1);
    }, 300);
  }

  // ---- S0 受付 ------------------------------------------------------------
  function showS0() {
    clear(); V = null; SJ.visitor = null; SJ.input = null; SJ.result = null; SJ.games = []; dbgLive = null; busy = false;
    setIdle(null);
    var root = S.el("div", "screen s0", null, stage);
    var seal = S.el("div", "s0-seal", "陣", root);
    S.el("div", "s0-sub", T.subtitle, root);
    S.el("h1", "s0-title", T.title, root);
    S.el("div", "s0-child", T.s0.child, root);
    S.el("div", "s0-adult", T.s0.adult, root);
    if (PRINTTEST) { S.el("div", "s0-test", "printtest=" + PRINTTEST + "（推挙状は試験用の内容）", root); }
    root.addEventListener("click", function () { showS1(); });
    screenKey = function (e) { if (e.key === "Enter") { e.preventDefault(); showS1(); } };
    void seal;
  }

  // ---- S1 入口 ------------------------------------------------------------
  function defaultDay() {
    var d = new Date();
    if (d.getFullYear() === 2026 && d.getMonth() === 9 && [22, 23, 24].indexOf(d.getDate()) >= 0) { return d.getDate(); }
    return SJNet.lastDay() || 22;
  }
  function showS1() {
    clear(); setIdle("normal"); busy = false;
    var day = defaultDay();
    var root = S.el("div", "screen s1", null, stage);
    S.el("div", "s1-q", T.s1.dayQ, root);
    var days = S.el("div", "s1-days", null, root), dayBtns = {};
    [22, 23, 24].forEach(function (d) {
      dayBtns[d] = btn(days, "day" + (d === day ? " on" : ""), "10/" + d, function () {
        day = d; Object.keys(dayBtns).forEach(function (k) { dayBtns[k].classList.toggle("on", +k === d); });
      });
    });
    S.el("div", "s1-q", T.s1.ageQ, root);
    var ages = S.el("div", "s1-ages", null, root);
    T.s1.ages.forEach(function (a, i) {
      var cell = S.el("div", "s1-agecell", null, ages);
      btn(cell, "age", a, function () { confirmEntry(day, i); });
      if (i === 0) { S.el("div", "s1-help", T.s1.helper, cell); }
    });
    var wait = S.el("div", "s1-wait", "", root);
    function confirmEntry(d, ageClass) {
      if (busy) { return; }
      busy = true; wait.textContent = T.s1.wait;
      SJNet.setLastDay(d);
      Promise.all([SJNet.visitor(d), SJNet.getState(d)]).then(function (r) {
        var vis = r[0], st = r[1].state, settings = st.settings || SJNet.DEFAULT_SETTINGS;
        var degrade = !!settings.degrade, P = SJPure.effectiveParams(P0, degrade);
        V = {
          day: d, ageClass: ageClass, mode: ShindanLogic.modeOf(ageClass, P),
          n: vis.n, nSource: vis.source, nLabel: vis.label, clientId: vis.clientId, localSeq: vis.localSeq,
          settings: settings, degrade: degrade, P: P, ov: settings.overrides || {},
          data: SJPure.applyOverrides(D0, settings.overrides || {}), countsBase: st.counts || {}, online: r[1].online,
          order: degrade ? [1, 2, 3] : [1, 2, 3, 4], games: [], q1: null, q2: null, q3: null, res: null
        };
        SJ.visitor = V;
        busy = false;
        explain(0);
      }).catch(function () {
        busy = false; wait.textContent = "";   // 例外でも入口を固めない（A-6-6。ボタンを押し直せる）
      });
    }
  }

  // ---- 陣の説明 → 陣 ------------------------------------------------------
  var DIAG = {
    1: '<svg viewBox="0 0 300 120"><rect x="10" y="10" width="280" height="100" rx="6" class="d-ita"/><line x1="40" y1="60" x2="260" y2="60" class="d-ink"/><circle cx="40" cy="60" r="10" class="d-shu"/><circle cx="260" cy="60" r="10" class="d-sumi"/></svg>',
    2: '<svg viewBox="0 0 300 120"><rect x="20" y="20" width="110" height="80" class="d-shadow"/><rect x="200" y="40" width="60" height="40" class="d-part"/><path d="M190 60 L140 60" class="d-arrow"/></svg>',
    3: '<svg viewBox="0 0 300 120"><rect x="0" y="20" width="300" height="40" class="d-belt"/><rect x="120" y="22" width="36" height="36" class="d-box"/><text x="138" y="47" class="d-mark">●</text><path d="M138 70 L60 105 M138 70 L220 105" class="d-arrow"/></svg>',
    4: '<svg viewBox="0 0 300 120"><g class="d-grid"><rect x="20" y="10" width="100" height="100"/><path d="M45 10 V110 M70 10 V110 M95 10 V110 M20 35 H120 M20 60 H120 M20 85 H120"/></g><text x="160" y="70" class="d-cmd">↑ ↑ → → →</text></svg>'
  };
  function explain(i) {
    if (!V) { return; }
    clear(); setIdle("normal");
    var k = V.order[i], g = T.games[k - 1], total = V.order.length;
    var root = S.el("div", "screen s2", null, stage);
    S.el("div", "s2-prog", T.progress(i, total), root);
    S.el("h2", "s2-name", g.name, root);
    var fig = S.el("div", "s2-fig", null, root); fig.innerHTML = DIAG[k];
    S.el("div", "s2-text", g[V.mode], root);
    S.el("div", "s2-time", (V.mode === "adult" ? "制限時間 " : "じかん ") + g.limit + (V.mode === "adult" ? " 秒" : " びょう"), root);
    var go = function () { if (busy) { return; } busy = true; countdown(function () { busy = false; play(i); }); };
    btn(root, "big go", T.start, go);
    screenKey = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  }
  function countdown(done) {
    setIdle(null);
    var ov = S.el("div", "overlay count", "3", stage), c = 3;
    var t = setInterval(function () {
      c--;
      if (c > 0) { ov.textContent = String(c); return; }
      clearInterval(t); if (ov.parentNode) { ov.parentNode.removeChild(ov); } done();
    }, 700);
  }
  function play(i) {
    if (!V) { return; }
    clear(); setIdle(null);
    var k = V.order[i], vis = V;
    var ctx = { mode: V.mode, n: V.n, stageEl: stage, debug: DEBUG, progress: T.progress(i, V.order.length),
      debugHook: function (fn) { dbgLive = fn; } };
    SJGame[k].start(ctx).then(function (out) {
      dbgLive = null;
      if (V !== vis) { return; }
      var sc = ShindanLogic.scoreGame(k, V.mode, out.m, V.P);
      var rec = { g: k, end: out.end, m: out.m, p1: sc.p1, p2: sc.p2, s: sc.s, raw: out.raw };
      V.games.push(rec); SJ.games = V.games;
      var ov = S.el("div", "overlay endmark " + out.end, out.end === "done" ? T.done : T.timeout, stage);
      void ov;
      setTimeout(function () {
        if (V !== vis) { return; }
        if (i + 1 < V.order.length) { explain(i + 1); } else { question(0); }
      }, 1500);
    });
  }

  // ---- S3 軍師の問い ------------------------------------------------------
  var ICON = {
    wood: '<svg viewBox="0 0 80 60"><rect x="5" y="15" width="70" height="30" class="i-ita"/><circle cx="40" cy="30" r="10" class="i-line"/><circle cx="40" cy="30" r="5" class="i-line"/></svg>',
    metal: '<svg viewBox="0 0 80 60"><path d="M40 5 L45 25 L65 20 L50 33 L62 52 L40 40 L18 52 L30 33 L15 20 L35 25 Z" class="i-spark"/></svg>',
    screen: '<svg viewBox="0 0 80 60"><rect x="5" y="8" width="45" height="32" class="i-line"/><rect x="45" y="22" width="30" height="34" class="i-paper"/></svg>',
    truck: '<svg viewBox="0 0 80 60"><rect x="5" y="15" width="45" height="28" class="i-line"/><rect x="50" y="25" width="22" height="18" class="i-line"/><circle cx="18" cy="48" r="6" class="i-fill"/><circle cx="60" cy="48" r="6" class="i-fill"/></svg>',
    none: '<svg viewBox="0 0 80 60"><text x="40" y="42" class="i-q">？</text></svg>'
  };
  function question(qi) {
    if (!V) { return; }
    var list = V.degrade ? ["q1", "q2", "q3"] : ["q1", "q2"];
    if (qi >= list.length) { compute(); return; }
    clear(); setIdle("normal");
    var qd = T.questions[list[qi]], root = S.el("div", "screen s3", null, stage);
    S.el("div", "s3-head", T.questions.heading[V.mode] + "（" + (qi + 1) + " / " + list.length + "）", root);
    S.el("h2", "s3-text", qd.text[V.mode], root);
    var cards = S.el("div", "s3-cards n" + qd.options.length, null, root);
    var pick = function (o) {
      if (busy) { return; } busy = true;
      V[list[qi]] = o.value;
      setTimeout(function () { busy = false; question(qi + 1); }, 150);
    };
    qd.options.forEach(function (o, j) {
      var c = btn(cards, "card", "", function () { pick(o); });
      S.el("span", "card-no", String(j + 1), c);
      if (o.icon) { var ic = S.el("span", "card-icon", null, c); ic.innerHTML = ICON[o.icon]; }
      S.el("span", "card-label", o[V.mode], c);
    });
    S.el("div", "s3-hint", T.questions.keyHint[V.mode], root);
    screenKey = function (e) { var d = parseInt(e.key, 10); if (d >= 1 && d <= qd.options.length) { e.preventDefault(); pick(qd.options[d - 1]); } };
  }

  // ---- 結果（A-3-6。recommend は 1 回だけ） -------------------------------
  function compute() {
    var s = [0, 0, 0, 0];
    V.games.forEach(function (g) { s[g.g - 1] = g.s; });          // 縮退時は s[3] = 0 のまま
    var counts = SJNet.countsFor(V.day, V.countsBase);
    var input = { day: V.day, ageClass: V.ageClass, n: V.n, s: s, q1: V.q1, q2: V.q2, q3: V.degrade ? V.q3 : null };
    SJ.input = { input: input, counts: counts, degrade: V.degrade, ov: V.ov };
    try {
      V.res = ShindanLogic.recommend(input, V.data, counts, V.P);
    } catch (err) {
      V.res = { profile: { top: 0, second: 1 }, picks: [], honmei: null, experienceCount: 0, message: "受付で ご案内します", error: String(err.message || err) };
    }
    V.counts = counts;
    var res = V.res;
    SJ.result = { picks: res.picks.map(function (p) { return p.program_id; }), honmei: res.honmei ? res.honmei.program_id : null,
      top: res.profile.top, second: res.profile.second, message: res.message, error: res.error || null };
    if (!res.error) {
      SJNet.finish({
        key: V.clientId + "-" + V.localSeq, client_id: V.clientId, client_ts: new Date().toISOString(), v: VERSION,
        day: V.day, n: V.n, n_source: V.nSource, ageClass: V.ageClass, mode: V.mode, degrade: V.degrade,
        games: V.games, s: s, q1: V.q1, q2: V.q2, q3: V.degrade ? V.q3 : null,
        top: res.profile.top, second: res.profile.second,
        picks: SJ.result.picks, honmei: SJ.result.honmei, expCount: res.experienceCount,
        counts_used: counts, ov: V.ov
      });
    }
    showS4();
  }

  // ---- S4 見立て・S5 印刷 -------------------------------------------------
  function showS4() {
    clear(); setIdle("normal");
    var vis = V;
    SJResult.showS4(stage, V, function (pb) {
      if (V !== vis) { return; }
      pb.disabled = true;
      setTimeout(function () { pb.disabled = false; pb.textContent = T.s4.reprint; }, 5000);
      // Web フォントを最大 1.5 秒待ってから組む（計測 fit() を揃える。D-27。待ちきれなければそのまま進む）
      SJResult.whenFontsReady(1500).then(function () {
        if (V !== vis) { return; }
        SJResult.buildSheet(V, PRINTTEST === "longest" ? SJResult.longestRows(D0) : null);
        SJResult.print();
      });
    }, function () { showS0(); });
  }
  window.addEventListener("afterprint", function () {
    if (!V || !V.res) { return; }
    if (!stage.querySelector(".s5")) {
      var box = S.el("div", "s5", null, stage);
      S.el("div", "s5-text", T.s5[V.mode], box);
      btn(box, "big", T.s4.next, function () { showS0(); });
    }
    setIdle("after");
  });

  // ---- 係パネル（Ctrl+Alt+K） --------------------------------------------
  function toggleStaff() {
    if (staff) { staff.parentNode.removeChild(staff); staff = null; lastAct = performance.now(); return; }
    staff = S.el("div", "overlay staff", null, stage);
    var box = S.el("div", "staff-box", null, staff);
    S.el("h3", null, "係パネル", box);
    var st = SJNet.status();
    var lines = [
      "PC: " + (SJNet.pcName() || "（未設定）") + "　client: " + st.clientId + (st.alias ? "（" + st.alias + "）" : ""),
      "通信: " + (st.online === null ? "未確認" : (st.online ? "良好" : "不通 " + st.lastErr)),
      "未送信: " + st.pending + " 件　破棄: " + st.dead + " 件",
      "設定: " + (V ? (V.degrade ? "縮退（三陣＋問い Q3）" : "通常（四陣）") : "次の来場者の入口で取得") + "　来場日の既定: " + (SJNet.lastDay() || 22)
    ];
    lines.forEach(function (t) { S.el("div", "staff-line", t, box); });
    var row = S.el("div", "staff-row", null, box);
    S.el("span", null, "来場日: ", row);
    [22, 23, 24].forEach(function (d) { btn(row, "small", "10/" + d, function () { SJNet.setLastDay(d); toggleStaff(); toggleStaff(); }); });
    var row2 = S.el("div", "staff-row", null, box);
    S.el("span", null, "PC 名: ", row2);
    var inp = S.el("input", null, null, row2); inp.value = SJNet.pcName(); inp.maxLength = 16;
    btn(row2, "small", "保存", function () { SJNet.setPcName(inp.value); toggleStaff(); toggleStaff(); });
    var row3 = S.el("div", "staff-row", null, box);
    btn(row3, "small", "今すぐ再送", function () { SJNet.flush().then(function () { toggleStaff(); toggleStaff(); }); });
    btn(row3, "small", "閉じる（Esc）", function () { toggleStaff(); });
  }

  // ---- 起動 ---------------------------------------------------------------
  if (PRINTTEST === "longest") {
    // 推挙状 1 枚化の確認用（A-2-3）: 注記が長い上位 5 行を流し込んでおく
    SJResult.whenFontsReady(1500).then(function () {
      SJResult.buildSheet({ nLabel: "13", day: 22, mode: "adult", res: { profile: { top: 0, second: 1 }, picks: [], honmei: null, message: "" } }, SJResult.longestRows(D0));
    });
  }
  showS0();
})();
