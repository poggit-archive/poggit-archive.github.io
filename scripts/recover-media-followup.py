"""Recover remaining media without replacing already preserved captures.

Exact source revisions and PHAR paths take priority. Captures from other
revisions retain explicit scope labels. All unsuccessful lookups are retained
in the follow-up report; a request failure is not proof of no archived copy.
"""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import stat
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / 'data/snapshots' / json.loads((ROOT / 'data/api/v1/current.json').read_text(encoding='utf8'))['snapshot_id']
OUT = ROOT / 'archive/media-followup'
OUT.mkdir(parents=True, exist_ok=True)
MEDIA = json.loads((SNAPSHOT / 'media-mirror.json').read_text(encoding='utf8'))
MISSING = {k: v for k, v in MEDIA['resources'].items() if v['status'] == 'unavailable'}
RELEASES = {str(r['id']): r for r in json.loads((SNAPSHOT / 'releases.json').read_text(encoding='utf8'))}
SOURCES = json.loads((SNAPSHOT / 'source-downloads.json').read_text(encoding='utf8'))
LIMIT = 16 * 1024 * 1024


def read_json(path, default):
    return json.loads(path.read_text(encoding='utf8')) if path.exists() else default


def request(url, limit=LIMIT):
    req = urllib.request.Request(url, headers={'User-Agent': 'PoggitArchiveMediaRecovery/1.1'})
    with urllib.request.urlopen(req, timeout=18) as response:
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError('Response exceeds size limit')
        return data, response.geturl(), response.headers.get('Content-Type', '')


def image_bytes(data):
    return data.startswith((b'\x89PNG\r\n', b'\xff\xd8\xff', b'GIF87a', b'GIF89a', b'RIFF')) or b'<svg' in data[:4096].lower() or data[4:8] == b'ftyp'


def store(data, **evidence):
    if not image_bytes(data):
        raise ValueError('Not an image response')
    sha = hashlib.sha256(data).hexdigest()
    filename = sha + '.image'
    (OUT / filename).write_bytes(data)
    return {'file': filename, 'sha256': sha, **evidence}


def paths(relative):
    """Known GitHub ref syntax mistakes; no basename-only guessing."""
    values = [relative]
    if relative.startswith('heads/'):
        values.append(relative.split('/', 2)[-1])
    if relative.startswith('main/') or relative.startswith('master/'):
        values.append(relative.split('/', 1)[1])
    return values


def match_entry(names, relative):
    for target in paths(relative):
        exact = [n for n in names if n == target]
        if len(exact) == 1:
            return exact[0], 'exact' if target == relative else 'corrected_ref_prefix'
        folded = [n for n in names if n.lower() == target.lower()]
        if len(folded) == 1:
            return folded[0], 'case_insensitive_path'
        suffix = [n for n in names if n.lower().endswith('/' + target.lower())]
        if len(suffix) == 1:
            return suffix[0], 'unique_path_suffix'
    return None, None


def source_for(resource):
    parts = urllib.parse.unquote(urllib.parse.urlsplit(resource['capture_url']).path).strip('/').split('/')
    if urllib.parse.urlsplit(resource['capture_url']).hostname != 'raw.githubusercontent.com' or len(parts) < 4:
        return None, None
    for rid in resource['release_ids']:
        release = RELEASES[rid]
        source = SOURCES.get(f"{release['repo_id']}@{release['build_commit']}", {})
        # Renamed/transferred repositories have different names but the same
        # recorded commit, and the published source already records the provider.
        if parts[2] == release['build_commit'] and source.get('status') == 'uploaded':
            return source, '/'.join(parts[3:])
    return None, None


def zip_recover(item):
    source, tasks = item
    cached = ROOT / 'archive/sources' / str(source['repo_id']) / (source['commit'] + '.zip')
    if not cached.exists():
        cached = ROOT / 'archive/media-git' / (source['sha256'] + '.zip')
    result, log = {}, []
    try:
        if not cached.exists():
            if source['bytes'] > 100 * 1024 * 1024:
                raise ValueError('ZIP exceeds limit')
            data, _, _ = request(source['remote_url'], source['bytes'])
            if hashlib.sha256(data).hexdigest() != source['sha256'] or len(data) != source['bytes']:
                raise ValueError('Published ZIP checksum/size mismatch')
            cached.write_bytes(data)
        if hashlib.sha256(cached.read_bytes()).hexdigest() != source['sha256']:
            raise ValueError('Cached ZIP checksum mismatch')
        with zipfile.ZipFile(cached) as archive:
            entries = {'/'.join(e.filename.split('/')[1:]): e for e in archive.infolist() if not e.is_dir()}
            for key, relative in tasks:
                entry, match = match_entry(entries, relative)
                if not entry and len(relative.split('/')[-1]) > 12:
                    matches = [name for name in entries if name.split('/')[-1].lower() == relative.split('/')[-1].lower()]
                    if len(matches) == 1:
                        entry, match = matches[0], 'unique_filename_same_release'
                if not entry:
                    log.append({'key': key, 'result': 'Path absent from verified ZIP'})
                    continue
                info = entries[entry]
                if info.file_size > LIMIT or stat.S_ISLNK(info.external_attr >> 16):
                    continue
                result[key] = store(archive.read(info), method='verified_git_snapshot', source_zip_sha256=source['sha256'], source_revision=source['commit'], source_repository=source.get('provider'), source_entry=entry, path_match=match, revision_verified=True)
    except Exception as error:
        log.append({'source': source['key'], 'result': str(error)})
    return result, log


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['zip', 'local', 'history', 'phar', 'forks', 'wayback', 'cdx'])
    args = parser.parse_args()
    if not (OUT / 'baseline.json').exists():
        previous = read_json(SNAPSHOT / 'media-recovery-audit.json', {})
        (OUT / 'baseline.json').write_text(json.dumps(previous.get('records') or MISSING, indent=2), encoding='utf8')
    found = read_json(OUT / 'index.json', {})
    audit = read_json(OUT / 'audit.json', {})
    pending = {k: v for k, v in MISSING.items() if k not in found}
    if args.phase in ['zip', 'local']:
        if args.phase == 'local':
            for filename in ['repository-index', 'fork-index', 'local-index']:
                for key, value in read_json(OUT / (filename + '.json'), {}).items():
                    found.setdefault(key, value)
            pending = {k: v for k, v in MISSING.items() if k not in found}
        groups = {}
        for key, resource in pending.items():
            source, relative = source_for(resource)
            if not source and args.phase == 'local':
                release = RELEASES[resource['release_ids'][0]]
                candidate = SOURCES.get(f"{release['repo_id']}@{release['build_commit']}", {})
                if candidate.get('status') == 'uploaded':
                    source = candidate
                    parts = urllib.parse.unquote(urllib.parse.urlsplit(resource['capture_url']).path).strip('/').split('/')
                    relative = '/'.join(parts[3:] if 'raw.githubusercontent.com' in resource['capture_url'] else parts)
            if source:
                groups.setdefault(source['key'], (source, []))[1].append((key, relative))
        logs = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for n, (images, rows) in enumerate(pool.map(zip_recover, groups.values()), 1):
                found.update(images)
                logs.extend(rows)
                if n % 20 == 0:
                    print(f'ZIP {n}/{len(groups)}: {len(found)} recovered', flush=True)
        audit[args.phase] = {'archives_checked': len(groups), 'results': logs}
    elif args.phase == 'phar':
        images = read_json(ROOT / 'archive/media-phar/index.json', {})
        downloads = read_json(SNAPSHOT / 'downloads-plugins.json', {})
        for key, resource in pending.items():
            url = urllib.parse.urlsplit(resource['capture_url'])
            parts = urllib.parse.unquote(url.path).strip('/').split('/')
            relative = '/'.join(parts[3:] if url.hostname == 'raw.githubusercontent.com' else parts)
            for rid in resource['release_ids']:
                entries = images.get(rid, {})
                if not isinstance(entries, dict):
                    continue
                entry, _ = match_entry(entries, relative)
                if not entry:
                    continue
                image = entries[entry]
                data = (ROOT / 'archive/media-phar' / image['file']).read_bytes()
                if hashlib.sha256(data).hexdigest() != image['sha256']:
                    raise ValueError('PHAR image checksum mismatch')
                found[key] = store(data, method='verified_phar_entry', release_id=rid, phar_sha256=downloads[rid]['sha256'], phar_entry=entry, revision_verified=False, note='Image entry recovered from the recorded original PHAR; identity at the upstream image URL is not independently verified.')
                break
    elif args.phase == 'history':
        targets = {}
        for key, resource in pending.items():
            url = urllib.parse.urlsplit(resource['capture_url'])
            parts = urllib.parse.unquote(url.path).strip('/').split('/')
            relative = '/'.join(parts[3:] if url.hostname == 'raw.githubusercontent.com' else parts)
            for rid in resource['release_ids']:
                targets.setdefault(RELEASES[rid]['repo_id'], []).append((key, relative))
        checked = 0
        for source in SOURCES.values():
            if source['repo_id'] not in targets:
                continue
            cached = ROOT / 'archive/media-git' / (str(source.get('sha256')) + '.zip')
            if not cached.exists():
                cached = ROOT / 'archive/sources' / str(source['repo_id']) / (source['commit'] + '.zip')
            if not cached.exists():
                continue
            if hashlib.sha256(cached.read_bytes()).hexdigest() != source['sha256']:
                raise ValueError('Historical ZIP checksum mismatch')
            checked += 1
            with zipfile.ZipFile(cached) as archive:
                entries = {'/'.join(e.filename.split('/')[1:]): e for e in archive.infolist() if not e.is_dir()}
                for key, relative in targets[source['repo_id']]:
                    entry, match = match_entry(entries, relative)
                    if key in found or not entry or entries[entry].file_size > LIMIT or stat.S_ISLNK(entries[entry].external_attr >> 16):
                        continue
                    try:
                        found[key] = store(archive.read(entries[entry]), method='archived_source_revision_capture', source_zip_sha256=source['sha256'], source_revision=source['commit'], source_repository=source.get('provider'), source_entry=entry, path_match=match, revision_verified=False, note='Image from a saved source ZIP of the same repository at another release revision; original release image identity is not verified.')
                    except ValueError:
                        pass
        audit['history'] = {'archives_checked': checked}
    elif args.phase == 'forks':
        jobs = []
        for key, resource in pending.items():
            source, relative = source_for(resource)
            if source:
                parts = urllib.parse.urlsplit(resource['capture_url']).path.strip('/').split('/')
                providers = list(dict.fromkeys([source.get('provider'), source['repo_name']] + source.get('candidates', [])))
                for provider in providers:
                    if isinstance(provider, str) and provider.count('/') == 1:
                        for path in paths(relative):
                            jobs.append((key, f"https://raw.githubusercontent.com/{provider}/{source['commit']}/{urllib.parse.quote(path, safe='/+')}" , source['commit'], provider))
        def fetch(job):
            key, url, revision, provider = job
            try:
                data, final, _ = request(url)
                return key, store(data, method='verified_fork_commit', fetched_url=final, source_repository=provider, source_revision=revision, revision_verified=True), {'key': key, 'url': url, 'result': 'image'}
            except Exception as error:
                return key, None, {'key': key, 'url': url, 'result': str(error)}
        logs = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            for n, (key, image, row) in enumerate(pool.map(fetch, jobs), 1):
                if image and key not in found:
                    found[key] = image
                logs.append(row)
                if n % 50 == 0:
                    print(f'Fork URL {n}/{len(jobs)}: {len(found)} recovered', flush=True)
        audit['forks'] = logs
    elif args.phase == 'cdx':
        pending = {k: v for k, v in MISSING.items() if k not in found}
        urls = {}
        for key, resource in pending.items():
            urls.setdefault(resource['capture_url'], []).append(key)

        def lookup_cdx(item):
            url, keys = item
            log = {'url': url}
            try:
                # Raw GitHub GIFs can be indexed as application/octet-stream.
                # Verify the response bytes instead of filtering by image MIME.
                endpoint = 'https://web.archive.org/cdx/search/cdx?' + urllib.parse.urlencode({'url': url, 'output': 'json', 'filter': 'statuscode:200', 'collapse': 'digest', 'fl': 'timestamp,original,mimetype'}, doseq=True)
                data, _, _ = request(endpoint, 1000000)
                captures = json.loads(data)
                log['captures'] = captures
                if len(captures) > 1:
                    timestamp, original, _ = captures[-1]
                    replay = f'https://web.archive.org/web/{timestamp}id_/{original}'
                    image, final, _ = request(replay)
                    recovered = store(image, method='wayback_capture', fetched_url=final, wayback_timestamp=timestamp, archived_original_url=original, revision_verified=False, note='Image retrieved from an Internet Archive CDX record for the original URL; the capture timestamp is recorded separately from release metadata.')
                    log['result'] = 'image'
                    return keys, recovered, log
                log['result'] = 'CDX returned no successful capture'
            except Exception as error:
                log['result'] = str(error)
            return keys, None, log

        logs = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            for n, (keys, image, row) in enumerate(pool.map(lookup_cdx, urls.items()), 1):
                if image:
                    for key in keys:
                        found[key] = image
                logs.append(row)
                if n % 20 == 0:
                    print(f'CDX {n}/{len(urls)}: {len(found)} recovered', flush=True)
        audit['cdx'] = logs
    else:
        # Availability API queries are resumable; a timeout/blocked
        # response is recorded separately from a successful "no snapshot" result.
        logs = audit.setdefault('wayback', {})
        urls = {}
        for key, resource in pending.items():
            urls.setdefault(resource['capture_url'], []).append(key)
        def lookup(item):
            url, keys = item
            record = {'checked_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
            recovered = None
            try:
                data, _, _ = request('https://archive.org/wayback/available?' + urllib.parse.urlencode({'url': url}), 100000)
                available = json.loads(data).get('archived_snapshots', {}).get('closest')
                record['snapshot'] = available
                if available and available.get('available') and str(available.get('status')) == '200':
                    timestamp = available['timestamp']
                    replay = 'https://web.archive.org/web/' + timestamp + 'id_/' + url
                    image, final, _ = request(replay)
                    recovered = store(image, method='wayback_capture', fetched_url=final, wayback_timestamp=timestamp, revision_verified=False, note='Image captured by the Internet Archive at the recorded timestamp; historical release identity is not verified.')
                    record['result'] = 'image'
                else:
                    record['result'] = 'No successful capture returned by availability API'
            except Exception as error:
                record['result'] = str(error)
            return url, keys, recovered, record
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
          for n, (url, keys, recovered, record) in enumerate(pool.map(lookup, [(u, k) for u, k in urls.items() if u not in logs]), 1):
            if recovered:
                for key in keys:
                    found[key] = recovered
            logs[url] = record
            (OUT / 'index.json').write_text(json.dumps(found, indent=2), encoding='utf8')
            (OUT / 'audit.json').write_text(json.dumps(audit, indent=2), encoding='utf8')
            if n % 10 == 0:
                print(f'Wayback {n}/{len(urls)}: {len(found)} recovered', flush=True)
    (OUT / 'index.json').write_text(json.dumps(found, indent=2), encoding='utf8')
    (OUT / 'audit.json').write_text(json.dumps(audit, indent=2), encoding='utf8')
    print(f'Total follow-up recovered: {len(found)}', flush=True)


if __name__ == '__main__':
    main()
