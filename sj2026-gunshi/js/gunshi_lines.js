// 軍師のセリフ表と共通の調整値（PRJ-114 設計書 付録 A）。ブラウザと node（tools\gunshi_voice\gen.js・check.js）の両方で読む
// T2: 全 65 本（受付 2・陣の説明 14・陣中 4・問い 6・見立て見出し 24・一言 12・印刷後と放置確認 3）
// 読み（yomi）は設計変更票 #3（案 D）: 漢字まじりの自然な文。分かち書きの空白は息継ぎになるので入れない。読み間違う語だけかなにする
var SJGunshiLines = (function () {
  "use strict";

  // 合成の共通値（VOICEVOX audio_query に上書きする）。案 D＝速さ 1.1・抑揚 1.0・24kHz（設計変更票 #3・D-17）
  // 話者: 黒沢冴白・ノーマル（設計変更票 #1・D-16）
  var params = { speaker: 100, speakerName: "黒沢冴白", styleName: "ノーマル",
    speed: 1.1, pitch: 0.0, inton: 1.0, vol: 1.0, pre: 0.05, post: 0.15, rate: 24000 };

  // 陣の説明の吹き出し（短縮文）
  var expBubble = {
    1: "一の陣『しあげ』じゃ！", 2: "二の陣『くみたて』じゃ！",
    3: "三の陣『しわけ』じゃ！", 4: "四の陣『しくみ』じゃ！"
  };

  // 傾向語（texts.axes[].word の順）の読み。見立て見出しの yomi に使う
  var axisYomi = ["研ぎの匠", "組みの将", "兵站の奉行", "からくりの軍師"];

  // 固定の行。yomi が無い行は text をそのまま合成に使う。act: "furu"＝話し始めに軍配を掲げる
  // 陣中の 4 本（ig_*）は speed 1.25（設計変更票 #2・#3）
  var list = [
    // A-1 受付・入口（D-10: 共通 1 種類）
    { id: "s0_greet", type: "B", face: "joy",
      text: "よくぞ参った！ わしは AI軍師じゃ。そなたの とくいを 見立ててしんぜよう",
      yomi: "よくぞ参った！ わしはエーアイ軍師じゃ。そなたの得意を、見立ててしんぜよう。" },
    { id: "s1_ask", type: "B", face: "normal", bubble: "ひにちと としを おしえてくだされ",
      text: "まずは、きょうの ひにちと、そなたの としを おしえてくだされ",
      yomi: "まずは、今日の日にちと、そなたの年を、教えてくだされ。" },
    // A-3 陣中（4 陣共通）
    { id: "ig_start", type: "B", face: "joy", act: "furu", speed: 1.25,
      text: "いざ、かかれ！" },
    { id: "ig_warn", type: "B", face: "surprise", speed: 1.25,
      text: "あと 十秒じゃ！", yomi: "あと十秒じゃ！" },
    { id: "ig_done", type: "V", face: "joy", speed: 1.25,
      text: "おみごと！", yomi: "お見事！" },
    { id: "ig_timeout", type: "V", face: "think", speed: 1.25,
      text: "そこまで！" },
    // A-4 軍師の問い（S3）
    { id: "q1_child", type: "V", face: "think",
      text: "わしの といじゃ。4つの こうぼうを みせよう。いちばん はいってみたいのは どれじゃ？",
      yomi: "わしの問いじゃ。四つの工房を見せよう。一番入ってみたいのは、どれじゃ？" },
    { id: "q1_adult", type: "V", face: "think",
      text: "軍師の問いじゃ。四つの陣屋のうち、いちばん入ってみたいのは、どれじゃ？",
      yomi: "軍師の問いじゃ。四つの陣屋のうち、一番入ってみたいのは、どれじゃ？" },
    { id: "q2_child", type: "V", face: "think",
      text: "どっちの せんじょうに こころが うごく？",
      yomi: "どっちの戦場に、心が動く？" },
    { id: "q2_adult", type: "V", face: "think",
      text: "どちらの戦場に、心が動く？" },
    { id: "q3_child", type: "V", face: "think",
      text: "からくりにんぎょうが とまった。まず どうする？",
      yomi: "からくり人形が止まった。まず、どうする？" },
    { id: "q3_adult", type: "V", face: "think",
      text: "からくり人形が止まった。まず、どうする？" },
    // A-6 印刷後・放置確認
    { id: "s5_child", type: "V", face: "joy",
      text: "すいきょじょうを うけとられよ。また あおうぞ！",
      yomi: "推挙状を受け取られよ。また会おうぞ！" },
    { id: "s5_adult", type: "V", face: "joy",
      text: "推挙状をお受け取りくだされ。よき仕官を祈っておるぞ。",
      yomi: "推挙状を、お受け取りくだされ。よき仕官を、祈っておるぞ。" },
    { id: "idle_ask", type: "V", face: "surprise",
      text: "まだ おられるか？ つづけるなら ボタンを おされよ。",
      yomi: "まだおられるか？ 続けるなら、ボタンを押されよ。" }
  ];

  // A-2 陣の説明。{n} は本数・問題数（ns が無い陣は n なし）。nYomi は {n} の読み
  var exp = [
    { k: 1, mode: "child", ns: [3, 4, 5], nYomi: { 3: "三本", 4: "四本", 5: "五本" },
      text: "一の陣『しあげ』じゃ。すみの せんを、マウスの ボタンを おしたまま なぞるのじゃ。はみださぬようにな。{n}本じゃ！",
      yomi: "一の陣、仕上げじゃ。墨の線を、マウスのボタンを押したまま、なぞるのじゃ。はみ出さぬようにな。{n}じゃ！" },
    { k: 1, mode: "adult", ns: [6, 7, 8], nYomi: { 6: "六本", 7: "七本", 8: "八本" },
      text: "一の陣『しあげ』。板の墨線を、左ボタンを押したまま、始点から終点へなぞられよ。はみ出さぬ精度を見る。{n}本じゃ。",
      yomi: "一の陣、仕上げ。板の墨線を、左ボタンを押したまま、始点から終点へなぞられよ。はみ出さぬ精度を見る。{n}じゃ。" },
    { k: 2, mode: "child",
      text: "二の陣『くみたて』じゃ。みぎの ぶひんを、ひだりの かげへ ドラッグして くみたてよ！",
      yomi: "二の陣、組み立てじゃ。右の部品を、左の影へドラッグして、組み立てよ！" },
    { k: 2, mode: "adult",
      text: "二の陣『くみたて』。右の部品を、左の影の正しい位置へ運ばれよ。違う場所では戻るぞ。速さと置き直しの少なさを見る。",
      yomi: "二の陣、組み立て。右の部品を、左の影の正しい位置へ運ばれよ。違う場所では戻るぞ。速さと、置き直しの少なさを見る。" },
    { k: 3, mode: "child",
      text: "三の陣『しわけ』じゃ。ながれてくる にもつを つかんで、おなじ マークの くらへ はこぶのじゃ！",
      yomi: "三の陣、仕分けじゃ。流れてくる荷物をつかんで、同じマークの蔵へ運ぶのじゃ！" },
    { k: 3, mode: "adult",
      text: "三の陣『しわけ』。流れてくる荷をつかみ、同じマークの蔵へ運ばれよ。つかんでいる間も、荷は流れるぞ。",
      yomi: "三の陣、仕分け。流れてくる荷をつかみ、同じマークの蔵へ運ばれよ。つかんでいる間も、荷は流れるぞ。" },
    { k: 4, mode: "child", ns: [1, 2], nYomi: { 1: "一問", 2: "二問" },
      text: "四の陣『しくみ』じゃ。やじるしを ならべて『しゅつじん』！ フォークリフトを にもつまで うごかすのじゃ。{n}もんじゃ。",
      yomi: "四の陣、仕組みじゃ。矢印を並べて、出陣！ フォークリフトを荷物まで動かすのじゃ。{n}じゃ。" },
    { k: 4, mode: "adult", ns: [3, 4], nYomi: { 3: "三問", 4: "四問" },
      text: "四の陣『しくみ』。矢印の命令を八つまで並べて『出陣』。棚に当たらず荷へ届けよ。全{n}問じゃ。",
      yomi: "四の陣、仕組み。矢印の命令を、八つまで並べて、出陣。棚に当たらず、荷へ届けよ。全{n}じゃ。" }
  ];

  // A-5 見立て見出し（{A}・{B} は texts.axes[].word、読みは axisYomi）
  var s4h = {
    child: { text: "そなたは『{A}』タイプじゃ！ 『{B}』の ちからも あるぞ！", yomi: "そなたは、{A}タイプじゃ！ {B}の力もあるぞ！" },
    adult: { text: "わしの見立てでは、主は『{A}』、従に『{B}』じゃ。", yomi: "わしの見立てでは、しゅは{A}、じゅうに{B}じゃ。" }
  };

  // 一言の読みの置換。案 D では原文のまま正しく読めるので、付録 A-5 の旧置換表（手を→てを ほか）は外した（逆効果だったため）
  // 残すのは区切りの 1 件だけ: 「手早く正しく組み上げる」が 1 句に続いて聞き取りにくいので読点を入れる
  var hitoYomi = [["手早く正しく", "手早く、正しく"]];

  // 陣の説明の id（付録 A-0）。本数・問題数が入る陣（1・4）だけ n を付ける
  function expId(k, mode, n) {
    return "exp" + k + "_" + mode + (k === 1 || k === 4 ? "_" + n : "");
  }

  function toYomi(s) {
    for (var i = 0; i < hitoYomi.length; i++) { s = s.split(hitoYomi[i][0]).join(hitoYomi[i][1]); }
    return s;
  }

  function fill(s, A, B) { return s.split("{A}").join(A).split("{B}").join(B); }

  function copy(r) { var o = {}; for (var k in r) { o[k] = r[k]; } if (!o.yomi) { o.yomi = o.text; } return o; }

  // 固定の行＋陣の説明＋texts.js から組み立てる行（見立て見出し 24・一言 12）を 1 つの配列にして返す
  function expand(T) {
    var out = list.map(copy);
    exp.forEach(function (e) {
      (e.ns || [null]).forEach(function (n) {
        out.push({ id: expId(e.k, e.mode, n), type: "V", face: "normal", act: "furu", bubble: expBubble[e.k],
          text: e.text.split("{n}").join(n === null ? "" : n),
          yomi: e.yomi.split("{n}").join(n === null ? "" : e.nYomi[n]) });
      });
    });
    var ax = T && T.axes, hk = T && T.sheet && T.sheet.hitokoto;
    var a, b;
    if (ax) {
      ["child", "adult"].forEach(function (mode) {
        for (a = 0; a < 4; a++) {
          for (b = 0; b < 4; b++) {
            if (a === b) { continue; }
            out.push({ id: "s4h_" + mode + "_" + a + b, type: "V", face: "joy",
              text: fill(s4h[mode].text, ax[a].word, ax[b].word),
              yomi: fill(s4h[mode].yomi, axisYomi[a], axisYomi[b]) });
          }
        }
      });
    }
    if (hk) {
      for (a = 0; a < 4; a++) {
        for (b = 0; b < 4; b++) {
          if (a === b) { continue; }
          var text = hk.main[a] + hk.sub[b];
          out.push({ id: "hito_" + a + b, type: "B", face: "joy", text: text, yomi: toYomi(text) });
        }
      }
    }
    return out;
  }

  return { params: params, expBubble: expBubble, axisYomi: axisYomi, list: list, exp: exp, expId: expId, expand: expand };
})();
if (typeof module !== "undefined") { module.exports = SJGunshiLines; }
