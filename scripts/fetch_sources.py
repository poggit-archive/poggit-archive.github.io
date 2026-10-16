#!/usr/bin/env python3
"""Fetch source ZIP snapshots at exact Poggit build commits, preferring upstream."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse

from poggit_archive import PoliteHTTP, RateLimited, ROOT, SNAPSHOTS, safe_slug, write_json


def current_snapshot(snapshot_id: str | None) -> tuple[Path, dict]:
    if snapshot_id:
        folder = SNAPSHOTS / snapshot_id
        return folder, json.loads((folder / "source-map.json").read_text(encoding="utf-8"))
    pointer = json.loads((ROOT / "data" / "api" / "v1" / "current.json").read_text(encoding="utf-8"))
    folder = SNAPSHOTS / pointer["snapshot_id"]
    return folder, json.loads((folder / "source-map.json").read_text(encoding="utf-8"))


def make_jobs(source_map: dict) -> list[dict]:
    jobs: dict[str, dict] = {}
    for source in source_map["matches"]:
        repo_name = source.get("repo_name")
        if not repo_name or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo_name):
            continue
        source_id = source.get("repo_id")
        for commit in source.get("commits", []):
            if not re.fullmatch(r"[0-9a-fA-F]{7,64}", commit or ""):
                continue
            key = f"{source_id or repo_name}@{commit.lower()}"
            job = jobs.setdefault(key, {
                "key": key,
                "repo_id": source_id,
                "repo_name": repo_name,
                "commit": commit,
                "source_url": source.get("source_url"),
                "candidates": [],
            })
            for candidate in source.get("pm_pl_candidates", []):
                name = candidate.get("full_name")
                if name and name.casefold() != repo_name.casefold() and name not in job["candidates"]:
                    job["candidates"].append(name)
    return sorted(jobs.values(), key=lambda row: (str(row.get("repo_id") or ""), row["commit"].lower()))


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_archive_url(repo: str, commit: str) -> str | None:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        return None
    if not re.fullmatch(r"[0-9a-fA-F]{7,64}", commit):
        return None
    return f"https://github.com/{repo}/archive/{commit}.zip"


def fetch_zip(client: PoliteHTTP, url: str, part: Path, max_bytes: int) -> dict:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "github.com":
        return {"status": "rejected_url", "error": "source archive host is not github.com"}
    part.parent.mkdir(parents=True, exist_ok=True)
    try:
        with client.open(url, headers={"Accept-Encoding": "identity"}) as response:
            final_host = urlparse(response.geturl()).hostname
            if final_host not in {"github.com", "codeload.github.com"}:
                return {"status": "rejected_redirect", "final_host": final_host}
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > max_bytes:
                part.unlink(missing_ok=True)
                return {"status": "too_large", "bytes": int(content_length)}
            content_type = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
            if content_type not in {"application/zip", "application/octet-stream", "application/x-zip-compressed"}:
                return {"status": "unexpected_content_type", "content_type": content_type}
            written = 0
            with part.open("wb") as output:
                while True:
                    chunk = response.read(256 * 1024)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > max_bytes:
                        output.close()
                        part.unlink(missing_ok=True)
                        return {"status": "too_large", "bytes": written}
                    output.write(chunk)
        with part.open("rb") as stream:
            signature = stream.read(4)
        if signature[:2] != b"PK":
            part.unlink(missing_ok=True)
            return {"status": "not_zip", "bytes": written}
        return {"status": "downloaded", "bytes": written, "sha256": checksum(part), "final_url": url}
    except HTTPError as exc:
        part.unlink(missing_ok=True)
        return {"status": "http_error", "code": exc.code, "error": str(exc.reason)[:300]}
    except RateLimited:
        raise
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        return {"status": "failed", "error": str(exc)[:300]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", help="snapshot ID; defaults to current")
    parser.add_argument("--repo-id", type=int, action="append", default=[], help="limit source commits to one or more Poggit repository IDs")
    parser.add_argument("--key-file", help="process only source keys listed one per line")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int, default=0, help="maximum source commits (0 means all remaining)")
    parser.add_argument("--delay", type=float, default=2.0, help="minimum seconds between requests")
    parser.add_argument("--max-mib", type=int, default=100, help="skip source archives larger than this size")
    parser.add_argument("--publish-every", type=int, default=0, help="publish and remove local ZIPs after this many completed downloads")
    args = parser.parse_args()
    folder, source_map = current_snapshot(args.snapshot)
    jobs = make_jobs(source_map)
    progress_path = folder / "source-downloads.json"
    progress = json.loads(progress_path.read_text(encoding="utf-8")) if progress_path.exists() else {}
    def needs_download(job: dict) -> bool:
        state = progress.get(job["key"], {})
        status = state.get("status")
        if status == "uploaded":
            return False
        if status in {"downloaded", "already_present"}:
            storage_path = state.get("storage_path")
            return not storage_path or not (ROOT / Path(storage_path)).is_file()
        return True

    pending = [job for job in jobs if needs_download(job)]
    if args.repo_id:
        selected_repo_ids = set(args.repo_id)
        pending = [job for job in pending if job.get("repo_id") in selected_repo_ids]
    if args.key_file:
        selected_keys = {
            line.strip()
            for line in Path(args.key_file).read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        }
        pending = [job for job in pending if job["key"] in selected_keys]
    pending = pending[max(0, args.offset): max(0, args.offset) + args.limit if args.limit else None]
    if not pending:
        print("No source commits selected.")
        return 0
    root = ROOT / "archive" / "sources"
    client = PoliteHTTP(args.delay)
    max_bytes = max(1, args.max_mib) * 1024 * 1024
    publishable_since_sync = 0

    def publish_ready() -> None:
        nonlocal progress
        if args.publish_every <= 0:
            return
        subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "publish_artifacts.py"), "--kind", "sources", "--snapshot", args.snapshot or source_map["snapshot_id"]],
            check=True,
        )
        progress = json.loads(progress_path.read_text(encoding="utf-8"))

    for index, job in enumerate(pending, 1):
        target = root / safe_slug(str(job.get("repo_id") or job["repo_name"])) / f"{job['commit'].lower()}.zip"
        if target.exists():
            record = {"status": "already_present", "bytes": target.stat().st_size, "sha256": checksum(target), "storage_path": target.relative_to(ROOT).as_posix()}
            progress[job["key"]] = {**job, **record}
            write_json(progress_path, progress)
            print(f"[{index}/{len(pending)}] {job['repo_name']}@{job['commit'][:8]} already_present")
            publishable_since_sync += 1
            if publishable_since_sync >= args.publish_every > 0:
                publish_ready()
                publishable_since_sync = 0
            continue
        candidates = [job["repo_name"], *job["candidates"]]
        tried = []
        result = None
        try:
            for candidate in candidates:
                url = safe_archive_url(candidate, job["commit"])
                if not url:
                    continue
                tried.append(candidate)
                result = fetch_zip(client, url, target.with_suffix(".zip.part"), max_bytes)
                if result.get("status") == "downloaded":
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.with_suffix(".zip.part").replace(target)
                    result["storage_path"] = target.relative_to(ROOT).as_posix()
                    result["provider"] = candidate
                    break
                if result.get("status") in {"too_large", "unexpected_content_type", "not_zip", "rejected_redirect"}:
                    break
            if not result:
                result = {"status": "no_valid_source_url"}
        except RateLimited as exc:
            progress[job["key"]] = {**job, "status": "paused_rate_limit", "tried": tried, "error": str(exc)}
            write_json(progress_path, progress)
            publish_ready()
            print(f"Stopped safely: {exc}", file=sys.stderr)
            return 2
        result["tried"] = tried
        progress[job["key"]] = {**job, **result}
        write_json(progress_path, progress)
        print(f"[{index}/{len(pending)}] {job['repo_name']}@{job['commit'][:8]} {result['status']}")
        if result.get("storage_path"):
            publishable_since_sync += 1
            if publishable_since_sync >= args.publish_every > 0:
                publish_ready()
                publishable_since_sync = 0
    publish_ready()
    print(f"Finished {len(pending)} selected source commits. Status: {progress_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
