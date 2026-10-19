"""Inspect surviving branches and forks; distinguish exact and later revisions."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.parse
import importlib.util
spec = importlib.util.spec_from_file_location('recovery', Path(__file__).with_name('recover-media-followup.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


def api(endpoint):
    process = subprocess.run(['gh', 'api', endpoint], capture_output=True, text=True, encoding='utf8')
    if process.returncode:
        raise ValueError(process.stderr.strip())
    return json.loads(process.stdout)


def compact_name(value):
    return re.sub(r'[^a-z0-9.]', '', value.lower())


def inspect(item):
    repo, tasks = item
    logs, found = [], {}
    try:
        metadata = api('repos/' + repo)
        repo = metadata['full_name']
        branches = api('repos/' + repo + '/branches?per_page=100')
        branches.sort(key=lambda b: b['name'] != metadata['default_branch'])
        trees = []
        for branch in branches[:12]:
            try:
                tree = api(f"repos/{repo}/git/trees/{branch['commit']['sha']}?recursive=1")
                names = [e['path'] for e in tree.get('tree', []) if e['type'] == 'blob' and e.get('size', 0) <= r.LIMIT]
                trees.append((branch['name'], branch['commit']['sha'], names))
            except Exception as error:
                logs.append({'branch': branch['name'], 'result': str(error)})
        for key, relative, original_revision in tasks:
            # Exact revisions get priority, including corrected relative paths.
            exact_names = None
            if re.fullmatch('[a-f0-9]{40}', original_revision):
                try:
                    tree = api(f'repos/{repo}/git/trees/{original_revision}?recursive=1')
                    exact_names = [e['path'] for e in tree.get('tree', []) if e['type'] == 'blob']
                except Exception as error:
                    logs.append({'key': key, 'revision': original_revision, 'result': str(error)})
            choices = ([('original revision', original_revision, exact_names)] if exact_names is not None else []) + trees
            for branch, revision, names in choices:
                entry, match = r.match_entry(names, relative)
                if not entry:
                    candidates = [n for n in names if compact_name(n.split('/')[-1]) == compact_name(relative.split('/')[-1])]
                    if len(candidates) == 1:
                        entry, match = candidates[0], 'unique_normalized_filename'
                if not entry:
                    continue
                url = f'https://raw.githubusercontent.com/{repo}/{revision}/' + urllib.parse.quote(entry)
                try:
                    data, final, _ = r.request(url)
                    exact = revision == original_revision
                    found[key] = r.store(data, method='verified_fork_commit' if exact else 'repository_revision_capture', source_repository=repo, source_revision=revision, source_entry=entry, source_branch=branch, fetched_url=final, path_match=match, revision_verified=exact, note='Image from the original release commit.' if exact else 'Image preserved from a surviving repository revision; it is not verified as the image at the original release commit.')
                    logs.append({'key': key, 'result': 'image', 'revision_verified': exact, 'url': url})
                    break
                except Exception as error:
                    logs.append({'key': key, 'url': url, 'result': str(error)})
        # Fork metadata supplies renamed repositories and exact historical commits.
        forks = api('repos/' + repo + '/forks?per_page=100&sort=oldest')
        logs.append({'repository': repo, 'forks': [f['full_name'] for f in forks]})
    except Exception as error:
        logs.append({'repository': repo, 'result': str(error)})
        # Public repository-name search also finds detached forks after upstream deletion.
        try:
            name = repo.split('/')[-1]
            results = api('search/repositories?' + urllib.parse.urlencode({'q': name + ' in:name fork:true', 'per_page': 20}))
            candidates = [v['full_name'] for v in results.get('items', []) if v['name'].lower() == name.lower()]
            logs.append({'repository': repo, 'detached_candidates': candidates})
            for key, relative, revision in tasks:
                if not re.fullmatch('[a-f0-9]{40}', revision):
                    continue
                for candidate in candidates:
                    try:
                        url = f'https://raw.githubusercontent.com/{candidate}/{revision}/' + urllib.parse.quote(relative)
                        data, final, _ = r.request(url)
                        found[key] = r.store(data, method='verified_fork_commit', source_repository=candidate, source_revision=revision, source_entry=relative, fetched_url=final, revision_verified=True)
                        logs.append({'key': key, 'result': 'image', 'url': url})
                        break
                    except Exception as error:
                        logs.append({'key': key, 'url': url, 'result': str(error)})
        except Exception as error:
            logs.append({'repository': repo, 'result': str(error)})
    return found, logs


def inspect_forks(item):
    repo, (forks, tasks) = item
    found, logs = {}, []
    for fork in forks:
        if all(key in found for key, _, _ in tasks):
            break
        try:
            metadata = api('repos/' + fork)
            branch = metadata['default_branch']
            commit = api(f'repos/{fork}/commits/{branch}')['sha']
            tree = api(f'repos/{fork}/git/trees/{commit}?recursive=1')
            names = [e['path'] for e in tree.get('tree', []) if e['type'] == 'blob' and e.get('size', 0) <= r.LIMIT]
            logs.append({'repository': fork, 'revision': commit, 'result': 'Tree inspected'})
            for key, relative, original_revision in tasks:
                if key in found:
                    continue
                entry, match = r.match_entry(names, relative)
                if not entry:
                    continue
                url = f'https://raw.githubusercontent.com/{fork}/{commit}/' + urllib.parse.quote(entry)
                data, final, _ = r.request(url)
                found[key] = r.store(data, method='fork_revision_capture', source_repository=fork, source_revision=commit, source_entry=entry, fetched_url=final, path_match=match, revision_verified=commit == original_revision, note='Image preserved from a surviving fork revision; it is not verified as the image at the original release commit.')
                logs.append({'key': key, 'url': url, 'result': 'image'})
        except Exception as error:
            logs.append({'repository': fork, 'result': str(error)})
    return found, logs


if __name__ == '__main__':
    import sys
    if '--forks' in sys.argv:
        done = {}
        for filename in ['index', 'local-index', 'repository-index']:
            done.update(r.read_json(r.OUT / (filename + '.json'), {}))
        groups = {}
        known = r.read_json(r.OUT / 'repository-audit.json', [])
        for key, resource in r.MISSING.items():
            if key in done:
                continue
            parts = urllib.parse.unquote(urllib.parse.urlsplit(resource['capture_url']).path).strip('/').split('/')
            if 'raw.githubusercontent.com' not in resource['capture_url'] or len(parts) < 4:
                continue
            source, _ = r.source_for(resource)
            repo = source.get('provider') or source['repo_name'] if source else '/'.join(parts[:2])
            forks = next((row['forks'] for row in known if row.get('repository', '').lower() == repo.lower() and 'forks' in row), [])
            if forks:
                groups.setdefault(repo, (forks, []))[1].append((key, '/'.join(parts[3:]), parts[2]))
        found, logs = {}, []
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            for n, (images, rows) in enumerate(pool.map(inspect_forks, groups.items()), 1):
                found.update(images)
                logs.extend(rows)
                (r.OUT / 'fork-index.json').write_text(json.dumps(found, indent=2), encoding='utf8')
                (r.OUT / 'fork-audit.json').write_text(json.dumps(logs, indent=2), encoding='utf8')
                print(f'Fork network {n}/{len(groups)}: {len(found)} recovered', flush=True)
        sys.exit(0)
    done = r.read_json(r.OUT / 'index.json', {})
    previous = r.read_json(r.OUT / 'repository-index.json', {})
    groups = {}
    for key, resource in r.MISSING.items():
        if key in done or key in previous:
            continue
        url = urllib.parse.urlsplit(resource['capture_url'])
        parts = urllib.parse.unquote(url.path).strip('/').split('/')
        if url.hostname != 'raw.githubusercontent.com' or len(parts) < 4:
            continue
        source, relative = r.source_for(resource)
        repo = source.get('provider') or source['repo_name'] if source else '/'.join(parts[:2])
        groups.setdefault(repo, []).append((key, '/'.join(parts[3:]), parts[2]))
    audit = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for n, (images, logs) in enumerate(pool.map(inspect, groups.items()), 1):
            previous.update(images)
            audit.extend(logs)
            (r.OUT / 'repository-index.json').write_text(json.dumps(previous, indent=2), encoding='utf8')
            (r.OUT / 'repository-audit.json').write_text(json.dumps(audit, indent=2), encoding='utf8')
            print(f'Repository {n}/{len(groups)}: {len(previous)} recovered', flush=True)
