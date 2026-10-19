# Wayback image recheck in Chrome — 19 October 2026

The 134 image contexts left after the first recovery pass were checked again
using Chrome. They represented 126 distinct URLs: 31 Genboy URLs covering 33
contexts, and 95 other URLs. A context records an image URL and, where relevant,
the release source revision; it is not necessarily a separate physical file.

**12 contexts were recovered and 122 remain unavailable.** Eleven recoveries
come from captures of the original URL. One Track screenshot uses a related URL
in the same author's Images repository; it is explicitly marked as a related
copy with unverified release-time identity. The recovered contexts share 11
new display files.

The current inventory is **5,763 preserved contexts**, **758 reconstructed
snapshot labels** and **122 unavailable**, mapping to **2,180 display files**.
Across both recovery passes, **251 of the original 373 gaps** now have local
images. The number tied to known original release Git revisions remains 100;
these new Wayback captures do not establish release-time identity.

## Chrome findings

All 95 non-Genboy URLs received unfiltered CDX lookups in Chrome. Eleven had a
successful capture; 84 had no successful capture in the returned index. None
of these browser queries failed. The report retains the earlier connection
errors alongside the completed rechecks, rather than treating a timeout as
proof that an image was never archived.

Two recovered GIFs were indexed as `application/octet-stream`. The earlier
image-only MIME filter had excluded them. Future CDX recovery queries no longer
filter by MIME; downloaded bytes must still pass image decoding and checksum
verification. Two SVG responses required HTTP content decoding, one gzip and
one Brotli. Captured SVG text is retained locally; display uses a sanitized
rasterization. Inline raster images are decoded and re-encoded locally, while
external references and nested SVG data are removed.

| Recovered material | Contexts | Scope |
| --- | ---: | --- |
| Elevator usage animation | 1 | Original URL capture |
| Tobias animation | 1 | Original URL capture |
| Discord screenshots | 2 | Original URL captures |
| Sonsa screenshots | 2 | Original URL captures |
| RevivalPMMP logo | 1 | Original URL capture |
| Track screenshot in Images repository | 1 | Original URL capture |
| Track screenshot at the missing Track repository URL | 1 | Related URL copy; identity at release time unverified |
| PHPStan workflow badge | 1 | Original URL capture; historical result, not current CI status |
| DummyEnchantments counter | 1 | Original URL capture; historical counter, static display |
| Shopkeepers statistics image | 1 | Original URL capture; historical statistics |

The Chrome-rendered CDX documents supplied the capture timestamps and replay
URLs. One image was downloaded through Chrome. The other original bytes were
downloaded with curl from the Chrome-confirmed capture URLs; a direct GIF
document navigation in Chrome had returned `ERR_BLOCKED_BY_CLIENT`. No browser
protection was disabled. Each downloaded file was checked by size, SHA-256 and
image decoding before import.

## Genboy: 33 contexts still missing

The domain-wide unfiltered CDX query returned 111 distinct indexed URLs. None
matched an image filename. The returned MIME types were HTML, RSS, JavaScript
and plain text. The saved Festival page and Festival 2.0.0 article still pointed
to the same missing uploads; they did not reveal an alternate media host.

Opening the [archived Festival logo URL](https://web.archive.org/web/20190826024952im_/https://genboy.net/wp-content/uploads/2018/02/festival_plugin_logo.png)
returned an explicit no-capture page. The [archived Festival page](https://web.archive.org/web/20190826024952/https://genboy.net/festival/)
and [domain CDX query](https://web.archive.org/cdx/search/cdx?url=genboy.net%2F*&output=json&collapse=urlkey&fl=timestamp,original,mimetype,statuscode)
are retained as evidence. This result applies to the queried index and pages;
it does not rule out screenshots, backups or copies elsewhere. The public audit
summarizes the domain query without publishing unrelated blog URL records.

## Original animations and local previews

The original GIFs occupy 33,596,582 and 16,220,893 bytes. They are preserved in
the project's [media originals release](https://github.com/poggit-archive/artifacts/releases/tag/media-originals-2026-10-19-0001),
with a downloadable checksum manifest and GitHub asset digest verification.

The site uses local animated WebP previews to remain inside its existing
950 MiB build budget. Elevator is resized from 1013×626 to 720×445; Tobias stays
600×325. The WebP encoding is lossless relative to those preview rasters.
Verification compares all frame delays, frame counts (616 and 180), loop
settings and decoded pixel hashes at the first, middle and final frames. The
original unmodified GIFs remain available through explicit download links.
Viewing a page makes no request to Wayback, Poggit or the artifact repository.

## Evidence and reproduction

The snapshot's `media-chrome-audit.json` contains all 134 investigated contexts,
95 URL checks, successful capture timestamps, source URLs, hashes, original GIF
asset identities, transformation metadata and the Genboy summary.
`media-recovery-audit.json` incorporates this pass into the original 373-context
cohort. The [public preservation report](https://poggit-archive.github.io/preservation/#chrome-recheck)
links to both datasets and the original GIFs.

`scripts/prepare-chrome-animations.mjs` verifies and prepares the two derivatives.
`scripts/import-chrome-media.mjs` imports downloads backed by Chrome CDX evidence,
then `scripts/finalize-media-recovery-audit.mjs` refreshes the aggregate report.
These explicit research commands require the local investigation inputs under
ignored `archive/media-chrome/`; the public audit retains their relevant evidence.
Normal builds use committed media and data only, and perform no remote retrieval.

Validation passed 23 Node tests and six Python tests. The local production build
generated 6,475 HTML pages, verified 2,213 local runtime files and found zero
external runtime dependencies. Its Windows checkout occupied 949.2 MiB, within
the unchanged 950 MiB budget. Chrome confirmed the new report, the loaded
Elevator animation and the rasterized counter without console warnings/errors
on the checked pages.
