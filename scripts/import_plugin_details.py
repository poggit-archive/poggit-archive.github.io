"""Import pinned Poggit documents and verified local PHAR manifests as inert data.

Run with Python + PyYAML and PHP >= 8. No Poggit scraping is needed. The resulting
snapshot is committed; deployment only needs Node and never executes plugins.
"""
import argparse
import base64
import hashlib
import gzip
import io
import json
from pathlib import Path, PurePosixPath
import subprocess
import urllib.request
import zipfile

import yaml

ROOT = Path(__file__).resolve().parent.parent
REVISION = '102194b0b1022180fc774318f39cd2a10ee4bb27'
ARCHIVE = f'https://codeload.github.com/poggit/release-archive/zip/{REVISION}'


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--php', required=True)
    args = parser.parse_args()
    pointer = read_json(ROOT / 'data/api/v1/current.json')
    snapshot = ROOT / 'data/snapshots' / pointer['snapshot_id']
    releases = read_json(snapshot / 'releases.json')
    downloads = read_json(snapshot / 'downloads-plugins.json')
    tree_path = ROOT / f'archive/recovery/official-release-tree-{REVISION}.json'
    if not tree_path.exists():
        tree_path.parent.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(f'https://api.github.com/repos/poggit/release-archive/git/trees/{REVISION}?recursive=1', headers={'User-Agent': 'poggit-archive'})
        with urllib.request.urlopen(request, timeout=120) as response:
            tree_path.write_bytes(response.read(16 * 1024 * 1024))
    tree = read_json(tree_path)
    if tree['sha'] != REVISION or tree.get('truncated'):
        raise ValueError('Incomplete or unexpected official archive tree')
    blobs = {row['path']: row for row in tree['tree'] if row['type'] == 'blob'}
    cache = ROOT / f'archive/recovery/release-archive-{REVISION}.zip'
    if not cache.exists():
        temporary = cache.with_suffix('.part')
        size = 0
        with urllib.request.urlopen(ARCHIVE, timeout=120) as response, temporary.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > 512 * 1024 * 1024:
                    raise ValueError('Archive exceeds 512 MiB')
                output.write(chunk)
        temporary.replace(cache)
    print(f'Official archive: {cache.stat().st_size:,} bytes', flush=True)
    documents = {}
    with zipfile.ZipFile(cache) as archive:
        entries = archive.infolist()
        if len(entries) > 50000 or sum(entry.file_size for entry in entries) > 512 * 1024 * 1024:
            raise ValueError('Archive exceeds extraction bounds')
        prefix = f'release-archive-{REVISION}/'

        def read_verified(path):
            if '..' in PurePosixPath(path).parts or path.startswith('/') or '\\' in path:
                raise ValueError('Unsafe archive path')
            blob = blobs[path]
            if blob['size'] > 4 * 1024 * 1024:
                raise ValueError('Document exceeds 4 MiB')
            data = archive.read(prefix + path)
            digest = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
            if len(data) != blob['size'] or digest != blob['sha']:
                raise ValueError(f'Git blob mismatch: {path}')
            return data

        for path in blobs:
            if not path.endswith('/info.json'):
                continue
            info = json.loads(read_verified(path))
            directory = path.rsplit('/', 1)[0]
            record = {'archive_path': directory, 'documents': {}}
            for filename in ['description.html', 'description.txt', 'changelog.html', 'changelog.txt', 'LICENSE.txt']:
                document_path = f'{directory}/{filename}'
                if document_path in blobs:
                    data = read_verified(document_path)
                    record['documents'][filename] = {'content': data.decode('utf-8-sig', errors='replace'), 'git_blob': blobs[document_path]['sha'], 'sha256': hashlib.sha256(data).hexdigest()}
            record['commit'] = info.get('build_commit')
            documents[str(info['id'])] = record

    paths = {str(release['id']): str((ROOT / f"archive/virion-recovery/plugin-phars/{release['id']}.phar").resolve()) for release in releases}
    process = subprocess.run([args.php, '-d', 'phar.readonly=1', str(ROOT / 'scripts/read_plugin_manifests.php')], input=json.dumps(paths), capture_output=True, text=True, encoding='utf-8', check=True)
    manifests = {row['id']: row for row in map(json.loads, process.stdout.splitlines())}
    records = {}
    errors = []
    for release in releases:
        key = str(release['id'])
        record = documents.get(key, {'documents': {}})
        if record.get('commit') and record['commit'] != release['build_commit']:
            raise ValueError(f'Release revision mismatch: {key}')
        manifest = manifests[key]
        if manifest.get('error'):
            errors.append({'release_id': key, 'error': manifest['error']})
        raw = Path(paths[key]).read_bytes()
        sha256 = hashlib.sha256(raw).hexdigest()
        expected = downloads[key]
        if sha256 != expected['sha256'] or len(raw) != expected['bytes']:
            raise ValueError(f'PHAR verification failed: {key}')
        record['phar'] = {'bytes': len(raw), 'sha256': sha256, 'sha1': hashlib.sha1(raw).hexdigest(), 'md5': hashlib.md5(raw).hexdigest()}
        if 'plugin.yml' in manifest:
            text = base64.b64decode(manifest['plugin.yml']).decode('utf-8-sig', errors='replace')
            record['manifest_text'] = text
            try:
                # Prevent recursive YAML aliases and object construction in public metadata.
                if any(isinstance(token, yaml.tokens.AliasToken) for token in yaml.scan(text)):
                    raise ValueError('YAML aliases require manual inspection')
                parsed = yaml.safe_load(text)
                if not isinstance(parsed, dict):
                    raise ValueError('plugin.yml is not a mapping')
                record['manifest'] = json.loads(json.dumps(parsed, default=str))
            except (ValueError, yaml.YAMLError, TypeError) as error:
                record['manifest_error'] = str(error)
                errors.append({'release_id': key, 'error': str(error)})
        else:
            record['manifest_error'] = 'plugin.yml was not found in the PHAR'
            errors.append({'release_id': key, 'error': record['manifest_error']})
        for filename, content in manifest.items():
            if filename.lower().startswith('license'):
                text = base64.b64decode(content).decode('utf-8-sig', errors='replace')
                if text.strip():
                    record['phar_license'] = {'path': filename, 'content': text}
                    break
        records[key] = record
    output = {'schema_version': 1, 'snapshot_id': pointer['snapshot_id'], 'archive_repository': 'poggit/release-archive', 'archive_revision': REVISION, 'records': records}
    destination = snapshot / 'plugin-details.json.gz'
    # One release per line keeps the large snapshot diff inspectable.
    with destination.open('wb') as output, gzip.GzipFile(filename='', mode='wb', fileobj=output, mtime=0) as compressed, io.TextIOWrapper(compressed, encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps({k: v for k, v in output.items() if k != 'records'}, ensure_ascii=False)[:-1] + ', "records": {\n')
        stream.write(',\n'.join(json.dumps(key) + ': ' + json.dumps(value, ensure_ascii=False, separators=(',', ':')) for key, value in records.items()))
        stream.write('\n}}\n')
    report = {'releases': len(releases), 'official_documents': len(documents), 'descriptions': sum(any(name.startswith('description.') for name in row['documents']) for row in records.values()), 'changelogs': sum(any(name.startswith('changelog.') for name in row['documents']) for row in records.values()), 'manifests': sum('manifest' in row for row in records.values()), 'licenses_in_phar': sum('phar_license' in row for row in records.values()), 'missing_official_documents': [key for key, row in records.items() if not row.get('archive_path')], 'manifest_errors': errors}
    (snapshot / 'plugin-details-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=True, indent=2), flush=True)
    print(f'Wrote {destination.stat().st_size:,} bytes', flush=True)


if __name__ == '__main__':
    main()
