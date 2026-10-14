# 東信州産業の陣2026 — AI軍師の仕官相談所（ゲーム本体）

来場者が PC でミニゲーム 4 本を遊び、仕事の得意傾向（作業軸 K1〜K4）を診断して、当日の体験 2 件＋見学 3 件を A4 の推挙状で推挙するブース用アプリ。

- 公開先: https://coco529.sakura.ne.jp/dev/sj2026-gunshi/
- 本番: 2026/10/22〜24

## 構成

| パス | 内容 |
|---|---|
| `sj2026-gunshi/` | 公開する一式。`index.html`・`css/`・`js/`（画面・各陣・通信）・`shindan/`（PRJ-105 の計算ロジック。無変更）・`api/`（PHP 8.2: state / visitor / finish）・`admin/`（Basic 認証の管理画面）・`data/`（実行時ファイル置き場。`.htaccess` と `index.html` 以外はコミットしない） |
| `_dev/` | ローカル検証用。`router.php`（php -S 用）・`test_pure.js`・`verify_log.js`・`test_concurrency.mjs`。公開しない |
| `docs/配置手順_v1.md` | 配置・権限・Basic 認証・AC-26 確認・10/21 リセット・会場 PC 設定 |
| `docs/design/` | 設計書 v1・付録・v2 差分（推挙状の再設計） |
| `docs/data/出展者軸データ_v1.csv` | 出展者×軸データの正本（PRJ-105）。変更時は `shindan/csv2js.html`（PRJ-105）で `shindan_data.js` を再生成 |

## ローカルで動かす

```
C:\xampp\php\php.exe -S 127.0.0.1:8107 -t sj2026-gunshi _dev\router.php
```

http://127.0.0.1:8107/ を開く。`?debug=1` で指標表示、`?printtest=longest` で推挙状の最長例、`?idle=5` で放置時間を短縮。

```
node _dev\test_pure.js
node _dev\verify_log.js sj2026-gunshi\data\log-22.jsonl
```

## 運用

- 会場 PC: Chrome を `--kiosk --kiosk-printing <URL>` で起動。既定プリンター A4
- 管理画面 `/admin/`: 縮退切替（四の陣を外す）・要確認行の推挙可否・日別リセット・ログ CSV 書出し。`.htpasswd` は公開領域外に本人が作成（`docs/配置手順_v1.md` §3）
- 計算ルール・パラメータ（`sj2026-gunshi/shindan/`）は PRJ-105 が正。このリポジトリでは変更しない
