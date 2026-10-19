# Missing-image follow-up — 19 October 2026

The follow-up started with **373 unavailable image contexts**. It added local
images for **239 contexts (64.1%)**, leaving **134 unavailable**. A context is an
original URL plus its revision-sensitive capture URL, not a unique image file or
a plugin count. These recoveries cover 211 release records.

The full inventory now contains **5,751 preserved contexts**, **758 reconstructed
snapshot labels**, and **134 unavailable contexts**, with **2,169 unique display
files**. Display-image storage increased by approximately **25.5 MiB**. All
**3,906 release records with an icon URL** now have a local image. The 1,115
releases without an icon URL remain outside this denominator.

## Evidence and limitations

| Recovery evidence | Contexts | Scope |
| --- | ---: | --- |
| Checksum-verified Git source ZIP | 98 | Original release source revision; corrected ref prefixes, repository aliases, filename case and relative paths are recorded |
| Direct Git image at the original commit | 2 | Original image commit, including surviving repository/fork identities |
| Wayback Machine | 38 | 34 original-URL captures; 4 captures of the same image path at another repository revision |
| Surviving repository branches | 88 | Actual commit pinned, original release image identity unverified |
| Surviving forks | 9 | Actual fork and commit pinned, original release image identity unverified |
| Original PHAR entries | 2 | Verified PHAR/image checksums and entry paths; upstream image URL identity unverified |
| Saved source ZIP from another release | 2 | Same repository, actual archived revision recorded; original release image identity unverified |

**100 contexts are tied to original release source revisions.** The remaining
139 have preserved image bytes with a different evidence scope. They must not be
described as 139 independently verified historical release images.

The final icon recoveries include three alternatives from another revision:
CommandEditor (`60a1af...` uses the capture at `981b79...`), LuckyPouches
(`78a398...` uses `14188f...`), and WorkersDemo (`63aabb...` uses `2b5a59...`).
Their tooltips and public provenance table state this limitation. The fourth
cross-revision Wayback recovery is a BravoClan description image.

The investigation checked 218 source ZIP groups across two passes, scanned the
existing image index extracted from all 5,021 original plugin PHARs, inspected
surviving repository branches and detached-repository candidates, and inspected
old forks of AllSigns and Worlds. Their forks supplied nine images missing from
the current upstream trees. Another pass checked 104 cached source ZIPs from
relevant repositories at other revisions and recovered two Track images.

Wayback research queried **278 unique URLs through the availability API** and
**135 unique URLs through CDX**, with additional repository-prefix CDX checks for
the last icon gaps. Some captures were obtainable through browser downloads
after command-line requests failed. The actual archived URLs, timestamps and
SHA-256 values are retained. Availability-API empty results, CDX empty results,
timeouts and connection refusals are distinct outcomes. A failed request does
not establish that the Internet Archive has no capture.

## Remaining gaps

| Host or group | Contexts |
| --- | ---: |
| genboy.net | 33 |
| hits.dwyl.io / hits.dwyl.com | 25 |
| GitHub raw images | 12 |
| Discord CDN/media/API | 11 |
| file.xenoservers.net | 7 |
| github.com | 5 |
| Unmatched Poggit badges | 5 |
| counter.seku.su | 4 |
| Other image hosts, thumbnails and badges | 32 |
| **Total** | **134** |

Missing images remain local placeholders. No new image host is contacted when a
visitor opens a plugin page. The remaining URLs and unsuccessful checks are
retained for later investigation. This is the result of this pass, not a claim
that all possible archives or historical copies have been exhausted.

## Reproduce and inspect

[`media-recovery-audit.json`](../data/snapshots/2026-10-14T20-07-25Z/media-recovery-audit.json)
contains all 373 starting contexts, their final states, evidence scope and
lookup results. The media manifest retains checksums, source paths, revisions,
Wayback timestamps and display dimensions. Existing preserved captures are not
replaced by the follow-up importer.

Recovery is explicit and separate from normal offline site builds:

```powershell
python scripts/recover-media-followup.py zip
python scripts/recover-media-followup.py forks
python scripts/recover-media-followup.py wayback
python scripts/research-media-repositories.py
python scripts/research-media-repositories.py --forks
python scripts/recover-media-followup.py local
python scripts/recover-media-followup.py phar
python scripts/recover-media-followup.py history
python scripts/recover-media-followup.py cdx
node scripts/finalize-media.mjs --followup
node scripts/finalize-media-recovery-audit.mjs
```

The local recovery workspace is `archive/media-followup/`. Keep its starting
baseline and evidence indexes when continuing an investigation. Browser-only
captures can be added to its `cdx-related-index.json` using the same file/hash
and provenance schema. The finalizer verifies the captured bytes before importing
them, rasterizes SVG safely, and records original bytes separately. It does not
execute plugin code, PHAR stubs or PHAR metadata.

Normal builds read only committed local media. The generated dependency audit
continues to reject external runtime resources and missing local targets.
