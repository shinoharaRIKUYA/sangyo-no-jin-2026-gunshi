<?php
// 産業の陣2026 AI軍師の仕官相談所 — 管理画面（A-7。D-11）
// 縮退切替・推挙可否の上書き・稼働区分・counts の確認とリセット・ログ CSV 書出し
define('SJ_APP', 1);
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . '_lib.php';
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');

// ---- 認証・保護（A-7-1） ----
if (php_sapi_name() === 'cli-server') {
    if (($_SERVER['REMOTE_ADDR'] ?? '') !== '127.0.0.1') { http_response_code(403); exit('Forbidden'); }
} elseif (ADMIN_REQUIRE_AUTH_VAR) {
    $u = $_SERVER['REMOTE_USER'] ?? ($_SERVER['REDIRECT_REMOTE_USER'] ?? ($_SERVER['PHP_AUTH_USER'] ?? ''));
    if ($u === '') { http_response_code(403); exit('Forbidden'); }
}
session_name('sj2026adm');
session_set_cookie_params(['path' => dirname($_SERVER['SCRIPT_NAME']) . '/', 'httponly' => true, 'samesite' => 'Strict',
    'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')]);
session_start();
if (empty($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(16)); }
$csrf = $_SESSION['csrf'];

function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function back(string $msg): void { header('Location: ./?msg=' . rawurlencode($msg), true, 303); exit; }

const RESERVES = ['不要', '当日可', '必須', '不明'];
$rows = sj_data_rows();

// ---- ログ CSV 書出し（GET ?export=22） ----
if (isset($_GET['export'])) {
    $day = filter_var($_GET['export'], FILTER_VALIDATE_INT);
    if (!sj_is_day($day)) { http_response_code(400); exit('bad day'); }
    export_csv($day);
    exit;
}

// ---- 変更系（POST） ----
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    if (!sj_origin_ok() || !hash_equals($csrf, (string)($_POST['csrf'] ?? ''))) { http_response_code(403); exit('Forbidden'); }
    $act = $_POST['act'] ?? '';
    try {
        if ($act === 'settings') {
            $deg = ($_POST['degrade'] ?? '') === '1';
            $phase = in_array($_POST['phase'] ?? '', ['trial', 'live'], true) ? $_POST['phase'] : null;
            if ($phase === null) { back('稼働区分の値が不正です'); }
            update_settings(function ($s) use ($deg, $phase) { $s['degrade'] = $deg; $s['phase'] = $phase; return $s; });
            back('設定を保存しました（次の来場者の入口から反映）');
        }
        if ($act === 'overrides') {
            $in = $_POST['ov'] ?? [];
            if (!is_array($in)) { back('上書きの値が不正です'); }
            $ov = [];
            foreach ($in as $id => $o) {
                if (!isset($rows[$id]) || !is_array($o)) { continue; }
                $mode = $o['mode'] ?? 'default';
                if ($mode === 'off') { $ov[$id] = ['mode' => 'off']; continue; }
                if ($mode !== 'on') { continue; }
                if ((int)$rows[$id]['要確認'] !== 1) { back("$id は要確認の行ではないため「推挙する」は選べません"); }
                $age = filter_var($o['ageMin'] ?? '', FILTER_VALIDATE_INT);
                $res = $o['reserve'] ?? '';
                $note = trim((string)($o['noteAdd'] ?? ''));
                if ($age === false || $age < 0 || $age > 3) { back("$id: 年齢下限区分（0〜3）を入れてください"); }
                if (!in_array($res, RESERVES, true)) { back("$id: 予約区分を選んでください"); }
                if (mb_strlen($note) > 80) { back("$id: 注記の追記は 80 字以内です"); }
                $ov[$id] = ['mode' => 'on', 'ageMin' => $age, 'reserve' => $res, 'noteAdd' => $note];
            }
            update_settings(function ($s) use ($ov) { $s['overrides'] = $ov; return $s; });
            back('推挙可否の上書きを保存しました（' . count($ov) . ' 件）');
        }
        if ($act === 'reset') {
            $day = filter_var($_POST['day'] ?? '', FILTER_VALIDATE_INT);
            if (!sj_is_day($day)) { back('日付が不正です'); }
            $h = sj_lock("state-$day");
            if (!$h) { back('混み合っています。もう一度押してください'); }
            try {
                $f = sj_path("state-$day.json");
                if (is_file($f)) {
                    $bak = SJ_DATA_DIR . DIRECTORY_SEPARATOR . 'bak';
                    if (!is_dir($bak)) { mkdir($bak, 0700); }
                    if (!copy($f, $bak . DIRECTORY_SEPARATOR . "state-$day-" . date('YmdHis') . '.json')) { throw new RuntimeException('backup failed'); }
                }
                sj_state_save($day, sj_empty_state($day));
            } finally { sj_unlock($h); }
            back("10/$day の回数をリセットしました（退避あり）");
        }
        back('不明な操作です');
    } catch (Throwable $e) {
        sj_log_error('admin ' . $e->getMessage());
        back('保存に失敗しました');
    }
}

function update_settings(callable $fn): void {
    $h = sj_lock('settings');
    if (!$h) { back('混み合っています。もう一度押してください'); }
    try { sj_settings_save($fn(sj_settings())); } finally { sj_unlock($h); }
}

// CSV（UTF-8 BOM・CRLF。先頭が = + - @ のセルは ' を付ける）
function csv_cell($v): string {
    if (is_bool($v)) { $v = $v ? 'true' : 'false'; }
    if ($v === null) { $v = ''; }
    if (is_array($v)) { $v = json_encode($v, JSON_UNESCAPED_UNICODE); }
    $v = (string)$v;
    if ($v !== '' && strpos('=+-@', $v[0]) !== false) { $v = "'" . $v; }
    if (preg_match('/[",\r\n]/', $v)) { $v = '"' . str_replace('"', '""', $v) . '"'; }
    return $v;
}
function export_csv(int $day): void {
    $cols = ['ts', 'phase', 'day', 'n', 'n_source', 'client_id', 'ageClass', 'mode', 'degrade',
        'g1_s', 'g2_s', 'g3_s', 'g4_s', 'g1_p1', 'g1_p2', 'g2_p1', 'g2_p2', 'g3_p1', 'g3_p2', 'g4_p1', 'g4_p2',
        'g1_m', 'g2_m', 'g3_m', 'g4_m', 'q1', 'q2', 'q3', 'top', 'second', 'picks', 'honmei', 'expCount'];
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="sj2026-log-' . $day . '-' . date('YmdHis') . '.csv"');
    $out = "\xEF\xBB\xBF" . implode(',', $cols) . "\r\n";
    $f = sj_path("log-$day.jsonl");
    if (is_file($f)) {
        foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $r = json_decode($line, true);
            if (!is_array($r)) { continue; }
            $g = [];
            foreach (($r['games'] ?? []) as $x) { if (isset($x['g'])) { $g[(int)$x['g']] = $x; } }
            $vals = [$r['ts'] ?? '', $r['phase'] ?? '', $r['day'] ?? '', $r['n'] ?? '', $r['n_source'] ?? '', $r['client_id'] ?? '',
                $r['ageClass'] ?? '', $r['mode'] ?? '', $r['degrade'] ?? ''];
            for ($k = 0; $k < 4; $k++) { $vals[] = $r['s'][$k] ?? ''; }
            for ($k = 1; $k <= 4; $k++) { $vals[] = $g[$k]['p1'] ?? ''; $vals[] = $g[$k]['p2'] ?? ''; }
            for ($k = 1; $k <= 4; $k++) { $vals[] = isset($g[$k]['m']) ? $g[$k]['m'] : ''; }
            array_push($vals, $r['q1'] ?? '', $r['q2'] ?? '', $r['q3'] ?? '', $r['top'] ?? '', $r['second'] ?? '',
                implode('｜', $r['picks'] ?? []), $r['honmei'] ?? '', $r['expCount'] ?? '');
            $out .= implode(',', array_map('csv_cell', $vals)) . "\r\n";
        }
    }
    echo $out;
}

// ---- 表示 ----
$s = sj_settings();
$states = [];
foreach (SJ_DAYS as $d) { $states[$d] = sj_state($d); }
$msg = (string)($_GET['msg'] ?? '');
?>
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>管理 — AI軍師の仕官相談所</title>
<style>
body { font-family: "Yu Gothic UI", "Meiryo", sans-serif; margin: 20px; background: #f4efe4; color: #1e1e1e; }
h1 { font-family: "Yu Mincho", serif; font-size: 24px; } h2 { font-size: 18px; border-bottom: 2px solid #1e1e1e; margin-top: 28px; }
table { border-collapse: collapse; background: #fff; font-size: 13px; } th, td { border: 1px solid #8a8580; padding: 3px 6px; vertical-align: top; }
.msg { background: #fff; border: 2px solid #1f3a5c; padding: 8px; } .warn { color: #b3312c; } .muted { color: #8a8580; }
button { font-size: 15px; padding: 4px 14px; } tr.chk { background: #fff4e0; } tr.off td { color: #8a8580; }
.days { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
</style>
</head>
<body>
<h1>管理画面 — AI軍師の仕官相談所</h1>
<?php if ($msg !== ''): ?><p class="msg"><?= h($msg) ?></p><?php endif; ?>

<h2>縮退・稼働区分</h2>
<form method="post">
  <input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="act" value="settings">
  <label><input type="radio" name="degrade" value="0" <?= $s['degrade'] ? '' : 'checked' ?>> 四陣（通常）</label>
  <label><input type="radio" name="degrade" value="1" <?= $s['degrade'] ? 'checked' : '' ?>> 三陣＋問い Q3（縮退）</label>
  　｜
  <label><input type="radio" name="phase" value="trial" <?= $s['phase'] === 'trial' ? 'checked' : '' ?>> 試遊</label>
  <label><input type="radio" name="phase" value="live" <?= $s['phase'] === 'live' ? 'checked' : '' ?>> 本番</label>
  <button type="submit">保存</button>
  <span class="muted">最終更新: <?= h($s['updated_at'] ?: '（未保存＝既定値）') ?>。次の来場者の入口から反映。</span>
</form>

<h2>推挙可否の上書き</h2>
<p class="muted">「推挙する」は要確認の行（黄色）だけ選べます。年齢下限区分（0 未就学／1 小1〜3／2 小4〜6／3 中学生以上）と予約区分は必須。注記の追記は 80 字以内。</p>
<form method="post" id="ovform">
<input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="act" value="overrides">
<table>
<tr><th>program_id</th><th>出展者・プログラム</th><th>種別</th><th>開催</th><th>要確認</th><th>上書き</th><th>年齢下限</th><th>予約区分</th><th>注記の追記</th></tr>
<?php foreach ($rows as $id => $r):
    $o = $s['overrides'][$id] ?? null; $mode = $o['mode'] ?? 'default'; $chk = (int)$r['要確認'] === 1;
    $days = []; foreach (SJ_DAYS as $d) { if ((int)($r["d$d"] ?? 0) === 1) { $days[] = $d; } } ?>
<tr class="<?= $chk ? 'chk' : '' ?> <?= $mode === 'off' ? 'off' : '' ?>" data-chk="<?= $chk ? 1 : 0 ?>">
  <td><?= h($id) ?></td><td><?= h($r['出展者名']) ?><br><b><?= h($r['プログラム名']) ?></b></td><td><?= h($r['種別']) ?></td>
  <td><?= h(implode('・', $days)) ?></td><td><?= $chk ? '要確認' : '' ?></td>
  <td><select name="ov[<?= h($id) ?>][mode]" class="mode">
    <option value="default" <?= $mode === 'default' ? 'selected' : '' ?>>既定</option>
    <option value="off" <?= $mode === 'off' ? 'selected' : '' ?>>推挙しない</option>
    <?php if ($chk): ?><option value="on" <?= $mode === 'on' ? 'selected' : '' ?>>推挙する</option><?php endif; ?>
  </select></td>
  <?php if ($chk): ?>
  <td><select name="ov[<?= h($id) ?>][ageMin]" class="on-only"><option value="">—</option>
    <?php for ($a = 0; $a <= 3; $a++): ?><option value="<?= $a ?>" <?= ($mode === 'on' && (int)$o['ageMin'] === $a) ? 'selected' : '' ?>><?= $a ?></option><?php endfor; ?></select></td>
  <td><select name="ov[<?= h($id) ?>][reserve]" class="on-only"><option value="">—</option>
    <?php foreach (RESERVES as $rv): ?><option value="<?= h($rv) ?>" <?= ($mode === 'on' && $o['reserve'] === $rv) ? 'selected' : '' ?>><?= h($rv) ?></option><?php endforeach; ?></select></td>
  <td><input name="ov[<?= h($id) ?>][noteAdd]" class="on-only" maxlength="80" size="24" value="<?= h($mode === 'on' ? ($o['noteAdd'] ?? '') : '') ?>"></td>
  <?php else: ?><td></td><td></td><td></td><?php endif; ?>
</tr>
<?php endforeach; ?>
</table>
<p><button type="submit">上書きを保存</button></p>
</form>

<h2>推挙回数（counts）とリセット</h2>
<div class="days">
<?php foreach ($states as $d => $st): $c = $st['counts']; arsort($c); ?>
<div>
  <h3>10/<?= $d ?>（来場者番号 seq = <?= (int)$st['seq'] ?>・推挙 <?= array_sum(array_map('intval', $c)) ?> 回）</h3>
  <table><tr><th>プログラム</th><th>回数</th></tr>
  <?php foreach ($c as $id => $n): ?><tr><td><?= h(($rows[$id]['出展者名'] ?? '') . ' ' . ($rows[$id]['プログラム名'] ?? $id)) ?></td><td><?= (int)$n ?></td></tr><?php endforeach; ?>
  <?php if (!$c): ?><tr><td colspan="2" class="muted">（なし）</td></tr><?php endif; ?>
  </table>
  <form method="post" class="reset" data-day="<?= $d ?>">
    <input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="act" value="reset"><input type="hidden" name="day" value="<?= $d ?>">
    <button type="submit" class="warn">この日をリセット</button>
  </form>
  <p><a href="./?export=<?= $d ?>">10/<?= $d ?> のログを CSV で書出し</a></p>
</div>
<?php endforeach; ?>
</div>
<script src="admin.js"></script>
</body>
</html>
