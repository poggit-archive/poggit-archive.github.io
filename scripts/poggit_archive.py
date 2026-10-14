#!/usr/bin/env python3
"""Polite, resumable metadata and artifact archiver for Poggit."""

from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data"
SNAPSHOTS = DATA_ROOT / "snapshots"
CURRENT_FILE = DATA_ROOT / "api" / "v1" / "current.json"
POGGIT = "https://poggit.pmmp.io"
PLUGIN_INDEX = f"{POGGIT}/releases.json"
VIRION_INDEX = f"{POGGIT}/v?top=300"
USER_AGENT = "PoggitArchive/0.1 (+https://github.com/poggit-archive; archival client)"
DEFAULT_DELAY = 2.0


class RateLimited(RuntimeError):
    """Raised when Poggit signals that the client must stop requesting data."""


class PoliteHTTP:
    def __init__(self, delay: float) -> None:
        self.delay = max(0.0, delay)
        self.last_request = 0.0

    def _pace(self) -> None:
        wait = self.delay - (time.monotonic() - self.last_request)
        if wait > 0:
            time.sleep(wait)
        self.last_request = time.monotonic()

    def open(self, url: str, *, headers: dict[str, str] | None = None):
        request_headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
        if headers:
            request_headers.update(headers)
        for attempt in range(4):
            self._pace()
            try:
                return urlopen(Request(url, headers=request_headers), timeout=90)
            except HTTPError as exc:
                retry_after = exc.headers.get("Retry-After")
                if exc.code in {403, 429}:
                    wait = retry_after or "unspecified"
                    origin = urlparse(url).hostname or "origin"
                    raise RateLimited(f"{origin} returned HTTP {exc.code}; Retry-After={wait}. Stopping.") from exc
                if 500 <= exc.code < 600 and attempt < 3:
                    delay = min(60, 5 * (2 ** attempt))
                    print(f"{urlparse(url).hostname} HTTP {exc.code}; backing off for {delay}s", file=sys.stderr)
                    time.sleep(delay)
                    continue
                raise
            except URLError:
                if attempt >= 3:
                    raise
                delay = min(60, 5 * (2 ** attempt))
                print(f"Network error; backing off for {delay}s", file=sys.stderr)
                time.sleep(delay)
        raise RuntimeError("Request retry loop ended unexpectedly")


class VirionListParser(HTMLParser):
    """Extract only visible entries from Poggit's public top-N virion page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.entries: list[dict] = []
        self.current: dict | None = None
        self.anchor: dict | None = None
        self.paragraph_class = ""
        self.paragraph_parts: list[str] = []
        self.time_value: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = dict(attrs)
        classes = (attrs_map.get("class") or "").split()
        if tag == "li" and self.current is None:
            self.current = {"links": [], "paragraphs": [], "updated_at": None}
        elif self.current is not None and tag == "a":
            self.anchor = {"href": attrs_map.get("href") or "", "text": []}
        elif self.current is not None and tag == "p":
            self.paragraph_class = "remark" if "remark" in classes else ""
            self.paragraph_parts = []
        elif self.current is not None and tag == "span" and "time" in classes:
            self.current["updated_at"] = attrs_map.get("data-timestamp")

    def handle_data(self, data: str) -> None:
        if self.anchor is not None:
            self.anchor["text"].append(data)
        if self.current is not None and self.paragraph_class:
            self.paragraph_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self.current is None:
            return
        if tag == "a" and self.anchor is not None:
            self.anchor["text"] = " ".join(" ".join(self.anchor["text"]).split())
            self.current["links"].append(self.anchor)
            self.anchor = None
        elif tag == "p":
            paragraph = " ".join(" ".join(self.paragraph_parts).split())
            if paragraph:
                self.current["paragraphs"].append(paragraph)
            self.paragraph_class = ""
            self.paragraph_parts = []
        elif tag == "li":
            self._finish_entry()

    def _finish_entry(self) -> None:
        assert self.current is not None
        links = self.current["links"]
        ci_link = next((link for link in links if link["href"].startswith("/ci/")), None)
        github_link = next((link for link in links if "github.com/" in link["href"]), None)
        parts = (ci_link["href"].split("/")[2:] if ci_link else [])
        paragraphs = self.current["paragraphs"]
        usage_text = paragraphs[0] if paragraphs else ""
        last_text = paragraphs[1] if len(paragraphs) > 1 else ""
        usage = re.search(r"Used by\s+(\d+)\s+project", usage_text, re.IGNORECASE)
        version_match = re.search(r"\(([^()]*)\)\s*$", last_text)
        version = version_match.group(1).strip() if version_match else None
        if version in {"", "null"}:
            version = None
        updated_hash_match = re.search(r"Last updated:\s*&?([0-9a-f]{4,12})", last_text, re.IGNORECASE)
        if ci_link:
            owner = unquote(parts[0]) if len(parts) > 0 else ""
            repo = unquote(parts[1]) if len(parts) > 1 else ""
            project = unquote("/".join(parts[2:])) if len(parts) > 2 else "~"
            name = ci_link["text"]
            source_url = github_link["href"] if github_link else None
            version_for_url = version or "*"
            download_url = (
                f"{POGGIT}/v.dl/{quote(owner, safe='')}/{quote(repo, safe='')}/"
                f"{quote(project, safe='')}/{quote(version_for_url, safe='')}?branch=%3Adefault"
            )
            self.entries.append({
                "type": "virion",
                "id": f"{owner.lower()}/{repo.lower()}/{project.lower()}@{version or 'latest'}",
                "name": name,
                "owner": owner,
                "repo": repo,
                "project": project,
                "version": version,
                "namespace": usage_text.split(", Used by", 1)[0].strip() if ", Used by" in usage_text else None,
                "used_by_projects": int(usage.group(1)) if usage else None,
                "last_updated": self.current.get("updated_at"),
                "last_build_short_id": updated_hash_match.group(1) if updated_hash_match else None,
                "poggit_ci_url": POGGIT + ci_link["href"],
                "source_url": source_url,
                "poggit_download_url": download_url,
                "artifact_status": "pending",
                "license": None,
                "license_status": "unverified",
            })
        self.current = None


def parse_virions(page: str) -> list[dict]:
    parser = VirionListParser()
    parser.feed(page)
    return parser.entries


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_poggit_url(url: str, kind: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "poggit.pmmp.io":
        return False
    if kind == "plugin":
        return re.fullmatch(r"/r/\d+(?:/[^/]*)?", parsed.path) is not None
    return parsed.path.startswith("/v.dl/")


def request_bytes(client: PoliteHTTP, url: str) -> bytes:
    with client.open(url) as response:
        return response.read()


def source_inventory(releases: list[dict]) -> list[dict]:
    grouped: dict[int | str, dict] = {}
    for release in releases:
        repo_id = release.get("repo_id")
        repo_name = release.get("repo_name")
        commit = release.get("build_commit")
        key = repo_id if repo_id is not None else (repo_name or "unknown")
        item = grouped.setdefault(key, {
            "repo_id": repo_id,
            "repo_name": repo_name,
            "source_url": f"https://github.com/{repo_name}" if repo_name else None,
            "commits": [],
            "project_ids": set(),
            "release_ids": set(),
            "source_status": "not_checked",
            "license_status": "review_required",
        })
        if commit and commit not in item["commits"]:
            item["commits"].append(commit)
        if release.get("project_id") is not None:
            item["project_ids"].add(release["project_id"])
        if release.get("id") is not None:
            item["release_ids"].add(release["id"])
    result = []
    for item in grouped.values():
        item["commits"].sort()
        item["project_ids"] = sorted(item["project_ids"])
        item["release_ids"] = sorted(item["release_ids"])
        result.append(item)
    return sorted(result, key=lambda item: ((item["repo_name"] or "").casefold(), item["repo_id"] or 0))


def snapshot(args: argparse.Namespace) -> int:
    client = PoliteHTTP(args.delay)
    print(f"Fetching approved release metadata from {PLUGIN_INDEX}")
    releases_bytes = request_bytes(client, PLUGIN_INDEX)
    releases = json.loads(releases_bytes.decode("utf-8"))
    if not isinstance(releases, list) or not releases:
        raise RuntimeError("Poggit release index was empty or not a JSON array; no snapshot written.")
    print(f"Fetched {len(releases)} plugin release rows; requesting top {args.top} virions")
    virion_url = f"{POGGIT}/v?top={args.top}"
    virions_bytes = request_bytes(client, virion_url)
    virions_html = virions_bytes.decode("utf-8", errors="replace")
    virions = parse_virions(virions_html)
    if not virions:
        raise RuntimeError("Could not parse any virions from Poggit's visible virion index; no snapshot written.")

    timestamp = datetime.now(timezone.utc).replace(microsecond=0)
    snapshot_id = timestamp.strftime("%Y-%m-%dT%H-%M-%SZ")
    snapshot_dir = SNAPSHOTS / snapshot_id
    snapshot_dir.mkdir(parents=True, exist_ok=False)
    (snapshot_dir / "releases.json").write_bytes(releases_bytes)
    write_json(snapshot_dir / "virions.json", virions)
    (snapshot_dir / "virions-top.html").write_bytes(virions_bytes)

    projects = {str(row.get("project_id")) for row in releases if row.get("project_id") is not None}
    artifacts = {
        row.get("artifact_url") for row in releases
        if isinstance(row.get("artifact_url"), str) and validate_poggit_url(row["artifact_url"], "plugin")
    }
    summary = {
        "schema_version": 1,
        "snapshot_id": snapshot_id,
        "captured_at": timestamp.isoformat().replace("+00:00", "Z"),
        "source": "Poggit public read-only endpoints",
        "source_endpoints": {"plugins": PLUGIN_INDEX, "virions": virion_url},
        "counts": {
            "plugin_release_rows": len(releases),
            "plugin_projects": len(projects),
            "plugin_artifact_urls": len(artifacts),
            "virion_entries": len(virions),
            "virion_entries_with_reported_version": sum(1 for row in virions if row["version"]),
        },
        "sha256": {
            "releases.json": sha256_bytes(releases_bytes),
            "virions.json": sha256_file(snapshot_dir / "virions.json"),
            "virions-top.html": sha256_bytes(virions_bytes),
        },
        "notes": [
            "Poggit release index contains approved plugin release versions, not hidden or rejected submissions.",
            f"Virions are the visible top-{args.top} ranked page only; it is not a complete registry export.",
            "Artifact downloads remain pending until independently fetched and hashed.",
        ],
    }
    write_json(snapshot_dir / "sources.json", source_inventory(releases))
    write_json(snapshot_dir / "summary.json", summary)
    write_json(snapshot_dir / "downloads-plugins.json", {})
    write_json(snapshot_dir / "downloads-virions.json", {})
    write_json(CURRENT_FILE, {
        "schema_version": 1,
        "snapshot_id": snapshot_id,
        "captured_at": summary["captured_at"],
        "files": {
            "summary": f"../../snapshots/{snapshot_id}/summary.json",
            "releases": f"../../snapshots/{snapshot_id}/releases.json",
            "virions": f"../../snapshots/{snapshot_id}/virions.json",
            "sources": f"../../snapshots/{snapshot_id}/sources.json",
            "downloads_plugins": f"../../snapshots/{snapshot_id}/downloads-plugins.json",
            "downloads_virions": f"../../snapshots/{snapshot_id}/downloads-virions.json",
        },
    })
    print(json.dumps(summary["counts"], indent=2))
    print(f"Snapshot written: {snapshot_dir}")
    print(f"Current pointer: {CURRENT_FILE}")
    return 0


def read_current(snapshot_id: str | None) -> tuple[Path, dict]:
    if snapshot_id:
        snapshot_dir = SNAPSHOTS / snapshot_id
        summary = json.loads((snapshot_dir / "summary.json").read_text(encoding="utf-8"))
        return snapshot_dir, summary
    pointer = json.loads(CURRENT_FILE.read_text(encoding="utf-8"))
    snapshot_dir = SNAPSHOTS / pointer["snapshot_id"]
    summary = json.loads((snapshot_dir / "summary.json").read_text(encoding="utf-8"))
    return snapshot_dir, summary


def artifact_records(snapshot_dir: Path, kind: str) -> list[dict]:
    if kind == "plugins":
        releases = json.loads((snapshot_dir / "releases.json").read_text(encoding="utf-8"))
        rows = []
        for release in releases:
            url = release.get("artifact_url")
            if not isinstance(url, str) or not validate_poggit_url(url, "plugin"):
                continue
            release_id = release.get("id")
            rows.append({
                "id": str(release_id),
                "name": release.get("name") or release.get("project_name") or "plugin",
                "version": release.get("version") or "unknown",
                "source_url": url,
                "output": (Path("plugins") / str(release_id) / f"{safe_slug(release.get('name') or 'plugin')}-{safe_slug(release.get('version') or 'unknown')}.phar").as_posix(),
            })
        return rows
    virions = json.loads((snapshot_dir / "virions.json").read_text(encoding="utf-8"))
    rows = []
    for entry in virions:
        url = entry.get("poggit_download_url")
        if not isinstance(url, str) or not validate_poggit_url(url, "virion"):
            continue
        rows.append({
            "id": entry["id"],
            "name": entry.get("name") or "virion",
            "version": entry.get("version") or "latest",
            "source_url": url,
            "output": (Path("virions") / safe_slug(entry["id"]) / f"{safe_slug(entry.get('name') or 'virion')}-{safe_slug(entry.get('version') or 'latest')}.phar").as_posix(),
        })
    return rows


def safe_slug(value: str) -> str:
    value = value.casefold().strip()
    value = re.sub(r"[^a-z0-9._-]+", "-", value).strip("-._")
    return value[:100] or "item"


def download_one(client: PoliteHTTP, record: dict, target: Path) -> dict:
    target.parent.mkdir(parents=True, exist_ok=True)
    part = target.with_suffix(target.suffix + ".part")
    existing = part.stat().st_size if part.exists() else 0
    request_headers = {"Accept-Encoding": "identity"}
    if existing:
        request_headers["Range"] = f"bytes={existing}-"
    try:
        with client.open(record["source_url"], headers=request_headers) as response:
            status = getattr(response, "status", response.getcode())
            content_type = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
            append = existing > 0 and status == 206
            if content_type not in {"application/octet-stream", "application/x-php", "application/vnd.php.phar"}:
                raise RuntimeError(f"unexpected content type {content_type or '(missing)'}")
            mode = "ab" if append else "wb"
            with part.open(mode) as output:
                while True:
                    chunk = response.read(256 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
        digest = sha256_file(part)
        size = part.stat().st_size
        part.replace(target)
        try:
            storage_path = target.resolve().relative_to(ROOT).as_posix()
        except ValueError:
            storage_path = None
        return {"status": "downloaded", "bytes": size, "sha256": digest, "storage_path": storage_path}
    except RateLimited:
        raise
    except (HTTPError, URLError, TimeoutError, OSError, RuntimeError) as exc:
        return {"status": "failed", "error": str(exc)[:500], "partial_bytes": part.stat().st_size if part.exists() else 0}


def download(args: argparse.Namespace) -> int:
    snapshot_dir, summary = read_current(args.snapshot)
    rows = artifact_records(snapshot_dir, args.kind)
    start = max(0, args.offset)
    selected = rows[start: start + args.limit if args.limit else None]
    if not selected:
        print("No artifacts selected.")
        return 0
    destination = Path(args.destination).resolve() if args.destination else (ROOT / "archive" / "downloads")
    status_path = snapshot_dir / f"downloads-{args.kind}.json"
    if status_path.exists():
        states = json.loads(status_path.read_text(encoding="utf-8"))
    else:
        states = {}
    client = PoliteHTTP(args.delay)
    total = len(selected)
    publishable_since_sync = 0

    def publish_ready() -> None:
        if args.publish_every <= 0:
            return
        subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "publish_artifacts.py"), "--kind", args.kind, "--snapshot", args.snapshot or summary["snapshot_id"]],
            check=True,
        )

    for index, record in enumerate(selected, 1):
        previous = states.get(record["id"], {})
        if previous.get("status") == "uploaded" and previous.get("remote_url"):
            print(f"[{index}/{total}] {record['name']} {record['version']}: uploaded_remote")
            continue
        target = destination / record["output"]
        if target.exists():
            try:
                storage_path = target.resolve().relative_to(ROOT).as_posix()
            except ValueError:
                storage_path = None
            result = {"status": "already_present", "bytes": target.stat().st_size, "sha256": sha256_file(target), "storage_path": storage_path}
        else:
            try:
                result = download_one(client, record, target)
            except RateLimited as exc:
                states[record["id"]] = {**record, **{"status": "paused_rate_limit", "error": str(exc)}}
                write_json(status_path, states)
                publish_ready()
                print(f"Stopped safely: {exc}", file=sys.stderr)
                return 2
        states[record["id"]] = {**record, **result}
        write_json(status_path, states)
        print(f"[{index}/{total}] {record['name']} {record['version']}: {result['status']}")
        if result.get("storage_path"):
            publishable_since_sync += 1
            if publishable_since_sync >= args.publish_every > 0:
                publish_ready()
                publishable_since_sync = 0
    publish_ready()
    print(f"Finished {total} selected artifacts. Status: {status_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    snapshot_parser = subparsers.add_parser("snapshot", help="save release metadata and the top-N virion listing")
    snapshot_parser.add_argument("--top", type=int, default=300, choices=range(1, 1001), metavar="1..1000")
    snapshot_parser.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="minimum seconds between requests (default: 2)")
    snapshot_parser.set_defaults(run=snapshot)
    download_parser = subparsers.add_parser("download", help="download original Poggit PHAR artifacts, sequentially")
    download_parser.add_argument("--kind", choices=("plugins", "virions"), required=True)
    download_parser.add_argument("--snapshot", help="snapshot id; defaults to current")
    download_parser.add_argument("--destination", help="artifact root (default: ./archive/downloads; git-ignored)")
    download_parser.add_argument("--offset", type=int, default=0, help="skip this many rows in the selected catalog")
    download_parser.add_argument("--limit", type=int, default=0, help="maximum artifacts (0 means all remaining rows)")
    download_parser.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="minimum seconds between requests (default: 2)")
    download_parser.add_argument("--publish-every", type=int, default=0, help="publish and remove local files after this many completed downloads")
    download_parser.set_defaults(run=download)
    args = parser.parse_args()
    try:
        return args.run(args)
    except RateLimited as exc:
        print(f"Stopped safely: {exc}", file=sys.stderr)
        return 2
    except (HTTPError, URLError, TimeoutError, OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"Archive operation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
