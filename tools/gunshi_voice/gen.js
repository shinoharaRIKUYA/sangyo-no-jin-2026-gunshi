// 軍師の音声と口パク表の一括生成（PRJ-114 設計書 §3-4・付録 C）。配置対象外
// 使い方: node tools\gunshi_voice\gen.js [--force] [--only id1,id2]
//   VOICEVOX エンジン（127.0.0.1:50021）を起動しておくこと。設定変更・辞書登録はしない
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var crypto = require("crypto");

var ENGINE = "http://127.0.0.1:50021";
var ROOT = path.resolve(__dirname, "..", "..");
var SITE = path.join(ROOT, "sj2026-gunshi");
var VOICE_DIR = path.join(SITE, "voice");
var OUT_JS = path.join(SITE, "js", "gunshi_voice.js");
var REPORT = path.join(__dirname, "report.csv");
var F = 93.75;              // 1 秒あたりのフレーム
var WARN_SEC = 0.05;        // 計算長と WAV 実長の差の許容
var MIN_SEG = 0.06;         // これ未満の口の区間は前の区間に吸収
var wavWritten = 0;         // この実行で書き換えた WAV の本数（途中失敗時の表示用。レビュー v1 #5）

// --- 引数 ---
var argv = process.argv.slice(2);
var FORCE = argv.indexOf("--force") >= 0;
var ONLY = null;
(function () {
  var i = argv.indexOf("--only");
  if (i >= 0 && argv[i + 1]) { ONLY = argv[i + 1].split(",").map(function (s) { return s.trim(); }); }
})();

// --- ブラウザ用の JS を vm で読む ---
function loadVar(file, name, ctx) {
  ctx = ctx || vm.createContext({});
  vm.runInContext(fs.readFileSync(file, "utf8") + "\n;this." + name + " = " + name + ";", ctx, { filename: file });
  return ctx[name];
}

// --- WAV ヘッダを読む ---
function readWav(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") { throw new Error("RIFF/WAVE ではない"); }
  var p = 12, fmt = null, dataSize = -1;
  while (p + 8 <= buf.length) {
    var tag = buf.toString("ascii", p, p + 4), size = buf.readUInt32LE(p + 4);
    if (tag === "fmt ") {
      fmt = { ch: buf.readUInt16LE(p + 10), rate: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    } else if (tag === "data") {
      dataSize = Math.min(size, buf.length - p - 8);
      break;
    }
    p += 8 + size + (size % 2);
  }
  if (!fmt || dataSize < 0) { throw new Error("fmt/data チャンクが無い"); }
  fmt.dur = dataSize / (fmt.rate * fmt.ch * fmt.bits / 8);
  return fmt;
}

// --- 口パク表（付録 C） ---
var BILABIAL = { m: 1, my: 1, b: 1, by: 1, p: 1, py: 1 };
function shapeOf(v) { return ({ a: "a", i: "i", u: "u", e: "e", o: "o" })[v] || "x"; }  // N・cl・pau・大文字（無声化）→ x
function r(s, sp) { return Math.round((s || 0) / (sp || 1) * F) / F; }  // 速さで割ってからフレームに丸める（エンジンと同じ順）

function mouthTable(q, wavDur) {
  var sp = q.speedScale || 1;
  var t = r(q.prePhonemeLength, sp);
  var segs = [[0, "x"]];
  function push(at, sh) { segs.push([at, sh]); }
  q.accent_phrases.forEach(function (ap) {
    ap.moras.forEach(function (mo) {
      var c = r(mo.consonant_length, sp), v = r(mo.vowel_length, sp);
      var sh = shapeOf(mo.vowel);
      if (mo.consonant && BILABIAL[mo.consonant]) { push(t, "x"); push(t + c, sh); }
      else { push(t, sh); }
      t += c + v;
    });
    // 疑問文（？）の句は、エンジンが合成時に最後の母音を 0.15 秒のばす（疑問のモーラ）。query の moras には出ないので足す
    if (ap.is_interrogative && ap.moras.length) {
      var lv = ap.moras[ap.moras.length - 1].vowel;
      push(t, shapeOf(lv)); t += r(0.15, sp);
    }
    if (ap.pause_mora) { push(t, "x"); t += r(ap.pause_mora.vowel_length, sp); }
  });
  push(t, "x");
  t += r(q.postPhonemeLength, sp);
  var calc = t;
  var k = wavDur / calc;
  // 実長に合わせて比例補正
  segs = segs.map(function (s) { return [s[0] * k, s[1]]; });
  // 同じ形をまとめる
  function merge(a) {
    var o = [];
    a.forEach(function (s) {
      if (o.length && o[o.length - 1][1] === s[1]) { return; }
      if (o.length && Math.abs(o[o.length - 1][0] - s[0]) < 1e-9) { o[o.length - 1] = s; return; }  // 同時刻は後を採る
      o.push(s);
    });
    return o;
  }
  segs = merge(segs);
  // 60ms 未満の区間を前の区間に吸収（先頭は残す）
  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 1; i < segs.length; i++) {
      var end = i + 1 < segs.length ? segs[i + 1][0] : wavDur;
      if (end - segs[i][0] < MIN_SEG && i < segs.length - 1) { segs.splice(i, 1); segs = merge(segs); changed = true; break; }
    }
  }
  return { calc: calc, m: segs.map(function (s) { return [Math.round(s[0] * 1000) / 1000, s[1]]; }) };
}

// --- エンジン呼出 ---
async function getJson(url, opt) {
  var res = await fetch(url, opt);
  if (!res.ok) { throw new Error(url + " → HTTP " + res.status + " " + (await res.text()).slice(0, 200)); }
  return res.json();
}

async function main() {
  var T = loadVar(path.join(SITE, "js", "texts.js"), "SJTexts");
  var L = loadVar(path.join(SITE, "js", "gunshi_lines.js"), "SJGunshiLines");
  var rows = L.expand(T);
  var P = L.params;

  // 既存の表（変わっていない行は再合成しない）
  var prev = { lines: {} };
  if (fs.existsSync(OUT_JS)) {
    try { prev = loadVar(OUT_JS, "SJGunshiVoice"); } catch (e) { console.warn("警告: 既存の gunshi_voice.js を読めない（全再生成）: " + e.message); }
  }

  // 話者
  var speakers;
  try { speakers = await getJson(ENGINE + "/speakers"); }
  catch (e) { console.error("VOICEVOX エンジンに接続できない: " + e.message); process.exit(2); }
  // 話者は gunshi_lines.js の params（speaker・speakerName・styleName）で決める
  var sid = null;
  speakers.forEach(function (s) {
    if (s.name === P.speakerName) { s.styles.forEach(function (st) { if (st.name === P.styleName) { sid = st.id; } }); }
  });
  if (sid === null) { console.error("話者「" + P.speakerName + "・" + P.styleName + "」が見つからない"); process.exit(2); }
  if (sid !== P.speaker) { console.warn("警告: style id が " + P.speaker + " ではない（" + sid + "）。続行する"); }

  if (!fs.existsSync(VOICE_DIR)) { fs.mkdirSync(VOICE_DIR, { recursive: true }); }

  var out = {}, report = [["id", "sec", "bytes", "diff_ms", "warn"]], totalSec = 0, totalBytes = 0, warns = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var speed = row.speed || P.speed;
    var h = crypto.createHash("md5").update(JSON.stringify([row.yomi, speed, P.pitch, P.inton, P.vol, P.pre, P.post, P.rate, sid])).digest("hex").slice(0, 8);
    var wavPath = path.join(VOICE_DIR, row.id + ".wav");
    var target = ONLY ? ONLY.indexOf(row.id) >= 0 : true;
    var old = prev.lines && prev.lines[row.id];
    var line, diffMs, warn = "";

    if (!target || (!FORCE && old && old.h === h && fs.existsSync(wavPath))) {
      if (!old) { console.warn("警告: " + row.id + " は未生成（--only の対象外）"); continue; }
      line = old;
      diffMs = old.d !== undefined ? old.d : "";
      console.log("skip  " + row.id);
    } else {
      var q = await getJson(ENGINE + "/audio_query?text=" + encodeURIComponent(row.yomi) + "&speaker=" + sid, { method: "POST" });
      q.speedScale = speed; q.pitchScale = P.pitch; q.intonationScale = P.inton; q.volumeScale = P.vol;
      q.prePhonemeLength = P.pre; q.postPhonemeLength = P.post;
      q.outputSamplingRate = P.rate; q.outputStereo = false;
      var res = await fetch(ENGINE + "/synthesis?speaker=" + sid, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(q)
      });
      if (!res.ok) { throw new Error("synthesis " + row.id + " → HTTP " + res.status); }
      var buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(wavPath, buf); wavWritten++;
      var w = readWav(buf);
      var mt = mouthTable(q, w.dur);
      diffMs = Math.round((mt.calc - w.dur) * 1000);
      line = { dur: Math.round(w.dur * 1000) / 1000, h: h, d: diffMs, m: mt.m };
      console.log("gen   " + row.id + "  " + line.dur.toFixed(3) + "s  calc " + mt.calc.toFixed(3) + "s  diff " + diffMs + "ms");
    }
    if (diffMs !== "" && Math.abs(diffMs) > WARN_SEC * 1000) { warn = "diff>50ms"; warns++; }
    var bytes = fs.statSync(wavPath).size;
    out[row.id] = line;
    totalSec += line.dur; totalBytes += bytes;
    report.push([row.id, line.dur.toFixed(3), bytes, diffMs, warn]);
  }

  // 出力 gunshi_voice.js
  var now = new Date();
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var gen = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + " " + pad(now.getHours()) + ":" + pad(now.getMinutes());
  var body = "// 自動生成（tools\\gunshi_voice\\gen.js）。手で編集しない\n" +
    "var SJGunshiVoice = { rate:" + P.rate + ", gen:" + JSON.stringify(gen) + ", lines:{\n" +
    Object.keys(out).map(function (id) { return "  " + JSON.stringify(id) + ":" + JSON.stringify(out[id]); }).join(",\n") +
    "\n} };\n";
  fs.writeFileSync(OUT_JS, body, "utf8");

  // 表にない WAV（削除はしない）。report.csv に「未使用」として載せる（合計には含めない）
  var extra = fs.readdirSync(VOICE_DIR).filter(function (f) { return /\.wav$/i.test(f) && !out[f.replace(/\.wav$/i, "")]; });
  extra.forEach(function (f) {
    var b = fs.readFileSync(path.join(VOICE_DIR, f)), d = "";
    try { d = readWav(b).dur.toFixed(3); } catch (e) { d = ""; }
    report.push([f.replace(/\.wav$/i, ""), d, b.length, "", "未使用"]);
  });
  if (extra.length) { console.log("表にない WAV（人が消す）: " + extra.join(", ")); }
  fs.writeFileSync(REPORT, report.map(function (a) { return a.join(","); }).join("\n") + "\n", "utf8");

  console.log("合計 " + Object.keys(out).length + " 本  " + totalSec.toFixed(1) + " 秒  " + (totalBytes / 1048576).toFixed(2) + " MB  警告 " + warns);
}

// 途中で失敗したら、WAV と gunshi_voice.js（口パク表・?v= の鍵）が食い違ったまま残りうるので再実行を促す（レビュー v1 #5）
main().catch(function (e) {
  console.error(e && e.stack || e);
  console.error("途中で失敗した（この実行で書き換えた WAV " + wavWritten + " 本）。" +
    "WAV と js\\gunshi_voice.js の口パク表が食い違っている可能性があるため、エンジンを確かめてから gen.js を再実行すること（node tools\\gunshi_voice\\gen.js）");
  process.exit(1);
});
