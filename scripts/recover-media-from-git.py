"""Recover missing own-repository images from checksum-verified source ZIPs.

Downloads only the project's existing published source assets. Does not extract
ZIP paths to disk or execute files. A matching unique suffix is recorded when
the original URL omitted the plugin's subdirectory in a multi-project repo.
"""
import hashlib
import json
from pathlib import Path
import stat
from concurrent.futures import ThreadPoolExecutor
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
snapshot = ROOT / 'data/snapshots' / json.loads((ROOT / 'data/api/v1/current.json').read_text(encoding='utf-8'))['snapshot_id']
media = json.loads((snapshot / 'media-mirror.json').read_text(encoding='utf-8'))
releases = {str(row['id']): row for row in json.loads((snapshot / 'releases.json').read_text(encoding='utf-8'))}
sources = json.loads((snapshot / 'source-downloads.json').read_text(encoding='utf-8'))
output = ROOT / 'archive/media-git'
output.mkdir(parents=True, exist_ok=True)
groups = {}
for key, resource in media['resources'].items():
    if resource['status'] == 'preserved':
        continue
    url = urllib.parse.urlsplit(resource['capture_url'])
    parts = [urllib.parse.unquote(part) for part in url.path.strip('/').split('/')]
    if url.hostname != 'raw.githubusercontent.com' or len(parts) < 4:
        continue
    for release_id in resource['release_ids']:
        release = releases[release_id]
        if '/'.join(parts[:2]).lower() != release['repo_name'].lower() or parts[2] != release['build_commit']:
            continue
        source_key = f"{release['repo_id']}@{release['build_commit']}"
        source = sources.get(source_key, {})
        if source.get('status') != 'uploaded':
            continue
        groups.setdefault(source_key, {'source': source, 'tasks': []})['tasks'].append((key, '/'.join(parts[3:])))
        break


def recover(group):
    source = group['source']
    cached = ROOT / 'archive/sources' / str(source['repo_id']) / (source['commit'] + '.zip')
    if not cached.exists():
        cached = output / (source['sha256'] + '.zip')
    try:
        if not cached.exists():
            url = urllib.parse.urlsplit(source['remote_url'])
            if url.scheme != 'https' or url.hostname != 'github.com' or not url.path.startswith('/poggit-archive/artifacts/releases/download/'):
                raise ValueError('Not a published project-owned source archive')
            if source['bytes'] > 100 * 1024 * 1024:
                raise ValueError('Source ZIP exceeds 100 MiB')
            request = urllib.request.Request(source['remote_url'], headers={'User-Agent': 'PoggitArchiveMediaRecovery/1.0'})
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read(source['bytes'] + 1)
            if len(data) != source['bytes'] or hashlib.sha256(data).hexdigest() != source['sha256']:
                raise ValueError('Downloaded source ZIP failed verification')
            cached.write_bytes(data)
        if hashlib.sha256(cached.read_bytes()).hexdigest() != source['sha256']:
            raise ValueError('Cached source ZIP failed verification')
        found = {}
        with zipfile.ZipFile(cached) as archive:
            entries = [(entry, '/'.join(entry.filename.split('/')[1:])) for entry in archive.infolist() if not entry.is_dir()]
            for key, relative in group['tasks']:
                exact = [(entry, path) for entry, path in entries if path == relative]
                candidates = exact or [(entry, path) for entry, path in entries if path.endswith('/' + relative)]
                if len(candidates) != 1:
                    continue
                entry, path = candidates[0]
                if entry.file_size > 64 * 1024 * 1024 or stat.S_ISLNK(entry.external_attr >> 16):
                    continue
                data = archive.read(entry)
                sha = hashlib.sha256(data).hexdigest()
                filename = sha + '.image'
                (output / filename).write_bytes(data)
                found[key] = {'file': filename, 'sha256': sha, 'method': 'verified_git_snapshot', 'source_zip_sha256': source['sha256'], 'source_revision': source['commit'], 'source_entry': path, 'path_match': 'exact' if exact else 'unique_path_suffix'}
        return found, None
    except Exception as error:
        return {}, {'source': source.get('key'), 'error': str(error)}


if __name__ == '__main__':
    found = {}; errors = []
    with ThreadPoolExecutor(max_workers=4) as workers:
        for index, (items, error) in enumerate(workers.map(recover, groups.values()), 1):
            found.update(items)
            if error:
                errors.append(error)
            if index % 20 == 0 or index == len(groups):
                print(f'Checked {index}/{len(groups)} source ZIPs; recovered {len(found)} image contexts', flush=True)
    (output / 'index.json').write_text(json.dumps(found), encoding='utf-8')
    (output / 'report.json').write_text(json.dumps({'source_archives_checked': len(groups), 'image_contexts_recovered': len(found), 'errors': errors}, indent=2), encoding='utf-8')
