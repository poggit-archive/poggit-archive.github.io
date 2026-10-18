<?php
declare(strict_types=1);

if (PHP_VERSION_ID < 80000) {
    fwrite(STDERR, "PHP 8 or later is required to avoid implicit metadata deserialization.\n");
    exit(1);
}

// Only read named entries. Never execute a stub or deserialize PHAR metadata.
foreach (json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR) as $id => $path) {
    $result = ['id' => (string) $id];
    try {
        $phar = new Phar($path);
        foreach (['plugin.yml', 'LICENSE', 'LICENSE.txt', 'LICENSE.md', 'license', 'license.txt', 'LICENSE.MD'] as $name) {
            if (isset($phar[$name]) && $phar[$name]->isFile() && !$phar[$name]->isLink()) {
                if ($phar[$name]->getSize() > 1024 * 1024) {
                    throw new RuntimeException('Manifest or license exceeds 1 MiB.');
                }
                $result[$name] = base64_encode($phar[$name]->getContent());
            }
        }
        unset($phar);
    } catch (Throwable $error) {
        $result['error'] = $error->getMessage();
    }
    echo json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES), "\n";
}
