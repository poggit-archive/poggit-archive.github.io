# Poggit Archive

An independent, non-commercial preservation catalog for PocketMine-MP plugin and virion releases. This project is not affiliated with Poggit or PMMP. It keeps Poggit/source attribution and license metadata with each item; it does not copy Poggit's site source, logo, or page design.

## Preservation model

- Plugin metadata comes from Poggit's public `releases.json` API. Each row is one approved plugin version; the endpoint does not expose rejected/private submissions.
- The virion feed is Poggit's visible ranked `/v?top=300` page. It is a top-300 popularity view, not a complete export of every virion or historical virion version.
- `repo_id`, `repo_name`, and `build_commit` are retained to identify the source revision used for each release. A pm-pl match is only a candidate until the commit is checked.
- Original `.phar` files are downloaded unchanged and get a SHA-256 digest. Rebuilt virion PHARs are separate artifacts, shown as “Rebuilt PHAR,” and must never be labeled as Poggit's originals. Their source commit, virion version, builder, dependencies, and SHA-256 are recorded under `rebuilt_artifact` in the download data.
- Verified PHAR and source ZIP files are stored as GitHub release assets in `poggit-archive/artifacts`. The publisher deletes each local copy only after GitHub reports the matching digest and byte size.
- Empty or missing license documents are recorded as **No License** while preserving upstream metadata and author/source attribution. This label records the absence of a license document; it does not assign a license. Nonempty custom license terms remain recorded for review.

## Static plugin detail pages

Each of the **1,450 plugin projects** has a page under `/plugins/<project-id>-<name>/`. All **5,021 captured releases** also have a permanent page under that project's URL followed by the release ID. Project IDs distinguish plugins that share a name. The catalog title links to the selected release; version menus and history show each version's downloads.

For example: [MultiWorld](https://poggit-archive.github.io/plugins/420-multiworld/) and [MultiWorld 2.1.1](https://poggit-archive.github.io/plugins/420-multiworld/12098/).

Pages are generated as HTML at build time, including descriptions, changelogs, version navigation and artifact links. They work without a backend or JavaScript. JavaScript only improves broken-image handling and dismissing the version menu. Downloads, scores and metadata reflect the **14 October 2026 snapshot**, rather than live counters.

The pinned official [`poggit/release-archive`](https://github.com/poggit/release-archive/tree/102194b0b1022180fc774318f39cd2a10ee4bb27) supplies **5,020 descriptions** and **3,636 changelogs**. These were imported after checking their Git blob SHA-1 and SHA-256. The original HTML/text and provenance are retained in [`plugin-details.json.gz`](data/snapshots/2026-10-14T20-07-25Z/plugin-details.json.gz); HTML is sanitized during the site build. Per-release `plugin.yml`, available license files, file sizes, SHA-256, SHA-1 and MD5 come from the **5,021 original PHARs**, verified against the existing published-artifact manifest. PHAR stubs and serialized metadata are never executed or deserialized.

Coverage and limitations are recorded in [`plugin-details-report.json`](data/snapshots/2026-10-14T20-07-25Z/plugin-details-report.json):

- **MailSystem 1.0.0, release 13728**, has no description in the official release archive. Its metadata, manifest and original PHAR remain available.
- **1,385 releases** have no preserved changelog. Missing content is stated explicitly on the relevant page.
- Review text, reviewer details, review counts, replies and their dates were not exported in the release snapshot. The API's recorded integer score is preserved where present; review records are not inferred from it.
- Runtime-registered commands and permissions, features, generators, languages and credits remain in the description when documented. Structured commands and permissions show exactly what the selected PHAR declares in `plugin.yml`.
- `last_state_change_date` is labeled **Status updated**, not assumed to be the first approval date. Compatible API ranges are kept individually. Empty license documents retain **No License**.
- Source ZIP links retain their provenance: **Archived source** for verified Git snapshots and **Source from PHAR** for extracted distribution files.

To reproduce the import with the verified PHAR cache at `archive/virion-recovery/plugin-phars/<release-id>.phar`, install PyYAML and run:

```powershell
python scripts/import_plugin_details.py --php path/to/php.exe
```

The importer downloads one pinned official archive ZIP and checks every imported document against its Git tree. The committed compressed snapshot lets normal `npm ci` / `npm run build` deployments run without Python, PHP or another archive download.

## External dependencies and local mirrors

Browsing the catalog, plugin detail pages and Memory no longer requests images, scripts, fonts, styles or data from Poggit, GitHub's raw/camo image hosts or external CDNs. A production Content Security Policy enforces same-origin runtime resources. Normal builds use committed captures and do not download images or documents; the Memory sprite sheets are generated from local images.

- **6,643 image contexts** are tracked by original URL and release revision: **5,763 preserved**, **758 explicitly reconstructed snapshot labels**, and **122 unavailable**. Contexts deduplicate to **2,180 displayed image files**. Own-repository images are pinned to the recorded build commit; 339 contexts were recovered from verified Git source ZIPs. External images/badges captured later retain their capture date rather than being presented as historical release-time bytes.
- The [missing-image follow-up](docs/media-recovery-2026-10-19.md) recovered **239 of the 373 previous gaps**: 100 tied to original release source revisions, 38 Wayback captures, and 101 PHAR/other-revision images with explicit provenance. **All 3,906 recorded release icons now have a local image**; three of the last seven use an icon from another revision, clearly marked as unverified for the requested release. The [public recovery report](https://poggit-archive.github.io/preservation/#media-recovery) retains evidence and the remaining 122 gaps. The [Chrome recheck](docs/media-chrome-recheck-2026-10-19.md) added **12 more contexts** (11 original-URL Wayback captures and one related copy), bringing recovery from the original 373 gaps to **251**. All **33 Genboy contexts** remain unavailable after the domain index and archived Festival pages were checked. Large original GIFs are retained separately, with local animated WebP previews.
- **5,562 download URLs** have checksum-verified same-origin copies: all **5,021 plugin PHARs**, **259 original/rebuilt virion PHARs**, **259 virion source ZIPs**, and **23 PHAR-derived plugin source ZIPs**. Original/rebuilt provenance stays unchanged. GitHub release assets remain backups. Full plugin Git source ZIPs (~883 MiB) stay in the project-owned artifact repository because they cannot fit alongside the site within GitHub Pages' 1 GB limit.
- Original descriptions, changelogs, manifests, license files and release metadata are exported under `/plugin-documents/`. Raw archived HTML, including the original virion listing, is served as `.html.txt` so viewing it cannot invoke old Poggit/CDN scripts.
- Captured Poggit plugin/version/resource links are rewritten to preserved equivalents. Dev Build links open the saved build record. Unmatched historical references point to the preservation explanation. Profiles, issues, Discord, videos and donation pages remain optional external links, without embedded widgets.
- Missing images always use a local placeholder, with no fallback request to an upstream host. Reconstructed Poggit badges are labeled as archive snapshot information and remain distinct from captured originals.

See the live [preservation status](https://poggit-archive.github.io/preservation/), the [audit notes](docs/external-dependencies-2026-10-19.md), [`media-mirror-report.json`](data/snapshots/2026-10-14T20-07-25Z/media-mirror-report.json), [`media-mirror.json`](data/snapshots/2026-10-14T20-07-25Z/media-mirror.json) and [`file-mirror.json`](data/snapshots/2026-10-14T20-07-25Z/file-mirror.json). Every build verifies local media/download checksums and audits generated HTML/CSS, Memory sheet references and local navigation/download targets; the public result is `/dependency-audit.json`.

Preservation updates are explicit operations, separate from normal builds:

```powershell
# Optional: recover images from the verified PHAR cache, using PHP >= 8.
python scripts/import_phar_media.py --php path/to/php.exe
npm run preserve:media
python scripts/recover-media-from-git.py
node scripts/finalize-media.mjs
python scripts/preserve_downloads.py
npm run build
```

Captures are resumable under `archive/`, use content hashes, and keep upstream URLs and revision evidence. Use `node scripts/preserve-media.mjs --retry-missing` only for a deliberate follow-up attempt. Review changed assets and manifests before committing. Builds never silently replace preserved bytes with upstream changes.

The generated `dist/` directory is portable to another static host. GitHub remains the current hosting/CI platform and the fallback store for large plugin Git ZIPs; npm is needed when installing build tools. Live external services and GitHub's historical CI/review data are not complete offline archives.

## Remaining preservation gaps

Status checked on **19 October 2026**, for snapshot [`2026-10-14T20-07-25Z`](data/snapshots/2026-10-14T20-07-25Z/). Counts cover **1,450 plugin projects / 5,021 releases** and **265 virion catalog entries**. The virion count covers the captured ranked feed, not every virion ever published.

| Missing material | Plugins | Virions |
| --- | ---: | ---: |
| Source ZIP in any preserved form | **0** | **6** |
| PHAR, including a verified reconstruction | **0** | **6** |
| Git source at the original Poggit build revision | **19 projects / 23 releases** | **51 entries** |

For plugins, **4,998 releases** have exact archived Git source. The remaining **23 releases** have separately preserved **Source from PHAR** ZIPs and original PHARs. Their distribution files are available, but the complete repository trees at their original build revisions remain missing.

For virions, **214 entries** have source at the original Poggit build revision, **44** have Git source used for reconstruction with the original Poggit revision unconfirmed, and **1** has source recovered from a PHAR. The remaining **6** have neither a source ZIP nor an original/rebuilt PHAR. Thus **259/265 entries** have both a source ZIP and a PHAR; the **51** entries lacking confirmed original-build Git source comprise those 44 reconstructions, one PHAR-derived source and six unresolved entries. PHAR coverage comprises **213 originals and 46 reconstructions**.

### Plugins still missing exact Git source

All releases below already have original PHARs and source ZIPs recovered from those PHARs. The outstanding gap is the exact Git source tree.

| Plugin | Original repository | Affected release versions |
| --- | --- | --- |
| KeepInv | `AstraMCPE/KeepInventory` | 1.0.0 |
| LuckyPouches | `ecstsylove/LuckyPouches` | 1.0.1, 1.0.0 |
| OnePlayerSleep | `ecstsylove/OnePlayerSleep` | 1.0.0 |
| HiveCorruptor | `JustTalDevelops/HiveCorruptor` | 1.0.0 |
| PlayerSkinStealer | `mote166/SkinStealer` | 1.0.0 |
| AutoSmelt | `OguzhanUmutlu/AutoSmelt` | 1.0.0 |
| BoostBlock | `OguzhanUmutlu/BoostBlock` | 1.0.0 |
| ChatLevel | `OguzhanUmutlu/ChatLevel` | 1.0.0 |
| ChorusPlant | `OguzhanUmutlu/ChorusPlant` | 1.0.0 |
| CommandEditor | `OguzhanUmutlu/CommandEditor` | 1.0.2, 1.0.1 |
| OneBlockAFK | `OguzhanUmutlu/OneBlockAFK` | 1.0.0 |
| RandomDrops | `OguzhanUmutlu/RandomDrops` | 1.0.1, 1.0.0 |
| RobotVerification | `OguzhanUmutlu/RobotVerification` | 1.0.0 |
| StopLag | `OguzhanUmutlu/StopLag` | 1.0.0 |
| WorkersDemo | `OguzhanUmutlu/WorkersDemo` | 1.0.1, 1.0.0 |
| AntiEnchantmentAbuse | `radondev/AntiEnchantmentAbuse` | 1.1.0 |
| ClearPlayer | `radondev/ClearPlayer` | 1.0.0 |
| PlotRating | `skillDev5235/PlotRating` | 1.1 |
| CoinsSystem | `VazziDE/CoinsSystem` | 1.2.0 |

The [plugin recovery audit](docs/source-recovery-2026-10-19.md) records the investigation. Exact build commits and PHAR-derived source ZIPs are tracked separately in [`source-downloads.json`](data/snapshots/2026-10-14T20-07-25Z/source-downloads.json) and [`recovered-sources.json`](data/snapshots/2026-10-14T20-07-25Z/recovered-sources.json).

### Virions still missing both source and PHAR

| Original repository / project | Catalog version |
| --- | --- |
| `vosaka-php/vosaka` / vosaka | 1.9.0 |
| `ZetNex/Map` / Map | 1.0.1 |
| `Jasson44/TelegramBotAPI` / TelegramBotAPI | 1.0.0 |
| `Tobias-2006/CommandArguments` / CommandArguments | Not recorded (`latest` catalog entry) |
| `kenzeve/ReplayLib` / ReplayLib | 1.0.0 |
| `InkoHX/Krul` / Krul | 0.1.0 |

The [latest virion investigation](docs/virion-development-recovery-2026-10-19.md) checked development PHARs outside the approved release catalog, historical forks, Wayback and Software Heritage. It recovered additional SHA candidates and class-name metadata, but no source or PHAR for these six entries. Four exact-SHA Wayback URLs remain unverified after HTTP 429; they are retained as pending requests, not negative archive results.

See [`virion-development-recovery.json`](data/snapshots/2026-10-14T20-07-25Z/virion-development-recovery.json) for evidence and pending URLs, [`virion-source-plan.json`](data/snapshots/2026-10-14T20-07-25Z/virion-source-plan.json) for revision candidates, and [`virion-source-downloads.json`](data/snapshots/2026-10-14T20-07-25Z/virion-source-downloads.json) for preserved source and revision scope. A metadata record, matching name or historical SHA candidate alone does not count as recovered source.

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

The [initial virion recovery report](docs/virion-recovery-2026-10-19.md) and [follow-up investigation](docs/virion-recovery-followup-2026-10-19.md) cover 259 separate source ZIPs, twelve newly rebuilt PHARs across the two batches and six unresolved entries. Virion source provenance is stored separately from plugin source in `virion-source-downloads.json`. The interface distinguishes **Archived source**, **Rebuild source**, and **Source from PHAR**; every link targets a verified archive asset.

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

Search the archived plugin PHARs for embedded copies with:

```powershell
python .\scripts\scan_embedded_virions.py --php <php-path> --workers 4
```

This scanner checks each original PHAR's size and SHA-256 before reading entries. It searches the ten follow-up targets by namespace and repository signatures, including shaded prefixes, and saves matching file bytes unchanged under `archive/virion-recovery/embedded/`. Checkpoints allow later scans to resume. A match identifies a candidate copy; it does not establish a library version, complete repository tree or original build revision. The scan reads GitHub archive assets and makes no requests to Poggit.

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
