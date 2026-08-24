<?php
/**
 * Sync endpoint — PHP 7.4 port of the Cloudflare Worker in worker/src/index.ts.
 *
 * Same contract: GET/PUT a JSON blob under a 64-hex key, 50KB cap, 360-day TTL.
 * Cloudflare KV becomes flat files; the TTL becomes a cron sweep (--gc).
 *
 * Deployed as part of dist/ so the endpoint is versioned with the app it serves.
 * Reached as <base>/sync/<key> via the rewrite in .htaccess.
 *
 * Storage lives OUTSIDE the docroot, named after the deploy directory, so each
 * environment gets its own data and no deploy sync can delete it:
 *   public_html/mi-ojo-vago-dev  ->  ~/sync-data-mi-ojo-vago-dev
 */

declare(strict_types=1);

const SECRET_HASH_PATTERN = '/^[0-9a-f]{64}$/';
const MAX_BODY_BYTES = 51200;          // 50 * 1024
const TTL_SECONDS = 31104000;          // 360 * 24 * 60 * 60

/** Comma-separated origins allowed to call this cross-origin. Same-origin needs none. */
const ALLOWED_ORIGINS = '';

function storage_dir(): string {
    return dirname(dirname(__DIR__)) . '/sync-data-' . basename(__DIR__);
}

function blob_path(string $key): string {
    return storage_dir() . '/' . $key . '.json';
}

/**
 * Delete blobs past their TTL. The Worker got this free from KV's expirationTtl;
 * here it's a cron job: php sync.php --gc
 */
function collect_garbage(): int {
    $dir = storage_dir();
    if (!is_dir($dir)) {
        return 0;
    }
    $cutoff = time() - TTL_SECONDS;
    $removed = 0;
    foreach (glob($dir . '/*.json') ?: [] as $file) {
        if (filemtime($file) < $cutoff && @unlink($file)) {
            $removed++;
        }
    }
    // Temp files from writes that died between tempnam() and rename(). They have
    // no .json suffix, so the sweep above never sees them.
    foreach (glob($dir . '/sync*') ?: [] as $file) {
        if (substr($file, -5) !== '.json' && filemtime($file) < time() - 3600 && @unlink($file)) {
            $removed++;
        }
    }
    return $removed;
}

if (PHP_SAPI === 'cli') {
    $flags = array_slice($argv, 1);
    if (in_array('--gc', $flags, true)) {
        printf("removed %d expired blob(s)\n", collect_garbage());
        exit(0);
    }
    fwrite(STDERR, "usage: php sync.php --gc\n");
    exit(2);
}

function send_cors(): void {
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');

    $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
    if ($origin === '') {
        return;
    }
    $allowed = array_filter(array_map('trim', explode(',', ALLOWED_ORIGINS)));
    if (in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
}

/** @param array<string,mixed> $body */
function send_json(array $body, int $status): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($body);
    exit;
}

send_cors();
header('Cache-Control: no-store');

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$key = isset($_GET['code']) ? (string) $_GET['code'] : '';
if ($key === '') {
    send_json(['error' => 'not_found'], 404);
}
if (!preg_match(SECRET_HASH_PATTERN, $key)) {
    send_json(['error' => 'invalid_key'], 400);
}

if ($method === 'GET') {
    $path = blob_path($key);
    if (!is_file($path)) {
        send_json(['error' => 'not_found'], 404);
    }
    $stored = file_get_contents($path);
    if ($stored === false) {
        send_json(['error' => 'not_found'], 404);
    }
    header('Content-Type: application/json');
    echo $stored;
    exit;
}

if ($method === 'PUT') {
    $declared = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($declared > MAX_BODY_BYTES) {
        send_json(['error' => 'payload_too_large'], 413);
    }

    $text = file_get_contents('php://input');
    if ($text === false) {
        $text = '';
    }
    if (strlen($text) > MAX_BODY_BYTES) {
        send_json(['error' => 'payload_too_large'], 413);
    }

    json_decode($text);
    if (json_last_error() !== JSON_ERROR_NONE) {
        send_json(['error' => 'invalid_json'], 400);
    }

    $dir = storage_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        send_json(['error' => 'storage_unavailable'], 500);
    }

    // Write-then-rename: a concurrent GET never sees a half-written blob.
    $tmp = tempnam($dir, 'sync');
    if ($tmp === false
        || file_put_contents($tmp, $text) === false
        || !@chmod($tmp, 0600)
        || !@rename($tmp, blob_path($key))) {
        if (is_string($tmp)) {
            @unlink($tmp);
        }
        send_json(['error' => 'storage_unavailable'], 500);
    }

    send_json(['ok' => true], 200);
}

send_json(['error' => 'method_not_allowed'], 405);
