// API 呼出し・2.5 秒タイムアウト・送信キュー（A-6-6）。失敗しても画面は止めない
var SJNet = (function () {
  "use strict";
  var API = "api/api.php", TIMEOUT = 2500, QMAX = 200, DEADMAX = 50;
  var q = new URLSearchParams(location.search);
  var alias = (q.get("client") || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
  var sfx = alias ? "_" + alias : "";              // ?client=B で別クライアントを模擬（AC 用）
  var mem = {};                                     // localStorage が使えないときの置き場
  var lastOk = null, lastErr = "", flushing = false;

  function lsGet(k) { try { var v = localStorage.getItem(k + sfx); return v === null ? (mem[k] || null) : v; } catch (e) { return mem[k] || null; } }
  function lsSet(k, v) { mem[k] = v; try { localStorage.setItem(k + sfx, v); } catch (e) { /* メモリだけで続行 */ } }
  function jget(k, dflt) { try { var v = lsGet(k); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; } }
  function jset(k, v) { lsSet(k, JSON.stringify(v)); }

  function hex8() {
    var a = new Uint8Array(4);
    if (window.crypto && crypto.getRandomValues) { crypto.getRandomValues(a); } else { for (var i = 0; i < 4; i++) { a[i] = Math.floor(Math.random() * 256); } }
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function client() {
    var c = jget("sj_client", null);
    if (!c || !/^c-[0-9a-f]{8}$/.test(c.id) || typeof c.localSeq !== "number") { c = { id: "c-" + hex8(), localSeq: 0 }; jset("sj_client", c); }
    return c;
  }

  function call(method, action, params, body, keepalive) {
    var url = API + "?a=" + action + (params ? "&" + params : "");
    var ctl = ("AbortController" in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) { ctl.abort(); } }, TIMEOUT);
    var opt = { method: method, cache: "no-store", headers: {} };
    if (ctl) { opt.signal = ctl.signal; }
    if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    if (keepalive) { opt.keepalive = true; }
    return fetch(url, opt).then(function (r) {
      clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; });
    }, function (e) {
      clearTimeout(timer);
      return { status: 0, json: null, error: String(e && e.name || e) };
    }).then(function (res) {
      if (res.status === 200 && res.json && res.json.ok) { lastOk = true; } else { lastOk = false; lastErr = res.status + ":" + (res.error || (res.json && res.json.error) || ""); }
      return res;
    });
  }

  var DEFAULT_SETTINGS = { degrade: false, phase: "trial", overrides: {} };

  // S1 確定時: state を取得してキャッシュ。失敗時はキャッシュ（無ければ既定値・counts {}）
  function getState(day) {
    return call("GET", "state", "day=" + day).then(function (res) {
      if (res.status === 200 && res.json && res.json.ok) {
        var st = { day: day, counts: res.json.counts || {}, settings: res.json.settings || DEFAULT_SETTINGS, seq: res.json.seq, at: res.json.serverTime };
        jset("sj_state_" + day, st);
        return { state: st, online: true };
      }
      var c = jget("sj_state_" + day, null);
      return { state: c || { day: day, counts: {}, settings: DEFAULT_SETTINGS }, online: false };
    });
  }

  // 来場者番号。失敗時は 1000000 + localSeq（表示は「第 L{localSeq} 号」）
  function visitor(day) {
    var c = client();
    c.localSeq = (c.localSeq % 999999) + 1;
    jset("sj_client", c);
    var ls = c.localSeq;
    return call("POST", "visitor", "", { client_id: c.id, local_seq: ls, day: day }).then(function (res) {
      if (res.status === 200 && res.json && res.json.ok && typeof res.json.n === "number") {
        return { n: res.json.n, source: "server", localSeq: ls, label: String(res.json.n), clientId: c.id };
      }
      return { n: 1000000 + ls, source: "local", localSeq: ls, label: "L" + ls, clientId: c.id };
    });
  }

  function queue() { return jget("sj_queue", []); }
  function setQueue(a) { while (a.length > QMAX) { a.shift(); } jset("sj_queue", a); }

  // recommend に渡す counts = 直近の counts ＋ キュー内の同じ day の未確認 finish の picks
  function countsFor(day, base) {
    var out = {}, k;
    for (k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) { out[k] = base[k]; } }
    queue().forEach(function (f) {
      if (f.day !== day) { return; }
      (f.picks || []).forEach(function (id) { out[id] = (typeof out[id] === "number" ? out[id] : 0) + 1; });
    });
    return out;
  }

  // finish はまずキューに積んでから送る
  function finish(payload) {
    var a = queue(); a.push(payload); setQueue(a);
    return flush();
  }
  function flush(keepalive) {
    if (flushing) { return Promise.resolve(); }
    var a = queue(); if (!a.length) { return Promise.resolve(); }
    flushing = true;
    var item = a[0];
    return call("POST", "finish", "", item, keepalive).then(function (res) {
      var cur = queue(), idx = -1;
      for (var i = 0; i < cur.length; i++) { if (cur[i].key === item.key) { idx = i; break; } }
      if (res.status === 200 && res.json && res.json.ok) {
        if (idx >= 0) { cur.splice(idx, 1); setQueue(cur); }
        var st = jget("sj_state_" + item.day, null) || { day: item.day, counts: {}, settings: DEFAULT_SETTINGS };
        st.counts = res.json.counts || st.counts; jset("sj_state_" + item.day, st);
        flushing = false;
        return flush(keepalive);
      }
      if (res.status === 400 || res.status === 403 || res.status === 413) {
        if (idx >= 0) { cur.splice(idx, 1); setQueue(cur); }
        var dead = jget("sj_dead", []); dead.push({ status: res.status, item: item }); while (dead.length > DEADMAX) { dead.shift(); } jset("sj_dead", dead);
        flushing = false;
        return flush(keepalive);
      }
      flushing = false;                                // 通信失敗・429・503・500 は残して後で再送
    });
  }

  // 再送の契機: 30 秒ごと・online・visibilitychange(hidden) は keepalive
  setInterval(function () { flush(); }, 30000);
  window.addEventListener("online", function () { flush(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") { flush(true); } });

  function status() {
    return { clientId: client().id, alias: alias, online: lastOk, lastErr: lastErr, pending: queue().length, dead: jget("sj_dead", []).length };
  }
  function lastDay() { var d = parseInt(lsGet("sj_lastDay"), 10); return [22, 23, 24].indexOf(d) >= 0 ? d : null; }
  function setLastDay(d) { lsSet("sj_lastDay", String(d)); }
  function pcName() { return lsGet("sj_pcname") || ""; }
  function setPcName(v) { lsSet("sj_pcname", String(v).slice(0, 16)); }

  return { getState: getState, visitor: visitor, finish: finish, flush: flush, countsFor: countsFor, status: status,
    lastDay: lastDay, setLastDay: setLastDay, pcName: pcName, setPcName: setPcName, DEFAULT_SETTINGS: DEFAULT_SETTINGS };
})();
