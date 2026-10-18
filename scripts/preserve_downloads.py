"""Mirror verified PHARs, virion sources and recovered sources into the static site.

Full plugin Git ZIPs remain in the project-owned artifact repository because
those alone occupy ~883 MiB. Normal builds use only committed mirrors.
"""
import hashlib
import json
from pathlib import Path
import shutil
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parent.parent
pointer = json.loads((ROOT / 'data/api/v1/current.json').read_text(encoding='utf-8'))
snapshot = ROOT / 'data/snapshots' / pointer['snapshot_id']
read = lambda name: json.loads((snapshot / name).read_text(encoding='utf-8'))
output = ROOT / 'public/archive-files'
output.mkdir(parents=True, exist_ok=True)
tasks = {}
for kind, filename in [('plugin_phar', 'downloads-plugins.json'), ('virion_phar', 'downloads-virions.json'), ('virion_source', 'virion-source-downloads.json'), ('recovered_source', 'recovered-sources.json')]:
    for key, row in read(filename).items():
        item = row if row.get('status') == 'uploaded' else row.get('rebuilt_artifact', {}) if kind == 'virion_phar' else {}
        if item.get('status') != 'uploaded':
            continue
        url = urllib.parse.urlsplit(item['remote_url'])
        if url.scheme != 'https' or url.hostname != 'github.com' or not url.path.startswith('/poggit-archive/artifacts/releases/download/'):
            raise ValueError('Unexpected artifact owner')
        if item.get('remote_sha256', item['sha256']) != item['sha256']:
            raise ValueError('Remote checksum mismatch')
        extension = '.phar' if kind.endswith('phar') else '.zip'
        tasks[item['remote_url']] = {**item, 'kind': kind, 'extension': extension, 'key': key}


def preserve(pair):
    url, row = pair
    target = output / (row['sha256'] + row['extension'])
    def verified(path):
        return path.is_file() and path.stat().st_size == row['bytes'] and hashlib.sha256(path.read_bytes()).hexdigest() == row['sha256']
    if not verified(target):
        candidates = []
        if row['kind'] == 'plugin_phar':
            candidates.append(ROOT / 'archive/virion-recovery/plugin-phars' / (row['key'] + '.phar'))
        if row.get('storage_path'):
            candidates.append(ROOT / row['storage_path'])
        candidate = next((path for path in candidates if verified(path)), None)
        if candidate:
            shutil.copyfile(candidate, target)
        else:
            request = urllib.request.Request(url, headers={'User-Agent': 'PoggitArchiveStaticMirror/1.0'})
            with urllib.request.urlopen(request, timeout=60) as response:
                content = response.read(row['bytes'] + 1)
            if len(content) != row['bytes'] or hashlib.sha256(content).hexdigest() != row['sha256']:
                raise ValueError('Artifact bytes failed verification: ' + url)
            target.write_bytes(content)
    if not verified(target):
        raise ValueError('Local artifact verification failed')
    return url, {'path': '/archive-files/' + target.name, 'sha256': row['sha256'], 'bytes': row['bytes'], 'kind': row['kind']}


if __name__ == '__main__':
    resources = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for index, (url, item) in enumerate(pool.map(preserve, tasks.items()), 1):
            resources[url] = item
            if index % 500 == 0 or index == len(tasks):
                print(f'Preserved {index}/{len(tasks)} published downloads', flush=True)
    data = {'schema_version': 1, 'snapshot_id': pointer['snapshot_id'], 'resources': resources}
    encoded = json.dumps(data, separators=(',', ':')) + '\n'
    (snapshot / 'file-mirror.json').write_text(encoded, encoding='utf-8')
    (output / 'manifest.json').write_text(encoded, encoding='utf-8')
    print('Preserved', len(resources), 'download URLs,', sum(row['bytes'] for row in resources.values()) / 1024**2, 'MiB', flush=True)
