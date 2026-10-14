<?php
// 産業の陣2026 AI軍師の仕官相談所 — サーバー設定（直接アクセス不可。A-6-1）
if (!defined('SJ_APP')) { http_response_code(403); exit; }

define('SJ_DATA_DIR', dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data');
define('SJ_DAYS', [22, 23, 24]);
define('SJ_BODY_MAX', 16384);            // 本文の上限（バイト）
define('SJ_RATE_MAX', 300);              // IP ごとの回数制限（窓内の最大回数）
define('SJ_RATE_WINDOW', 300);           // 回数制限の窓（秒）
define('SJ_LOCK_TRY_MS', 2000);          // ロックの最大試行時間
define('SJ_LOCK_STEP_MS', 50);           // ロックの試行間隔
// IP は sha256＋固定 salt で保存し、生の IP は残さない（認証情報ではない）
define('SJ_RATE_SALT', 'sj2026-gunshi-rate-v1');
// 管理画面: 認証変数（REMOTE_USER 等）が無ければ 403。さくらの CGI で渡らない場合は P6 で false にする（R-5）
define('ADMIN_REQUIRE_AUTH_VAR', true);
