// 軍師（PRJ-114 設計書 §3-2・§3-5）: コード内の SVG・まばたき・表情・say／stop・Web Audio 再生と口パク
// T1 試作: mount・say・口パク・まばたき ／ T3: 常駐層（attach）・scene の位置表・吹き出し・クレジット・音量・隠す・?gunshi=off
var SJGunshi = (function () {
  "use strict";

  // --- SVG（viewBox 全身 0 0 300 400。座標は付録 B） ---
  // 軍配の板（瓢箪形: 上の大きな丸＋柄へ細る首）。設計変更票 #2 で采配から描き替え
  var GUNBAI_ITA = "M248,100 C268,100 280,116 280,140 C280,162 270,178 258,186 C254,189 253,193 253,198 " +
    "L243,198 C243,193 242,189 238,186 C226,178 216,162 216,140 C216,116 228,100 248,100 Z";
  var SVG =
    '<svg class="gs-svg" id="gs-svg" viewBox="0 0 300 400" data-face="normal" data-mouth="x" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
    '<g id="gs-root">' +
      '<ellipse cx="150" cy="393" rx="72" ry="6" fill="rgba(30,30,30,.12)"/>' +
      // 脚: 袴と足袋
      '<g data-part="legs">' +
        '<path class="gs-matsu gs-line" d="M114,296 L150,296 L147,374 L106,374 Z"/>' +
        '<path class="gs-matsu gs-line" d="M150,296 L186,296 L194,374 L153,374 Z"/>' +
        '<path d="M129,302 L126,368 M171,302 L174,368" fill="none" stroke="rgba(30,30,30,.35)" stroke-width="2"/>' +
        '<ellipse class="gs-tabi gs-line" cx="126" cy="383" rx="20" ry="10"/>' +
        '<ellipse class="gs-tabi gs-line" cx="174" cy="383" rx="20" ry="10"/>' +
      '</g>' +
      // 左腕: 袖と腰に当てた手
      '<g data-part="arm-l">' +
        '<path class="gs-shu gs-line" d="M116,218 Q90,232 87,268 L110,277 Q114,248 128,232 Z"/>' +
        '<circle class="gs-hada gs-line" cx="100" cy="282" r="11"/>' +
      '</g>' +
      // 胴まわり: 草摺・胴（藍）・陣羽織（朱・金の縁）・胸の丸紋
      '<g data-part="torso">' +
        '<path class="gs-ai gs-line" d="M108,286 L192,286 L199,312 L101,312 Z"/>' +
        '<path class="gs-kin-line" style="stroke-width:2" d="M106,299 L194,299"/>' +
        '<rect class="gs-ai gs-line" x="108" y="212" width="84" height="92" rx="14"/>' +
        '<path class="gs-kin-line" style="stroke-width:2" d="M136,236 L164,236 M136,276 L164,276"/>' +
        '<path class="gs-shu gs-line" d="M99,210 Q118,205 137,212 L131,302 L97,298 Z"/>' +
        '<path class="gs-shu gs-line" d="M201,210 Q182,205 163,212 L169,302 L203,298 Z"/>' +
        '<path class="gs-kin-line" d="M136,215 L130,299 M164,215 L170,299"/>' +
        '<circle class="gs-kin gs-line" cx="150" cy="256" r="10"/>' +
        '<circle class="gs-ai" cx="150" cy="256" r="4"/>' +
      '</g>' +
      // 右腕＋軍配（腕の軸 196,230・軍配の軸は首 248,198）
      '<g data-part="arm-r">' +
        '<g data-part="gunbai"><g transform="translate(-6,0)">' +   // 上半身で右端が切れないよう左へ 6px（設計変更票 #3）
          // 柄頭の小さな房（朱）と環（金）
          '<path class="gs-shu" stroke="#1e1e1e" stroke-width="1.8" d="M224,276 Q218,286 220,294 L228,294 Q230,286 226,276 Z"/>' +
          '<circle class="gs-kin" stroke="#1e1e1e" stroke-width="1.5" cx="225" cy="274" r="3.5"/>' +
          // 柄
          '<line x1="226" y1="272" x2="248" y2="194" stroke="#1e1e1e" stroke-width="11" stroke-linecap="round"/>' +
          '<line x1="226" y1="272" x2="248" y2="194" stroke="#d9b98a" stroke-width="6" stroke-linecap="round"/>' +
          // 板: 墨の外線→黒漆→金の縁
          '<path d="' + GUNBAI_ITA + '" fill="none" stroke="#1e1e1e" stroke-width="10" stroke-linejoin="round"/>' +
          '<path class="gs-gunbai-ita" d="' + GUNBAI_ITA + '"/>' +
          // 図柄: 金の輪と日輪
          '<circle cx="248" cy="140" r="20" fill="none" stroke="#a8873a" stroke-width="3"/>' +
          '<circle class="gs-kin" cx="248" cy="140" r="12"/>' +
          '<path d="M248,166 L248,192" stroke="#a8873a" stroke-width="3" stroke-linecap="round"/>' +
        '</g></g>' +
        '<path class="gs-shu gs-line" d="M186,216 Q214,220 238,240 L226,263 Q206,247 186,242 Z"/>' +
        '<circle class="gs-hada gs-line" cx="232" cy="252" r="11"/>' +
      '</g>' +
      // 頭（軸 150,215）。内側の gs-nod で話す時のうなずき
      '<g data-part="head"><g class="gs-nod">' +
        '<path class="gs-ai gs-line" d="M82,148 Q80,200 112,206 L188,206 Q220,200 218,148 Z"/>' +
        '<path class="gs-kin-line" style="stroke-width:2" d="M85,172 Q150,184 215,172 M90,192 Q150,202 210,192"/>' +
        '<g data-part="face">' +
          '<ellipse class="gs-hada gs-line" cx="150" cy="172" rx="58" ry="51"/>' +
          '<ellipse class="gs-hoho" cx="118" cy="189" rx="10" ry="6"/>' +
          '<ellipse class="gs-hoho" cx="182" cy="189" rx="10" ry="6"/>' +
        '</g>' +
        '<g data-part="kabuto">' +
          '<path class="gs-ai gs-line" d="M90,136 Q90,80 150,78 Q210,80 210,136 Z"/>' +
          '<path d="M122,84 Q113,108 112,134 M150,78 L150,134 M178,84 Q187,108 188,134" fill="none" stroke="#a8873a" stroke-width="2.5"/>' +
          '<rect class="gs-kin gs-line" x="82" y="128" width="136" height="13" rx="6.5"/>' +
        '</g>' +
        '<g data-part="kuwagata">' +
          '<path class="gs-kin gs-line" style="stroke-width:2.5" d="M145,112 C112,104 86,74 80,20 C98,58 122,86 150,98 Z"/>' +
          '<path class="gs-kin gs-line" style="stroke-width:2.5" d="M155,112 C188,104 214,74 220,20 C202,58 178,86 150,98 Z"/>' +
          '<circle class="gs-kin gs-line" cx="150" cy="108" r="11"/>' +
          '<circle class="gs-shu" cx="150" cy="108" r="4.5"/>' +
        '</g>' +
        '<path data-part="brow-l" class="gs-brow" d="M118,154 Q129,145 141,150"/>' +
        '<path data-part="brow-r" class="gs-brow" d="M159,150 Q171,145 182,154"/>' +
        '<g data-part="eyes-open">' +
          '<g class="gs-eye"><ellipse class="gs-sumi" cx="130" cy="169" rx="5" ry="7"/><circle class="gs-white" cx="131.6" cy="166.4" r="1.6"/></g>' +
          '<g class="gs-eye"><ellipse class="gs-sumi" cx="170" cy="169" rx="5" ry="7"/><circle class="gs-white" cx="171.6" cy="166.4" r="1.6"/></g>' +
        '</g>' +
        '<g data-part="eyes-closed"><path class="gs-eyeline" d="M124,170 Q130,175 136,170 M164,170 Q170,175 176,170"/></g>' +
        '<g data-part="eyes-joy"><path class="gs-eyeline" d="M123,172 Q130,162 137,172 M163,172 Q170,162 177,172"/></g>' +
        '<g data-part="mouth">' +
          '<g data-m="x"><path d="M142,194 Q150,198 158,194" fill="none" stroke="#1e1e1e" stroke-width="3" stroke-linecap="round"/></g>' +
          '<g data-m="a"><ellipse class="gs-kuchi" cx="150" cy="196" rx="12" ry="10"/><ellipse class="gs-shita" cx="150" cy="201" rx="7" ry="3.5"/></g>' +
          '<g data-m="i"><ellipse class="gs-kuchi" cx="150" cy="195" rx="14" ry="4"/></g>' +
          '<g data-m="u"><ellipse class="gs-kuchi" cx="150" cy="195" rx="6" ry="6"/></g>' +
          '<g data-m="e"><ellipse class="gs-kuchi" cx="150" cy="195" rx="12" ry="7"/><ellipse class="gs-shita" cx="150" cy="199" rx="6" ry="2.5"/></g>' +
          '<g data-m="o"><ellipse class="gs-kuchi" cx="150" cy="196" rx="9" ry="10"/></g>' +
        '</g>' +
      '</g></g>' +
    '</g></svg>';

  var VIEW = { full: "0 0 300 400", upper: "20 0 260 250" };
  var NOVOICE = /[?&]gunshi=novoice\b/.test(location.search);
  var OFF = /[?&]gunshi=off\b/.test(location.search);
  var CREDIT = "音声: VOICEVOX:黒沢冴白（合成音声）";   // D-16（設計変更票 #1）

  // 画面ごとの位置（論理座標 1280×720。設計書 §3-6）。b＝吹き出し: l/r＝左端/右端、t/bt＝上端/下端、w＝最大幅、fs＝文字、tail＝尾の向き
  var POS = {
    s0: { v: "upper", x: 1060, y: 515, w: 205, h: 205, b: { r: 1050, bt: 700, w: 480, fs: 28, tail: "r" } },
    s1: { v: "upper", x: 1090, y: 48, w: 170, h: 170, b: { l: 940, t: 222, w: 330, fs: 22, tail: "u" } },
    s2: { v: "full", x: 20, y: 147, w: 280, h: 373, b: { l: 20, bt: 140, w: 380, fs: 26, tail: "dl" } },
    g1: { v: "upper", x: 1095, y: 85, w: 170, h: 170, b: { r: 1085, t: 95, w: 385, fs: 24, tail: "r" } },
    g2: { hide: true },
    g3: { v: "upper", x: 1100, y: 82, w: 155, h: 155, b: { r: 1090, t: 92, w: 390, fs: 24, tail: "r" } },
    g3hi: { hide: true },                         // 三の陣 ageClass 2〜5 は姿を隠して声のみ（D-15）
    g4: { v: "upper", x: 5, y: 555, w: 130, h: 130, b: { l: 150, t: 610, w: 540, fs: 24, tail: "l" } },
    s3: { v: "upper", x: 1160, y: 606, w: 112, h: 112, b: null },   // 実測: カード 5 枚は y545・.s3-hint は y575〜604 まで（設計の 1060,512 では重なる）
    // 実測: 設計の右上（950〜1265×20〜230）は見立ての見出し行を隠すため、ボタンの下（y≈628〜712・一言 40〜50 字で 2 行）へ
    s4: { v: "upper", x: 1100, y: 550, w: 170, h: 170, b: { r: 1095, bt: 712, w: 620, fs: 20, tail: "r" } },
    s5: { v: "upper", x: 1040, y: 480, w: 220, h: 220, b: null }
  };
  var layer = null, boxEl = null, creditEl = null, sceneName = null, curPos = null;
  var staffHidden = false, userHidden = false, vol = 0.9, muted = false, resumeP = null;

  var svg = null, bubbleEl = null;
  var ctx = null, gain = null, src = null, raf = 0, token = 0, playing = null, pending = null;
  var faceTimer = 0, bubbleTimer = 0, furuTimer = 0, pseudoTimer = 0, pseudoEnd = 0;
  var bytes = {}, buffers = {}, loaded = 0, prefetched = false, hist = [], rowMap = null;

  function rows() {
    if (!rowMap) {
      rowMap = {};
      if (window.SJGunshiLines) { SJGunshiLines.expand(window.SJTexts).forEach(function (r) { rowMap[r.id] = r; }); }
    }
    return rowMap;
  }
  function rec(id, kind) {
    hist.push({ id: id, kind: kind, t: Date.now() });
    if (hist.length > 50) { hist.shift(); }
  }

  // --- 見た目 ---
  function mount(el, opt) {
    opt = opt || {};
    el.innerHTML = SVG;
    svg = el.querySelector("svg");
    bubbleEl = opt.bubble || null;
    view(opt.view || "full");
    blinkLoop();
    listenUnlock();
    return svg;
  }
  function view(v) { if (svg) { svg.setAttribute("viewBox", VIEW[v] || VIEW.full); } }
  function face(f) { if (svg) { svg.setAttribute("data-face", f || "normal"); } }
  function mouth(m) { if (svg && svg.getAttribute("data-mouth") !== m) { svg.setAttribute("data-mouth", m); } }
  function furu() {
    if (!svg) { return; }
    svg.classList.remove("gs-furu"); void svg.getBoundingClientRect();
    svg.classList.add("gs-furu");
    clearTimeout(furuTimer);
    furuTimer = setTimeout(function () { svg.classList.remove("gs-furu"); }, 700);
  }
  function bubble(text) {
    if (!bubbleEl) { return; }
    // 常駐層では、吹き出しの枠がある scene で、姿を出している時だけ出す（preview は従来どおり）
    if (layer && (!curPos || !curPos.b || isHidden())) { text = ""; }
    if (text) { bubbleEl.textContent = text; bubbleEl.classList.add("show"); }
    else { bubbleEl.classList.remove("show"); }
  }

  // まばたき: 2.5〜5.5 秒の乱数間隔で 120ms。2 割で 2 連続
  function blinkOnce() {
    if (!svg) { return; }
    svg.classList.add("gs-blink");
    setTimeout(function () { svg.classList.remove("gs-blink"); }, 120);
  }
  var blinking = false;
  function blinkLoop() {
    if (blinking) { return; }
    blinking = true;
    (function next() {
      setTimeout(function () {
        blinkOnce();
        if (Math.random() < 0.2) { setTimeout(blinkOnce, 260); }
        next();
      }, 2500 + Math.random() * 3000);
    })();
  }

  // --- 音声: 解錠・事前取得 ---
  // 解錠は running になるまで操作のたびに試す（レビュー v1 #1。修飾キー・Esc だけでは解錠されないブラウザがある）
  var listening = false, unlisten = null;
  function listenUnlock() {
    if (listening) { return; }
    listening = true;
    var h = function () { unlock(); };
    // タッチでは pointerdown はユーザー操作として数えられない（touchend・click で解錠される）ため、両方で試す（PRJ-117）
    var EVS = ["pointerdown", "keydown", "touchend", "click"];
    unlisten = function () {
      EVS.forEach(function (ev) { document.removeEventListener(ev, h, true); });
      listening = false; unlisten = null;
    };
    EVS.forEach(function (ev) { document.addEventListener(ev, h, true); });
  }
  function unlocked() { if (unlisten) { unlisten(); } prefetchAll(); }
  function unlock() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || NOVOICE) { if (unlisten) { unlisten(); } return; }
    try {
      if (ctx && ctx.state === "closed") { ctx = null; gain = null; }
      if (!ctx) {
        ctx = new AC();
        gain = ctx.createGain(); gain.connect(ctx.destination);
        applyGain();
      }
    } catch (e) { ctx = null; gain = null; return; }   // 次の操作で作り直す
    if (ctx.state === "running") { unlocked(); return; }
    try {
      var c = ctx;
      resumeP = c.resume().then(function () { if (c === ctx && c.state === "running") { unlocked(); } }, function () {});
    } catch (e) { /* 次の操作で resume をやり直す */ }
  }
  function urlOf(id) {
    var v = window.SJGunshiVoice && SJGunshiVoice.lines[id];
    return "voice/" + id + ".wav" + (v ? "?v=" + v.h : "");
  }
  // id ごとの進行中の取得を共有する（事前取得中に say されても 2 本目を出さない。レビュー v1 #3）
  var inflight = {};
  function fetchBytes(id) {
    if (bytes[id]) { return Promise.resolve(bytes[id]); }
    if (inflight[id]) { return inflight[id]; }
    inflight[id] = fetch(urlOf(id)).then(function (r) {
      if (!r.ok) { throw new Error("HTTP " + r.status); }
      return r.arrayBuffer();
    }).then(function (b) { delete inflight[id]; if (!bytes[id]) { bytes[id] = b; loaded++; } return b; },
      function (e) { delete inflight[id]; throw e; });
    return inflight[id];
  }
  // 待つのは ms まで（取得そのものは続け、後の say と事前取得で使う）
  function within(p, ms) {
    var tm = 0;
    return Promise.race([p, new Promise(function (ok, ng) { tm = setTimeout(function () { ng(new Error("timeout")); }, ms); })])
      .then(function (v) { clearTimeout(tm); return v; }, function (e) { clearTimeout(tm); throw e; });
  }
  function prefetchAll() {
    if (prefetched || !window.SJGunshiVoice) { return; }
    prefetched = true;
    var ids = Object.keys(SJGunshiVoice.lines);
    function worker() {
      var id = ids.shift();
      if (!id) { return Promise.resolve(); }
      return fetchBytes(id).then(worker, worker);
    }
    worker(); worker(); worker();  // 同時 3 本
  }
  function decode(id) {
    if (buffers[id]) { return Promise.resolve(buffers[id]); }
    return within(fetchBytes(id), 1500).then(function (b) {
      return ctx.decodeAudioData(b.slice(0));   // Promise 形だけ（レビュー v1 #2。会場は Chrome 前提）
    }).then(function (buf) { buffers[id] = buf; return buf; });
  }

  // --- 話す ---
  function finishLine() {
    playing = null;
    cancelAnimationFrame(raf);
    clearInterval(pseudoTimer);
    mouth("x");
    if (svg) { svg.classList.remove("talking"); }
    faceTimer = setTimeout(function () { face("normal"); }, 1200);
    bubbleTimer = setTimeout(function () { bubble(""); }, 1200);
  }
  function settle() { var p = pending; pending = null; if (p) { p(); } }

  function pseudo(row, my) {
    rec(row.id, "bubble");
    var dur = Math.max(1.5, (row.text || "").length * 0.12);
    var on = false;
    pseudoTimer = setInterval(function () { on = !on; mouth(on ? "a" : "x"); }, 120);
    pseudoEnd = setTimeout(function () { if (my === token) { finishLine(); settle(); } }, dur * 1000);
  }

  function say(id, opt) {
    opt = opt || {};
    if (OFF) { return Promise.resolve(); }
    stop();
    var my = ++token;
    var row = rows()[id] || { id: id, text: opt.text || "", type: "B", face: "normal" };
    clearTimeout(faceTimer); clearTimeout(bubbleTimer);
    face(opt.face || row.face || "normal");
    if (opt.bubble !== undefined) { bubble(opt.bubble); }
    else if (row.type === "B") { bubble(row.bubble || row.text); }
    if (row.act === "furu") { furu(); }
    playing = id;
    if (svg) { svg.classList.add("talking"); }
    return new Promise(function (resolve) {
      pending = resolve;
      var v = window.SJGunshiVoice && SJGunshiVoice.lines[id];
      // 解錠の直後（resume が終わる前）に呼ばれたら 300ms まで待つ（受付のクリック→S1 の s1_ask）
      if (!NOVOICE && v && ctx && ctx.state !== "running" && resumeP) {
        Promise.race([resumeP, new Promise(function (ok) { setTimeout(ok, 300); })]).then(function () { if (my === token) { play(); } });
      } else { play(); }
      function play() {
      if (NOVOICE || !ctx || ctx.state !== "running" || !v) { pseudo(row, my); return; }
      decode(id).then(function (buf) {
        if (my !== token) { return; }
        src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(gain);
        var t0 = ctx.currentTime, m = v.m, i = 0;
        src.onended = function () { if (my === token) { src = null; finishLine(); settle(); } };
        src.start();
        rec(id, "voice");
        (function step() {
          if (my !== token) { return; }
          var t = ctx.currentTime - t0 - (ctx.outputLatency || 0);
          while (i + 1 < m.length && m[i + 1][0] <= t) { i++; }
          mouth(t < 0 ? "x" : m[i][1]);
          raf = requestAnimationFrame(step);
        })();
      }).catch(function () { if (my === token) { pseudo(row, my); } });
      }
    });
  }

  // 前の行が終わってから 0.4 秒あけて次（途中で stop されたら打ち切り）
  function sayQueue(ids, opt) {
    var q = ids.slice();
    function next() {
      if (!q.length) { return Promise.resolve(); }
      var p = say(q.shift(), opt), my = token;
      return p.then(function () {
        if (my !== token || !q.length) { return; }
        return new Promise(function (ok) { setTimeout(ok, 400); }).then(function () { if (my === token) { return next(); } });
      });
    }
    return next();
  }

  function stop() {
    token++;
    if (src) { try { src.onended = null; src.stop(); } catch (e) { /* 既に停止 */ } src = null; }
    cancelAnimationFrame(raf);
    clearInterval(pseudoTimer); clearTimeout(pseudoEnd);
    clearTimeout(faceTimer); clearTimeout(bubbleTimer);
    playing = null;
    mouth("x");
    if (svg) { svg.classList.remove("talking"); }
    bubble("");
    settle();
  }

  window.addEventListener("beforeprint", stop);

  // --- 常駐層（T3。設計書 §3-6）: #app の中・#stage の兄弟。#stage の transform を写す ---
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* 保存できなくても続ける */ } }
  (function loadPrefs() {
    var v = parseFloat(lsGet("sj_gunshi_vol"));
    if (!isNaN(v) && v >= 0 && v <= 1) { vol = v; }
    muted = lsGet("sj_gunshi_mute") === "1";
    userHidden = lsGet("sj_gunshi_hide") === "1";
  })();
  function applyGain() { if (gain) { gain.gain.value = muted ? 0 : vol; } }
  function isHidden() { return OFF || staffHidden || userHidden || !curPos || !!curPos.hide; }
  function applyHidden() {
    if (!layer) { return; }
    var h = isHidden();
    layer.classList.toggle("gs-hide", h);
    if (h) { bubble(""); }
  }
  function attach(stageEl) {
    if (OFF || layer || !stageEl || !stageEl.parentNode) { return null; }
    layer = document.createElement("div"); layer.id = "gunshi-layer"; layer.setAttribute("aria-hidden", "true");
    boxEl = document.createElement("div"); boxEl.className = "gs-box";
    var bub = document.createElement("div"); bub.className = "gs-bubble";
    creditEl = document.createElement("div"); creditEl.className = "gs-credit"; creditEl.textContent = CREDIT;
    layer.appendChild(boxEl); layer.appendChild(bub); layer.appendChild(creditEl);
    stageEl.parentNode.insertBefore(layer, stageEl.nextSibling);
    mount(boxEl, { bubble: bub, view: "upper" });
    var copy = function () { layer.style.transform = stageEl.style.transform; };
    copy();
    if (window.MutationObserver) { new MutationObserver(copy).observe(stageEl, { attributes: true, attributeFilter: ["style"] }); }
    // 残り 10 秒（stage.js の hud が 1 陣 1 回だけ呼ぶ）
    if (window.SJStage && SJStage.hooks) { SJStage.hooks.warn = function () { say("ig_warn"); }; }
    applyHidden();
    return layer;
  }
  function scene(name, opt) {
    if (OFF || !layer) { return; }
    opt = opt || {};
    var key = (name === "g3" && opt.ageClass >= 2) ? "g3hi" : name;
    sceneName = name; curPos = POS[key] || null;
    var p = curPos;
    if (p && !p.hide) {
      boxEl.style.left = p.x + "px"; boxEl.style.top = p.y + "px"; boxEl.style.width = p.w + "px"; boxEl.style.height = p.h + "px";
      view(p.v);
    }
    var b = p && p.b, s = bubbleEl.style;
    bubbleEl.className = "gs-bubble" + (bubbleEl.classList.contains("show") ? " show" : "") + (b ? " tail-" + b.tail : "");
    if (b) {
      s.left = b.l !== undefined ? b.l + "px" : ""; s.right = b.r !== undefined ? (1280 - b.r) + "px" : "";
      s.top = b.t !== undefined ? b.t + "px" : ""; s.bottom = b.bt !== undefined ? (720 - b.bt) + "px" : "";
      s.maxWidth = b.w + "px"; s.fontSize = b.fs + "px";
    }
    applyHidden();
    if (!b) { bubble(""); }
  }
  // 係パネルを開いている間は姿と吹き出しを隠す（クレジットは残す）
  function hide(flag) { staffHidden = !!flag; applyHidden(); }
  // 係パネルの「軍師を隠す/出す」（保存する）
  function userHide(flag) { userHidden = !!flag; lsSet("sj_gunshi_hide", userHidden ? "1" : "0"); applyHidden(); }
  function setVol(v) {
    vol = Math.max(0, Math.min(1, Math.round(v * 10) / 10));
    lsSet("sj_gunshi_vol", String(vol)); applyGain();
  }
  function mute(flag) { muted = !!flag; lsSet("sj_gunshi_mute", muted ? "1" : "0"); applyGain(); }

  // 陣の説明の id（付録 A-0）。規則は SJGunshiLines.expId に一本化（レビュー v1 #6）
  function expId(k, mode, n) { return SJGunshiLines.expId(k, mode, n); }
  // S4: 見立て見出し→0.4 秒→一言。主＝従・error は何も話さない（付録 A-5）
  function sayResult(vis) {
    var r = vis && vis.res;
    if (OFF || !r || r.error || !r.profile) { return Promise.resolve(); }
    var a = r.profile.top, b = r.profile.second;
    if (a === b || a === undefined || a === null || b === undefined || b === null) { return Promise.resolve(); }
    return sayQueue(["s4h_" + vis.mode + "_" + a + b, "hito_" + a + b]);
  }

  function state() {
    return { ctx: ctx ? ctx.state : null, playing: playing, scene: sceneName, hidden: isHidden(),
      gain: vol, muted: muted, userHidden: userHidden, off: OFF, loaded: loaded };
  }
  function history() { return hist.slice(); }

  return { mount: mount, view: view, face: face, mouth: mouth, furu: furu, say: say, sayQueue: sayQueue, stop: stop,
    unlock: unlock, state: state, history: history,
    attach: attach, scene: scene, hide: hide, userHide: userHide, setVol: setVol, mute: mute, expId: expId, sayResult: sayResult };
})();
