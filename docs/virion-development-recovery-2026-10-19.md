# Six missing virions: development builds and historical archives

The follow-up found **no additional recoverable source or PHAR** for the six unresolved catalog entries. Coverage remains **259/265 source ZIPs and PHARs**: 213 original PHARs and 46 reconstructions. This is a bounded investigation of the sources below; it does not establish that the missing code is globally unavailable.

The [machine-readable audit](../data/snapshots/2026-10-14T20-07-25Z/virion-development-recovery.json) preserves requests, responses, immutable repository revisions, archive hashes, class names and four pending Wayback URLs. The [source plan](../data/snapshots/2026-10-14T20-07-25Z/virion-source-plan.json) retains the historical SHA candidates separately from verified source commits. All six `source_commit` values remain null.

## PHARs beyond the approved release catalog

Repository and README searches found two public server packs with binary distributions: [MrLeMoNPM/ObsidianX](https://github.com/MrLeMoNPM/ObsidianX/tree/1c0a681771743d4ecd7bcb182fdcee842d965967) and [Pars-Network/ObsidianX](https://github.com/Pars-Network/ObsidianX/tree/797c87c2b1b0bb02c439d888ac224884f965690e). Their pinned Git ZIPs and nested ZIP were checked and read without running their contents.

Inspected 18 PHAR occurrences, comprising **16 distinct binaries**: 15 plugins and one PocketMine server binary. Fourteen distinct plugin binaries have SHA-256 hashes absent from the 5,021 approved release PHARs. These include three explicitly named development builds:

- `VanillaMinecarts_dev-2.phar`
- `AZVanillaMobs_dev-18.phar`
- `PersonaSkin_dev-22.phar`

None contains an identifiable namespace for the six target virions. The TeleConsole PHARs also do not contain the requested `xeonch\telegramapi` namespace. Their association with a Telegram console bridge is insufficient to identify them as TelegramBotAPI distributions. GitHub release lists for both packs and two SmartCommand search candidates returned no releases; SmartCommand has a different manifest and namespace.

Every external PHAR record includes its containing repository commit, nested path, byte size and SHA-256. The scan read regular PHAR file entries using `scripts/read_phar.php`; it did not execute PHP, the PHAR stub or serialized metadata. These selected packs do not cover every historical development build. GitHub code search also does not reliably index binary PHAR contents.

## Wayback and Software Heritage

Wayback CDX was responsive, with a successful positive control. Prefix queries covered the six GitHub repositories, their raw-file paths, Poggit CI paths and virion download paths. Initial transport failures for Krul's GitHub/raw paths were retried successfully and returned empty results. VOsaka's broad prefix query returned captures of `vosaka-foroutines`, `vosaka-http` and `vosaka-libsql`; those are separate repositories and are recorded separately from the requested repo. No matching source capture was identified.

An additional query found a useful [Poggit class index captured on 5 August 2026](https://web.archive.org/web/20260805235236id_/https://poggit.pmmp.io/fqn.txt). Its 3,049,633 bytes were downloaded and hashed as `9cf00efb9ef48fb377f605eec2db1d5791e4a5927482b585a7b0765128ae4646`. It preserves **79 matching class names**:

| Virion | Matching classes | Examples |
| --- | ---: | --- |
| ReplayLib | 59 | `ReplayRecorderPool`, `StaticTickSerializer`, `ZstdCompressToClosureTask` |
| Krul | 12 | `KurlCore`, `DataBase`, `Settings\PlayerSettings` |
| CommandArguments | 8 | `CommandArguments`, `SyntaxErrorException`, `argument\BooleanArgument` |

The index supplies class names, not implementations, versions or build SHAs. No matching class names for the other three target namespaces occur in this capture. The YAML index, which could have supplied build and usage metadata, had no successful capture in the queried CDX results. Searches for distinctive recovered class names did not locate a surviving implementation.

The new class names also supported a raw-byte fingerprint prefilter over all 5,021 cached, hash-verified approved PHARs. Only WorldBackup release 1537 and CompassXYZ release 1562 matched the shared name `CommandArguments`. Their inspected entries use `Jhelom\Core`; neither distribution establishes the identity or version of Tobias's virion. No candidate was promoted to source. This prefilter supplements the earlier full namespace scan and can miss fully compressed outer archives or renamed identifiers.

Reading all six known Krul/TelegramBotAPI PushEvents recovered **six additional historical SHAs** beyond the five previously recorded candidates. Software Heritage revision lookup returns **404 for all 11 known SHAs** across Krul, TelegramBotAPI and VOsaka. A known preserved revision returned 200 in the positive control. GitHub global commit searches for the ten Krul/TelegramBotAPI SHAs returned zero results; that search is not an exhaustive test of unreferenced Git objects.

Wayback availability queries used exact GitHub commit, GitHub API ZIP and codeload ZIP URLs. **29 requests returned no capture**. The thirtieth returned **429**, with no `Retry-After`; the batch stopped. Four URLs remain explicitly unverified:

- The codeload ZIP for TelegramBotAPI SHA `9d6128dcd034042b1cee29cc4622015cc9a49656`.
- The commit, API ZIP and codeload ZIP URLs for VOsaka SHA `aa5df4a7dc61c1c249504e9daad13ee985806f12`.

These pending requests are not counted as negative archive results. The audit retains their exact URLs for a later slow, resumable retry after the provider permits requests.

## Status of each missing entry

| Entry | New evidence and remaining gap |
| --- | --- |
| vosaka-php/vosaka 1.9.0 | [Packagist](https://packagist.org/packages/venndev/v-osaka) identifies SHA `aa5df4a7dc61c1c249504e9daad13ee985806f12`. Huawei's Composer mirror independently lists the same version/SHA and a mirror ZIP URL, but that ZIP returns 404. The previously tested Tencent ZIP also returns 404 and has no capture in the checked availability response. Exact-SHA Wayback URLs remain pending after 429. |
| Jasson44/TelegramBotAPI 1.0.0 | Earlier PushEvents add SHAs `eb1f5bac188acd9f55e79a89a77943c7f5d83aec`, `01ca9ba9efa30300158cd3f00dc8bc4a09eb1b9f`, `bac3d6eaf02bd894588599cc31cde787bbd3c45e` and `4821c92ffdf30a8073274d869ea1e5d50386c890`. All six known revisions return SWH 404; the last head's codeload URL hit Wayback's rate limit. No matching implementation was recovered from the external PHARs. |
| InkoHX/Krul 0.1.0 | Earlier PushEvents add `c348e5e9f467f9d3a3959ab9dca3663375cd6419` and `129a1fb6cd03311f99797398a428aa6d4ec3a00c`. All four known revisions return SWH 404; all 12 exact-SHA Wayback queries returned no capture. The class index preserves 12 class names. |
| Tobias-2006/CommandArguments | The class index preserves eight class names. Searches for these names did not recover a matching implementation. No full Git SHA is known. |
| kenzeve/ReplayLib 1.0.0 | The class index preserves 59 class names, including distinctive recorder, serializer and decompression classes. Searches did not recover their implementations. No full Git SHA is known. |
| ZetNex/Map 1.0.1 | No source, matching external PHAR, successful repository/CI archive capture or full Git SHA was recovered. |

The live Poggit `ci.info` and `p.dl` endpoints were checked using the parameter forms established by [Poggit's code](https://github.com/poggit/poggit/tree/9d03d45ea041cd3314c930a20851acc5249f5601). Both requests end at `poggit/release-archive`. A final HTTP 200 there is a repository page response and does not identify a PHAR or build record. Poggit build short IDs are distinct from resource IDs, so they cannot safely be substituted into resource download URLs. The official approved-release archive remains at commit `102194b0b1022180fc774318f39cd2a10ee4bb27` in the observed redirect response.

Recovery can continue from the four pending URLs, a newly found development PHAR/source copy, or an export of Poggit's historical CI build/resource records. The class index and SHA candidates make those searches more precise. No source download button or artifact was added without a verified payload, and the existing **No License** rule remains unchanged.
