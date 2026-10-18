#!/usr/bin/env python3
"""Recover exact Git source trees from Software Heritage Vault and verify their Git tree IDs."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import tarfile
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import zipfile

from poggit_archive import ROOT, SNAPSHOTS, write_json

API = "https://archive.softwareheritage.org/api/1/"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def request(path: str, method: str = "GET", raw: bool = False):
    headers = {"User-Agent": "PoggitArchiveRecovery/1.0 (+https://poggit-archive.github.io/)"}
    if not raw:
        headers["Accept"] = "application/json"
    try:
        with urlopen(Request(API + path, method=method, headers=headers), timeout=60) as response:
            data = response.read(100 * 1024 * 1024 + 1)
            if len(data) > 100 * 1024 * 1024:
                raise ValueError("Software Heritage response exceeds the size limit")
            return data if raw else json.loads(data)
    except HTTPError as error:
        if error.code in {403, 429}:
            raise RuntimeError("Software Heritage access or rate limit; stop this provider") from error
        raise


def git_hash(kind: str, data: bytes) -> str:
    return hashlib.sha1(kind.encode() + b" " + str(len(data)).encode() + b"\0" + data).hexdigest()


def read_verified_tree(path: Path, expected: str) -> list[tuple[str, bytes, int]]:
    files = []
    directories = {""}
    seen = set()
    total = 0
    prefix = "swh:1:dir:" + expected
    with tarfile.open(path, "r:gz") as archive:
        for entry in archive:
            if entry.name == prefix and entry.isdir():
                continue
            if not entry.name.startswith(prefix + "/"):
                raise ValueError("Vault archive has an unexpected root")
            name = entry.name[len(prefix) + 1:]
            parts = PurePosixPath(name).parts
            if not name or name.startswith("/") or ".." in parts or "\\" in name or name in seen:
                raise ValueError("Invalid or duplicate Vault path")
            seen.add(name)
            for index in range(1, len(parts)):
                directories.add("/".join(parts[:index]))
            if entry.isdir():
                directories.add(name)
                continue
            if entry.issym():
                content = entry.linkname.encode("utf-8")
                mode = 0o120000
            elif entry.isfile():
                total += entry.size
                if total > 100 * 1024 * 1024 or len(files) >= 20000:
                    raise ValueError("Vault tree exceeds the recovery limit")
                stream = archive.extractfile(entry)
                assert stream is not None
                content = stream.read()
                mode = 0o100755 if entry.mode & 0o111 else 0o100644
            else:
                raise ValueError("Unsupported Vault entry; cannot claim a complete Git tree")
            files.append((name, content, mode))
    children = {directory: [] for directory in directories}
    for name, content, mode in files:
        parent, _, leaf = name.rpartition("/")
        children[parent].append((leaf, mode, git_hash("blob", content)))
    computed = {}
    for directory in sorted(directories, key=lambda name: name.count("/") + bool(name), reverse=True):
        entries = children[directory]
        entries.sort(key=lambda row: (row[0] + ("/" if row[1] == 0o40000 else "")).encode("utf-8"))
        body = b"".join(f"{mode:o} {name}".encode("utf-8") + b"\0" + bytes.fromhex(target) for name, mode, target in entries)
        computed[directory] = git_hash("tree", body)
        if directory:
            parent, _, leaf = directory.rpartition("/")
            children[parent].append((leaf, 0o40000, computed[directory]))
    if computed[""] != expected:
        raise ValueError(f"Recovered Git tree differs: {computed['']} != {expected}")
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision-file", type=Path, required=True, help="JSON of exact revision API results keyed by source key")
    parser.add_argument("--phase", choices=("request", "recover"), required=True)
    args = parser.parse_args()
    revisions = read_json(args.revision_file)
    pointer = read_json(ROOT / "data/api/v1/current.json")
    folder = SNAPSHOTS / pointer["snapshot_id"]
    progress_path = ROOT / "archive/swh/vault-progress.json"
    progress_path.parent.mkdir(parents=True, exist_ok=True)
    progress = read_json(progress_path) if progress_path.exists() else {}
    states = read_json(folder / "source-downloads.json")
    for key, result in revisions.items():
        if result["status"] != 200:
            continue
        revision = result["revision"]
        commit = key.split("@", 1)[1]
        if revision["id"] != commit or revision.get("synthetic"):
            raise ValueError("Software Heritage revision does not match the original Git commit")
        tree = revision["directory"]
        vault_path = "vault/flat/swh:1:dir:" + tree + "/"
        if args.phase == "request":
            if tree not in progress:
                progress[tree] = request(vault_path, method="POST")
                write_json(progress_path, progress)
            print(states[key]["repo_name"], commit[:8], "Vault", progress[tree]["status"], flush=True)
            time.sleep(.5)
            continue
        if states[key].get("recovery", {}).get("method") == "software_heritage_verified_tree":
            continue
        if tree not in progress:
            raise ValueError("Request Vault cooking before recovery")
        if progress[tree]["status"] != "done":
            progress[tree] = request(vault_path)
            write_json(progress_path, progress)
        if progress[tree]["status"] != "done":
            print(states[key]["repo_name"], commit[:8], "Vault still", progress[tree]["status"], flush=True)
            continue
        tar_path = ROOT / "archive/swh/vault" / (tree + ".tar.gz")
        tar_path.parent.mkdir(parents=True, exist_ok=True)
        if not tar_path.exists():
            tar_path.write_bytes(request(vault_path + "raw/", raw=True))
        files = read_verified_tree(tar_path, tree)
        state = states[key]
        target = ROOT / "archive/sources" / str(state["repo_id"]) / (commit + ".zip")
        if target.exists():
            raise ValueError("An existing source ZIP must be reviewed before replacement: " + str(target))
        target.parent.mkdir(parents=True, exist_ok=True)
        prefix = state["repo_name"].split("/")[1] + "-" + commit + "/"
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, content, mode in sorted(files):
                entry = zipfile.ZipInfo(prefix + name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = mode << 16
                archive.writestr(entry, content)
        with zipfile.ZipFile(target) as archive:
            if archive.testzip() is not None:
                raise ValueError("Source ZIP failed its CRC check")
            for name, content, _ in files:
                if archive.read(prefix + name) != content:
                    raise ValueError("Source ZIP changed a Git blob")
        data = target.read_bytes()
        state.update({
            "status": "downloaded", "provider": "Software Heritage", "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "storage_path": target.relative_to(ROOT).as_posix(),
            "final_url": API + vault_path + "raw/",
            "recovery": {"method": "software_heritage_verified_tree", "verified_commit": commit,
                "tree_sha": tree, "swh_revision": "swh:1:rev:" + commit, "swh_directory": "swh:1:dir:" + tree,
                "revision_url": API + "revision/" + commit + "/", "vault_url": API + vault_path + "raw/",
                "git_tree_verified": True, "git_blobs_verified": True, "file_count": len(files),
                "container": "Deterministic ZIP reconstructed from a Software Heritage Vault tree; Git file bytes and modes verified.",
                "license_files": [name for name, _, _ in files if PurePosixPath(name).name.lower().startswith(("license", "licence", "copying"))]},
        })
        state.pop("code", None)
        state.pop("error", None)
        write_json(folder / "source-downloads.json", states)
        print(state["repo_name"], commit[:8], "complete Git tree verified:", len(files), "files", flush=True)
        time.sleep(.5)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
