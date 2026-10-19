# External dependency audit — 19 October 2026

The original static catalog still loaded GitHub raw icons. Plugin descriptions
and changelogs embedded GitHub camo, user-image and third-party-hosted images.
Memory served local sprites but regenerated them from remote URLs during builds.
The raw `virions-top.html` dataset also retained Bootstrap, jQuery, Twitter and
Poggit scripts/styles if opened as a web page.

## Implemented preservation

| Material | Preservation |
| --- | --- |
| Icons and README/changelog images | Content-addressed committed files under `public/archive-media/`; no upstream fallback |
| Mutable images in the plugin's own repository | Resolve against the release build commit, separately for each revision |
| Deleted repository images | Read-only PHAR extraction and checksum-verified Git source ZIP recovery; 339 contexts recovered from ZIPs |
| SVG | Preserve captured source as plain text; display a rasterization with active/external references removed |
| Dead Poggit badges | Clearly distinguished snapshot labels, never presented as captured originals or current CI results |
| Descriptions, changelogs, licenses, manifests, release metadata | Local `/plugin-documents/` exports; raw HTML served as text |
| Poggit links | Resolve captured releases/resources/builds locally; unmatched records point to the preservation explanation |
| Published PHARs | All 5,021 plugin releases and 259 original/rebuilt virions mirrored locally, with artifact-repository backups |
| Virion source ZIPs and PHAR-derived plugin sources | 259 + 23 local ZIPs, retaining original/rebuilt/extracted-source labels |
| Memory | Build sprites from preserved local images only |
| Runtime protection | Production CSP permits only same-origin runtime resources |
| Verification | Check media and download SHA-256, generated HTML/CSS resources, Memory sheet paths, local documents, navigation and download targets |

The image inventory contains **6,643 contexts**, keyed by original URL and
revision-sensitive capture URL: **5,763 preserved**, **758 reconstructed labels**
and **122 unavailable**. They map to **2,180 distinct display files**. Icons were
preserved for **all 3,906 releases that recorded an icon URL**; the other
1,115 releases did not record an icon URL. Unavailable image contexts remain in
the public manifest with their original addresses and capture failures.

The download mirror maps **5,562 URLs** to verified same-origin files. Some URLs
share identical bytes, so the number of physical files is smaller. The upstream
artifact records and hashes remain unchanged; a separate file-mirror manifest
selects the local copy, with the original project-owned URL retained as backup.

The metadata snapshot is **14 October 2026**. Newly captured external images and
badges have separate capture timestamps. Recovery from a known PHAR or Git ZIP
retains its release/commit/checksum evidence. Capturing a live image today does
not establish what that image displayed when an older release was submitted.

## Remaining dependencies and gaps

- GitHub Pages remains the current hosting platform. The built site is portable
  to another static host without recompiling or contacting original content hosts.
- Full plugin Git ZIPs occupy about **883 MiB**, so those cannot fit alongside
  the site and local PHAR/media mirrors within the Pages limit. They remain in
  the project's own artifact repository, independently of the original authors
  and Poggit. All PHAR downloads, virion sources and recovered plugin sources
  have local copies.
- Profiles, issue trackers, Discord, videos and donation services are optional
  outgoing references, not embedded widgets. Their live contents are not mirrored.
- 122 image contexts could not be captured or recovered. They display a local
  placeholder instead of calling a dead or mutable host.
- Historical Poggit CI logs/UI and reviews were not present in the release export.
- Installing build tools still uses npm; CI and hosting still use GitHub. The
  normal build itself performs no remote media/document/download retrieval.

## Reproduction and reports

Normal `npm run build` verifies committed mirrors, exports safe local documents,
builds the site and Memory sprites, then runs `audit-site-dependencies.mjs`.
Any external runtime resource, missing local target or site larger than the
950 MiB preservation budget fails the build. The build writes
`dist/dependency-audit.json`, published at `/dependency-audit.json`.

Capture is separate and resumable. Run the importer/recovery/finalization commands
listed in the README to deliberately extend the archive. Capture failures are
records for future investigation, rather than reasons to fetch upstream during
every build or on visitors' browsers.

The [missing-image follow-up](media-recovery-2026-10-19.md) documents 239 additional recovered contexts, including Wayback and surviving-fork captures. Images from other revisions retain explicit scope labels; a local image does not establish its identity at the original release revision.

The [Chrome recheck](media-chrome-recheck-2026-10-19.md) recovered 12 more contexts. Two large original GIFs are stored in the project-owned artifact repository with verified SHA-256 and size; local animated WebP previews preserve frame counts and timing. Elevator is resized to 720px wide. These original GIF downloads are optional outgoing links; rendering the animations makes no external requests.
