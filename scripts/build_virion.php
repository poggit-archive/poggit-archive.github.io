<?php
declare(strict_types=1);

// Load the pinned compiler only. Never include a target virion or execute its stub.
require $argv[2] . '/src/utils/VirionCompileScript.php';
$plan = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
foreach ($plan as $item) {
    foreach (['virion.php', 'virion_stub.php'] as $file) {
        if (!copy($argv[2] . '/resources/data/' . $file, $item['staging_dir'] . '/' . $file)) {
            throw new RuntimeException("Cannot copy compiler resource $file");
        }
    }
    $metadata = \Ifera\VirionTools\utils\VirionCompileScript::generateVirionMetadataFromYml($item['staging_dir'] . '/virion.yml');
    foreach (\Ifera\VirionTools\utils\VirionCompileScript::buildVirion(
        $item['phar_path'], $item['staging_dir'], [], $metadata,
        '<?php require("phar://" . __FILE__ . "/virion_stub.php"); __HALT_COMPILER();', Phar::SHA1, null
    ) as $line) {
        echo $item['id'] . ': ' . $line . PHP_EOL;
    }
    $phar = new Phar($item['phar_path']);
    // This is our own compiler output, with object instantiation disabled.
    $built = $phar->getMetadata(['allowed_classes' => false]);
    foreach (['name', 'version', 'antigen', 'api'] as $field) {
        if ($built[$field] !== $metadata[$field]) {
            throw new RuntimeException("Built metadata differs: $field");
        }
    }
    if ($phar->getSignature()['hash_type'] !== 'SHA-1') {
        throw new RuntimeException('Unexpected PHAR signature');
    }
    unset($phar);
}
