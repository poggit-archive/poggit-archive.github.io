<?php
declare(strict_types=1);
if (PHP_VERSION_ID < 80000) {
    throw new RuntimeException('PHP 8 or later is required.');
}
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$output = $input['output'];
if (!is_dir($output)) mkdir($output, 0777, true);
$index = [];
foreach ($input['files'] as $id => $file) {
    if (hash_file('sha256', $file['path']) !== $file['sha256']) throw new RuntimeException("PHAR checksum mismatch: $id");
    $phar = new Phar($file['path']);
    $prefix = 'phar://' . str_replace('\\', '/', realpath($file['path'])) . '/';
    $images = [];
    foreach (new RecursiveIteratorIterator($phar) as $entry) {
        if (!$entry->isFile() || $entry->isLink()) continue;
        $name = substr(str_replace('\\', '/', $entry->getPathname()), strlen($prefix));
        if (!preg_match('/\.(png|jpe?g|gif|webp|svg|avif)$/i', $name) || $entry->getSize() > 16 * 1024 * 1024) continue;
        if (count($images) > 500) throw new RuntimeException('Too many PHAR images.');
        $content = $entry->getContent();
        $sha = hash('sha256', $content);
        $filename = $sha . '.' . strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!is_file($output . '/' . $filename)) file_put_contents($output . '/' . $filename, $content);
        $images[$name] = ['file' => $filename, 'sha256' => $sha];
    }
    $index[(string) $id] = $images;
    unset($phar);
}
echo json_encode($index, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
