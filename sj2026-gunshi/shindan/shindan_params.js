// 産業の陣2026「AI軍師の仕官相談所」診断パラメータ（設計書_v1 §3-3・§3-5 の初期値）
// パラメータはこのファイルと 診断計算表_v1.xlsx「パラメータ」シートの 2 か所だけで持つ。変えたら両方を直し、実装ログに記録する。
var SHINDAN_PARAMS = {
  version: "v1",

  // §3-3 採点式
  metricWeights: [0.6, 0.4],              // s_k = 0.6 × p1 + 0.4 × p2
  rankWeights: [0.60, 0.25, 0.10, 0.05],  // 個人内相対: 1〜4 位の順位重み r（初期値 [0.50,0.30,0.15,0.05]。T5 で AC-07 のため変更。実装ログ §4）
  // 表 3-3-a 採点閾値（[悪値, 良値]。前提値。社内試遊で見直す）
  thresholds: {
    adult: {
      g1_onLineRate: [40, 90], g1_maxDev: [60, 10],
      g2_retries: [6, 0],      g2_seconds: [60, 15],
      g3_accuracy: [50, 95],   g3_count: [8, 25],
      g4_runs: [5, 1],         g4_ratio: [0.5, 1.0]
    },
    child: {
      g1_onLineRate: [30, 85], g1_maxDev: [80, 20],
      g2_retries: [4, 0],      g2_seconds: [60, 15],
      g3_accuracy: [50, 95],   g3_count: [5, 15],
      g4_runs: [5, 1],         g4_ratio: [0.5, 1.0]
    }
  },
  gameTimeLimitSec: { g2: 60 },           // 二の陣: 未完成は 60 秒として採点

  // 縮退: 四の陣が間に合わない場合は K4: "question"（問い Q3 の値を s_K4 に使う）
  axisSource: { K4: "game" },
  q3Values: { "開ける": 80, "試す": 55, "呼ぶ": 25 },

  // 入口: 年齢区分値 0 未就学／1 小1〜3／2 小4〜6／3 中学生以上。3 だけおとなモード
  ageClasses: ["未就学", "小1〜3", "小4〜6", "中学生以上"],
  modeByAge: ["child", "child", "child", "adult"],
  days: [22, 23, 24],

  // §3-5 推挙スコア S = wWork × M_work + wFit × M_fit + B − P
  wWork: 0.6,
  wFit: 0.4,
  fitMix: { material: 0.5, scale: 0.5 },  // M_fit = 0.5 × mat + 0.5 × (1 − |q2 − 規模| / 2)
  matNone: 0.5,                           // Q1 = なし のときの mat
  bonusEasy: 0.05,                        // 行きやすさ B（予約区分が easyReserve のとき）
  easyReserve: ["不要", "当日可"],
  lambda: 0.30,                           // 露出補正 P = λ × c / (c̄ + 1)（初期値 0.15。T5 で AC-08 のため変更。実装ログ §4）
  E: 2,                                   // 体験の最大件数
  total: 5,                               // 推挙の合計件数（見学 = total − 体験件数）
  sortDecimals: 9,                        // 並べ替えに使う S の丸め桁（浮動小数の誤差で同点判定がぶれないように。xlsx も ROUND(S,9)）

  materials: ["木", "金属", "画面紙樹脂", "荷物乗り物"],
  noMaterial: "なし",
  noExperienceMessage: "この日・この年齢で行ける体験はありません"
};
if (typeof module !== "undefined" && module.exports) { module.exports = SHINDAN_PARAMS; }
