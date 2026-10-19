# Source archive recheck in Chrome — 19 October 2026

All **41 previously unverified source URLs** were checked in Chrome: **37
supplementary plugin branch/alias URLs** and **four exact-SHA virion URLs**.
Every URL returned an empty CDX index and an empty Availability response.
**No additional source snapshot or PHAR was recovered.**

| Scope | URLs | CDX completed | Availability completed | Captures found | Still unverified |
| --- | ---: | ---: | ---: | ---: | ---: |
| Plugins | 37 | 37 | 37 | 0 | 0 |
| Virions | 4 | 4 | 4 | 0 | 0 |
| **Total** | **41** | **41** | **41** | **0** | **0** |

The virion URLs cover TelegramBotAPI commit
`9d6128dcd034042b1cee29cc4622015cc9a49656` and VOsaka commit
`aa5df4a7dc61c1c249504e9daad13ee985806f12`. These are historical SHA candidates;
the empty archive responses do not establish that either candidate is the exact
Poggit build revision.

## Method and evidence

The exact pending URL lists were copied from the previous plugin and virion
audits. Each CDX query used `output=json`, `collapse=digest` and the timestamp,
original URL, MIME, status and digest fields. No MIME or status filter was
applied. Each URL also received a separate Wayback Availability lookup.

All 82 lookup responses were read from rendered JSON documents in the
user-requested Chrome browser. The CDX responses were `[]`; Availability
responses contained empty `archived_snapshots` objects. No archive payload was
available to download, inspect or hash.

The archived Festival page was used as a positive control for both services.
CDX returned successful HTML captures, and Availability returned a usable HTTP
200 snapshot dated `20190826024952`. The controls show that both query paths
could return captures during this pass.

One Chrome navigation for ClearPlayer's `master.zip` CDX query timed out. The
same tab subsequently finished loading the expected query and visibly returned
`[]`; its separate Availability request also returned no snapshot. The original
navigation error and the later resolution are both retained. There are no
unresolved browser errors or rate-limited URLs in this batch.

The snapshot's
[`source-wayback-chrome-recheck.json`](../data/snapshots/2026-10-14T20-07-25Z/source-wayback-chrome-recheck.json)
records every requested URL, query URL, response, timestamp, result and positive
control. It also identifies the baseline audit files by SHA-256. Their old
pending lists and rate-limit observations remain preserved as historical
evidence; the active pending lists are now empty and link to this follow-up.

## Coverage after the recheck

- Plugins: **4,998 releases with exact archived Git source** and **23 releases
  across 19 projects with PHAR-derived source only**. All 5,021 original plugin
  PHARs remain preserved.
- Virions: **259/265 entries with source ZIPs and original/rebuilt PHARs**.
  Source provenance remains 214 original-build revisions, 44 reconstruction
  revisions and one PHAR-derived source. Six entries still lack source and PHAR.
- No source download, revision claim, reconstruction, license or media coverage
  was changed by these negative lookup results.

## Remaining recovery routes

The 41-URL backlog is resolved. Empty results apply to the queried URLs in the
returned indexes; they do not exclude a renamed mirror, a different archive
URL, an unindexed Git object or a private backup. Further recovery needs new
evidence: another development distribution, a surviving Git bundle/source ZIP,
an original PHAR, or historical Poggit CI build/resource records. Repeating the
same 41 URLs immediately has no new evidence to work from.
