#!/usr/bin/env python3
"""Import documents from checksum-verified local virion ZIPs/PHARs; no network or target code execution."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile
from concurrent.futures import ThreadPoolExecutor

import yaml
from recover_phar_sources import recover_files

ROOT = Path(__file__).resolve().parents[1]
sha = lambda data: hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def document(path, data):
    content = data.decode("utf-8", "replace")
    return {"path": path, "content": content, "bytes": len(data), "sha256": sha(data), "text_sha256": sha(content.encode("utf-8"))}


def mapping(data):
    value = yaml.safe_load(data)
    return value if isinstance(value, dict) else {}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--php", default="php")
    args = parser.parse_args()
    pointer = read(ROOT / "data/api/v1/current.json")
    folder = ROOT / "data/snapshots" / pointer["snapshot_id"]
    items = read(folder / "virions.json")
    sources = read(folder / "virion-source-downloads.json")
    downloads = read(folder / "downloads-virions.json")
    mirror = read(folder / "file-mirror.json")["resources"]

    def local(artifact):
        path = ROOT / "public" / mirror[artifact["remote_url"]]["path"].lstrip("/")
        data = path.read_bytes()
        if sha(data) != artifact["sha256"] or len(data) != artifact["bytes"]:
            raise ValueError("Artifact checksum mismatch: " + str(path))
        return path

    def import_item(item):
        key = item["id"]
        source = sources.get(key)
        download = downloads.get(key, {})
        artifact = download if download.get("status") == "uploaded" else download.get("rebuilt_artifact")
        record = {"id": key, "documents": {}, "licenses": [], "manifest": {}, "composer": {}, "poggit_libraries": [], "source_images": {}}
        phar_files = {}
        if artifact and artifact.get("status") == "uploaded":
            path = local(artifact)
            phar_files = dict(recover_files(path, args.php))
            record["phar_sha256"] = artifact["sha256"]
            if "virion.yml" in phar_files:
                record["manifest"] = mapping(phar_files["virion.yml"])
                record["manifest_document"] = document("virion.yml", phar_files["virion.yml"])
                record["manifest_origin"] = "original_phar" if artifact is download else "rebuilt_phar"
        if not source:
            return key, record
        path = local(source)
        record["source_zip_sha256"] = source["sha256"]
        root = source.get("archive_root", "")
        with zipfile.ZipFile(path) as archive:
            files = {}
            for entry in archive.infolist():
                name = entry.filename
                if entry.is_dir():
                    continue
                if ".." in PurePosixPath(name).parts or name.startswith("/") or "\\" in name or entry.file_size > 8 * 1024 * 1024:
                    raise ValueError("Unsafe source ZIP entry: " + name)
                if root and not name.startswith(root):
                    raise ValueError("Source entry is outside the recorded archive root")
                relative = name[len(root):] if root else name
                files[relative] = archive.read(entry)
        if source["method"] == "unphar":
            files = {name[len("distribution/"):]: data for name, data in files.items() if name.startswith("distribution/")}
        scope = source.get("source_project_path", "").strip("/")
        candidates = []
        for name, data in files.items():
            if PurePosixPath(name).name.lower() != "virion.yml":
                continue
            manifest = mapping(data)
            if str(manifest.get("name", "")).lower() == item["name"].lower() and str(manifest.get("antigen", "")) == item["namespace"]:
                candidates.append((name, manifest))
        if not scope and len(candidates) == 1:
            parent = str(PurePosixPath(candidates[0][0]).parent)
            scope = "" if parent == "." else parent
        prefix = scope + "/" if scope else ""
        record["source_project_path"] = scope
        if len(candidates) == 1:
            name, manifest = candidates[0]
            record["source_manifest"] = manifest
            if not record["manifest"]:
                record["manifest"] = manifest
                record["manifest_document"] = document(name, files[name])
                record["manifest_origin"] = "source_zip"
        for kind, starts in [("readme", ("readme",)), ("changelog", ("changelog", "changes", "history"))]:
            eligible = [(name, data) for name, data in files.items() if data.strip() and PurePosixPath(name).name.lower().startswith(starts) and PurePosixPath(name).suffix.lower() in {".md", ".markdown", ".txt", ".rst", ""}]
            scoped = [(name, data) for name, data in eligible if str(PurePosixPath(name).parent) == (scope or ".")]
            chosen = scoped or [(name, data) for name, data in eligible if "/" not in name]
            if chosen:
                name, data = sorted(chosen, key=lambda pair: (PurePosixPath(pair[0]).suffix.lower() != ".md", pair[0]))[0]
                record["documents"][kind] = {**document(name, data), "scope": "project" if scoped else "repository"}
        for name in source.get("license_files", []):
            if name in files and files[name].strip():
                record["licenses"].append(document(name, files[name]))
        composer_name = prefix + "composer.json" if prefix + "composer.json" in files else "composer.json"
        if composer_name in files:
            try:
                record["composer"] = json.loads(files[composer_name])
                record["documents"]["composer"] = document(composer_name, files[composer_name])
            except (ValueError, UnicodeError):
                record["composer_parse_error"] = True
        if ".poggit.yml" in files:
            config = mapping(files[".poggit.yml"])
            projects = config.get("projects", {}) or {}
            project = next((value for name, value in projects.items() if name.lower() == item["project"].lower()), {}) or {}
            record["poggit_libraries"] = project.get("libs", []) or []
            record["documents"]["poggit"] = document(".poggit.yml", files[".poggit.yml"])
        # Only small repository images are candidates for local display conversion.
        for name, data in files.items():
            if PurePosixPath(name).suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"} and len(data) <= 512 * 1024:
                cache = ROOT / "archive/virion-details/images" / sha(data)
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_bytes(data)
                record["source_images"][name] = {"sha256": sha(data), "bytes": len(data)}
        return key, record

    with ThreadPoolExecutor(max_workers=4) as pool:
        records = dict(pool.map(import_item, items))
    report = {"entries": len(records), "with_readme": sum("readme" in row["documents"] for row in records.values()), "with_changelog": sum("changelog" in row["documents"] for row in records.values()), "with_license": sum(bool(row["licenses"]) for row in records.values()), "with_manifest": sum(bool(row["manifest"]) for row in records.values()), "without_source": sum(not row.get("source_zip_sha256") for row in records.values())}
    capture = {"schema_version": 1, "snapshot_id": pointer["snapshot_id"], "records": records, "report": report}
    target = ROOT / "src/data/virion-details.json.gz"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(gzip.compress(json.dumps(capture, ensure_ascii=False, separators=(",", ":"), default=str).encode(), mtime=0))
    (folder / "virion-details-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
