#!/usr/bin/env python3
"""Publish verified archive files as GitHub Release assets, then remove local copies."""

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import ssl
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "poggit-archive/artifacts"
MAX_ASSETS_PER_RELEASE = 900
MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024


class GitHubError(RuntimeError):
    pass


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for attempt in range(7):
        try:
            os.replace(temporary, path)
            return
        except PermissionError:
            if attempt == 6:
                raise
            time.sleep(min(0.25 * (2 ** attempt), 4))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_slug(value: object) -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", str(value)).strip("-._").lower()
    return (slug or "artifact")[:90]


def get_token() -> str:
    result = subprocess.run(
        ["gh", "auth", "token"], check=True, capture_output=True, text=True
    )
    token = result.stdout.strip()
    if not token:
        raise GitHubError("gh auth token returned an empty token")
    return token


def api_request(token: str, method: str, path: str, payload: dict | None = None) -> tuple[object, dict[str, str]]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "poggit-archive-publisher",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = Request(f"https://api.github.com{path}", data=body, headers=headers, method=method)
    try:
        with urlopen(request, timeout=60) as response:
            data = response.read()
            return (json.loads(data) if data else None), {k.lower(): v for k, v in response.headers.items()}
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        retry_after = error.headers.get("Retry-After")
        remaining = error.headers.get("X-RateLimit-Remaining")
        reset = error.headers.get("X-RateLimit-Reset")
        rate = f" remaining={remaining} reset={reset}" if remaining is not None else ""
        retry = f" retry-after={retry_after}" if retry_after else ""
        raise GitHubError(f"GitHub API {method} {path} returned HTTP {error.code}{rate}{retry}: {detail}") from error
    except URLError as error:
        raise GitHubError(f"GitHub API connection failed: {error.reason}") from error


def get_release(token: str, tag: str) -> dict | None:
    path = f"/repos/{REPOSITORY}/releases/tags/{quote(tag, safe='')}"
    try:
        release, _ = api_request(token, "GET", path)
        return release
    except GitHubError as error:
        if "HTTP 404" in str(error):
            return None
        raise


def ensure_release(token: str, tag: str, title: str, notes: str) -> dict:
    release = get_release(token, tag)
    if release:
        return release
    release, _ = api_request(
        token,
        "POST",
        f"/repos/{REPOSITORY}/releases",
        {"tag_name": tag, "name": title, "body": notes, "draft": False, "prerelease": False},
    )
    print(f"Created release {tag}", flush=True)
    return release


def release_assets(token: str, release_id: int) -> dict[str, dict]:
    assets: dict[str, dict] = {}
    page = 1
    while True:
        rows, _ = api_request(
            token,
            "GET",
            f"/repos/{REPOSITORY}/releases/{release_id}/assets?per_page=100&page={page}",
        )
        if not isinstance(rows, list):
            raise GitHubError(f"GitHub returned an unexpected asset list for release {release_id}")
        for asset in rows:
            assets[asset["name"]] = asset
        if len(rows) < 100:
            return assets
        page += 1


def upload_asset(token: str, release_id: int, path: Path, asset_name: str, size: int) -> dict:
    query = urlencode({"name": asset_name})
    request_path = f"/repos/{REPOSITORY}/releases/{release_id}/assets?{query}"
    connection = http.client.HTTPSConnection("uploads.github.com", timeout=180, context=ssl.create_default_context())
    connection.putrequest("POST", request_path)
    connection.putheader("Accept", "application/vnd.github+json")
    connection.putheader("Authorization", f"Bearer {token}")
    connection.putheader("X-GitHub-Api-Version", "2022-11-28")
    connection.putheader("User-Agent", "poggit-archive-publisher")
    connection.putheader("Content-Type", "application/octet-stream")
    connection.putheader("Content-Length", str(size))
    connection.endheaders()
    try:
        with path.open("rb") as stream:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                connection.send(chunk)
        response = connection.getresponse()
        response_body = response.read()
        if response.status != 201:
            detail = response_body.decode("utf-8", errors="replace")[:1000]
            retry_after = response.getheader("Retry-After")
            retry = f" retry-after={retry_after}" if retry_after else ""
            raise GitHubError(f"GitHub asset upload returned HTTP {response.status}{retry}: {detail}")
        return json.loads(response_body)
    finally:
        connection.close()


def manifest_setup(snapshot_dir: Path, kind: str):
    if kind == "plugins":
        catalog = read_json(snapshot_dir / "releases.json")
        path = snapshot_dir / "downloads-plugins.json"
        records = [(str(row["id"]), row) for row in catalog]
        return path, records, "phar"
    if kind == "virions":
        catalog = read_json(snapshot_dir / "virions.json")
        path = snapshot_dir / "downloads-virions.json"
        records = [(str(row["id"]), row) for row in catalog]
        return path, records, "phar"
    source_map = read_json(snapshot_dir / "source-map.json")
    jobs: dict[str, dict] = {}
    for source in source_map["matches"]:
        repo = source.get("repo_name")
        if not repo or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
            continue
        repo_id = source.get("repo_id")
        for commit in source.get("commits", []):
            if not re.fullmatch(r"[0-9a-fA-F]{7,64}", commit or ""):
                continue
            key = f"{repo_id or repo}@{commit.lower()}"
            jobs.setdefault(key, {"key": key, "repo_id": repo_id, "repo_name": repo, "commit": commit})
    records = sorted(jobs.items(), key=lambda row: (str(row[1].get("repo_id") or ""), row[1]["commit"].lower()))
    path = snapshot_dir / "source-downloads.json"
    return path, records, "zip"


def asset_name(kind: str, key: str, record: dict, digest: str, extension: str) -> str:
    if kind == "plugins":
        identity = f"plugin-{key}-{record.get('build_id', 'build')}-{safe_slug(record.get('name'))}-{safe_slug(record.get('version'))}"
    elif kind == "virions":
        identity = f"virion-{safe_slug(key)}"
    else:
        identity = f"source-{record.get('repo_id') or 'repo'}-{safe_slug(record.get('commit'))}"
    return f"{identity}-{digest[:12]}.{extension}"


def reconcile(token: str, kind: str, snapshot_id: str, rows: list[tuple[str, dict]], manifest_path: Path, states: dict, extension: str, keep_local: bool) -> int:
    releases: dict[str, tuple[dict | None, dict[str, dict]]] = {}
    repaired = 0
    for index, (key, catalog_row) in enumerate(rows):
        state = states.get(key, {})
        if state.get("status") == "license_review_required":
            continue
        if state.get("status") == "uploaded" and state.get("remote_url"):
            continue
        digest = state.get("sha256")
        size = state.get("bytes")
        if not digest or size is None:
            continue
        tag = f"{kind}-{snapshot_id[:10].lower()}-{index // MAX_ASSETS_PER_RELEASE + 1:04d}"
        if tag not in releases:
            release = get_release(token, tag)
            assets = release_assets(token, release["id"]) if release else {}
            releases[tag] = (release, assets)
        release, assets = releases[tag]
        name = asset_name(kind, key, {**catalog_row, **state}, str(digest), extension)
        remote = assets.get(name)
        if remote is None:
            continue
        remote_digest = str(remote.get("digest") or "").removeprefix("sha256:").lower()
        if remote_digest != str(digest).lower() or int(remote.get("size", -1)) != int(size):
            print(f"Remote asset found but digest or size differs. Kept local state for {key}", file=sys.stderr)
            continue
        relative_path = state.get("storage_path")
        local = (ROOT / Path(relative_path)).resolve() if relative_path else None
        if local and local.exists():
            if not local.is_relative_to(ROOT / "archive") or local.stat().st_size != int(size) or sha256_file(local) != digest:
                raise GitHubError(f"Local file does not match the verified remote artifact. It was left intact: {local}")
        updated = {
            **catalog_row,
            **state,
            "status": "uploaded",
            "remote_repo": REPOSITORY,
            "remote_tag": tag,
            "remote_asset_name": name,
            "remote_url": remote["browser_download_url"],
            "remote_sha256": remote_digest,
            "remote_asset_id": remote["id"],
            "uploaded_at": remote.get("updated_at"),
            "storage_path": None,
            "local_deleted": not keep_local,
        }
        states[key] = updated
        write_json(manifest_path, states)
        if local and local.exists() and not keep_local:
            local.unlink()
        repaired += 1
        print(f"Reconciled {kind} {key} against the remote SHA-256", flush=True)
    print(f"Reconciled {repaired} {kind} assets. Manifest: {manifest_path}")
    return repaired


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", help="snapshot id, defaults to the current snapshot")
    parser.add_argument("--kind", choices=("plugins", "virions", "sources"), required=True)
    parser.add_argument("--limit", type=int, default=0, help="maximum new uploads, 0 means all available")
    parser.add_argument("--key-file", type=Path, help="publish only catalog keys listed one per line")
    parser.add_argument("--keep-local", action="store_true", help="verify remote assets but keep local files")
    parser.add_argument("--reconcile", action="store_true", help="restore manifest links for existing remote assets")
    args = parser.parse_args()

    if args.snapshot:
        snapshot_id = args.snapshot
    else:
        snapshot_id = read_json(ROOT / "data" / "api" / "v1" / "current.json")["snapshot_id"]
    snapshot_dir = ROOT / "data" / "snapshots" / snapshot_id
    if not snapshot_dir.is_dir():
        parser.error(f"snapshot does not exist: {snapshot_id}")
    manifest_path, rows, extension = manifest_setup(snapshot_dir, args.kind)
    states = read_json(manifest_path) if manifest_path.exists() else {}
    selected_keys = None
    if args.key_file:
        selected_keys = {
            line.strip() for line in args.key_file.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        }
        unknown_keys = selected_keys - {key for key, _ in rows}
        if unknown_keys:
            parser.error(f"Keys are not in the snapshot: {', '.join(sorted(unknown_keys))}")
        if args.reconcile:
            parser.error("--key-file cannot be combined with --reconcile")
    token = get_token()
    if args.reconcile:
        reconcile(token, args.kind, snapshot_id, rows, manifest_path, states, extension, args.keep_local)
        return 0
    release_cache: dict[str, tuple[dict, dict[str, dict]]] = {}
    completed = 0
    unavailable = 0

    for index, (key, catalog_row) in enumerate(rows):
        if selected_keys is not None and key not in selected_keys:
            continue
        state = states.get(key, {})
        if state.get("status") == "license_review_required":
            unavailable += 1
            continue
        if state.get("status") == "uploaded" and state.get("remote_url"):
            if not args.keep_local and state.get("storage_path"):
                local = (ROOT / Path(state["storage_path"])).resolve()
                if local.exists() and local.is_file() and local.is_relative_to(ROOT / "archive"):
                    local.unlink()
                    state["storage_path"] = None
                    state["local_deleted"] = True
                    states[key] = state
                    write_json(manifest_path, states)
            continue

        relative_path = state.get("storage_path")
        if not relative_path:
            unavailable += 1
            continue
        local = (ROOT / Path(relative_path)).resolve()
        if not local.is_file():
            unavailable += 1
            continue
        if not local.is_relative_to(ROOT / "archive"):
            raise GitHubError(f"Refusing to publish or delete a file outside archive/: {local}")
        actual_size = local.stat().st_size
        if actual_size >= MAX_ASSET_BYTES:
            raise GitHubError(f"Asset reaches the 2 GiB GitHub release limit and was left intact: {local}")
        digest = sha256_file(local)
        expected_digest = state.get("sha256")
        expected_size = state.get("bytes")
        if expected_digest and digest != expected_digest:
            raise GitHubError(f"Local SHA-256 does not match the manifest. File was left intact: {local}")
        if expected_size is not None and actual_size != int(expected_size):
            raise GitHubError(f"Local size does not match the manifest. File was left intact: {local}")

        shard = index // MAX_ASSETS_PER_RELEASE + 1
        tag = f"{args.kind}-{snapshot_id[:10].lower()}-{shard:04d}"
        if tag not in release_cache:
            title = f"{args.kind.title()} archive {snapshot_id} part {shard:04d}"
            notes = (
                f"Original artifacts preserved from snapshot {snapshot_id}.\n\n"
                "Asset filenames include the catalog identity and SHA-256 prefix. The full SHA-256 and source attribution are recorded in the archive catalog."
            )
            release = ensure_release(token, tag, title, notes)
            assets = release_assets(token, release["id"])
            if len(assets) > MAX_ASSETS_PER_RELEASE:
                raise GitHubError(f"Release {tag} already exceeds the configured safe asset count")
            release_cache[tag] = (release, assets)
        release, assets = release_cache[tag]
        name = asset_name(args.kind, key, {**catalog_row, **state}, digest, extension)
        remote = assets.get(name)
        if remote is None:
            if len(assets) >= MAX_ASSETS_PER_RELEASE:
                raise GitHubError(f"Release {tag} reached {MAX_ASSETS_PER_RELEASE} assets. File was left intact: {local}")
            remote = upload_asset(token, release["id"], local, name, actual_size)
            assets[name] = remote
        remote_digest = str(remote.get("digest") or "")
        remote_sha = remote_digest.removeprefix("sha256:").lower()
        if remote_sha != digest:
            raise GitHubError(f"Remote SHA-256 is missing or mismatched for {name}. Local file was left intact")
        if int(remote.get("size", -1)) != actual_size:
            raise GitHubError(f"Remote size is missing or mismatched for {name}. Local file was left intact")

        states[key] = {
            **catalog_row,
            **state,
            "status": "uploaded",
            "bytes": actual_size,
            "sha256": digest,
            "remote_repo": REPOSITORY,
            "remote_tag": tag,
            "remote_asset_name": name,
            "remote_url": remote["browser_download_url"],
            "remote_sha256": remote_sha,
            "remote_asset_id": remote["id"],
            "uploaded_at": remote.get("updated_at"),
            "storage_path": None,
            "local_deleted": not args.keep_local,
        }
        write_json(manifest_path, states)
        if not args.keep_local:
            local.unlink()
        completed += 1
        print(f"[{completed}] {args.kind} {key}: uploaded and SHA-256 verified" + ("" if args.keep_local else ", local copy deleted"), flush=True)
        if args.limit and completed >= args.limit:
            break

    print(f"Finished {completed} new {args.kind} uploads. Local files not ready: {unavailable}. Manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (GitHubError, subprocess.CalledProcessError) as error:
        print(f"Stopped safely: {error}", file=sys.stderr)
        raise SystemExit(1)
