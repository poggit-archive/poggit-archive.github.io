#!/usr/bin/env python3
"""Inventory pm-pl repositories and map likely source backups to Poggit IDs."""

from __future__ import annotations

import json
import argparse
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SNAPSHOTS = DATA / "snapshots"
INVENTORY_FILE = DATA / "pm-pl-repositories.json"


def current_snapshot() -> tuple[str, Path]:
    pointer_path = DATA / "api" / "v1" / "current.json"
    pointer = json.loads(pointer_path.read_text(encoding="utf-8"))
    snapshot_id = pointer["snapshot_id"]
    return snapshot_id, SNAPSHOTS / snapshot_id


def slim_repo(repo: dict) -> dict:
    parent = repo.get("parent") or {}
    return {
        "id": repo.get("id"),
        "full_name": repo.get("full_name"),
        "html_url": repo.get("html_url"),
        "fork": bool(repo.get("fork")),
        "archived": bool(repo.get("archived")),
        "default_branch": repo.get("default_branch"),
        "pushed_at": repo.get("pushed_at"),
        "parent_id": parent.get("id"),
        "parent_full_name": parent.get("full_name"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="fetch a fresh paginated repository inventory")
    args = parser.parse_args()
    snapshot_id, snapshot_dir = current_snapshot()
    source_path = snapshot_dir / "sources.json"
    sources = json.loads(source_path.read_text(encoding="utf-8"))
    inventory = None
    if INVENTORY_FILE.exists() and not args.refresh:
        inventory = json.loads(INVENTORY_FILE.read_text(encoding="utf-8"))
        print("Using the saved pm-pl inventory; pass --refresh to query GitHub again.")
    else:
        print("Reading pm-pl's accessible repository inventory through the authenticated GitHub CLI...")
        command = ["gh", "api", "--paginate", "--slurp", "orgs/pm-pl/repos?per_page=100&type=all"]
        result = subprocess.run(command, capture_output=True, check=False)
        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            print(stderr or "GitHub CLI inventory failed.", file=sys.stderr)
            return result.returncode or 1
        try:
            pages = json.loads(result.stdout.decode("utf-8"))
        except json.JSONDecodeError as exc:
            print(f"GitHub CLI returned invalid JSON: {exc}", file=sys.stderr)
            return 1
        if not isinstance(pages, list):
            print("Expected paginated GitHub repository arrays.", file=sys.stderr)
            return 1
        repositories = [slim_repo(repo) for page in pages for repo in page]
        fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        inventory = {
            "schema_version": 1,
            "organization": "pm-pl",
            "fetched_at": fetched_at,
            "repository_count": len(repositories),
            "repositories": repositories,
        }
        INVENTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        INVENTORY_FILE.write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    repositories = inventory["repositories"]
    fetched_at = inventory["fetched_at"]

    by_id: dict[int, list[dict]] = {}
    by_name: dict[str, list[dict]] = {}
    by_basename: dict[str, list[dict]] = {}
    for repo in repositories:
        if isinstance(repo.get("id"), int):
            by_id.setdefault(repo["id"], []).append(repo)
        if repo.get("full_name"):
            by_name.setdefault(repo["full_name"].casefold(), []).append(repo)
            basename = repo["full_name"].rsplit("/", 1)[-1].casefold()
            by_basename.setdefault(basename, []).append(repo)
        if isinstance(repo.get("parent_id"), int):
            by_id.setdefault(repo["parent_id"], []).append(repo)

    mapped = []
    candidates_total = 0
    for source in sources:
        candidates: dict[str, dict] = {}
        source_id = source.get("repo_id")
        if isinstance(source_id, int):
            for repo in by_id.get(source_id, []):
                candidates[repo["full_name"].casefold()] = repo
        source_name = (source.get("repo_name") or "").casefold()
        for repo in by_name.get(source_name, []):
            candidates[repo["full_name"].casefold()] = repo
        basename = source_name.rsplit("/", 1)[-1]
        for repo in by_basename.get(basename, []):
            candidates[repo["full_name"].casefold()] = repo
        candidate_rows = []
        for repo in candidates.values():
            relation = "same_repo_id" if repo.get("id") == source_id else "pm_pl_fork_or_mirror"
            if repo.get("full_name", "").casefold() == source_name:
                relation = "same_name"
            elif repo.get("full_name", "").rsplit("/", 1)[-1].casefold() == basename:
                relation = "basename_only"
            candidate_rows.append({
                "full_name": repo.get("full_name"),
                "url": repo.get("html_url"),
                "relation": relation,
                "archived": repo.get("archived"),
                "fork": repo.get("fork"),
                "parent_full_name": repo.get("parent_full_name"),
                "default_branch": repo.get("default_branch"),
            })
        candidate_rows.sort(key=lambda row: (row["relation"] != "same_repo_id", row["full_name"].casefold()))
        candidates_total += len(candidate_rows)
        mapped.append({
            "repo_id": source_id,
            "repo_name": source.get("repo_name"),
            "source_url": source.get("source_url"),
            "commits": source.get("commits", []),
            "project_ids": source.get("project_ids", []),
            "candidate_status": "candidate_found" if candidate_rows else "no_pm_pl_candidate",
            "pm_pl_candidates": candidate_rows,
            "license_status": "review_required",
        })

    output = {
        "schema_version": 1,
        "snapshot_id": snapshot_id,
        "fetched_at": fetched_at,
        "pm_pl_inventory": "../../pm-pl-repositories.json",
        "poggit_source_count": len(sources),
        "matched_source_count": sum(1 for row in mapped if row["pm_pl_candidates"]),
        "candidate_edge_count": candidates_total,
        "matches": mapped,
        "notes": [
            "Candidates are based on matching GitHub repository IDs, exact repository names, or repository basename; inspect the commit before using a backup.",
            "A repository match does not prove that every Poggit build commit exists in that repository.",
            "No source archive was downloaded by this inventory command.",
        ],
    }
    (snapshot_dir / "source-map.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"pm-pl repositories captured: {len(repositories)}")
    print(f"Poggit source repositories: {len(sources)}; with pm-pl candidates: {output['matched_source_count']}; candidate edges: {candidates_total}")
    print(f"Saved mapping: {snapshot_dir / 'source-map.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
