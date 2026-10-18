<?php
declare(strict_types=1);

// Read archive entries as data. Never include the archive or deserialize its metadata.
try {
    if (PHP_VERSION_ID < 80000 || $argc !== 2) {
        throw new RuntimeException('Requires PHP 8 or later and one local PHAR filename.');
    }
    $path = realpath($argv[1]);
    if ($path === false || !is_file($path)) {
        throw new RuntimeException('PHAR file does not exist.');
    }
    $phar = new Phar($path);
    $prefix = 'phar://' . str_replace('\\', '/', $path) . '/';
    $files = [];
    $total = 0;
    foreach (new RecursiveIteratorIterator($phar) as $entry) {
        if (!$entry->isFile() || $entry->isLink()) {
            throw new RuntimeException('Unexpected non-file PHAR entry.');
        }
        $entryPath = str_replace('\\', '/', $entry->getPathname());
        if (!str_starts_with($entryPath, $prefix)) {
            throw new RuntimeException('Entry is outside the PHAR.');
        }
        $name = substr($entryPath, strlen($prefix));
        if ($name === '' || str_contains($name, ':') || preg_match('~(^|/)(\.{1,2})?(/|$)~', $name)) {
            throw new RuntimeException('Invalid archive entry path.');
        }
        $total += $entry->getSize();
        if ($total > 100 * 1024 * 1024 || count($files) >= 20000) {
            throw new RuntimeException('PHAR exceeds the recovery size or file-count limit.');
        }
        $data = $entry->getContent();
        $files[] = ['path' => $name, 'bytes' => strlen($data), 'sha256' => hash('sha256', $data), 'content_base64' => base64_encode($data)];
    }
    usort($files, static fn(array $a, array $b): int => strcmp($a['path'], $b['path']));
    echo json_encode(['files' => $files], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    exit(1);
}
