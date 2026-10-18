# Missing virion follow-up - 19 October 2026

This investigation continues the [ten unresolved entries](virion-recovery-2026-10-19.md) from the initial batch. Four more entries now have separately archived source ZIPs and rebuilt PHARs. Coverage is **259/265 entries**, comprising 213 original PHARs and 46 reconstructions. The six unresolved entries remain visible in the catalog.

The subsequent [development-build and historical-archive investigation](virion-development-recovery-2026-10-19.md) checks 14 additional plugin binaries outside the approved release catalog, preserves 79 historical class names and tests 11 known Git revisions. It recovered no additional source; four exact-SHA Wayback URLs remain unverified after a rate-limit response.

The [machine-readable follow-up](../data/snapshots/2026-10-14T20-07-25Z/virion-recovery-followup.json) records the complete plugin PHAR scan, historical events, numeric repository identities, recovered commits and remaining gaps. The [artifact verification](../data/snapshots/2026-10-14T20-07-25Z/virion-artifact-verification.json) covers all 518 linked source ZIP and PHAR assets.

## Recovered from historical commits

| Catalog entry | Source revision and repository network | License document |
| --- | --- | --- |
| Blugin/SingletonTrait 1.0.0 | `882c98de62cd2134519942102105378c01841ff3`, available through [Danding1314/virions](https://github.com/Danding1314/virions/tree/882c98de62cd2134519942102105378c01841ff3/SingletonTrait) | MIT |
| Blugin/stringutils 1.1.1 | Same commit, [stringutils project](https://github.com/Danding1314/virions/tree/882c98de62cd2134519942102105378c01841ff3/stringutils) | MIT |
| Blugin/arrayutils 2.0.0 | Same commit, [arrayutils project](https://github.com/Danding1314/virions/tree/882c98de62cd2134519942102105378c01841ff3/arrayutils) | MIT |
| stephen-mc-pl/pmforms-pm4 1.0.1 | `6c8d4be86d37e5125975a528e5d3d31fdc3d03df`, available through [dktapps-pm-pl/pmforms](https://github.com/dktapps-pm-pl/pmforms/tree/6c8d4be86d37e5125975a528e5d3d31fdc3d03df) | LGPL |

The default branches of surviving forks did not contain these revisions. A full clone of their advertised branches was therefore insufficient.

For Blugin, public GH Archive records establish that `Blugin/virions` and `Blugin/_virions` were the same numeric repository, `295151114`. The last recorded PushEvent on master supplies `882c98de62cd2134519942102105378c01841ff3` as the previous branch head. GitHub still serves this unreferenced commit through the detached fork's repository network. Its project manifests match all three requested names, versions and namespaces. Historical branch creation/deletion events document subsequent branch reorganizations; the fork's current branch retains an older monorepo layout. A separately split repository, `Blugin/arrayutils`, now redirects to `PresentKim/arrayutils`; its current source has a different namespace/version.

For pmforms-pm4, the original numeric repository `278530910` now returns 404. Its last recorded push to `prod` identifies `6c8d4be86d37e5125975a528e5d3d31fdc3d03df`, still available in the upstream/fork network. The manifest is version **1.0.1**, namespace `dktapps\pmforms`, API **4.0.0**. This distinguishes it from the older 1.0.0 and newer 2.x copies found by repository-name search.

All four source ZIPs are pinned to full Git SHAs and preserve the upstream files. The catalog uses **Rebuild source**, because these revisions have not been tied to the original Poggit build ID. The PHARs use **Rebuilt PHAR** and retain their source commit, compiler revision, source ZIP hash and source license. Each PHAR was reopened and its included source files compared byte for byte. Runtime compatibility was not tested.

License detection now scopes monorepo notices to the selected project and shared root notices. A sibling project's license cannot determine another project's label. The four new entries retain their existing MIT/LGPL documents; empty license information elsewhere continues to display **No License**.

## Source embedded in plugin PHARs

Scanned **all 5,021 archived plugin release PHARs**, covering the catalog's 1,450 plugin projects: **231,279,477 verified bytes and 177,005 regular file entries**. Each original PHAR's byte size and SHA-256 was checked before reading regular file entries. No plugin code, PHAR stub or serialized PHAR metadata was executed. The scan searched filenames and contents for the ten target namespaces/repository identities, including copies nested under plugin-specific shading prefixes.

The only matching namespace family was `dktapps\pmforms`, with candidate matches in **180 PHARs**. Matching embedded files were saved unchanged with their original plugin release IDs, PHAR URLs, hashes and paths. Compared 178 bundles containing identifiable PHP namespace declarations against the recovered pmforms-pm4 source; none matched all 16 expected PHP files after namespace-prefix and line-ending normalization. For example, InfoAPI copies match 15/16 files, with one differing file. Those distributions were not substituted for the recovered Git tree. Normalization was used for comparison only; preserved embedded files retain their original bytes.

No identifiable embedded implementation of the other nine target namespace families was found in these 5,021 PHARs. A library with all identifying names removed, or a development build outside this release catalog, may remain undiscovered. The scan therefore establishes a bounded negative result for the saved releases, not global absence.

To resume or repeat the scan:

```powershell
python .\scripts\scan_embedded_virions.py --php <php-path> --workers 4
```

Checkpoints and matching file bytes are kept under `archive/virion-recovery/embedded/`. Downloads use the archive's GitHub assets, without additional Poggit requests.

## Remaining six entries

| Entry | Evidence and remaining gap |
| --- | --- |
| vosaka-php/vosaka 1.9.0 | [Packagist](https://packagist.org/packages/venndev/v-osaka) retains version 1.9.0 and SHA `aa5df4a7dc61c1c249504e9daad13ee985806f12`. The original repository IDs return 404; known forks cannot serve this SHA, and Software Heritage returns 404 for it. Tencent's Composer mirror lists a cached distribution URL, but the ZIP returns 404. Aliyun's metadata stops at 1.4.0 and still points to the removed GitHub repository. |
| Jasson44/TelegramBotAPI 1.0.0 | GH Archive recovers repository ID `909733463` and last pushed SHA `9d6128dcd034042b1cee29cc4622015cc9a49656`. Numeric lookup and Software Heritage revision lookup return 404. Other Telegram libraries have different namespaces; no `xeonch\telegramapi` implementation was found in the plugin PHAR scan. |
| InkoHX/Krul 0.1.0 | GH Archive recovers repository ID `199837026` and last pushed SHA `f3ce854526eef6b0a9a318eca5f768e62f91cbbe`. Numeric lookup and Software Heritage revision lookup return 404; no matching current fork or embedded namespace was recovered. |
| ZetNex/Map 1.0.1 | Repository, namespace and consumer searches did not locate a matching source tree. The author's current ItemArray repository is a different project. No `ZetNex\Map` implementation was found in the PHAR scan. |
| Tobias-2006/CommandArguments | No matching `tobias14\CommandArguments` implementation or surviving repository was recovered. Author-name matches in ClearLag and differently namespaced SmartCommand classes do not supply this virion. |
| kenzeve/ReplayLib 1.0.0 | No matching `exnthr\ReplayLib` implementation or surviving fork was recovered. The earlier author-name search returned SimpleTCP, but its current source is a separate library and does not reference ReplayLib; that result is not evidence of preserved ReplayLib source. |

Further research included repository searches with forks enabled, relevant pmforms fork lineages, Software Heritage origin searches, historical repository/branch/fork/PushEvents, numeric repository lookups and Composer metadata mirrors. The new SHAs above are retained as future recovery inputs even where the corresponding source remains unavailable.
