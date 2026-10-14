<?php
// ローカル検証専用（公開しない）。php -S 127.0.0.1:8107 -t output\sj2026-gunshi output\_dev\router.php
// php -S は .htaccess を読まないため、ここで .htaccess 相当の拒否と通信不良の模擬を行う（A-1）
//   SJ_DELAY_MS=5000 … API の応答を遅らせる ／ SJ_DOWN=1 … API を 503 にする ／ SJ_RATE_MAX=5 … 回数制限の上限（_lib.php が読む）
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/');
header('X-Robots-Tag: noindex, nofollow');

function deny(): bool { http_response_code(403); header('Content-Type: text/plain'); echo "Forbidden\n"; return true; }

// /data/ 配下・/_dev/・ファイル名（パスの各要素）が . か _ で始まるものは 403
if (preg_match('#^/data(/|$)#', $path)) { return deny(); }
if (preg_match('#^/_dev(/|$)#', $path)) { return deny(); }
foreach (explode('/', $path) as $seg) { if ($seg !== '' && ($seg[0] === '.' || $seg[0] === '_')) { return deny(); } }

if ($path === '/api/api.php') {
    if (getenv('SJ_DOWN') === '1') {
        http_response_code(503); header('Content-Type: application/json'); echo '{"ok":false,"error":"down"}'; return true;
    }
    $ms = (int)(getenv('SJ_DELAY_MS') ?: 0);
    if ($ms > 0) { usleep($ms * 1000); }
}
// 一覧禁止（ディレクトリで index が無いとき）
$full = $_SERVER['DOCUMENT_ROOT'] . $path;
if (is_dir($full) && !is_file(rtrim($full, '/') . '/index.html') && !is_file(rtrim($full, '/') . '/index.php')) { return deny(); }
return false;
