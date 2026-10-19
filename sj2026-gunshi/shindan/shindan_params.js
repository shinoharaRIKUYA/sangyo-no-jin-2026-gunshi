// 産業の陣2026「AI軍師の仕官相談所」診断パラメータ v2（PRJ-110 設計書_v1 §3-1・付録 B-1）
// パラメータはこのファイルと 診断計算表_v2.xlsx「パラメータ」シートの 2 か所だけで持つ。変えたら両方を直し、実装ログに記録する。
// v2: 年齢段階 ageClass 0〜5（0 未就学児／1 低学年／2 高学年／3 中学生／4 高校生／5 大人以上）。閾値は段階ごと（添字 = ageClass）。
//     mode（child/adult）は文言レジスタで、採点には使わない（D-11）。閾値の初期値は v1 を補間した前提値（D-10。10/20 試遊で差し替え）。
var SHINDAN_PARAMS = {
  version: "v2",

  // §3-3 採点式
  metricWeights: [0.6, 0.4],              // s_k = 0.6 × p1 + 0.4 × p2
  rankWeights: [0.60, 0.25, 0.10, 0.05],  // 個人内相対: 1〜4 位の順位重み r（PRJ-105 T5 で [0.50,0.30,0.15,0.05] から変更）
  // 入口: 年齢段階（添字 = ageClass）。modeByAge は文言レジスタ（0〜2 こども／3〜5 おとな）
  ageClasses: ["未就学児", "低学年", "高学年", "中学生", "高校生", "大人以上"],
  modeByAge: ["child", "child", "child", "adult", "adult", "adult"],
  // 付録 B-1 採点閾値（添字 = ageClass。[悪値, 良値]。前提値。10/20 試遊で見直す）
  thresholds: [
    { g1_onLineRate: [27, 83], g1_maxDev: [87, 23], g2_retries: [5, 0], g2_seconds: [60, 20], g3_accuracy: [40, 90], g3_count: [4, 12],  g4_runs: [6, 1], g4_ratio: [0.4, 1.0] }, // 0 未就学児
    { g1_onLineRate: [30, 85], g1_maxDev: [80, 20], g2_retries: [4, 0], g2_seconds: [60, 15], g3_accuracy: [50, 95], g3_count: [6, 18],  g4_runs: [5, 1], g4_ratio: [0.5, 1.0] }, // 1 低学年
    { g1_onLineRate: [33, 87], g1_maxDev: [73, 17], g2_retries: [3, 0], g2_seconds: [60, 13], g3_accuracy: [50, 95], g3_count: [8, 24],  g4_runs: [4, 1], g4_ratio: [0.6, 1.0] }, // 2 高学年
    { g1_onLineRate: [37, 88], g1_maxDev: [67, 13], g2_retries: [7, 0], g2_seconds: [60, 18], g3_accuracy: [50, 95], g3_count: [9, 29],  g4_runs: [6, 1], g4_ratio: [0.4, 1.0] }, // 3 中学生
    { g1_onLineRate: [40, 90], g1_maxDev: [60, 10], g2_retries: [6, 0], g2_seconds: [60, 15], g3_accuracy: [50, 95], g3_count: [11, 35], g4_runs: [5, 1], g4_ratio: [0.5, 1.0] }, // 4 高校生
    { g1_onLineRate: [40, 90], g1_maxDev: [60, 10], g2_retries: [6, 0], g2_seconds: [60, 15], g3_accuracy: [50, 95], g3_count: [13, 40], g4_runs: [5, 1], g4_ratio: [0.5, 1.0] }  // 5 大人以上
  ],
  gameTimeLimitSec: { g2: 60 },           // 二の陣: 未完成は 60 秒として採点

  // 縮退: 四の陣が間に合わない場合は K4: "question"（問い Q3 の値を s_K4 に使う）
  axisSource: { K4: "game" },
  q3Values: { "開ける": 80, "試す": 55, "呼ぶ": 25 },

  days: [22, 23, 24],

  // §3-5 推挙スコア S = wWork × M_work + wFit × M_fit + B − P
  wWork: 0.6,
  wFit: 0.4,
  fitMix: { material: 0.5, scale: 0.5 },  // M_fit = 0.5 × mat + 0.5 × (1 − |q2 − 規模| / 2)
  matNone: 0.5,                           // Q1 = なし のときの mat
  bonusEasy: 0.05,                        // 行きやすさ B（予約区分が easyReserve のとき）
  easyReserve: ["不要", "当日可"],
  lambda: 0.30,                           // 露出補正 P = λ × c / (c̄ + 1)（PRJ-105 T5 で 0.15 から変更）
  E: 2,                                   // 体験の最大件数
  total: 5,                               // 推挙の合計件数（見学 = total − 体験件数）
  sortDecimals: 9,                        // 並べ替えに使う S の丸め桁（浮動小数の誤差で同点判定がぶれないように。xlsx も ROUND(S,9)）

  materials: ["木", "金属", "画面紙樹脂", "荷物乗り物"],
  noMaterial: "なし",
  noExperienceMessage: "この日・この年齢で行ける体験はありません"
};
if (typeof module !== "undefined" && module.exports) { module.exports = SHINDAN_PARAMS; }
