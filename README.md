# Poggit Archive

An independent, non-commercial preservation catalog for PocketMine-MP plugin and virion releases. This project is not affiliated with Poggit or PMMP. It keeps Poggit/source attribution and license metadata with each item; it does not copy Poggit's site source, logo, or page design.

## Preservation model

- Plugin metadata comes from Poggit's public `releases.json` API. Each row is one approved plugin version; the endpoint does not expose rejected/private submissions.
- The virion feed is Poggit's visible ranked `/v?top=300` page. It is a top-300 popularity view, not a complete export of every virion or historical virion version.
- `repo_id`, `repo_name`, and `build_commit` are retained to identify the source revision used for each release. A pm-pl match is only a candidate until the commit is checked.
- Original `.phar` files are downloaded unchanged and get a SHA-256 digest. A rebuilt PHAR is a separate artifact and must never be labeled as Poggit's original.
- Verified PHAR and source ZIP files are stored as GitHub release assets in `poggit-archive/artifacts`. The publisher deletes each local copy only after GitHub reports the matching digest and byte size.
- Items with a missing or ambiguous license remain marked for review before public redistribution. Keep author, source, Poggit page, and license attribution with every archived item.

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

For each recorded build commit, this tries the original GitHub repository first and then its `pm-pl` basename candidate if the original cannot serve that commit. ZIP files are stored under `archive/sources/<repo-id>/<commit>.zip`, are not extracted, and get a SHA-256 entry in `source-downloads.json`. The default size ceiling is 25 MiB per ZIP. Large/all-history imports can take hours and consume substantial disk; use `--repo-id`, `--offset`, `--limit`, `--delay`, and `--max-mib` deliberately. This captures source at Poggit build commits, not the full Git commit history.

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

The browser links to verified archive release assets for PHAR and source ZIP downloads. It does not link to Poggit pages or fall back to Poggit downloads. When a source ZIP is unavailable, a clearly labeled upstream GitHub repository link may be shown. Entries without an archived PHAR remain listed as metadata and show that the PHAR is not archived.

## Publishing checklist

Keep author, source, Poggit page, and license metadata with every item. A missing license remains unverified and must not be described as permission to redistribute. Avoid branding that could make this independent archive look official.
