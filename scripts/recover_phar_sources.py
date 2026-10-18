#!/usr/bin/env python3
"""Recover unchanged distribution files from verified PHARs into documented source ZIPs."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import zipfile

from poggit_archive import ROOT, SNAPSHOTS, PoliteHTTP, safe_slug, write_json


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def recover_files(path: Path, php: str) -> list[tuple[str, bytes]]:
    result = subprocess.run(
        [php, "-d", "phar.readonly=1", "-d", "memory_limit=256M", str(ROOT / "scripts/read_phar.php"), str(path)],
        capture_output=True, check=True, timeout=60,
    )
    records = json.loads(result.stdout)["files"]
    files = []
    seen = set()
    for row in records:
        name = row["path"]
        relative = PurePosixPath(name)
        if relative.is_absolute() or ".." in relative.parts or "\\" in name or ":" in name or name in seen:
            raise ValueError(f"Invalid or duplicate distribution path: {name}")
        data = base64.b64decode(row["content_base64"], validate=True)
        if len(data) != row["bytes"] or digest(data) != row["sha256"]:
            raise ValueError(f"PHAR entry checksum mismatch: {name}")
        files.append((name, data))
        seen.add(name)
    if not files or not any(name.lower().endswith(".php") for name, _ in files):
        raise ValueError("The PHAR does not contain recoverable PHP source files")
    return files


def make_zip(path: Path, files: list[tuple[str, bytes]], provenance: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    entries = [("distribution/" + name, data) for name, data in files]
    entries.append(("RECOVERY.json", (json.dumps(provenance, ensure_ascii=False, indent=2) + "\n").encode("utf-8")))
    entries.append(("README.txt", (
        "Source recovered from an original archived PHAR.\n\n"
        "distribution/ contains every regular file from the PHAR, byte for byte.\n"
        "The plugin and its PHAR stub were not executed.\n"
        "RECOVERY.json records the original PHAR SHA-256, release, source attribution, license and per-file hashes.\n\n"
        "This is a preserved distribution tree. Repository files excluded by the build are unavailable here;\n"
        "build-time version changes and bundled or shaded libraries may be present.\n"
        "The recorded build commit comes from Poggit metadata and does not establish a complete Git source snapshot.\n"
    ).encode("utf-8")))
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(entries):
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, data)
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise ValueError("Recovered ZIP failed its CRC check")
        for name, data in files:
            if archive.read("distribution/" + name) != data:
                raise ValueError(f"Recovered ZIP changed a distribution file: {name}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot")
    parser.add_argument("--release-id", type=int, action="append", default=[])
    parser.add_argument("--php", default="php")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    snapshot = args.snapshot or read_json(ROOT / "data/api/v1/current.json")["snapshot_id"]
    folder = SNAPSHOTS / snapshot
    releases = read_json(folder / "releases.json")
    source_states = read_json(folder / "source-downloads.json")
    phars = read_json(folder / "downloads-plugins.json")
    manifest = folder / "recovered-sources.json"
    states = read_json(manifest) if manifest.exists() else {}
    selected = [row for row in releases if source_states.get(f"{row['repo_id']}@{row['build_commit'].lower()}", {}).get("status") != "uploaded"]
    if args.release_id:
        selected = [row for row in selected if row["id"] in args.release_id]
    if args.limit:
        selected = selected[:args.limit]
    client = PoliteHTTP(2)
    for index, row in enumerate(selected, 1):
        key = str(row["id"])
        if states.get(key, {}).get("status") == "uploaded":
            print(f"[{index}/{len(selected)}] {row['name']} {row['version']}: already uploaded", flush=True)
            continue
        original = phars[key]
        if original.get("status") != "uploaded" or not original.get("sha256"):
            raise ValueError(f"Original PHAR is not verified: {key}")
        url = str(original["remote_url"])
        if not url.startswith("https://github.com/poggit-archive/artifacts/releases/download/"):
            raise ValueError(f"Unexpected original PHAR URL: {key}")
        target = ROOT / "archive/recovered-sources" / key
        target.mkdir(parents=True, exist_ok=True)
        phar = target / "original.phar"
        if not phar.exists():
            with client.open(url) as response:
                data = response.read(100 * 1024 * 1024 + 1)
            if len(data) != original["bytes"] or digest(data) != original["sha256"]:
                raise ValueError(f"Original PHAR checksum or size mismatch: {key}")
            phar.write_bytes(data)
        data = phar.read_bytes()
        if len(data) != original["bytes"] or digest(data) != original["sha256"]:
            raise ValueError(f"Local PHAR checksum or size mismatch: {key}")
        files = recover_files(phar, args.php)
        file_records = [{"path": name, "bytes": len(content), "sha256": digest(content)} for name, content in files]
        declared = str(row.get("license") or "").strip()
        source_key = f"{row['repo_id']}@{row['build_commit'].lower()}"
        no_license = declared.lower() in {"", "none", "unknown"} or source_states[source_key].get("license_display") == "No License"
        provenance = {
            "schema_version": 1, "method": "unphar", "snapshot_id": snapshot,
            "release_id": row["id"], "name": row["name"], "version": row["version"],
            "poggit_url": row["html_url"], "original_repo": row["repo_name"],
            "build_commit_from_release_metadata": row["build_commit"], "complete_git_snapshot": False,
            "original_phar_url": url, "original_phar_sha256": original["sha256"], "original_phar_bytes": original["bytes"],
            "declared_license": row.get("license"), "license_display": "No License" if no_license else declared,
            "files": file_records,
        }
        output = target / f"{safe_slug(row['name'])}-{safe_slug(row['version'])}-source-from-phar.zip"
        make_zip(output, files, provenance)
        content = output.read_bytes()
        states[key] = {
            "status": "recovered_local", "method": "unphar", "label": "Source from PHAR",
            "name": row["name"], "version": row["version"], "release_id": row["id"],
            "original_repo": row["repo_name"], "build_commit_from_release_metadata": row["build_commit"],
            "complete_git_snapshot": False, "original_phar_url": url, "original_phar_sha256": original["sha256"],
            "sha256": digest(content), "bytes": len(content), "file_count": len(files),
            "php_files": sum(name.lower().endswith(".php") for name, _ in files),
            "declared_license": row.get("license"), "license_display": provenance["license_display"],
            "storage_path": output.relative_to(ROOT).as_posix(),
        }
        write_json(manifest, states)
        print(f"[{index}/{len(selected)}] {row['name']} {row['version']}: {states[key]['php_files']} PHP files; ZIP verified", flush=True)
    print(f"Processed {len(selected)} release distributions. Manifest: {manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
