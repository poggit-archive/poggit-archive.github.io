#!/usr/bin/env python3
"""Preserve pinned virion Git snapshots or verified PHAR distribution source as separate ZIPs."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import zipfile

from poggit_archive import ROOT, write_json
from recover_phar_sources import recover_files, make_zip
from recover_swh_sources import request as swh_request, read_verified_tree

MAX_BYTES = 100 * 1024 * 1024

def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))

def download(url: str, path: Path, expected: dict | None = None) -> bytes:
    if not path.exists():
        with urlopen(Request(url, headers={"User-Agent": "PoggitArchiveRecovery/1.0 (+https://poggit-archive.github.io/)"}), timeout=60) as response:
            data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("Virion download exceeds the size limit")
        if expected and (len(data) != expected["bytes"] or hashlib.sha256(data).hexdigest() != expected["sha256"]):
            raise ValueError("Virion PHAR checksum mismatch")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    data = path.read_bytes()
    if expected and (len(data) != expected["bytes"] or hashlib.sha256(data).hexdigest() != expected["sha256"]):
        raise ValueError("Cached virion PHAR checksum mismatch")
    return data

def verify_zip(path: Path, commit: str) -> tuple[list[tuple[str, bytes]], str]:
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("An immutable full Git SHA is required")
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        roots = {row.filename.split("/", 1)[0] for row in entries}
        if len(roots) != 1 or not next(iter(roots)).endswith("-" + commit):
            raise ValueError("Git archive root does not identify the requested revision")
        if sum(row.file_size for row in entries) > MAX_BYTES or len(entries) > 20000 or archive.testzip() is not None:
            raise ValueError("Git archive failed size, entry count or CRC validation")
        root = next(iter(roots)) + "/"
        files = []
        seen = set()
        for row in entries:
            parts = PurePosixPath(row.filename).parts
            if row.filename.startswith("/") or ".." in parts or "\\" in row.filename or row.filename in seen:
                raise ValueError("Unsafe or duplicate Git archive path")
            seen.add(row.filename)
            if not row.is_dir():
                files.append((row.filename[len(root):], archive.read(row)))
        return files, root

def license_details(files: list[tuple[str, bytes]]) -> dict:
    notices = [(name, data) for name, data in files if PurePosixPath(name).name.lower().startswith(("license", "licence", "copying")) and data.strip()]
    texts = "\n".join(data.decode("utf-8", "replace") for _, data in notices)
    display = "License included" if notices else "No License"
    if "Permission is hereby granted, free of charge" in texts:
        display = "MIT"
    elif "GNU LESSER GENERAL PUBLIC LICENSE" in texts:
        display = "LGPL"
    elif "GNU GENERAL PUBLIC LICENSE" in texts:
        display = "GPL"
    elif "Apache License" in texts and "Version 2.0" in texts:
        display = "Apache-2.0"
    elif "Mozilla Public License" in texts:
        display = "MPL-2.0"
    return {"license_display": display, "license_files": [name for name, _ in notices], "license_status": "document_preserved" if notices else "no_license_document"}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--snapshot", default=read(ROOT / "data/api/v1/current.json")["snapshot_id"])
    parser.add_argument("--phase", choices=("git", "phar", "swh-request", "swh"), required=True)
    parser.add_argument("--php", default="php")
    args = parser.parse_args()
    folder = ROOT / "data/snapshots" / args.snapshot
    manifest = folder / "virion-source-downloads.json"
    states = read(manifest) if manifest.exists() else {}
    downloads = read(folder / "downloads-virions.json")
    plan = read(args.plan)
    for key, job in plan.items():
        current = states.get(key, {})
        if current.get("status") == "uploaded" or current.get("status") == "downloaded":
            continue
        if args.phase.startswith("swh"):
            if not job.get("swh_revision"):
                continue
            revision = swh_request("revision/" + job["source_commit"] + "/")
            if revision["id"] != job["source_commit"] or revision.get("synthetic"):
                raise ValueError("Software Heritage revision does not identify the requested Git commit")
            tree = revision["directory"]
            vault = "vault/flat/swh:1:dir:" + tree + "/"
            progress = swh_request(vault, method="POST" if args.phase == "swh-request" else "GET")
            progress_path = ROOT / "archive/virion-recovery/swh-vault" / (tree + ".json")
            progress_path.parent.mkdir(parents=True, exist_ok=True)
            write_json(progress_path, {"revision": revision, "vault": progress})
            print(key, "Software Heritage Vault", progress["status"], flush=True)
            if args.phase == "swh-request" or progress["status"] != "done":
                continue
            tar_path = progress_path.with_suffix(".tar.gz")
            if not tar_path.exists():
                tar_path.write_bytes(swh_request(vault + "raw/", raw=True))
            verified = read_verified_tree(tar_path, tree)
            path = progress_path.with_suffix(".zip")
            root = job["source_repo"].split("/")[1] + "-" + job["source_commit"] + "/"
            with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
                for name, data, mode in sorted(verified):
                    entry = zipfile.ZipInfo(root + name, date_time=(1980, 1, 1, 0, 0, 0))
                    entry.create_system = 3
                    entry.compress_type = zipfile.ZIP_DEFLATED
                    entry.external_attr = mode << 16
                    archive.writestr(entry, data)
            files, _ = verify_zip(path, job["source_commit"])
            if dict(files) != {name: data for name, data, _ in verified}:
                raise ValueError("ZIP does not preserve the verified Git blobs")
            data = path.read_bytes()
            states[key] = {**job, **license_details(files), "status": "downloaded", "method": "git_archive", "provider": "Software Heritage", "verified_revision": job["source_commit"], "complete_git_snapshot": True, "git_tree_sha": tree, "git_tree_verified": True, "source_repository_used": job["source_repo"], "source_archive_url": "https://archive.softwareheritage.org/api/1/" + vault + "raw/", "archive_root": root, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "file_count": len(files), "storage_path": path.relative_to(ROOT).as_posix()}
        elif args.phase == "git":
            if job.get("swh_revision"):
                continue
            commit = job.get("source_commit")
            if not commit:
                continue
            candidates = list(dict.fromkeys([job["source_repo"], *job.get("candidates", [])]))
            checks = []
            for repo in candidates:
                if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
                    raise ValueError("Invalid source repository")
                path = ROOT / "archive/virion-recovery/git-zips" / (repo.replace("/", "-") + "-" + commit + ".zip")
                url = "https://codeload.github.com/" + repo + "/zip/" + commit
                try:
                    data = download(url, path)
                    files, root = verify_zip(path, commit)
                    states[key] = {**job, **license_details(files), "status": "downloaded", "method": "git_archive", "label": "Archived source" if job["source_scope"] == "original_poggit_build" else "Rebuild source", "verified_revision": commit, "complete_git_snapshot": True, "source_repository_used": repo, "source_archive_url": url, "archive_root": root, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "file_count": len(files), "storage_path": path.relative_to(ROOT).as_posix(), "candidate_checks": checks + [{"repo": repo, "status": 200}]}
                    print(key, "Git ZIP verified", commit[:12], repo, flush=True)
                    break
                except HTTPError as error:
                    checks.append({"repo": repo, "status": error.code})
                    if error.code in {403, 429}:
                        raise RuntimeError("Source provider access or rate limit; stop and resume later") from error
                    if error.code not in {404, 410, 422}:
                        raise
                    time.sleep(.25)
            else:
                states[key] = {**job, "status": "source_unavailable", "candidate_checks": checks}
                print(key, "Git source unavailable", flush=True)
        else:
            original = downloads[key]
            if original.get("status") != "uploaded":
                continue
            path = ROOT / "archive/virion-recovery/originals" / (str(original["remote_asset_id"]) + ".phar")
            download(original["remote_url"], path, original)
            files = recover_files(path, args.php)
            provenance = {"schema_version": 1, "kind": "virion_distribution_source", "method": "unphar", "virion_id": key, "name": job["name"], "catalog_version": job.get("catalog_version"), "original_repo": job["source_repo"], "build_commit_from_phar": job.get("source_commit"), "complete_git_snapshot": False, "original_phar_url": original["remote_url"], "original_phar_sha256": original["sha256"], "original_phar_bytes": original["bytes"], **license_details(files), "files": [{"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()} for name, data in files]}
            target = ROOT / "archive/virion-recovery/phar-sources" / (hashlib.sha256(key.encode()).hexdigest()[:16] + ".zip")
            make_zip(target, files, provenance)
            data = target.read_bytes()
            states[key] = {**job, **license_details(files), "status": "downloaded", "method": "unphar", "label": "Source from PHAR", "complete_git_snapshot": False, "original_phar_url": original["remote_url"], "original_phar_sha256": original["sha256"], "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "file_count": len(files), "storage_path": target.relative_to(ROOT).as_posix(), "git_source_attempts": current.get("candidate_checks", [])}
            print(key, "PHAR source ZIP verified", flush=True)
        write_json(manifest, states)
        time.sleep(.25)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
