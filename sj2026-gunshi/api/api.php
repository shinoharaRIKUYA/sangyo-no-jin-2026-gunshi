<?php
// 産業の陣2026 AI軍師の仕官相談所 — 公開 API（A-6）: a=state（GET）／visitor（POST）／finish（POST）
define('SJ_APP', 1);
require_once __DIR__ . DIRECTORY_SEPARATOR . '_lib.php';

set_error_handler(function ($no, $str, $file, $line) {
    if (!(error_reporting() & $no)) { return false; }   // @ で抑止した警告は例外にしない（_lib.php の null 戻り・503 busy を生かす）
    throw new ErrorException($str, 0, $no, $file, $line);
});

const SJ_FINISH_KEYS = ['key', 'client_id', 'client_ts', 'v', 'day', 'n', 'n_source', 'ageClass', 'mode', 'degrade',
    'games', 's', 'q1', 'q2', 'q3', 'top', 'second', 'picks', 'honmei', 'expCount', 'counts_used', 'ov'];
const SJ_FINISH_REQUIRED = ['key', 'client_id', 'day', 'n', 'n_source', 'ageClass', 'mode', 'degrade',
    'games', 's', 'q1', 'q2', 'top', 'second', 'picks', 'honmei', 'expCount'];

function bad(string $detail): void { sj_out(400, ['ok' => false, 'error' => 'bad_request', 'detail' => $detail]); }

try {
    $a = $_GET['a'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $need = ['state' => 'GET', 'visitor' => 'POST', 'finish' => 'POST'];
    if (!isset($need[$a])) { bad('a'); }
    // 1. メソッド
    if ($method !== $need[$a]) { header('Allow: ' . $need[$a]); sj_out(405, ['ok' => false, 'error' => 'method']); }

    $body = null;
    if ($method === 'POST') {
        // 2. Origin
        if (!sj_origin_ok()) { sj_out(403, ['ok' => false, 'error' => 'origin']); }
        // 3. 本文の大きさ
        $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($len > SJ_BODY_MAX) { sj_out(413, ['ok' => false, 'error' => 'too_large']); }
        $raw = file_get_contents('php://input', false, null, 0, SJ_BODY_MAX + 1);
        if ($raw === false || strlen($raw) > SJ_BODY_MAX) { sj_out(413, ['ok' => false, 'error' => 'too_large']); }
        // 4. JSON
        $body = json_decode($raw, true);
        if (!is_array($body) || array_is_list($body)) { bad('json'); }
    }

    // 5. 項目の許可リストと値域
    if ($a === 'state') {
        $day = filter_var($_GET['day'] ?? '', FILTER_VALIDATE_INT);
        if (!sj_is_day($day)) { bad('day'); }
    } elseif ($a === 'visitor') {
        foreach ($body as $k => $v) { if (!in_array($k, ['client_id', 'local_seq', 'day'], true)) { bad($k); } }
        if (!is_string($body['client_id'] ?? null) || !preg_match('/^c-[0-9a-f]{8}$/', $body['client_id'])) { bad('client_id'); }
        if (!sj_is_int_in($body['local_seq'] ?? null, 1, 999999)) { bad('local_seq'); }
        if (!sj_is_day($body['day'] ?? null)) { bad('day'); }
        $day = $body['day'];
    } else {
        validate_finish($body);
        $day = $body['day'];
    }

    // 6. 回数制限
    if (!sj_rate_ok()) { sj_out(429, ['ok' => false, 'error' => 'rate']); }

    $settings = sj_settings();
    $h = sj_lock("state-$day");
    if (!$h) { sj_out(503, ['ok' => false, 'error' => 'busy']); }
    try {
        $st = sj_state($day);
        if ($a === 'state') {
            $out = ['ok' => true, 'serverTime' => sj_now(), 'day' => $day, 'seq' => (int)$st['seq'],
                'counts' => sj_obj($st['counts']), 'settings' => sj_settings_public($settings)];
        } elseif ($a === 'visitor') {
            $vk = $body['client_id'] . ':' . $body['local_seq'];
            if (isset($st['visitors'][$vk])) {
                $n = (int)$st['visitors'][$vk];
            } else {
                $st['seq'] = (int)$st['seq'] + 1;
                $n = $st['seq'];
                $st['visitors'][$vk] = $n;
                sj_state_save($day, $st);
            }
            $out = ['ok' => true, 'n' => $n];
        } else {
            $key = $body['key'];
            if (isset($st['keys'][$key])) {
                $out = ['ok' => true, 'dup' => true, 'counts' => sj_obj($st['counts'])];
            } else {
                foreach ($body['picks'] as $id) { $st['counts'][$id] = (int)($st['counts'][$id] ?? 0) + 1; }
                $st['keys'][$key] = 1;
                sj_state_save($day, $st);
                // ログは本文をそのまま（キーの順も保つ）、先頭に ts と phase を付けて 1 行
                $line = '{"ts":' . json_encode(sj_now()) . ',"phase":' . json_encode($settings['phase']) . ','
                    . substr(json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION), 1);
                sj_append_line("log-$day.jsonl", $line);
                $out = ['ok' => true, 'dup' => false, 'counts' => sj_obj($st['counts'])];
            }
        }
    } finally {
        sj_unlock($h);
    }
    sj_out(200, $out);
} catch (Throwable $e) {
    sj_log_error(($a ?? '') . ' ' . $e->getMessage() . ' @' . basename($e->getFile()) . ':' . $e->getLine());
    sj_out(500, ['ok' => false, 'error' => 'server']);
}

function validate_finish(array $b): void {
    foreach ($b as $k => $v) { if (!in_array($k, SJ_FINISH_KEYS, true)) { bad((string)$k); } }
    foreach (SJ_FINISH_REQUIRED as $k) { if (!array_key_exists($k, $b)) { bad($k); } }
    if (!is_string($b['client_id']) || !preg_match('/^c-[0-9a-f]{8}$/', $b['client_id'])) { bad('client_id'); }
    if (!is_string($b['key']) || !preg_match('/^c-[0-9a-f]{8}-[0-9]{1,6}$/', $b['key']) || strpos($b['key'], $b['client_id'] . '-') !== 0) { bad('key'); }
    if (isset($b['client_ts']) && (!is_string($b['client_ts']) || strlen($b['client_ts']) > 40)) { bad('client_ts'); }
    if (isset($b['v']) && (!is_string($b['v']) || strlen($b['v']) > 16)) { bad('v'); }
    if (!sj_is_day($b['day'])) { bad('day'); }
    if (!sj_is_int_in($b['n'], 1, 2000000)) { bad('n'); }
    if (!in_array($b['n_source'], ['server', 'local'], true)) { bad('n_source'); }
    if (!sj_is_int_in($b['ageClass'], 0, 5)) { bad('ageClass'); }   // v2: 年齢段階 0〜5（PRJ-110）
    if (!in_array($b['mode'], ['adult', 'child'], true)) { bad('mode'); }
    if (!is_bool($b['degrade'])) { bad('degrade'); }
    // games: 3 件（縮退）か 4 件
    if (!is_array($b['games']) || !array_is_list($b['games']) || !in_array(count($b['games']), [3, 4], true)) { bad('games'); }
    foreach ($b['games'] as $g) {
        if (!is_array($g) || array_is_list($g)) { bad('games'); }
        foreach ($g as $k => $v) { if (!in_array($k, ['g', 'end', 'm', 'p1', 'p2', 's', 'raw'], true)) { bad('games.' . $k); } }
        if (!sj_is_int_in($g['g'] ?? null, 1, 4)) { bad('games.g'); }
        if (!in_array($g['end'] ?? null, ['done', 'timeout'], true)) { bad('games.end'); }
        foreach (['p1', 'p2', 's'] as $k) { if (!sj_is_num_in($g[$k] ?? null, 0, 100)) { bad('games.' . $k); } }
        if (!sj_is_small_map($g['m'] ?? null)) { bad('games.m'); }
        if (isset($g['raw']) && !sj_is_small_map($g['raw'])) { bad('games.raw'); }
    }
    if (!is_array($b['s']) || !array_is_list($b['s']) || count($b['s']) !== 4) { bad('s'); }
    foreach ($b['s'] as $v) { if (!sj_is_num_in($v, 0, 100)) { bad('s'); } }
    if (!in_array($b['q1'], ['木', '金属', '画面紙樹脂', '荷物乗り物', 'なし'], true)) { bad('q1'); }
    if (!in_array($b['q2'], [-1, 0, 1], true)) { bad('q2'); }
    if (isset($b['q3']) && !in_array($b['q3'], ['開ける', '試す', '呼ぶ'], true)) { bad('q3'); }
    if (!sj_is_int_in($b['top'], 0, 3)) { bad('top'); }
    if (!sj_is_int_in($b['second'], 0, 3)) { bad('second'); }
    if (!is_array($b['picks']) || !array_is_list($b['picks']) || count($b['picks']) > 5) { bad('picks'); }
    foreach ($b['picks'] as $id) { if (!sj_is_id($id)) { bad('picks'); } }
    if ($b['honmei'] !== null && !sj_is_id($b['honmei'])) { bad('honmei'); }
    if (!sj_is_int_in($b['expCount'], 0, 5)) { bad('expCount'); }
    if (isset($b['counts_used'])) {
        if (!is_array($b['counts_used']) || count($b['counts_used']) > 100) { bad('counts_used'); }
        foreach ($b['counts_used'] as $id => $c) { if (!sj_is_id((string)$id) || !sj_is_int_in($c, 0, 1000000)) { bad('counts_used'); } }
    }
    if (isset($b['ov'])) {
        if (!is_array($b['ov']) || count($b['ov']) > 100) { bad('ov'); }
        foreach ($b['ov'] as $id => $o) {
            if (!sj_is_id((string)$id) || !is_array($o)) { bad('ov'); }
            foreach ($o as $k => $v) {
                if (!in_array($k, ['mode', 'ageMin', 'reserve', 'noteAdd'], true)) { bad('ov'); }
                if (!(is_int($v) || (is_string($v) && mb_strlen($v) <= 80))) { bad('ov'); }
            }
        }
    }
}
