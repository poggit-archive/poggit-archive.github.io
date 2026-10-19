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

Version menus on both catalog and detail pages show the captured compatible API ranges below the submission date. Single APIs, multiple ranges and prerelease API names remain intact; missing metadata is labeled `API not recorded`. The detail menu loads a small, compressed same-origin API index when opened, with skeletons and an unavailable state if loading fails. Reopening retries a failed request; version links remain usable throughout. Without JavaScript, the selected release's compatible APIs remain available in its sidebar. This avoids duplicating API markup across more than 56,000 static menu entries while preserving the 950 MiB site budget.

For example: [MultiWorld](https://poggit-archive.github.io/plugins/420-multiworld/) and [MultiWorld 2.1.1](https://poggit-archive.github.io/plugins/420-multiworld/12098/).

Username links open an exact author filter, such as `/?author=CzechPMDevs`, using the repository owners recorded in the captured releases. These links can be shared or reloaded. Plugin icons and titles open details for the selected version; changing the version updates both links.

Catalog and detail pages use the same preserved icon for each plugin release. When no icon was recorded or an image cannot load, both use a local vector puzzle icon. Virions use a local vector library icon because their feed did not record icons. These generic placeholders are interface assets, not recovered project logos; they do not change preservation counts or replace original icon metadata. The Poggit Archive logo is reserved for site branding.

All pages share the same header and footer components. The logo and site name return to the catalog; page and author headings stay in the main content. The footer links to Catalog, Leaderboard, Memory, Preservation, the API index and the site source in the same order and marks the current page. Short pages keep the footer at the bottom of the viewport; links wrap on smaller screens.

The header offers Light, Dark and System themes using local vector icons. System is the default and follows changes to the device color scheme. A manual choice persists across page navigation and browser restarts, and stays in sync between tabs. The theme applies before content is painted, including menus, preserved document text, code blocks and loading placeholders. Original images retain their colors. With JavaScript disabled, the site follows the device preference; printing uses a light palette. No external theme library or service is required.

Page navigation, image requests and changelog requests use the same skeleton animation. Static pages reveal their content as soon as parsing and deferred scripts finish, without an artificial loading delay; images load independently. Preserved image dimensions reserve their space before download. Catalog and Leaderboard keep their existing data placeholders, while Memory also shows placeholders until its metadata arrives. Cached images skip the animation, image failures clear it, and failed or timed-out changelog requests retain a link to the version page. Navigation ignores downloads, external links, section tabs and modified clicks, and clears its loading state when returning through browser history. Reduced-motion settings disable the shimmer. Static plugin content remains readable without JavaScript.

Memory shows **40 unique icons per page**, ordered from oldest to newest. Page numbers, first/previous/next/last controls and a page input use the same styles as the catalog. URLs such as `/memory/?page=2` survive reloads and support browser Back/Forward. Only the current page's cards are created, with lazy image loading and sprite-sheet caching retained.

Pages are generated as HTML at build time, including descriptions, changelogs, version navigation and artifact links. JavaScript turns the page sections into tabs and divides descriptions by their main headings, with a General tab for introductory content. Sections with multiple level-three headings also have a vertical set of subtabs, displayed above their content on smaller screens. Changelog version tabs load the relevant section from an existing local release page, with a link to that page if loading fails. Tabs support keyboard navigation and direct links to sections. Without JavaScript, all content remains readable on one page. Image fallbacks and version-menu dismissal also work locally. Downloads, scores and metadata reflect the **14 October 2026 snapshot**, rather than live counters.

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

## Static virion detail pages

All **265 captured virion entries** have a page at `/virions/<owner>/<repository>/<project>/`, linked from their catalog icon and title. Author links select the Virions catalog. Pages share the plugin layout, header, footer, keyboard-accessible tabs, image placeholders and skeleton loading, with sections for Overview, Usage, Dependencies, Used by archived plugins, Snapshot, License and any preserved changelog.

The local ZIP/PHAR import preserves **247 READMEs, 12 changelogs, 232 sets of nonempty license documents and 259 manifests**. The six entries without recovered source or PHAR retain their metadata pages and explicit unavailable states. A generic vector library icon is used because this catalog did not record virion icons. The ranked feed captured one entry per project, so these pages do not claim a complete version history or turn `latest` entries into known catalog version numbers. PHAR manifest versions are shown separately.

Catalog rows, detail headers and download cards show the verified PHAR version when available, falling back to the captured catalog version. Tooltips and Library details identify its source, including rebuilt PHAR manifests. The local document index supplies the same version metadata to the catalog; it does not rewrite the original `virions.json`. Of **27 entries without a catalog version, 26 have a version in their preserved PHAR manifest**. Only `Tobias-2006/CommandArguments/CommandArguments` still has neither a catalog version nor a recovered PHAR version. Snapshot retains the original catalog's missing-version information.

**Archived PHAR**, **Rebuilt PHAR**, **Archived source**, **Rebuild source** and **Source from PHAR** retain their existing provenance. Original PHAR manifests and source ZIP manifests are distinguished; the catalog's last-build marker can differ from the preserved PHAR build. Usage references match repository and project in the archived plugin dependency records and do not imply compatibility with the displayed PHAR. Configuration examples follow the [Poggit library schema](https://github.com/poggit/support/blob/master/poggit.yml.d.ts); virions are bundled libraries, not standalone server plugins.

Long documents use a content-addressed, gzip-compressed local payload with duplicate texts stored once. Browsers decode it locally with `DecompressionStream`; on failure or without JavaScript, static metadata, usage guidance and source/PHAR download links remain usable. Markdown is rendered and sanitized at build time. Images available in the preserved source ZIPs have checksum-linked local previews; unsupported or uncaptured external images use the local placeholder. Full source ZIPs retain the original image bytes. The dependency audit inspects compressed document HTML as well as static pages, and verifies links and local media.

The virion document report records **12 new local image previews** and **224 image references without a preserved preview**, including external badges. These references are counted separately from the plugin image recovery report below; opening a virion page never retries their upstream URLs. See [`virion-details-report.json`](data/snapshots/2026-10-14T20-07-25Z/virion-details-report.json) for the affected documents and original URLs.

Normal builds need neither PHP, Python nor network access. To reproduce the explicit document import from the already mirrored ZIPs/PHARs, run:

```powershell
python scripts/import_virion_details.py --php path/to/php.exe
node scripts/prepare-virion-details.mjs --import-images
```

The committed `src/data/virion-details.json.gz` contains the source capture; `src/data/virion-media.json` records local display previews. Keep the generated preview assets under `public/virion-media/`. `npm run build` validates these files and regenerates the local document payload. To fit the additional pages within the unchanged 950 MiB budget, per-page JSON-LD omits fields duplicated by canonical/OpenGraph/Twitter metadata. Identical fetch restrictions inherit from CSP `default-src 'self'`, following the [CSP fallback rules](https://www.w3.org/TR/CSP3/#directive-default-src); explicit style, frame, object, base and form restrictions remain.

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
| Original Poggit PHAR only | **0** | **52** |
| Git source at the original Poggit build revision | **19 projects / 23 releases** | **51 entries** |

For plugins, **4,998 releases** have exact archived Git source. The remaining **23 releases** have separately preserved **Source from PHAR** ZIPs and original PHARs. Their distribution files are available, but the complete repository trees at their original build revisions remain missing.

For virions, **214 entries** have source at the original Poggit build revision, **44** have Git source used for reconstruction with the original Poggit revision unconfirmed, and **1** has source recovered from a PHAR. The remaining **6** have neither a source ZIP nor an original/rebuilt PHAR. Thus **259/265 entries** have both a source ZIP and a PHAR; the **51** entries lacking confirmed original-build Git source comprise those 44 reconstructions, one PHAR-derived source and six unresolved entries. PHAR coverage comprises **213 originals and 46 reconstructions**. The **52 missing original PHARs** comprise those 46 reconstructed entries and the six unresolved entries.

### Plugin descriptions, changelogs and images

| Missing material | Current gap |
| --- | --- |
| Entire description document | **1 project / 1 release:** MailSystem 1.0.0, release **13728** |
| Images within descriptions | **122 image contexts / 114 distinct capture URLs**, affecting **59 projects / 155 releases** |
| Missing-image placements across release descriptions | **259 placements**; a context can occur in several releases or more than once in a document |
| Latest captured release has missing description images | **47 projects** |
| Genboy images within the remaining image gap | **33 contexts** |
| Images within preserved changelogs | **0 unavailable image placements** |
| Changelog document | **1,385 releases**: **1,372 first captured releases** and **13 later releases** |
| Icon with a recorded URL but no local image | **0 of 3,906 recorded release icons** |

The archive retains **5,020 nonempty descriptions** and **3,636 changelogs** for its 5,021 plugin releases. A missing changelog record does not establish that a changelog once existed and was lost; most such records are the first captured release of their project. MailSystem's original PHAR, manifest and metadata remain available despite its missing description.

An image context is keyed by its source URL and, where applicable, the release revision. It is distinct from a plugin, a physical image file and a placement inside a document. All **155 releases** affected by the remaining 122 image contexts have missing images in their descriptions. Missing images use local placeholders. The media inventory also contains **758 reconstructed snapshot labels**; these preserve recorded metadata rather than original badge bytes.

Separately, **1,115 releases** did not record an icon URL; **373 projects** have no recorded icon URL in any captured release. These use the default icon and are outside the 3,906 recorded-icon denominator. Their absent metadata is distinct from an image capture failure.

Review records, developer replies and historical Poggit CI logs/UI were not preserved in the imported datasets. A preserved description can still refer to optional external videos, support services or other material outside this archive's coverage.

Document counts come from [`plugin-details-report.json`](data/snapshots/2026-10-14T20-07-25Z/plugin-details-report.json) and the release records in [`plugin-details.json.gz`](data/snapshots/2026-10-14T20-07-25Z/plugin-details.json.gz). Image gaps, affected releases and original URLs are retained in [`media-mirror.json`](data/snapshots/2026-10-14T20-07-25Z/media-mirror.json), [`media-mirror-report.json`](data/snapshots/2026-10-14T20-07-25Z/media-mirror-report.json) and the [public preservation report](https://poggit-archive.github.io/preservation/).

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

The [virion development investigation](docs/virion-development-recovery-2026-10-19.md) checked development PHARs outside the approved release catalog, historical forks, Wayback and Software Heritage. It recovered additional SHA candidates and class-name metadata, but no source or PHAR for these six entries. The [Chrome source recheck](docs/source-wayback-chrome-recheck-2026-10-19.md) subsequently completed the four exact-SHA Wayback URLs left unverified after HTTP 429: each returned an empty CDX index and no Availability snapshot.

See [`virion-development-recovery.json`](data/snapshots/2026-10-14T20-07-25Z/virion-development-recovery.json) for evidence and historical pending URLs, [`virion-source-plan.json`](data/snapshots/2026-10-14T20-07-25Z/virion-source-plan.json) for revision candidates, and [`virion-source-downloads.json`](data/snapshots/2026-10-14T20-07-25Z/virion-source-downloads.json) for preserved source and revision scope. A metadata record, matching name or historical SHA candidate alone does not count as recovered source.

### Recovery opportunities still open

These gaps are the result of the documented searches, not proof that every possible copy has disappeared. The Chrome image pass recovered another 12 contexts after earlier connection failures and MIME filtering had hidden usable captures. The later [source recheck](docs/source-wayback-chrome-recheck-2026-10-19.md) completed **all 41 previously unverified URLs** (37 plugin URLs and four virion URLs) using both CDX and Availability in Chrome. All returned no capture; **zero URLs remain unverified in this batch**, and **no additional source or PHAR was recovered**. Original rate-limit observations and the resolved navigation timeout remain in [`source-wayback-chrome-recheck.json`](data/snapshots/2026-10-14T20-07-25Z/source-wayback-chrome-recheck.json) and its linked baseline audits.

- **Explore additional web archives.** The [assessment of eleven archive services](docs/archive-services-assessment-2026-10-19.md) identifies Arquivo.pt and Common Crawl as further research routes. Software Heritage and GH Archive have already supplied source or historical evidence in earlier passes. The sampled checks of the additional services recovered no new payload; their coverage has not been exhausted.
- **Inspect additional development distributions and server backups.** The prior virion investigation checked selected external packs, not every historical development PHAR. The recorded namespaces, class names and SHA candidates can identify a new matching copy if another distribution becomes available.
- **Check further Git mirrors, histories and media variants.** A surviving fork or bundle may retain a requested commit; a renamed image, thumbnail, resized upload or alternate host may preserve missing media. The Genboy index and Festival pages checked so far did not expose the missing images.
- **Obtain original backups from maintainers or archive operators.** A Git bundle, source ZIP, original PHAR, media backup or export of Poggit CI build/resource records could supply evidence unavailable in public searches. No outreach has been sent as part of these investigations.

Any additional capture must retain its source, revision scope and checksum. A related revision, reconstructed distribution or replacement image remains labeled separately from an exact original.

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

The API index has a stable address and points to the latest capture. Resolve each `files` entry relative to the index URL; for example, `releases.json` is available at `https://poggit-archive.github.io/data/api/v1/releases.json`. These short `/data/api/v1/` URLs always serve the files from the current snapshot. Timestamped snapshot originals stay in the repository for immutable history and provenance; the Pages build serves the current file only at its stable URL to avoid storing a second copy of the large catalog exports in the static artifact.

- `https://poggit-archive.github.io/data/api/v1/current.json` - latest snapshot pointer
- `https://poggit-archive.github.io/data/api/v1/summary.json` - capture time and catalog counts
- `https://poggit-archive.github.io/data/api/v1/releases.json` - all Poggit plugin release rows
- `https://poggit-archive.github.io/data/api/v1/virions.json` - parsed entries from the ranked top-300 virion page
- `https://poggit-archive.github.io/data/api/v1/sources.json` - unique GitHub repositories and observed build commits
- `https://poggit-archive.github.io/data/api/v1/downloads-plugins.json` and `downloads-virions.json` - archived artifact states and SHA-256
- `https://poggit-archive.github.io/data/api/v1/source-downloads.json` and `virion-source-downloads.json` - source ZIP preservation records
- `https://poggit-archive.github.io/data/api/v1/plugin-details.json.gz` - detailed plugin records
- `https://poggit-archive.github.io/data/api/v1/media-mirror.json` and `file-mirror.json` - preserved media and file manifests

The API is versioned. Each timestamped snapshot is immutable in the repository:

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
