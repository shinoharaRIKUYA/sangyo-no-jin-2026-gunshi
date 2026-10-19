// 産業の陣2026「AI軍師の仕官相談所」診断ロジック v2（参照実装・純関数）
// 設計書_v1 §3-3（採点式）・§3-5（スコア→推挙 手順 1〜10）。DOM に触れない。ブラウザ（<script>）と Node の両方で読める。
// ブラウザでは window.ShindanLogic、Node では require() の戻り値。
// v2（PRJ-110 設計書_v1 §3-1）: 年齢段階 ageClass 0〜5。scoreGame は mode でなく ageClass で閾値を引く（params.thresholds[ageClass]）。
//   mode（child/adult）は文言レジスタ（params.modeByAge[ageClass]）で、採点には使わない。params は validateParams で検査する（長さ 6 ほか）。
//
// ==== ゲーム組込み仕様（レビュー報告_v1 指摘 #2・#4、設計への指摘 3 の明文化。計算ルールは設計書_v1 §3-5 のまま） ====
// 読込順: shindan_params.js → shindan_data.js → shindan_logic.js（通常の <script src> で、この順に読む）。
//   params と data は `var SHINDAN_PARAMS` / `var SHINDAN_DATA` のグローバル変数として定義される（通常の <script> 前提）。
//   <script type="module"> やバンドラで読むと var はグローバルにならないため、その場合は
//   params・data を通常の <script> で先に読むか、window.SHINDAN_PARAMS / window.SHINDAN_DATA に代入してから使う。
//   このファイル自体は globalThis に ShindanLogic を置く（module 内でも読込時に止まらない）。
// 呼び方: var res = ShindanLogic.recommend(input, SHINDAN_DATA, counts, SHINDAN_PARAMS);
// input（すべて必須。外れた値は Error を投げる。黙って誤った結果は返さない）:
//   day      数値 22 / 23 / 24（params.days。文字列 "22" は不可）
//   ageClass 数値 0〜5（0 未就学児／1 低学年／2 高学年／3 中学生／4 高校生／5 大人以上。params.ageClasses の添字）
//   n        来場者番号（有限の数値。同点の軸順位を回すのに使う）
//   s        [s_K1, s_K2, s_K3, s_K4] の長さ 4 の配列。各 0〜100 の数値（scoreGame の s）
//   q1       素材の正式名 "木" / "金属" / "画面紙樹脂" / "荷物乗り物"、または "なし"（params.materials・noMaterial。略記「画面」等は不可）
//   q2       数値 -1 / 0 / 1（-1 小さい／0 どちらも／1 大きい。文字列は不可）
//   q3       "開ける" / "試す" / "呼ぶ"（params.q3Values のキー）。縮退（axisSource.K4 = "question"）のときだけ必須、通常時は無視
// counts（露出カウント c。手順 10）: { program_id: その PC で当日推挙した回数 }。recommend は counts を変更しない。
//   推挙を出したら counts = ShindanLogic.updateCounts(counts, res.picks) で更新して保存する。
//   localStorage に置く場合の例: キー "shindan_counts" に JSON で { date: "2026-10-22", counts: {...} } を保存し、
//   読むときに date が今日（PC のローカル日付）でなければ counts を {} に戻す（日付が変わったら 0 に戻す）。
//   JSON.parse の失敗・localStorage が使えない環境では {} で続行する（推挙は止めない）。
// 戻り値: { picks（体験→見学の順。最大 5 件）, honmei（本命 1 件）, experienceCount, message（体験 0 件のとき文言）, candidates, profile, cbar }
(function (root) {
  "use strict";

  // ---- params の検査（v2。R2 §8-3「長さ 6 の検査」） --------------------------
  // ageClasses・modeByAge・thresholds が同じ長さ（6）、modeByAge は child/adult、各閾値に 8 キー・各 [数値, 数値]、version は "v2" で始まる。
  // 満たさねば Error。recommend・scoreGame の先頭で呼ぶ
  var TH_KEYS = ["g1_onLineRate", "g1_maxDev", "g2_retries", "g2_seconds", "g3_accuracy", "g3_count", "g4_runs", "g4_ratio"];
  var AGE_COUNT = 6;
  function validateParams(params) {
    var e = [];
    if (!params || typeof params !== "object") { throw new Error("validateParams: params がオブジェクトでない"); }
    if (typeof params.version !== "string" || params.version.indexOf("v2") !== 0) { e.push("version は \"v2\" で始まる文字列（値: " + JSON.stringify(params.version) + "）"); }
    var A = params.ageClasses, M = params.modeByAge, T = params.thresholds;
    if (!Array.isArray(A) || A.length !== AGE_COUNT) { e.push("ageClasses は長さ " + AGE_COUNT + " の配列（長さ: " + (Array.isArray(A) ? A.length : "配列でない") + "）"); }
    if (!Array.isArray(M) || M.length !== AGE_COUNT) { e.push("modeByAge は長さ " + AGE_COUNT + " の配列（長さ: " + (Array.isArray(M) ? M.length : "配列でない") + "）"); }
    else if (M.some(function (v) { return v !== "child" && v !== "adult"; })) { e.push("modeByAge の値は child/adult（値: " + JSON.stringify(M) + "）"); }
    if (!Array.isArray(T) || T.length !== AGE_COUNT) { e.push("thresholds は長さ " + AGE_COUNT + " の配列（長さ: " + (Array.isArray(T) ? T.length : "配列でない") + "）"); }
    else {
      for (var i = 0; i < T.length; i++) {
        var th = T[i];
        if (!th || typeof th !== "object") { e.push("thresholds[" + i + "] がオブジェクトでない"); continue; }
        for (var k = 0; k < TH_KEYS.length; k++) {
          var v = th[TH_KEYS[k]];
          if (!Array.isArray(v) || v.length !== 2 || !isNum(v[0]) || !isNum(v[1])) { e.push("thresholds[" + i + "]." + TH_KEYS[k] + " は [数値, 数値]"); }
        }
      }
    }
    if (e.length) { throw new Error("validateParams: params が不正: " + e.join("／")); }
  }

  // ---- §3-3 採点 ----------------------------------------------------------

  // p = clamp((x − 悪値) / (良値 − 悪値), 0, 1) × 100。「少ないほど良」は悪値 > 良値になるだけで式は同じ
  function clampScore(x, bad, good) {
    if (typeof x !== "number" || !isFinite(x) || good === bad) { return 0; }
    var t = (x - bad) / (good - bad);
    if (t < 0) { t = 0; }
    if (t > 1) { t = 1; }
    return t * 100;
  }

  function num(v, dflt) { return (typeof v === "number" && isFinite(v)) ? v : dflt; }

  // game: 1〜4（一の陣〜四の陣）、ageClass: 0〜5（params.thresholds の添字）、m: 観測データから作った指標
  //  一の陣: { onLineRate(%), maxDev(px) } または { inSamples, totalSamples, maxDev }
  //  二の陣: { retries, seconds, completed }（未完成は上限 60 秒）
  //  三の陣: { correct, wrong, missed } または { accuracy(%), count }
  //  四の陣: { success, runs, shortest, used }（未成功は両指標 0）。複数問は各項目を問題ごとの配列にし、全問の平均（PRJ-111）
  // 途中でやめた・時間切れは、その時点のログで計算する（欠損を作らない）
  // v2: 閾値が無い段階（ageClass が整数でない・範囲外）は黙って別の閾値に落とさず Error を投げる（R2 §7）
  function scoreGame(game, ageClass, m, params) {
    validateParams(params);
    var th = (Number.isInteger(ageClass) && ageClass >= 0) ? params.thresholds[ageClass] : undefined;
    if (!th) { throw new Error("scoreGame: ageClass " + JSON.stringify(ageClass) + " の閾値がない（0〜" + (params.thresholds.length - 1) + "）"); }
    var w = params.metricWeights;
    var p1 = 0, p2 = 0;
    m = m || {};
    if (game === 1) {
      var rate = m.onLineRate;
      if (typeof rate !== "number") {
        rate = num(m.totalSamples, 0) > 0 ? num(m.inSamples, 0) / m.totalSamples * 100 : 0;
      }
      p1 = clampScore(rate, th.g1_onLineRate[0], th.g1_onLineRate[1]);
      p2 = clampScore(num(m.maxDev, th.g1_maxDev[0]), th.g1_maxDev[0], th.g1_maxDev[1]);
    } else if (game === 2) {
      var limit = params.gameTimeLimitSec.g2;
      var sec = m.completed ? num(m.seconds, limit) : limit;
      p1 = clampScore(num(m.retries, th.g2_retries[0]), th.g2_retries[0], th.g2_retries[1]);
      p2 = clampScore(sec, th.g2_seconds[0], th.g2_seconds[1]);
    } else if (game === 3) {
      var acc, cnt;
      if (typeof m.accuracy === "number") {
        acc = m.accuracy; cnt = num(m.count, 0);
      } else {
        var c = num(m.correct, 0), d = c + num(m.wrong, 0) + num(m.missed, 0);
        acc = d > 0 ? c / d * 100 : 0; cnt = c;
      }
      p1 = clampScore(acc, th.g3_accuracy[0], th.g3_accuracy[1]);
      p2 = clampScore(cnt, th.g3_count[0], th.g3_count[1]);
    } else if (game === 4) {
      // 1 問ずつ従来の式で採点（未成功は 0 点）。複数問（各項目が配列。PRJ-111）は全問の平均
      var one = function (ok, runs, shortest, used) {
        if (!ok || num(used, 0) <= 0) { return [0, 0]; }
        return [clampScore(num(runs, th.g4_runs[0]), th.g4_runs[0], th.g4_runs[1]),
                clampScore(num(shortest, 0) / used, th.g4_ratio[0], th.g4_ratio[1])];
      };
      if (Array.isArray(m.success)) {
        var nq = m.success.length;
        for (var q = 0; q < nq; q++) {
          var r4 = one(m.success[q], (m.runs || [])[q], (m.shortest || [])[q], (m.used || [])[q]);
          p1 += r4[0]; p2 += r4[1];
        }
        if (nq > 0) { p1 /= nq; p2 /= nq; }
      } else {
        var r1 = one(m.success, m.runs, m.shortest, m.used); p1 = r1[0]; p2 = r1[1];
      }
    } else {
      throw new Error("scoreGame: game は 1〜4");
    }
    return { p1: p1, p2: p2, s: w[0] * p1 + w[1] * p2 };
  }

  // 個人内相対: s_K1..s_K4 を大きい順に並べ順位重み r を割り当てる。
  // 同点は来場者番号 n で回す順（キー ((j + n) mod 4) の小さい順。j は K1=0 … K4=3）
  // axisSource.K4 = "question" のときは Q3 の値を s_K4 に使う（縮退）
  function axisProfile(s, n, params, q3) {
    var sc = [num(s[0], 0), num(s[1], 0), num(s[2], 0), num(s[3], 0)];
    if (params.axisSource && params.axisSource.K4 === "question") {
      sc[3] = num(params.q3Values[q3], 0);
    }
    var nn = num(n, 0);
    var key = function (j) { return (((j + nn) % 4) + 4) % 4; };
    var order = [0, 1, 2, 3].sort(function (a, b) {
      if (sc[a] !== sc[b]) { return sc[b] - sc[a]; }
      return key(a) - key(b);
    });
    var rankOf = [0, 0, 0, 0], weights = [0, 0, 0, 0];
    for (var i = 0; i < 4; i++) {
      rankOf[order[i]] = i + 1;
      weights[order[i]] = params.rankWeights[i];
    }
    return { scores: sc, order: order, rankOf: rankOf, weights: weights, top: order[0], second: order[1] };
  }

  // ---- §3-5 推挙 ----------------------------------------------------------

  function rowsOf(data) { return Array.isArray(data) ? data : data.rows; }

  // 推挙可: 種別が体験・見学で、要確認 = 0（式で算出。CSV の値は使わない）
  function isRecommendable(row) {
    return (row["種別"] === "体験" || row["種別"] === "見学") && row["要確認"] === 0;
  }

  // 手順 1: 候補の絞り込み
  // 年齢下限区分（出展者側の値 0〜3・9）と来場者の ageClass（0〜5）は別の尺度だが、比較 a <= ageClass は添字 0〜5 でそのまま成り立つ（R2 §3）
  function eligible(row, day, ageClass) {
    if (!isRecommendable(row)) { return false; }
    if (row["d" + day] !== 1) { return false; }
    var a = row["年齢下限区分"];
    if (a === 9 || a === null || a === undefined) { return false; }
    return a <= ageClass;
  }

  // c̄: 手順 1 を当日の全年齢で満たす同種別プログラムの c の平均
  // 年齢下限区分 9（不明）は手順 1 で常に除外されるので母集団に入れない（レビュー指摘 #5。xlsx の AVERAGEIFS も同じ条件）
  function cBar(rows, day, type, counts) {
    var sum = 0, k = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var a = r["年齢下限区分"];
      if (r["種別"] === type && isRecommendable(r) && r["d" + day] === 1 && a !== 9 && a !== null && a !== undefined) {
        sum += num(counts[r.program_id], 0); k++;
      }
    }
    return k > 0 ? sum / k : 0;
  }

  // 手順 2〜6: 1 プログラムのスコア
  // ctx = { weights: 順位重み(軸別), q1, q2, c, cbar }
  function scoreProgram(row, ctx, params) {
    var K = [row.K1, row.K2, row.K3, row.K4];
    var mWork = 0;
    for (var k = 0; k < 4; k++) { mWork += ctx.weights[k] * K[k] / 3; }
    var mat;
    if (ctx.q1 === params.noMaterial || ctx.q1 === null || ctx.q1 === undefined || ctx.q1 === "") { mat = params.matNone; }
    else { mat = (row["素材"] === ctx.q1) ? 1 : 0; }
    var mFit = params.fitMix.material * mat + params.fitMix.scale * (1 - Math.abs(ctx.q2 - row["規模"]) / 2);
    var B = params.easyReserve.indexOf(row["予約区分"]) >= 0 ? params.bonusEasy : 0;
    var P = params.lambda * num(ctx.c, 0) / (num(ctx.cbar, 0) + 1);
    var S = params.wWork * mWork + params.wFit * mFit + B - P;
    return { Mwork: mWork, mat: mat, Mfit: mFit, B: B, P: P, S: S };
  }

  function roundTo(x, d) { var f = Math.pow(10, d); return Math.round(x * f) / f; }

  // 手順 7 の比較: S（丸め）の大きい順 → c の小さい順 → program_id の昇順（文字コード順）
  function compareCand(a, b) {
    if (a.Sr !== b.Sr) { return b.Sr - a.Sr; }
    if (a.c !== b.c) { return a.c - b.c; }
    return a.program_id < b.program_id ? -1 : (a.program_id > b.program_id ? 1 : 0);
  }

  // 来場者 1 人の推挙（手順 1〜9）。counts は { program_id: その PC で当日推挙した回数 }。counts は変更しない
  // input = { day, ageClass, n, s:[s_K1..s_K4], q3, q1, q2 }
  // 戻り値 picks は 体験（選んだ順）→ 見学（選んだ順）。honmei は選んだ中で手順 7 の順が最上位の 1 件
  // 入力の検査（レビュー指摘 #2）。外れたら Error を投げる
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function validateInput(input, params) {
    var e = [];
    if (!input || typeof input !== "object") { throw new Error("recommend: input がオブジェクトでない"); }
    if (!isNum(input.day) || params.days.indexOf(input.day) < 0) { e.push("day は数値 " + params.days.join("/") + "（値: " + JSON.stringify(input.day) + "）"); }
    // v2: ageClass は params.ageClasses の添字（整数 0〜length−1）
    if (!Number.isInteger(input.ageClass) || input.ageClass < 0 || input.ageClass >= params.ageClasses.length) { e.push("ageClass は整数 0〜" + (params.ageClasses.length - 1) + "（値: " + JSON.stringify(input.ageClass) + "）"); }
    if (!isNum(input.n)) { e.push("n は数値（値: " + JSON.stringify(input.n) + "）"); }
    if (!Array.isArray(input.s) || input.s.length !== 4 ||
        input.s.some(function (v) { return !isNum(v) || v < 0 || v > 100; })) { e.push("s は 0〜100 の数値 4 個の配列（値: " + JSON.stringify(input.s) + "）"); }
    if (params.materials.indexOf(input.q1) < 0 && input.q1 !== params.noMaterial) { e.push("q1 は " + params.materials.join("/") + "/" + params.noMaterial + "（値: " + JSON.stringify(input.q1) + "）"); }
    if (!isNum(input.q2) || [-1, 0, 1].indexOf(input.q2) < 0) { e.push("q2 は数値 -1/0/1（値: " + JSON.stringify(input.q2) + "）"); }
    if (params.axisSource && params.axisSource.K4 === "question" && !Object.prototype.hasOwnProperty.call(params.q3Values, input.q3)) {
      e.push("q3 は " + Object.keys(params.q3Values).join("/") + "（縮退時は必須。値: " + JSON.stringify(input.q3) + "）");
    }
    if (e.length) { throw new Error("recommend: 入力が不正: " + e.join("／")); }
  }

  function recommend(input, data, counts, params) {
    validateParams(params);
    validateInput(input, params);
    var rows = rowsOf(data);
    counts = counts || {};
    var prof = axisProfile(input.s, input.n, params, input.q3);
    var cbarT = cBar(rows, input.day, "体験", counts);
    var cbarV = cBar(rows, input.day, "見学", counts);
    var cands = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!eligible(r, input.day, input.ageClass)) { continue; }
      var c = num(counts[r.program_id], 0);
      var sc = scoreProgram(r, { weights: prof.weights, q1: input.q1, q2: input.q2, c: c,
        cbar: r["種別"] === "体験" ? cbarT : cbarV }, params);
      cands.push({ program_id: r.program_id, frame_id: r.frame_id, type: r["種別"], row: r, c: c,
        Mwork: sc.Mwork, Mfit: sc.Mfit, mat: sc.mat, B: sc.B, P: sc.P, S: sc.S, Sr: roundTo(sc.S, params.sortDecimals) });
    }
    cands.sort(compareCand);
    // 手順 8: 体験から最大 E 件（同じ frame は 1 件）→ 見学を total − 体験件数 件（体験の frame と見学同士の重複を除く）
    var picks = [], frames = {};
    for (var a = 0; a < cands.length && picks.length < params.E; a++) {
      var x = cands[a];
      if (x.type !== "体験" || frames[x.frame_id]) { continue; }
      frames[x.frame_id] = true; picks.push(x);
    }
    var nExp = picks.length;
    var need = params.total - nExp;
    for (var b = 0; b < cands.length && picks.length < nExp + need; b++) {
      var y = cands[b];
      if (y.type !== "見学" || frames[y.frame_id]) { continue; }
      frames[y.frame_id] = true; picks.push(y);
    }
    // 手順 9: 本命
    var honmei = null;
    for (var h = 0; h < picks.length; h++) {
      if (honmei === null || compareCand(picks[h], honmei) < 0) { honmei = picks[h]; }
    }
    return {
      profile: prof, cbar: { "体験": cbarT, "見学": cbarV },
      candidates: cands, picks: picks, experienceCount: nExp,
      honmei: honmei,
      message: nExp === 0 ? params.noExperienceMessage : ""
    };
  }

  // 手順 10: 露出カウント更新（新しいオブジェクトを返す。日付が変わったら呼び出し側で {} に戻す）
  function updateCounts(counts, picks) {
    var out = {};
    for (var k in counts) { if (Object.prototype.hasOwnProperty.call(counts, k)) { out[k] = counts[k]; } }
    for (var i = 0; i < picks.length; i++) { out[picks[i].program_id] = num(out[picks[i].program_id], 0) + 1; }
    return out;
  }

  // 年齢段階 → 文言レジスタ（child/adult）。採点には使わない（v2。D-11）
  function modeOf(ageClass, params) { return params.modeByAge[ageClass]; }

  var api = {
    version: "v2",
    clampScore: clampScore, scoreGame: scoreGame, axisProfile: axisProfile,
    isRecommendable: isRecommendable, eligible: eligible, cBar: cBar,
    scoreProgram: scoreProgram, compareCand: compareCand, recommend: recommend,
    updateCounts: updateCounts, modeOf: modeOf, validateInput: validateInput, validateParams: validateParams
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { root.ShindanLogic = api; }
})(typeof globalThis !== "undefined" ? globalThis : this);
