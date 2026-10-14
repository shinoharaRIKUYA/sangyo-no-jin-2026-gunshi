<?php
// 産業の陣2026 AI軍師の仕官相談所 — 共通関数（直接アクセス不可。A-6）
if (!defined('SJ_APP')) { http_response_code(403); exit; }
require_once __DIR__ . DIRECTORY_SEPARATOR . '_config.php';
date_default_timezone_set('Asia/Tokyo');

const SJ_ID_RE = '/^[a-z0-9]+(-[a-z0-9]+)*-[TVO][0-9]{1,2}$/';

function sj_path(string $name): string { return SJ_DATA_DIR . DIRECTORY_SEPARATOR . $name; }

function sj_log_error(string $msg): void {
    @file_put_contents(sj_path('php-error.log'), date('c') . ' ' . $msg . "\n", FILE_APPEND | LOCK_EX);
}

function sj_out(int $code, array $body): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// 空の連想配列を {} で書き出すため
function sj_obj($a) { return (is_array($a) && count($a) === 0) ? new stdClass() : $a; }

function sj_now(): string { return date('c'); }

// ロック: fopen('c') → flock(LOCK_EX|LOCK_NB) を 50ms 間隔で最大 2 秒。取れなければ null
function sj_lock(string $name) {
    $f = sj_path($name . '.lock');
    $new = !file_exists($f);
    $h = @fopen($f, 'c');
    if (!$h) { return null; }
    if ($new) { @chmod($f, 0600); }
    $tries = (int)ceil(SJ_LOCK_TRY_MS / SJ_LOCK_STEP_MS);
    for ($i = 0; $i <= $tries; $i++) {
        if (flock($h, LOCK_EX | LOCK_NB)) { return $h; }
        usleep(SJ_LOCK_STEP_MS * 1000);
    }
    fclose($h);
    return null;
}
function sj_unlock($h): void { if ($h) { flock($h, LOCK_UN); fclose($h); } }

function sj_read_json(string $name, $default) {
    $f = sj_path($name);
    if (!is_file($f)) { return $default; }
    $s = @file_get_contents($f);
    if ($s === false || $s === '') { return $default; }
    $j = json_decode($s, true);
    return is_array($j) ? $j : $default;
}
// 一時ファイルに書いて rename（新規は 0600）
function sj_write_json(string $name, $data): void {
    $f = sj_path($name);
    $tmp = $f . '.tmp-' . getmypid();
    $s = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($s === false || @file_put_contents($tmp, $s) === false) { throw new RuntimeException('write failed: ' . $name); }
    @chmod($tmp, 0600);
    if (!@rename($tmp, $f)) { @unlink($tmp); throw new RuntimeException('rename failed: ' . $name); }
}
function sj_append_line(string $name, string $line): void {
    $f = sj_path($name);
    $new = !file_exists($f);
    $h = @fopen($f, 'a');
    if (!$h) { throw new RuntimeException('append failed: ' . $name); }
    $ok = fwrite($h, $line . "\n");
    fclose($h);
    if ($new) { @chmod($f, 0600); }
    if ($ok === false) { throw new RuntimeException('append failed: ' . $name); }
}

function sj_default_settings(): array {
    return ['degrade' => false, 'phase' => 'trial', 'overrides' => [], 'updated_at' => ''];
}
function sj_settings(): array {
    $s = sj_read_json('settings.json', []);
    $d = sj_default_settings();
    return [
        'degrade' => isset($s['degrade']) ? (bool)$s['degrade'] : $d['degrade'],
        'phase' => (isset($s['phase']) && in_array($s['phase'], ['trial', 'live'], true)) ? $s['phase'] : $d['phase'],
        'overrides' => (isset($s['overrides']) && is_array($s['overrides'])) ? $s['overrides'] : [],
        'updated_at' => isset($s['updated_at']) ? (string)$s['updated_at'] : '',
    ];
}
function sj_settings_public(array $s): array {
    return ['degrade' => $s['degrade'], 'phase' => $s['phase'], 'overrides' => sj_obj($s['overrides'])];
}
function sj_settings_save(array $s): void {
    $s['overrides'] = sj_obj($s['overrides']);
    $s['updated_at'] = sj_now();
    sj_write_json('settings.json', $s);
}
function sj_empty_state(int $day): array { return ['day' => $day, 'seq' => 0, 'counts' => [], 'visitors' => [], 'keys' => []]; }
function sj_state(int $day): array {
    $s = sj_read_json("state-$day.json", null);
    if (!is_array($s)) { return sj_empty_state($day); }
    foreach (sj_empty_state($day) as $k => $v) { if (!isset($s[$k])) { $s[$k] = $v; } }
    return $s;
}
function sj_state_save(int $day, array $s): void {
    $s['counts'] = sj_obj($s['counts']); $s['visitors'] = sj_obj($s['visitors']); $s['keys'] = sj_obj($s['keys']);
    sj_write_json("state-$day.json", $s);
}

// 回数制限（IP ごと。窓内の最大回数を超えたら false）
function sj_rate_ok(): bool {
    $max = SJ_RATE_MAX;
    $env = getenv('SJ_RATE_MAX');
    if (php_sapi_name() === 'cli-server' && $env !== false && ctype_digit((string)$env)) { $max = (int)$env; }
    $key = hash('sha256', SJ_RATE_SALT . '|' . ($_SERVER['REMOTE_ADDR'] ?? ''));
    $h = sj_lock('rate');
    if (!$h) { return true; }                 // 制限の記録に失敗しても体験は止めない
    try {
        $r = sj_read_json('rate.json', []);
        $now = time(); $lim = $now - SJ_RATE_WINDOW;
        foreach ($r as $k => $list) {
            $r[$k] = array_values(array_filter((array)$list, function ($t) use ($lim) { return is_int($t) && $t > $lim; }));
            if (!$r[$k]) { unset($r[$k]); }
        }
        $list = $r[$key] ?? [];
        if (count($list) >= $max) { return false; }
        $list[] = $now; $r[$key] = $list;
        sj_write_json('rate.json', sj_obj($r));
        return true;
    } finally { sj_unlock($h); }
}

// Origin: ヘッダーがあれば https?:// ＋ Host と一致すること
function sj_origin_ok(): bool {
    if (!isset($_SERVER['HTTP_ORIGIN'])) { return true; }
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $o = $_SERVER['HTTP_ORIGIN'];
    return $host !== '' && ($o === 'https://' . $host || $o === 'http://' . $host);
}

// ---- 値の検査 ----
function sj_is_int_in($v, int $lo, int $hi): bool { return is_int($v) && $v >= $lo && $v <= $hi; }
function sj_is_num_in($v, float $lo, float $hi): bool { return (is_int($v) || is_float($v)) && is_finite((float)$v) && $v >= $lo && $v <= $hi; }
function sj_is_day($v): bool { return is_int($v) && in_array($v, SJ_DAYS, true); }
function sj_is_id($v): bool { return is_string($v) && strlen($v) <= 64 && preg_match(SJ_ID_RE, $v) === 1; }
// m・raw: 値は数値・真偽・短い文字列（≤32 字）・それらの配列（≤20 要素）だけ
function sj_is_small_val($v): bool {
    if (is_int($v) || is_bool($v)) { return true; }
    if (is_float($v)) { return is_finite($v); }
    if (is_string($v)) { return mb_strlen($v) <= 32; }
    return false;
}
function sj_is_small_map($m): bool {
    if (!is_array($m) || count($m) > 20) { return false; }
    if (count($m) > 0 && array_is_list($m)) { return false; }
    foreach ($m as $k => $v) {
        if (!is_string($k) || !preg_match('/^[A-Za-z0-9_]{1,20}$/', $k)) { return false; }
        if (is_array($v)) {
            if (!array_is_list($v) || count($v) > 20) { return false; }
            foreach ($v as $x) { if (!sj_is_small_val($x)) { return false; } }
        } elseif (!sj_is_small_val($v)) { return false; }
    }
    return true;
}

// shindan_data.js から行を読む（管理画面の検査・表示用。JS は変えない）
function sj_data_rows(): array {
    $f = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'shindan' . DIRECTORY_SEPARATOR . 'shindan_data.js';
    $s = @file_get_contents($f);
    if ($s === false) { return []; }
    $a = strpos($s, '{'); $b = strrpos($s, '};');
    if ($a === false || $b === false) { return []; }
    $j = json_decode(substr($s, $a, $b - $a + 1), true);
    $rows = (is_array($j) && isset($j['rows']) && is_array($j['rows'])) ? $j['rows'] : [];
    $out = [];
    foreach ($rows as $r) { if (isset($r['program_id'])) { $out[$r['program_id']] = $r; } }
    return $out;
}
