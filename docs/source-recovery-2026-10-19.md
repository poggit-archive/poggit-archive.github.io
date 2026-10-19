# Exact source recovery audit - 19 October 2026

This audit continues the investigation of the 19 plugin projects whose 23 releases still use **Source from PHAR**. No additional exact release revision has been recovered. The catalog remains at 4,998 exact archived source snapshots and 23 PHAR-derived source distributions.

The [machine-readable evidence](../data/snapshots/2026-10-14T20-07-25Z/source-recovery-deep-audit.json) records the requested SHAs, API results, candidate repositories, original fork IDs, archived history and file comparisons.

## Checks completed

- Rechecked all 23 release SHAs in Software Heritage: every direct revision lookup returned 404. Searched all 19 repository names and followed the additional KeepInventory search page.
- Checked 348 new repository/commit candidates across 326 distinct repositories. Also searched the 23 hashes globally, checked three author monorepos and inspected the renamed fork owner's current repositories.
- Found 13 historical ForkEvents in the public GitHub event index. Read the corresponding raw GH Archive records to recover numeric repository IDs, then checked all 13 IDs on GitHub. Every ID returned 404. The records prove historical forks existed; they do not prove that the forks still exist publicly.
- Completed Wayback Availability queries for 117 exact repository, commit and ZIP URLs. No capture was returned for these URLs. A positive control returned an available capture, confirming that Availability was working during the checks. The next request returned HTTP 429 and initially left 37 supplementary branch/alias URL probes pending. The [Chrome follow-up](source-wayback-chrome-recheck-2026-10-19.md) completed all 37 through both CDX and Availability; none returned a capture. The active pending list is now empty, with the original list retained as historical evidence.

## Related source that does not match the release

### HiveCorruptor

Software Heritage retains [revision `5b57aaf41d5bc0fa7c07ec8b4d9c62c8832b29a9`](https://archive.softwareheritage.org/browse/revision/5b57aaf41d5bc0fa7c07ec8b4d9c62c8832b29a9/) and a complete ten-revision lineage. The requested release commit is `433b4e79c3952de3cdee9aacda84bb1e3f753285`, which is absent from that lineage and returns 404 directly.

Downloaded the related Vault tree and recomputed its Git blob/tree hashes. The root tree matches `d76ead5d7983f3b73e5955221c64ea0abd88dd7e`, but its PHP file differs from the release PHAR. Reconstructed all ten commit objects with their stored signature headers and verified each Git SHA-1 and parent link. Preserve this as a related revision, rather than assigning it to the release.

Also verified the earlier tree at revision `164eec6962c82bf0ab63a67ee12bec2d0bc7fbe2`, recorded shortly before the release submission. Its PHP file is still under `src/tal/ihatehive/Main.php`, whereas the PHAR uses `src/tal/hivecorruptor/Main.php`; it is another related revision rather than the requested source tree.

### LuckyPouches

The author's [martian-plugin-vault copy](https://github.com/MrEcstsy/martian-plugin-vault/tree/8eb39a94f14b0014c5b91cba63e88b869982a7af/LuckyPouches) restores repository-only files such as README.md and icon.png. It also contains later functional changes to the PHP code. Of the 15 distribution files compared, 8 match v1.0.1 byte for byte and 7 match v1.0.0; this is insufficient to establish the original complete Git tree. Neither release SHA resolves in the author monorepos.

### Historical forks

Recovered ten forks under the former OguzhanUmutluPlugins organization, plus TPEimperialPE/RobotVerification, rdpakun/StopLag and SkyCraft-Devs/CoinsSystem. Numeric user ID 60147636 resolves TPEimperialPE to EPT8TPE, but the original fork repository ID still returns 404 and none of that account's 14 current repositories contains the requested commit.

## Remaining releases

| Plugin | Versions | Requested commit prefixes |
| --- | --- | --- |
| KeepInv | 1.0.0 | `ca4648c1b4f7` |
| HiveCorruptor | 1.0.0 | `433b4e79c395` |
| AutoSmelt | 1.0.0 | `db8ca5fb378b` |
| BoostBlock | 1.0.0 | `62f8acd9b941` |
| ChatLevel | 1.0.0 | `73b862edb693` |
| ChorusPlant | 1.0.0 | `66dde3b3c614` |
| CommandEditor | 1.0.2, 1.0.1 | `981b79da6124`, `60a1af1748b4` |
| OneBlockAFK | 1.0.0 | `15d52ef0c4a2` |
| RandomDrops | 1.0.1, 1.0.0 | `7b171d7bc7d0`, `7a130d30acc3` |
| RobotVerification | 1.0.0 | `4d3affcde359` |
| StopLag | 1.0.0 | `34ef3147e744` |
| WorkersDemo | 1.0.1, 1.0.0 | `2b5a5920bcb5`, `63aabbcbd60e` |
| CoinsSystem | 1.2.0 | `683c4767b58e` |
| LuckyPouches | 1.0.1, 1.0.0 | `14188f882c88`, `78a3981c05ff` |
| OnePlayerSleep | 1.0.0 | `e95aa47ae7a7` |
| PlayerSkinStealer | 1.0.0 | `72ed88b0804a` |
| AntiEnchantmentAbuse | 1.1.0 | `0ddd06b08aea` |
| ClearPlayer | 1.0.0 | `8ace0fbb43c6` |
| PlotRating | 1.1 | `1c78109b7a84` |

## Limits and follow-up

- During the initial investigation, Wayback's wildcard CDX endpoint returned a **Temporarily Offline** page in the user's Chrome session. The later exact-URL Chrome recheck completed successfully. Empty results do not establish that every possible URL or renamed mirror is absent from Wayback; the earlier broad wildcard enumeration remains a separate limitation.
- Public code search does not index every branch or dangling Git object. The results are evidence for the candidates checked, not proof that no copy exists anywhere.
- Completed direct-origin visit histories for all original names, aliases and the 13 historical forks. Histories without snapshots record unsuccessful visits, rather than preserved source.

The next useful evidence would be an exact commit object or Git bundle from a former maintainer/fork owner, a Wayback capture of a source archive, or another preserved Git snapshot. A request to the maintainers has not been sent.
