// 軍師の音声の検証（PRJ-114 設計書 §3-4・AC-5〜AC-8、設計変更票 #3）。配置対象外
// 使い方: node tools\gunshi_voice\check.js   （エンジンは不要。終了コード 0＝合格、1＝不合格）
//   AC-5 網羅: voice\*.wav の数＝expand() の行数＝SJGunshiVoice.lines のキー数（表にない WAV は「未使用」と表示するだけ）
//   AC-6 形式: RIFF/WAVE・標本化率＝params.rate・モノラル・16bit。計算長との差 ≤ 50ms、表の秒＝WAV 実長、口パク表の時刻が単調増加
//   AC-7 網羅: ageClass 0〜5 で 陣 1〜4 の expId(k, mode, n) が全部ある（mode は shindan_params の modeByAge、n は pure.js の gameConfig）。見立て見出し 2×12・一言 12
//   AC-8 容量: voice\ の合計 ≤ 22MB（設計変更票 #3）。合計秒を表示
//   陣中: ig_start・ig_warn・ig_done・ig_timeout が各 1.5 秒以内（設計変更票 #3）
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.resolve(__dirname, "..", "..");
var SITE = path.join(ROOT, "sj2026-gunshi");
var VOICE_DIR = path.join(SITE, "voice");
var MAX_DIFF_MS = 50;
var MAX_TOTAL_MB = 22;
var MAX_IG_SEC = 1.5;
var IG_IDS = ["ig_start", "ig_warn", "ig_done", "ig_timeout"];

var fails = [], notes = [];
function ng(ac, msg) { fails.push(ac + ": " + msg); }

// ブラウザ用の JS を vm で読む（gen.js と同じ方法）
function loadVar(file, name) {
  var ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(file, "utf8") + "\n;this." + name + " = " + name + ";", ctx, { filename: file });
  return ctx[name];
}

function readWav(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") { throw new Error("RIFF/WAVE ではない"); }
  var p = 12, fmt = null, dataSize = -1;
  while (p + 8 <= buf.length) {
    var tag = buf.toString("ascii", p, p + 4), size = buf.readUInt32LE(p + 4);
    if (tag === "fmt ") {
      fmt = { format: buf.readUInt16LE(p + 8), ch: buf.readUInt16LE(p + 10), rate: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    } else if (tag === "data") { dataSize = Math.min(size, buf.length - p - 8); break; }
    p += 8 + size + (size % 2);
  }
  if (!fmt || dataSize < 0) { throw new Error("fmt/data チャンクが無い"); }
  fmt.dur = dataSize / (fmt.rate * fmt.ch * fmt.bits / 8);
  return fmt;
}

var T = loadVar(path.join(SITE, "js", "texts.js"), "SJTexts");
var L = loadVar(path.join(SITE, "js", "gunshi_lines.js"), "SJGunshiLines");
var V = loadVar(path.join(SITE, "js", "gunshi_voice.js"), "SJGunshiVoice");
var Pure = require(path.join(SITE, "js", "pure.js"));
var SP = require(path.join(SITE, "shindan", "shindan_params.js"));
var P = L.params;
var rows = L.expand(T);
var ids = rows.map(function (r) { return r.id; });

// ---- AC-5 網羅 ----
var dup = ids.filter(function (id, i) { return ids.indexOf(id) !== i; });
if (dup.length) { ng("AC-5", "id の重複: " + dup.join(", ")); }
if (rows.length !== 65) { ng("AC-5", "expand() の行数が 65 ではない（" + rows.length + "）"); }
var wavs = fs.readdirSync(VOICE_DIR).filter(function (f) { return /\.wav$/i.test(f); }).map(function (f) { return f.replace(/\.wav$/i, ""); });
var keys = Object.keys(V.lines);
var used = wavs.filter(function (w) { return ids.indexOf(w) >= 0; });
var unused = wavs.filter(function (w) { return ids.indexOf(w) < 0; });
ids.forEach(function (id) {
  if (wavs.indexOf(id) < 0) { ng("AC-5", id + ".wav が無い"); }
  if (!V.lines[id]) { ng("AC-5", id + " が gunshi_voice.js に無い"); }
});
keys.forEach(function (k) { if (ids.indexOf(k) < 0) { ng("AC-5", "gunshi_voice.js に表にない行: " + k); } });
if (unused.length) { notes.push("未使用の WAV（削除は人が行う）: " + unused.join(", ")); }
console.log("AC-5  表 " + rows.length + " 行 ／ WAV " + used.length + " 本（未使用 " + unused.length + "） ／ gunshi_voice.js " + keys.length + " 行");

// ---- AC-6 形式・ずれ ----
var totalBytes = 0, totalSec = 0, maxDiff = 0;
if (V.rate !== P.rate) { ng("AC-6", "gunshi_voice.js の rate " + V.rate + " ≠ params.rate " + P.rate); }
rows.forEach(function (r) {
  var f = path.join(VOICE_DIR, r.id + ".wav");
  if (!fs.existsSync(f)) { return; }
  var buf = fs.readFileSync(f), w;
  try { w = readWav(buf); } catch (e) { ng("AC-6", r.id + ": " + e.message); return; }
  totalBytes += buf.length; totalSec += w.dur;
  if (w.format !== 1 || w.rate !== P.rate || w.ch !== 1 || w.bits !== 16) {
    ng("AC-6", r.id + ": 形式 " + w.rate + "Hz・" + w.ch + "ch・" + w.bits + "bit（期待 " + P.rate + "Hz・1ch・16bit PCM）");
  }
  var line = V.lines[r.id];
  if (!line) { return; }
  if (Math.abs(line.dur - w.dur) > 0.001) { ng("AC-6", r.id + ": 表の秒 " + line.dur + " ≠ WAV 実長 " + w.dur.toFixed(3)); }
  var d = Math.abs(Number(line.d) || 0);
  if (line.d === undefined) { ng("AC-6", r.id + ": 計算長との差（d）が表に無い"); }
  if (d > maxDiff) { maxDiff = d; }
  if (d > MAX_DIFF_MS) { ng("AC-6", r.id + ": 計算長との差 " + line.d + "ms > " + MAX_DIFF_MS + "ms"); }
  var m = line.m || [];
  if (!m.length || m[0][0] !== 0) { ng("AC-6", r.id + ": 口パク表が 0 秒から始まらない"); }
  for (var i = 1; i < m.length; i++) {
    if (!(m[i][0] > m[i - 1][0])) { ng("AC-6", r.id + ": 口パク表の時刻が増えていない（" + i + " 番目）"); break; }
    if ("xaiueo".indexOf(m[i][1]) < 0 || m[i][1].length !== 1) { ng("AC-6", r.id + ": 口の形が不正 " + m[i][1]); break; }
  }
  if (m.length && m[m.length - 1][0] > w.dur) { ng("AC-6", r.id + ": 口パク表が WAV より長い"); }
});
console.log("AC-6  形式 " + P.rate + "Hz・1ch・16bit ／ 計算長との差の最大 " + maxDiff + "ms（上限 " + MAX_DIFF_MS + "ms）");

// ---- AC-7 網羅（陣の説明・見立て・一言） ----
var expNeed = {};
for (var ac = 0; ac < SP.ageClasses.length; ac++) {
  var mode = SP.modeByAge[ac];
  var gc = Pure.gameConfig(ac, mode);
  for (var k = 1; k <= 4; k++) {
    var n = k === 1 ? gc.g1.lines.length : (k === 4 ? gc.g4.puzzles.length : "");
    var eid = L.expId(k, mode, n);
    expNeed[eid] = true;
    if (ids.indexOf(eid) < 0 || !V.lines[eid]) { ng("AC-7", "ageClass " + ac + "（" + mode + "）陣 " + k + " の " + eid + " が無い"); }
  }
}
var expRows = ids.filter(function (id) { return /^exp/.test(id); });
expRows.forEach(function (id) { if (!expNeed[id]) { notes.push("陣の説明 " + id + " は今の gameConfig では使われない"); } });
var s4hN = 0, hitoN = 0;
["child", "adult"].forEach(function (md) {
  for (var a = 0; a < 4; a++) { for (var b = 0; b < 4; b++) {
    if (a === b) { continue; }
    if (V.lines["s4h_" + md + "_" + a + b]) { s4hN++; } else { ng("AC-7", "s4h_" + md + "_" + a + b + " が無い"); }
    if (md === "child") { if (V.lines["hito_" + a + b]) { hitoN++; } else { ng("AC-7", "hito_" + a + b + " が無い"); } }
  } }
});
console.log("AC-7  陣の説明 " + Object.keys(expNeed).length + " 種（ageClass 0〜5 × 陣 1〜4）／表の陣の説明 " + expRows.length + " 本 ／ 見立て見出し " + s4hN + "（2×12）／ 一言 " + hitoN + "（12）");

// ---- AC-8 容量 ----
var mb = totalBytes / 1048576;
if (mb > MAX_TOTAL_MB) { ng("AC-8", "合計 " + mb.toFixed(2) + "MB > " + MAX_TOTAL_MB + "MB"); }
console.log("AC-8  合計 " + used.length + " 本 " + totalSec.toFixed(1) + " 秒 " + mb.toFixed(2) + " MB（上限 " + MAX_TOTAL_MB + "MB）");

// ---- 陣中の長さ ----
var igs = IG_IDS.map(function (id) {
  var l = V.lines[id];
  if (!l) { ng("陣中", id + " が無い"); return id + " ―"; }
  if (l.dur > MAX_IG_SEC) { ng("陣中", id + " " + l.dur + " 秒 > " + MAX_IG_SEC + " 秒"); }
  return id + " " + l.dur.toFixed(3);
});
console.log("陣中  " + igs.join(" ／ ") + "（上限 " + MAX_IG_SEC + " 秒）");

notes.forEach(function (s) { console.log("注意  " + s); });
if (fails.length) {
  console.log("不合格 " + fails.length + " 件");
  fails.forEach(function (s) { console.log("  NG " + s); });
  process.exit(1);
}
console.log("合格（AC-5〜AC-8・陣中の長さ）");
