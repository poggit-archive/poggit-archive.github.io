# Poggit Archive

An independent, non-commercial preservation catalog for PocketMine-MP plugin and virion releases. This project is not affiliated with Poggit or PMMP. It keeps Poggit/source attribution and license metadata with each item; it does not copy Poggit's site source, logo, or page design.

## Preservation model

- Plugin metadata comes from Poggit's public `releases.json` API. Each row is one approved plugin version; the endpoint does not expose rejected/private submissions.
- The virion feed is Poggit's visible ranked `/v?top=300` page. It is a top-300 popularity view, not a complete export of every virion or historical virion version.
- `repo_id`, `repo_name`, and `build_commit` are retained to identify the source revision used for each release. A pm-pl match is only a candidate until the commit is checked.
- Original `.phar` files are downloaded unchanged and get a SHA-256 digest. Rebuilt virion PHARs are separate artifacts, shown as “Rebuilt PHAR,” and must never be labeled as Poggit's originals. Their source commit, virion version, builder, dependencies, and SHA-256 are recorded under `rebuilt_artifact` in the download data.
- Verified PHAR and source ZIP files are stored as GitHub release assets in `poggit-archive/artifacts`. The publisher deletes each local copy only after GitHub reports the matching digest and byte size.
- Empty or missing license documents are recorded as **No License** while preserving upstream metadata and author/source attribution. This label records the absence of a license document; it does not assign a license. Nonempty custom license terms remain recorded for review.

## Poggit request and build limits

Poggit's API documentation specifies the read endpoints and `/r/{resourceId}` resource URLs, but does not publish a numeric request quota. The importer therefore uses one sequential request at a time, waits two seconds between requests by default, honors `Retry-After` by stopping instead of retrying, and stops on HTTP 403/429. It retries transient server/network errors with exponential backoff. Do not increase concurrency or run multiple importers against Poggit.

Poggit's UI source currently declares build-side limits of 2 MiB per PHAR, 10 MiB per zipball, and 5 MiB per raw virion, as well as weekly build/project ceilings. Those limits concern Poggit's build/submission service, not reading old `/r/` artifacts. This archive imports existing artifacts and does not submit or rebuild them through Poggit. Historical files are measured as downloaded; the current UI constants are not used as a validation rule.

## Capture metadata

Requires Python 3.10+ and no third-party Python packages.

```powershell
python .\scripts\poggit_archive.py snapshot
```

The command writes an immutable UTC snapshot under `data/snapshots/`, plus `data/api/v1/current.json`. It fetches only the two catalog endpoints, validates their shape, computes SHA-256 digests, records counts, and writes a source-repository inventory. Default pacing is two seconds between requests. Use `--delay` only to make it slower unless Poggit publishes a documented allowance.

## Download original PHARs

Begin with a small batch and inspect the saved results before a full run:

```powershell
python .\scripts\poggit_archive.py download --kind plugins --limit 10
python .\scripts\poggit_archive.py download --kind virions --limit 10
```

Continue in later batches with `--offset N --limit N`; already uploaded files are skipped. `--limit 0` processes the selected rows sequentially, so it can run for hours. Downloads are resumed from `.part` files when the origin supports byte ranges. Per-item status, SHA-256, and remote URL are written to the snapshot's `downloads-*.json` file. Stop on a rate-limit response and wait before starting another run.

Use `--publish-every 20` to upload and verify each group of completed PHARs, then delete its local files. Source ZIP downloads use the same option with a smaller batch such as `--publish-every 3 --max-mib 100`. The publisher uses 900 assets per release to stay below GitHub's 1,000 asset limit. It rejects an asset at or above 2 GiB. Files with a missing or mismatched remote digest remain local.

Without `--publish-every`, downloaded files stay locally at:

- `archive/downloads/plugins/<release-id>/<name>-<version>.phar`
- `archive/downloads/virions/<owner-repo-project-version>/<name>-<version>.phar`

## Find source backups in pm-pl

`gh` must be authenticated with permission to read the `pm-pl` organization. The inventory uses the paginated GitHub REST API and stores only repository identity, fork/parent, archive state, branch, and update time:

```powershell
python .\scripts\map_pm_pl.py
```

The result is `source-map.json` for the current Poggit snapshot. It links candidates by repository ID, exact name, or repository basename; basename matches are candidates only. It does not claim that a candidate contains the recorded `build_commit`. Check the commit and license before using a candidate.

Download exact source snapshots in small batches:

```powershell
python .\scripts\fetch_sources.py --limit 10
```

For each recorded build commit, this tries the original GitHub repository first and then its `pm-pl` basename candidate if the original cannot serve that commit. ZIP files are stored under `archive/sources/<repo-id>/<commit>.zip`, are not extracted, and get a SHA-256 entry in `source-downloads.json`. The default size ceiling is 100 MiB per ZIP. Large/all-history imports can take hours and consume substantial disk; use `--repo-id`, `--offset`, `--limit`, `--delay`, and `--max-mib` deliberately. This captures source at Poggit build commits, not the full Git commit history.

### Recover source from other public backups

If both the original repository and its `pm-pl` candidates lack a build commit, check other public forks. `source-recovery-candidates.json` maps exact `repo-id@commit` keys to backup repository names. Confirm that GitHub can serve the recorded commit from each backup before adding it. A matching plugin name or version alone is insufficient.

```powershell
python .\scripts\fetch_sources.py --candidates-file .\data\snapshots\2026-10-14T20-07-25Z\source-recovery-candidates.json
```

The downloader checks each new ZIP's commit directory, expanded size, and CRC integrity. Preserve the release's declared license and the source's license notices. Empty or missing license documents display **No License**. Records explicitly marked `license_review_required` for unresolved custom terms stay local and are skipped by the downloader, publisher, and remote reconciliation. After resolving the record, restore `status: "downloaded"` to make the file eligible for publication.

Use `publish_artifacts.py --kind sources --key-file <keys.txt> --keep-local` to publish a reviewed batch. The key file contains one exact source key per line; selecting a batch preserves the existing release shards. `source-recovery.json` records the investigation, recovered commits, and unresolved items for this snapshot.

### Recover exact source from Software Heritage

Software Heritage can retain a Git revision after its GitHub repository and forks become unavailable. `software-heritage-revisions.json` records the results of looking up the missing build commits through its revision API. Request and download directory bundles with:

```powershell
python .\scripts\recover_swh_sources.py --revision-file .\data\snapshots\2026-10-14T20-07-25Z\software-heritage-revisions.json --phase request
python .\scripts\recover_swh_sources.py --revision-file .\data\snapshots\2026-10-14T20-07-25Z\software-heritage-revisions.json --phase recover
```

Vault bundles may take time to prepare; rerun the recovery phase after cooking finishes. The recovery tool rebuilds each Git blob and tree hash from the downloaded files and file modes, and requires the root tree ID to match the recorded revision. It creates a deterministic ZIP while preserving the Git file bytes. The ZIP container is reconstructed; its provenance is recorded in `source-downloads.json`. Publish these exact source snapshots with `--kind sources`.

### Recover distribution source from PHARs

When an exact Git source snapshot is unavailable, recover the files distributed in the verified original PHAR:

```powershell
python .\scripts\recover_phar_sources.py
python .\scripts\publish_artifacts.py --kind recovered-sources --key-file <release-ids.txt> --keep-local
```

This requires PHP 8 or later with Phar support. The tool reads archive entries without executing the plugin or its stub and without deserializing PHAR metadata. It verifies the original PHAR SHA-256 and size, creates a deterministic ZIP, and reopens it to compare every packaged file byte for byte. Each ZIP contains `distribution/`, `RECOVERY.json` with per-file hashes and attribution, and a short explanation of its scope. Results are recorded by release ID in `recovered-sources.json`.

The catalog prefers exact archived source and otherwise displays a separate **Source from PHAR** link. These distribution trees may omit repository files or contain bundled libraries and build-time changes. Empty or missing license information displays **No License**; original license metadata remains available in the data. `source-recovery-followup.json` records the additional investigation and distinguishes exact Git source from recovered PHAR contents.

The [19-plugin recovery audit](docs/source-recovery-2026-10-19.md) records further Software Heritage, Wayback and historical fork checks. Its machine-readable evidence is in `source-recovery-deep-audit.json`; related source from a different revision remains separate from exact release source.

### Preserve virion sources and rebuild missing PHARs

The [virion recovery report](docs/virion-recovery-2026-10-19.md) covers 255 separate source ZIPs, eight newly rebuilt PHARs and the ten unresolved entries. Virion source provenance is stored separately from plugin source in `virion-source-downloads.json`. The interface distinguishes **Archived source**, **Rebuild source**, and **Source from PHAR**; every link targets a verified archive asset.

The portable `virion-source-plan.json` pins source revisions and records their evidence. Recover sources with:

```powershell
python .\scripts\recover_virion_sources.py --plan .\data\snapshots\2026-10-14T20-07-25Z\virion-source-plan.json --phase git
python .\scripts\recover_virion_sources.py --plan .\data\snapshots\2026-10-14T20-07-25Z\virion-source-plan.json --phase swh-request
python .\scripts\recover_virion_sources.py --plan .\data\snapshots\2026-10-14T20-07-25Z\virion-source-plan.json --phase swh
python .\scripts\recover_virion_sources.py --plan .\data\snapshots\2026-10-14T20-07-25Z\virion-source-plan.json --phase phar --php <php-path>
```

Source recovery uses the Python standard library. Building additionally requires PyYAML and PHP with Phar and YAML support. Use a clean VirionTools checkout pinned to `d3bcaa5bbe5344996fb06b6192ca37be980dd7eb` and a key file containing the requested virion IDs:

```powershell
python .\scripts\build_recovered_virions.py --compiler <VirionTools-checkout> --php <php-path> --key-file <virion-ids.txt>
python .\scripts\publish_artifacts.py --kind rebuilt-virions --keep-local
python .\scripts\publish_artifacts.py --kind virion-sources --keep-local
```

The builder checks the catalog name, version and namespace, records staging adjustments, and reopens each PHAR to compare included source bytes. It never executes target library code. Published reconstructions are recorded in `rebuilt-virions.json`; only verified uploaded records belong in each item's `downloads-virions.json` `rebuilt_artifact` field. Original download status and reconstructed artifact status remain separate.

## Astro site and JSON API

The catalog is built as a static Astro site and deployed to GitHub Pages with GitHub Actions. Requires Node.js 22.12 or later and npm.

Install dependencies and start the local development server:

```powershell
npm ci
npm run dev
```

The development command serves the catalog data and removes its temporary copy when the server stops. To build and preview the deployment output:

```powershell
npm run build
npm run preview
```

The source snapshots stay under `data/`. The build copies the API, snapshots, and pm-pl repository inventory into `dist/`. Local archived source ZIPs and PHARs are never included in the Pages artifact.

Remove the generated site, caches, and installed dependencies after previewing:

```powershell
npm run clean
```

The public catalog is hosted at <https://poggit-archive.github.io/>. Original PHAR and source ZIP assets are stored in <https://github.com/poggit-archive/artifacts> releases.

The API is versioned and immutable by snapshot:

- `data/api/v1/current.json` - latest snapshot pointer
- `data/snapshots/<snapshot-id>/releases.json` - all Poggit release rows in that snapshot
- `data/snapshots/<snapshot-id>/virions.json` - parsed entries from the ranked top-300 virion page
- `data/snapshots/<snapshot-id>/sources.json` - unique GitHub repositories and observed build commits
- `data/snapshots/<snapshot-id>/downloads-plugins.json` - plugin artifact state and SHA-256
- `data/snapshots/<snapshot-id>/downloads-virions.json` - virion artifact state and SHA-256
- `data/snapshots/<snapshot-id>/source-downloads.json` - exact source commits, verified ZIP URLs, and SHA-256
- `data/snapshots/<snapshot-id>/virion-source-downloads.json` - virion source ZIPs, revision scope, license documents, and SHA-256
- `data/snapshots/<snapshot-id>/virion-source-plan.json` - pinned source discovery plan and supporting evidence
- `data/snapshots/<snapshot-id>/rebuilt-virions.json` - additional virion reconstruction provenance and verified PHAR assets

The browser links to verified archive release assets for original PHARs and source ZIPs. Rebuilt virion PHARs have a separate “Rebuilt PHAR” link with their source commit and build details in the link description. The browser does not fall back to Poggit downloads. When a source ZIP is unavailable, a clearly labeled upstream GitHub repository link may be shown. Entries without an original or rebuilt PHAR remain listed as metadata and show that the PHAR is not archived.

## Publishing checklist

Keep author, source, Poggit page, and license metadata with every item. Record missing license documents as **No License**, preserve any upstream license field, and retain nonempty custom license terms for review. Avoid branding that could make this independent archive look official.
