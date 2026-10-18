#!/usr/bin/env python3
"""Rebuild missing virions from preserved, pinned source ZIPs using trusted VirionTools."""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path, PurePosixPath
import re
import subprocess
import uuid

import yaml

from recover_virion_sources import ROOT, read, download, verify_zip, recover_files, write_json

BUILDER_COMMIT = "d3bcaa5bbe5344996fb06b6192ca37be980dd7eb"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compiler", type=Path, required=True, help="VirionTools checkout at the pinned compiler revision")
    parser.add_argument("--php", default="php")
    parser.add_argument("--key-file", type=Path, required=True)
    args = parser.parse_args()
    compiler = args.compiler.resolve()
    head = subprocess.check_output(["git", "-C", str(compiler), "rev-parse", "HEAD"], text=True).strip()
    if head != BUILDER_COMMIT or subprocess.check_output(["git", "-C", str(compiler), "status", "--porcelain"], text=True).strip():
        raise ValueError("Use the unmodified pinned VirionTools compiler checkout")
    snapshot = ROOT / "data/snapshots" / read(ROOT / "data/api/v1/current.json")["snapshot_id"]
    sources = read(snapshot / "virion-source-downloads.json")
    catalog = {row["id"]: row for row in read(snapshot / "virions.json")}
    manifest = snapshot / "rebuilt-virions.json"
    states = read(manifest) if manifest.exists() else {}
    downloads = read(snapshot / "downloads-virions.json")
    for key in args.key_file.read_text(encoding="utf-8").splitlines():
        if not key.strip() or key.startswith("#"):
            continue
        if downloads[key].get("status") == "uploaded" or downloads[key].get("rebuilt_artifact", {}).get("status") == "uploaded":
            continue
        source = sources[key]
        if source.get("status") not in {"downloaded", "uploaded"} or source.get("method") != "git_archive":
            raise ValueError("Build requires a preserved, locally available Git source ZIP: " + key)
        if source.get("storage_path"):
            zip_path = ROOT / source["storage_path"]
        else:
            zip_path = ROOT / "archive/virion-recovery/published-sources" / (source["sha256"] + ".zip")
            download(source["remote_url"], zip_path, source)
        if hashlib.sha256(zip_path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError("Source ZIP checksum mismatch")
        files, _ = verify_zip(zip_path, source["source_commit"])
        matches = []
        for name, content in files:
            if PurePosixPath(name).name == "virion.yml":
                metadata = yaml.safe_load(content)
                if isinstance(metadata, dict) and metadata.get("name", "").lower() == catalog[key]["name"].lower():
                    matches.append((name, metadata))
        if len(matches) != 1:
            raise ValueError("A unique matching virion manifest is required: " + key)
        name, metadata = matches[0]
        adjustments = []
        if "api" not in metadata:
            adjustments.append({"file": name, "change": "Add api: [] in the staging manifest because upstream omitted the field required by VirionTools. No API compatibility is inferred; the source ZIP is unchanged."})
            files = [(path, content.rstrip() + b"\napi: []\n" if path == name else content) for path, content in files]
            metadata["api"] = []
        if catalog[key]["version"] and str(metadata["version"]) != catalog[key]["version"]:
            raise ValueError("Source manifest version differs from the catalog: " + key)
        if metadata["antigen"] != catalog[key]["namespace"]:
            raise ValueError("Source namespace differs from the catalog: " + key)
        prefix = str(PurePosixPath(name).parent)
        prefix = "" if prefix == "." else prefix + "/"
        output = ROOT / "archive/virion-recovery/builds" / (re.sub(r"[^a-zA-Z0-9._-]", "-", key) + "-" + uuid.uuid4().hex[:8])
        stage = output / "source"
        stage.mkdir(parents=True)
        staged = {}
        for path, content in files:
            if not path.startswith(prefix):
                continue
            relative = path[len(prefix):]
            # No symlink extraction: ZIP entries are written as ordinary files.
            if any(part.endswith((" ", ".")) or ":" in part for part in PurePosixPath(relative).parts):
                raise ValueError("Unsafe Windows staging path")
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            staged[relative] = content
        # A monorepo root notice applies to the project and must remain included.
        for path in source["license_files"]:
            if "/" not in path and path not in staged:
                content = dict(files)[path]
                (stage / path).write_bytes(content)
                staged[path] = content
        if any(name in staged for name in ["virion.php", "virion_stub.php"]):
            raise ValueError("Source collides with compiler helper filenames")
        phar = output / "virion.phar"
        build_plan = output / "build-plan.json"
        write_json(build_plan, [{"id": key, "staging_dir": str(stage), "phar_path": str(phar)}])
        subprocess.run([args.php, "-d", "phar.readonly=0", str(ROOT / "scripts/build_virion.php"), str(build_plan), str(compiler)], check=True)
        packaged = dict(recover_files(phar, args.php))
        preserved = 0
        for name, content in staged.items():
            excluded = "tests" in PurePosixPath(name).parts or any(part.startswith(".") for part in PurePosixPath(name).parts)
            if not excluded:
                if packaged.get(name) != content:
                    raise ValueError("Compiler changed or omitted a source file: " + name)
                preserved += 1
        digest = hashlib.sha256(phar.read_bytes()).hexdigest()
        states[key] = {
            "status": "downloaded", "label": "Rebuilt PHAR", "method": "viriontools_rebuild",
            "original_poggit_artifact": False, "source_repo": source["source_repository_used"],
            "original_repo": source["source_repo"], "source_commit": source["source_commit"],
            "source_scope": source["source_scope"], "source_zip_sha256": source["sha256"],
            "source_project_path": prefix.rstrip("/"), "virion_version": str(metadata["version"]),
            "antigen": metadata["antigen"], "license_spdx": source["license_display"],
            "license_files": source["license_files"], "license_status": source["license_status"],
            "builder": "VirionTools", "builder_version": "4.0.1", "builder_repo": "ifera-mc/VirionTools",
            "builder_commit": BUILDER_COMMIT, "dependencies": metadata.get("libs", []),
            "adjustments": adjustments, "preserved_source_files": preserved, "file_count": len(packaged),
            "bytes": phar.stat().st_size, "sha256": digest, "storage_path": phar.relative_to(ROOT).as_posix(),
            "validation": "Reopened PHAR; manifest metadata and signature checked; included source files compared byte for byte. No target PHP or stub executed."
        }
        write_json(manifest, states)
        print(key, "BUILT AND VERIFIED", digest, flush=True)


if __name__ == "__main__":
    main()
