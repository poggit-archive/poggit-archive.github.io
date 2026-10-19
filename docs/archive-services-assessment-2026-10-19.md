# Additional archive services — 19 October 2026

The eleven services opened in the user's Chrome tabs were reviewed for this
archive's remaining source, PHAR, document and image gaps. **No new source,
PHAR or image payload was recovered in these sampled checks.** This assessment
identifies useful routes; it is not an exhaustive search of these services.

The separate [41-URL Wayback recheck](source-wayback-chrome-recheck-2026-10-19.md)
completed all previously unverified source URLs without finding a capture.
Those results do not establish the absence of copies in other archives.

## Usefulness for Poggit recovery

| Service | Useful material | Assessment for the remaining gaps |
| --- | --- | --- |
| [Software Heritage](https://archive.softwareheritage.org/) | Source files, directory trees, revisions and repository histories | Highest relevance to exact Git source. Already used in earlier investigations, including a preserved related HiveCorruptor lineage. The requested missing release revisions were not found in the recorded checks. |
| [GH Archive](https://www.gharchive.org/) | Public GitHub events, including pushes and forks | Useful for full SHAs, former repository names, numeric repository IDs and fork owners. Already supplied historical forks and SHA candidates. Event metadata alone does not supply a source tree or PHAR. |
| [Arquivo.pt](https://arquivo.pt/) | Archived pages, images and URL/full-text indexes | Worth further targeted searches. Its [API documentation](https://github.com/arquivo/pwa-technologies/wiki/APIs) supports URL search, image search and access to original captured responses. The sampled Genboy root-URL search returned no results; domain-wide coverage remains unverified. |
| [Common Crawl](https://commoncrawl.org/get-started) | Raw HTTP responses in WARC, metadata in WAT, extracted text in WET | A further route for captured README pages, source-file responses and historical links. A matching WARC record can contain actual response bytes. WET text or a URL index entry alone cannot establish a complete repository or original binary. No matching record was verified in this pass. |
| [Archive.today](https://archive.ph/) | Text and graphical snapshots of web pages | Worth checking for old READMEs, visible code, images or metadata. A rendered snapshot alone does not qualify as an exact Git archive. Its Genboy host search returned no results for the query used. |
| [Ghostarchive](https://ghostarchive.org/) | Archived web pages and other captured web content | Potentially useful for lost documentation or linked media. The Poggit search navigation did not produce readable results in this session, so its relevant coverage remains unverified. |
| [Libraries.io](https://libraries.io/) | Package, repository, dependency, version and license metadata | Useful for discovering package names, upstream URLs or related projects. Metadata must be verified against an actual source payload; it does not itself establish a preserved Git tree. The service states its scraped data is not curated for accuracy. |
| [Archive-It](https://archive-it.org/) | Curated collections maintained by institutions | Useful if an institution collected relevant Minecraft/PocketMine sites. It is worth searching matching collections, but the reviewed landing page does not establish that the missing Poggit content is present. |
| [Perma.cc](https://perma.cc/) | Preserved web citations | Useful if someone created a matching Perma Link for a missing page. Its preservation purpose is citation records; no relevant Poggit record was established in this pass. |
| [UK Web Archive](https://www.webarchive.org.uk/) | UK-focused web collections | Its site currently reports that public access is unavailable. This is an access limitation, not evidence that a queried target has no capture. |
| [GitHub Arctic Code Vault](https://archiveprogram.github.com/faq/) | Long-term cold storage | Not a public source-retrieval route. The official FAQ states that the public cannot access code in cold storage. The 2020 snapshot contains the default-branch revision at capture time, potentially excluding large binaries; it is not every historical build revision. |

## Sampled searches and concrete limits

- **Archive.today:** searched `genboy.net` using its existing-snapshot search.
  The result page said no results. This was not a request to capture a new page.
- **Arquivo.pt:** submitted `genboy.net` in the page-search UI. The site selected
  its URL-search mode and reported no results. This tests the root URL query,
  not every image below the domain. A domain-wide CDX query was also attempted,
  but Chrome blocked the result document; no response payload was inspected.
- **Ghostarchive:** searched `poggit.pmmp.io`. Search navigation timed out and
  exposed no readable results. This is recorded as unverified, not no capture.
- **Common Crawl:** selected its **August 2019 index, CC-MAIN-2019-35**, and
  searched `genboy.net/*` in the public index UI. Chrome blocked the NDJSON
  result document with `ERR_BLOCKED_BY_CLIENT`. No record or WARC payload was
  verified. Neither other crawl periods nor all remaining source URLs were
  searched in this assessment.

No browser security setting was changed. The source recovery count remains
unchanged, and no archive button was added for an unverified candidate.

## Practical follow-up

For code, continue with newly identified Git origins or revisions in Software
Heritage and use GH Archive to locate former names and forks. For missing
documents and media, Arquivo.pt and Common Crawl provide additional indexes
that have not been exhausted. Common Crawl's [official guide](https://commoncrawl.org/get-started)
distinguishes raw WARC responses from extracted WET text and documents byte-range
retrieval of a matching WARC record. Its [FAQ](https://commoncrawl.org/faq)
also explains that the crawl is a sample of the web and its index is heavily
rate limited; large historical scans need a separate, bounded research pass.

Preserve each usable payload with its original URL, archive timestamp, size and
checksum. Source claims additionally require the requested revision and a
verifiable tree. A screenshot, event, package record or rendered code snippet
can supply leads without satisfying those requirements.
